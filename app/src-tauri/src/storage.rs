//! Named TOML documents in the app-data folder: the Tauri side of the `Storage` interface
//! (ADR-4, ADR-15).
//!
//! A document `settings` is the file `<app-data>/settings.toml`. Names are checked before any
//! path is built, so a name can never point outside the folder. Writes are atomic: the content
//! goes to a temporary file in the same folder, which then replaces the document by rename, so
//! a crash leaves either the old or the new file, never half of one.
//!
//! The file logic is plain functions over a directory, tested without a Tauri runtime; the
//! `#[tauri::command]` wrappers at the bottom only resolve the folder and map errors.

use std::fmt;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// File extension of every stored document.
pub const EXTENSION: &str = "toml";

/// Longest accepted document name, in characters.
pub const MAX_NAME_LEN: usize = 64;

/// Names Windows reserves for devices; `con.toml` can't be created there.
const RESERVED_ON_WINDOWS: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// What can go wrong with a stored document.
#[derive(Debug)]
pub enum StorageError {
    /// The name isn't a valid document name (see [`validate_name`]).
    InvalidName(String),
    /// The filesystem refused; the message says which document.
    Io { context: String, source: io::Error },
}

impl fmt::Display for StorageError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidName(name) => write!(
                f,
                "invalid document name {name:?}: use 1-{MAX_NAME_LEN} lowercase letters, digits, \
                 '-' or '_', starting with a letter or digit"
            ),
            Self::Io { context, source } => write!(f, "{context}: {source}"),
        }
    }
}

impl std::error::Error for StorageError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::InvalidName(_) => None,
            Self::Io { source, .. } => Some(source),
        }
    }
}

fn io_error(context: impl Into<String>) -> impl FnOnce(io::Error) -> StorageError {
    move |source| StorageError::Io {
        context: context.into(),
        source,
    }
}

/// Checks a document name: 1–64 characters from `a-z`, `0-9`, `-`, `_`, starting with a letter
/// or digit, and not a Windows device name. Lowercase only, so names can't collide on
/// case-insensitive filesystems. The same rule is enforced in TypeScript
/// (`app/src/lib/storage/names.ts`); both test against `names.fixture.json`.
pub fn validate_name(name: &str) -> Result<(), StorageError> {
    let mut chars = name.chars();
    let valid = name.len() <= MAX_NAME_LEN
        && chars
            .next()
            .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
        && !RESERVED_ON_WINDOWS.contains(&name);
    if valid {
        Ok(())
    } else {
        Err(StorageError::InvalidName(name.to_owned()))
    }
}

/// The file that holds document `name` in `dir`, after checking the name.
pub fn document_path(dir: &Path, name: &str) -> Result<PathBuf, StorageError> {
    validate_name(name)?;
    Ok(dir.join(format!("{name}.{EXTENSION}")))
}

/// Reads document `name`; `None` if it doesn't exist.
pub fn read_document(dir: &Path, name: &str) -> Result<Option<String>, StorageError> {
    let path = document_path(dir, name)?;
    match fs::read_to_string(&path) {
        Ok(content) => Ok(Some(content)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(io_error(format!("could not read document {name:?}"))(e)),
    }
}

/// Writes document `name` atomically, creating `dir` if needed.
pub fn write_document(dir: &Path, name: &str, content: &str) -> Result<(), StorageError> {
    let path = document_path(dir, name)?;
    fs::create_dir_all(dir).map_err(io_error("could not create the app-data folder"))?;
    write_atomic(&path, content).map_err(io_error(format!("could not write document {name:?}")))
}

/// Names of all stored documents, sorted. Files that aren't valid documents (temporary files,
/// other extensions, invalid names) are skipped. A missing folder means no documents.
pub fn list_documents(dir: &Path) -> Result<Vec<String>, StorageError> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(io_error("could not list the app-data folder")(e)),
    };
    let mut names = Vec::new();
    for entry in entries {
        let entry = entry.map_err(io_error("could not list the app-data folder"))?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|e| e.to_str()) != Some(EXTENSION) {
            continue;
        }
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str())
            && validate_name(stem).is_ok()
        {
            names.push(stem.to_owned());
        }
    }
    names.sort();
    Ok(names)
}

/// Deletes document `name`. Deleting a document that doesn't exist is not an error.
pub fn delete_document(dir: &Path, name: &str) -> Result<(), StorageError> {
    let path = document_path(dir, name)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(io_error(format!("could not delete document {name:?}"))(e)),
    }
}

