//! Import and export of user files through native file dialogs (ADR-17).
//!
//! The dialogs open from Rust, so the webview never names a path itself: it can only write to
//! a file the user picked in a save dialog and read a file the user picked in an open dialog.
//! The webview gets no dialog or filesystem permissions for this.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::storage::write_atomic;

/// The kinds of file the app saves (ADR-44); the same keys as `FILE_FORMATS` in
/// `app/src/lib/storage/files.ts`. The webview names a kind, never a filter: the dialog's
/// filter and the extension come from here.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Toml,
    Svg,
    Html,
}

impl ExportFormat {
    /// The save dialog's filter: a name and the extensions it shows, the first one preferred.
    pub fn filter(self) -> (&'static str, &'static [&'static str]) {
        match self {
            ExportFormat::Toml => ("TOML", &["toml"]),
            ExportFormat::Svg => ("SVG image", &["svg"]),
            ExportFormat::Html => ("HTML page", &["html", "htm"]),
        }
    }

    /// `path`, with the format's extension added if the user typed a name without one of its
    /// extensions (some dialogs don't add it), so the file opens in the right program.
    pub fn with_extension(self, path: PathBuf) -> PathBuf {
        let (_, extensions) = self.filter();
        let has_one = path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| extensions.iter().any(|x| x.eq_ignore_ascii_case(e)));
        if has_one {
            return path;
        }
        let mut name = path.file_name().map(|n| n.to_owned()).unwrap_or_default();
        name.push(".");
        name.push(extensions[0]);
        path.with_file_name(name)
    }
}

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

    use super::{ExportFormat, ImportedFile};

    /// Asks where to save `content` as a file of kind `format` (suggesting `suggested_name`)
    /// and writes it there as UTF-8. `false` if the user cancelled.
    #[tauri::command]
    pub async fn export_file<R: Runtime>(
        app: AppHandle<R>,
        suggested_name: String,
        format: ExportFormat,
        content: String,
    ) -> Result<bool, String> {
        let (filter, extensions) = format.filter();
        // Async commands run off the main thread, where a blocking dialog is allowed.
        let Some(picked) = app
            .dialog()
            .file()
            .add_filter(filter, extensions)
            .set_file_name(&suggested_name)
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = picked
            .into_path()
            .map(|path| format.with_extension(path))
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
    fn formats_are_read_from_the_frontend_keys() {
        for (key, format) in [
            ("toml", ExportFormat::Toml),
            ("svg", ExportFormat::Svg),
            ("html", ExportFormat::Html),
        ] {
            assert_eq!(
                serde_json::from_str::<ExportFormat>(&format!("\"{key}\"")).unwrap(),
                format
            );
        }
        for bad in ["\"png\"", "\"SVG\"", "\"\"", "1"] {
            assert!(serde_json::from_str::<ExportFormat>(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn each_format_has_its_dialog_filter() {
        assert_eq!(ExportFormat::Toml.filter(), ("TOML", &["toml"][..]));
        assert_eq!(ExportFormat::Svg.filter(), ("SVG image", &["svg"][..]));
        assert_eq!(
            ExportFormat::Html.filter(),
            ("HTML page", &["html", "htm"][..])
        );
    }

    #[test]
    fn a_missing_extension_is_added() {
        let dir = PathBuf::from("out");
        assert_eq!(
            ExportFormat::Svg.with_extension(dir.join("Dorian practice")),
            dir.join("Dorian practice.svg")
        );
        assert_eq!(
            ExportFormat::Html.with_extension(dir.join("sheet.HTM")),
            dir.join("sheet.HTM")
        );
        assert_eq!(
            ExportFormat::Html.with_extension(dir.join("sheet.svg")),
            dir.join("sheet.svg.html")
        );
        assert_eq!(
            ExportFormat::Toml.with_extension(dir.join("scales.toml")),
            dir.join("scales.toml")
        );
    }

    #[test]
    fn exported_svg_and_html_are_written_as_utf8_text() {
        let dir = temp_dir();
        let path = dir.join("sheet.svg");
        let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>C♯ Dorian</text></svg>\n";
        write_export(&path, svg).unwrap();
        assert_eq!(fs::read(&path).unwrap(), svg.as_bytes());
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
