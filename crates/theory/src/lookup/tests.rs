use proptest::prelude::*;

use super::*;
use crate::chords::{ChordCatalog, parse_user_chords};
use crate::notes::{Accidentals, Glyphs, NoteName};
use crate::scales::{ScaleCatalog, parse_user_scales};

fn pc(name: &str) -> PitchClass {
    name.parse::<NoteName>().unwrap().pitch_class()
}

fn set(names: &str, bass: Option<&str>) -> NoteSet {
    NoteSet::new(names.split_whitespace().map(pc), bass.map(pc))
}

fn chords(names: &str, bass: Option<&str>, limit: usize) -> Vec<ChordMatch<'static>> {
    lookup_chords(
        ChordCatalog::builtin(),
        &set(names, bass),
        Accidentals::Sharps,
        limit,
    )
}

/// `id root[/bass]`, to compare results as text.
fn show(m: &ChordMatch<'_>) -> String {
    let mut text = format!("{} {}", m.chord.id(), m.root.format(Glyphs::Ascii));
    if let Some(bass) = m.bass {
        text += &format!("/{}", bass.format(Glyphs::Ascii));
    }
    text
}

fn scales(names: &str, bass: Option<&str>, limit: usize) -> Vec<ScaleMatch<'static>> {
    find_scales(
        ScaleCatalog::builtin(),
        &set(names, bass),
        Accidentals::Sharps,
        ScaleSearch {
            max_missing: 0,
            limit,
        },
    )
}

#[test]
fn a_triad_with_the_third_in_the_bass_is_a_slash_chord() {
    let found = chords("C E G", Some("E"), 12);
    let first = &found[0];
    assert_eq!(show(first), "major C/E");
    assert_eq!(first.bass_interval.unwrap().format(Glyphs::Ascii), "3");
    assert_eq!(first.score, BASE_SCORE - SLASH_PENALTY);
    assert!(first.omitted.is_empty());
}

#[test]
fn a_triad_with_the_root_in_the_bass_is_not_a_slash_chord() {
    let found = chords("C E G", Some("C"), 12);
    assert_eq!(show(&found[0]), "major C");
    assert_eq!(found[0].bass, None);
    assert_eq!(found[0].bass_interval, None);
    assert_eq!(found[0].score, BASE_SCORE);
}

#[test]
fn the_ninth_chord_ranks_first() {
    let found = chords("C E G Bb D", None, 12);
    assert_eq!(show(&found[0]), "dom9 C");
    assert_eq!(found[0].score, BASE_SCORE);
    // Whatever else fits is worse.
    assert!(found[1..].iter().all(|m| m.score < found[0].score));
}

#[test]
fn a_ninth_without_its_fifth_is_still_found_with_a_lower_score() {
    let found = chords("C E Bb D", None, 12);
    assert_eq!(show(&found[0]), "dom9 C");
    let omitted: Vec<_> = found[0]
        .omitted
        .iter()
        .map(|i| i.format(Glyphs::Ascii))
        .collect();
    assert_eq!(omitted, ["5"]);
    assert!(found[0].score < BASE_SCORE);
}

#[test]
fn only_the_perfect_fifth_may_be_left_out_of_a_seventh_chord() {
    // C E Bb is C7 without its 5th; C Eb Bb is Cm7 without it; C E G# Bb would need the #5.
    assert_eq!(show(&chords("C E Bb", None, 3)[0]), "dom7 C");
    assert_eq!(show(&chords("C Eb Bb", None, 3)[0]), "min7 C");
    // C Bb is no seventh chord on C (no third); Bb sus2 without its 5th is the only reading.
    let dyad = chords("C Bb", None, 12);
    assert_eq!(dyad.iter().map(show).collect::<Vec<_>>(), ["sus2 A#"]);
    // C G Bb has no 3rd: nothing reads it as dom7.
    assert!(
        chords("C G Bb", None, 12)
            .iter()
            .all(|m| m.chord.id() != "dom7")
    );
}

