use std::collections::HashSet;
use std::time::{Duration, Instant};

use proptest::prelude::*;

use super::*;
use crate::chords::ChordCatalog;
use crate::notes::{Glyphs, NoteName};
use crate::tuning::{InstrumentKind, TuningCatalog};

fn pc(name: &str) -> PitchClass {
    name.parse::<NoteName>().unwrap().pitch_class()
}

fn tuning(id: &str) -> Tuning {
    TuningCatalog::builtin().get(id).unwrap().clone()
}

fn chord(id: &str) -> &'static Chord {
    ChordCatalog::builtin().get(id).unwrap()
}

/// A shape as written: `x32010`, lowest string first; frets above 9 in parentheses.
fn written(voicing: &Voicing) -> String {
    voicing
        .frets()
        .iter()
        .map(|fret| match fret {
            None => "x".to_owned(),
            Some(fret) if *fret < 10 => fret.to_string(),
            Some(fret) => format!("({fret})"),
        })
        .collect()
}

fn generate(
    tuning_id: &str,
    chord_id: &str,
    root: &str,
    capo: u8,
    options: VoicingOptions,
) -> Vec<Voicing> {
    voicings(
        &tuning(tuning_id),
        24,
        capo,
        chord(chord_id),
        pc(root),
        &options,
    )
    .unwrap()
}

fn shapes(found: &[Voicing]) -> Vec<String> {
    found.iter().map(written).collect()
}

fn rank_of(found: &[Voicing], shape: &str) -> Option<usize> {
    found.iter().position(|v| written(v) == shape)
}

#[test]
fn open_c_is_among_the_top_c_major_voicings() {
    let found = generate(
        "guitar-6-standard",
        "major",
        "C",
        0,
        VoicingOptions::default(),
    );
    let rank = rank_of(&found, "x32010");
    assert!(rank.is_some_and(|r| r < 5), "{:?}", shapes(&found[..10]));
    let open_c = &found[rank.unwrap()];
    assert_eq!(open_c.barre, None);
    assert_eq!(
        (open_c.lowest_fret, open_c.span, open_c.played),
        (Some(1), 3, 5)
    );
    assert_eq!(open_c.bass.to_string(), "1");
    assert!(open_c.omitted.is_empty());
    let labels: Vec<String> = open_c.notes().map(|n| n.interval.to_string()).collect();
    assert_eq!(labels, ["1", "3", "5", "1", "3"]);
    // String numbers count from the highest string (ADR-18): the A string is 5.
    let first = open_c.notes().next().unwrap();
    assert_eq!((first.string, first.fret), (5, 3));
    assert_eq!(first.note, "C3".parse().unwrap());
}

#[test]
fn the_e_shape_barre_is_among_the_top_g_major_voicings() {
    let found = generate(
        "guitar-6-standard",
        "major",
        "G",
        0,
        VoicingOptions::default(),
    );
    let rank = rank_of(&found, "355433");
    assert!(rank.is_some_and(|r| r < 5), "{:?}", shapes(&found[..10]));
    let barre = &found[rank.unwrap()];
    assert_eq!(
        barre.barre,
        Some(Barre {
            fret: 3,
            lowest_string: 6,
            highest_string: 1,
        })
    );
    assert_eq!((barre.span, barre.played), (3, 6));
    // The open G shapes are there too, above it.
    assert!(rank_of(&found, "320003").is_some_and(|r| r < rank.unwrap()));
}

