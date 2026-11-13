//! Chords & Scales desktop shell.
//!
//! The UI calls the theory core directly as WASM; this process only hosts the window and,
//! later, the filesystem commands behind the `Storage` interface (ADR-2, ADR-4).

// Hide the console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running the Chords & Scales window");
}
