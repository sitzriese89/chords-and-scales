//! The voicing generator: playable shapes of a chord on any tuning (SPEC §5.6, ADR-8, ADR-34).
//!
//! There is no shape library. [`voicings`] searches every way of playing a chord with one note
//! (or none) per string, for any tuning of 4 to 9 strings, keeps the shapes that satisfy the
//! [`VoicingOptions`] and a hand's limits, and ranks them. The rules, in short (ADR-34):
//!
//! - **Notes.** Every played note is a chord tone. The voicing contains every tone except those
//!   players leave out (the rule reverse lookup uses, ADR-31): the perfect 5th, a natural 9th
//!   below an 11th or 13th, a natural 11th below a 13th. So the root and the 3rd (or, in a sus
//!   chord, the 2nd or 4th that replaces it), the 7th and altered tones are always there. At
//!   least two different notes sound (a power chord keeps its 5th) on at least three strings
//!   (two for a power chord).
//! - **Hand.** The fretted notes (above the capo) lie within `max_span` frets, and take at most
//!   [`MAX_FINGERS`] fingers, where a barre across the lowest fretted fret counts as one: it
//!   covers the strings from the lowest to the highest one fretted there, and every string
//!   under it is fretted.
//! - **Options.** Open strings (the capo fret with a capo), muted strings and inversions (a
//!   chord tone other than the root as the lowest-sounding note) can each be forbidden.
//! - **Ranking.** A score, higher first: [`STRING_WEIGHT`] per played string, minus
//!   [`SPAN_WEIGHT`] per fret past the first that the shape covers on a chord diagram (from the
//!   lowest fretted note to the highest, or from the nut when an open string sounds),
//!   [`POSITION_WEIGHT`] per fret its lowest fretted note sits above the capo,
//!   [`INNER_MUTE_PENALTY`] per muted string between played ones, [`INVERSION_PENALTY`] for an
//!   inversion and [`BARRE_PENALTY`] for a barre. Ties go to the lower shape, then by frets
//!   from the lowest string. The search skips branches that can't reach the list, so it stays
//!   fast on nine strings.
//!
//! Frets are absolute, as on the fretboard (ADR-18): a capo renumbers nothing.

use std::cmp::Reverse;
use std::collections::BinaryHeap;
use std::fmt;

use crate::chords::Chord;
use crate::fretboard::{FretboardError, check_neck};
use crate::lookup::may_omit;
use crate::notes::{Interval, Note, PitchClass};
use crate::tuning::Tuning;

#[cfg(test)]
mod tests;

/// The widest shape when the user hasn't chosen: four frets, one finger per fret.
pub const DEFAULT_MAX_SPAN: u8 = 4;
/// The widest accepted `max_span`.
pub const MAX_SPAN: u8 = 6;
/// How many voicings callers get when they have no preference.
pub const DEFAULT_VOICING_LIMIT: usize = 50;
/// Fingers of the fretting hand; a barre takes one.
pub const MAX_FINGERS: usize = 4;

/// Score per played string.
pub const STRING_WEIGHT: i32 = 8;
/// Taken off per fret past the first that the shape covers on a diagram (from the nut when an
/// open string sounds).
pub const SPAN_WEIGHT: i32 = 8;
/// Taken off per fret between the capo (or the nut) and the lowest fretted note.
pub const POSITION_WEIGHT: i32 = 2;
/// Taken off per muted string with played strings on both sides.
pub const INNER_MUTE_PENALTY: i32 = 5;
/// Taken off when the lowest note is not the root.
pub const INVERSION_PENALTY: i32 = 5;
/// Taken off for a shape that needs a barre.
pub const BARRE_PENALTY: i32 = 2;

/// What the generator may do; [`Default`] gives the defaults of SPEC §5.6.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VoicingOptions {
    /// The most frets the fretted notes may cover, lowest to highest inclusive: 1 …
    /// [`MAX_SPAN`]. Open strings don't count. Default 4.
    pub max_span: u8,
    /// Whether open strings (the capo fret, with a capo) may sound. Default true.
    pub open_strings: bool,
    /// Whether a string may be left unplayed. Default true; false plays every string.
    pub muted_strings: bool,
    /// Whether the lowest note may be a chord tone other than the root. Default false.
    pub inversions: bool,
    /// The most voicings returned, best first. Default [`DEFAULT_VOICING_LIMIT`].
    pub limit: usize,
}

