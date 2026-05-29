pub mod commands;
pub mod db;
pub mod process;
pub mod state;

use tauri::{Manager, WindowEvent};

use crate::{
    commands::{
        memory::{open_memory_file, read_memory_file},
        process::{kill_task, spawn_task},
        task::{create_task, get_all_edges, get_all_tasks, update_node_position},
    },
    db::store::SqliteStore,
    state::AppState,
};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir()?;
            let db_path = app_dir.join("myeva.sqlite");
            let handle =
                tauri::async_runtime::block_on(async move { SqliteStore::new(db_path).await })?;
            app.manage(AppState::new(handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_task,
            get_all_tasks,
            get_all_edges,
            update_node_position,
            spawn_task,
            kill_task,
            read_memory_file,
            open_memory_file,
        ])
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                if let Some(state) = window.try_state::<AppState>() {
                    let manager = state.process_manager.clone();
                    tauri::async_runtime::spawn(async move {
                        manager.kill_all().await;
                    });
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running MyEva");
}
