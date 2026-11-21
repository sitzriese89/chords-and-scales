//! Import and export of user files through native file dialogs (ADR-17).
//!
//! The dialogs open from Rust, so the webview never names a path itself: it can only write to
//! a file the user picked in a save dialog and read a file the user picked in an open dialog.
//! The webview gets no dialog or filesystem permissions for this.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use tauri::http::HeaderMap;
use tauri::ipc::InvokeBody;

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
    Png,
}

impl ExportFormat {
    /// The save dialog's filter: a name and the extensions it shows, the first one preferred.
    pub fn filter(self) -> (&'static str, &'static [&'static str]) {
        match self {
            ExportFormat::Toml => ("TOML", &["toml"]),
            ExportFormat::Svg => ("SVG image", &["svg"]),
            ExportFormat::Html => ("HTML page", &["html", "htm"]),
            ExportFormat::Png => ("PNG image", &["png"]),
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

/// Where a save goes, decided from the path the save dialog returned (ADR-45).
#[derive(Debug, PartialEq, Eq)]
pub enum SaveTarget {
    /// Write here: the path the user picked (the dialog asked before replacing it), or, with
    /// the format's extension added, a file that doesn't exist yet.
    Write(PathBuf),
    /// Adding the extension names a file that exists, which the dialog never asked about:
    /// ask again, suggesting this path, so the dialog's own confirmation covers it.
    Confirm(PathBuf),
}

/// Never replaces a file the user wasn't asked about: typing `sheet` in the dialog when
/// `sheet.svg` exists asks again with `sheet.svg` instead of writing over it.
pub fn save_target(
    format: ExportFormat,
    picked: PathBuf,
    exists: impl Fn(&Path) -> bool,
) -> SaveTarget {
    let path = format.with_extension(picked.clone());
    if path != picked && exists(&path) {
        SaveTarget::Confirm(path)
    } else {
        SaveTarget::Write(path)
    }
}

/// Header with the suggested file name of a binary export, percent-encoded UTF-8 (header
/// values are ASCII); the bytes are the request body (ADR-45).
pub const NAME_HEADER: &str = "x-export-name";
/// Header with the format key of a binary export.
pub const FORMAT_HEADER: &str = "x-export-format";

/// A file to save, as `export_file` receives it.
#[derive(Debug, PartialEq, Eq)]
pub struct ExportRequest {
    pub suggested_name: String,
    pub format: ExportFormat,
    pub content: Vec<u8>,
}

/// A text export: the arguments as JSON.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TextExport {
    suggested_name: String,
    format: ExportFormat,
    content: String,
}

impl ExportRequest {
    /// Reads a save from an IPC call: text as JSON arguments (`{ suggestedName, format,
    /// content }`), or bytes as the raw body with the name and format in headers. When the
    /// webview can't use Tauri's custom-protocol IPC it falls back to `postMessage`, which
    /// sends the bytes as a JSON array of numbers; that is read too.
    pub fn from_ipc(body: &InvokeBody, headers: &HeaderMap) -> Result<Self, String> {
        let invalid = |e: &dyn std::fmt::Display| format!("invalid export request: {e}");
        let bytes = match body {
            InvokeBody::Json(value) if value.is_object() => {
                let text: TextExport =
                    serde_json::from_value(value.clone()).map_err(|e| invalid(&e))?;
                return Ok(ExportRequest {
                    suggested_name: text.suggested_name,
                    format: text.format,
                    content: text.content.into_bytes(),
                });
            }
            InvokeBody::Json(value) => {
                serde_json::from_value::<Vec<u8>>(value.clone()).map_err(|e| invalid(&e))?
            }
            InvokeBody::Raw(bytes) => bytes.clone(),
        };
        let header = |name: &str| {
            headers
                .get(name)
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| invalid(&format!("no {name} header")))
        };
        let suggested_name = percent_decode_str(header(NAME_HEADER)?)
            .decode_utf8()
            .map_err(|e| invalid(&format!("{NAME_HEADER}: {e}")))?
            .into_owned();
        let format = serde_json::Value::String(header(FORMAT_HEADER)?.to_owned());
        let format = serde_json::from_value(format)
            .map_err(|e| invalid(&format!("{FORMAT_HEADER}: {e}")))?;
        Ok(ExportRequest {
            suggested_name,
            format,
            content: bytes,
        })
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
pub fn write_export(path: &Path, content: &[u8]) -> io::Result<()> {
    write_atomic(path, content)
}

/// Tauri commands, called from `app/src/lib/storage/files.ts`.
pub mod commands {
    use std::path::{Path, PathBuf};

    use tauri::ipc::Request;
    use tauri::{AppHandle, Runtime, Webview};
    use tauri_plugin_dialog::DialogExt;

    use super::{ExportRequest, ImportedFile, SaveTarget, save_target};

    /// Asks where to save a file of kind `format` (suggesting its name) and writes it there:
    /// text as UTF-8, or bytes as they are ([`ExportRequest::from_ipc`]). `false` if the user
    /// cancelled. Asks again rather than replace a file the dialog didn't ask about
    /// ([`save_target`]).
    #[tauri::command]
    pub async fn export_file<R: Runtime>(
        app: AppHandle<R>,
        request: Request<'_>,
    ) -> Result<bool, String> {
        let ExportRequest {
            suggested_name,
            format,
            content,
        } = ExportRequest::from_ipc(request.body(), request.headers())?;
        let (filter, extensions) = format.filter();
        let mut name = suggested_name;
        let mut folder: Option<PathBuf> = None;
        loop {
            let mut dialog = app
                .dialog()
                .file()
                .add_filter(filter, extensions)
                .set_file_name(&name);
            if let Some(folder) = &folder {
                dialog = dialog.set_directory(folder);
            }
            // Async commands run off the main thread, where a blocking dialog is allowed.
            let Some(picked) = dialog.blocking_save_file() else {
                return Ok(false);
            };
            let picked = picked
                .into_path()
                .map_err(|e| format!("unusable file path: {e}"))?;
            match save_target(format, picked, Path::exists) {
                SaveTarget::Write(path) => {
                    super::write_export(&path, &content)
                        .map_err(|e| format!("could not write {}: {e}", path.display()))?;
                    return Ok(true);
                }
                SaveTarget::Confirm(path) => {
                    name = path
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    folder = path.parent().map(Path::to_path_buf);
                }
            }
        }
    }

    /// Opens the print dialog for the calling webview, which prints only the sheet (its print
    /// stylesheet, SPEC §5.10). Through Rust because `window.print()` does nothing in the
    /// macOS webview (ADR-45).
    #[tauri::command]
    pub fn print_sheet<R: Runtime>(webview: Webview<R>) -> Result<(), String> {
        webview
            .print()
            .map_err(|e| format!("could not open the print dialog: {e}"))
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
        write_export(&path, "[[scale]]\nname = \"Hirajōshi\"\n".as_bytes()).unwrap();
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
        write_export(&path, b"new").unwrap();
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
            ("png", ExportFormat::Png),
        ] {
            assert_eq!(
                serde_json::from_str::<ExportFormat>(&format!("\"{key}\"")).unwrap(),
                format
            );
        }
        for bad in ["\"pdf\"", "\"PNG\"", "\"\"", "1"] {
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
        assert_eq!(ExportFormat::Png.filter(), ("PNG image", &["png"][..]));
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
        assert_eq!(
            ExportFormat::Png.with_extension(dir.join("sheet")),
            dir.join("sheet.png")
        );
    }

    #[test]
    fn a_file_the_dialog_did_not_ask_about_is_never_replaced() {
        let dir = temp_dir();
        fs::write(dir.join("sheet.svg"), "old").unwrap();
        let exists = |p: &Path| p.exists();
        // Typed `sheet`: `sheet.svg` exists, so the dialog is asked again with that name.
        assert_eq!(
            save_target(ExportFormat::Svg, dir.join("sheet"), exists),
            SaveTarget::Confirm(dir.join("sheet.svg"))
        );
        // Picked `sheet.svg` itself: the dialog already asked before replacing it.
        assert_eq!(
            save_target(ExportFormat::Svg, dir.join("sheet.svg"), exists),
            SaveTarget::Write(dir.join("sheet.svg"))
        );
        // Typed a new name: the extension is added and nothing is replaced.
        assert_eq!(
            save_target(ExportFormat::Svg, dir.join("new"), exists),
            SaveTarget::Write(dir.join("new.svg"))
        );
        assert_eq!(
            save_target(ExportFormat::Png, dir.join("sheet"), exists),
            SaveTarget::Write(dir.join("sheet.png"))
        );
        assert_eq!(fs::read_to_string(dir.join("sheet.svg")).unwrap(), "old");
        fs::remove_dir_all(dir).unwrap();
    }

    const PNG_SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];

    fn binary_headers(name: &str, format: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(NAME_HEADER, name.parse().unwrap());
        headers.insert(FORMAT_HEADER, format.parse().unwrap());
        headers
    }

    #[test]
    fn text_exports_arrive_as_json_arguments() {
        let body = InvokeBody::Json(serde_json::json!({
            "suggestedName": "sheet.svg",
            "format": "svg",
            "content": "<svg>C♯</svg>",
        }));
        assert_eq!(
            ExportRequest::from_ipc(&body, &HeaderMap::new()).unwrap(),
            ExportRequest {
                suggested_name: "sheet.svg".into(),
                format: ExportFormat::Svg,
                content: "<svg>C♯</svg>".as_bytes().to_vec(),
            }
        );
    }

    #[test]
    fn binary_exports_arrive_as_the_raw_body_with_name_and_format_headers() {
        let png = [&PNG_SIGNATURE[..], &[0, 0, 0, 0x0d]].concat();
        let expected = ExportRequest {
            suggested_name: "c♯-dorian.png".into(),
            format: ExportFormat::Png,
            content: png.clone(),
        };
        let headers = binary_headers("c%E2%99%AF-dorian.png", "png");
        let raw = InvokeBody::Raw(png.clone());
        assert_eq!(ExportRequest::from_ipc(&raw, &headers).unwrap(), expected);
        // The postMessage fallback sends the bytes as a JSON array.
        let array = InvokeBody::Json(serde_json::json!(png));
        assert_eq!(ExportRequest::from_ipc(&array, &headers).unwrap(), expected);
    }

    #[test]
    fn malformed_export_requests_are_refused() {
        let raw = InvokeBody::Raw(PNG_SIGNATURE.to_vec());
        assert!(ExportRequest::from_ipc(&raw, &HeaderMap::new()).is_err());
        assert!(ExportRequest::from_ipc(&raw, &binary_headers("a.png", "gif")).is_err());
        assert!(ExportRequest::from_ipc(&raw, &binary_headers("%FF.png", "png")).is_err());
        let not_bytes = InvokeBody::Json(serde_json::json!([256, -1]));
        assert!(ExportRequest::from_ipc(&not_bytes, &binary_headers("a.png", "png")).is_err());
        let missing = InvokeBody::Json(serde_json::json!({ "format": "svg", "content": "" }));
        assert!(ExportRequest::from_ipc(&missing, &HeaderMap::new()).is_err());
    }

    #[test]
    fn exported_png_bytes_are_written_as_they_are() {
        let dir = temp_dir();
        let path = dir.join("sheet.png");
        let png = [&PNG_SIGNATURE[..], &[0xff, 0x00, 0x80]].concat();
        write_export(&path, &png).unwrap();
        assert_eq!(fs::read(&path).unwrap(), png);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn exported_svg_and_html_are_written_as_utf8_text() {
        let dir = temp_dir();
        let path = dir.join("sheet.svg");
        let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>C♯ Dorian</text></svg>\n";
        write_export(&path, svg.as_bytes()).unwrap();
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
