//! Property tests for the note model: transposition, intervals, parsing and spelling.

use proptest::prelude::*;
use theory::{
    Accidental, Accidentals, Glyphs, Interval, Letter, Note, NoteName, PitchClass, Spelling,
};

fn note() -> impl Strategy<Value = Note> {
    (0..=Note::MAX_MIDI).prop_map(|midi| Note::from_midi(midi).unwrap())
}

fn pitch_class() -> impl Strategy<Value = PitchClass> {
    (0u8..12).prop_map(|value| PitchClass::new(value).unwrap())
}

fn accidental() -> impl Strategy<Value = Accidental> {
    prop_oneof![
        Just(Accidental::DoubleFlat),
        Just(Accidental::Flat),
        Just(Accidental::Natural),
        Just(Accidental::Sharp),
        Just(Accidental::DoubleSharp),
    ]
}

fn letter() -> impl Strategy<Value = Letter> {
    prop_oneof![
        Just(Letter::C),
        Just(Letter::D),
        Just(Letter::E),
        Just(Letter::F),
        Just(Letter::G),
        Just(Letter::A),
        Just(Letter::B),
    ]
}

/// Any valid interval, with any label (`#4` as well as `b5`).
fn interval() -> impl Strategy<Value = Interval> {
    (1u8..=80, accidental()).prop_filter_map("label out of range", |(degree, accidental)| {
        Interval::new(degree, accidental)
    })
}

fn note_name() -> impl Strategy<Value = NoteName> {
    (letter(), accidental()).prop_map(|(letter, accidental)| NoteName::new(letter, accidental))
}

fn accidentals() -> impl Strategy<Value = Accidentals> {
    prop_oneof![Just(Accidentals::Sharps), Just(Accidentals::Flats)]
}

fn glyphs() -> impl Strategy<Value = Glyphs> {
    prop_oneof![Just(Glyphs::Ascii), Just(Glyphs::Unicode)]
}

proptest! {
    #[test]
    fn up_then_down_returns_the_note(note in note(), interval in interval()) {
        if let Some(higher) = note.up(interval) {
            prop_assert_eq!(higher.down(interval), Some(note));
            prop_assert_eq!(higher.midi() - note.midi(), interval.semitones());
        } else {
            prop_assert!(u32::from(note.midi()) + u32::from(interval.semitones()) > 127);
        }
    }

    #[test]
    fn down_then_up_returns_the_note(note in note(), interval in interval()) {
        if let Some(lower) = note.down(interval) {
            prop_assert_eq!(lower.up(interval), Some(note));
        } else {
            prop_assert!(interval.semitones() > note.midi());
        }
    }

    #[test]
    fn interval_between_notes_is_consistent_with_transposition(a in note(), b in note()) {
        let interval = Interval::between(a, b);
        prop_assert_eq!(interval, Interval::between(b, a));
        let (lower, higher) = (a.min(b), a.max(b));
        prop_assert_eq!(lower.up(interval), Some(higher));
        prop_assert_eq!(higher.down(interval), Some(lower));
    }

    #[test]
    fn transposition_by_interval_matches_transposition_by_semitones(
        note in note(),
        interval in interval(),
    ) {
        let semitones = i32::from(interval.semitones());
        prop_assert_eq!(note.up(interval), note.transpose(semitones));
        prop_assert_eq!(note.down(interval), note.transpose(-semitones));
    }

    #[test]
    fn pitch_classes_follow_notes(note in note(), interval in interval()) {
        if let Some(higher) = note.up(interval) {
            prop_assert_eq!(note.pitch_class().up(interval), higher.pitch_class());
        }
        prop_assert_eq!(note.pitch_class().up(interval).down(interval), note.pitch_class());
        prop_assert_eq!(Note::new(note.pitch_class(), note.octave()), Some(note));
    }

    #[test]
    fn pitch_class_interval_is_consistent_with_transposition(
        a in pitch_class(),
        b in pitch_class(),
    ) {
        let interval = a.interval_to(b);
        prop_assert!(interval.semitones() < 12);
        prop_assert_eq!(a.up(interval), b);
    }

    #[test]
    fn interval_labels_round_trip(interval in interval(), glyphs in glyphs()) {
        let label = interval.format(glyphs);
        prop_assert_eq!(label.parse::<Interval>(), Ok(interval), "{}", label);
    }

    #[test]
    fn default_labels_have_the_right_width(semitones in 0..=Interval::MAX_SEMITONES) {
        let interval = Interval::from_semitones(semitones).unwrap();
        prop_assert_eq!(interval.semitones(), semitones);
    }

    #[test]
    fn note_names_round_trip(name in note_name(), glyphs in glyphs()) {
        let text = name.format(glyphs);
        prop_assert_eq!(text.parse::<NoteName>(), Ok(name), "{}", text);
        prop_assert_eq!(text.to_lowercase().parse::<NoteName>(), Ok(name), "{}", text);
    }

    #[test]
    fn notes_round_trip(note in note(), accidentals in accidentals(), glyphs in glyphs()) {
        let text = note.format(accidentals, glyphs);
        prop_assert_eq!(text.parse::<Note>(), Ok(note), "{}", text);
    }

    #[test]
    fn spelling_keeps_the_pitch_class(
        pitch_class in pitch_class(),
        accidentals in accidentals(),
        root in proptest::option::of(note_name()),
    ) {
        let mut spelling = Spelling::new(accidentals);
        if let Some(root) = root {
            spelling = spelling.with_root(root);
        }
        let name = spelling.spell(pitch_class);
        prop_assert_eq!(name.pitch_class(), pitch_class);
        if root.is_some_and(|root| root.pitch_class() == pitch_class) {
            prop_assert_eq!(Some(name), root);
        } else {
            let allowed = match accidentals {
                Accidentals::Sharps => Accidental::Sharp,
                Accidentals::Flats => Accidental::Flat,
            };
            prop_assert!(
                [Accidental::Natural, allowed].contains(&name.accidental()),
                "{} with {:?}",
                name,
                accidentals
            );
        }
    }
}
