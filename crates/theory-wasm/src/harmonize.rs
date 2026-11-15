//! Harmonize a scale (`theory::harmonize`, SPEC §5.5, ADR-30).
//!
//! One call: the chord on every degree of a scale, from the current scale and chord catalogs
//! (so user scales and user chords count). Results are structured: spelled notes, the catalog
//! chord id, the Roman numeral in parts (plus its text) and the stacked tones. Chord symbols
//! are written from the chord id by the symbol formatter, not here. Intervals and note names
//! are Unicode, for display. A bad root or unknown scale id throws a JS `Error`.

use serde::Serialize;
use theory::{Glyphs, HarmonizedChord, HarmonizedDegree, NoteName, RomanNumeral, harmonize};
use wasm_bindgen::prelude::*;

use crate::chords;
use crate::notes::Accidentals;
use crate::scales;
use crate::user_files::to_js;

#[wasm_bindgen(typescript_custom_section)]
const TYPES: &'static str = r#"
/** Roman numeral of a chord, in parts and as text. */
export interface RomanNumeralParts {
  /** Semitones the numeral is raised (+1) or lowered (-1): 0 in scales of seven notes. */
  accidental: number;
  /** The degree, 1 to 7. */
  number: number;
  /** True for a minor third (`ii`), false for a major one (`II`). */
  lowercase: boolean;
  /** `°` diminished, `+` augmented, `ø` half-diminished; null for major and minor. */
  mark: '°' | '+' | 'ø' | null;
  /** `7` (minor or diminished seventh), `maj7` (major seventh); null for triads. */
  seventh: '7' | 'maj7' | null;
  /** The numeral as text: `♭III+maj7`, `viiø7`. */
  text: string;
}

/** The chord stacked on one degree of a scale. */
export interface HarmonizedChord {
  /** The catalog chord with exactly these intervals (a user chord wins over a built-in one); null if there is none. */
  chordId: string | null;
  /** The stacked tones, chord root first, spelled as the scale. `interval` is from the chord's root. */
  tones: ChordNote[];
  numeral: RomanNumeralParts;
}

/** One degree of a harmonized scale. */
export interface HarmonizedDegree {
  /** Place in the scale, from 1. */
  degree: number;
  /** The scale note the chord is built on; `interval` is from the scale's root. */
  root: ScaleNote;
  /** Null where no stack of thirds forms on this degree. */
  chord: HarmonizedChord | null;
}
"#;

/// How many tones a chord is stacked from.
#[wasm_bindgen]
#[derive(Clone, Copy)]
pub enum Stacking {
    Triads = "triads",
    Sevenths = "sevenths",
}

impl TryFrom<Stacking> for theory::Stacking {
    type Error = JsError;

    fn try_from(stacking: Stacking) -> Result<Self, JsError> {
        match stacking {
            Stacking::Triads => Ok(Self::Triads),
            Stacking::Sevenths => Ok(Self::Sevenths),
            // Any other string from untyped JS.
            Stacking::__Invalid => Err(JsError::new("stacking must be \"triads\" or \"sevenths\"")),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Tone {
    interval: String,
    semitones: u8,
    pitch_class: u8,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Numeral {
    accidental: i8,
    number: u8,
    lowercase: bool,
    mark: Option<&'static str>,
    seventh: Option<&'static str>,
    text: String,
}

impl From<RomanNumeral> for Numeral {
    fn from(numeral: RomanNumeral) -> Self {
        Self {
            accidental: numeral.accidental,
            number: numeral.number,
            lowercase: numeral.lowercase,
            mark: numeral.mark.map(|mark| mark.symbol()),
            seventh: numeral.seventh.map(|seventh| seventh.symbol()),
            text: numeral.format(Glyphs::Unicode),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Chord {
    chord_id: Option<String>,
    tones: Vec<Tone>,
    numeral: Numeral,
}

impl From<HarmonizedChord> for Chord {
    fn from(chord: HarmonizedChord) -> Self {
        Self {
            chord_id: chord.chord_id,
            tones: chord
                .tones
                .into_iter()
                .map(|tone| Tone {
                    interval: tone.interval.format(Glyphs::Unicode),
                    semitones: tone.interval.semitones(),
                    pitch_class: tone.pitch_class().value(),
                    name: tone.name.format(Glyphs::Unicode),
                })
                .collect(),
            numeral: chord.numeral.into(),
        }
    }
}

#[derive(Serialize)]
struct Degree {
    degree: u8,
    root: Tone,
    chord: Option<Chord>,
}

impl From<HarmonizedDegree> for Degree {
    fn from(degree: HarmonizedDegree) -> Self {
        let root = degree.root;
        Self {
            degree: degree.degree,
            root: Tone {
                interval: root.interval.format(Glyphs::Unicode),
                semitones: root.interval.semitones(),
                pitch_class: root.pitch_class().value(),
                name: root.name.format(Glyphs::Unicode),
            },
            chord: degree.chord.map(Chord::from),
        }
    }
}

/// The chord on every degree of scale `scaleId` on `root` (a note name such as `E`, `D♭`), in
/// scale order, stacked as triads or sevenths. Spelled by the sharp/flat preference, the root
/// keeping its own spelling (SPEC §4.1). Where no stack of thirds forms, `chord` is null.
#[wasm_bindgen(js_name = harmonizeScale, unchecked_return_type = "HarmonizedDegree[]")]
pub fn harmonize_scale(
    scale_id: &str,
    root: &str,
    accidentals: Accidentals,
    stacking: Stacking,
) -> Result<JsValue, JsError> {
    let root: NoteName = root.parse()?;
    let accidentals = accidentals.try_into()?;
    let stacking = stacking.try_into()?;
    let degrees = chords::with_catalog(|chords| {
        scales::with_catalog(|scales| {
            let scale = scales
                .get(scale_id)
                .ok_or_else(|| JsError::new(&format!("no scale with id {scale_id:?}")))?;
            Ok::<_, JsError>(harmonize(scale, root, accidentals, stacking, chords))
        })
    })?;
    let degrees: Vec<Degree> = degrees.into_iter().map(Degree::from).collect();
    to_js(&degrees)
}
