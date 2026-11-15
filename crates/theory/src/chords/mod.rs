//! Chords and the chord catalog (SPEC §4.3, §3.3, ADR-5, ADR-27).
//!
//! A [`Chord`] is a named [`Formula`] that may reach past the octave (`9`, `#11`, `13`), with the
//! symbols the chord is written as (`maj7`, `M7`, `Δ7`). The built-in catalog lives in
//! `crates/theory/data/chords.toml`, embedded at build time; user chords arrive as a TOML string
//! in the same format and are merged over it ([`ChordCatalog::with_user_chords`]). The symbol
//! parser and formatter (M2.2) are built on the symbols stored here.

mod catalog;

pub use catalog::{
    ChordCatalog, ChordFamily, MAX_CHORD_SEMITONES, ParsedChords, parse_user_chords,
};

use std::fmt;

use serde::Deserialize;

use crate::formula::{Formula, FormulaError};
use crate::notes::{Accidentals, Interval, NoteName, PitchClass, Spelling};
use crate::scales::{CUSTOM_FAMILY, Source};

/// Why a chord is invalid.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum ChordError {
    /// Not lowercase kebab-case.
    Id(String),
    /// A blank name.
    EmptyName,
    /// A symbol, alias or jazz symbol that is blank or has white space in it. (The symbol of
    /// the major triad is the one empty symbol: `Cmaj`'s `C` has no suffix.)
    Symbol(String),
    /// The same symbol twice among a chord's symbol and aliases.
    DuplicateSymbol(String),
    /// A family given but blank.
    EmptyFamily,
    /// The intervals are not a formula.
    Formula(FormulaError),
    /// An interval of [`MAX_CHORD_SEMITONES`] or more.
    TooWide(Interval),
    /// Only the root: a chord needs at least one more note.
    RootOnly,
    /// Two intervals on one pitch class (`b5` and `#11`).
    RepeatedPitchClass(Interval, Interval),
}

impl fmt::Display for ChordError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Id(id) => write!(
                f,
                "id {id:?} must be lowercase kebab-case, e.g. \"my-chord\""
            ),
            Self::EmptyName => f.write_str("name must not be empty"),
            Self::Symbol(symbol) => write!(
                f,
                "symbol {symbol:?} must not be blank or contain white space"
            ),
            Self::DuplicateSymbol(symbol) => {
                write!(f, "symbol {symbol:?} is listed twice for one chord")
            }
            Self::EmptyFamily => f.write_str("family must not be empty"),
            Self::Formula(error) => error.fmt(f),
            Self::TooWide(interval) => write!(
                f,
                "{:?} is too wide (a chord's intervals stay below two octaves, up to 14)",
                interval.to_string()
            ),
            Self::RootOnly => f.write_str("a chord needs at least one note besides the root"),
            Self::RepeatedPitchClass(a, b) => write!(
                f,
                "{:?} and {:?} are the same note",
                a.to_string(),
                b.to_string()
            ),
        }
    }
}

impl std::error::Error for ChordError {}

impl From<FormulaError> for ChordError {
    fn from(error: FormulaError) -> Self {
        Self::Formula(error)
    }
}

/// A chord as it is written in a catalog file, one `[[chord]]` table (SPEC §4.3).
///
/// `symbol`, `aliases` and `jazz_symbol` are chord *suffixes*, the part after the root: `m7`
/// in `Cm7`. They are written in ASCII (`b5`, `#9`) where a flat or sharp is meant, and are
/// matched case-sensitively (`M7` is major seventh, `m7` minor seventh). Only the major triad
/// has the empty symbol.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChordSpec {
    /// Lowercase kebab-case, unique: what settings and user files refer to.
    pub id: String,
    /// Display name: `Major seventh`.
    pub name: String,
    /// The canonical suffix in the Standard display style (`maj7`, `m7b5`, `""`).
    pub symbol: String,
    /// Other suffixes the symbol parser reads as this chord (`M7`, `Δ7`, `-7`).
    #[serde(default)]
    pub aliases: Vec<String>,
    /// The suffix in the Jazz display style (`Δ7`, `ø`, `°7`), if it differs from `symbol`.
    #[serde(default)]
    pub jazz_symbol: Option<String>,
    /// The group the chord is listed under; `None` lists it under [`CUSTOM_FAMILY`].
    #[serde(default)]
    pub family: Option<String>,
    /// Degree labels from the root, ascending and below [`MAX_CHORD_SEMITONES`], no two on one
    /// pitch class: `["1", "3", "5", "b7", "9"]`.
    pub intervals: Vec<String>,
}

/// A chord: an id, display names and symbols, the family it is listed under and its formula.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Chord {
    id: String,
    name: String,
    symbol: String,
    aliases: Vec<String>,
    jazz_symbol: Option<String>,
    family: String,
    formula: Formula,
    source: Source,
}

/// One note of a chord on a root: its interval label and its spelled name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct ChordNote {
    pub interval: Interval,
    pub name: NoteName,
}

