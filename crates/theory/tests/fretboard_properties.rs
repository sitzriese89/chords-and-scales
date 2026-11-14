//! Property tests for tunings and the fretboard mapping.

use proptest::prelude::*;
use theory::fretboard::{MAX_FRETS, MIN_FRETS};
use theory::{InstrumentKind, Note, PitchClass, Tuning, positions};

fn pitch_class() -> impl Strategy<Value = PitchClass> {
    (0u8..12).prop_map(|value| PitchClass::new(value).unwrap())
}

/// Any valid tuning: 4 to 9 open strings anywhere in the accepted range.
fn tuning() -> impl Strategy<Value = Tuning> {
    prop::collection::vec(
        Tuning::LOWEST_NOTE..=Tuning::HIGHEST_NOTE,
        Tuning::MIN_STRINGS..=Tuning::MAX_STRINGS,
    )
    .prop_map(|midi| {
        let notes = midi
            .into_iter()
            .map(|m| Note::from_midi(m).unwrap())
            .collect();
        Tuning::new("any", "Any", InstrumentKind::Guitar, notes).unwrap()
    })
}

/// A fret count and a capo below it.
fn neck() -> impl Strategy<Value = (u8, u8)> {
    (MIN_FRETS..=MAX_FRETS).prop_flat_map(|frets| (Just(frets), 0..frets))
}

proptest! {
    #[test]
    fn positions_are_in_the_set_and_on_the_neck(
        tuning in tuning(),
        (frets, capo) in neck(),
        set in prop::collection::vec(pitch_class(), 0..12),
        root in pitch_class(),
    ) {
        let result = positions(&tuning, frets, capo, &set, root).unwrap();
        let count = tuning.string_count();
        for p in &result {
            prop_assert!(set.contains(&p.pitch_class()));
            prop_assert!((capo..=frets).contains(&p.fret));
            prop_assert!((1..=count).contains(&usize::from(p.string)));
            // The note is the open string plus the fret, string 1 being the highest.
            let open = tuning.open_note(usize::from(p.string)).unwrap();
            prop_assert_eq!(p.note.midi(), open.midi() + p.fret);
            prop_assert_eq!(p.degree(), (p.pitch_class().value() + 12 - root.value()) % 12);
            prop_assert_eq!(root.interval_to(p.pitch_class()), p.interval);
        }
    }

    #[test]
    fn every_matching_fret_is_listed(
        tuning in tuning(),
        (frets, capo) in neck(),
        set in prop::collection::vec(pitch_class(), 0..12),
        root in pitch_class(),
    ) {
        let result = positions(&tuning, frets, capo, &set, root).unwrap();
        let expected = (1..=tuning.string_count())
            .flat_map(|string| (capo..=frets).map(move |fret| (string, fret)))
            .filter(|&(string, fret)| {
                let note = tuning.open_note(string).unwrap().transpose(i32::from(fret)).unwrap();
                set.contains(&note.pitch_class())
            })
            .count();
        prop_assert_eq!(result.len(), expected);
    }

    #[test]
    fn a_capo_only_removes_lower_frets(
        tuning in tuning(),
        (frets, capo) in neck(),
        set in prop::collection::vec(pitch_class(), 0..12),
        root in pitch_class(),
    ) {
        let open = positions(&tuning, frets, 0, &set, root).unwrap();
        let capoed = positions(&tuning, frets, capo, &set, root).unwrap();
        let expected: Vec<_> = open.into_iter().filter(|p| p.fret >= capo).collect();
        prop_assert_eq!(capoed, expected);
    }
}
