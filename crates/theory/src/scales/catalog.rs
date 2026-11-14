use std::collections::HashMap;
use std::fmt;
use std::sync::OnceLock;

use serde::Deserialize;

use super::{Scale, Source};
use crate::formula::Formula;

/// The built-in catalog, embedded at build time.
const BUILTIN_TOML: &str = include_str!("../../data/scales.toml");

/// The family of a user scale that names none.
pub const CUSTOM_FAMILY: &str = "Custom";

/// A set of scales: the built-ins, optionally with user scales merged over them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScaleCatalog {
    scales: Vec<Scale>,
}

/// A family of scales as listed: its name and its scales in catalog order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScaleFamily<'a> {
    pub name: &'a str,
    pub scales: Vec<&'a Scale>,
}

/// A scale file read item by item: the valid scales, and an error for each item that is not.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ParsedScales {
    pub scales: Vec<Scale>,
    pub errors: Vec<CatalogError>,
}

/// Why an item of a scale file, or the file as a whole, was not loaded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogError {
    /// The index (0-based) of the `[[scale]]` item, or `None` for the file as a whole.
    pub item: Option<usize>,
    /// The item's `id`, if it has a string one.
    pub id: Option<String>,
    /// What is wrong, in plain English.
    pub message: String,
}

impl fmt::Display for CatalogError {
    /// `scale 3 ("my-scale"): …`, numbered from 1 as in the file.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match (self.item, &self.id) {
            (Some(item), Some(id)) => write!(f, "scale {} ({id:?}): {}", item + 1, self.message),
            (Some(item), None) => write!(f, "scale {}: {}", item + 1, self.message),
            (None, _) => f.write_str(&self.message),
        }
    }
}

impl std::error::Error for CatalogError {}

impl ScaleCatalog {
    /// The built-in catalog. Its validity is checked by the `builtin_scales_are_valid` test.
    pub fn builtin() -> &'static ScaleCatalog {
        static BUILTIN: OnceLock<ScaleCatalog> = OnceLock::new();
        BUILTIN.get_or_init(|| {
            let parsed = parse(BUILTIN_TOML, Source::BuiltIn);
            if let Some(error) = parsed.errors.first() {
                panic!("invalid built-in scale catalog: {error}");
            }
            ScaleCatalog {
                scales: parsed.scales,
            }
        })
    }

    /// All scales in catalog order.
    pub fn scales(&self) -> &[Scale] {
        &self.scales
    }

    /// The scale with `id`, if any.
    pub fn get(&self, id: &str) -> Option<&Scale> {
        self.scales.iter().find(|scale| scale.id == id)
    }

    /// The scales grouped by family; families in the order they first appear.
    pub fn families(&self) -> Vec<ScaleFamily<'_>> {
        let mut families: Vec<ScaleFamily<'_>> = Vec::new();
        for scale in &self.scales {
            match families
                .iter_mut()
                .find(|family| family.name == scale.family)
            {
                Some(family) => family.scales.push(scale),
                None => families.push(ScaleFamily {
                    name: &scale.family,
                    scales: vec![scale],
                }),
            }
        }
        families
    }

    /// This catalog with `user` scales merged over it: a user scale with the id of an
    /// existing one replaces it in place; others are added at the end, in order.
    pub fn with_user_scales(&self, user: impl IntoIterator<Item = Scale>) -> ScaleCatalog {
        let mut scales = self.scales.clone();
        for scale in user {
            match scales.iter_mut().find(|existing| existing.id == scale.id) {
                Some(existing) => *existing = scale,
                None => scales.push(scale),
            }
        }
        ScaleCatalog { scales }
    }
}

/// Reads a user scale file: a TOML string of `[[scale]]` tables in the catalog format. Never
/// fails as a whole: each broken item gets a [`CatalogError`] and the valid items still load.
/// Within the file the first item with an id wins; later ones with the same id are errors.
pub fn parse_user_scales(toml: &str) -> ParsedScales {
    parse(toml, Source::User)
}

/// One `[[scale]]` table as written.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawScale {
    id: String,
    name: String,
    #[serde(default)]
    aliases: Vec<String>,
    family: Option<String>,
    intervals: Vec<String>,
}

