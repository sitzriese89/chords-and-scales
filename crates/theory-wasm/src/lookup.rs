//! Reverse lookup and the scale finder (`theory::lookup`).
//!
//! The notes cross the boundary as pitch classes 0 … 11 and an optional bass pitch class. The
//! search runs over the current chord and scale catalogs (`chords.rs`, `scales.rs`), so user
//! chords and scales are found too. Results are plain objects, best first, with ids, spelled
//! note names (Unicode) and the numbers the ranking used; naming a chord (`Cmaj7/E`) is for
//! the symbol formatter. Bad input throws a JS `Error`.

use serde::Serialize;
use theory::lookup::{DEFAULT_CHORD_LIMIT, DEFAULT_SCALE_LIMIT};
use theory::{ChordMatch, Glyphs, NoteSet, ScaleMatch, ScaleSearch, find_scales, lookup_chords};
use wasm_bindgen::prelude::*;

use crate::notes::Accidentals;
use crate::records::{pitch_classes_arg, to_js, to_pitch_class};

#[wasm_bindgen(typescript_custom_section)]
const TS_TYPES: &str = r#"
/** A chord that fits the notes: a `lookupChords` result. */
export interface ChordLookupMatch {
  /** The catalog chord's id (`getChord` gives the rest). */
  chordId: string;
  /** The root, spelled by the sharp/flat preference, Unicode: `D♭`. */
  root: string;
  rootPitchClass: number;
  /** The bass of a slash chord (`E` in C/E); null when no bass was given or it is the root. */
  bass: string | null;
  bassPitchClass: number | null;
  /** The bass's degree in the chord (`3`, `♭7`); null with `bass`. */
  bassInterval: string | null;
  /** The chord tones that are not among the notes, as degree labels: `["5"]`, `["5", "9"]`. */
  omitted: string[];
  /** 100 for an exact fit with the root in the bass; less for a slash chord or a tone left out. */
  score: number;
}

/** A scale or mode on a root that fits the notes: a `findScales` result. */
export interface ScaleLookupMatch {
  /** The catalog scale's id (`getScale` gives the rest). */
  scaleId: string;
  /** The root, spelled by the sharp/flat preference, Unicode. */
  root: string;
  rootPitchClass: number;
  /** The input notes that are in the scale, ascending from the root. */
  matched: string[];
  /** The input notes that are not in the scale (only with `maxMissing` above 0). */
  unmatched: string[];
  /** How many scale tones are not among the notes: the ranking's measure. */
  extra: number;
}
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "readonly number[]")]
    pub type LookupPitchClasses;
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChordRecord<'a> {
    chord_id: &'a str,
    root: String,
    root_pitch_class: u8,
    bass: Option<String>,
    bass_pitch_class: Option<u8>,
    bass_interval: Option<String>,
    omitted: Vec<String>,
    score: u32,
}

impl<'a> From<&ChordMatch<'a>> for ChordRecord<'a> {
    fn from(m: &ChordMatch<'a>) -> Self {
        Self {
            chord_id: m.chord.id(),
            root: m.root.format(Glyphs::Unicode),
            root_pitch_class: m.root.pitch_class().value(),
            bass: m.bass.map(|bass| bass.format(Glyphs::Unicode)),
            bass_pitch_class: m.bass.map(|bass| bass.pitch_class().value()),
            bass_interval: m.bass_interval.map(|i| i.format(Glyphs::Unicode)),
            omitted: m
                .omitted
                .iter()
                .map(|interval| interval.format(Glyphs::Unicode))
                .collect(),
            score: m.score,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScaleRecord<'a> {
    scale_id: &'a str,
    root: String,
    root_pitch_class: u8,
    matched: Vec<String>,
    unmatched: Vec<String>,
    extra: usize,
}

impl<'a> From<&ScaleMatch<'a>> for ScaleRecord<'a> {
    fn from(m: &ScaleMatch<'a>) -> Self {
        let names = |notes: &[theory::NoteName]| {
            notes
                .iter()
                .map(|note| note.format(Glyphs::Unicode))
                .collect()
        };
        Self {
            scale_id: m.scale.id(),
            root: m.root.format(Glyphs::Unicode),
            root_pitch_class: m.root.pitch_class().value(),
            matched: names(&m.matched),
            unmatched: names(&m.unmatched),
            extra: m.extra,
        }
    }
}

/// The notes as the core takes them: pitch classes plus the bass, which is one of the notes.
fn note_set(pitch_classes: LookupPitchClasses, bass: Option<u32>) -> Result<NoteSet, JsError> {
    let pitch_classes = pitch_classes_arg(pitch_classes.into())?;
    let bass = bass.map(to_pitch_class).transpose()?;
    Ok(NoteSet::new(pitch_classes, bass))
}

fn limit_arg(limit: Option<u32>, default: usize) -> usize {
    limit.map_or(default, |limit| limit as usize)
}

/// The chords that contain all of `pitchClasses` (0 … 11), best first: slash chords for a
/// `bass` that is not the root, and chords with the 5th (or an upper 9th or 11th) left out.
/// Fewer than two different notes give an empty list. `limit` defaults to 12. The root and
/// bass are spelled by `accidentals` (SPEC §4.1). Ranking: ADR-31.
#[wasm_bindgen(js_name = lookupChords, unchecked_return_type = "ChordLookupMatch[]")]
pub fn lookup_chords_js(
    pitch_classes: LookupPitchClasses,
    bass: Option<u32>,
    accidentals: Accidentals,
    limit: Option<u32>,
) -> Result<JsValue, JsError> {
    let notes = note_set(pitch_classes, bass)?;
    let accidentals = accidentals.try_into()?;
    let limit = limit_arg(limit, DEFAULT_CHORD_LIMIT);
    crate::chords::CATALOG.with_borrow(|catalog| {
        let found = lookup_chords(catalog, &notes, accidentals, limit);
        to_js(&found.iter().map(ChordRecord::from).collect::<Vec<_>>())
    })
}

/// The scales and modes, on any root, that contain all of `pitchClasses` (0 … 11), best
/// first: fewest extra scale tones, then a scale rooted on `bass`, then a root among the
/// notes. With `maxMissing` above 0 (default 0) scales that lack up to that many of the notes
/// are listed after those that have them all. `limit` defaults to 24. Ranking: ADR-31.
#[wasm_bindgen(js_name = findScales, unchecked_return_type = "ScaleLookupMatch[]")]
pub fn find_scales_js(
    pitch_classes: LookupPitchClasses,
    bass: Option<u32>,
    accidentals: Accidentals,
    limit: Option<u32>,
    max_missing: Option<u32>,
) -> Result<JsValue, JsError> {
    let notes = note_set(pitch_classes, bass)?;
    let accidentals = accidentals.try_into()?;
    let search = ScaleSearch {
        max_missing: max_missing.unwrap_or(0) as usize,
        limit: limit_arg(limit, DEFAULT_SCALE_LIMIT),
    };
    crate::scales::CATALOG.with_borrow(|catalog| {
        let found = find_scales(catalog, &notes, accidentals, search);
        to_js(&found.iter().map(ScaleRecord::from).collect::<Vec<_>>())
    })
}