impl Default for VoicingOptions {
    fn default() -> Self {
        Self {
            max_span: DEFAULT_MAX_SPAN,
            open_strings: true,
            muted_strings: true,
            inversions: false,
            limit: DEFAULT_VOICING_LIMIT,
        }
    }
}

/// One played string of a voicing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct VoicedNote {
    /// The fretboard string number: 1 = the highest string (ADR-18).
    pub string: u8,
    /// The absolute fret: 0 = open, also with a capo (where the capo fret is the open string).
    pub fret: u8,
    /// The sounding note.
    pub note: Note,
    /// The chord tone it plays, labelled as in the chord (`9`, `#11`, not `2`, `#4`).
    pub interval: Interval,
}

/// A barre: one finger across several strings on one fret.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Barre {
    pub fret: u8,
    /// The lowest string under the barre, as a fretboard number (the larger one).
    pub lowest_string: u8,
    /// The highest string under the barre, as a fretboard number (the smaller one).
    pub highest_string: u8,
}

/// A playable shape of a chord: a [`voicings`] result.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Voicing {
    /// One entry per string, **lowest string first** (as a tuning lists them, and as shapes are
    /// written: `x32010`); `None` is a muted string.
    pub strings: Vec<Option<VoicedNote>>,
    /// The chord tone of the lowest-sounding note: `1`, or another tone for an inversion.
    pub bass: Interval,
    /// The chord tones the voicing leaves out, in formula order.
    pub omitted: Vec<Interval>,
    /// The lowest fretted fret (above the capo); `None` when only open strings sound.
    pub lowest_fret: Option<u8>,
    /// The frets the fretted notes cover, lowest to highest inclusive; 0 with none fretted.
    pub span: u8,
    /// How many strings sound.
    pub played: usize,
    /// The barre the shape needs, if it has more fretted notes than fingers.
    pub barre: Option<Barre>,
    /// The ranking score: higher is better (see the module docs).
    pub score: i32,
}

impl Voicing {
    /// The frets, lowest string first, `None` for a muted string.
    pub fn frets(&self) -> Vec<Option<u8>> {
        self.strings
            .iter()
            .map(|string| string.map(|note| note.fret))
            .collect()
    }

    /// The played notes, lowest string first.
    pub fn notes(&self) -> impl Iterator<Item = &VoicedNote> {
        self.strings.iter().flatten()
    }
}

/// Why no voicings could be searched for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum VoicingError {
    /// A fret count or capo the fretboard doesn't accept.
    Fretboard(FretboardError),
    /// A `max_span` of 0 or above [`MAX_SPAN`].
    Span(u8),
}

impl fmt::Display for VoicingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Fretboard(error) => error.fmt(f),
            Self::Span(span) => write!(
                f,
                "a fret span of {span}; the span is 1 to {MAX_SPAN} frets"
            ),
        }
    }
}

impl std::error::Error for VoicingError {}

impl From<FretboardError> for VoicingError {
    fn from(error: FretboardError) -> Self {
        Self::Fretboard(error)
    }
}

/// The best voicings of `chord` on `root`, at most `options.limit`, best first, on a neck of
/// `frets` frets (12 … 27) in `tuning` with a capo on fret `capo` (0 = none, below `frets`).
///
/// The rules and the ranking are in the module docs and ADR-34. A chord that needs more notes
/// than the tuning has strings, or that no shape can reach, has no voicings: the result is
/// empty, not an error.
pub fn voicings(
    tuning: &Tuning,
    frets: u8,
    capo: u8,
    chord: &Chord,
    root: PitchClass,
    options: &VoicingOptions,
) -> Result<Vec<Voicing>, VoicingError> {
    check_neck(frets, capo)?;
    if !(1..=MAX_SPAN).contains(&options.max_span) {
        return Err(VoicingError::Span(options.max_span));
    }
    Ok(Search::new(tuning, frets, capo, chord, root, options).run())
}

/// A muted string in a fret list.
const MUTED: u8 = u8::MAX;

type Frets = [u8; Tuning::MAX_STRINGS];

/// A shape kept while searching, ordered best first: the heap's top is the worst one.
#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
struct Candidate {
    score: Reverse<i32>,
    lowest_fret: u8,
    frets: Frets,
}

/// The `limit` best shapes so far.
struct Best {
    heap: BinaryHeap<Candidate>,
    limit: usize,
}

