//! The scale catalog (`theory::scales`).
//!
//! The binding keeps one current catalog: the built-ins, with the user scales last passed to
//! `setUserScales` merged over them. Results are plain objects (types below); intervals and
//! note names are Unicode, for display. A bad root or unknown id throws a JS `Error`. User
//! files load the same way as user tunings, with the same report (`user_files`, ADR-23).

use std::cell::RefCell;

use serde::Serialize;
use theory::{Glyphs, NoteName, Scale, ScaleCatalog, Source, parse_user_scales};
use wasm_bindgen::prelude::*;

use crate::notes::Accidentals;
use crate::user_files::{UserFileError, UserFileReport, to_js};

#[wasm_bindgen(typescript_custom_section)]
const TYPES: &'static str = r#"
/** A scale of the catalog. */
export interface ScaleInfo {
  /** Stable lowercase kebab-case id: `major`, `phrygian-dominant`. */
  id: string;
  name: string;
  aliases: string[];
  family: string;
  /** Degree labels from the root, Unicode: `["1", "2", "♭3", …]`. */
  intervals: string[];
  /** The same intervals in semitones, root (0) first. */
  semitones: number[];
  /** False for a user scale (which may replace a built-in one with the same id). */
  builtIn: boolean;
}

/** A family of scales in catalog order. */
export interface ScaleFamily {
  name: string;
  scales: ScaleInfo[];
}

/** One note of a scale on a root. */
export interface ScaleNote {
  /** Degree label, Unicode: `♭3`. */
  interval: string;
  semitones: number;
  pitchClass: number;
  /** Spelled name, Unicode: `E♭`. */
  name: string;
}
"#;

thread_local! {
    static CATALOG: RefCell<ScaleCatalog> = RefCell::new(ScaleCatalog::builtin().clone());
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScaleInfo<'a> {
    id: &'a str,
    name: &'a str,
    aliases: &'a [String],
    family: &'a str,
    intervals: Vec<String>,
    semitones: Vec<u8>,
    built_in: bool,
}

impl<'a> From<&'a Scale> for ScaleInfo<'a> {
    fn from(scale: &'a Scale) -> Self {
        Self {
            id: scale.id(),
            name: scale.name(),
            aliases: scale.aliases(),
            family: scale.family(),
            intervals: scale
                .formula()
                .intervals()
                .iter()
                .map(|interval| interval.format(Glyphs::Unicode))
                .collect(),
            semitones: scale.formula().semitones().collect(),
            built_in: scale.source() == Source::BuiltIn,
        }
    }
}

#[derive(Serialize)]
struct ScaleFamily<'a> {
    name: &'a str,
    scales: Vec<ScaleInfo<'a>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScaleNote {
    interval: String,
    semitones: u8,
    pitch_class: u8,
    name: String,
}

/// Every scale in the current catalog, grouped by family.
#[wasm_bindgen(js_name = listScales, unchecked_return_type = "ScaleFamily[]")]
pub fn list_scales() -> Result<JsValue, JsError> {
    CATALOG.with_borrow(|catalog| {
        let families: Vec<ScaleFamily<'_>> = catalog
            .families()
            .into_iter()
            .map(|family| ScaleFamily {
                name: family.name,
                scales: family.scales.into_iter().map(ScaleInfo::from).collect(),
            })
            .collect();
        to_js(&families)
    })
}

/// The scale with `id`, or `undefined`.
#[wasm_bindgen(js_name = getScale, unchecked_return_type = "ScaleInfo | undefined")]
pub fn get_scale(id: &str) -> Result<JsValue, JsError> {
    CATALOG.with_borrow(|catalog| match catalog.get(id) {
        Some(scale) => to_js(&ScaleInfo::from(scale)),
        None => Ok(JsValue::UNDEFINED),
    })
}

/// The notes of scale `id` on `root` (a note name such as `E`, `D♭`), in formula order:
/// spelled by the sharp/flat preference, the root keeping its own spelling (SPEC §4.1).
#[wasm_bindgen(js_name = scaleNotes, unchecked_return_type = "ScaleNote[]")]
pub fn scale_notes(id: &str, root: &str, accidentals: Accidentals) -> Result<JsValue, JsError> {
    let root: NoteName = root.parse()?;
    let accidentals = accidentals.try_into()?;
    CATALOG.with_borrow(|catalog| {
        let scale = catalog
            .get(id)
            .ok_or_else(|| JsError::new(&format!("no scale with id {id:?}")))?;
        let notes: Vec<ScaleNote> = scale
            .notes(root, accidentals)
            .into_iter()
            .map(|note| ScaleNote {
                interval: note.interval.format(Glyphs::Unicode),
                semitones: note.interval.semitones(),
                pitch_class: note.pitch_class().value(),
                name: note.name.format(Glyphs::Unicode),
            })
            .collect();
        to_js(&notes)
    })
}

/// Replaces the user scales with those in `toml` (a user scale file, `[[scale]]` tables) and
/// merges them over the built-ins: a user scale with a built-in id replaces it. Broken items
/// are reported and skipped; the valid ones load. A file that can't be read at all is one
/// error with `item` null, and leaves the built-ins. An empty string clears the user scales.
#[wasm_bindgen(js_name = setUserScales, unchecked_return_type = "UserFileReport")]
pub fn set_user_scales(toml: &str) -> Result<JsValue, JsError> {
    let (catalog, report) = load_user_scales(toml);
    CATALOG.set(catalog);
    to_js(&report)
}

/// The catalog with the user scales in `toml` merged in, and the report.
fn load_user_scales(toml: &str) -> (ScaleCatalog, UserFileReport) {
    let parsed = parse_user_scales(toml);
    let report = UserFileReport {
        loaded: parsed
            .scales
            .iter()
            .map(|scale| scale.id().to_owned())
            .collect(),
        errors: parsed.errors.iter().map(UserFileError::from).collect(),
    };
    (
        ScaleCatalog::builtin().with_user_scales(parsed.scales),
        report,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_scale_errors_use_the_shared_shape_with_items_from_zero() {
        let (catalog, report) = load_user_scales(
            r#"
[[scale]]
id = "mine"
name = "Mine"
intervals = ["1", "b2", "5"]

[[scale]]
id = "broken"
name = "Broken"
intervals = ["1", "5", "3"]
"#,
        );
        assert_eq!(report.loaded, ["mine"]);
        assert_eq!(report.errors.len(), 1);
        let error = &report.errors[0];
        assert_eq!(error.item, Some(1));
        assert_eq!(error.id.as_deref(), Some("broken"));
        assert!(
            error.message.starts_with("scale 2 (\"broken\"): "),
            "{}",
            error.message
        );
        assert!(catalog.get("mine").is_some());
    }

    #[test]
    fn a_scale_file_that_is_not_toml_is_one_error_without_an_item() {
        let (catalog, report) = load_user_scales("[[scale]\n");
        assert!(report.loaded.is_empty());
        assert_eq!(report.errors.len(), 1);
        assert_eq!(report.errors[0].item, None);
        assert_eq!(report.errors[0].id, None);
        assert_eq!(&catalog, ScaleCatalog::builtin());
    }
}
