use super::*;
use crate::chords::{Chord, ChordSpec};
use crate::notes::Glyphs;
use crate::scales::ScaleCatalog;

fn run(
    scale: &str,
    root: &str,
    accidentals: Accidentals,
    stacking: Stacking,
    chords: &ChordCatalog,
) -> Vec<HarmonizedDegree> {
    let scale = ScaleCatalog::builtin().get(scale).expect("scale");
    harmonize(scale, root.parse().unwrap(), accidentals, stacking, chords)
}

fn degrees(scale: &str, root: &str, stacking: Stacking) -> Vec<HarmonizedDegree> {
    run(
        scale,
        root,
        Accidentals::Sharps,
        stacking,
        ChordCatalog::builtin(),
    )
}

/// `numeral chord-id`, or `-` for no chord, per degree.
fn table(scale: &str, root: &str, stacking: Stacking) -> Vec<String> {
    degrees(scale, root, stacking)
        .iter()
        .map(|degree| match &degree.chord {
            Some(chord) => format!(
                "{} {}",
                chord.numeral.format(Glyphs::Ascii),
                chord.chord_id.as_deref().unwrap_or("?")
            ),
            None => "-".to_owned(),
        })
        .collect()
}

fn chord_names(scale: &str, root: &str, stacking: Stacking) -> Vec<String> {
    degrees(scale, root, stacking)
        .iter()
        .map(|degree| match &degree.chord {
            Some(chord) => chord
                .tones
                .iter()
                .map(|tone| tone.name.format(Glyphs::Ascii))
                .collect::<Vec<_>>()
                .join(" "),
            None => "-".to_owned(),
        })
        .collect()
}

#[test]
fn major_triads() {
    assert_eq!(
        table("major", "C", Stacking::Triads),
        [
            "I major",
            "ii minor",
            "iii minor",
            "IV major",
            "V major",
            "vi minor",
            "vii° dim"
        ]
    );
}

#[test]
fn major_sevenths() {
    assert_eq!(
        table("major", "C", Stacking::Sevenths),
        [
            "Imaj7 maj7",
            "ii7 min7",
            "iii7 min7",
            "IVmaj7 maj7",
            "V7 dom7",
            "vi7 min7",
            "viiø7 min7b5"
        ]
    );
}

#[test]
fn natural_minor_triads_and_sevenths() {
    assert_eq!(
        table("aeolian", "A", Stacking::Triads),
        [
            "i minor",
            "ii° dim",
            "III major",
            "iv minor",
            "v minor",
            "VI major",
            "VII major"
        ]
    );
    assert_eq!(
        table("aeolian", "A", Stacking::Sevenths),
        [
            "i7 min7",
            "iiø7 min7b5",
            "IIImaj7 maj7",
            "iv7 min7",
            "v7 min7",
            "VImaj7 maj7",
            "VII7 dom7"
        ]
    );
}

#[test]
fn harmonic_minor_triads_and_sevenths() {
    assert_eq!(
        table("harmonic-minor", "A", Stacking::Triads),
        [
            "i minor",
            "ii° dim",
            "III+ aug",
            "iv minor",
            "V major",
            "VI major",
            "vii° dim"
        ]
    );
    assert_eq!(
        table("harmonic-minor", "A", Stacking::Sevenths),
        [
            "imaj7 minmaj7",
            "iiø7 min7b5",
            "III+maj7 maj7sharp5",
            "iv7 min7",
            "V7 dom7",
            "VImaj7 maj7",
            "vii°7 dim7"
        ]
    );
}

#[test]
fn melodic_minor_triads_and_sevenths() {
    assert_eq!(
        table("melodic-minor", "A", Stacking::Triads),
        [
            "i minor",
            "ii minor",
            "III+ aug",
            "IV major",
            "V major",
            "vi° dim",
            "vii° dim"
        ]
    );
    assert_eq!(
        table("melodic-minor", "A", Stacking::Sevenths),
        [
            "imaj7 minmaj7",
            "ii7 min7",
            "III+maj7 maj7sharp5",
            "IV7 dom7",
            "V7 dom7",
            "viø7 min7b5",
            "viiø7 min7b5"
        ]
    );
}

#[test]
fn tones_are_the_scale_notes_in_scale_spelling() {
    assert_eq!(
        chord_names("major", "C", Stacking::Sevenths),
        [
            "C E G B", "D F A C", "E G B D", "F A C E", "G B D F", "A C E G", "B D F A"
        ]
    );
    let harmonic = degrees("harmonic-minor", "A", Stacking::Sevenths);
    let tones = &harmonic[2].chord.as_ref().unwrap().tones;
    let labels: Vec<String> = tones.iter().map(|t| t.interval.to_string()).collect();
    assert_eq!(labels, ["1", "3", "#5", "7"]);
    assert_eq!(harmonic[2].root.interval.to_string(), "b3");
    assert_eq!(harmonic[2].degree, 3);
}

#[test]
fn the_root_keeps_its_spelling_and_the_rest_follow_the_preference() {
    let flats = run(
        "major",
        "Db",
        Accidentals::Sharps,
        Stacking::Triads,
        ChordCatalog::builtin(),
    );
    let names: Vec<String> = flats
        .iter()
        .map(|d| d.root.name.format(Glyphs::Ascii))
        .collect();
    // The root stays Db; the other notes are spelled by the sharp preference.
    assert_eq!(names, ["Db", "D#", "F", "F#", "G#", "A#", "C"]);
    let flats = run(
        "major",
        "Db",
        Accidentals::Flats,
        Stacking::Triads,
        ChordCatalog::builtin(),
    );
    let names: Vec<String> = flats
        .iter()
        .map(|d| d.root.name.format(Glyphs::Ascii))
        .collect();
    assert_eq!(names, ["Db", "Eb", "F", "Gb", "Ab", "Bb", "C"]);
}

