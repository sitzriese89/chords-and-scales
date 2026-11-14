//! Chords & Scales desktop shell.
//!
//! The UI calls the theory core directly as WASM; this process only hosts the window and the
//! filesystem commands behind the `Storage` interface and user-file import/export
//! (ADR-2, ADR-4, ADR-17).

// Hide the console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod storage;
mod user_files;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            storage::commands::read_document,
            storage::commands::write_document,
            storage::commands::list_documents,
            storage::commands::delete_document,
            user_files::commands::export_file,
            user_files::commands::import_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Chords & Scales window");
}