impl ChordNote {
    pub fn pitch_class(self) -> PitchClass {
        self.name.pitch_class()
    }
}

impl Chord {
    /// A user chord, checked as an item of a user file is: a kebab-case id, a non-blank name,
    /// symbols without white space (none twice), a family (`None` lists it under
    /// [`CUSTOM_FAMILY`]), and interval labels that start at `1`, ascend, stay below two
    /// octaves, give at least two notes and never put two on one pitch class.
    pub fn new(spec: ChordSpec) -> Result<Self, ChordError> {
        Self::from_spec(spec, Source::User)
    }

    pub(crate) fn from_spec(spec: ChordSpec, source: Source) -> Result<Self, ChordError> {
        let ChordSpec {
            id,
            name,
            symbol,
            aliases,
            jazz_symbol,
            family,
            intervals,
        } = spec;
        if !crate::catalog_file::is_kebab_case(&id) {
            return Err(ChordError::Id(id));
        }
        if name.trim().is_empty() {
            return Err(ChordError::EmptyName);
        }
        let blank_or_spaced = |s: &String| s.is_empty() || s.chars().any(char::is_whitespace);
        if symbol.chars().any(char::is_whitespace) {
            return Err(ChordError::Symbol(symbol));
        }
        for s in aliases.iter().chain(&jazz_symbol) {
            if blank_or_spaced(s) {
                return Err(ChordError::Symbol(s.clone()));
            }
        }
        for (index, alias) in aliases.iter().enumerate() {
            if *alias == symbol || aliases[..index].contains(alias) {
                return Err(ChordError::DuplicateSymbol(alias.clone()));
            }
        }
        let family = match family {
            Some(family) if family.trim().is_empty() => return Err(ChordError::EmptyFamily),
            Some(family) => family,
            None => CUSTOM_FAMILY.to_owned(),
        };
        let formula = Formula::parse(&intervals)?;
        if let Some(&wide) = formula
            .intervals()
            .iter()
            .find(|interval| interval.semitones() >= MAX_CHORD_SEMITONES)
        {
            return Err(ChordError::TooWide(wide));
        }
        if formula.len() < 2 {
            return Err(ChordError::RootOnly);
        }
        let intervals = formula.intervals();
        for (index, &later) in intervals.iter().enumerate() {
            if let Some(&earlier) = intervals[..index]
                .iter()
                .find(|earlier| earlier.semitones() % 12 == later.semitones() % 12)
            {
                return Err(ChordError::RepeatedPitchClass(earlier, later));
            }
        }
        Ok(Chord {
            id,
            name,
            symbol,
            aliases,
            jazz_symbol,
            family,
            formula,
            source,
        })
    }

    /// The stable id, lowercase kebab-case: `maj7`, `dom7sharp9`.
    pub fn id(&self) -> &str {
        &self.id
    }

    /// The display name: `Major seventh`.
    pub fn name(&self) -> &str {
        &self.name
    }

    /// The canonical suffix, ASCII, in the Standard display style: `maj7`, `m7b5`; empty for
    /// the major triad.
    pub fn symbol(&self) -> &str {
        &self.symbol
    }

    /// The other suffixes that mean this chord: `M7`, `Δ7`. Not the canonical one.
    pub fn aliases(&self) -> &[String] {
        &self.aliases
    }

    /// Every suffix that means this chord, the canonical one first.
    pub fn symbols(&self) -> impl Iterator<Item = &str> {
        std::iter::once(self.symbol.as_str()).chain(self.aliases.iter().map(String::as_str))
    }

    /// The suffix in the Jazz display style: `Δ7`, `ø`, `°7`. The canonical suffix when the
    /// chord has no special jazz form.
    pub fn jazz_symbol(&self) -> &str {
        self.jazz_symbol.as_deref().unwrap_or(&self.symbol)
    }

    /// The family the chord is listed under: `Sevenths`.
    pub fn family(&self) -> &str {
        &self.family
    }

    /// The intervals from the root: the chord's full stack, up to two octaves.
    pub fn formula(&self) -> &Formula {
        &self.formula
    }

    pub fn source(&self) -> Source {
        self.source
    }

    /// The pitch classes of the chord on `root`, in formula order (all different).
    pub fn pitch_classes(&self, root: PitchClass) -> Vec<PitchClass> {
        self.formula.pitch_classes(root).collect()
    }

    /// The chord tones on `root`, in formula order, spelled by the sharp/flat preference
    /// except the root, which keeps its spelling (ADR-6).
    pub fn notes(&self, root: NoteName, accidentals: Accidentals) -> Vec<ChordNote> {
        let spelling = Spelling::new(accidentals).with_root(root);
        self.formula
            .intervals()
            .iter()
            .map(|&interval| ChordNote {
                interval,
                name: spelling.spell(root.pitch_class().up(interval)),
            })
            .collect()
    }
}