impl Best {
    /// The score of the worst shape kept once the list is full: a shape that scores less can't
    /// get in. `None` while there is room.
    fn floor(&self) -> Option<i32> {
        if self.heap.len() < self.limit {
            return None;
        }
        self.heap.peek().map(|worst| worst.score.0)
    }

    fn offer(&mut self, candidate: Candidate) {
        if self.heap.len() < self.limit {
            self.heap.push(candidate);
        } else if self.heap.peek().is_some_and(|worst| candidate < *worst) {
            self.heap.pop();
            self.heap.push(candidate);
        }
    }

    /// Whether a shape that can score at most `ceiling` is worth looking for.
    fn wants(&self, ceiling: i32) -> bool {
        self.floor().is_none_or(|floor| ceiling >= floor)
    }
}

/// What a shape adds up to, when it is a valid voicing.
struct Shape {
    score: i32,
    lowest_fret: Option<u8>,
    span: u8,
    played: usize,
    bass: PitchClass,
    covered: u16,
    barre: Option<Barre>,
}

/// The state of a depth-first walk over the strings, lowest first.
#[derive(Clone, Copy)]
struct Walk {
    /// Notes fretted above the window's lowest fret: each needs a finger of its own.
    above: usize,
    /// The pitch classes played so far, as bits.
    covered: u16,
    played: usize,
    /// The highest fretted fret so far; 0 for none.
    high: u8,
    /// Whether an open string sounds.
    open: bool,
    /// Muted strings with played strings on both sides, so far.
    inner: usize,
    /// Muted strings since the last played one, once one has been played.
    pending: usize,
}

struct Search<'a> {
    open: Vec<Note>,
    frets: u8,
    capo: u8,
    chord: &'a Chord,
    root: PitchClass,
    options: &'a VoicingOptions,
    /// The index in the chord's formula of each pitch class that is a chord tone.
    tone: [Option<usize>; 12],
    /// The tones the voicing must contain, as bits.
    required: u16,
    min_played: usize,
}

fn bit(pitch_class: PitchClass) -> u16 {
    1 << pitch_class.value()
}

/// The frets a shape covers on a chord diagram: from the lowest fretted note to the highest,
/// or from the nut (the capo) when an open string sounds; 0 with nothing fretted. The ranking
/// uses it, so open strings ringing far below the hand cost something.
fn footprint(capo: u8, low: u8, high: u8, open: bool) -> u8 {
    if open { high - capo } else { high - low + 1 }
}

/// What the ranking looks at.
#[derive(Default)]
struct Measures {
    played: usize,
    /// See [`footprint`].
    footprint: u8,
    /// Frets from the capo (or the nut) to the lowest fretted note.
    position: u8,
    /// Muted strings with played strings on both sides.
    inner_mutes: usize,
    inversion: bool,
    barre: bool,
}

impl Measures {
    /// Higher is better. Every term but the first only takes off, so a shape's score can't
    /// exceed what its played strings, position and stretch so far allow: the search's bound.
    fn score(&self) -> i32 {
        let count = |n: usize| i32::try_from(n).expect("at most 9 strings");
        let flag = |on: bool, penalty: i32| if on { penalty } else { 0 };
        STRING_WEIGHT * count(self.played)
            - SPAN_WEIGHT * i32::from(self.footprint.saturating_sub(1))
            - POSITION_WEIGHT * i32::from(self.position)
            - INNER_MUTE_PENALTY * count(self.inner_mutes)
            - flag(self.inversion, INVERSION_PENALTY)
            - flag(self.barre, BARRE_PENALTY)
    }
}

impl<'a> Search<'a> {
    fn new(
        tuning: &Tuning,
        frets: u8,
        capo: u8,
        chord: &'a Chord,
        root: PitchClass,
        options: &'a VoicingOptions,
    ) -> Self {
        let intervals = chord.formula().intervals();
        let mut tone = [None; 12];
        let mut required = 0;
        for (index, &interval) in intervals.iter().enumerate() {
            let pc = root.up(interval);
            tone[usize::from(pc.value())] = Some(index);
            if !may_omit(interval, intervals) {
                required |= bit(pc);
            }
        }
        Self {
            open: tuning.notes().to_vec(),
            frets,
            capo,
            chord,
            root,
            options,
            tone,
            required,
            min_played: intervals.len().min(3),
        }
    }

