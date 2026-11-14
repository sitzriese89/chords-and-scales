//! Scale positions (`theory::scale_positions`): the fret window and 3-notes-per-string
//! patterns.
//!
//! Takes the same inputs as `fretboardPositions`: a `Tuning` object, fret count, capo, the
//! scale as pitch classes 0 … 11 and the root. Returns `NotePosition`s (string 1 = highest,
//! absolute frets, ADR-18) in **tab order**: the lowest string first, then by fret. Invalid
//! input throws a JS `Error`. The tuning and position records are shared with `fretboard.rs`
//! (`records`).

use serde::Serialize;
use theory::{fret_window, three_notes_per_string};
use wasm_bindgen::prelude::*;

use crate::records::{PositionRecord, pitch_classes_arg, small, to_js, to_pitch_class, tuning_arg};

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
        &tuning_arg(tuning.into())?,
        small(frets, "frets")?,
        small(capo, "capo fret")?,
        &pitch_classes_arg(pitch_classes.into())?,
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
        &tuning_arg(tuning.into())?,
        small(frets, "frets")?,
        small(capo, "capo fret")?,
        &pitch_classes_arg(pitch_classes.into())?,
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
