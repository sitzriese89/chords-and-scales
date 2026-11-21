use proptest::prelude::*;

use super::*;
use crate::chords::ChordCatalog;
use crate::formula::Formula;
use crate::notes::{Interval, PitchClass};
use crate::scales::{Scale, ScaleCatalog};

fn formula(labels: &str) -> Formula {
    let labels: Vec<&str> = labels.split_whitespace().collect();
    Formula::parse(&labels).unwrap()
}

fn feature(labels: &str, feature: Feature) -> u8 {
    Features::of(&formula(labels)).get(feature)
}

fn scale_tags(id: &str) -> Vec<&'static str> {
    let scale = ScaleCatalog::builtin().get(id).unwrap();
    TagRules::builtin().scale_tags(scale)
}

fn chord_tags(id: &str) -> Vec<&'static str> {
    let chord = ChordCatalog::builtin().get(id).unwrap();
    TagRules::builtin().chord_tags(chord)
}

fn errors(parsed: &ParsedTagRules) -> Vec<String> {
    parsed.errors.iter().map(ToString::to_string).collect()
}

#[test]
fn builtin_tag_rules_are_valid() {
    let parsed = TagRules::default().with_user_rules(include_str!("../../data/tags.toml"));
    assert_eq!(
        errors(&parsed),
        Vec::<String>::new(),
        "built-in rule errors"
    );
    let rules = &parsed.rules;
    assert_eq!(rules, TagRules::builtin());
    assert!(rules.tags().len() >= 8, "{} tags", rules.tags().len());
    for tag in [
        "sad",
        "evil",
        "melancholic",
        "dissonant",
        "jazzy",
        "bright",
        "exotic",
        "dark",
    ] {
        assert!(rules.get(tag).is_some(), "SPEC §5.7 names {tag}");
    }

    // No dead tags: each one applies to some built-in item of every kind it has a threshold for.
    let scales = ScaleCatalog::builtin().scales();
    let chords = ChordCatalog::builtin().chords();
    for tag in rules.tags() {
        if tag.threshold(ItemKind::Scale).is_some() {
            assert!(
                scales
                    .iter()
                    .any(|s| rules.scale_tags(s).contains(&tag.name())),
                "no built-in scale is {}",
                tag.name()
            );
        }
        if tag.threshold(ItemKind::Chord).is_some() {
            assert!(
                chords
                    .iter()
                    .any(|c| rules.chord_tags(c).contains(&tag.name())),
                "no built-in chord is {}",
                tag.name()
            );
        }
        // And none is on everything.
        assert!(
            !scales
                .iter()
                .all(|s| rules.scale_tags(s).contains(&tag.name())),
            "every scale is {}",
            tag.name()
        );
    }
}

#[test]
fn phrygian_and_locrian_are_dark_and_lydian_is_bright() {
    for id in ["phrygian", "locrian"] {
        assert!(
            scale_tags(id).contains(&"dark"),
            "{id}: {:?}",
            scale_tags(id)
        );
    }
    assert!(scale_tags("locrian").contains(&"evil"));
    assert!(
        scale_tags("lydian").contains(&"bright"),
        "{:?}",
        scale_tags("lydian")
    );
    assert!(!scale_tags("lydian").contains(&"dark"));
    assert!(!scale_tags("locrian").contains(&"bright"));
    assert!(!scale_tags("phrygian").contains(&"bright"));
    assert!(scale_tags("major").contains(&"happy"));
    assert!(scale_tags("aeolian").contains(&"sad"));
    assert!(!scale_tags("major").contains(&"sad"));
}

#[test]
fn diminished_chords_are_dissonant() {
    for id in ["dim", "dim7", "min7b5", "min9b5"] {
        assert!(
            chord_tags(id).contains(&"dissonant"),
            "{id}: {:?}",
            chord_tags(id)
        );
    }
    for id in ["major", "minor", "maj7", "dom7", "sus4", "power"] {
        assert!(
            !chord_tags(id).contains(&"dissonant"),
            "{id}: {:?}",
            chord_tags(id)
        );
    }
}