/// The shapes a chord book starts with, on standard tuning: the weights were chosen so that
/// each is among the first five (most are first).
#[test]
fn familiar_shapes_rank_high() {
    let familiar = [
        ("major", "C", "x32010"),
        ("major", "G", "320003"),
        ("major", "A", "x02220"),
        ("major", "E", "022100"),
        ("major", "D", "xx0232"),
        ("major", "F", "133211"),
        ("major", "B", "x24442"),
        ("minor", "A", "x02210"),
        ("minor", "E", "022000"),
        ("minor", "D", "xx0231"),
        ("minor", "B", "x24432"),
        ("minor", "F", "133111"),
        ("dom7", "E", "020100"),
        ("dom7", "A", "x02020"),
        ("dom7", "D", "xx0212"),
        ("dom7", "G", "320001"),
        ("dom7", "C", "x32310"),
        ("dom7", "B", "x21202"),
        ("min7", "A", "x02010"),
        ("min7", "E", "020000"),
        ("min7", "D", "xx0211"),
        ("min7", "B", "x20202"),
        ("maj7", "C", "x32000"),
        ("maj7", "D", "xx0222"),
        ("sus4", "A", "x02230"),
        ("sus4", "D", "xx0233"),
        ("sus2", "A", "x02200"),
        ("sus2", "D", "xx0230"),
        ("power", "A", "x022xx"),
    ];
    for (chord_id, root, shape) in familiar {
        let found = generate(
            "guitar-6-standard",
            chord_id,
            root,
            0,
            VoicingOptions::default(),
        );
        let rank = rank_of(&found, shape);
        assert!(
            rank.is_some_and(|r| r < 5),
            "{root} {chord_id} {shape}: {rank:?} in {:?}",
            shapes(&found[..5])
        );
    }
}

#[test]
fn results_come_best_first_and_respect_the_limit() {
    let options = VoicingOptions {
        limit: 7,
        ..VoicingOptions::default()
    };
    let found = generate("guitar-6-standard", "maj7", "F", 0, options);
    assert_eq!(found.len(), 7);
    assert!(found.windows(2).all(|pair| pair[0].score >= pair[1].score));
    let all = generate(
        "guitar-6-standard",
        "maj7",
        "F",
        0,
        VoicingOptions {
            limit: 1000,
            ..VoicingOptions::default()
        },
    );
    // The limit cuts the full ranking; it doesn't change it.
    assert_eq!(found, all[..7]);
    let none = VoicingOptions {
        limit: 0,
        ..VoicingOptions::default()
    };
    assert!(generate("guitar-6-standard", "maj7", "F", 0, none).is_empty());
}

#[test]
fn forbidding_open_strings_moves_the_shapes_up_the_neck() {
    let options = VoicingOptions {
        open_strings: false,
        ..VoicingOptions::default()
    };
    let found = generate("guitar-6-standard", "major", "C", 0, options);
    assert!(!found.is_empty());
    assert!(found.iter().all(|v| v.notes().all(|n| n.fret > 0)));
    assert!(rank_of(&found, "x35553").is_some_and(|r| r < 5));
}

#[test]
fn forbidding_muted_strings_plays_every_string() {
    let options = VoicingOptions {
        muted_strings: false,
        ..VoicingOptions::default()
    };
    let found = generate("guitar-6-standard", "major", "G", 0, options);
    assert!(found.iter().all(|v| v.played == 6));
    assert_eq!(written(&found[0]), "320003");
    // C needs its root in the bass on the low E string: fret 8.
    let c = generate("guitar-6-standard", "major", "C", 0, options);
    assert!(
        c.iter()
            .all(|v| v.strings[0].is_some_and(|n| n.fret == 8 || n.fret == 20))
    );
    assert!(rank_of(&c, "8(10)(10)988").is_some_and(|r| r < 3));
}

#[test]
fn inversions_are_found_only_when_allowed() {
    let without = generate(
        "guitar-6-standard",
        "major",
        "C",
        0,
        VoicingOptions {
            limit: 1000,
            ..VoicingOptions::default()
        },
    );
    assert!(without.iter().all(|v| v.bass.semitones() == 0));
    assert!(rank_of(&without, "032010").is_none());

    let with = generate(
        "guitar-6-standard",
        "major",
        "C",
        0,
        VoicingOptions {
            inversions: true,
            limit: 1000,
            ..VoicingOptions::default()
        },
    );
    let c_over_e = &with[rank_of(&with, "032010").unwrap()];
    assert_eq!(c_over_e.bass.to_string(), "3");
    assert_eq!(
        c_over_e.score,
        6 * STRING_WEIGHT - 2 * SPAN_WEIGHT - POSITION_WEIGHT - INVERSION_PENALTY
    );
    // Root position still ranks the same shapes as before.
    assert!(rank_of(&with, "x32010").is_some());
}

