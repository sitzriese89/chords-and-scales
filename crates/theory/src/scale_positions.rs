//! Scale positions: a scale played in one place on the neck (SPEC §5.2, ADR-7, ADR-22).
//!
//! Two position systems, both generic over tuning and string count:
//!
//! - [`fret_window`]: every scale note between a start fret and a span of frets;
//! - [`three_notes_per_string`]: one pattern per starting scale degree, three consecutive scale
//!   notes on every string.
//!
//! Both are built on [`positions`] and return [`Position`]s in the fretboard's coordinates
//! (ADR-18: string 1 = highest, absolute frets), with the same rules for fret count and capo.
//! They come in **tab order**: the lowest string (highest string number) first, then by fret
//! within a string. For a 3NPS pattern that is also ascending pitch.

use std::cmp::Reverse;

use crate::fretboard::{FretboardError, Position, positions};
use crate::notes::{Note, PitchClass};
use crate::tuning::Tuning;

/// Notes played on each string of a [`ThreeNpsPattern`].
pub const NOTES_PER_STRING: usize = 3;

/// One 3-notes-per-string pattern of a scale.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ThreeNpsPattern {
    /// The scale degree the pattern starts on, as an index into the scale counted up from the
    /// root: 0 starts on the root, 1 on the next scale note above it, and so on.
    pub degree: usize,
    /// `3 × strings` positions in tab order: lowest string first, three per string, each note
    /// the next scale note above the one before.
    pub positions: Vec<Position>,
}

/// Sorts positions into tab order: lowest string (highest number) first, then by fret.
fn tab_order(positions: &mut [Position]) {
    positions.sort_by_key(|p| (Reverse(p.string), p.fret));
}

/// Every position of `pitch_classes` in the fret window `start` … `start + span - 1`, on a neck
/// of `frets` frets in `tuning` with a capo on `capo`, labelled from `root`.
///
/// Exactly the [`positions`] output whose fret lies in the window, so fret count and capo
/// follow its rules (and errors): window frets below the capo or past the last fret don't
/// exist and give nothing. A span of 0 is an empty window. Ordered for tab: the lowest string
/// first, then by fret.
pub fn fret_window(
    tuning: &Tuning,
    frets: u8,
    capo: u8,
    pitch_classes: &[PitchClass],
    root: PitchClass,
    start: u8,
    span: u8,
) -> Result<Vec<Position>, FretboardError> {
    let end = u16::from(start) + u16::from(span);
    let mut result: Vec<Position> = positions(tuning, frets, capo, pitch_classes, root)?
        .into_iter()
        .filter(|p| (u16::from(start)..end).contains(&u16::from(p.fret)))
        .collect();
    tab_order(&mut result);
    Ok(result)
}

/// The 3-notes-per-string patterns of the scale `pitch_classes` on a neck of `frets` frets in
/// `tuning` with a capo on `capo`, labelled from `root`.
///
/// The scale is the set of distinct pitch classes, its degrees counted up from `root` (which
/// need not be in it). A pattern starts on one degree on the lowest string and walks up the
/// scale, three notes per string, each the next scale note above the last one, low string to
/// high. Scales with fewer notes than `3 × strings` simply continue into the next octaves, so
/// any scale of 1 to 12 notes works the same way; it has one pattern per degree.
///
/// A pattern lies at the lowest octave where all its frets are on the neck (from the capo to
/// the last fret). If even that runs past the last fret, the pattern is left out: it is never
/// moved or folded to fit. The result is ordered by degree; a missing degree means its
/// pattern doesn't fit on this neck. An empty set has no patterns.
pub fn three_notes_per_string(
    tuning: &Tuning,
    frets: u8,
    capo: u8,
    pitch_classes: &[PitchClass],
    root: PitchClass,
) -> Result<Vec<ThreeNpsPattern>, FretboardError> {
    let on_neck = positions(tuning, frets, capo, pitch_classes, root)?;

    // The scale's steps up from the root, distinct and ascending.
    let mut steps: Vec<u8> = pitch_classes
        .iter()
        .map(|&pc| root.interval_to(pc).semitones())
        .collect();
    steps.sort_unstable();
    steps.dedup();
    let lowest_string = u8::try_from(tuning.string_count()).expect("at most 9 strings");

    let mut patterns = Vec::new();
    for (degree, &step) in steps.iter().enumerate() {
        let start_pc = root.transpose(i32::from(step));
        // Each place of this degree on the lowest string, lowest fret first; the first one
        // whose pattern fits is the lowest octave that fits.
        let pattern = on_neck
            .iter()
            .filter(|p| p.string == lowest_string && p.pitch_class() == start_pc)
            .find_map(|start| pattern_from(tuning, frets, capo, root, &steps, degree, start.note));
        if let Some(positions) = pattern {
            patterns.push(ThreeNpsPattern { degree, positions });
        }
    }
    Ok(patterns)
}