#[test]
fn other_anchors() {
    assert!(chord_tags("maj9").contains(&"jazzy"));
    assert!(chord_tags("dom13").contains(&"jazzy"));
    assert!(!chord_tags("major").contains(&"jazzy"));
    assert!(scale_tags("blues").contains(&"bluesy"));
    assert!(chord_tags("dom7sharp9").contains(&"bluesy"));
    for id in [
        "harmonic-minor",
        "phrygian-dominant",
        "double-harmonic-major",
        "hirajoshi",
    ] {
        assert!(
            scale_tags(id).contains(&"exotic"),
            "{id}: {:?}",
            scale_tags(id)
        );
    }
    assert!(!scale_tags("major").contains(&"exotic"));
    assert!(!scale_tags("minor-pentatonic").contains(&"exotic"));
    assert!(scale_tags("whole-tone").contains(&"mysterious"));
    assert!(chord_tags("aug").contains(&"mysterious"));
    assert!(chord_tags("sus2").contains(&"open"));
    // Exotic and jazzy are for one kind only.
    assert_eq!(
        TagRules::builtin()
            .get("exotic")
            .unwrap()
            .threshold(ItemKind::Chord),
        None
    );
    assert_eq!(
        TagRules::builtin()
            .get("jazzy")
            .unwrap()
            .threshold(ItemKind::Scale),
        None
    );
}

#[test]
fn interval_features() {
    use Feature::*;
    assert_eq!(feature("1 b3 5 b7 b9", FlatSecond), 1, "b9 counts as b2");
    assert_eq!(feature("1 3 5 b7 13", Sixth), 1);
    assert_eq!(feature("1 3 5", Minor), 0);
    assert_eq!(feature("1 b3 5", Minor), 1);
    assert_eq!(
        feature("1 3 5 b7 #9", Minor),
        0,
        "#9 next to a 3 is not minor"
    );
    assert_eq!(feature("1 4 5", NoThird), 1);
    assert_eq!(feature("1 2 b3 4 5 6 b7", Tritone), 0);
}

#[test]
fn the_tritone_acts_as_a_sharp_4_or_a_flat_5() {
    use Feature::*;
    let both = |labels: &str| (feature(labels, SharpFourth), feature(labels, FlatFifth));
    assert_eq!(both("1 2 3 #4 5 6 7"), (1, 0), "Lydian");
    assert_eq!(both("1 b2 b3 4 b5 b6 b7"), (0, 1), "Locrian");
    assert_eq!(both("1 b3 4 b5 5 b7"), (0, 0), "blues: a passing note");
    assert_eq!(both("1 2 3 #4 #5 6 7"), (1, 0), "Lydian augmented");
    assert_eq!(both("1 b3 b5 bb7"), (0, 1), "dim7");
    assert_eq!(both("1 b2 b3 b4 b5 b6 b7"), (0, 1), "altered");
    assert_eq!(both("1 3 5 7 #11"), (1, 0), "maj7#11");
    assert_eq!(feature("1 b3 b5", Diminished), 1);
    assert_eq!(feature("1 3 #5", Augmented), 1);
    assert_eq!(feature("1 3 5 b6", Augmented), 0);
}

#[test]
fn shape_features() {
    use Feature::*;
    assert_eq!(feature("1 2 3 4 5 6 7", SemitonePairs), 2);
    assert_eq!(feature("1 2 3 4 5 6 7", TritonePairs), 1);
    assert_eq!(feature("1 b3 b5 bb7", TritonePairs), 2);
    assert_eq!(
        feature("1 2 b3 4 5 b6 7", AugmentedSeconds),
        1,
        "harmonic minor"
    );
    assert_eq!(
        feature("1 b2 3 4 5 b6 7", AugmentedSeconds),
        2,
        "double harmonic"
    );
    assert_eq!(
        feature("1 b3 4 5 b7", AugmentedSeconds),
        0,
        "minor pentatonic"
    );
    assert_eq!(feature("1 b3 4 b5 5 b7", AugmentedSeconds), 0, "blues");
    assert_eq!(feature("1 2 b3 5 b6", WideSteps), 2, "hirajoshi");
    assert_eq!(feature("1 2 3 5 6", WideSteps), 0);
    assert_eq!(feature("1 b3 4 b5 5 b7", BlueNotes), 1);
    assert_eq!(feature("1 2 b3 3 5 6", BlueNotes), 1);
    assert_eq!(feature("1 3 5", BlueNotes), 0);
    for symmetric in [
        "1 2 3 #4 #5 b7",
        "1 b3 b5 bb7",
        "1 3 #5",
        "1 b2 b3 3 #4 5 6 b7",
    ] {
        assert_eq!(feature(symmetric, Symmetric), 1, "{symmetric}");
    }
    assert_eq!(feature("1 2 3 4 5 6 7", Symmetric), 0);
    assert_eq!(feature("1 b5", Symmetric), 1);
}

