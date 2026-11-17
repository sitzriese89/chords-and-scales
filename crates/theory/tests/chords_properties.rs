//! Chord catalog properties: chord tones follow the root and the sharp/flat preference, and any
//! chord a user file can hold loads and merges, and what the chord editor saves reads back.

use proptest::prelude::*;
use theory::{
    Accidentals, Chord, ChordCatalog, ChordSpec, Glyphs, Interval, NoteName, NoteSet, PitchClass,
    Source, lookup_chords, parse_user_chords, write_chords,
};

const ROOTS: [&str; 17] = [
    "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B",
];

fn preference(sharps: bool) -> Accidentals {
    if sharps {
        Accidentals::Sharps
    } else {
        Accidentals::Flats
    }
}

proptest! {
    /// Every built-in chord on every root: the notes sit at the formula's intervals above the
    /// root, the root keeps its spelling, every other note follows the preference, and no two
    /// notes share a pitch class.
    #[test]
    fn chord_tones_follow_the_root_and_the_preference(
        index in 0usize..1000,
        root in 0..ROOTS.len(),
        sharps in any::<bool>(),
    ) {
        let chords = ChordCatalog::builtin().chords();
        let chord = &chords[index % chords.len()];
        let root: NoteName = ROOTS[root].parse().unwrap();
        let notes = chord.notes(root, preference(sharps));

        prop_assert_eq!(notes.len(), chord.formula().len());
        prop_assert_eq!(notes[0].name, root);
        let mut seen = Vec::new();
        for note in &notes {
            let expected = root.pitch_class().up(note.interval);
            prop_assert_eq!(note.pitch_class(), expected, "{} on {}", chord.id(), root);
            prop_assert!(!seen.contains(&expected), "{} repeats a note", chord.id());
            seen.push(expected);
        }
        for note in &notes[1..] {
            let name = note.name.format(Glyphs::Ascii);
            prop_assert!(
                !name.contains(if sharps { 'b' } else { '#' }) && name.len() <= 2,
                "{} on {}: {name}", chord.id(), root
            );
        }
    }

    /// Moving the root up by n semitones moves every chord tone up by n.
    #[test]
    fn transposing_the_root_transposes_the_chord(index in 0usize..1000, root in 0u8..12, by in 0u8..12) {
        let chords = ChordCatalog::builtin().chords();
        let chord = &chords[index % chords.len()];
        let at = |root: u8| chord.pitch_classes(PitchClass::new(root).unwrap());
        let moved: Vec<u8> = at(root).into_iter().map(|pc| (pc.value() + by) % 12).collect();
        let there: Vec<u8> = at((root + by) % 12).into_iter().map(PitchClass::value).collect();
        prop_assert_eq!(moved, there);
    }

    /// Any chord with distinct pitch classes within two octaves loads from a user file, on a
    /// root it has the tones it was given, and merges after the built-ins.
    #[test]
    fn user_chords_load_and_merge(
        tones in prop::collection::btree_map(1u8..12, 0u8..2, 1..11),
        root in 0u8..12,
    ) {
        // Semitones above the root, each pitch class in the first or second octave, ascending.
        let mut semitones: Vec<u8> = tones.iter().map(|(&pc, &octave)| pc + 12 * octave).collect();
        semitones.sort_unstable();
        let labels: Vec<String> = std::iter::once("1".to_owned())
            .chain(semitones.iter().map(|&s| Interval::from_semitones(s).unwrap().to_string()))
            .collect();
        let quoted: Vec<String> = labels.iter().map(|label| format!("{label:?}")).collect();
        let toml = format!(
            "[[chord]]\nid = \"mine\"\nname = \"Mine\"\nsymbol = \"mine\"\nintervals = [{}]\n",
            quoted.join(", ")
        );
        let parsed = parse_user_chords(&toml);
        prop_assert_eq!(&parsed.errors, &[]);
        let chord = &parsed.chords[0];
        prop_assert_eq!(chord.source(), Source::User);
        let wanted: Vec<u8> = std::iter::once(0).chain(semitones.iter().copied()).collect();
        prop_assert_eq!(chord.formula().semitones().collect::<Vec<_>>(), wanted);
        let values: Vec<u8> = chord
            .pitch_classes(PitchClass::new(root).unwrap())
            .into_iter()
            .map(PitchClass::value)
            .collect();
        for (value, semitone) in values.iter().zip(&chord.formula().semitones().collect::<Vec<_>>()) {
            prop_assert_eq!(*value, (root + semitone) % 12);
        }

        let builtin = ChordCatalog::builtin();
        let merged = builtin.with_user_chords(parsed.chords.clone());
        prop_assert_eq!(merged.chords().len(), builtin.chords().len() + 1);
        prop_assert_eq!(merged.chords().last().unwrap(), chord);
        prop_assert_eq!(merged.find_by_symbol("mine"), Some(chord));
    }

    /// Whatever the chord editor can make, `write_chords` writes a file that reads back as the
    /// same chords, in order, and writing them again gives the same text. Every saved chord is
    /// then typeable and found by reverse lookup on any root (ADR-36).
    #[test]
    fn written_chords_read_back_and_are_found(
        items in prop::collection::vec(
            (
                prop::collection::btree_map(1u8..12, 0u8..2, 1..8),
                "[A-Za-z0-9 ♯♭#\"\\\\'-]{0,16}",
                "[a-z]{0,4}",
                any::<bool>(),
                prop::option::of("[A-Za-z][A-Za-z ]{0,10}"),
            ),
            0..5,
        ),
        root in 0u8..12,
    ) {
        let mut catalog = ChordCatalog::builtin().clone();
        let mut chords = Vec::new();
        for (i, (tones, name, letters, jazz, family)) in items.iter().enumerate() {
            let mut semitones: Vec<u8> =
                tones.iter().map(|(&pc, &octave)| pc + 12 * octave).collect();
            semitones.sort_unstable();
            let intervals: Vec<String> = std::iter::once("1".to_owned())
                .chain(semitones.iter().map(|&s| Interval::from_semitones(s).unwrap().to_string()))
                .collect();
            let name = format!("My {name} {i}");
            // `q` is no built-in suffix's first letter, so these are free and readable.
            let symbol = format!("q{i}{letters}");
            let chord = Chord::new(ChordSpec {
                id: catalog.new_id(&name),
                name,
                symbol: symbol.clone(),
                aliases: Vec::new(),
                jazz_symbol: jazz.then(|| format!("Q{i}{letters}#9")),
                family: family.clone(),
                intervals,
            })
            .unwrap();
            catalog = catalog.with_user_chords([chord.clone()]);
            chords.push(chord);
        }
        let text = write_chords(&chords).unwrap();
        let parsed = parse_user_chords(&text);
        prop_assert_eq!(&parsed.errors, &[]);
        prop_assert_eq!(&parsed.chords, &chords);
        prop_assert_eq!(write_chords(&parsed.chords).unwrap(), text);

        let merged = ChordCatalog::builtin().with_user_chords(parsed.chords);
        let on = PitchClass::new(root).unwrap();
        for chord in &chords {
            let found = merged.parse_symbol(&format!("C{}", chord.symbol())).unwrap();
            prop_assert_eq!(found.chord_id.as_str(), chord.id());
            let notes = NoteSet::new(chord.pitch_classes(on), Some(on));
            let matches = lookup_chords(&merged, &notes, Accidentals::Sharps, usize::MAX);
            prop_assert!(
                matches.iter().any(|m| m.chord.id() == chord.id() && m.root.pitch_class() == on),
                "{} not found", chord.id()
            );
        }
    }
}

#[test]
fn the_issue_examples() {
    let tones = |id: &str, root: &str, accidentals| {
        let root: NoteName = root.parse().unwrap();
        ChordCatalog::builtin()
            .get(id)
            .unwrap()
            .notes(root, accidentals)
            .iter()
            .map(|note| note.name.format(Glyphs::Unicode))
            .collect::<Vec<_>>()
            .join(" ")
    };
    assert_eq!(tones("maj7", "C", Accidentals::Sharps), "C E G B");
    assert_eq!(tones("min7b5", "F♯", Accidentals::Sharps), "F♯ A C E");
    assert_eq!(tones("dom7sharp9", "G", Accidentals::Sharps), "G B D F A♯");
    assert_eq!(tones("dom7sharp9", "G", Accidentals::Flats), "G B D F B♭");
    assert_eq!(tones("sus4", "D", Accidentals::Flats), "D G A");
}
