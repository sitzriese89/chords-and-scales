//! Property tests for scale positions: the fret window and 3-notes-per-string patterns.

use proptest::prelude::*;
use theory::fretboard::{MAX_FRETS, MIN_FRETS};
use theory::scale_positions::NOTES_PER_STRING;
use theory::{
    InstrumentKind, Note, PitchClass, ScaleCatalog, Tuning, fret_window, positions,
    three_notes_per_string,
};

fn pitch_class() -> impl Strategy<Value = PitchClass> {
    (0u8..12).prop_map(|value| PitchClass::new(value).unwrap())
}

fn make_tuning(midi: Vec<u8>) -> Tuning {
    let notes = midi
        .into_iter()
        .map(|m| Note::from_midi(m).unwrap())
        .collect();
    Tuning::new("any", "Any", InstrumentKind::Guitar, notes).unwrap()
}

/// Any valid tuning: 4 to 9 open strings anywhere in the accepted range.
fn any_tuning() -> impl Strategy<Value = Tuning> {
    prop::collection::vec(
        Tuning::LOWEST_NOTE..=Tuning::HIGHEST_NOTE,
        Tuning::MIN_STRINGS..=Tuning::MAX_STRINGS,
    )
    .prop_map(make_tuning)
}

/// A tuning a player would use: 4 to 9 strings rising by 3 to 5 semitones (thirds and
/// fourths), so most patterns fit on the neck.
fn playable_tuning() -> impl Strategy<Value = Tuning> {
    (
        23u8..=40,
        prop::collection::vec(3u8..=5, Tuning::MIN_STRINGS - 1..Tuning::MAX_STRINGS),
    )
        .prop_map(|(low, steps)| {
            let mut midi = vec![low];
            for step in steps {
                midi.push(midi.last().unwrap() + step);
            }
            make_tuning(midi)
        })
}

fn tuning() -> impl Strategy<Value = Tuning> {
    prop_oneof![1 => any_tuning(), 3 => playable_tuning()]
}

/// A random set of pitch classes, or a catalog scale on a random root.
fn scale() -> impl Strategy<Value = Vec<PitchClass>> {
    let count = ScaleCatalog::builtin().scales().len();
    prop_oneof![
        prop::collection::vec(pitch_class(), 0..12),
        (0..count, pitch_class())
            .prop_map(|(index, root)| ScaleCatalog::builtin().scales()[index].pitch_classes(root)),
    ]
}

/// A fret count and a capo below it.
fn neck() -> impl Strategy<Value = (u8, u8)> {
    (MIN_FRETS..=MAX_FRETS).prop_flat_map(|frets| (Just(frets), 0..frets))
}

proptest! {
    #[test]
    fn fret_window_is_the_filtered_positions_in_tab_order(
        tuning in tuning(),
        (frets, capo) in neck(),
        set in scale(),
        root in pitch_class(),
        start in 0u8..=30,
        span in 0u8..=30,
    ) {
        let window = fret_window(&tuning, frets, capo, &set, root, start, span).unwrap();
        let mut expected: Vec<_> = positions(&tuning, frets, capo, &set, root)
            .unwrap()
            .into_iter()
            .filter(|p| p.fret >= start && u16::from(p.fret) < u16::from(start) + u16::from(span))
            .collect();
        // Tab order: the lowest string (highest number) first, then by fret.
        expected.sort_by_key(|p| (std::cmp::Reverse(p.string), p.fret));
        prop_assert_eq!(window, expected);
    }

    #[test]
    fn three_nps_patterns_have_three_ascending_notes_per_string(
        tuning in tuning(),
        (frets, capo) in neck(),
        set in scale(),
        root in pitch_class(),
    ) {
        let patterns = three_notes_per_string(&tuning, frets, capo, &set, root).unwrap();
        let on_neck = positions(&tuning, frets, capo, &set, root).unwrap();
        let mut steps: Vec<u8> = set.iter().map(|&pc| root.interval_to(pc).semitones()).collect();
        steps.sort_unstable();
        steps.dedup();
        let strings = tuning.string_count();

        let degrees: Vec<usize> = patterns.iter().map(|p| p.degree).collect();
        prop_assert!(degrees.windows(2).all(|w| w[0] < w[1]), "degrees {degrees:?}");
        for pattern in &patterns {
            prop_assert!(pattern.degree < steps.len());
            prop_assert_eq!(pattern.positions.len(), NOTES_PER_STRING * strings);
            // Exactly three per string, lowest string first.
            for (index, chunk) in pattern.positions.chunks(NOTES_PER_STRING).enumerate() {
                for p in chunk {
                    prop_assert_eq!(usize::from(p.string), strings - index);
                }
            }
            // Starts on its degree, and every position is a real one on this neck.
            prop_assert_eq!(pattern.positions[0].degree(), steps[pattern.degree]);
            for p in &pattern.positions {
                prop_assert!(on_neck.contains(p), "{p:?} is not on the neck");
            }
            // Strictly ascending in pitch, never skipping a scale note.
            for pair in pattern.positions.windows(2) {
                let (low, high) = (pair[0].note.midi(), pair[1].note.midi());
                prop_assert!(low < high);
                for midi in low + 1..high {
                    let pc = Note::from_midi(midi).unwrap().pitch_class();
                    prop_assert!(!set.contains(&pc), "skipped a scale note at MIDI {midi}");
                }
            }
            // The lowest octave that fits: an octave down would cross the capo.
            let lowest = pattern.positions.iter().map(|p| p.fret).min().unwrap();
            prop_assert!(u16::from(lowest) < u16::from(capo) + 12);
        }
    }

    #[test]
    fn a_shorter_neck_only_leaves_patterns_out(
        tuning in tuning(),
        (frets, capo) in neck(),
        set in scale(),
        root in pitch_class(),
    ) {
        let long = three_notes_per_string(&tuning, MAX_FRETS, capo, &set, root).unwrap();
        let short = three_notes_per_string(&tuning, frets, capo, &set, root).unwrap();
        let expected: Vec<_> = long
            .into_iter()
            .filter(|p| p.positions.iter().all(|position| position.fret <= frets))
            .collect();
        prop_assert_eq!(short, expected);
    }

    #[test]
    fn standard_like_tunings_get_every_heptatonic_pattern(
        low in 28u8..=40,
        strings in Tuning::MIN_STRINGS..=6,
        index in 0..ScaleCatalog::builtin().scales().len(),
        root in pitch_class(),
    ) {
        // Fourths, 4 to 6 strings, 24 frets: every degree of a 7-note scale has a pattern.
        let tuning = make_tuning((0..strings).map(|i| low + 5 * i as u8).collect());
        let scale = &ScaleCatalog::builtin().scales()[index];
        prop_assume!(scale.formula().len() == 7);
        let patterns =
            three_notes_per_string(&tuning, 24, 0, &scale.pitch_classes(root), root).unwrap();
        prop_assert_eq!(patterns.len(), 7);
    }
}
