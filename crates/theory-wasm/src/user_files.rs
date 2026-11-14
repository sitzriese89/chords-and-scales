//! The report shape shared by the user catalog files (ADR-23).
//!
//! User scales and user tunings load the same way: `setUserScales(toml)` and
//! `setUserTunings(toml)` replace the user items in the binding's current catalog and return a
//! `UserFileReport`. Errors use one shape for both: a 0-based item index (`null` for the file
//! as a whole), the item's id if it has one, and the full message. A file-level error never
//! throws; it is reported and leaves only the built-ins.

use serde::Serialize;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(typescript_custom_section)]
const TYPES: &'static str = r#"
/** Why an item of a user file (or the whole file, `item` null) was not loaded. */
export interface UserFileError {
  /** 0-based index of the `[[scale]]` / `[[tuning]]` item, or null for the file as a whole. */
  item: number | null;
  id: string | null;
  /** The full message, e.g. `tuning 2 ("bass-3"): …` (items numbered from 1, as in the file). */
  message: string;
}

/** What `setUserScales` or `setUserTunings` loaded. */
export interface UserFileReport {
  /** Ids of the user items now in the catalog, in file order. */
  loaded: string[];
  errors: UserFileError[];
}
"#;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UserFileError {
    pub item: Option<usize>,
    pub id: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
pub struct UserFileReport {
    pub loaded: Vec<String>,
    pub errors: Vec<UserFileError>,
}

impl From<&theory::CatalogError> for UserFileError {
    fn from(error: &theory::CatalogError) -> Self {
        Self {
            item: error.item,
            id: error.id.clone(),
            message: error.to_string(),
        }
    }
}

impl From<&theory::TuningItemError> for UserFileError {
    fn from(error: &theory::TuningItemError) -> Self {
        Self {
            // The core numbers tuning items from 1.
            item: Some(error.number.saturating_sub(1)),
            id: error.id.clone(),
            message: error.to_string(),
        }
    }
}

impl From<&theory::TuningFileError> for UserFileError {
    fn from(error: &theory::TuningFileError) -> Self {
        Self {
            item: None,
            id: None,
            message: error.to_string(),
        }
    }
}

/// Plain objects, with `None` as `null`.
pub fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsError> {
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|error| JsError::new(&error.to_string()))
}
