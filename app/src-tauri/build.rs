// Declaring the app's commands makes Tauri generate an `allow-<command>` permission for each,
// so a command is callable only when `capabilities/default.json` grants it.
const COMMANDS: &[&str] = &[
    "read_document",
    "write_document",
    "list_documents",
    "delete_document",
    "export_file",
    "import_file",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
