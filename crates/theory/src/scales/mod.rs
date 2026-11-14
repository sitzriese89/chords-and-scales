//! Scales and the scale catalog (SPEC §4.2, §3.3, ADR-5, ADR-20).
//!
//! A [`Scale`] is a named [`Formula`] within one octave. The built-in catalog lives in
//! `crates/theory/data/scales.toml`, embedded at build time; user scales arrive as a TOML
//! string in the same format and are merged over it ([`ScaleCatalog::with_user_scales`]).

mod catalog;

pub use catalog::{CatalogError, ParsedScales, ScaleCatalog, ScaleFamily, parse_user_scales};

use crate::formula::Formula;
use crate::notes::{Accidentals, Interval, NoteName, PitchClass, Spelling};

/// Where a scale comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Source {
    /// The embedded catalog.
    BuiltIn,
    /// A user scale file.
    User,
}

/// A scale: an id, display names, the family it is listed under and its formula.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Scale {
    id: String,
    name: String,
    aliases: Vec<String>,
    family: String,
    formula: Formula,
    source: Source,
}

/// One note of a scale on a root: its interval label and its spelled name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct ScaleNote {
    pub interval: Interval,
    pub name: NoteName,
}

impl ScaleNote {
    pub fn pitch_class(self) -> PitchClass {
        self.name.pitch_class()
    }
}

impl Scale {
    /// The stable id, lowercase kebab-case: `major`, `phrygian-dominant`.
    pub fn id(&self) -> &str {
        &self.id
    }

    /// The display name: `Phrygian dominant`.
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Other names: `Spanish Phrygian`, `Freygish`.
    pub fn aliases(&self) -> &[String] {
        &self.aliases
    }

    /// The family the scale is listed under: `Harmonic minor modes`.
    pub fn family(&self) -> &str {
        &self.family
    }

    /// The intervals from the root, all within one octave.
    pub fn formula(&self) -> &Formula {
        &self.formula
    }

    pub fn source(&self) -> Source {
        self.source
    }

    /// The pitch classes of the scale on `root`, in formula order.
    pub fn pitch_classes(&self, root: PitchClass) -> Vec<PitchClass> {
        self.formula.pitch_classes(root).collect()
    }

    /// The notes of the scale on `root`, in formula order, spelled by the sharp/flat
    /// preference except the root, which keeps its spelling (ADR-6).
    pub fn notes(&self, root: NoteName, accidentals: Accidentals) -> Vec<ScaleNote> {
        let spelling = Spelling::new(accidentals).with_root(root);
        self.formula
            .intervals()
            .iter()
            .map(|&interval| ScaleNote {
                interval,
                name: spelling.spell(root.pitch_class().up(interval)),
            })
            .collect()
    }
}