    /// Searches the shapes with only open strings, then those whose lowest fretted note is on
    /// each fret from the capo up, and keeps the best.
    fn run(&self) -> Vec<Voicing> {
        if self.options.limit == 0 {
            return Vec::new();
        }
        let mut best = Best {
            heap: BinaryHeap::new(),
            limit: self.options.limit,
        };
        self.window(None, &mut best);
        for low in self.capo + 1..=self.frets {
            // Every string played, no stretch: the most a shape this high can score.
            let ceiling = Measures {
                played: self.open.len(),
                position: low - self.capo,
                ..Measures::default()
            }
            .score();
            if !best.wants(ceiling) {
                break;
            }
            self.window(Some(low), &mut best);
        }
        let mut found = best.heap.into_vec();
        found.sort_unstable();
        found
            .iter()
            .map(|candidate| self.voicing(&candidate.frets[..self.open.len()]))
            .collect()
    }

    fn note(&self, string: usize, fret: u8) -> Note {
        self.open[string]
            .transpose(i32::from(fret))
            .expect("open strings up to C6 plus 27 frets stay within MIDI")
    }

    fn pitch_class(&self, string: usize, fret: u8) -> PitchClass {
        self.note(string, fret).pitch_class()
    }

    /// Every valid shape whose lowest fretted fret is `low` (`None`: open strings only),
    /// offered to `best`.
    fn window(&self, low: Option<u8>, best: &mut Best) {
        let fretted = low.map(|low| low..=(low + (self.options.max_span - 1)).min(self.frets));
        let open = self.options.open_strings.then_some(self.capo);
        let choices: Vec<Vec<u8>> = (0..self.open.len())
            .map(|string| {
                let muted = self.options.muted_strings.then_some(MUTED);
                let notes = open
                    .into_iter()
                    .chain(fretted.clone().into_iter().flatten())
                    .filter(|&fret| {
                        let pc = self.pitch_class(string, fret);
                        self.tone[usize::from(pc.value())].is_some()
                    });
                muted.into_iter().chain(notes).collect()
            })
            .collect();
        let start = Walk {
            above: 0,
            covered: 0,
            played: 0,
            high: 0,
            open: false,
            inner: 0,
            pending: 0,
        };
        let mut shape = [MUTED; Tuning::MAX_STRINGS];
        self.walk(0, start, low, &choices, &mut shape, best);
    }

    fn walk(
        &self,
        string: usize,
        walk: Walk,
        low: Option<u8>,
        choices: &[Vec<u8>],
        shape: &mut Frets,
        best: &mut Best,
    ) {
        let strings = self.open.len();
        let left = strings - string;
        let missing = (self.required & !walk.covered).count_ones() as usize;
        if missing > left || walk.played + left < self.min_played {
            return;
        }
        // The most this branch can still score: every string left played, no more stretch.
        let (position, reach) = match low {
            Some(low) => (
                low - self.capo,
                footprint(self.capo, low, walk.high.max(low), walk.open),
            ),
            None => (0, 0),
        };
        let ceiling = Measures {
            played: walk.played + left,
            footprint: reach,
            position,
            inner_mutes: walk.inner,
            ..Measures::default()
        };
        if !best.wants(ceiling.score()) {
            return;
        }
        if string == strings {
            self.keep(&shape[..strings], low, best);
            return;
        }
        for &fret in &choices[string] {
            shape[string] = fret;
            let next = if fret == MUTED {
                Walk {
                    pending: walk.pending + usize::from(walk.played > 0),
                    ..walk
                }
            } else {
                let above = walk.above + usize::from(low.is_some_and(|low| fret > low));
                if above >= MAX_FINGERS {
                    continue;
                }
                Walk {
                    above,
                    covered: walk.covered | bit(self.pitch_class(string, fret)),
                    played: walk.played + 1,
                    high: if fret > self.capo {
                        walk.high.max(fret)
                    } else {
                        walk.high
                    },
                    open: walk.open || fret == self.capo,
                    inner: walk.inner + walk.pending,
                    pending: 0,
                }
            };
            self.walk(string + 1, next, low, choices, shape, best);
        }
        shape[string] = MUTED;
    }

    fn keep(&self, frets: &[u8], low: Option<u8>, best: &mut Best) {
        let Some(shape) = self.shape(frets) else {
            return;
        };
        if shape.lowest_fret != low {
            return;
        }
        let mut all = [MUTED; Tuning::MAX_STRINGS];
        all[..frets.len()].copy_from_slice(frets);
        best.offer(Candidate {
            score: Reverse(shape.score),
            lowest_fret: shape.lowest_fret.unwrap_or(self.capo),
            frets: all,
        });
    }

