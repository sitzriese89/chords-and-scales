//! The records and argument helpers shared by the tuning and position bindings
//! (`fretboard.rs`, `positions.rs`): a tuning crosses the boundary as a `Tuning` object and a
//! position as a `NotePosition` (TS types in `fretboard.rs`).

use serde::{Deserialize, Serialize};
use theory::{Glyphs, InstrumentKind, Note, PitchClass, Position, Tuning};
use wasm_bindgen::prelude::*;

/// A `Tuning` object: notes as MIDI numbers, lowest string first.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct TuningRecord {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub notes: Vec<u8>,
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

impl TuningRecord {
    /// The tuning, validated by the core as a tuning from a file is, or why it is invalid.
    pub fn into_tuning(self) -> Result<Tuning, String> {
        let kind = parse_kind(&self.kind)?;
        let notes = self
            .notes
            .iter()
            .map(|&midi| {
                Note::from_midi(midi).ok_or_else(|| format!("{midi} is not a MIDI note (0 to 127)"))
            })
            .collect::<Result<_, _>>()?;
        Tuning::new(self.id, self.name, kind, notes).map_err(|err| err.to_string())
    }
}

fn parse_kind(kind: &str) -> Result<InstrumentKind, String> {
    match kind {
        "guitar" => Ok(InstrumentKind::Guitar),
        "bass" => Ok(InstrumentKind::Bass),
        other => Err(format!("kind {other:?} must be \"guitar\" or \"bass\"")),
    }
}

/// A `NotePosition` object.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PositionRecord {
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

/// `"guitar"` or `"bass"`.
pub(crate) fn kind_arg(kind: &str) -> Result<InstrumentKind, JsError> {
    parse_kind(kind).map_err(|err| JsError::new(&err))
}

/// A `Tuning` object from JS, validated by the core.
pub(crate) fn tuning_arg(tuning: JsValue) -> Result<Tuning, JsError> {
    let record: TuningRecord = serde_wasm_bindgen::from_value(tuning)
        .map_err(|err| JsError::new(&format!("not a tuning: {err}")))?;
    record.into_tuning().map_err(|err| JsError::new(&err))
}

/// A list of pitch classes 0 … 11 from JS.
pub(crate) fn pitch_classes_arg(pitch_classes: JsValue) -> Result<Vec<PitchClass>, JsError> {
    let values: Vec<u32> = serde_wasm_bindgen::from_value(pitch_classes)
        .map_err(|err| JsError::new(&format!("not a list of pitch classes: {err}")))?;
    values.into_iter().map(to_pitch_class).collect()
}

pub(crate) fn to_pitch_class(value: u32) -> Result<PitchClass, JsError> {
    u8::try_from(value)
        .ok()
        .and_then(PitchClass::new)
        .ok_or_else(|| JsError::new(&format!("{value} is not a pitch class (0 to 11)")))
}

/// A fret number or count from JS, which must fit a `u8`.
pub(crate) fn small(value: u32, what: &str) -> Result<u8, JsError> {
    u8::try_from(value).map_err(|_| JsError::new(&format!("{value} {what} is out of range")))
}

/// `value` as a plain JS object of the TS type `J`.
pub(crate) fn to_js<T: Serialize, J: JsCast>(value: &T) -> Result<J, JsError> {
    crate::user_files::to_js(value).map(JsCast::unchecked_into)
}
