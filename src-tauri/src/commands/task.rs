use tauri::State;

use crate::{
    db::models::{CreateTaskInput, Edge, Task},
    state::AppState,
};

#[tauri::command]
pub async fn create_task(
    state: State<'_, AppState>,
    input: CreateTaskInput,
) -> Result<Task, String> {
    state
        .store
        .create_task(input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_tasks(state: State<'_, AppState>) -> Result<Vec<Task>, String> {
    state.store.all_tasks().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_edges(state: State<'_, AppState>) -> Result<Vec<Edge>, String> {
    state.store.all_edges().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_node_position(
    state: State<'_, AppState>,
    task_id: String,
    x: f64,
    y: f64,
) -> Result<(), String> {
    state
        .store
        .update_position(&task_id, x, y)
        .await
        .map_err(|e| e.to_string())
}
