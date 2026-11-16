use std::cmp::Reverse;

use super::{NoteSet, bit};
use crate::chords::{Chord, ChordCatalog};
use crate::notes::{Accidentals, Interval, NoteName, PitchClass, Spelling};

/// How many chords callers get when they have no preference.
pub const DEFAULT_CHORD_LIMIT: usize = 12;

/// The score of a chord that fits the notes exactly, root in the bass (or no bass given).
pub const BASE_SCORE: u32 = 100;
/// Taken off for a slash chord: the bass is a chord tone but not the root.
pub const SLASH_PENALTY: u32 = 5;
/// Taken off for a left-out perfect 5th.
const OMIT_FIFTH_PENALTY: u32 = 8;
/// Taken off for a left-out natural 9th or 11th of an extended chord.
const OMIT_EXTENSION_PENALTY: u32 = 12;

/// A catalog chord that fits the notes: a [`lookup_chords`] result.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChordMatch<'a> {
    pub chord: &'a Chord,
    /// The root, spelled by the sharp/flat preference (ADR-6).
    pub root: NoteName,
    /// The bass of a slash chord, spelled the same way; `None` when no bass was given or it is
    /// the root.
    pub bass: Option<NoteName>,
    /// The bass's interval in the chord (`3` for a first inversion); `None` with `bass`.
    pub bass_interval: Option<Interval>,
    /// The chord tones that are not in the notes: the 5th, or an upper 9th or 11th.
    pub omitted: Vec<Interval>,
    /// Higher is better, at most [`BASE_SCORE`].
    pub score: u32,
}

/// The catalog chords that contain all of `notes`, best first, at most `limit`.
///
/// A chord on a root matches when every note is one of its tones and every tone that is not a
/// note may be left out: the perfect 5th, and in a chord with an 11th or 13th the natural 9th
/// (and, with a 13th, the natural 11th). The root is never left out, and the bass must be a
/// chord tone: a bass that is not the root gives a slash chord. Fewer than two notes give
/// nothing. The ranking rules are in ADR-31.
pub fn lookup_chords<'a>(
    catalog: &'a ChordCatalog,
    notes: &NoteSet,
    accidentals: Accidentals,
    limit: usize,
) -> Vec<ChordMatch<'a>> {
    if notes.len() < 2 {
        return Vec::new();
    }
    let spelling = Spelling::new(accidentals);
    let mut found: Vec<(ChordMatch<'a>, usize)> = Vec::new();
    for (index, chord) in catalog.chords().iter().enumerate() {
        for root in notes.pitch_classes() {
            if let Some(found_match) = fit(chord, root, notes, spelling) {
                found.push((found_match, index));
            }
        }
    }
    found.sort_by_key(|(m, index)| (Reverse(m.score), *index, m.root.pitch_class()));
    found.into_iter().map(|(m, _)| m).take(limit).collect()
}

fn fit<'a>(
    chord: &'a Chord,
    root: PitchClass,
    notes: &NoteSet,
    spelling: Spelling,
) -> Option<ChordMatch<'a>> {
    let intervals = chord.formula().intervals();
    let mut tones = 0u16;
    let mut omitted = Vec::new();
    let mut penalty = 0;
    for &interval in intervals {
        let pc = root.up(interval);
        tones |= bit(pc);
        if !notes.contains(pc) {
            penalty += omission_penalty(interval, intervals)?;
            omitted.push(interval);
        }
    }
    if notes.mask() & !tones != 0 {
        return None;
    }
    let (bass, bass_interval) = match notes.bass().filter(|&bass| bass != root) {
        Some(bass) => {
            penalty += SLASH_PENALTY;
            let interval = intervals.iter().copied().find(|&i| root.up(i) == bass)?;
            (Some(spelling.spell(bass)), Some(interval))
        }
        None => (None, None),
    };
    Some(ChordMatch {
        chord,
        root: spelling.spell(root),
        bass,
        bass_interval,
        omitted,
        score: BASE_SCORE - penalty,
    })
}

/// Whether `interval` may be left out of a chord with these `intervals`: the perfect 5th, a
/// natural 9th below an 11th or 13th, a natural 11th below a 13th (ADR-31). The voicing
/// generator leaves out the same tones (ADR-33).
pub(crate) fn may_omit(interval: Interval, intervals: &[Interval]) -> bool {
    omission_penalty(interval, intervals).is_some()
}

/// What leaving `interval` out of a chord with these `intervals` costs; `None` if it may not
/// be left out (the root, the 3rd, the 7th, altered tones, ...).
fn omission_penalty(interval: Interval, intervals: &[Interval]) -> Option<u32> {
    let has = |semitones: &[u8]| intervals.iter().any(|i| semitones.contains(&i.semitones()));
    match interval.semitones() {
        // 5 itself, not b5 (6) or #5 (8).
        7 => Some(OMIT_FIFTH_PENALTY),
        // The natural 9th, in a chord that goes on to an 11th or 13th.
        14 if has(&[17, 18, 20, 21]) => Some(OMIT_EXTENSION_PENALTY),
        // The natural 11th, in a chord that goes on to a 13th.
        17 if has(&[20, 21]) => Some(OMIT_EXTENSION_PENALTY),
        _ => None,
    }
}
