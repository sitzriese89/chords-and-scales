use std::collections::HashSet;

use super::{NoteSet, bit};
use crate::notes::{Accidentals, NoteName, PitchClass, Spelling};
use crate::scales::{Scale, ScaleCatalog};

/// How many scales callers get when they have no preference.
pub const DEFAULT_SCALE_LIMIT: usize = 24;

/// What to search for in [`find_scales`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScaleSearch {
    /// How many of the notes a scale may lack: 0 finds scales that contain all of them.
    pub max_missing: usize,
    /// The most results to return.
    pub limit: usize,
}

impl Default for ScaleSearch {
    fn default() -> Self {
        Self {
            max_missing: 0,
            limit: DEFAULT_SCALE_LIMIT,
        }
    }
}

/// A scale or mode on a root that fits the notes: a [`find_scales`] result.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScaleMatch<'a> {
    pub scale: &'a Scale,
    /// The root, spelled by the sharp/flat preference (ADR-6).
    pub root: NoteName,
    /// The input notes that are in the scale, ascending from the root, spelled as the
    /// scale's notes are.
    pub matched: Vec<NoteName>,
    /// The input notes that are not in the scale, ascending from the root.
    pub unmatched: Vec<NoteName>,
    /// How many scale tones are not in the input: what the ranking is by.
    pub extra: usize,
}

struct Candidate {
    index: usize,
    root: PitchClass,
    set: u16,
    missing: u32,
    extra: u32,
}

/// The catalog scales and modes on every root that fit `notes`, best first.
///
/// With `max_missing` 0 these are the scales that contain all of the notes. They are ranked by
/// notes missing, then extra scale tones, then the bass (a scale rooted on it comes first),
/// then a root that is one of the notes, then catalog order. A scale that comes out the same
/// on several roots (whole-tone, diminished) is listed once, on its best root. The ranking
/// rules are in ADR-31.
pub fn find_scales<'a>(
    catalog: &'a ScaleCatalog,
    notes: &NoteSet,
    accidentals: Accidentals,
    search: ScaleSearch,
) -> Vec<ScaleMatch<'a>> {
    if notes.is_empty() {
        return Vec::new();
    }
    let mut candidates = Vec::new();
    for (index, scale) in catalog.scales().iter().enumerate() {
        for root in (0..12u8).filter_map(PitchClass::new) {
            let set = scale
                .formula()
                .pitch_classes(root)
                .fold(0u16, |set, pc| set | bit(pc));
            let missing = (notes.mask() & !set).count_ones();
            if missing as usize > search.max_missing {
                continue;
            }
            candidates.push(Candidate {
                index,
                root,
                set,
                missing,
                extra: (set & !notes.mask()).count_ones(),
            });
        }
    }
    candidates.sort_by_key(|c| {
        (
            c.missing,
            c.extra,
            notes.bass() != Some(c.root),
            !notes.contains(c.root),
            c.index,
            c.root,
        )
    });
    let mut seen = HashSet::new();
    let spelling = Spelling::new(accidentals);
    candidates
        .into_iter()
        .filter(|c| seen.insert((c.index, c.set)))
        .take(search.limit)
        .map(|c| {
            let root = spelling.spell(c.root);
            let spelling = spelling.with_root(root);
            let (matched, unmatched): (Vec<_>, Vec<_>) =
                notes.pitch_classes().partition(|&pc| c.set & bit(pc) != 0);
            let from_root = |mut pcs: Vec<PitchClass>| -> Vec<NoteName> {
                pcs.sort_by_key(|&pc| c.root.interval_to(pc).semitones());
                pcs.into_iter().map(|pc| spelling.spell(pc)).collect()
            };
            ScaleMatch {
                scale: &catalog.scales()[c.index],
                root,
                matched: from_root(matched),
                unmatched: from_root(unmatched),
                extra: c.extra as usize,
            }
        })
        .collect()
}
