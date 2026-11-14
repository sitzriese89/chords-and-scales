//! Scale positions (`theory::scale_positions`): the fret window and 3-notes-per-string
//! patterns.
//!
//! Takes the same inputs as `fretboardPositions`: a `Tuning` object, fret count, capo, the
//! scale as pitch classes 0 … 11 and the root. Returns `NotePosition`s (string 1 = highest,
//! absolute frets, ADR-18) in **tab order**: the lowest string first, then by fret. Invalid
//! input throws a JS `Error`.
//!
//! The tuning and position records mirror those in `fretboard.rs` (same TS types); they are
//! kept separate so the two modules can change independently.

use serde::{Deserialize, Serialize};
use theory::{
    Glyphs, InstrumentKind, Note, PitchClass, Position, Tuning, fret_window, three_notes_per_string,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(typescript_custom_section)]
const TS_TYPES: &str = r#"
/** A 3-notes-per-string pattern of a scale. */
export interface ScalePattern {
  /**
   * The scale degree it starts on, counted up from the root from 0: 0 starts on the root
   * (or the first scale note above it). A degree whose pattern doesn't fit on the neck is
   * missing from the list.
   */
  degree: number;
  /** Three positions per string, lowest string first, ascending in pitch. */
  positions: NotePosition[];
}
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "Tuning")]
    pub type PatternTuning;
    #[wasm_bindgen(typescript_type = "readonly number[]")]
    pub type ScalePitchClasses;
    #[wasm_bindgen(typescript_type = "NotePosition[]")]
    pub type WindowPositions;
    #[wasm_bindgen(typescript_type = "ScalePattern[]")]
    pub type ScalePatterns;
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TuningRecord {
    id: String,
    name: String,
    kind: String,
    notes: Vec<u8>,
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

impl From<&Position> for PositionRecord {
    fn from(p: &Position) -> Self {
        Self {
            string: p.string,
            fret: p.fret,
            midi: p.note.midi(),
            pitch_class: p.pitch_class().value(),
            degree: p.degree(),
            interval: p.interval.format(Glyphs::Unicode),
        }
    }
}

#[derive(Serialize)]
struct PatternRecord {
    degree: usize,
    positions: Vec<PositionRecord>,
}

/// Every position of `pitchClasses` in the frets `start` to `start + span - 1`: exactly the
/// `fretboardPositions` output inside the window, so frets below the capo or past the last
/// fret give nothing. Ordered for tab: lowest string first, then by fret.
#[wasm_bindgen(js_name = fretWindow)]
pub fn fret_window_positions(
    tuning: PatternTuning,
    frets: u32,
    capo: u32,
    pitch_classes: ScalePitchClasses,
    root: u32,
    start: u32,
    span: u32,
) -> Result<WindowPositions, JsError> {
    let result = fret_window(
        &tuning_arg(tuning)?,
        small(frets, "frets")?,
        small(capo, "capo fret")?,
        &pitch_classes_arg(pitch_classes)?,
        to_pitch_class(root)?,
        small(start, "start fret")?,
        small(span, "fret span")?,
    )?;
    to_js(&result.iter().map(PositionRecord::from).collect::<Vec<_>>())
}

/// The 3-notes-per-string patterns of the scale `pitchClasses` (degrees counted up from
/// `root`), one per degree, each at the lowest octave that fits between the capo and the last
/// fret; a pattern that doesn't fit at all is left out. Ordered by degree.
#[wasm_bindgen(js_name = threeNotesPerString)]
pub fn three_nps_patterns(
    tuning: PatternTuning,
    frets: u32,
    capo: u32,
    pitch_classes: ScalePitchClasses,
    root: u32,
) -> Result<ScalePatterns, JsError> {
    let patterns = three_notes_per_string(
        &tuning_arg(tuning)?,
        small(frets, "frets")?,
        small(capo, "capo fret")?,
        &pitch_classes_arg(pitch_classes)?,
        to_pitch_class(root)?,
    )?;
    to_js(
        &patterns
            .iter()
            .map(|pattern| PatternRecord {
                degree: pattern.degree,
                positions: pattern.positions.iter().map(PositionRecord::from).collect(),
            })
            .collect::<Vec<_>>(),
    )
}

fn tuning_arg(tuning: PatternTuning) -> Result<Tuning, JsError> {
    let record: TuningRecord = serde_wasm_bindgen::from_value(tuning.into())
        .map_err(|err| JsError::new(&format!("not a tuning: {err}")))?;
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

fn pitch_classes_arg(pitch_classes: ScalePitchClasses) -> Result<Vec<PitchClass>, JsError> {
    let values: Vec<u32> = serde_wasm_bindgen::from_value(pitch_classes.into())
        .map_err(|err| JsError::new(&format!("not a list of pitch classes: {err}")))?;
    values.into_iter().map(to_pitch_class).collect()
}

fn to_pitch_class(value: u32) -> Result<PitchClass, JsError> {
    u8::try_from(value)
        .ok()
        .and_then(PitchClass::new)
        .ok_or_else(|| JsError::new(&format!("{value} is not a pitch class (0 to 11)")))
}

fn small(value: u32, what: &str) -> Result<u8, JsError> {
    u8::try_from(value).map_err(|_| JsError::new(&format!("{value} {what} is out of range")))
}

fn to_js<T: Serialize, J: JsCast>(value: &T) -> Result<J, JsError> {
    serde_wasm_bindgen::to_value(value)
        .map(JsCast::unchecked_into)
        .map_err(|err| JsError::new(&err.to_string()))
}