/// Writes `content` to `path` through a temporary file in the same folder, flushed to disk,
/// then renamed over `path` (which replaces an existing file on every platform).
pub fn write_atomic(path: &Path, content: &str) -> io::Result<()> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("document");
    let tmp = dir.join(format!(
        ".{file_name}.{}-{}.tmp",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let result = (|| {
        let mut file = File::create(&tmp)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        drop(file);
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        // Best effort: don't leave the temporary file behind.
        let _ = fs::remove_file(&tmp);
    }
    result
}

/// Tauri commands. Arguments arrive as `{ name, content }` from `app/src/lib/storage/tauri.ts`.
pub mod commands {
    use std::path::PathBuf;

    use tauri::{AppHandle, Manager, Runtime};

    fn documents_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
        app.path()
            .app_data_dir()
            .map_err(|e| format!("could not find the app-data folder: {e}"))
    }

    #[tauri::command]
    pub fn read_document<R: Runtime>(
        app: AppHandle<R>,
        name: String,
    ) -> Result<Option<String>, String> {
        super::read_document(&documents_dir(&app)?, &name).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn write_document<R: Runtime>(
        app: AppHandle<R>,
        name: String,
        content: String,
    ) -> Result<(), String> {
        super::write_document(&documents_dir(&app)?, &name, &content).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn list_documents<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, String> {
        super::list_documents(&documents_dir(&app)?).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn delete_document<R: Runtime>(app: AppHandle<R>, name: String) -> Result<(), String> {
        super::delete_document(&documents_dir(&app)?, &name).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh, empty folder under the system temp dir, removed on drop.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            static COUNTER: AtomicU64 = AtomicU64::new(0);
            let dir = std::env::temp_dir().join(format!(
                "chords-and-scales-storage-test-{}-{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::Relaxed)
            ));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn names_follow_the_shared_fixture() {
        // The same cases are checked by the TypeScript name validation.
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../src/lib/storage/names.fixture.json")).unwrap();
        for name in fixture["valid"].as_array().unwrap() {
            let name = name.as_str().unwrap();
            assert!(validate_name(name).is_ok(), "{name:?} should be valid");
        }
        for name in fixture["invalid"].as_array().unwrap() {
            let name = name.as_str().unwrap();
            assert!(validate_name(name).is_err(), "{name:?} should be invalid");
        }
        assert!(validate_name(&"a".repeat(MAX_NAME_LEN)).is_ok());
        assert!(validate_name(&"a".repeat(MAX_NAME_LEN + 1)).is_err());
    }

    #[test]
    fn reading_a_missing_document_gives_none() {
        let dir = TempDir::new();
        assert_eq!(read_document(&dir.0, "settings").unwrap(), None);
    }

    #[test]
    fn written_documents_read_back_unchanged() {
        let dir = TempDir::new();
        let content = "version = 1\n# Comment: D♭ ♯ ünïcode\r\n[view]\nroot = \"Db\"\n";
        write_document(&dir.0, "settings", content).unwrap();
        assert_eq!(
            read_document(&dir.0, "settings").unwrap().as_deref(),
            Some(content)
        );
        assert_eq!(
            fs::read_to_string(dir.0.join("settings.toml")).unwrap(),
            content
        );
    }

    #[test]
    fn writing_replaces_the_document_and_leaves_no_temporary_files() {
        let dir = TempDir::new();
        write_document(&dir.0, "scales", "a = 1\n").unwrap();
        write_document(&dir.0, "scales", "b = 2\n").unwrap();
        assert_eq!(
            read_document(&dir.0, "scales").unwrap().as_deref(),
            Some("b = 2\n")
        );
        let files: Vec<_> = fs::read_dir(&dir.0)
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(files, vec!["scales.toml"]);
    }

    #[test]
    fn writing_creates_the_folder() {
        let dir = TempDir::new();
        let nested = dir.0.join("not").join("there");
        write_document(&nested, "settings", "x = 1\n").unwrap();
        assert_eq!(
            read_document(&nested, "settings").unwrap().as_deref(),
            Some("x = 1\n")
        );
    }

    #[test]
    fn a_failed_write_leaves_the_target_and_no_temporary_file() {
        let dir = TempDir::new();
        // A folder in the target's place makes the final rename fail.
        let target = dir.0.join("settings.toml");
        fs::create_dir(&target).unwrap();
        assert!(write_atomic(&target, "new = 1\n").is_err());
        assert!(target.is_dir());
        let files: Vec<_> = fs::read_dir(&dir.0)
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(files, vec!["settings.toml"]);
    }

    #[test]
    fn list_returns_sorted_document_names_only() {
        let dir = TempDir::new();
        write_document(&dir.0, "tunings", "").unwrap();
        write_document(&dir.0, "scales", "").unwrap();
        write_document(&dir.0, "settings", "").unwrap();
        fs::write(dir.0.join("notes.txt"), "not a document").unwrap();
        fs::write(dir.0.join("Upper.toml"), "invalid name").unwrap();
        fs::write(dir.0.join(".settings.toml.1-0.tmp"), "temporary").unwrap();
        fs::create_dir(dir.0.join("folder.toml")).unwrap();
        assert_eq!(
            list_documents(&dir.0).unwrap(),
            vec!["scales", "settings", "tunings"]
        );
    }

    #[test]
    fn list_of_a_missing_folder_is_empty() {
        let dir = TempDir::new();
        assert!(list_documents(&dir.0.join("missing")).unwrap().is_empty());
    }

    #[test]
    fn delete_removes_the_document_and_ignores_missing_ones() {
        let dir = TempDir::new();
        write_document(&dir.0, "presets", "x = 1\n").unwrap();
        delete_document(&dir.0, "presets").unwrap();
        assert_eq!(read_document(&dir.0, "presets").unwrap(), None);
        delete_document(&dir.0, "presets").unwrap();
    }

    #[test]
    fn names_that_could_escape_the_folder_are_rejected_everywhere() {
        let dir = TempDir::new();
        let outside = dir.0.join("outside");
        fs::create_dir(&outside).unwrap();
        let docs = outside.join("docs");
        for name in [
            "../escape",
            "..\\escape",
            "/abs",
            "C:\\abs",
            "a/b",
            "..",
            "",
        ] {
            assert!(matches!(
                read_document(&docs, name),
                Err(StorageError::InvalidName(_))
            ));
            assert!(matches!(
                write_document(&docs, name, "x"),
                Err(StorageError::InvalidName(_))
            ));
            assert!(matches!(
                delete_document(&docs, name),
                Err(StorageError::InvalidName(_))
            ));
        }
        assert!(!docs.exists(), "a rejected write must not create anything");
        assert_eq!(fs::read_dir(&outside).unwrap().count(), 0);
    }

    #[test]
    fn errors_name_the_document() {
        let err = validate_name("../x").unwrap_err().to_string();
        assert!(err.contains("\"../x\""), "{err}");
    }
}
