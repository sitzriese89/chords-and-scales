use std::collections::BTreeMap;
use std::fmt;
use std::sync::OnceLock;

use serde::Deserialize;

use super::features::{Feature, Features};
use crate::chords::Chord;
use crate::formula::Formula;
use crate::scales::Scale;

/// The built-in rules, embedded at build time.
const BUILTIN_TOML: &str = include_str!("../../data/tags.toml");

/// What is being tagged: tags have a threshold per kind, since a scale has more notes (and so
/// more of most features) than a chord.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ItemKind {
    Scale,
    Chord,
}

/// One tag: its threshold for scales and for chords (`None`: never on that kind) and a weight
/// per feature.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TagRule {
    name: String,
    scale_threshold: Option<i32>,
    chord_threshold: Option<i32>,
    weights: BTreeMap<Feature, i32>,
}

impl TagRule {
    /// The tag's name, lowercase kebab-case: `dark`, `jazzy`.
    pub fn name(&self) -> &str {
        &self.name
    }

    /// The score an item of `kind` needs for the tag, or `None` if the tag never applies to it.
    pub fn threshold(&self, kind: ItemKind) -> Option<i32> {
        match kind {
            ItemKind::Scale => self.scale_threshold,
            ItemKind::Chord => self.chord_threshold,
        }
    }

    /// The weight of `feature` (0 if the rule doesn't name it).
    pub fn weight(&self, feature: Feature) -> i32 {
        self.weights.get(&feature).copied().unwrap_or(0)
    }

    /// The sum of each feature's value times its weight.
    pub fn score(&self, features: &Features) -> i32 {
        self.weights
            .iter()
            .map(|(&feature, &weight)| weight * i32::from(features.get(feature)))
            .sum()
    }

    /// Whether an item of `kind` with `features` gets the tag: its score reaches the threshold.
    pub fn applies(&self, features: &Features, kind: ItemKind) -> bool {
        self.threshold(kind)
            .is_some_and(|threshold| self.score(features) >= threshold)
    }
}

/// The mood-tag rules (SPEC §5.7, ADR-9, ADR-39): the built-ins, optionally with a user rules
/// file merged over them. Tags are listed by name.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TagRules {
    tags: Vec<TagRule>,
}

/// Why part of a rules file was not used.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TagRuleError {
    /// The tag the error is about, or `None` for the file as a whole.
    pub tag: Option<String>,
    /// What is wrong, in plain English.
    pub message: String,
}

impl fmt::Display for TagRuleError {
    /// `tag "dark": …`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.tag {
            Some(tag) => write!(f, "tag {tag:?}: {}", self.message),
            None => f.write_str(&self.message),
        }
    }
}

impl std::error::Error for TagRuleError {}

/// Rules with a rules file merged in, and what in the file was not used.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ParsedTagRules {
    pub rules: TagRules,
    pub errors: Vec<TagRuleError>,
}

/// One `[tag.<name>]` table as written; every key is optional, so a user file can change one.
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "kebab-case")]
struct RawTag {
    scale_threshold: Option<i32>,
    chord_threshold: Option<i32>,
    #[serde(default)]
    weights: BTreeMap<String, i32>,
}

