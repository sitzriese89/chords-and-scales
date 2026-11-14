//! Note names, notes and intervals (`theory::notes`).
//!
//! Values cross the boundary as plain numbers and strings: pitch classes 0 … 11, MIDI
//! numbers 0 … 127, interval widths in semitones. Inputs accept ASCII and Unicode (`Db`,
//! `D♭`); outputs are Unicode, for display. Invalid input throws a JS `Error`.

use theory::{Glyphs, Interval, Note, NoteName, Spelling};
use wasm_bindgen::prelude::*;

use crate::records::to_pitch_class;

/// The global sharp/flat preference.
#[wasm_bindgen]
#[derive(Clone, Copy)]
pub enum Accidentals {
    Sharps = "sharps",
    Flats = "flats",
}

impl TryFrom<Accidentals> for theory::Accidentals {
    type Error = JsError;

    fn try_from(accidentals: Accidentals) -> Result<Self, JsError> {
        match accidentals {
            Accidentals::Sharps => Ok(Self::Sharps),
            Accidentals::Flats => Ok(Self::Flats),
            // Any other string from untyped JS.
            Accidentals::__Invalid => {
                Err(JsError::new("accidentals must be \"sharps\" or \"flats\""))
            }
        }
    }
}

/// The pitch class (0 = C … 11 = B) of a note name such as `C#`, `Db` or `E♭`.
#[wasm_bindgen(js_name = pitchClassOf)]
pub fn pitch_class_of(name: &str) -> Result<u8, JsError> {
    Ok(name.parse::<NoteName>()?.pitch_class().value())
}

/// A note name as displayed: `db` → `D♭`, `F##` → `F𝄪`. Keeps the spelling.
#[wasm_bindgen(js_name = formatNoteName)]
pub fn format_note_name(name: &str) -> Result<String, JsError> {
    Ok(name.parse::<NoteName>()?.format(Glyphs::Unicode))
}

/// The display name of `pitchClass` by the sharp/flat preference; the `root` note name, if
/// given, keeps its own spelling (SPEC §4.1).
#[wasm_bindgen(js_name = spellPitchClass)]
pub fn spell_pitch_class(
    pitch_class: u32,
    accidentals: Accidentals,
    root: Option<String>,
) -> Result<String, JsError> {
    let mut spelling = Spelling::new(accidentals.try_into()?);
    if let Some(root) = root {
        spelling = spelling.with_root(root.parse()?);
    }
    Ok(spelling
        .spell(to_pitch_class(pitch_class)?)
        .format(Glyphs::Unicode))
}

/// The MIDI number of a note with octave such as `E2`, `C#4` or `B♭-1` (C4 = 60).
#[wasm_bindgen(js_name = parseNote)]
pub fn parse_note(note: &str) -> Result<u8, JsError> {
    Ok(note.parse::<Note>()?.midi())
}

/// The display name of MIDI note `midi` with its octave, by the preference: `E2`, `C♯4`.
#[wasm_bindgen(js_name = formatNote)]
pub fn format_note(midi: u32, accidentals: Accidentals) -> Result<String, JsError> {
    let note = u8::try_from(midi)
        .ok()
        .and_then(Note::from_midi)
        .ok_or_else(|| JsError::new(&format!("{midi} is not a MIDI note (0 to 127)")))?;
    Ok(note.format(accidentals.try_into()?, Glyphs::Unicode))
}

#[wasm_bindgen(typescript_custom_section)]
const NOTE_PARTS: &str = r#"
/** A note as pitch class and octave: `{ pitchClass: 4, octave: 2 }` is E2 (C4 = middle C). */
export interface NoteParts {
  pitchClass: number;
  octave: number;
}
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "NoteParts")]
    pub type NotePartsValue;
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NotePartsRecord {
    pitch_class: u8,
    octave: i8,
}

/// The pitch class and octave of MIDI note `midi`: 40 → `{ pitchClass: 4, octave: 2 }`.
#[wasm_bindgen(js_name = noteParts)]
pub fn note_parts(midi: u32) -> Result<NotePartsValue, JsError> {
    let note = u8::try_from(midi)
        .ok()
        .and_then(Note::from_midi)
        .ok_or_else(|| JsError::new(&format!("{midi} is not a MIDI note (0 to 127)")))?;
    crate::records::to_js(&NotePartsRecord {
        pitch_class: note.pitch_class().value(),
        octave: note.octave(),
    })
}

/// The MIDI number of `pitchClass` in `octave`: `(4, 2)` → 40. Throws outside the MIDI range.
#[wasm_bindgen(js_name = noteFromParts)]
pub fn note_from_parts(pitch_class: u32, octave: i32) -> Result<u8, JsError> {
    let pitch_class = to_pitch_class(pitch_class)?;
    i8::try_from(octave)
        .ok()
        .and_then(|octave| Note::new(pitch_class, octave))
        .map(Note::midi)
        .ok_or_else(|| JsError::new(&format!("octave {octave} is outside the MIDI range")))
}

/// The width in semitones of an interval label such as `b3`, `#4` or `13`.
#[wasm_bindgen(js_name = intervalSemitones)]
pub fn interval_semitones(label: &str) -> Result<u8, JsError> {
    Ok(label.parse::<Interval>()?.semitones())
}

/// An interval label as displayed: `b3` → `♭3`. Keeps the label (`#4` stays `♯4`).
#[wasm_bindgen(js_name = formatInterval)]
pub fn format_interval(label: &str) -> Result<String, JsError> {
    Ok(label.parse::<Interval>()?.format(Glyphs::Unicode))
}

/// The default display label for an interval of `semitones`: `1 ♭2 2 ♭3 3 4 ♭5 5 ♭6 6 ♭7 7`
/// within an octave, then `8`, `♭9`, `9`, ….
#[wasm_bindgen(js_name = intervalLabel)]
pub fn interval_label(semitones: u32) -> Result<String, JsError> {
    u8::try_from(semitones)
        .ok()
        .and_then(Interval::from_semitones)
        .map(|interval| interval.format(Glyphs::Unicode))
        .ok_or_else(|| {
            JsError::new(&format!(
                "{semitones} semitones is not an interval (0 to 127)"
            ))
        })
}
