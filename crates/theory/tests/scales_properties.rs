//! Scale catalog properties: modes are rotations of their parent, and known scales spell as
//! expected.

use proptest::prelude::*;
use theory::{Accidentals, Glyphs, NoteName, PitchClass, ScaleCatalog};

/// Each family of modes in catalog order, starting with its parent scale.
const MODE_FAMILIES: [[&str; 7]; 3] = [
    [
        "major",
        "dorian",
        "phrygian",
        "lydian",
        "mixolydian",
        "aeolian",
        "locrian",
    ],
    [
        "harmonic-minor",
        "locrian-natural-6",
        "ionian-augmented",
        "dorian-sharp-4",
        "phrygian-dominant",
        "lydian-sharp-2",
        "ultralocrian",
    ],
    [
        "melodic-minor",
        "dorian-flat-2",
        "lydian-augmented",
        "lydian-dominant",
        "mixolydian-flat-6",
        "locrian-natural-2",
        "altered",
    ],
];

fn semitones(id: &str) -> Vec<u8> {
    ScaleCatalog::builtin()
        .get(id)
        .unwrap_or_else(|| panic!("no scale {id:?}"))
        .formula()
        .semitones()
        .collect()
}

fn notes(id: &str, root: &str, accidentals: Accidentals) -> String {
    let root: NoteName = root.parse().unwrap();
    ScaleCatalog::builtin()
        .get(id)
        .unwrap()
        .notes(root, accidentals)
        .iter()
        .map(|note| note.name.format(Glyphs::Unicode))
        .collect::<Vec<_>>()
        .join(" ")
}

fn pitch_classes(id: &str, root: u8) -> Vec<u8> {
    ScaleCatalog::builtin()
        .get(id)
        .unwrap()
        .pitch_classes(PitchClass::new(root).unwrap())
        .into_iter()
        .map(PitchClass::value)
        .collect()
}

proptest! {
    /// Mode n of major (and of harmonic and melodic minor) equals the parent formula rotated
    /// to its n-th degree, and on the same parent root it has the same pitch classes.
    #[test]
    fn modes_are_rotations_of_their_parent(family in 0usize..3, mode in 0usize..7, root in 0u8..12) {
        let [parent_id, ..] = MODE_FAMILIES[family];
        let mode_id = MODE_FAMILIES[family][mode];
        let parent = ScaleCatalog::builtin().get(parent_id).unwrap().formula();
        let rotated: Vec<u8> = parent.rotate(mode).unwrap().semitones().collect();
        prop_assert_eq!(&semitones(mode_id), &rotated, "{} vs mode {} of {}", mode_id, mode + 1, parent_id);

        // The mode on the parent's n-th note uses the parent's notes.
        let mut parent_notes = pitch_classes(parent_id, root);
        let mode_root = parent_notes[mode];
        let mut mode_notes = pitch_classes(mode_id, mode_root);
        parent_notes.sort_unstable();
        mode_notes.sort_unstable();
        prop_assert_eq!(parent_notes, mode_notes);
    }

    /// Every built-in scale on every root starts on the root and has distinct pitch classes.
    #[test]
    fn scales_have_distinct_pitch_classes(index in 0usize..1000, root in 0u8..12) {
        let scales = ScaleCatalog::builtin().scales();
        let scale = &scales[index % scales.len()];
        let mut values = pitch_classes(scale.id(), root);
        prop_assert_eq!(values[0], root);
        values.sort_unstable();
        values.dedup();
        prop_assert_eq!(values.len(), scale.formula().len());
    }
}

#[test]
fn c_major() {
    assert_eq!(pitch_classes("major", 0), [0, 2, 4, 5, 7, 9, 11]);
    assert_eq!(notes("major", "C", Accidentals::Sharps), "C D E F G A B");
    assert_eq!(notes("major", "C", Accidentals::Flats), "C D E F G A B");
}

#[test]
fn a_minor_pentatonic() {
    assert_eq!(pitch_classes("minor-pentatonic", 9), [9, 0, 2, 4, 7]);
    assert_eq!(
        notes("minor-pentatonic", "A", Accidentals::Sharps),
        "A C D E G"
    );
}

#[test]
fn e_phrygian_dominant() {
    assert_eq!(
        pitch_classes("phrygian-dominant", 4),
        [4, 5, 8, 9, 11, 0, 2]
    );
    assert_eq!(
        notes("phrygian-dominant", "E", Accidentals::Sharps),
        "E F G♯ A B C D"
    );
    assert_eq!(
        notes("phrygian-dominant", "E", Accidentals::Flats),
        "E F A♭ A B C D"
    );
}

#[test]
fn the_root_keeps_its_spelling() {
    assert_eq!(
        notes("major", "Db", Accidentals::Sharps),
        "D♭ D♯ F F♯ G♯ A♯ C"
    );
    assert_eq!(
        notes("aeolian", "C#", Accidentals::Flats),
        "C♯ E♭ E G♭ A♭ A B"
    );
}

#[test]
fn notes_carry_their_interval_labels() {
    let lydian = ScaleCatalog::builtin().get("lydian").unwrap();
    let labels: Vec<String> = lydian
        .notes("F".parse().unwrap(), Accidentals::Flats)
        .iter()
        .map(|note| format!("{}={}", note.interval, note.name))
        .collect();
    assert_eq!(labels, ["1=F", "2=G", "3=A", "#4=B", "5=C", "6=D", "7=E"]);
}
