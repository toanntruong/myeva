use tauri::{AppHandle, State};

use crate::state::AppState;

#[tauri::command]
pub async fn spawn_task(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
) -> Result<(), String> {
    state
        .process_manager
        .spawn(app, task_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kill_task(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state
        .process_manager
        .kill(&task_id)
        .await
        .map_err(|e| e.to_string())
}