#[test]
fn a_capo_is_the_new_nut() {
    // Capo on 2: the C shape sounds D.
    let found = generate(
        "guitar-6-standard",
        "major",
        "D",
        2,
        VoicingOptions::default(),
    );
    assert!(found.iter().all(|v| v.notes().all(|n| n.fret >= 2)));
    let rank = rank_of(&found, "x54232").unwrap();
    assert!(rank < 5, "{:?}", shapes(&found[..10]));
    let c_shape = &found[rank];
    assert_eq!((c_shape.lowest_fret, c_shape.span), (Some(3), 3));
    // As high on the neck above the capo as the open C is above the nut.
    let open_c = generate(
        "guitar-6-standard",
        "major",
        "C",
        0,
        VoicingOptions::default(),
    );
    assert_eq!(
        c_shape.score,
        open_c[rank_of(&open_c, "x32010").unwrap()].score
    );

    // Without open strings the capo fret is not played.
    let closed = generate(
        "guitar-6-standard",
        "major",
        "D",
        2,
        VoicingOptions {
            open_strings: false,
            ..VoicingOptions::default()
        },
    );
    assert!(closed.iter().all(|v| v.notes().all(|n| n.fret > 2)));
}

#[test]
fn the_fifth_may_be_left_out_but_not_the_third() {
    let found = generate(
        "guitar-6-standard",
        "dom7",
        "C",
        0,
        VoicingOptions {
            limit: 1000,
            ..VoicingOptions::default()
        },
    );
    assert!(
        found
            .iter()
            .any(|v| v.omitted.iter().any(|i| i.to_string() == "5"))
    );
    for v in &found {
        let labels: HashSet<String> = v.notes().map(|n| n.interval.to_string()).collect();
        for needed in ["1", "3", "b7"] {
            assert!(labels.contains(needed), "{} lacks {needed}", written(v));
        }
    }
    // x3231x: C E Bb C, no 5th.
    let no_fifth = &found[rank_of(&found, "x3231x").unwrap()];
    assert_eq!(no_fifth.omitted.len(), 1);
    assert_eq!(no_fifth.omitted[0].to_string(), "5");
}

#[test]
fn extended_chords_keep_their_labels_and_may_drop_the_ninth() {
    let found = generate(
        "guitar-6-standard",
        "dom13",
        "G",
        0,
        VoicingOptions {
            limit: 1000,
            ..VoicingOptions::default()
        },
    );
    assert!(!found.is_empty());
    for v in &found {
        let labels: HashSet<String> = v.notes().map(|n| n.interval.to_string()).collect();
        for needed in ["1", "3", "b7", "13"] {
            assert!(labels.contains(needed), "{} lacks {needed}", written(v));
        }
        // E is labelled as the 13th, not the 6th.
        assert!(!labels.contains("6"));
    }
    assert!(
        found
            .iter()
            .any(|v| v.omitted.iter().map(ToString::to_string).eq(["5", "9"]))
    );
    // 3x3455: G F B E, the classic shape.
    assert!(rank_of(&found, "3x345x").is_some() || rank_of(&found, "3x3455").is_some());
}

#[test]
fn chords_without_a_third_keep_their_defining_tones() {
    let sus4 = generate(
        "guitar-6-standard",
        "sus4",
        "D",
        0,
        VoicingOptions::default(),
    );
    assert!(rank_of(&sus4, "xx0233").is_some_and(|r| r < 5));
    for v in &sus4 {
        assert!(v.notes().any(|n| n.interval.to_string() == "4"));
    }
    let power = generate(
        "guitar-6-standard",
        "power",
        "E",
        0,
        VoicingOptions {
            limit: 1000,
            ..VoicingOptions::default()
        },
    );
    // The two-string power chord is allowed, and the 5th is never dropped.
    assert!(power.iter().any(|v| v.played == 2));
    assert!(power.iter().all(|v| v.omitted.is_empty()));
    assert!(rank_of(&power, "022xxx").is_some_and(|r| r < 10));
}

