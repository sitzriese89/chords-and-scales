//! Interval features: what the mood-tag rules weigh (ADR-9, ADR-39, `docs/tag-rules.md`).
//!
//! Every feature is read from the semitones of a formula, never from its labels, so a scale
//! written `1 2 3 b5 5 6 7` gets the tags of one written `1 2 3 #4 5 6 7`, and an item gets the
//! same tags on every root.

use std::fmt;

use crate::formula::Formula;

/// One thing the tag rules can weigh. Flags are 1 or 0; counts are 0 or more.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Feature {
    // Pitch classes above the root, in any octave (`b9` counts as `b2`, `13` as `6`).
    FlatSecond,
    Second,
    FlatThird,
    Third,
    Fourth,
    Tritone,
    Fifth,
    FlatSixth,
    Sixth,
    FlatSeventh,
    Seventh,
    // What those notes do together.
    Minor,
    NoThird,
    SharpFourth,
    FlatFifth,
    Diminished,
    Augmented,
    BlueNotes,
    // The shape of the whole set.
    SemitonePairs,
    TritonePairs,
    AugmentedSeconds,
    WideSteps,
    Symmetric,
    // Chord extensions: intervals an octave or more above the root.
    AnySeventh,
    Ninth,
    Eleventh,
    Thirteenth,
    Extensions,
    AlteredExtensions,
}

impl Feature {
    /// Every feature, in the order of `docs/tag-rules.md`.
    pub const ALL: [Feature; 29] = [
        Feature::FlatSecond,
        Feature::Second,
        Feature::FlatThird,
        Feature::Third,
        Feature::Fourth,
        Feature::Tritone,
        Feature::Fifth,
        Feature::FlatSixth,
        Feature::Sixth,
        Feature::FlatSeventh,
        Feature::Seventh,
        Feature::Minor,
        Feature::NoThird,
        Feature::SharpFourth,
        Feature::FlatFifth,
        Feature::Diminished,
        Feature::Augmented,
        Feature::BlueNotes,
        Feature::SemitonePairs,
        Feature::TritonePairs,
        Feature::AugmentedSeconds,
        Feature::WideSteps,
        Feature::Symmetric,
        Feature::AnySeventh,
        Feature::Ninth,
        Feature::Eleventh,
        Feature::Thirteenth,
        Feature::Extensions,
        Feature::AlteredExtensions,
    ];

    /// The name rule files use: `b2`, `tritone`, `semitone-pairs`.
    pub fn name(self) -> &'static str {
        match self {
            Feature::FlatSecond => "b2",
            Feature::Second => "2",
            Feature::FlatThird => "b3",
            Feature::Third => "3",
            Feature::Fourth => "4",
            Feature::Tritone => "tritone",
            Feature::Fifth => "5",
            Feature::FlatSixth => "b6",
            Feature::Sixth => "6",
            Feature::FlatSeventh => "b7",
            Feature::Seventh => "7",
            Feature::Minor => "minor",
            Feature::NoThird => "no-third",
            Feature::SharpFourth => "sharp-4",
            Feature::FlatFifth => "flat-5",
            Feature::Diminished => "diminished",
            Feature::Augmented => "augmented",
            Feature::BlueNotes => "blue-notes",
            Feature::SemitonePairs => "semitone-pairs",
            Feature::TritonePairs => "tritone-pairs",
            Feature::AugmentedSeconds => "augmented-seconds",
            Feature::WideSteps => "wide-steps",
            Feature::Symmetric => "symmetric",
            Feature::AnySeventh => "seventh",
            Feature::Ninth => "ninth",
            Feature::Eleventh => "eleventh",
            Feature::Thirteenth => "thirteenth",
            Feature::Extensions => "extensions",
            Feature::AlteredExtensions => "altered-extensions",
        }
    }

    /// The feature called `name` in a rule file.
    pub fn from_name(name: &str) -> Option<Feature> {
        Feature::ALL
            .into_iter()
            .find(|feature| feature.name() == name)
    }

    fn index(self) -> usize {
        Feature::ALL
            .iter()
            .position(|&feature| feature == self)
            .expect("ALL lists every feature")
    }
}

impl fmt::Display for Feature {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.name())
    }
}

/// The value of every [`Feature`] for one formula.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Features {
    values: [u8; Feature::ALL.len()],
}