#[test]
fn the_ninth_may_be_left_out_of_a_thirteenth_chord() {
    let found = chords("C E Bb A", None, 12);
    let thirteenth = found
        .iter()
        .find(|m| m.chord.id() == "dom13" && show(m) == "dom13 C")
        .expect("C13 without 5th and 9th");
    let omitted: Vec<_> = thirteenth
        .omitted
        .iter()
        .map(|i| i.format(Glyphs::Ascii))
        .collect();
    assert_eq!(omitted, ["5", "9"]);
    // A plain ninth chord may not lose its 9th.
    assert!(
        chords("C E G Bb", None, 50)
            .iter()
            .all(|m| { m.chord.id() != "dom9" || !m.omitted.iter().any(|i| i.semitones() == 14) })
    );
}

#[test]
fn root_position_beats_an_inversion_of_an_equal_chord() {
    // C E G A is C6 and Am7: the bass says which.
    let c_bass = chords("C E G A", Some("C"), 12);
    assert_eq!(show(&c_bass[0]), "maj6 C");
    assert!(c_bass.iter().any(|m| show(m) == "min7 A/C"));
    let a_bass = chords("C E G A", Some("A"), 12);
    assert_eq!(show(&a_bass[0]), "min7 A");
    assert!(a_bass.iter().any(|m| show(m) == "maj6 C/A"));
    // Without a bass both are plain, and the tie goes to catalog order, then the root.
    let none = chords("C E G A", None, 2);
    assert_eq!(
        none.iter().map(show).collect::<Vec<_>>(),
        ["maj6 C", "min7 A"]
    );
    assert_eq!(none[0].score, none[1].score);
}

#[test]
fn an_inversion_beats_a_chord_with_its_fifth_left_out() {
    // C Eb G with Eb in the bass: Cm/Eb (95) before Eb6 without its 5th (92).
    let found = chords("C Eb G", Some("Eb"), 12);
    assert_eq!(show(&found[0]), "minor C/D#");
    assert_eq!(found[0].score, 95);
    let sixth = found.iter().find(|m| m.chord.id() == "maj6").unwrap();
    assert_eq!(sixth.score, 92);
}

#[test]
fn an_exact_chord_beats_one_with_a_tone_left_out() {
    // C E G is a major triad; Cmaj7 and C7 are not candidates (their 7th isn't omittable),
    // but a triad on another root with the 5th dropped can be, and ranks lower.
    let found = chords("C E G", None, 12);
    assert_eq!(show(&found[0]), "major C");
    assert!(found[1..].iter().all(|m| m.score < found[0].score));
}

#[test]
fn symmetric_chords_are_listed_on_each_root() {
    let found = chords("C E G#", None, 12);
    let names: Vec<_> = found.iter().map(show).collect();
    assert_eq!(names, ["aug C", "aug E", "aug G#"]);
    // With a bass, the root that is the bass wins.
    let found = chords("C E G#", Some("E"), 12);
    assert_eq!(show(&found[0]), "aug E");
}

#[test]
fn fewer_than_two_notes_find_no_chord() {
    assert!(chords("", None, 12).is_empty());
    assert!(chords("C", None, 12).is_empty());
    assert!(chords("C C", Some("C"), 12).is_empty());
}

#[test]
fn the_bass_is_one_of_the_notes() {
    // A bass that is not in the list is added to it.
    let found = chords("C G", Some("E"), 12);
    assert_eq!(show(&found[0]), "major C/E");
}

#[test]
fn a_note_that_fits_no_chord_gives_nothing() {
    assert!(chords("C C# D D# E F F# G G# A A# B", None, 12).is_empty());
}

#[test]
fn the_limit_cuts_the_list() {
    assert_eq!(chords("C E G A", None, 1).len(), 1);
    assert!(chords("C E G A", None, usize::MAX).len() > 1);
}

#[test]
fn the_root_keeps_to_the_preference_for_spelling() {
    let notes = set("Db F Ab", Some("F"));
    let sharps = lookup_chords(ChordCatalog::builtin(), &notes, Accidentals::Sharps, 1);
    assert_eq!(sharps[0].root.format(Glyphs::Ascii), "C#");
    assert_eq!(sharps[0].bass.unwrap().format(Glyphs::Ascii), "F");
    let flats = lookup_chords(ChordCatalog::builtin(), &notes, Accidentals::Flats, 1);
    assert_eq!(flats[0].root.format(Glyphs::Ascii), "Db");
}