    /// The shape's measures if `frets` (lowest string first, [`MUTED`] for a muted string) is
    /// a valid voicing; every played fret is assumed to be a chord tone on the neck.
    fn shape(&self, frets: &[u8]) -> Option<Shape> {
        let mut played = 0;
        let mut covered = 0;
        let mut bass: Option<Note> = None;
        let mut fretted = 0;
        let mut low = u8::MAX;
        let mut high = 0;
        let mut open = false;
        for (string, &fret) in frets.iter().enumerate() {
            if fret == MUTED {
                continue;
            }
            let note = self.note(string, fret);
            played += 1;
            covered |= bit(note.pitch_class());
            bass = Some(bass.map_or(note, |bass| bass.min(note)));
            if fret > self.capo {
                fretted += 1;
                low = low.min(fret);
                high = high.max(fret);
            } else {
                open = true;
            }
        }
        if played < self.min_played
            || covered & self.required != self.required
            || covered.count_ones() < 2
        {
            return None;
        }
        let bass = bass?.pitch_class();
        let inversion = bass != self.root;
        if inversion && !self.options.inversions {
            return None;
        }
        let lowest_fret = (fretted > 0).then_some(low);
        let span = lowest_fret.map_or(0, |low| high - low + 1);
        if span > self.options.max_span {
            return None;
        }
        let barre = match lowest_fret {
            Some(low) if fretted > MAX_FINGERS => Some(self.barre(frets, low)?),
            _ => None,
        };

        let first = frets.iter().position(|&fret| fret != MUTED)?;
        let last = frets.iter().rposition(|&fret| fret != MUTED)?;
        let inner = frets[first..=last]
            .iter()
            .filter(|&&fret| fret == MUTED)
            .count();
        let (position, reach) = match lowest_fret {
            Some(low) => (low - self.capo, footprint(self.capo, low, high, open)),
            None => (0, 0),
        };
        Some(Shape {
            score: Measures {
                played,
                footprint: reach,
                position,
                inner_mutes: inner,
                inversion,
                barre: barre.is_some(),
            }
            .score(),
            lowest_fret,
            span,
            played,
            bass,
            covered,
            barre,
        })
    }

    /// The barre on fret `low` that lets `frets` be fingered, if any: it runs from the lowest
    /// to the highest string fretted on `low`, every string under it is fretted, and it leaves
    /// a finger for each note above it.
    fn barre(&self, frets: &[u8], low: u8) -> Option<Barre> {
        let from = frets.iter().position(|&fret| fret == low)?;
        let to = frets.iter().rposition(|&fret| fret == low)?;
        let under = frets[from..=to]
            .iter()
            .all(|&fret| fret != MUTED && fret > self.capo);
        let above = frets
            .iter()
            .filter(|&&fret| fret != MUTED && fret > low)
            .count();
        if from == to || !under || above + 1 > MAX_FINGERS {
            return None;
        }
        Some(Barre {
            fret: low,
            lowest_string: self.string_number(from),
            highest_string: self.string_number(to),
        })
    }

    /// The fretboard number of the string at `index` (lowest string first): 1 is the highest.
    fn string_number(&self, index: usize) -> u8 {
        u8::try_from(self.open.len() - index).expect("at most 9 strings")
    }

    /// The voicing for a shape found by the search.
    fn voicing(&self, frets: &[u8]) -> Voicing {
        let shape = self.shape(frets).expect("found shapes are valid");
        let intervals = self.chord.formula().intervals();
        let interval = |pc: PitchClass| {
            let index = self.tone[usize::from(pc.value())].expect("a chord tone");
            intervals[index]
        };
        let strings = frets
            .iter()
            .enumerate()
            .map(|(index, &fret)| {
                (fret != MUTED).then(|| {
                    let note = self.note(index, fret);
                    VoicedNote {
                        string: self.string_number(index),
                        fret,
                        note,
                        interval: interval(note.pitch_class()),
                    }
                })
            })
            .collect();
        let omitted = intervals
            .iter()
            .copied()
            .filter(|&i| shape.covered & bit(self.root.up(i)) == 0)
            .collect();
        Voicing {
            strings,
            bass: interval(shape.bass),
            omitted,
            lowest_fret: shape.lowest_fret,
            span: shape.span,
            played: shape.played,
            barre: shape.barre,
            score: shape.score,
        }
    }
}
