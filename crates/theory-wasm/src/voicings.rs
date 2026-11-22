//! The voicing generator (`theory::voicings`, SPEC §5.6, ADR-35).
//!
//! Takes the neck as `fretboardPositions` does (a `Tuning` object, fret count, capo), a chord
//! id from the current chord catalog (user chords included, `chords.rs`) and a root pitch
//! class, plus optional constraints. Returns the best playable shapes, best first. Strings
//! come **lowest string first**, as a tuning lists them and a shape is written (`x32010`), and
//! each played string carries its fretboard string number (1 = highest, ADR-18) and absolute
//! fret. Intervals are the chord's own labels (`9`, `♯11`), Unicode. Invalid input throws a
//! JS `Error`; a chord no shape can play gives an empty list.

use serde::{Deserialize, Serialize};
use theory::voicings::MAX_SPAN;
use theory::{Barre, Glyphs, VoicedNote, Voicing, VoicingOptions, voicings};
use wasm_bindgen::prelude::*;

use crate::records::{small, to_js, to_pitch_class, tuning_arg};

#[wasm_bindgen(typescript_custom_section)]
const TS_TYPES: &str = r#"
/** What `chordVoicings` may do. Every field is optional. */
export interface VoicingOptions {
  /** The most frets the fretted notes may cover, 1 to 6; open strings don't count. Default 4. */
  maxSpan?: number;
  /** Whether open strings (the capo fret, with a capo) may sound. Default true. */
  openStrings?: boolean;
  /** Whether strings may be left unplayed. Default true; false plays every string. */
  mutedStrings?: boolean;
  /** Whether a chord tone other than the root may be the lowest note. Default false. */
  inversions?: boolean;
  /**
   * The lowest fret a fretted note may be on, absolute (ADR-18); open strings follow
   * `openStrings`. Default 0: no limit, as is any start fret at or below the capo.
   */
  startFret?: number;
  /** The most voicings returned. Default 50. */
  limit?: number;
}

/** One played string of a voicing. */
export interface VoicedString {
  /** Fretboard string number: 1 = the highest string. */
  string: number;
  /**
   * Absolute fret (ADR-18): 0 is the open string without a capo; with a capo the open string
   * is the capo fret, and no fret below it appears.
   */
  fret: number;
  /** The sounding note as a MIDI number. */
  midi: number;
  pitchClass: number;
  /** The chord tone, as the chord labels it, Unicode: `1`, `♭7`, `9`. */
  interval: string;
}

/** A barre: one finger across several strings on one fret. */
export interface VoicingBarre {
  fret: number;
  /** The lowest string under it, as a fretboard number (the larger one). */
  lowestString: number;
  /** The highest string under it, as a fretboard number (the smaller one). */
  highestString: number;
}

/** A playable shape of a chord: a `chordVoicings` result. */
export interface ChordVoicing {
  /** One entry per string, lowest string first; null is a muted string. */
  strings: (VoicedString | null)[];
  /** The chord tone in the bass: `1`, or another one for an inversion. */
  bass: string;
  /** The chord tones left out: `["5"]`. */
  omitted: string[];
  /** The lowest fretted fret (above the capo); null when only open strings sound. */
  lowestFret: number | null;
  /** Frets the fretted notes cover, lowest to highest inclusive; 0 with none fretted. */
  span: number;
  /** How many strings sound. */
  played: number;
  /** The barre the shape needs, if any. */
  barre: VoicingBarre | null;
  /** The ranking score: higher is better (ADR-35). */
  score: number;
}
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "Tuning")]
    pub type VoicingTuning;
    #[wasm_bindgen(typescript_type = "VoicingOptions")]
    pub type VoicingOptionsArg;
    #[wasm_bindgen(typescript_type = "ChordVoicing[]")]
    pub type ChordVoicings;
}

/// A `VoicingOptions` object; absent fields take the core's defaults, unknown ones are ignored.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct OptionsRecord {
    max_span: Option<u32>,
    open_strings: Option<bool>,
    muted_strings: Option<bool>,
    inversions: Option<bool>,
    start_fret: Option<u32>,
    limit: Option<u32>,
}

