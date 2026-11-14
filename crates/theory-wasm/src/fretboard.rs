//! Tunings and the fretboard mapping (`theory::tuning`, `theory::fretboard`).
//!
//! Records cross the boundary as plain objects (via `serde-wasm-bindgen`), typed by the
//! TypeScript declarations below. Notes are MIDI numbers, pitch classes 0 … 11, interval
//! labels Unicode. Tunings list their notes lowest string first; positions number strings
//! from the highest (string 1) and use absolute frets, as the fretboard component does
//! (ADR-18). Invalid input throws a JS `Error`.
//!
//! Like the scale catalog, the binding keeps one current tuning catalog: the built-ins, with
//! the user tunings last passed to `setUserTunings` on top, reported in the shared
//! `UserFileReport` shape (`user_files`, ADR-23).

use std::cell::RefCell;

use serde::{Deserialize, Serialize};
use theory::{
    Glyphs, InstrumentKind, Note, PitchClass, Tuning, TuningCatalog, parse_tunings, positions,
};
use wasm_bindgen::prelude::*;

use crate::user_files::{UserFileError, UserFileReport};

thread_local! {
    static CATALOG: RefCell<TuningCatalog> = RefCell::new(TuningCatalog::builtin());
}

#[wasm_bindgen(typescript_custom_section)]
const TS_TYPES: &str = r#"
/** A tuning. `notes` are the open strings as MIDI numbers, lowest string first. */
export interface Tuning {
  id: string;
  name: string;
  kind: 'guitar' | 'bass';
  notes: number[];
}

/** One place on the neck, in the fretboard component's coordinates (ADR-18). */
export interface NotePosition {
  /** 1 = the highest string. */
  string: number;
  /** Absolute fret: 0 = open, also with a capo. */
  fret: number;
  /** The sounding note as a MIDI number. */
  midi: number;
  pitchClass: number;
  /** Semitones above the root, 0 to 11. */
  degree: number;
  /** Interval from the root, Unicode: `1`, `♭3`, `5`. */
  interval: string;
}
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "Tuning")]
    pub type TuningValue;
    #[wasm_bindgen(typescript_type = "Tuning[]")]
    pub type TuningList;
    #[wasm_bindgen(typescript_type = "Tuning | undefined")]
    pub type MaybeTuning;
    #[wasm_bindgen(typescript_type = "UserFileReport")]
    pub type UserFileReportValue;
    #[wasm_bindgen(typescript_type = "NotePosition[]")]
    pub type FretPositions;
    #[wasm_bindgen(typescript_type = "readonly number[]")]
    pub type PitchClasses;
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct TuningRecord {
    id: String,
    name: String,
    kind: String,
    notes: Vec<u8>,
}

impl From<&Tuning> for TuningRecord {
    fn from(tuning: &Tuning) -> Self {
        Self {
            id: tuning.id().to_owned(),
            name: tuning.name().to_owned(),
            kind: tuning.kind().as_str().to_owned(),
            notes: tuning.notes().iter().map(|note| note.midi()).collect(),
        }
    }
}

impl TryFrom<TuningRecord> for Tuning {
    type Error = JsError;