impl TagRules {
    /// The built-in rules from `crates/theory/data/tags.toml`. Their validity is checked by the
    /// `builtin_tag_rules_are_valid` test.
    pub fn builtin() -> &'static TagRules {
        static BUILTIN: OnceLock<TagRules> = OnceLock::new();
        BUILTIN.get_or_init(|| {
            let parsed = TagRules::default().with_user_rules(BUILTIN_TOML);
            if let Some(error) = parsed.errors.first() {
                panic!("invalid built-in tag rules: {error}");
            }
            parsed.rules
        })
    }

    /// Every tag, by name.
    pub fn tags(&self) -> &[TagRule] {
        &self.tags
    }

    /// The tag called `name`, if any.
    pub fn get(&self, name: &str) -> Option<&TagRule> {
        self.tags.iter().find(|tag| tag.name == name)
    }

    /// The tags an item of `kind` made of `formula` gets, by name.
    pub fn tags_for(&self, formula: &Formula, kind: ItemKind) -> Vec<&str> {
        let features = Features::of(formula);
        self.tags
            .iter()
            .filter(|tag| tag.applies(&features, kind))
            .map(TagRule::name)
            .collect()
    }

    /// The tags of `scale`, built-in or the user's.
    pub fn scale_tags(&self, scale: &Scale) -> Vec<&str> {
        self.tags_for(scale.formula(), ItemKind::Scale)
    }

    /// The tags of `chord`, built-in or the user's.
    pub fn chord_tags(&self, chord: &Chord) -> Vec<&str> {
        self.tags_for(chord.formula(), ItemKind::Chord)
    }

    /// These rules with the rules file `toml` merged over them (format: `docs/tag-rules.md`).
    ///
    /// Each `[tag.<name>]` table changes the tag of that name, or adds it: a threshold given
    /// replaces the old one, and each weight given replaces that feature's weight (the others
    /// stay). A table whose result is not a valid tag is skipped with an error and the tag stays
    /// as it was; the other tables still apply. A file that is not TOML, or has keys other than
    /// `tag`, gives errors without a tag. An empty file changes nothing.
    pub fn with_user_rules(&self, toml: &str) -> ParsedTagRules {
        let mut tags = self.tags.clone();
        let mut errors = Vec::new();
        let file_error = |message: String| TagRuleError { tag: None, message };

        let root = match toml.parse::<toml::Table>() {
            Ok(root) => root,
            Err(error) => {
                let line = error
                    .span()
                    .map(|span| toml[..span.start].matches('\n').count() + 1);
                let message = match line {
                    Some(line) => format!("not valid TOML (line {line}): {}", error.message()),
                    None => format!("not valid TOML: {}", error.message()),
                };
                errors.push(file_error(message));
                return ParsedTagRules {
                    rules: self.clone(),
                    errors,
                };
            }
        };
        for key in root.keys().filter(|key| *key != "tag") {
            errors.push(file_error(format!(
                "unknown key {key:?} (a rules file holds only [tag.<name>] tables)"
            )));
        }
        let table = match root.get("tag") {
            None => None,
            Some(toml::Value::Table(table)) => Some(table),
            Some(_) => {
                errors.push(file_error(
                    "\"tag\" must be a table of [tag.<name>] tables".to_owned(),
                ));
                None
            }
        };

        for (name, value) in table.into_iter().flatten() {
            let existing = tags.iter().position(|tag| &tag.name == name);
            let base = existing.map(|index| tags[index].clone());
            match merge(name, base, value.clone()) {
                Ok(tag) => match existing {
                    Some(index) => tags[index] = tag,
                    None => tags.push(tag),
                },
                Err(message) => errors.push(TagRuleError {
                    tag: Some(name.clone()),
                    message,
                }),
            }
        }
        tags.sort_by(|a, b| a.name.cmp(&b.name));
        ParsedTagRules {
            rules: TagRules { tags },
            errors,
        }
    }
}

/// `base` (or a new tag called `name`) with the table `value` applied, checked.
fn merge(name: &str, base: Option<TagRule>, value: toml::Value) -> Result<TagRule, String> {
    if !crate::catalog_file::is_kebab_case(name) {
        return Err("a tag name must be lowercase kebab-case, e.g. \"my-tag\"".to_owned());
    }
    let raw: RawTag = value
        .try_into()
        .map_err(|e: toml::de::Error| e.message().trim().to_owned())?;
    let mut tag = base.unwrap_or_else(|| TagRule {
        name: name.to_owned(),
        scale_threshold: None,
        chord_threshold: None,
        weights: BTreeMap::new(),
    });
    if raw.scale_threshold.is_some() {
        tag.scale_threshold = raw.scale_threshold;
    }
    if raw.chord_threshold.is_some() {
        tag.chord_threshold = raw.chord_threshold;
    }
    for (feature_name, weight) in raw.weights {
        let feature = Feature::from_name(&feature_name).ok_or_else(|| {
            let known: Vec<&str> = Feature::ALL.iter().map(|f| f.name()).collect();
            format!(
                "unknown feature {feature_name:?}; the features are {}",
                known.join(", ")
            )
        })?;
        tag.weights.insert(feature, weight);
    }
    tag.weights.retain(|_, weight| *weight != 0);

    if tag.scale_threshold.is_none() && tag.chord_threshold.is_none() {
        return Err(
            "a tag needs a scale-threshold, a chord-threshold or both (or it never applies)"
                .to_owned(),
        );
    }
    for (key, threshold) in [
        ("scale-threshold", tag.scale_threshold),
        ("chord-threshold", tag.chord_threshold),
    ] {
        if let Some(threshold) = threshold
            && threshold < 1
        {
            return Err(format!(
                "{key} must be at least 1, not {threshold} (or every item would get the tag)"
            ));
        }
    }
    if !tag.weights.values().any(|&weight| weight > 0) {
        return Err("a tag needs at least one positive weight (or it never applies)".to_owned());
    }
    Ok(tag)
}
