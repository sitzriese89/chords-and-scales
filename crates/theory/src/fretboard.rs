//! Mapping pitch classes onto the neck (SPEC §5.1, ADR-18, ADR-21).
//!
//! [`positions`] lists every place a set of pitch classes can be played, in the fretboard
//! component's coordinates (ADR-18), so the UI can pass them on without remapping:
//!
//! - **string 1 is the highest string** and the lowest string has the highest number, while a
//!   [`Tuning`] lists its notes lowest string first;
//! - **frets are absolute**: 0 is the open string, and a capo doesn't renumber anything.

use std::fmt;

use crate::notes::{Interval, Note, PitchClass};
use crate::tuning::Tuning;

/// Fewest frets a neck can have.
pub const MIN_FRETS: u8 = 12;
/// Most frets a neck can have.
pub const MAX_FRETS: u8 = 27;
/// The fret count when the user hasn't picked one.
pub const DEFAULT_FRETS: u8 = 24;

/// One playable place of a note on the neck.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Position {
    /// 1 = the highest string (ADR-18).
    pub string: u8,
    /// The absolute fret: 0 = open, also with a capo.
    pub fret: u8,
    /// The sounding note.
    pub note: Note,
    /// The interval up from the root to this note's pitch class, within an octave, with its
    /// default label (`1 b2 2 b3 3 4 b5 5 b6 6 b7 7`, ADR-15).
    pub interval: Interval,
}

impl Position {
    /// Semitones above the root, 0 … 11: the `degree` of a fretboard dot (ADR-18).
    pub fn degree(&self) -> u8 {
        self.interval.semitones()
    }

    pub fn pitch_class(&self) -> PitchClass {
        self.note.pitch_class()
    }
}

/// Why a neck can't be mapped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum FretboardError {
    /// A fret count outside 12 … 27.
    Frets(u8),
    /// A capo on or beyond the last fret.
    Capo { capo: u8, frets: u8 },
}

impl fmt::Display for FretboardError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Frets(frets) => write!(
                f,
                "{frets} frets; a neck has {MIN_FRETS} to {MAX_FRETS} frets"
            ),
            Self::Capo { capo, frets } => write!(
                f,
                "a capo on fret {capo} must be below the last fret ({frets}); 0 is no capo"
            ),
        }
    }
}

impl std::error::Error for FretboardError {}

