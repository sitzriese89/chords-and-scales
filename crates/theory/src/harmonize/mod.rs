//! Harmonize a scale: the chord on every degree (SPEC §5.5, ADR-30).
//!
//! Each degree gets the chord made by stacking thirds on it from the scale's own notes, as
//! triads or seventh chords. The chord is named by finding the stacked intervals in the chord
//! catalog (user chords included) and gets a Roman numeral. Where no stack of thirds forms,
//! the degree has no chord. The result is structured data; chord symbols are written by the
//! symbol formatter from the chord id.
//!
//! # Stacking rule
//!
//! Starting on a degree, each next chord tone is a scale tone a third above the previous one
//! (3 or 4 semitones), found two scale steps up (every other tone, the usual stacking) or, if
//! that is not a third, one step up. This gives the textbook tables for the seven-note scales
//! and finds the thirds that are there in the others. The stack must stay inside the octave,
//! so no tone lands on or past the root's octave.

mod roman;

pub use roman::{NumeralMark, NumeralSeventh, RomanNumeral};

use crate::chords::{ChordCatalog, ChordNote};
use crate::notes::{Accidental, Accidentals, Interval, NoteName};
use crate::scales::{Scale, ScaleNote};

/// How many tones a chord is stacked from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stacking {
    /// Root, third and fifth.
    Triads,
    /// Root, third, fifth and seventh.
    Sevenths,
}

impl Stacking {
    fn tones(self) -> usize {
        match self {
            Self::Triads => 3,
            Self::Sevenths => 4,
        }
    }
}

/// The chord on one degree of a scale.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HarmonizedChord {
    /// The catalog chord with exactly these intervals, or `None` if the catalog has none
    /// (a user chord may have replaced a built-in one). The last such chord in the catalog
    /// wins, so a user chord beats a built-in one.
    pub chord_id: Option<String>,
    /// The stacked tones, root first, in the scale's spelling. Each interval is its label
    /// from the chord's root (`b3`, `5`, `b7`).
    pub tones: Vec<ChordNote>,
    pub numeral: RomanNumeral,
}

/// One degree of a harmonized scale.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HarmonizedDegree {
    /// The place in the scale, counting from 1.
    pub degree: u8,
    /// The scale note the chord is built on: its spelling and its interval from the scale root.
    pub root: ScaleNote,
    /// `None` where no stack of thirds forms on this degree.
    pub chord: Option<HarmonizedChord>,
}

/// Harmonizes `scale` on `root`: one entry per scale degree, in scale order. Notes are spelled
/// as [`Scale::notes`] does (ADR-6); chords are named from `chords`.
pub fn harmonize(
    scale: &Scale,
    root: NoteName,
    accidentals: Accidentals,
    stacking: Stacking,
    chords: &ChordCatalog,
) -> Vec<HarmonizedDegree> {
    let notes = scale.notes(root, accidentals);
    let semitones: Vec<u8> = notes.iter().map(|note| note.interval.semitones()).collect();
    let heptatonic = notes.len() == 7;
    (0..notes.len())
        .map(|index| {
            let place = u8::try_from(index + 1).unwrap_or(u8::MAX);
            let chord = stack_thirds(&semitones, index, stacking.tones()).and_then(|stack| {
                let (accidental, number) = if heptatonic {
                    (0, place)
                } else {
                    let interval = notes[index].interval;
                    (interval.accidental().semitones(), interval.degree())
                };
                let offsets: Vec<u8> = stack
                    .iter()
                    .map(|&i| (semitones[i] + 12 - semitones[index]) % 12)
                    .collect();
                let numeral = roman::numeral(
                    accidental,
                    number,
                    offsets[1],
                    offsets[2],
                    offsets.get(3).copied(),
                )?;
                let tones = stack
                    .iter()
                    .zip(&offsets)
                    .map(|(&i, &offset)| ChordNote {
                        interval: chord_interval(offset),
                        name: notes[i].name,
                    })
                    .collect();
                Some(HarmonizedChord {
                    chord_id: name_chord(chords, &offsets),
                    tones,
                    numeral,
                })
            });
            HarmonizedDegree {
                degree: place,
                root: notes[index],
                chord,
            }
        })
        .collect()
}

/// The indices into the scale of `count` tones stacked in thirds from `start`, or `None` if
/// the stack can't be completed.
fn stack_thirds(semitones: &[u8], start: usize, count: usize) -> Option<Vec<usize>> {
    let n = semitones.len();
    let mut stack = vec![start];
    let mut total = 0u8;
    while stack.len() < count {
        let from = *stack.last()?;
        let (next, step) = [2, 1].into_iter().find_map(|steps| {
            let next = (from + steps) % n;
            let step = (semitones[next] + 12 - semitones[from]) % 12;
            (next != from && matches!(step, 3 | 4) && total + step < 12).then_some((next, step))
        })?;
        total += step;
        stack.push(next);
    }
    Some(stack)
}

/// The label of a chord tone `offset` semitones above its root: `b3`, `5`, `#5`, `bb7`.
fn chord_interval(offset: u8) -> Interval {
    let (degree, accidental) = match offset {
        3 => (3, Accidental::Flat),
        4 => (3, Accidental::Natural),
        6 => (5, Accidental::Flat),
        7 => (5, Accidental::Natural),
        8 => (5, Accidental::Sharp),
        9 => (7, Accidental::DoubleFlat),
        10 => (7, Accidental::Flat),
        11 => (7, Accidental::Natural),
        _ => (1, Accidental::Natural),
    };
    Interval::new(degree, accidental).expect("a label within an octave")
}

/// The id of the catalog chord whose intervals are `offsets` semitones (root first).
fn name_chord(chords: &ChordCatalog, offsets: &[u8]) -> Option<String> {
    chords
        .chords()
        .iter()
        .rev()
        .find(|chord| chord.formula().semitones().eq(offsets.iter().copied()))
        .map(|chord| chord.id().to_owned())
}

#[cfg(test)]
mod tests;