#[test]
fn a_chord_with_more_required_tones_than_strings_has_no_voicings() {
    // The altered dominant has seven tones and none may be left out.
    let found = generate(
        "guitar-6-standard",
        "dom7alt",
        "C",
        0,
        VoicingOptions::default(),
    );
    assert!(found.is_empty());
}

#[test]
fn bad_necks_and_spans_are_errors() {
    let standard = tuning("guitar-6-standard");
    let major = chord("major");
    let options = VoicingOptions::default();
    assert_eq!(
        voicings(&standard, 11, 0, major, pc("C"), &options),
        Err(VoicingError::Fretboard(FretboardError::Frets(11)))
    );
    assert_eq!(
        voicings(&standard, 12, 12, major, pc("C"), &options),
        Err(VoicingError::Fretboard(FretboardError::Capo {
            capo: 12,
            frets: 12
        }))
    );
    for span in [0, MAX_SPAN + 1] {
        let options = VoicingOptions {
            max_span: span,
            ..options
        };
        assert_eq!(
            voicings(&standard, 24, 0, major, pc("C"), &options),
            Err(VoicingError::Span(span))
        );
    }
    assert!(VoicingError::Span(9).to_string().contains("1 to 6"));
}

#[test]
fn works_on_every_builtin_tuning() {
    for tuning in TuningCatalog::builtin().tunings() {
        let found = voicings(
            tuning,
            24,
            0,
            chord("major"),
            pc("A"),
            &VoicingOptions::default(),
        )
        .unwrap();
        assert!(!found.is_empty(), "{}", tuning.id());
        for v in &found {
            assert_eq!(v.strings.len(), tuning.string_count());
            assert_eq!(
                judge(
                    tuning,
                    24,
                    0,
                    chord("major"),
                    pc("A"),
                    &VoicingOptions::default(),
                    &v.frets()
                )
                .as_ref(),
                Some(v),
                "{}",
                tuning.id()
            );
        }
    }
}

/// Generating any catalog chord on a 9-string guitar takes less than 100 ms (the issue's
/// budget), with the default options and with the widest span, inversions and a long list.
/// The search is fast enough that this holds in unoptimised test builds too (a few ms in a
/// release build).
#[test]
fn nine_strings_generate_fast() {
    let budget = Duration::from_millis(100);
    let nine = tuning("guitar-9-standard");
    assert_eq!(nine.string_count(), 9);
    let wide = VoicingOptions {
        max_span: MAX_SPAN,
        inversions: true,
        limit: 200,
        ..VoicingOptions::default()
    };
    let mut slowest = (Duration::ZERO, "");
    for chord in ChordCatalog::builtin().chords() {
        for options in [VoicingOptions::default(), wide] {
            let start = Instant::now();
            let found = voicings(&nine, 24, 0, chord, pc("E"), &options).unwrap();
            let took = start.elapsed();
            assert!(took < budget, "{} took {took:?}", chord.id());
            assert!(
                !found.is_empty() || chord.formula().len() > 6,
                "{}",
                chord.id()
            );
            slowest = slowest.max((took, chord.id()));
        }
    }
    eprintln!("slowest: {} in {:?}", slowest.1, slowest.0);
}

// ---------------------------------------------------------------------------------------------
// An independent statement of the rules, to check every result against.

