use std::path::Path;

use anyhow::Context;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};
use uuid::Uuid;

use super::models::{CreateTaskInput, Edge, Task};

#[derive(Clone)]
pub struct SqliteStore {
    pool: SqlitePool,
}

impl SqliteStore {
    pub async fn new(db_path: impl AsRef<Path>) -> anyhow::Result<Self> {
        if let Some(parent) = db_path.as_ref().parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        let options = SqliteConnectOptions::new()
            .filename(db_path)
            .create_if_missing(true)
            .foreign_keys(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .context("failed to connect to SQLite")?;

        sqlx::query("PRAGMA journal_mode = WAL;")
            .execute(&pool)
            .await?;
        for statement in include_str!("../../migrations/001_init.sql").split(';') {
            let statement = statement.trim();
            if !statement.is_empty() {
                sqlx::query(statement)
                    .execute(&pool)
                    .await
                    .with_context(|| format!("failed to run migration statement: {statement}"))?;
            }
        }

        Ok(Self { pool })
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn create_task(&self, input: CreateTaskInput) -> anyhow::Result<Task> {
        let id = Uuid::new_v4().to_string();
        let title = if input.title.trim().is_empty() {
            derive_title(&input.prompt)
        } else {
            input.title.trim().to_string()
        };
        let command = build_command(&input.cli_type, &input.prompt);

        let (pos_x, pos_y) = self.next_position().await?;
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            r#"INSERT INTO tasks (id, parent_id, title, cli_type, command, status)
               VALUES (?1, ?2, ?3, ?4, ?5, 'pending')"#,
        )
        .bind(&id)
        .bind(&input.parent_id)
        .bind(&title)
        .bind(&input.cli_type)
        .bind(&command)
        .execute(&mut *tx)
        .await?;

        sqlx::query("INSERT INTO node_positions (task_id, pos_x, pos_y) VALUES (?1, ?2, ?3)")
            .bind(&id)
            .bind(pos_x)
            .bind(pos_y)
            .execute(&mut *tx)
            .await?;

        if let Some(parent_id) = &input.parent_id {
            let edge_id = Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO edges (id, source_id, target_id) VALUES (?1, ?2, ?3)")
                .bind(edge_id)
                .bind(parent_id)
                .bind(&id)
                .execute(&mut *tx)
                .await?;
        }

        tx.commit().await?;
        self.get_task(&id).await
    }

    async fn next_position(&self) -> anyhow::Result<(f64, f64)> {
        let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM tasks")
            .fetch_one(&self.pool)
            .await?;
        let index = count.max(0) as f64;
        let col = index % 4.0;
        let row = (index / 4.0).floor();
        Ok((80.0 + col * 260.0, 80.0 + row * 180.0))
    }

    pub async fn get_task(&self, id: &str) -> anyhow::Result<Task> {
        sqlx::query_as::<_, Task>(
            r#"SELECT t.*, COALESCE(p.pos_x, 0) AS pos_x, COALESCE(p.pos_y, 0) AS pos_y
               FROM tasks t
               LEFT JOIN node_positions p ON p.task_id = t.id
               WHERE t.id = ?1"#,
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .context("task not found")
    }

    pub async fn all_tasks(&self) -> anyhow::Result<Vec<Task>> {
        sqlx::query_as::<_, Task>(
            r#"SELECT t.*, COALESCE(p.pos_x, 0) AS pos_x, COALESCE(p.pos_y, 0) AS pos_y
               FROM tasks t
               LEFT JOIN node_positions p ON p.task_id = t.id
               ORDER BY t.created_at ASC"#,
        )
        .fetch_all(&self.pool)
        .await
        .context("failed to load tasks")
    }

    pub async fn all_edges(&self) -> anyhow::Result<Vec<Edge>> {
        sqlx::query_as::<_, Edge>("SELECT id, source_id, target_id FROM edges ORDER BY id ASC")
            .fetch_all(&self.pool)
            .await
            .context("failed to load edges")
    }

    pub async fn update_position(&self, task_id: &str, x: f64, y: f64) -> anyhow::Result<()> {
        sqlx::query(
            r#"INSERT INTO node_positions (task_id, pos_x, pos_y)
               VALUES (?1, ?2, ?3)
               ON CONFLICT(task_id) DO UPDATE SET pos_x=excluded.pos_x, pos_y=excluded.pos_y"#,
        )
        .bind(task_id)
        .bind(x)
        .bind(y)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_status(
        &self,
        task_id: &str,
        status: &str,
        exit_code: Option<i32>,
    ) -> anyhow::Result<Task> {
        sqlx::query(
            r#"UPDATE tasks
               SET status = ?2, exit_code = ?3, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?1"#,
        )
        .bind(task_id)
        .bind(status)
        .bind(exit_code)
        .execute(&self.pool)
        .await?;
        self.get_task(task_id).await
    }
}

pub fn derive_title(prompt: &str) -> String {
    let mut title: String = prompt
        .lines()
        .next()
        .unwrap_or("New Task")
        .trim()
        .chars()
        .take(64)
        .collect();
    if title.is_empty() {
        title = "New Task".to_string();
    }
    title
}

pub fn build_command(cli_type: &str, prompt: &str) -> String {
    let quoted = shell_words::quote(prompt).to_string();
    match cli_type {
        "claude" => format!("claude -p {quoted}"),
        _ => format!("codex exec {quoted}"),
    }
}