#[test]
fn extension_features() {
    use Feature::*;
    let dom13 = "1 3 5 b7 9 13";
    assert_eq!(feature(dom13, AnySeventh), 1);
    assert_eq!(feature(dom13, Ninth), 1);
    assert_eq!(feature(dom13, Eleventh), 0);
    assert_eq!(feature(dom13, Thirteenth), 1);
    assert_eq!(feature(dom13, Extensions), 2);
    assert_eq!(feature(dom13, AlteredExtensions), 0);
    let alt = "1 3 b7 b9 #9 #11 b13";
    assert_eq!(feature(alt, Extensions), 4);
    assert_eq!(feature(alt, AlteredExtensions), 4);
    assert_eq!(feature("1 2 3 5", Ninth), 0, "add2 has no ninth");
    assert_eq!(feature("1 2 3 4 5 6 7", Extensions), 0);
}

#[test]
fn feature_names_round_trip() {
    for feature in Feature::ALL {
        assert_eq!(Feature::from_name(feature.name()), Some(feature));
        assert_eq!(feature.to_string(), feature.name());
    }
    assert_eq!(Feature::from_name("#4"), None);
}

#[test]
fn labels_do_not_matter() {
    let rules = TagRules::builtin();
    let lydian = formula("1 2 3 #4 5 6 7");
    let spelled_with_b5 = formula("1 2 3 b5 5 6 7");
    assert_eq!(
        rules.tags_for(&lydian, ItemKind::Scale),
        rules.tags_for(&spelled_with_b5, ItemKind::Scale)
    );
}

#[test]
fn custom_items_get_tags_like_built_ins() {
    let mine = Scale::new(
        "mine",
        "Mine",
        Vec::new(),
        None,
        &["1", "b2", "b3", "4", "b5", "b6", "b7"],
    )
    .unwrap();
    let locrian = ScaleCatalog::builtin().get("locrian").unwrap();
    assert_eq!(
        TagRules::builtin().scale_tags(&mine),
        TagRules::builtin().scale_tags(locrian)
    );
}

#[test]
fn a_user_file_adding_a_tag_puts_it_on_matching_items() {
    let parsed = TagRules::builtin().with_user_rules(
        r#"
        [tag.spanish]
        scale-threshold = 4
        [tag.spanish.weights]
        b2 = 2
        3 = 2
        "#,
    );
    assert_eq!(errors(&parsed), Vec::<String>::new());
    let rules = &parsed.rules;
    let catalog = ScaleCatalog::builtin();
    let tags = |id: &str| rules.scale_tags(catalog.get(id).unwrap());
    assert!(tags("phrygian-dominant").contains(&"spanish"));
    assert!(tags("double-harmonic-major").contains(&"spanish"));
    assert!(!tags("phrygian").contains(&"spanish"));
    assert!(!tags("major").contains(&"spanish"));
    // A tag without a chord threshold is on no chord.
    let chord = ChordCatalog::builtin().get("dom7flat9").unwrap();
    assert!(!rules.chord_tags(chord).contains(&"spanish"));
    // Tags are listed by name.
    let names: Vec<&str> = rules.tags().iter().map(TagRule::name).collect();
    let mut sorted = names.clone();
    sorted.sort_unstable();
    assert_eq!(names, sorted);
}

