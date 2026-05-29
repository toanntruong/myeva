use std::{path::PathBuf, process::Command};

fn memory_path() -> Result<PathBuf, String> {
    std::env::current_dir()
        .map_err(|e| e.to_string())
        .map(|dir| dir.join("memory.md"))
}

fn ensure_memory_file() -> Result<PathBuf, String> {
    let path = memory_path()?;
    if !path.exists() {
        std::fs::write(&path, "").map_err(|e| e.to_string())?;
    }
    Ok(path)
}

/// Read memory.md from the current working directory.
/// If it does not exist, create an empty file and return an empty string.
#[tauri::command]
pub fn read_memory_file() -> Result<String, String> {
    let path = ensure_memory_file()?;
    match std::fs::read_to_string(&path) {
        Ok(content) => Ok(content),
        Err(_) => {
            std::fs::write(&path, "").map_err(|e| e.to_string())?;
            Ok(String::new())
        }
    }
}

/// Open memory.md with the operating system's default editor/application.
#[tauri::command]
pub fn open_memory_file() -> Result<(), String> {
    let path = ensure_memory_file()?;

    #[cfg(target_os = "windows")]
    let status = Command::new("cmd")
        .arg("/C")
        .arg("start")
        .arg("")
        .arg(&path)
        .status();

    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(&path).status();

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open").arg(&path).status();

    status
        .map_err(|e| e.to_string())?
        .success()
        .then_some(())
        .ok_or_else(|| "failed to open memory.md".to_string())
}