/// Every position on a neck of `frets` frets in `tuning` whose pitch class is in
/// `pitch_classes`, labelled by its interval from `root`.
///
/// - `frets` is 12 … 27.
/// - `capo` is the fret the capo sits on, 0 for none, and must be below `frets`. With a capo
///   on fret `c`, frets `c` … `frets` are reachable and fret `c` sounds as the open string;
///   frets below it are left out. Frets keep their absolute numbers. A capo on the
///   second-to-last fret leaves two frets; one on the last fret leaves no fretted notes and
///   is an error.
/// - `pitch_classes` may be in any order and contain duplicates. `root` need not be in it;
///   intervals are measured from it either way.
///
/// Ordered by string (1, the highest, first), then by fret.
pub fn positions(
    tuning: &Tuning,
    frets: u8,
    capo: u8,
    pitch_classes: &[PitchClass],
    root: PitchClass,
) -> Result<Vec<Position>, FretboardError> {
    if !(MIN_FRETS..=MAX_FRETS).contains(&frets) {
        return Err(FretboardError::Frets(frets));
    }
    if capo >= frets {
        return Err(FretboardError::Capo { capo, frets });
    }
    let mut wanted = [false; 12];
    for pc in pitch_classes {
        wanted[usize::from(pc.value())] = true;
    }

    let mut result = Vec::new();
    for (index, &open) in tuning.notes().iter().rev().enumerate() {
        let string = u8::try_from(index + 1).expect("at most 9 strings");
        for fret in capo..=frets {
            let note = open
                .transpose(i32::from(fret))
                .expect("open strings up to C6 plus 27 frets stay within MIDI");
            if wanted[usize::from(note.pitch_class().value())] {
                result.push(Position {
                    string,
                    fret,
                    note,
                    interval: root.interval_to(note.pitch_class()),
                });
            }
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tuning::TuningCatalog;

    fn pc(name: &str) -> PitchClass {
        name.parse::<crate::NoteName>().unwrap().pitch_class()
    }

    fn standard() -> Tuning {
        TuningCatalog::builtin()
            .get("guitar-6-standard")
            .unwrap()
            .clone()
    }

    fn all() -> Vec<PitchClass> {
        (0..12).map(|v| PitchClass::new(v).unwrap()).collect()
    }

    fn frets_of(positions: &[Position], string: u8) -> Vec<u8> {
        positions
            .iter()
            .filter(|p| p.string == string)
            .map(|p| p.fret)
            .collect()
    }

    #[test]
    fn standard_e_24_frets() {
        let e = positions(&standard(), 24, 0, &[pc("E")], pc("E")).unwrap();
        // The low E string is string 6 (ADR-18): E at 0, 12 and 24.
        assert_eq!(frets_of(&e, 6), [0, 12, 24]);
        assert_eq!(frets_of(&e, 1), [0, 12, 24]);
        let low_e: Vec<String> = e
            .iter()
            .filter(|p| p.string == 6)
            .map(|p| {
                p.note
                    .format(crate::Accidentals::Sharps, crate::Glyphs::Ascii)
            })
            .collect();
        assert_eq!(low_e, ["E2", "E3", "E4"]);
        assert!(
            e.iter()
                .all(|p| p.degree() == 0 && p.interval.to_string() == "1")
        );

        let a = positions(&standard(), 24, 0, &[pc("A")], pc("E")).unwrap();
        assert_eq!(frets_of(&a, 6), [5, 17]);
        let a5 = a.iter().find(|p| p.string == 6 && p.fret == 5).unwrap();
        assert_eq!(a5.note, "A2".parse().unwrap());
        assert_eq!(a5.interval.to_string(), "4");
        assert_eq!(a5.degree(), 5);
        // The open A string.
        assert_eq!(frets_of(&a, 5), [0, 12, 24]);
    }

    #[test]
    fn labels_intervals_from_the_root() {
        // C major on standard tuning, first string up to fret 12.
        let major: Vec<PitchClass> = ["C", "D", "E", "F", "G", "A", "B"]
            .into_iter()
            .map(pc)
            .collect();
        let on_high_e: Vec<(u8, String)> = positions(&standard(), 24, 0, &major, pc("C"))
            .unwrap()
            .into_iter()
            .filter(|p| p.string == 1 && p.fret <= 12)
            .map(|p| (p.fret, p.interval.to_string()))
            .collect();
        let expected = [
            (0, "3"),
            (1, "4"),
            (3, "5"),
            (5, "6"),
            (7, "7"),
            (8, "1"),
            (10, "2"),
            (12, "3"),
        ];
        assert_eq!(on_high_e, expected.map(|(f, i)| (f, i.to_owned())).to_vec());
    }

    #[test]
    fn capo_excludes_lower_frets_and_keeps_absolute_numbers() {
        let without = positions(&standard(), 24, 0, &all(), pc("E")).unwrap();
        let with = positions(&standard(), 24, 2, &all(), pc("E")).unwrap();
        // Exactly the positions from fret 2 up remain, unchanged.
        let expected: Vec<Position> = without.iter().copied().filter(|p| p.fret >= 2).collect();
        assert_eq!(with, expected);
        assert_eq!(frets_of(&with, 6).first(), Some(&2));
        // Fret 2 on the low string sounds F#2: the capo is the new open string.
        let capo_low = with.iter().find(|p| p.string == 6).unwrap();
        assert_eq!((capo_low.fret, capo_low.note), (2, "F#2".parse().unwrap()));

        let e = positions(&standard(), 24, 2, &[pc("E")], pc("E")).unwrap();
        assert_eq!(frets_of(&e, 6), [12, 24]);
        // The B string's E is at 5 and 17, the G string's at 9 and 21.
        assert_eq!(frets_of(&e, 2), [5, 17]);
    }

    #[test]
    fn capo_edges() {
        let tuning = standard();
        let e = [pc("E")];
        assert_eq!(
            positions(&tuning, 24, 24, &e, pc("E")),
            Err(FretboardError::Capo {
                capo: 24,
                frets: 24
            })
        );
        assert_eq!(
            positions(&tuning, 12, 13, &e, pc("E")),
            Err(FretboardError::Capo {
                capo: 13,
                frets: 12
            })
        );
        let last = positions(&tuning, 24, 23, &all(), pc("E")).unwrap();
        assert_eq!(frets_of(&last, 1), [23, 24]);
    }

    #[test]
    fn fret_count_is_12_to_27() {
        let e = [pc("E")];
        assert_eq!(
            positions(&standard(), 11, 0, &e, pc("E")),
            Err(FretboardError::Frets(11))
        );
        assert_eq!(
            positions(&standard(), 28, 0, &e, pc("E")),
            Err(FretboardError::Frets(28))
        );
        assert_eq!(
            frets_of(&positions(&standard(), 12, 0, &e, pc("E")).unwrap(), 6),
            [0, 12]
        );
        let all27 = positions(&standard(), 27, 0, &all(), pc("E")).unwrap();
        assert_eq!(all27.len(), 6 * 28);
    }

    #[test]
    fn orders_by_string_then_fret() {
        let tuning = TuningCatalog::builtin()
            .get("bass-5-standard")
            .unwrap()
            .clone();
        let result = positions(&tuning, 20, 0, &all(), pc("C")).unwrap();
        let order: Vec<(u8, u8)> = result.iter().map(|p| (p.string, p.fret)).collect();
        let mut sorted = order.clone();
        sorted.sort();
        assert_eq!(order, sorted);
        // String 5 is the low B.
        assert_eq!(result.last().unwrap().string, 5);
        assert_eq!(
            result.iter().find(|p| p.string == 5).unwrap().note,
            "B0".parse().unwrap()
        );
    }

    #[test]
    fn empty_set_gives_no_positions() {
        assert_eq!(positions(&standard(), 24, 0, &[], pc("C")).unwrap(), []);
    }
}