fn parse(toml: &str, source: Source) -> ParsedScales {
    let mut parsed = ParsedScales::default();
    let document_error = |message: String| CatalogError {
        item: None,
        id: None,
        message,
    };

    let table = match toml.parse::<toml::Table>() {
        Ok(table) => table,
        Err(error) => {
            let line = error
                .span()
                .map(|span| toml[..span.start].matches('\n').count() + 1);
            let message = match line {
                Some(line) => format!("not valid TOML (line {line}): {}", error.message()),
                None => format!("not valid TOML: {}", error.message()),
            };
            parsed.errors.push(document_error(message));
            return parsed;
        }
    };

    for key in table.keys().filter(|key| *key != "scale") {
        parsed.errors.push(document_error(format!(
            "unknown key {key:?} (a scale file holds only [[scale]] tables)"
        )));
    }

    let items = match table.get("scale") {
        None => return parsed,
        Some(toml::Value::Array(items)) => items,
        Some(_) => {
            parsed.errors.push(document_error(
                "\"scale\" must be a list of [[scale]] tables".to_owned(),
            ));
            return parsed;
        }
    };

    let mut seen: HashMap<String, usize> = HashMap::new();
    for (index, item) in items.iter().enumerate() {
        let id = item
            .get("id")
            .and_then(toml::Value::as_str)
            .map(str::to_owned);
        let error = |message: String| CatalogError {
            item: Some(index),
            id: id.clone(),
            message,
        };
        let scale = match item.clone().try_into::<RawScale>() {
            Ok(raw) => validate(raw, source),
            Err(e) => Err(e.message().trim().to_owned()),
        };
        match scale {
            Ok(scale) => {
                if let Some(first) = seen.get(&scale.id) {
                    parsed.errors.push(error(format!(
                        "duplicate id, already used by scale {}",
                        first + 1
                    )));
                } else {
                    seen.insert(scale.id.clone(), index);
                    parsed.scales.push(scale);
                }
            }
            Err(message) => parsed.errors.push(error(message)),
        }
    }
    parsed
}

/// Checks one item and builds its scale, or says what is wrong.
fn validate(raw: RawScale, source: Source) -> Result<Scale, String> {
    if !is_kebab_case(&raw.id) {
        return Err(format!(
            "id {:?} must be lowercase kebab-case, e.g. \"my-scale\"",
            raw.id
        ));
    }
    if raw.name.trim().is_empty() {
        return Err("name must not be empty".to_owned());
    }
    if raw.aliases.iter().any(|alias| alias.trim().is_empty()) {
        return Err("aliases must not be empty".to_owned());
    }
    let family = match raw.family {
        Some(family) if family.trim().is_empty() => {
            return Err("family must not be empty".to_owned());
        }
        Some(family) => family,
        None => CUSTOM_FAMILY.to_owned(),
    };
    let formula = Formula::parse(&raw.intervals).map_err(|e| e.to_string())?;
    if let Some(outside) = formula
        .intervals()
        .iter()
        .find(|interval| interval.semitones() >= 12)
    {
        return Err(format!(
            "{:?} is not within the octave (a scale's intervals are 1 to 7)",
            outside.to_string()
        ));
    }
    Ok(Scale {
        id: raw.id,
        name: raw.name,
        aliases: raw.aliases,
        family,
        formula,
        source,
    })
}

