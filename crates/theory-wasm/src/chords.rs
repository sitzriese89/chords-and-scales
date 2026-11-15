//! The chord catalog (`theory::chords`).
//!
//! Like the scale catalog (`scales.rs`): the binding keeps one current catalog, the built-ins
//! with the user chords last passed to `setUserChords` merged over them. Results are plain
//! objects (types below); intervals and note names are Unicode, for display. A bad root or
//! unknown id throws a JS `Error`. User files load with the same report as scales and tunings
//! (`user_files`, ADR-23). Chord suffixes (`symbol`, `aliases`, `jazzSymbol`) are ASCII as
//! stored; the symbol parser and formatter (`symbols.rs`) turn them into what is shown.

use std::cell::RefCell;

use serde::Serialize;
use theory::{Chord, ChordCatalog, Glyphs, NoteName, Source, parse_user_chords};
use wasm_bindgen::prelude::*;

use crate::notes::Accidentals;
use crate::user_files::{UserFileError, UserFileReport, to_js};

#[wasm_bindgen(typescript_custom_section)]
const TYPES: &'static str = r#"
/** A chord of the catalog. */
export interface ChordInfo {
  /** Stable lowercase kebab-case id: `maj7`, `dom7sharp9`. */
  id: string;
  /** Display name: `Major seventh`. */
  name: string;
  /** The canonical suffix after the root, ASCII: `maj7`, `m7b5`; empty for the major triad. */
  symbol: string;
  /** Other suffixes that mean this chord: `M7`, `Δ7`. Case matters. */
  aliases: string[];
  /** The suffix in the Jazz display style (`Δ7`, `ø`); equals `symbol` if there is no special form. */
  jazzSymbol: string;
  family: string;
  /** Degree labels from the root, Unicode: `["1", "3", "5", "♭7", "♯9"]`. May pass 8 (`9`, `♯11`, `13`). */
  intervals: string[];
  /** The same intervals in semitones, root (0) first; 12 or more for the compound ones. */
  semitones: number[];
  /** False for a user chord (which may replace a built-in one with the same id). */
  builtIn: boolean;
}

/** A family of chords in catalog order. */
export interface ChordFamily {
  name: string;
  chords: ChordInfo[];
}

/** One note of a chord on a root. */
export interface ChordNote {
  /** Degree label, Unicode: `♭7`. */
  interval: string;
  /** Semitones above the root: 14 for a `9`. */
  semitones: number;
  pitchClass: number;
  /** Spelled name, Unicode: `E♭`. */
  name: string;
}
"#;

thread_local! {
    static CATALOG: RefCell<ChordCatalog> = RefCell::new(ChordCatalog::builtin().clone());
}

/// Runs `f` with the current catalog (the built-ins and the user chords), for the other
/// bindings that read chords (`symbols.rs`).
pub(crate) fn with_catalog<R>(f: impl FnOnce(&ChordCatalog) -> R) -> R {
    CATALOG.with_borrow(f)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChordInfo<'a> {
    id: &'a str,
    name: &'a str,
    symbol: &'a str,
    aliases: &'a [String],
    jazz_symbol: &'a str,
    family: &'a str,
    intervals: Vec<String>,
    semitones: Vec<u8>,
    built_in: bool,
}

impl<'a> From<&'a Chord> for ChordInfo<'a> {
    fn from(chord: &'a Chord) -> Self {
        Self {
            id: chord.id(),
            name: chord.name(),
            symbol: chord.symbol(),
            aliases: chord.aliases(),
            jazz_symbol: chord.jazz_symbol(),
            family: chord.family(),
            intervals: chord
                .formula()
                .intervals()
                .iter()
                .map(|interval| interval.format(Glyphs::Unicode))
                .collect(),
            semitones: chord.formula().semitones().collect(),
            built_in: chord.source() == Source::BuiltIn,
        }
    }
}

#[derive(Serialize)]
struct ChordFamily<'a> {
    name: &'a str,
    chords: Vec<ChordInfo<'a>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChordNote {
    interval: String,
    semitones: u8,
    pitch_class: u8,
    name: String,
}