impl Features {
    /// The features of `formula`, a scale's or a chord's.
    pub fn of(formula: &Formula) -> Features {
        let semitones: Vec<u8> = formula.semitones().collect();
        let mut set = 0u16;
        for &s in &semitones {
            set |= 1 << (s % 12);
        }
        let has = |pc: u8| set & (1 << pc) != 0;
        let flag = |value: bool| u8::from(value);
        let classes: Vec<u8> = (0..12).filter(|&pc| has(pc)).collect();

        // Steps between neighbouring pitch classes, round the octave.
        let steps: Vec<u8> = (0..classes.len())
            .map(|i| {
                let next = classes.get(i + 1).copied().unwrap_or(classes[0] + 12);
                next - classes[i]
            })
            .collect();
        let step = |i: usize| steps[i % steps.len()];
        let augmented_seconds = (0..steps.len())
            .filter(|&i| steps.len() >= 3 && step(i + 1) == 3 && step(i) == 1 && step(i + 2) == 1)
            .count();
        let wide_steps = steps.iter().filter(|&&s| s >= 4).count();
        let pairs = |distance: u8| {
            classes
                .iter()
                .filter(|&&pc| has((pc + distance) % 12))
                .count()
        };
        // A tritone pair is counted from both of its notes.
        let tritone_pairs = pairs(6) / 2;
        // The set maps onto itself when moved up by some interval other than the octave.
        let symmetric = (1..12).any(|t| ((set << t) | (set >> (12 - t))) & 0xfff == set);

        let compound = |classes: &[u8]| {
            semitones
                .iter()
                .any(|&s| s >= 12 && classes.contains(&(s % 12)))
        };

        let minor = has(3) && !has(4);
        let mut values = [0u8; Feature::ALL.len()];
        let mut set_value = |feature: Feature, value: usize| {
            values[feature.index()] = u8::try_from(value).unwrap_or(u8::MAX);
        };
        for (feature, pc) in [
            (Feature::FlatSecond, 1),
            (Feature::Second, 2),
            (Feature::FlatThird, 3),
            (Feature::Third, 4),
            (Feature::Fourth, 5),
            (Feature::Tritone, 6),
            (Feature::Fifth, 7),
            (Feature::FlatSixth, 8),
            (Feature::Sixth, 9),
            (Feature::FlatSeventh, 10),
            (Feature::Seventh, 11),
        ] {
            set_value(feature, flag(has(pc)).into());
        }
        set_value(Feature::Minor, flag(minor).into());
        set_value(Feature::NoThird, flag(!has(3) && !has(4)).into());
        // The tritone is a raised 4th where it takes the 4th's place, and a lowered 5th where
        // it takes the 5th's; with neither around, a minor 3rd makes it a lowered 5th.
        set_value(
            Feature::SharpFourth,
            flag(has(6) && !has(5) && (has(7) || !has(3))).into(),
        );
        set_value(
            Feature::FlatFifth,
            flag(has(6) && !has(7) && (has(5) || has(3))).into(),
        );
        set_value(Feature::Diminished, flag(minor && has(6) && !has(7)).into());
        set_value(Feature::Augmented, flag(has(4) && has(8) && !has(7)).into());
        let blue_notes = usize::from(has(3) && has(4)) + usize::from(has(5) && has(6) && has(7));
        set_value(Feature::BlueNotes, blue_notes);
        set_value(Feature::SemitonePairs, pairs(1));
        set_value(Feature::TritonePairs, tritone_pairs);
        set_value(Feature::AugmentedSeconds, augmented_seconds);
        set_value(Feature::WideSteps, wide_steps);
        set_value(Feature::Symmetric, flag(symmetric).into());
        set_value(Feature::AnySeventh, flag(has(10) || has(11)).into());
        set_value(Feature::Ninth, flag(compound(&[1, 2, 3])).into());
        set_value(Feature::Eleventh, flag(compound(&[5, 6])).into());
        set_value(Feature::Thirteenth, flag(compound(&[8, 9])).into());
        set_value(
            Feature::Extensions,
            semitones.iter().filter(|&&s| s >= 12).count(),
        );
        set_value(
            Feature::AlteredExtensions,
            semitones
                .iter()
                .filter(|&&s| s >= 12 && [1, 3, 6, 8].contains(&(s % 12)))
                .count(),
        );
        Features { values }
    }

    /// The value of `feature`: 1 or 0 for a flag, a count otherwise.
    pub fn get(&self, feature: Feature) -> u8 {
        self.values[feature.index()]
    }
}