impl OptionsRecord {
    fn into_options(self) -> Result<VoicingOptions, String> {
        let defaults = VoicingOptions::default();
        let max_span = match self.max_span {
            Some(span) => u8::try_from(span)
                .map_err(|_| format!("a fret span of {span}; the span is 1 to {MAX_SPAN} frets"))?,
            None => defaults.max_span,
        };
        let start_fret = match self.start_fret {
            Some(fret) => {
                u8::try_from(fret).map_err(|_| format!("start fret {fret} is out of range"))?
            }
            None => defaults.start_fret,
        };
        Ok(VoicingOptions {
            max_span,
            open_strings: self.open_strings.unwrap_or(defaults.open_strings),
            muted_strings: self.muted_strings.unwrap_or(defaults.muted_strings),
            inversions: self.inversions.unwrap_or(defaults.inversions),
            start_fret,
            limit: self.limit.map_or(defaults.limit, |limit| limit as usize),
        })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StringRecord {
    string: u8,
    fret: u8,
    midi: u8,
    pitch_class: u8,
    interval: String,
}

impl From<&VoicedNote> for StringRecord {
    fn from(note: &VoicedNote) -> Self {
        Self {
            string: note.string,
            fret: note.fret,
            midi: note.note.midi(),
            pitch_class: note.note.pitch_class().value(),
            interval: note.interval.format(Glyphs::Unicode),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BarreRecord {
    fret: u8,
    lowest_string: u8,
    highest_string: u8,
}

impl From<Barre> for BarreRecord {
    fn from(barre: Barre) -> Self {
        Self {
            fret: barre.fret,
            lowest_string: barre.lowest_string,
            highest_string: barre.highest_string,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VoicingRecord {
    strings: Vec<Option<StringRecord>>,
    bass: String,
    omitted: Vec<String>,
    lowest_fret: Option<u8>,
    span: u8,
    played: usize,
    barre: Option<BarreRecord>,
    score: i32,
}

impl From<&Voicing> for VoicingRecord {
    fn from(voicing: &Voicing) -> Self {
        Self {
            strings: voicing
                .strings
                .iter()
                .map(|string| string.as_ref().map(StringRecord::from))
                .collect(),
            bass: voicing.bass.format(Glyphs::Unicode),
            omitted: voicing
                .omitted
                .iter()
                .map(|interval| interval.format(Glyphs::Unicode))
                .collect(),
            lowest_fret: voicing.lowest_fret,
            span: voicing.span,
            played: voicing.played,
            barre: voicing.barre.map(BarreRecord::from),
            score: voicing.score,
        }
    }
}

/// The best playable shapes of chord `chordId` (from the current chord catalog) on `root`
/// (pitch class 0 … 11), on a neck of `frets` frets (12 to 27) in `tuning` with a capo on
/// fret `capo` (0 = none). Every result contains the root and every tone but the 5th (and an
/// upper 9th or 11th), fits the hand and the `options`; best first (ranking: ADR-35).
#[wasm_bindgen(js_name = chordVoicings)]
pub fn chord_voicings(
    tuning: VoicingTuning,
    frets: u32,
    capo: u32,
    chord_id: &str,
    root: u32,
    options: Option<VoicingOptionsArg>,
) -> Result<ChordVoicings, JsError> {
    let tuning = tuning_arg(tuning.into())?;
    let record: OptionsRecord = match options {
        Some(options) => serde_wasm_bindgen::from_value(options.into())
            .map_err(|err| JsError::new(&format!("not voicing options: {err}")))?,
        None => OptionsRecord::default(),
    };
    let options = record.into_options().map_err(|err| JsError::new(&err))?;
    let frets = small(frets, "frets")?;
    let capo = small(capo, "capo fret")?;
    let root = to_pitch_class(root)?;
    crate::chords::with_catalog(|catalog| {
        let chord = catalog
            .get(chord_id)
            .ok_or_else(|| JsError::new(&format!("no chord with id {chord_id:?}")))?;
        let found = voicings(&tuning, frets, capo, chord, root, &options)
            .map_err(|err| JsError::new(&err.to_string()))?;
        to_js(&found.iter().map(VoicingRecord::from).collect::<Vec<_>>())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absent_options_are_the_core_defaults() {
        assert_eq!(
            OptionsRecord::default().into_options(),
            Ok(VoicingOptions::default())
        );
        let record = OptionsRecord {
            max_span: Some(5),
            inversions: Some(true),
            start_fret: Some(7),
            limit: Some(3),
            ..OptionsRecord::default()
        };
        assert_eq!(
            record.into_options(),
            Ok(VoicingOptions {
                max_span: 5,
                inversions: true,
                start_fret: 7,
                limit: 3,
                ..VoicingOptions::default()
            })
        );
        let wide = OptionsRecord {
            max_span: Some(300),
            ..OptionsRecord::default()
        };
        assert!(wide.into_options().is_err());
        let high = OptionsRecord {
            start_fret: Some(256),
            ..OptionsRecord::default()
        };
        assert!(high.into_options().is_err());
    }
}
