//! Mood tags (`theory::tags`, ADR-39).
//!
//! The binding keeps one current rule set: the built-ins, with the user rules file last passed
//! to `setUserTagRules` merged over them. Tags are looked up by scale or chord id in the current
//! catalogs (`scales.rs`, `chords.rs`), so user scales and chords get tags like built-ins. An
//! unknown id throws a JS `Error`; a bad rules file never throws, it is reported.

use std::cell::RefCell;

use serde::Serialize;
use theory::{ItemKind, TagRules};
use wasm_bindgen::prelude::*;

use crate::user_files::to_js;

#[wasm_bindgen(typescript_custom_section)]
const TYPES: &'static str = r#"
/** A mood tag of the current rules. */
export interface TagInfo {
  /** Lowercase kebab-case: `dark`, `jazzy`. */
  name: string;
  /** Whether the tag can apply to scales (it has a scale threshold). */
  scales: boolean;
  /** Whether the tag can apply to chords (it has a chord threshold). */
  chords: boolean;
}

/** Why part of a rules file was not used: a `[tag.<name>]` table, or the file (`tag` null). */
export interface TagRuleError {
  tag: string | null;
  /** The full message, e.g. `tag "dark": unknown feature "b9"; …`. */
  message: string;
}

/** What `setUserTagRules` did with a rules file. */
export interface TagRulesReport {
  /** Every tag of the rules now in use, by name. */
  tags: string[];
  errors: TagRuleError[];
}
"#;

thread_local! {
    static RULES: RefCell<TagRules> = RefCell::new(TagRules::builtin().clone());
}

#[derive(Serialize)]
struct TagInfo<'a> {
    name: &'a str,
    scales: bool,
    chords: bool,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
struct TagRuleError {
    tag: Option<String>,
    message: String,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
struct TagRulesReport {
    tags: Vec<String>,
    errors: Vec<TagRuleError>,
}

/// Every tag of the current rules, by name.
#[wasm_bindgen(js_name = listTags, unchecked_return_type = "TagInfo[]")]
pub fn list_tags() -> Result<JsValue, JsError> {
    RULES.with_borrow(|rules| {
        let tags: Vec<TagInfo<'_>> = rules
            .tags()
            .iter()
            .map(|tag| TagInfo {
                name: tag.name(),
                scales: tag.threshold(ItemKind::Scale).is_some(),
                chords: tag.threshold(ItemKind::Chord).is_some(),
            })
            .collect();
        to_js(&tags)
    })
}

/// The tags of scale `id` in the current scale catalog, by name.
#[wasm_bindgen(js_name = scaleTags)]
pub fn scale_tags(id: &str) -> Result<Vec<String>, JsError> {
    crate::scales::with_catalog(|catalog| {
        let scale = catalog
            .get(id)
            .ok_or_else(|| JsError::new(&format!("no scale with id {id:?}")))?;
        Ok(RULES.with_borrow(|rules| owned(rules.scale_tags(scale))))
    })
}

/// The tags of chord `id` in the current chord catalog, by name.
#[wasm_bindgen(js_name = chordTags)]
pub fn chord_tags(id: &str) -> Result<Vec<String>, JsError> {
    crate::chords::with_catalog(|catalog| {
        let chord = catalog
            .get(id)
            .ok_or_else(|| JsError::new(&format!("no chord with id {id:?}")))?;
        Ok(RULES.with_borrow(|rules| owned(rules.chord_tags(chord))))
    })
}

/// Replaces the user rules with the rules file `toml` (`[tag.<name>]` tables, format in
/// `docs/tag-rules.md`), merged over the built-in rules: it can change weights and thresholds
/// and add tags. A table that doesn't give a valid tag is reported and skipped; a file that
/// can't be read at all is one error with `tag` null and leaves the built-ins. An empty string
/// clears the user rules.
#[wasm_bindgen(js_name = setUserTagRules, unchecked_return_type = "TagRulesReport")]
pub fn set_user_tag_rules(toml: &str) -> Result<JsValue, JsError> {
    let (rules, report) = load_user_rules(toml);
    RULES.set(rules);
    to_js(&report)
}

/// The built-in rules with `toml` merged over them, and the report.
fn load_user_rules(toml: &str) -> (TagRules, TagRulesReport) {
    let parsed = TagRules::builtin().with_user_rules(toml);
    let report = TagRulesReport {
        tags: parsed
            .rules
            .tags()
            .iter()
            .map(|tag| tag.name().to_owned())
            .collect(),
        errors: parsed
            .errors
            .iter()
            .map(|error| TagRuleError {
                tag: error.tag.clone(),
                message: error.to_string(),
            })
            .collect(),
    };
    (parsed.rules, report)
}

fn owned(tags: Vec<&str>) -> Vec<String> {
    tags.into_iter().map(str::to_owned).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_user_rules_file_is_merged_and_its_errors_name_the_tag() {
        let (rules, report) = load_user_rules(
            "[tag.mine]\nchord-threshold = 1\nweights = { b3 = 1 }\n\n[tag.dark.weights]\nb9 = 1\n",
        );
        assert!(report.tags.contains(&"mine".to_owned()));
        assert!(report.tags.contains(&"dark".to_owned()));
        assert_eq!(report.errors.len(), 1);
        assert_eq!(report.errors[0].tag.as_deref(), Some("dark"));
        assert!(
            report.errors[0]
                .message
                .starts_with("tag \"dark\": unknown feature \"b9\""),
            "{}",
            report.errors[0].message
        );
        assert!(rules.get("mine").is_some());
        assert_eq!(rules.get("dark"), TagRules::builtin().get("dark"));
    }

    #[test]
    fn an_unreadable_rules_file_leaves_the_built_ins() {
        let (rules, report) = load_user_rules("[tag.mine\n");
        assert_eq!(&rules, TagRules::builtin());
        assert_eq!(report.errors.len(), 1);
        assert_eq!(report.errors[0].tag, None);
        let (rules, report) = load_user_rules("");
        assert_eq!(&rules, TagRules::builtin());
        assert_eq!(report.errors, []);
    }
}
