//! Scales and the scale catalog (SPEC §4.2, §3.3, ADR-5, ADR-20).
//!
//! A [`Scale`] is a named [`Formula`] within one octave. The built-in catalog lives in
//! `crates/theory/data/scales.toml`, embedded at build time; user scales arrive as a TOML
//! string in the same format and are merged over it ([`ScaleCatalog::with_user_scales`]).

//! The scale editor saves the user's file: [`Scale::new`] checks one scale as an item of a
//! file is checked, [`write_scales`] writes the file (and refuses duplicate ids and names) and
//! [`ScaleCatalog::new_id`] makes the id of a new user scale (ADR-26).

mod catalog;

pub use catalog::{
    CUSTOM_FAMILY, CatalogError, ParsedScales, ScaleCatalog, ScaleFamily, parse_user_scales,
    write_scales,
};

use std::fmt;

use crate::formula::{Formula, FormulaError};
use crate::notes::{Accidentals, Interval, NoteName, PitchClass, Spelling};

/// Why a scale is invalid, or why a list of scales can't be written as one file.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum ScaleError {
    /// Not lowercase kebab-case.
    Id(String),
    /// A blank name.
    EmptyName,
    /// A blank alias.
    EmptyAlias,
    /// A family given but blank.
    EmptyFamily,
    /// The intervals are not a formula.
    Formula(FormulaError),
    /// An interval of an octave or more.
    OutsideOctave(Interval),
    /// Only the root: a scale needs at least one more note.
    RootOnly,
    /// Two scales with one id in one file ([`write_scales`]).
    DuplicateId(String),
    /// Two scales with one name in the catalog a file would give ([`write_scales`]).
    DuplicateName(String),
}

impl fmt::Display for ScaleError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Id(id) => write!(
                f,
                "id {id:?} must be lowercase kebab-case, e.g. \"my-scale\""
            ),
            Self::EmptyName => f.write_str("name must not be empty"),
            Self::EmptyAlias => f.write_str("aliases must not be empty"),
            Self::EmptyFamily => f.write_str("family must not be empty"),
            Self::Formula(error) => error.fmt(f),
            Self::OutsideOctave(interval) => write!(
                f,
                "{:?} is not within the octave (a scale's intervals are 1 to 7)",
                interval.to_string()
            ),
            Self::RootOnly => f.write_str("a scale needs at least one note besides the root"),
            Self::DuplicateId(id) => write!(f, "two scales have the id {id:?}"),
            Self::DuplicateName(name) => write!(f, "there is already a scale called {name:?}"),
        }
    }
}

impl std::error::Error for ScaleError {}

impl From<FormulaError> for ScaleError {
    fn from(error: FormulaError) -> Self {
        Self::Formula(error)
    }
}

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
    /// A user scale, checked as an item of a user file is: a kebab-case id, a non-blank name,
    /// aliases and family (`None` lists it under [`CUSTOM_FAMILY`]), and interval labels that
    /// start at `1`, ascend, stay within the octave and give at least two notes.
    pub fn new<S: AsRef<str>>(
        id: impl Into<String>,
        name: impl Into<String>,
        aliases: Vec<String>,
        family: Option<String>,
        intervals: &[S],
    ) -> Result<Self, ScaleError> {
        Self::build(
            id.into(),
            name.into(),
            aliases,
            family,
            intervals,
            Source::User,
        )
    }

    pub(crate) fn build<S: AsRef<str>>(
        id: String,
        name: String,
        aliases: Vec<String>,
        family: Option<String>,
        intervals: &[S],
        source: Source,
    ) -> Result<Self, ScaleError> {
        if !catalog::is_kebab_case(&id) {
            return Err(ScaleError::Id(id));
        }
        if name.trim().is_empty() {
            return Err(ScaleError::EmptyName);
        }
        if aliases.iter().any(|alias| alias.trim().is_empty()) {
            return Err(ScaleError::EmptyAlias);
        }
        let family = match family {
            Some(family) if family.trim().is_empty() => return Err(ScaleError::EmptyFamily),
            Some(family) => family,
            None => CUSTOM_FAMILY.to_owned(),
        };
        let formula = Formula::parse(intervals)?;
        if let Some(&outside) = formula
            .intervals()
            .iter()
            .find(|interval| interval.semitones() >= 12)
        {
            return Err(ScaleError::OutsideOctave(outside));
        }
        if formula.len() < 2 {
            return Err(ScaleError::RootOnly);
        }
        Ok(Scale {
            id,
            name,
            aliases,
            family,
            formula,
            source,
        })
    }

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
