//! Import and export of user files through native file dialogs (ADR-15).
//!
//! The dialogs open from Rust, so the webview never names a path itself: it can only write to
//! a file the user picked in a save dialog and read a file the user picked in an open dialog.
//! The webview gets no dialog or filesystem permissions for this.

use std::fs;
use std::io;
use std::path::Path;

use serde::Serialize;

use crate::storage::write_atomic;

/// Largest file accepted on import. User files are small TOML documents; this only stops an
/// accidental pick of a huge file from being loaded into the webview.
pub const MAX_IMPORT_BYTES: u64 = 1024 * 1024;

/// A file the user picked for import: its file name (no folder) and its text.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportedFile {
    pub file_name: String,
    pub content: String,
}

/// Reads a picked file as UTF-8 text, refusing files over [`MAX_IMPORT_BYTES`].
pub fn read_import(path: &Path) -> io::Result<ImportedFile> {
    let size = fs::metadata(path)?.len();
    if size > MAX_IMPORT_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("the file is {size} bytes; the limit is {MAX_IMPORT_BYTES}"),
        ));
    }
    let content = fs::read_to_string(path)?;
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(ImportedFile { file_name, content })
}

/// Writes an exported file atomically to the picked path.
pub fn write_export(path: &Path, content: &str) -> io::Result<()> {
    write_atomic(path, content)
}

/// Tauri commands, called from `app/src/lib/storage/files.ts`.
pub mod commands {
    use tauri::{AppHandle, Runtime};
    use tauri_plugin_dialog::DialogExt;

    use super::ImportedFile;

    /// Asks where to save `content` (suggesting `suggested_name`) and writes it there.
    /// `false` if the user cancelled.
    #[tauri::command]
    pub async fn export_file<R: Runtime>(
        app: AppHandle<R>,
        suggested_name: String,
        content: String,
    ) -> Result<bool, String> {
        // Async commands run off the main thread, where a blocking dialog is allowed.
        let Some(picked) = app
            .dialog()
            .file()
            .add_filter("TOML", &["toml"])
            .set_file_name(&suggested_name)
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = picked
            .into_path()
            .map_err(|e| format!("unusable file path: {e}"))?;
        super::write_export(&path, &content)
            .map_err(|e| format!("could not write {}: {e}", path.display()))?;
        Ok(true)
    }

    /// Asks for a TOML file and returns its name and text; `None` if the user cancelled.
    #[tauri::command]
    pub async fn import_file<R: Runtime>(
        app: AppHandle<R>,
    ) -> Result<Option<ImportedFile>, String> {
        let Some(picked) = app
            .dialog()
            .file()
            .add_filter("TOML", &["toml"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = picked
            .into_path()
            .map_err(|e| format!("unusable file path: {e}"))?;
        super::read_import(&path)
            .map(Some)
            .map_err(|e| format!("could not read {}: {e}", path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn temp_dir() -> PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "chords-and-scales-files-test-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn exported_files_import_back_with_their_name() {
        let dir = temp_dir();
        let path = dir.join("My Scales.toml");
        write_export(&path, "[[scale]]\nname = \"Hirajōshi\"\n").unwrap();
        let imported = read_import(&path).unwrap();
        assert_eq!(
            imported,
            ImportedFile {
                file_name: "My Scales.toml".into(),
                content: "[[scale]]\nname = \"Hirajōshi\"\n".into()
            }
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn export_replaces_an_existing_file() {
        let dir = temp_dir();
        let path = dir.join("settings.toml");
        fs::write(&path, "old").unwrap();
        write_export(&path, "new").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn import_refuses_large_and_non_text_files() {
        let dir = temp_dir();
        let big = dir.join("big.toml");
        fs::write(&big, vec![b'#'; MAX_IMPORT_BYTES as usize + 1]).unwrap();
        assert!(read_import(&big).is_err());
        let binary = dir.join("binary.toml");
        fs::write(&binary, [0xff, 0xfe, 0x00, 0x80]).unwrap();
        assert!(read_import(&binary).is_err());
        assert!(read_import(&dir.join("missing.toml")).is_err());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn imported_file_serializes_for_the_frontend() {
        let file = ImportedFile {
            file_name: "a.toml".into(),
            content: "x = 1".into(),
        };
        assert_eq!(
            serde_json::to_string(&file).unwrap(),
            r#"{"fileName":"a.toml","content":"x = 1"}"#
        );
    }
}