/// `major`, `dorian-sharp-4`: lowercase ASCII letters and digits in words joined by `-`.
fn is_kebab_case(id: &str) -> bool {
    !id.is_empty()
        && id.split('-').all(|word| {
            !word.is_empty()
                && word
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn errors(toml: &str) -> Vec<String> {
        parse_user_scales(toml)
            .errors
            .iter()
            .map(ToString::to_string)
            .collect()
    }

    fn ids(parsed: &ParsedScales) -> Vec<&str> {
        parsed.scales.iter().map(Scale::id).collect()
    }

    #[test]
    fn builtin_scales_are_valid() {
        let parsed = parse(BUILTIN_TOML, Source::BuiltIn);
        assert_eq!(parsed.errors, [], "built-in catalog errors");
        assert!(parsed.scales.len() >= 50, "{} scales", parsed.scales.len());
        for scale in &parsed.scales {
            assert_ne!(
                scale.family(),
                CUSTOM_FAMILY,
                "{} has no family",
                scale.id()
            );
            assert!(scale.formula().len() >= 5, "{} is too short", scale.id());
        }
        // The settings default (app/src/lib/settings/schema.ts) refers to this id.
        assert!(ScaleCatalog::builtin().get("major").is_some());
    }

    #[test]
    fn builtin_families_cover_the_spec() {
        let catalog = ScaleCatalog::builtin();
        let families: Vec<&str> = catalog.families().iter().map(|f| f.name).collect();
        assert_eq!(
            families,
            [
                "Diatonic modes",
                "Harmonic minor modes",
                "Melodic minor modes",
                "Pentatonic",
                "Blues",
                "Bebop",
                "Symmetric",
                "Exotic",
            ]
        );
        for id in [
            "major",
            "aeolian",
            "harmonic-minor",
            "melodic-minor",
            "major-pentatonic",
            "minor-pentatonic",
            "blues",
            "bebop-dominant",
            "whole-tone",
            "diminished-half-whole",
            "diminished-whole-half",
            "hungarian-minor",
            "phrygian-dominant",
            "hirajoshi",
        ] {
            assert!(catalog.get(id).is_some(), "{id}");
        }
        assert_eq!(catalog.get("nope"), None);
    }

    #[test]
    fn unknown_fields_fail() {
        assert_eq!(
            errors(
                r#"
                [[scale]]
                id = "mine"
                name = "Mine"
                intervals = ["1", "2", "3"]
                colour = "red"
                "#
            ),
            [
                "scale 1 (\"mine\"): unknown field `colour`, expected one of `id`, `name`, `aliases`, `family`, `intervals`"
            ]
        );
    }

    #[test]
    fn missing_fields_fail() {
        assert_eq!(
            errors("[[scale]]\nid = \"mine\"\nintervals = [\"1\", \"3\"]\n"),
            ["scale 1 (\"mine\"): missing field `name`"]
        );
    }

    #[test]
    fn duplicate_ids_fail() {
        let parsed = parse_user_scales(
            r#"
            [[scale]]
            id = "mine"
            name = "Mine"
            intervals = ["1", "2", "3"]

            [[scale]]
            id = "mine"
            name = "Mine again"
            intervals = ["1", "b3"]
            "#,
        );
        assert_eq!(ids(&parsed), ["mine"]);
        assert_eq!(parsed.scales[0].name(), "Mine");
        assert_eq!(
            parsed.errors[0].to_string(),
            "scale 2 (\"mine\"): duplicate id, already used by scale 1"
        );
    }

    #[test]
    fn unsorted_intervals_fail() {
        assert_eq!(
            errors("[[scale]]\nid = \"x\"\nname = \"X\"\nintervals = [\"1\", \"3\", \"b3\"]\n"),
            [
                "scale 1 (\"x\"): intervals must ascend: \"b3\" (3 semitones) comes after \"3\" (4 semitones)"
            ]
        );
        assert_eq!(
            errors("[[scale]]\nid = \"x\"\nname = \"X\"\nintervals = [\"2\", \"3\"]\n"),
            ["scale 1 (\"x\"): the formula must start at the root \"1\", not \"2\""]
        );
    }

    #[test]
    fn out_of_octave_intervals_fail() {
        assert_eq!(
            errors("[[scale]]\nid = \"x\"\nname = \"X\"\nintervals = [\"1\", \"3\", \"9\"]\n"),
            ["scale 1 (\"x\"): \"9\" is not within the octave (a scale's intervals are 1 to 7)"]
        );
        assert_eq!(
            errors("[[scale]]\nid = \"x\"\nname = \"X\"\nintervals = [\"1\", \"#7\"]\n").len(),
            1
        );
    }

    #[test]
    fn bad_ids_names_and_labels_fail() {
        let item = |id: &str, name: &str, intervals: &str| {
            format!("[[scale]]\nid = {id:?}\nname = {name:?}\nintervals = {intervals}\n")
        };
        for id in [
            "",
            "My-Scale",
            "my_scale",
            "my--scale",
            "-x",
            "x-",
            "dorian #4",
        ] {
            let found = errors(&item(id, "X", r#"["1", "3"]"#));
            assert_eq!(found.len(), 1, "{id:?}");
            assert!(found[0].contains("kebab-case"), "{found:?}");
        }
        assert_eq!(
            errors(&item("x", " ", r#"["1", "3"]"#)),
            ["scale 1 (\"x\"): name must not be empty"]
        );
        assert_eq!(
            errors(&item("x", "X", r#"["1", "m3"]"#)),
            [
                "scale 1 (\"x\"): \"m3\" is not an interval (expected a degree with optional sharps or flats, e.g. 1, b3, #4, 13)"
            ]
        );
        assert_eq!(
            errors(&item("x", "X", "[]")),
            ["scale 1 (\"x\"): the formula has no intervals"]
        );
        assert_eq!(
            errors("[[scale]]\nid = 5\nname = \"X\"\nintervals = [\"1\"]\n").len(),
            1
        );
    }

    #[test]
    fn valid_items_load_next_to_broken_ones() {
        let parsed = parse_user_scales(
            r##"
            [[scale]]
            id = "good-one"
            name = "Good one"
            intervals = ["1", "2", "♭3", "5"]

            [[scale]]
            name = "No id"
            intervals = ["1", "3"]

            [[scale]]
            id = "bad-order"
            name = "Bad order"
            intervals = ["1", "5", "3"]

            [[scale]]
            id = "good-two"
            name = "Good two"
            aliases = ["Second"]
            family = "Mine"
            intervals = ["1", "#4", "5"]
            "##,
        );
        assert_eq!(ids(&parsed), ["good-one", "good-two"]);
        let good_one = &parsed.scales[0];
        assert_eq!(good_one.family(), CUSTOM_FAMILY);
        assert_eq!(good_one.source(), Source::User);
        assert_eq!(good_one.formula().to_string(), "1 2 b3 5");
        assert_eq!(parsed.scales[1].aliases(), ["Second"]);
        assert_eq!(parsed.scales[1].formula().to_string(), "1 #4 5");

        let items: Vec<_> = parsed
            .errors
            .iter()
            .map(|e| (e.item, e.id.clone()))
            .collect();
        assert_eq!(
            items,
            [(Some(1), None), (Some(2), Some("bad-order".into()))]
        );
        assert_eq!(parsed.errors[0].to_string(), "scale 2: missing field `id`");
    }

    #[test]
    fn whole_file_errors() {
        assert_eq!(parse_user_scales(""), ParsedScales::default());
        let broken = errors("[[scale]]\nid = \"x\"\nname = \n");
        assert_eq!(broken.len(), 1);
        assert!(
            broken[0].starts_with("not valid TOML (line 3): "),
            "{broken:?}"
        );
        assert_eq!(
            errors("scale = 3\n"),
            ["\"scale\" must be a list of [[scale]] tables"]
        );
        assert_eq!(errors("scale = [3]\n").len(), 1);
        let parsed = parse_user_scales(
            "version = 1\n[[scale]]\nid = \"x\"\nname = \"X\"\nintervals = [\"1\", \"3\"]\n",
        );
        assert_eq!(ids(&parsed), ["x"]);
        assert_eq!(
            parsed.errors[0].to_string(),
            "unknown key \"version\" (a scale file holds only [[scale]] tables)"
        );
    }

    #[test]
    fn user_scales_merge_over_the_builtins() {
        let builtin = ScaleCatalog::builtin();
        let parsed = parse_user_scales(
            r#"
            [[scale]]
            id = "dorian"
            name = "My Dorian"
            family = "Diatonic modes"
            intervals = ["1", "2", "b3", "4", "5", "6", "b7"]

            [[scale]]
            id = "mine"
            name = "Mine"
            intervals = ["1", "b2", "5"]
            "#,
        );
        let merged = builtin.with_user_scales(parsed.scales);
        assert_eq!(merged.scales().len(), builtin.scales().len() + 1);
        let dorian = merged.get("dorian").unwrap();
        assert_eq!(dorian.name(), "My Dorian");
        assert_eq!(dorian.source(), Source::User);
        assert_eq!(merged.scales()[1].id(), "dorian", "replaced in place");
        assert_eq!(merged.scales().last().unwrap().id(), "mine");
        let families = merged.families();
        let custom = families.last().unwrap();
        assert_eq!(custom.name, CUSTOM_FAMILY);
        assert_eq!(custom.scales.len(), 1);
        // The built-in catalog itself is untouched.
        assert_eq!(builtin.get("dorian").unwrap().name(), "Dorian");
        assert_eq!(builtin.get("dorian").unwrap().source(), Source::BuiltIn);
    }
}