/// What the voicing of `frets` (lowest string first) must be, or `None` if `frets` is not a
/// valid voicing. Written from ADR-33, not from the search.
fn judge(
    tuning: &Tuning,
    neck: u8,
    capo: u8,
    chord: &Chord,
    root: PitchClass,
    options: &VoicingOptions,
    frets: &[Option<u8>],
) -> Option<Voicing> {
    let count = tuning.string_count();
    assert_eq!(frets.len(), count);
    let intervals = chord.formula().intervals();
    let label = |note: Note| {
        intervals
            .iter()
            .copied()
            .find(|&i| root.up(i) == note.pitch_class())
    };
    let mut strings = Vec::new();
    for (index, fret) in frets.iter().enumerate() {
        strings.push(match *fret {
            None if !options.muted_strings => return None,
            None => None,
            Some(fret) => {
                if fret < capo || fret > neck || (fret == capo && !options.open_strings) {
                    return None;
                }
                let note = tuning.notes()[index].transpose(i32::from(fret)).unwrap();
                Some(VoicedNote {
                    string: (count - index) as u8,
                    fret,
                    note,
                    interval: label(note)?,
                })
            }
        });
    }
    let played: Vec<VoicedNote> = strings.iter().flatten().copied().collect();
    let has = |i: &Interval| played.iter().any(|n| n.interval == *i);
    let omitted: Vec<Interval> = intervals.iter().copied().filter(|i| !has(i)).collect();
    let semis: Vec<u8> = intervals.iter().map(|i| i.semitones()).collect();
    for i in &omitted {
        let ok = match i.semitones() {
            7 => true,
            14 => semis.iter().any(|s| [17, 18, 20, 21].contains(s)),
            17 => semis.iter().any(|s| [20, 21].contains(s)),
            _ => false,
        };
        if !ok {
            return None;
        }
    }
    let distinct: HashSet<PitchClass> = played.iter().map(|n| n.note.pitch_class()).collect();
    if distinct.len() < 2 || played.len() < intervals.len().min(3) {
        return None;
    }
    let bass = played.iter().min_by_key(|n| n.note).unwrap().interval;
    if bass.semitones() != 0 && !options.inversions {
        return None;
    }
    let fretted: Vec<&VoicedNote> = played.iter().filter(|n| n.fret > capo).collect();
    let low = fretted.iter().map(|n| n.fret).min();
    let high = fretted.iter().map(|n| n.fret).max();
    let span = low.map_or(0, |low| high.unwrap() - low + 1);
    if span > options.max_span {
        return None;
    }
    let barre = if fretted.len() <= 4 {
        None
    } else {
        let low = low.unwrap();
        let on_low: Vec<u8> = fretted
            .iter()
            .filter(|n| n.fret == low)
            .map(|n| n.string)
            .collect();
        let (lowest, highest) = (*on_low.iter().max().unwrap(), *on_low.iter().min().unwrap());
        let under =
            (highest..=lowest).all(|s| strings[count - s as usize].is_some_and(|n| n.fret > capo));
        let above = fretted.iter().filter(|n| n.fret > low).count();
        if lowest == highest || !under || above + 1 > 4 {
            return None;
        }
        Some(Barre {
            fret: low,
            lowest_string: lowest,
            highest_string: highest,
        })
    };
    let first = strings.iter().position(Option::is_some).unwrap();
    let last = strings.iter().rposition(Option::is_some).unwrap();
    let inner = strings[first..=last].iter().filter(|s| s.is_none()).count() as i32;
    // Open strings stretch the diagram down to the nut.
    let open = played.iter().any(|n| n.fret == capo);
    let footprint = match (low, high) {
        (Some(_), Some(high)) if open => high - capo,
        _ => span,
    };
    let score = STRING_WEIGHT * played.len() as i32
        - SPAN_WEIGHT * i32::from(footprint.saturating_sub(1))
        - POSITION_WEIGHT * i32::from(low.map_or(0, |low| low - capo))
        - INNER_MUTE_PENALTY * inner
        - if bass.semitones() == 0 {
            0
        } else {
            INVERSION_PENALTY
        }
        - if barre.is_some() { BARRE_PENALTY } else { 0 };
    Some(Voicing {
        played: played.len(),
        strings,
        bass,
        omitted,
        lowest_fret: low,
        span,
        barre,
        score,
    })
}

fn any_tuning() -> impl Strategy<Value = Tuning> {
    prop::collection::vec(Tuning::LOWEST_NOTE..=Tuning::HIGHEST_NOTE, 4..=9).prop_map(|midis| {
        let notes = midis
            .into_iter()
            .map(|m| Note::from_midi(m).unwrap())
            .collect();
        Tuning::new("random", "Random", InstrumentKind::Guitar, notes).unwrap()
    })
}