    fn try_from(record: TuningRecord) -> Result<Self, JsError> {
        let kind = match record.kind.as_str() {
            "guitar" => InstrumentKind::Guitar,
            "bass" => InstrumentKind::Bass,
            other => {
                return Err(JsError::new(&format!(
                    "kind {other:?} must be \"guitar\" or \"bass\""
                )));
            }
        };
        let notes = record
            .notes
            .iter()
            .map(|&midi| {
                Note::from_midi(midi)
                    .ok_or_else(|| JsError::new(&format!("{midi} is not a MIDI note (0 to 127)")))
            })
            .collect::<Result<_, _>>()?;
        Ok(Tuning::new(record.id, record.name, kind, notes)?)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PositionRecord {
    string: u8,
    fret: u8,
    midi: u8,
    pitch_class: u8,
    degree: u8,
    interval: String,
}

fn to_js<T: Serialize, J: JsCast>(value: &T) -> Result<J, JsError> {
    crate::user_files::to_js(value).map(JsCast::unchecked_into)
}

fn small(value: u32, what: &str) -> Result<u8, JsError> {
    u8::try_from(value).map_err(|_| JsError::new(&format!("{value} {what} is out of range")))
}

/// Every tuning in the current catalog: the built-in presets in file order, then the user's
/// additions (a user tuning with a built-in id sits in the built-in's place).
#[wasm_bindgen(js_name = listTunings)]
pub fn list_tunings() -> Result<TuningList, JsError> {
    CATALOG.with_borrow(|catalog| {
        to_js(
            &catalog
                .tunings()
                .iter()
                .map(TuningRecord::from)
                .collect::<Vec<_>>(),
        )
    })
}

/// The tuning with `id`, or `undefined`.
#[wasm_bindgen(js_name = getTuning)]
pub fn get_tuning(id: &str) -> Result<MaybeTuning, JsError> {
    CATALOG.with_borrow(|catalog| match catalog.get(id) {
        Some(tuning) => to_js(&TuningRecord::from(tuning)),
        None => Ok(JsValue::UNDEFINED.unchecked_into()),
    })
}

/// Replaces the user tunings with those in `toml` (a tunings file, same format as the
/// built-in `tunings.toml`) and puts them on top of the built-ins: a user tuning with a
/// built-in id replaces it. Broken items are reported and skipped; the valid ones load. A
/// file that can't be read at all is one error with `item` null, and leaves the built-ins.
/// An empty string clears the user tunings.
#[wasm_bindgen(js_name = setUserTunings)]
pub fn set_user_tunings(toml: &str) -> Result<UserFileReportValue, JsError> {
    let (catalog, report) = load_user_tunings(toml);
    CATALOG.set(catalog);
    to_js(&report)
}

/// The catalog with the user tunings in `toml` merged in, and the report.
fn load_user_tunings(toml: &str) -> (TuningCatalog, UserFileReport) {
    let mut catalog = TuningCatalog::builtin();
    let report = match parse_tunings(toml) {
        Ok(parsed) => {
            let report = UserFileReport {
                loaded: parsed
                    .tunings
                    .iter()
                    .map(|tuning| tuning.id().to_owned())
                    .collect(),
                errors: parsed.errors.iter().map(UserFileError::from).collect(),
            };
            catalog.merge(parsed.tunings);
            report
        }
        Err(error) => UserFileReport {
            loaded: Vec::new(),
            errors: vec![UserFileError::from(&error)],
        },
    };
    (catalog, report)
}

/// Every position of `pitchClasses` on a neck of `frets` frets (12 to 27) in `tuning`, with
/// a capo on fret `capo` (0 = none, below `frets`; frets below it are left out), labelled by
/// the interval from `root`. Ordered by string (1 = highest first), then fret.
#[wasm_bindgen(js_name = fretboardPositions)]
pub fn fretboard_positions(
    tuning: TuningValue,
    frets: u32,
    capo: u32,
    pitch_classes: PitchClasses,
    root: u32,
) -> Result<FretPositions, JsError> {
    let record: TuningRecord = serde_wasm_bindgen::from_value(tuning.into())
        .map_err(|err| JsError::new(&format!("not a tuning: {err}")))?;
    let tuning = Tuning::try_from(record)?;
    let values: Vec<u32> = serde_wasm_bindgen::from_value(pitch_classes.into())
        .map_err(|err| JsError::new(&format!("not a list of pitch classes: {err}")))?;
    let set = values
        .into_iter()
        .map(to_pitch_class)
        .collect::<Result<Vec<_>, _>>()?;
    let result = positions(
        &tuning,
        small(frets, "frets")?,
        small(capo, "capo fret")?,
        &set,
        to_pitch_class(root)?,
    )?;
    to_js(
        &result
            .iter()
            .map(|p| PositionRecord {
                string: p.string,
                fret: p.fret,
                midi: p.note.midi(),
                pitch_class: p.pitch_class().value(),
                degree: p.degree(),
                interval: p.interval.format(Glyphs::Unicode),
            })
            .collect::<Vec<_>>(),
    )
}

fn to_pitch_class(value: u32) -> Result<PitchClass, JsError> {
    u8::try_from(value)
        .ok()
        .and_then(PitchClass::new)
        .ok_or_else(|| JsError::new(&format!("{value} is not a pitch class (0 to 11)")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_tuning_errors_use_the_shared_shape_with_items_from_zero() {
        let (catalog, report) = load_user_tunings(
            r#"
[[tuning]]
id = "guitar-6-drop-d"
name = "My drop D"
kind = "guitar"
notes = ["D2", "A2", "D3", "G3", "B3", "D4"]

[[tuning]]
id = "bass-3"
name = "Three"
kind = "bass"
notes = ["E1", "A1", "D2"]
"#,
        );
        assert_eq!(report.loaded, ["guitar-6-drop-d"]);
        assert_eq!(report.errors.len(), 1);
        let error = &report.errors[0];
        // The core numbers tuning items from 1; the report counts from 0, as for scales.
        assert_eq!(error.item, Some(1));
        assert_eq!(error.id.as_deref(), Some("bass-3"));
        assert!(
            error.message.starts_with("tuning 2 (\"bass-3\"): "),
            "{}",
            error.message
        );
        assert_eq!(catalog.get("guitar-6-drop-d").unwrap().name(), "My drop D");
        assert!(catalog.get("bass-3").is_none());
    }

    #[test]
    fn a_tunings_file_that_is_not_toml_is_one_error_without_an_item() {
        let (catalog, report) = load_user_tunings("[[tuning]\n");
        assert!(report.loaded.is_empty());
        assert_eq!(report.errors.len(), 1);
        assert_eq!(report.errors[0].item, None);
        assert_eq!(report.errors[0].id, None);
        assert!(report.errors[0].message.starts_with("not valid TOML"));
        assert_eq!(catalog, TuningCatalog::builtin());
    }

    #[test]
    fn an_empty_tunings_file_leaves_the_built_ins() {
        let (catalog, report) = load_user_tunings("");
        assert_eq!(report, UserFileReport::default());
        assert_eq!(catalog, TuningCatalog::builtin());
    }
}
