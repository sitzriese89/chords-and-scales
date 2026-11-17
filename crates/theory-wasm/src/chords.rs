//! The chord catalog (`theory::chords`).
//!
//! Like the scale catalog (`scales.rs`): the binding keeps one current catalog, the built-ins
//! with the user chords last passed to `setUserChords` merged over them. Results are plain
//! objects (types below); intervals and note names are Unicode, for display. A bad root or
//! unknown id throws a JS `Error`. User files load with the same report as scales and tunings
//! (`user_files`, ADR-23). Chord suffixes (`symbol`, `aliases`, `jazzSymbol`) are ASCII as
//! stored; the symbol parser and formatter (`symbols.rs`) turn them into what is shown.
//! `writeChords`, `newChordId` and `chordIntervalLabels` are for the chord editor, which saves
//! the user's file (ADR-36).

use std::cell::RefCell;

use serde::{Deserialize, Serialize};
use theory::{
    Chord, ChordCatalog, ChordSpec, Glyphs, NoteName, Source, chord_interval_labels,
    parse_user_chords, write_chords,
};
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

/**
 * A user chord to write with `writeChords`. A `ChordInfo` is one too (its other fields are
 * ignored; a `jazzSymbol` equal to `symbol` means none). Suffixes are stored as given, so
 * write `b5` and `#9`, not `♭5` and `♯9`; interval labels may be ASCII or Unicode. A missing
 * `family` lists the chord under "Custom".
 */
export interface ChordInput {
  id: string;
  name: string;
  symbol: string;
  aliases?: string[];
  jazzSymbol?: string;
  family?: string;
  intervals: string[];
}
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "readonly ChordInput[]")]
    pub type ChordInputList;
}

/// A `ChordInput` object.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChordRecord {
    id: String,
    name: String,
    symbol: String,
    #[serde(default)]
    aliases: Vec<String>,
    #[serde(default)]
    jazz_symbol: Option<String>,
    #[serde(default)]
    family: Option<String>,
    intervals: Vec<String>,
}

thread_local! {
    pub(crate) static CATALOG: RefCell<ChordCatalog> = RefCell::new(ChordCatalog::builtin().clone());
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

/// The text of a user chord file holding `chords`, in order, which `setUserChords` reads back
/// unchanged. Each chord is checked as one from a file is; the first invalid one throws with
/// its name and the reason (`“Mine”: a chord needs at least one note besides the root`). Two
/// chords with one id or one name, a suffix another chord has, or a suffix that the symbol
/// parser wouldn't read back as the chord, among the built-ins and these, throw too. Doesn't
/// change the catalog: save the text, then pass it to `setUserChords`.
#[wasm_bindgen(js_name = writeChords)]
pub fn write_chords_toml(chords: ChordInputList) -> Result<String, JsError> {
    let records: Vec<ChordRecord> = serde_wasm_bindgen::from_value(chords.into())
        .map_err(|err| JsError::new(&format!("not a list of chords: {err}")))?;
    write_chords_text(records).map_err(|err| JsError::new(&err))
}

/// `writeChords` without the JS conversion.
fn write_chords_text(records: Vec<ChordRecord>) -> Result<String, String> {
    let chords = records
        .into_iter()
        .map(|record| {
            let name = record.name.trim().to_owned();
            Chord::new(ChordSpec {
                id: record.id,
                name: record.name,
                symbol: record.symbol,
                aliases: record.aliases,
                jazz_symbol: record.jazz_symbol,
                family: record.family,
                intervals: record.intervals,
            })
            .map_err(|err| match name.as_str() {
                "" => err.to_string(),
                name => format!("“{name}”: {err}"),
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    write_chords(&chords).map_err(|err| err.to_string())
}

/// The id for a new user chord called `name`: the kebab-case slug of the name (`my-7-9`), with
/// `-2`, `-3`, … if the current catalog or the built-ins already have it. A new chord saved
/// under it never replaces another.
#[wasm_bindgen(js_name = newChordId)]
pub fn new_chord_id(name: &str) -> String {
    CATALOG.with_borrow(|catalog| catalog.new_id(name))
}

/// The label the chord editor offers for each width from 0 to 23 semitones (index =
/// semitones), Unicode: the one the built-in chords use (`♯5`, `♭9`, `♯11`, `13`), the default
/// label within the octave where no chord uses one, and `null` above the octave where none
/// does (`8`, `10`, `12`, …).
#[wasm_bindgen(js_name = chordIntervalLabels, unchecked_return_type = "(string | null)[]")]
pub fn chord_interval_labels_js() -> Result<JsValue, JsError> {
    let labels: Vec<Option<String>> = chord_interval_labels()
        .iter()
        .map(|label| label.map(|label| label.format(Glyphs::Unicode)))
        .collect();
    to_js(&labels)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(id: &str, name: &str, symbol: &str, intervals: &[&str]) -> ChordRecord {
        ChordRecord {
            id: id.to_owned(),
            name: name.to_owned(),
            symbol: symbol.to_owned(),
            aliases: Vec::new(),
            jazz_symbol: None,
            family: None,
            intervals: intervals.iter().map(|&s| s.to_owned()).collect(),
        }
    }

    #[test]
    fn written_chords_load_and_errors_name_the_chord() {
        let text =
            write_chords_text(vec![record("mine", "Mine", "q7", &["1", "3", "♭7", "♯9"])]).unwrap();
        let (catalog, report) = load_user_chords(&text);
        assert_eq!(report.loaded, ["mine"]);
        assert_eq!(report.errors, []);
        assert_eq!(
            catalog.get("mine").unwrap().formula().to_string(),
            "1 3 b7 #9"
        );

        assert_eq!(
            write_chords_text(vec![record("mine", " Mine ", "q", &["1"])]),
            Err("“Mine”: a chord needs at least one note besides the root".to_owned())
        );
        assert_eq!(
            write_chords_text(vec![record("mine", "", "q", &["1", "3"])]),
            Err("name must not be empty".to_owned())
        );
        assert_eq!(
            write_chords_text(vec![record("mine", "Mine", "m7", &["1", "3"])]),
            Err("the symbol \"m7\" already means the chord \"Minor seventh\"".to_owned())
        );
    }

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
