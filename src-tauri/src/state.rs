use crate::{db::store::SqliteStore, process::manager::ProcessManager};

#[derive(Clone)]
pub struct AppState {
    pub store: SqliteStore,
    pub process_manager: ProcessManager,
}

impl AppState {
    pub fn new(store: SqliteStore) -> Self {
        let process_manager = ProcessManager::new(store.clone());
        Self {
            store,
            process_manager,
        }
    }
}
