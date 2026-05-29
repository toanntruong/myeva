use std::{collections::HashMap, process::Stdio, sync::Arc};

use anyhow::{anyhow, Context};
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::{Child, Command},
    sync::Mutex,
    time::{sleep, Duration},
};

use crate::db::{
    models::{LogLinePayload, ProcessStoppedPayload},
    store::SqliteStore,
};

type SharedChild = Arc<Mutex<Child>>;

#[derive(Clone)]
pub struct ProcessManager {
    children: Arc<Mutex<HashMap<String, SharedChild>>>,
    store: SqliteStore,
}

impl ProcessManager {
    pub fn new(store: SqliteStore) -> Self {
        Self {
            children: Arc::new(Mutex::new(HashMap::new())),
            store,
        }
    }

    pub async fn spawn(&self, app: AppHandle, task_id: String) -> anyhow::Result<()> {
        let task = self.store.get_task(&task_id).await?;
        if self.children.lock().await.contains_key(&task_id) {
            return Err(anyhow!("task is already running"));
        }

        self.store.update_status(&task_id, "running", None).await?;
        let mut command = shell_command(&task.command);
        command
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }

        let mut child = command
            .spawn()
            .with_context(|| format!("failed to spawn {}", task.command))?;

        if let Some(stdout) = child.stdout.take() {
            stream_lines(app.clone(), task_id.clone(), "stdout", stdout);
        }
        if let Some(stderr) = child.stderr.take() {
            stream_lines(app.clone(), task_id.clone(), "stderr", stderr);
        }

        let child = Arc::new(Mutex::new(child));
        self.children
            .lock()
            .await
            .insert(task_id.clone(), child.clone());
        let children = self.children.clone();
        let store = self.store.clone();
        tokio::spawn(async move {
            let exit_code = loop {
                let maybe_status = {
                    let mut child = child.lock().await;
                    child.try_wait()
                };
                match maybe_status {
                    Ok(Some(status)) => break status.code(),
                    Ok(None) => sleep(Duration::from_millis(250)).await,
                    Err(_) => break None,
                }
            };
            children.lock().await.remove(&task_id);
            let _ = store.update_status(&task_id, "stopped", exit_code).await;
            let _ = app.emit(
                "process-stopped",
                ProcessStoppedPayload { task_id, exit_code },
            );
        });

        Ok(())
    }

    pub async fn kill(&self, task_id: &str) -> anyhow::Result<()> {
        let child = self
            .children
            .lock()
            .await
            .remove(task_id)
            .ok_or_else(|| anyhow!("task is not running"))?;

        let mut child = child.lock().await;
        let _ = child.kill().await;
        let _ = child.wait().await;
        self.store.update_status(task_id, "stopped", None).await?;
        Ok(())
    }

    pub async fn kill_all(&self) {
        let children = {
            let mut locked = self.children.lock().await;
            locked.drain().map(|(_, child)| child).collect::<Vec<_>>()
        };
        for child in children {
            let mut child = child.lock().await;
            let _ = child.kill().await;
            let _ = child.wait().await;
        }
    }
}

fn stream_lines<R>(app: AppHandle, task_id: String, stream: &'static str, reader: R)
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app.emit(
                "log-line",
                LogLinePayload {
                    task_id: task_id.clone(),
                    stream: stream.to_string(),
                    line,
                },
            );
        }
    });
}

fn shell_command(command: &str) -> Command {
    #[cfg(windows)]
    {
        let git_bash = r"C:\Program Files\Git\bin\bash.exe";
        if std::path::Path::new(git_bash).exists() {
            let mut cmd = Command::new(git_bash);
            cmd.arg("-lc").arg(command);
            return cmd;
        }
        let mut cmd = Command::new("cmd");
        cmd.arg("/C").arg(command);
        return cmd;
    }

    #[cfg(not(windows))]
    {
        let mut cmd = Command::new("sh");
        cmd.arg("-lc").arg(command);
        cmd
    }
}