#[test]
fn user_chords_are_searched() {
    let parsed = parse_user_chords(
        r##"
[[chord]]
id = "mystic"
name = "Mystic"
symbol = "myst"
intervals = ["1", "4", "#4", "b7"]
"##,
    );
    assert!(parsed.errors.is_empty());
    let catalog = ChordCatalog::builtin().with_user_chords(parsed.chords);
    let found = lookup_chords(
        &catalog,
        &set("D G G# C", Some("D")),
        Accidentals::Sharps,
        12,
    );
    assert!(found.iter().any(|m| m.chord.id() == "mystic"));
    // Not found in the built-ins alone.
    assert!(
        chords("D G G# C", Some("D"), 50)
            .iter()
            .all(|m| m.chord.id() != "mystic")
    );
}

// Every catalog chord on every root, with every tone in the bass in turn, finds itself, exact.
#[test]
fn every_catalog_chord_finds_itself() {
    let catalog = ChordCatalog::builtin();
    for chord in catalog.chords() {
        for root in (0..12).map(|v| PitchClass::new(v).unwrap()) {
            let tones = chord.pitch_classes(root);
            for (position, &bass) in tones.iter().enumerate() {
                let notes = NoteSet::new(tones.iter().copied(), Some(bass));
                let found = lookup_chords(catalog, &notes, Accidentals::Sharps, usize::MAX);
                let own = found
                    .iter()
                    .find(|m| m.chord.id() == chord.id() && m.root.pitch_class() == root)
                    .unwrap_or_else(|| {
                        panic!("{} on {} bass {}", chord.id(), root.value(), bass.value())
                    });
                assert!(own.omitted.is_empty(), "{}", chord.id());
                let expected = if position == 0 {
                    BASE_SCORE
                } else {
                    BASE_SCORE - SLASH_PENALTY
                };
                assert_eq!(own.score, expected, "{}", chord.id());
                assert_eq!(own.bass.is_some(), position != 0, "{}", chord.id());
                // Nothing fits better than the chord itself (a same-notes chord on the bass can tie or win).
                assert!(found[0].score >= expected, "{}", chord.id());
            }
        }
    }
}

proptest! {
    // Dropping the 5th from a chord's tones still finds it, scored lower, when the chord has
    // other tones to keep and a bass on a remaining tone.
    #[test]
    fn a_chord_without_its_fifth_still_finds_itself(
        chord_index in 0..ChordCatalog::builtin().chords().len(),
        root in 0..12u8,
        bass_pick in 0..16usize,
    ) {
        let catalog = ChordCatalog::builtin();
        let chord = &catalog.chords()[chord_index];
        let root = PitchClass::new(root).unwrap();
        let fifth = root.transpose(7);
        let kept: Vec<_> = chord
            .pitch_classes(root)
            .into_iter()
            .filter(|&p| p != fifth)
            .collect();
        prop_assume!(kept.len() >= 2 && kept.len() < chord.formula().len());
        let bass = kept[bass_pick % kept.len()];
        let notes = NoteSet::new(kept.iter().copied(), Some(bass));
        let found = lookup_chords(catalog, &notes, Accidentals::Flats, usize::MAX);
        let own = found
            .iter()
            .find(|m| m.chord.id() == chord.id() && m.root.pitch_class() == root);
        prop_assert!(own.is_some(), "{} on {}", chord.id(), root.value());
        let own = own.unwrap();
        prop_assert_eq!(own.omitted.len(), 1);
        prop_assert!(own.score < BASE_SCORE);
    }
}

#[test]
fn the_pentatonic_family_ranks_first_in_the_scale_finder() {
    let found = scales("C D E G A", None, 8);
    let first_five: Vec<_> = found[..5]
        .iter()
        .map(|m| format!("{} {}", m.scale.id(), m.root.format(Glyphs::Ascii)))
        .collect();
    assert_eq!(
        first_five,
        [
            "major-pentatonic C",
            "minor-pentatonic A",
            "egyptian D",
            "man-gong E",
            "ritusen G"
        ]
    );
    assert!(found[..5].iter().all(|m| m.extra == 0));
    assert!(found[5..].iter().all(|m| m.extra > 0));
    assert!(found.iter().all(|m| m.unmatched.is_empty()));
}

#[test]
fn the_bass_picks_the_root_among_equal_scales() {
    let found = scales("C D E G A", Some("E"), 2);
    assert_eq!(found[0].scale.id(), "man-gong");
    assert_eq!(found[0].root.format(Glyphs::Ascii), "E");
}