/// The pattern starting on `start`, scale degree `degree`, or `None` if a note falls off the
/// neck.
fn pattern_from(
    tuning: &Tuning,
    frets: u8,
    capo: u8,
    root: PitchClass,
    steps: &[u8],
    degree: usize,
    start: Note,
) -> Option<Vec<Position>> {
    let size = steps.len();
    let strings = tuning.string_count();
    let mut midi = i32::from(start.midi());
    let mut result = Vec::with_capacity(NOTES_PER_STRING * strings);
    for i in 0..NOTES_PER_STRING * strings {
        if i > 0 {
            // Up to the next scale note: the gap between this degree and the next, an octave
            // for a one-note scale.
            let here = (degree + i - 1) % size;
            let next = (degree + i) % size;
            let gap = (i32::from(steps[next]) - i32::from(steps[here])).rem_euclid(12);
            midi += if gap == 0 { 12 } else { gap };
        }
        // `notes()` lists strings lowest first; fretboard string numbers count from the top.
        let index = i / NOTES_PER_STRING;
        let open = i32::from(tuning.notes()[index].midi());
        let fret = midi - open;
        if fret < i32::from(capo) || fret > i32::from(frets) {
            return None;
        }
        let note = Note::from_midi(u8::try_from(midi).ok()?)?;
        result.push(Position {
            string: u8::try_from(strings - index).expect("at most 9 strings"),
            fret: u8::try_from(fret).ok()?,
            note,
            interval: root.interval_to(note.pitch_class()),
        });
    }
    Some(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scales::ScaleCatalog;
    use crate::tuning::TuningCatalog;

    fn pc(name: &str) -> PitchClass {
        name.parse::<crate::NoteName>().unwrap().pitch_class()
    }

    fn tuning(id: &str) -> Tuning {
        TuningCatalog::builtin().get(id).unwrap().clone()
    }

    fn scale(id: &str, root: &str) -> Vec<PitchClass> {
        ScaleCatalog::builtin()
            .get(id)
            .unwrap()
            .pitch_classes(pc(root))
    }

    /// A pattern's frets per string, lowest string first (the way patterns are written).
    fn frets_per_string(pattern: &ThreeNpsPattern) -> Vec<[u8; 3]> {
        pattern
            .positions
            .chunks(NOTES_PER_STRING)
            .map(|chunk| {
                assert!(chunk.iter().all(|p| p.string == chunk[0].string));
                [chunk[0].fret, chunk[1].fret, chunk[2].fret]
            })
            .collect()
    }

    // The seven 3NPS patterns of G major in standard tuning, low E string first, as commonly
    // taught: one per scale degree, the one on E at the open position.
    const G_MAJOR_STANDARD: [[[u8; 3]; 6]; 7] = [
        // G: 3-5-7 on the low E.
        [
            [3, 5, 7],
            [3, 5, 7],
            [4, 5, 7],
            [4, 5, 7],
            [5, 7, 8],
            [5, 7, 8],
        ],
        // A
        [
            [5, 7, 8],
            [5, 7, 9],
            [5, 7, 9],
            [5, 7, 9],
            [7, 8, 10],
            [7, 8, 10],
        ],
        // B
        [
            [7, 8, 10],
            [7, 9, 10],
            [7, 9, 10],
            [7, 9, 11],
            [8, 10, 12],
            [8, 10, 12],
        ],
        // C
        [
            [8, 10, 12],
            [9, 10, 12],
            [9, 10, 12],
            [9, 11, 12],
            [10, 12, 13],
            [10, 12, 14],
        ],
        // D
        [
            [10, 12, 14],
            [10, 12, 14],
            [10, 12, 14],
            [11, 12, 14],
            [12, 13, 15],
            [12, 14, 15],
        ],
        // E
        [
            [0, 2, 3],
            [0, 2, 3],
            [0, 2, 4],
            [0, 2, 4],
            [1, 3, 5],
            [2, 3, 5],
        ],
        // F#
        [
            [2, 3, 5],
            [2, 3, 5],
            [2, 4, 5],
            [2, 4, 5],
            [3, 5, 7],
            [3, 5, 7],
        ],
    ];

    #[test]
    fn g_major_standard_gives_the_seven_known_patterns() {
        let patterns = three_notes_per_string(
            &tuning("guitar-6-standard"),
            24,
            0,
            &scale("major", "G"),
            pc("G"),
        )
        .unwrap();
        assert_eq!(patterns.len(), 7);
        for (degree, (pattern, expected)) in patterns.iter().zip(G_MAJOR_STANDARD).enumerate() {
            assert_eq!(pattern.degree, degree);
            assert_eq!(frets_per_string(pattern), expected, "degree {degree}");
        }
        // Strings in tab order (low E = string 6 first), labelled from the root.
        let first = &patterns[0].positions;
        let strings: Vec<u8> = first.iter().map(|p| p.string).collect();
        assert_eq!(
            strings,
            [6, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1]
        );
        let labels: Vec<String> = first
            .iter()
            .take(7)
            .map(|p| p.interval.to_string())
            .collect();
        assert_eq!(labels, ["1", "2", "3", "4", "5", "6", "7"]);
        assert_eq!(first[0].note, "G2".parse().unwrap());
    }

    #[test]
    fn a_pattern_past_the_last_fret_is_left_out() {
        // On 12 frets, the C and D patterns (up to frets 14 and 15) don't fit, and there is no
        // lower octave to move them to.
        let patterns = three_notes_per_string(
            &tuning("guitar-6-standard"),
            12,
            0,
            &scale("major", "G"),
            pc("G"),
        )
        .unwrap();
        let degrees: Vec<usize> = patterns.iter().map(|p| p.degree).collect();
        assert_eq!(degrees, [0, 1, 2, 5, 6]);
        for pattern in &patterns {
            assert_eq!(frets_per_string(pattern), G_MAJOR_STANDARD[pattern.degree]);
        }
    }

    #[test]
    fn a_capo_moves_a_pattern_up_an_octave() {
        // With a capo on 3, the E pattern from the open strings no longer fits; it is played
        // an octave up, from fret 12. The F# pattern (from fret 2) moves to 14.
        let patterns = three_notes_per_string(
            &tuning("guitar-6-standard"),
            24,
            3,
            &scale("major", "G"),
            pc("G"),
        )
        .unwrap();
        let octave_up = |degree: usize| G_MAJOR_STANDARD[degree].map(|s| s.map(|f| f + 12));
        assert_eq!(frets_per_string(&patterns[5]), octave_up(5));
        assert_eq!(frets_per_string(&patterns[6]), octave_up(6));
        // The others stay where they were.
        for (degree, expected) in G_MAJOR_STANDARD.iter().enumerate().take(5) {
            assert_eq!(patterns[degree].degree, degree);
            assert_eq!(frets_per_string(&patterns[degree]), expected);
        }
    }

    #[test]
    fn seven_string_guitar_and_four_string_bass() {
        let g_major = scale("major", "G");
        let seven =
            three_notes_per_string(&tuning("guitar-7-standard"), 24, 0, &g_major, pc("G")).unwrap();
        assert_eq!(seven.len(), 7);
        // From G on the low B (fret 8) the six upper strings play the 6-string C pattern.
        let g = frets_per_string(&seven[0]);
        assert_eq!(g[0], [8, 10, 12]);
        assert_eq!(g[1..], G_MAJOR_STANDARD[3]);
        assert!(seven.iter().all(|p| p.positions.len() == 21));

        let bass =
            three_notes_per_string(&tuning("bass-4-standard"), 20, 0, &g_major, pc("G")).unwrap();
        assert_eq!(bass.len(), 7);
        // A bass in E A D G plays the guitar patterns' four lowest strings, an octave down.
        for pattern in &bass {
            assert_eq!(
                frets_per_string(pattern),
                G_MAJOR_STANDARD[pattern.degree][..4],
                "degree {}",
                pattern.degree
            );
            assert_eq!(pattern.positions.len(), 12);
        }
        assert_eq!(bass[0].positions[0].note, "G1".parse().unwrap());
    }

    #[test]
    fn pentatonic_has_one_pattern_per_degree() {
        // A minor pentatonic from A on the low E: each string continues where the last one
        // stopped, so the shape climbs the neck.
        let standard = tuning("guitar-6-standard");
        let pentatonic = scale("minor-pentatonic", "A");
        let patterns = three_notes_per_string(&standard, 24, 0, &pentatonic, pc("A")).unwrap();
        assert_eq!(patterns[0].degree, 0);
        assert_eq!(
            frets_per_string(&patterns[0]),
            [
                [5, 8, 10],
                [7, 10, 12],
                [10, 12, 14],
                [12, 14, 17],
                [15, 17, 20],
                [17, 20, 22]
            ]
        );
        assert!(patterns.iter().all(|p| p.degree < 5));
        // On 21 frets it is left out: the octave up (from fret 17) doesn't fit either.
        let short = three_notes_per_string(&standard, 21, 0, &pentatonic, pc("A")).unwrap();
        assert!(short.iter().all(|p| p.degree != 0));
    }

    #[test]
    fn tiny_and_empty_scales() {
        let standard = tuning("guitar-6-standard");
        assert_eq!(
            three_notes_per_string(&standard, 24, 0, &[], pc("C")).unwrap(),
            []
        );
        // One note: three octaves per string need 24 frets on one string and more on the next.
        assert_eq!(
            three_notes_per_string(&standard, 27, 0, &[pc("E")], pc("E")).unwrap(),
            []
        );
        // Duplicates don't add degrees.
        let c_major = scale("major", "C");
        let mut doubled = c_major.clone();
        doubled.extend(c_major.iter().rev());
        assert_eq!(
            three_notes_per_string(&standard, 24, 0, &doubled, pc("C")).unwrap(),
            three_notes_per_string(&standard, 24, 0, &c_major, pc("C")).unwrap()
        );
        // The root need not be in the set: degree 0 is the first note above C#, D.
        let from_c_sharp = three_notes_per_string(&standard, 24, 0, &c_major, pc("C#")).unwrap();
        assert_eq!(from_c_sharp[0].degree, 0);
        assert_eq!(from_c_sharp[0].positions[0].pitch_class(), pc("D"));
    }

    #[test]
    fn checks_the_neck_like_positions() {
        let standard = tuning("guitar-6-standard");
        let set = scale("major", "G");
        assert_eq!(
            three_notes_per_string(&standard, 30, 0, &set, pc("G")),
            Err(FretboardError::Frets(30))
        );
        assert_eq!(
            fret_window(&standard, 24, 24, &set, pc("G"), 0, 4),
            Err(FretboardError::Capo {
                capo: 24,
                frets: 24
            })
        );
    }

    #[test]
    fn fret_window_in_tab_order() {
        let window = fret_window(
            &tuning("guitar-6-standard"),
            24,
            0,
            &scale("major", "G"),
            pc("G"),
            2,
            4,
        )
        .unwrap();
        let cells: Vec<(u8, u8)> = window.iter().map(|p| (p.string, p.fret)).collect();
        let expected = [
            (6, 2),
            (6, 3),
            (6, 5),
            (5, 2),
            (5, 3),
            (5, 5),
            (4, 2),
            (4, 4),
            (4, 5),
            (3, 2),
            (3, 4),
            (3, 5),
            (2, 3),
            (2, 5),
            (1, 2),
            (1, 3),
            (1, 5),
        ];
        assert_eq!(cells, expected);
    }

    #[test]
    fn fret_window_edges() {
        let standard = tuning("guitar-6-standard");
        let all: Vec<PitchClass> = (0..12).map(|v| PitchClass::new(v).unwrap()).collect();
        let e = pc("E");
        // An empty span, a window past the neck, a window below the capo.
        assert_eq!(fret_window(&standard, 24, 0, &all, e, 3, 0).unwrap(), []);
        assert_eq!(fret_window(&standard, 12, 0, &all, e, 13, 4).unwrap(), []);
        assert_eq!(fret_window(&standard, 24, 5, &all, e, 0, 5).unwrap(), []);
        // Partly off the neck or under the capo: only the frets that exist.
        let top = fret_window(&standard, 24, 0, &all, e, 22, 255).unwrap();
        assert!(top.iter().all(|p| (22..=24).contains(&p.fret)));
        assert_eq!(top.len(), 6 * 3);
        let capo = fret_window(&standard, 24, 2, &all, e, 0, 4).unwrap();
        assert!(capo.iter().all(|p| (2..=3).contains(&p.fret)));
        assert_eq!(capo.len(), 6 * 2);
    }
}