/// Every chord in the current catalog, grouped by family.
#[wasm_bindgen(js_name = listChords, unchecked_return_type = "ChordFamily[]")]
pub fn list_chords() -> Result<JsValue, JsError> {
    CATALOG.with_borrow(|catalog| {
        let families: Vec<ChordFamily<'_>> = catalog
            .families()
            .into_iter()
            .map(|family| ChordFamily {
                name: family.name,
                chords: family.chords.into_iter().map(ChordInfo::from).collect(),
            })
            .collect();
        to_js(&families)
    })
}

/// The chord with `id`, or `undefined`.
#[wasm_bindgen(js_name = getChord, unchecked_return_type = "ChordInfo | undefined")]
pub fn get_chord(id: &str) -> Result<JsValue, JsError> {
    CATALOG.with_borrow(|catalog| match catalog.get(id) {
        Some(chord) => to_js(&ChordInfo::from(chord)),
        None => Ok(JsValue::UNDEFINED),
    })
}

/// The notes of chord `id` on `root` (a note name such as `E`, `D♭`), in formula order:
/// spelled by the sharp/flat preference, the root keeping its own spelling (SPEC §4.1).
#[wasm_bindgen(js_name = chordNotes, unchecked_return_type = "ChordNote[]")]
pub fn chord_notes(id: &str, root: &str, accidentals: Accidentals) -> Result<JsValue, JsError> {
    let root: NoteName = root.parse()?;
    let accidentals = accidentals.try_into()?;
    CATALOG.with_borrow(|catalog| {
        let chord = catalog
            .get(id)
            .ok_or_else(|| JsError::new(&format!("no chord with id {id:?}")))?;
        let notes: Vec<ChordNote> = chord
            .notes(root, accidentals)
            .into_iter()
            .map(|note| ChordNote {
                interval: note.interval.format(Glyphs::Unicode),
                semitones: note.interval.semitones(),
                pitch_class: note.pitch_class().value(),
                name: note.name.format(Glyphs::Unicode),
            })
            .collect();
        to_js(&notes)
    })
}

/// Replaces the user chords with those in `toml` (a user chord file, `[[chord]]` tables) and
/// merges them over the built-ins: a user chord with a built-in id replaces it. Broken items
/// are reported and skipped; the valid ones load. A file that can't be read at all is one
/// error with `item` null, and leaves the built-ins. An empty string clears the user chords.
#[wasm_bindgen(js_name = setUserChords, unchecked_return_type = "UserFileReport")]
pub fn set_user_chords(toml: &str) -> Result<JsValue, JsError> {
    let (catalog, report) = load_user_chords(toml);
    CATALOG.set(catalog);
    to_js(&report)
}

/// The catalog with the user chords in `toml` merged in, and the report.
fn load_user_chords(toml: &str) -> (ChordCatalog, UserFileReport) {
    let parsed = parse_user_chords(toml);
    let report = UserFileReport {
        loaded: parsed
            .chords
            .iter()
            .map(|chord| chord.id().to_owned())
            .collect(),
        errors: parsed.errors.iter().map(UserFileError::from).collect(),
    };
    (
        ChordCatalog::builtin().with_user_chords(parsed.chords),
        report,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_chord_errors_use_the_shared_shape_with_items_from_zero() {
        let (catalog, report) = load_user_chords(
            r#"
[[chord]]
id = "mine"
name = "Mine"
symbol = "mine"
intervals = ["1", "b2", "5"]

[[chord]]
id = "broken"
name = "Broken"
symbol = "broken"
intervals = ["1", "5", "3"]
"#,
        );
        assert_eq!(report.loaded, ["mine"]);
        assert_eq!(report.errors.len(), 1);
        let error = &report.errors[0];
        assert_eq!(error.item, Some(1));
        assert_eq!(error.id.as_deref(), Some("broken"));
        assert!(
            error.message.starts_with("chord 2 (\"broken\"): "),
            "{}",
            error.message
        );
        assert!(catalog.get("mine").is_some());
    }

    #[test]
    fn a_chord_file_that_is_not_toml_is_one_error_without_an_item() {
        let (catalog, report) = load_user_chords("[[chord]\n");
        assert!(report.loaded.is_empty());
        assert_eq!(report.errors.len(), 1);
        assert_eq!(report.errors[0].item, None);
        assert_eq!(report.errors[0].id, None);
        assert_eq!(&catalog, ChordCatalog::builtin());
    }
}