fn any_options() -> impl Strategy<Value = VoicingOptions> {
    (
        1..=MAX_SPAN,
        any::<bool>(),
        any::<bool>(),
        any::<bool>(),
        1..=60usize,
    )
        .prop_map(
            |(max_span, open_strings, muted_strings, inversions, limit)| VoicingOptions {
                max_span,
                open_strings,
                muted_strings,
                inversions,
                limit,
            },
        )
}

fn any_chord() -> impl Strategy<Value = &'static Chord> {
    let chords = ChordCatalog::builtin().chords();
    (0..chords.len()).prop_map(move |index| &chords[index])
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]

    #[test]
    fn every_result_satisfies_its_constraints(
        tuning in any_tuning(),
        neck in 12u8..=24,
        capo in 0u8..=5,
        chord in any_chord(),
        root in 0u8..12,
        options in any_options(),
    ) {
        let root = PitchClass::new(root).unwrap();
        let found = voicings(&tuning, neck, capo, chord, root, &options).unwrap();
        prop_assert!(found.len() <= options.limit);
        let mut seen = HashSet::new();
        for v in &found {
            let expected = judge(&tuning, neck, capo, chord, root, &options, &v.frets());
            prop_assert_eq!(expected.as_ref(), Some(v), "{}", written(v));
            prop_assert!(seen.insert(v.frets()), "{} twice", written(v));
        }
        prop_assert!(found.windows(2).all(|pair| pair[0].score >= pair[1].score));
    }

    /// On a small neck the search can be compared with trying every fret on every string.
    #[test]
    fn finds_every_valid_shape_on_four_strings(
        notes in prop::collection::vec(28u8..=60, 4),
        capo in 0u8..=3,
        chord in any_chord(),
        root in 0u8..12,
        options in any_options(),
    ) {
        let notes = notes.into_iter().map(|m| Note::from_midi(m).unwrap()).collect();
        let tuning = Tuning::new("four", "Four", InstrumentKind::Bass, notes).unwrap();
        let root = PitchClass::new(root).unwrap();
        let options = VoicingOptions { limit: usize::MAX, ..options };
        let neck = 12;
        let mut expected: Vec<Voicing> = Vec::new();
        let choices: Vec<Option<u8>> = std::iter::once(None).chain((0..=neck).map(Some)).collect();
        for a in &choices {
            for b in &choices {
                for c in &choices {
                    for d in &choices {
                        if let Some(v) = judge(&tuning, neck, capo, chord, root, &options, &[*a, *b, *c, *d]) {
                            expected.push(v);
                        }
                    }
                }
            }
        }
        let found = voicings(&tuning, neck, capo, chord, root, &options).unwrap();
        let key = |v: &Voicing| v.frets();
        let mut found_shapes: Vec<_> = found.iter().map(key).collect();
        let mut expected_shapes: Vec<_> = expected.iter().map(key).collect();
        found_shapes.sort();
        expected_shapes.sort();
        prop_assert_eq!(found_shapes, expected_shapes);
    }

    /// The search skips branches that can't make the list; that must not change the list.
    #[test]
    fn a_limit_takes_the_top_of_the_full_ranking(
        tuning in any_tuning().prop_filter("six strings or fewer", |t| t.string_count() <= 6),
        capo in 0u8..=5,
        chord in any_chord(),
        root in 0u8..12,
        options in any_options(),
    ) {
        let root = PitchClass::new(root).unwrap();
        let limited = voicings(&tuning, 24, capo, chord, root, &options).unwrap();
        let all = VoicingOptions { limit: usize::MAX, ..options };
        let all = voicings(&tuning, 24, capo, chord, root, &all).unwrap();
        prop_assert_eq!(&limited[..], &all[..all.len().min(options.limit)]);
    }
}

#[test]
fn written_shapes_use_ascii_labels() {
    // A guard for the helpers above: intervals print as the catalog writes them.
    let found = generate(
        "guitar-6-standard",
        "dom7sharp9",
        "E",
        0,
        VoicingOptions::default(),
    );
    assert!(
        found
            .iter()
            .all(|v| v.notes().any(|n| n.interval.format(Glyphs::Ascii) == "#9"))
    );
}
