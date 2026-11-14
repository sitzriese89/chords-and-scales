//! Tunings and the fretboard mapping (`theory::tuning`, `theory::fretboard`).
//!
//! Records cross the boundary as plain objects (via `serde-wasm-bindgen`), typed by the
//! TypeScript declarations below. Notes are MIDI numbers, pitch classes 0 … 11, interval
//! labels Unicode. Tunings list their notes lowest string first; positions number strings
//! from the highest (string 1) and use absolute frets, as the fretboard component does
//! (ADR-18). Invalid input throws a JS `Error`.

use serde::{Deserialize, Serialize};
use theory::{
    Glyphs, InstrumentKind, Note, PitchClass, Tuning, TuningCatalog, parse_tunings, positions,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(typescript_custom_section)]
const TS_TYPES: &str = r#"
/** A tuning. `notes` are the open strings as MIDI numbers, lowest string first. */
export interface Tuning {
  id: string;
  name: string;
  kind: 'guitar' | 'bass';
  notes: number[];
}

/** A `[[tuning]]` item of a user file that was skipped, and why. */
export interface TuningItemError {
  /** 1 for the first `[[tuning]]` table in the file. */
  number: number;
  id?: string;
  message: string;
}

/** The tunings to offer: built-ins, with the user's on top, and the user items skipped. */
export interface TuningCatalog {
  tunings: Tuning[];
  errors: TuningItemError[];
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
    #[wasm_bindgen(typescript_type = "TuningCatalog")]
    pub type TuningCatalogValue;
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
struct ItemErrorRecord {
    number: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    message: String,
}

#[derive(Serialize)]
struct CatalogRecord {
    tunings: Vec<TuningRecord>,
    errors: Vec<ItemErrorRecord>,
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
    serde_wasm_bindgen::to_value(value)
        .map(JsCast::unchecked_into)
        .map_err(|err| JsError::new(&err.to_string()))
}

fn small(value: u32, what: &str) -> Result<u8, JsError> {
    u8::try_from(value).map_err(|_| JsError::new(&format!("{value} {what} is out of range")))
}

/// The tunings to offer: the built-in presets, then the user's tunings from `userToml` (a
/// tunings file, same format as the built-in `tunings.toml`) on top. A user tuning with a
/// built-in id replaces it. Invalid user items are skipped and listed in `errors`; a file
/// that isn't a tunings file at all throws.
#[wasm_bindgen(js_name = tuningCatalog)]
pub fn tuning_catalog(user_toml: Option<String>) -> Result<TuningCatalogValue, JsError> {
    let mut catalog = TuningCatalog::builtin();
    let mut errors = Vec::new();
    if let Some(input) = user_toml {
        let parsed = parse_tunings(&input)?;
        catalog.merge(parsed.tunings);
        errors = parsed
            .errors
            .into_iter()
            .map(|err| ItemErrorRecord {
                number: err.number,
                message: err.to_string(),
                id: err.id,
            })
            .collect();
    }
    to_js(&CatalogRecord {
        tunings: catalog.tunings().iter().map(TuningRecord::from).collect(),
        errors,
    })
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
