//! Mood tags derived from interval rules (SPEC §5.7, ADR-9, ADR-39, `docs/tag-rules.md`).
//!
//! [`Features`] reads what a formula contains (a ♭2, a tritone acting as a ♭5, a 9th, …) from
//! its semitones. [`TagRules`] weighs those features per tag; an item gets every tag whose
//! score reaches the tag's threshold for its kind ([`ItemKind`]). The built-in rules live in
//! `crates/theory/data/tags.toml`, embedded at build time; a user rules file arrives as a TOML
//! string and is merged over them ([`TagRules::with_user_rules`]). Tags work on any formula,
//! so user scales and chords get them exactly as built-ins do.

mod features;
mod rules;

pub use features::{Feature, Features};
pub use rules::{ItemKind, ParsedTagRules, TagRule, TagRuleError, TagRules};

#[cfg(test)]
mod tests;