#[test]
fn a_scale_lists_the_notes_in_and_out_of_it() {
    let notes = set("C E G Bb", None);
    let found = find_scales(
        ScaleCatalog::builtin(),
        &notes,
        Accidentals::Flats,
        ScaleSearch {
            max_missing: 1,
            limit: usize::MAX,
        },
    );
    // C major misses only the Bb; C mixolydian has all four.
    let major = found
        .iter()
        .find(|m| m.scale.id() == "major" && m.root.format(Glyphs::Ascii) == "C")
        .unwrap();
    let names = |notes: &[NoteName]| {
        notes
            .iter()
            .map(|n| n.format(Glyphs::Ascii))
            .collect::<Vec<_>>()
    };
    assert_eq!(names(&major.matched), ["C", "E", "G"]);
    assert_eq!(names(&major.unmatched), ["Bb"]);
    assert_eq!(major.extra, 4);
    let mixolydian = found
        .iter()
        .find(|m| m.scale.id() == "mixolydian" && m.root.format(Glyphs::Ascii) == "C")
        .unwrap();
    assert!(mixolydian.unmatched.is_empty());
    assert_eq!(mixolydian.extra, 3);
    // Fewer missing notes rank before fewer extra ones.
    let position = |m: &ScaleMatch<'_>| found.iter().position(|f| f == m).unwrap();
    assert!(position(mixolydian) < position(major));
}

#[test]
fn a_symmetric_scale_is_listed_once() {
    let found = scales("C D E F# G# A#", None, usize::MAX);
    let whole_tone: Vec<_> = found
        .iter()
        .filter(|m| m.scale.id() == "whole-tone")
        .collect();
    assert_eq!(whole_tone.len(), 1);
    assert_eq!(whole_tone[0].extra, 0);
    assert_eq!(found[0].scale.id(), "whole-tone");
}

#[test]
fn scale_roots_are_spelled_by_the_preference() {
    let notes = set("Db Eb F Gb Ab Bb C", None);
    let sharps = find_scales(
        ScaleCatalog::builtin(),
        &notes,
        Accidentals::Sharps,
        ScaleSearch::default(),
    );
    assert_eq!(sharps[0].root.format(Glyphs::Ascii), "C#");
    let flats = find_scales(
        ScaleCatalog::builtin(),
        &notes,
        Accidentals::Flats,
        ScaleSearch::default(),
    );
    assert_eq!(flats[0].root.format(Glyphs::Ascii), "Db");
}

#[test]
fn no_notes_find_no_scale() {
    assert!(scales("", None, 12).is_empty());
}

#[test]
fn user_scales_are_searched() {
    let parsed = parse_user_scales(
        r#"
[[scale]]
id = "tiny"
name = "Tiny"
intervals = ["1", "b2", "4"]
"#,
    );
    assert!(parsed.errors.is_empty());
    let catalog = ScaleCatalog::builtin().with_user_scales(parsed.scales);
    let found = find_scales(
        &catalog,
        &set("C Db F", None),
        Accidentals::Sharps,
        ScaleSearch::default(),
    );
    assert_eq!(found[0].scale.id(), "tiny");
    assert_eq!(found[0].extra, 0);
}

proptest! {
    // Every catalog scale on every root finds itself with nothing extra, and its own tones
    // are all matched.
    #[test]
    fn every_catalog_scale_finds_itself(
        scale_index in 0..ScaleCatalog::builtin().scales().len(),
        root in 0..12u8,
        flats in any::<bool>(),
    ) {
        let catalog = ScaleCatalog::builtin();
        let scale = &catalog.scales()[scale_index];
        let root = PitchClass::new(root).unwrap();
        let notes = NoteSet::new(scale.pitch_classes(root), Some(root));
        let accidentals = if flats { Accidentals::Flats } else { Accidentals::Sharps };
        let found = find_scales(
            catalog,
            &notes,
            accidentals,
            ScaleSearch { max_missing: 0, limit: usize::MAX },
        );
        let own = found.iter().find(|m| {
            m.scale.id() == scale.id() && scale.pitch_classes(m.root.pitch_class()).iter().all(|&p| notes.contains(p))
        });
        prop_assert!(own.is_some());
        let own = own.unwrap();
        prop_assert_eq!(own.extra, 0);
        prop_assert_eq!(own.matched.len(), scale.formula().len());
        prop_assert!(own.unmatched.is_empty());
        prop_assert_eq!(found[0].extra, 0);
    }
}