#[test]
fn minor_pentatonic_has_thirds_only_where_the_scale_has_them() {
    // C Eb F G Bb: Cm (C Eb G, and Cm7 with Bb) and Eb (Eb G Bb); F, G and Bb have no third
    // and fifth in the scale.
    assert_eq!(
        table("minor-pentatonic", "C", Stacking::Triads),
        ["i minor", "bIII major", "-", "-", "-"]
    );
    assert_eq!(
        table("minor-pentatonic", "C", Stacking::Sevenths),
        ["i7 min7", "-", "-", "-", "-"]
    );
    assert_eq!(
        chord_names("minor-pentatonic", "C", Stacking::Sevenths)[0],
        "C D# G A#"
    );
}

#[test]
fn whole_tone_is_augmented_triads_and_no_sevenths() {
    assert_eq!(
        table("whole-tone", "C", Stacking::Triads),
        [
            "I+ aug",
            "II+ aug",
            "III+ aug",
            "#IV+ aug",
            "#V+ aug",
            "bVII+ aug"
        ]
    );
    assert_eq!(
        table("whole-tone", "C", Stacking::Sevenths),
        ["-", "-", "-", "-", "-", "-"]
    );
}

#[test]
fn a_chromatic_scale_has_no_thirds_to_stack_so_no_chords() {
    assert!(
        table("chromatic", "C", Stacking::Triads)
            .iter()
            .all(|cell| cell == "-")
    );
}

#[test]
fn an_eight_note_scale_numbers_by_label() {
    // Diminished (whole-half): C D Eb F Gb Ab A B.
    let table = table("diminished-whole-half", "C", Stacking::Sevenths);
    assert_eq!(table.len(), 8);
    assert_eq!(table[0], "i°7 dim7");
}

#[test]
fn a_degree_with_no_third_in_a_seven_note_scale_has_no_chord() {
    // Hungarian minor (C D Eb F# G Ab B): B C D Eb is no stack of thirds; the cluster at the
    // top has no chord on B in sevenths.
    let table = table("hungarian-minor", "C", Stacking::Sevenths);
    assert_eq!(table.len(), 7);
    assert!(
        table.iter().any(|cell| cell == "-"),
        "{table:?} has a no-chord degree"
    );
    assert!(table.iter().any(|cell| cell != "-"));
}

#[test]
fn chords_are_named_from_the_catalog_given_so_user_chords_count() {
    let user = Chord::new(ChordSpec {
        id: "my-major".into(),
        name: "My major".into(),
        symbol: "mymaj".into(),
        aliases: vec![],
        jazz_symbol: None,
        family: None,
        intervals: vec!["1".into(), "3".into(), "5".into()],
    })
    .unwrap();
    let catalog = ChordCatalog::builtin().with_user_chords([user]);
    let degrees = run(
        "major",
        "C",
        Accidentals::Sharps,
        Stacking::Triads,
        &catalog,
    );
    let id = |i: usize| degrees[i].chord.as_ref().unwrap().chord_id.clone();
    // The last chord with the intervals wins: the user's.
    assert_eq!(id(0).as_deref(), Some("my-major"));
    assert_eq!(id(1).as_deref(), Some("minor"));
}

#[test]
fn a_stack_the_catalog_lacks_still_gets_tones_and_a_numeral() {
    // A catalog whose major triad was replaced by something else.
    let user = Chord::new(ChordSpec {
        id: "major".into(),
        name: "Odd".into(),
        symbol: "odd".into(),
        aliases: vec![],
        jazz_symbol: None,
        family: None,
        intervals: vec!["1".into(), "2".into(), "5".into()],
    })
    .unwrap();
    let catalog = ChordCatalog::builtin().with_user_chords([user]);
    let degrees = run(
        "major",
        "C",
        Accidentals::Sharps,
        Stacking::Triads,
        &catalog,
    );
    let chord = degrees[0].chord.as_ref().unwrap();
    assert_eq!(chord.chord_id, None);
    assert_eq!(chord.numeral.format(Glyphs::Ascii), "I");
    assert_eq!(chord.tones.len(), 3);
}

#[test]
fn every_builtin_scale_harmonizes_without_panicking() {
    for scale in ScaleCatalog::builtin().scales() {
        for stacking in [Stacking::Triads, Stacking::Sevenths] {
            let degrees = harmonize(
                scale,
                "C".parse().unwrap(),
                Accidentals::Sharps,
                stacking,
                ChordCatalog::builtin(),
            );
            assert_eq!(degrees.len(), scale.formula().len());
            for degree in degrees.iter().filter_map(|d| d.chord.as_ref()) {
                assert!(degree.chord_id.is_some(), "{}", scale.id());
                assert_eq!(
                    degree.tones.len(),
                    if stacking == Stacking::Triads { 3 } else { 4 }
                );
            }
        }
    }
}

#[test]
fn numeral_text_in_unicode() {
    let harmonic = degrees("harmonic-minor", "A", Stacking::Sevenths);
    let numeral = harmonic[2].chord.as_ref().unwrap().numeral;
    assert_eq!(numeral.format(Glyphs::Unicode), "III+maj7");
    let numeral = degrees("minor-pentatonic", "C", Stacking::Triads)[1]
        .chord
        .as_ref()
        .unwrap()
        .numeral;
    assert_eq!(numeral.format(Glyphs::Unicode), "♭III");
    assert_eq!(numeral.accidental, -1);
    assert_eq!(numeral.number, 3);
    assert!(!numeral.lowercase);
}
