//! Reverse lookup: from notes to chords and scales (SPEC §5.3, §5.4, ADR-31).
//!
//! The input is a [`NoteSet`], a set of pitch classes with an optional bass note. The
//! results are structured, not display strings: [`lookup_chords`] gives the root, the catalog
//! chord, the bass for a slash chord, what was left out and a score; [`find_scales`] gives the
//! scale or mode on a root and which input notes are and aren't in it. Naming a chord
//! (`Cmaj7/E`) is the symbol formatter's job (M2.2). Both searches run over whatever catalog
//! they are given, so user chords and scales merged into it are searched too.

mod chords;
mod scales;

pub(crate) use chords::may_omit;
pub use chords::{BASE_SCORE, ChordMatch, DEFAULT_CHORD_LIMIT, SLASH_PENALTY, lookup_chords};
pub use scales::{DEFAULT_SCALE_LIMIT, ScaleMatch, ScaleSearch, find_scales};

use crate::notes::PitchClass;

#[cfg(test)]
mod tests;

/// Pitch classes with an optional bass note: what the user has clicked.
///
/// The bass is one of the notes: giving a bass adds it to the set. Order and repeats don't
/// matter.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct NoteSet {
    mask: u16,
    bass: Option<PitchClass>,
}

impl NoteSet {
    /// The set of `pitch_classes` plus `bass`, if any.
    pub fn new(
        pitch_classes: impl IntoIterator<Item = PitchClass>,
        bass: Option<PitchClass>,
    ) -> Self {
        let mut mask = pitch_classes.into_iter().fold(0, |mask, pc| mask | bit(pc));
        if let Some(bass) = bass {
            mask |= bit(bass);
        }
        Self { mask, bass }
    }

    /// The bass note, if one was given.
    pub fn bass(&self) -> Option<PitchClass> {
        self.bass
    }

    /// How many different pitch classes there are.
    pub fn len(&self) -> usize {
        self.mask.count_ones() as usize
    }

    pub fn is_empty(&self) -> bool {
        self.mask == 0
    }

    pub fn contains(&self, pitch_class: PitchClass) -> bool {
        self.mask & bit(pitch_class) != 0
    }

    /// The pitch classes, ascending from C.
    pub fn pitch_classes(&self) -> impl Iterator<Item = PitchClass> + '_ {
        (0..12u8)
            .filter_map(PitchClass::new)
            .filter(|&pc| self.contains(pc))
    }

    pub(crate) fn mask(&self) -> u16 {
        self.mask
    }
}

pub(crate) fn bit(pitch_class: PitchClass) -> u16 {
    1 << pitch_class.value()
}
