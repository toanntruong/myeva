use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Task {
    pub id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub cli_type: String,
    pub command: String,
    pub status: String,
    pub exit_code: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
    pub pos_x: f64,
    pub pos_y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Edge {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTaskInput {
    pub parent_id: Option<String>,
    pub title: String,
    pub cli_type: String,
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessStoppedPayload {
    pub task_id: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogLinePayload {
    pub task_id: String,
    pub stream: String,
    pub line: String,
}