#[test]
fn a_user_file_changes_weights_and_thresholds_of_built_in_tags() {
    let builtin = TagRules::builtin();
    let parsed = builtin.with_user_rules(
        r#"
        [tag.dark]
        scale-threshold = 99

        [tag.happy.weights]
        b3 = 0
        2 = 1
        "#,
    );
    assert_eq!(errors(&parsed), Vec::<String>::new());
    let rules = &parsed.rules;
    let dark = rules.get("dark").unwrap();
    assert_eq!(dark.threshold(ItemKind::Scale), Some(99));
    assert_eq!(
        dark.threshold(ItemKind::Chord),
        builtin.get("dark").unwrap().threshold(ItemKind::Chord)
    );
    assert_eq!(
        dark.weight(Feature::FlatSecond),
        builtin.get("dark").unwrap().weight(Feature::FlatSecond)
    );
    let happy = rules.get("happy").unwrap();
    assert_eq!(happy.weight(Feature::FlatThird), 0);
    assert_eq!(happy.weight(Feature::Second), 1);
    assert_eq!(
        happy.weight(Feature::Third),
        builtin.get("happy").unwrap().weight(Feature::Third)
    );
    let phrygian = ScaleCatalog::builtin().get("phrygian").unwrap();
    assert!(!rules.scale_tags(phrygian).contains(&"dark"));
    // The built-ins are untouched.
    assert!(builtin.scale_tags(phrygian).contains(&"dark"));
}

#[test]
fn broken_tables_are_reported_and_skipped() {
    let builtin = TagRules::builtin();
    let parsed = builtin.with_user_rules(
        r#"
        [tag.dark.weights]
        b9 = 3

        [tag.new-one.weights]
        b2 = 1

        [tag.Loud]
        chord-threshold = 1
        weights = { 5 = 1 }

        [tag.zero]
        chord-threshold = 0
        weights = { 5 = 1 }

        [tag.negative]
        chord-threshold = 1
        weights = { 5 = -1 }

        [tag.fractional]
        chord-threshold = 1
        weights = { 5 = 1.5 }

        [tag.typo]
        chord-treshold = 1

        [tag.fine]
        chord-threshold = 1
        weights = { 5 = 1 }
        "#,
    );
    let found = errors(&parsed);
    assert_eq!(found.len(), 7, "{found:#?}");
    let message = |tag: &str| {
        found
            .iter()
            .find(|e| e.starts_with(&format!("tag {tag:?}: ")))
            .unwrap_or_else(|| panic!("no error for {tag}: {found:#?}"))
    };
    assert!(
        message("dark").contains("unknown feature \"b9\"; the features are b2, 2, b3"),
        "{found:#?}"
    );
    assert!(message("new-one").contains("needs a scale-threshold, a chord-threshold or both"));
    assert!(message("Loud").contains("kebab-case"));
    assert!(message("zero").contains("chord-threshold must be at least 1, not 0"));
    assert!(message("negative").contains("at least one positive weight"));
    assert!(
        message("fractional").contains("i32") || message("fractional").contains("integer"),
        "{found:#?}"
    );
    assert!(
        message("typo").contains("unknown field `chord-treshold`"),
        "{found:#?}"
    );
    // A broken table leaves the tag as it was; good tables still apply.
    assert_eq!(parsed.rules.get("dark"), builtin.get("dark"));
    assert!(parsed.rules.get("new-one").is_none());
    assert!(parsed.rules.get("fine").is_some());
}

#[test]
fn whole_file_errors() {
    let builtin = TagRules::builtin();
    let broken = builtin.with_user_rules("[tag.dark\n");
    assert_eq!(&broken.rules, builtin);
    assert_eq!(broken.errors.len(), 1);
    assert_eq!(broken.errors[0].tag, None);
    assert!(
        broken.errors[0]
            .message
            .starts_with("not valid TOML (line 1): "),
        "{:?}",
        broken.errors
    );

    let parsed = builtin
        .with_user_rules("version = 1\n[tag.fine]\nchord-threshold = 1\nweights = { 5 = 1 }\n");
    assert_eq!(
        errors(&parsed),
        ["unknown key \"version\" (a rules file holds only [tag.<name>] tables)"]
    );
    assert!(parsed.rules.get("fine").is_some());
    assert_eq!(
        errors(&builtin.with_user_rules("tag = 3")),
        ["\"tag\" must be a table of [tag.<name>] tables"]
    );
}

/// Prints the tags of every built-in item (`cargo test -p theory print_builtin_tags -- --ignored
/// --nocapture`), to check the default weights by eye.
#[test]
#[ignore]
fn print_builtin_tags() {
    let rules = TagRules::builtin();
    println!("| Scale | Intervals | Tags |\n|---|---|---|");
    for scale in ScaleCatalog::builtin().scales() {
        println!(
            "| {} | {} | {} |",
            scale.name(),
            scale.formula(),
            rules.scale_tags(scale).join(", ")
        );
    }
    println!("\n| Chord | Intervals | Tags |\n|---|---|---|");
    for chord in ChordCatalog::builtin().chords() {
        println!(
            "| {} | {} | {} |",
            chord.name(),
            chord.formula(),
            rules.chord_tags(chord).join(", ")
        );
    }
}

fn any_kind() -> impl Strategy<Value = ItemKind> {
    prop_oneof![Just(ItemKind::Scale), Just(ItemKind::Chord)]
}

/// A formula of the root and any other semitones below two octaves, with default labels.
fn any_formula() -> impl Strategy<Value = Formula> {
    proptest::collection::btree_set(1..24u8, 1..10).prop_map(|semitones| {
        let intervals = std::iter::once(0)
            .chain(semitones)
            .map(|s| Interval::from_semitones(s).unwrap())
            .collect();
        Formula::new(intervals).unwrap()
    })
}

proptest! {
    // An empty file, or one of only comments, changes nothing.
    #[test]
    fn an_empty_user_file_changes_nothing(formula in any_formula(), kind in any_kind(), text in prop_oneof![Just(""), Just("\n  \n"), Just("# my rules\n"), Just("[tag]\n")]) {
        let builtin = TagRules::builtin();
        let parsed = builtin.with_user_rules(text);
        prop_assert!(parsed.errors.is_empty());
        prop_assert_eq!(&parsed.rules, builtin);
        prop_assert_eq!(parsed.rules.tags_for(&formula, kind), builtin.tags_for(&formula, kind));
    }

    // A scale's tags are the tags of its notes on any root, read back as intervals from that root.
    #[test]
    fn tags_do_not_depend_on_the_root(index in 0..ScaleCatalog::builtin().scales().len(), root in 0..12u8) {
        let scale = &ScaleCatalog::builtin().scales()[index];
        let root = PitchClass::new(root).unwrap();
        let mut semitones: Vec<u8> = scale
            .pitch_classes(root)
            .into_iter()
            .map(|pc| (pc.value() + 12 - root.value()) % 12)
            .collect();
        semitones.sort_unstable();
        let rebuilt = Formula::new(semitones.into_iter().map(|s| Interval::from_semitones(s).unwrap()).collect()).unwrap();
        let rules = TagRules::builtin();
        prop_assert_eq!(rules.tags_for(&rebuilt, ItemKind::Scale), rules.scale_tags(scale));
    }

    // Adding a tag changes no other tag.
    #[test]
    fn a_new_tag_leaves_the_others_alone(formula in any_formula(), kind in any_kind(), weight in 1..5i32, threshold in 1..5i32) {
        let builtin = TagRules::builtin();
        let parsed = builtin.with_user_rules(&format!(
            "[tag.zzz]\nscale-threshold = {threshold}\nchord-threshold = {threshold}\nweights = {{ b3 = {weight} }}\n"
        ));
        prop_assert!(parsed.errors.is_empty());
        let mut tags = parsed.rules.tags_for(&formula, kind);
        tags.retain(|&tag| tag != "zzz");
        prop_assert_eq!(tags, builtin.tags_for(&formula, kind));
    }

    // Raising a threshold never adds a tag.
    #[test]
    fn a_higher_threshold_never_adds_a_tag(formula in any_formula(), kind in any_kind(), tag_index in 0..12usize, raise in 0..20i32) {
        let builtin = TagRules::builtin();
        let tag = &builtin.tags()[tag_index % builtin.tags().len()];
        let key = match kind { ItemKind::Scale => "scale-threshold", ItemKind::Chord => "chord-threshold" };
        let threshold = tag.threshold(kind).unwrap_or(1) + raise;
        let parsed = builtin.with_user_rules(&format!("[tag.{}]\n{key} = {threshold}\n", tag.name()));
        prop_assert!(parsed.errors.is_empty(), "{:?}", parsed.errors);
        let before = builtin.tags_for(&formula, kind);
        for found in parsed.rules.tags_for(&formula, kind) {
            prop_assert!(before.contains(&found) || found == tag.name() && tag.threshold(kind).is_none());
        }
    }
}
