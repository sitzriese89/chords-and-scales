//! Tunings: the open strings of a guitar or bass (SPEC §5.1, ADR-5, ADR-21).
//!
//! A [`Tuning`] lists its open-string notes **lowest string first** (the order they are written
//! in, `E2 A2 D3 G3 B3 E4`). The fretboard numbers strings the other way round, string 1 being
//! the highest (ADR-18); [`crate::fretboard::positions`] does that conversion.
//!
//! Built-in presets live in `data/tunings.toml`. User tunings use the same TOML format and are
//! parsed from a string by [`parse_tunings`]; reading the file is the app's job (ADR-4). A bad
//! item is reported with its number and reason and skipped, the rest still load.
//! [`TuningCatalog::merge`] puts user tunings on top of the built-ins: one with a built-in id
//! replaces it.

use std::collections::HashSet;
use std::fmt;
use std::sync::LazyLock;

use serde::Deserialize;

use crate::notes::Note;

/// The built-in tunings, as embedded at build time.
const BUILTIN_TOML: &str = include_str!("../data/tunings.toml");

/// Guitar or bass. Only a label: it doesn't change how notes map onto the neck.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InstrumentKind {
    Guitar,
    Bass,
}

impl InstrumentKind {
    /// `"guitar"` or `"bass"`, as in TOML and settings.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Guitar => "guitar",
            Self::Bass => "bass",
        }
    }
}

impl fmt::Display for InstrumentKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A named tuning: an instrument kind and 4 to 9 open-string notes, lowest string first.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tuning {
    id: String,
    name: String,
    kind: InstrumentKind,
    notes: Vec<Note>,
}

impl Tuning {
    pub const MIN_STRINGS: usize = 4;
    pub const MAX_STRINGS: usize = 9;
    /// Lowest accepted open string, C0 (MIDI 12): well below a 6-string bass's low B0.
    pub const LOWEST_NOTE: u8 = 12;
    /// Highest accepted open string, C6 (MIDI 84): well above a guitar's high E4.
    pub const HIGHEST_NOTE: u8 = 84;
    /// Longest accepted id or name, in characters (as for ids in `settings.toml`).
    pub const MAX_TEXT: usize = 64;

    /// A validated tuning. `notes` are the open strings, lowest string first.
    ///
    /// The id must be lowercase kebab-case (`guitar-6-drop-d`), the name non-blank, both at
    /// most [`Self::MAX_TEXT`] characters; 4 to 9 notes, each from C0 to C6. The notes need
    /// not rise from string to string (re-entrant tunings exist).
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        kind: InstrumentKind,
        notes: Vec<Note>,
    ) -> Result<Self, TuningError> {
        let id = id.into();
        let name = name.into().trim().to_owned();
        if !is_kebab_case(&id) || id.chars().count() > Self::MAX_TEXT {
            return Err(TuningError::Id(id));
        }
        if name.is_empty() || name.chars().count() > Self::MAX_TEXT {
            return Err(TuningError::Name(name));
        }
        if !(Self::MIN_STRINGS..=Self::MAX_STRINGS).contains(&notes.len()) {
            return Err(TuningError::StringCount(notes.len()));
        }
        if let Some(&note) = notes
            .iter()
            .find(|note| !(Self::LOWEST_NOTE..=Self::HIGHEST_NOTE).contains(&note.midi()))
        {
            return Err(TuningError::NoteOutOfRange(note));
        }
        Ok(Self {
            id,
            name,
            kind,
            notes,
        })
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn kind(&self) -> InstrumentKind {
        self.kind
    }

    /// The open strings, lowest string first.
    pub fn notes(&self) -> &[Note] {
        &self.notes
    }

    /// The number of strings, 4 … 9.
    pub fn string_count(&self) -> usize {
        self.notes.len()
    }

    /// The open note of fretboard string `string`, numbered as on the fretboard (ADR-18):
    /// 1 is the highest string, [`Self::string_count`] the lowest. `None` outside that range.
    pub fn open_note(&self, string: usize) -> Option<Note> {
        let count = self.notes.len();
        (1..=count)
            .contains(&string)
            .then(|| self.notes[count - string])
    }
}

/// `abc`, `guitar-6-drop-d`: lowercase ASCII letters and digits in groups joined by single
/// hyphens.
fn is_kebab_case(id: &str) -> bool {
    !id.is_empty()
        && id.split('-').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        })
}

/// Why a tuning is invalid.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum TuningError {
    /// Not lowercase kebab-case, or too long.
    Id(String),
    /// Blank or too long.
    Name(String),
    /// Fewer than 4 or more than 9 strings.
    StringCount(usize),
    /// An open string below C0 or above C6.
    NoteOutOfRange(Note),
}

impl fmt::Display for TuningError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Id(id) => write!(
                f,
                "id {id:?} is not lowercase kebab-case of at most {} characters (e.g. guitar-6-drop-d)",
                Tuning::MAX_TEXT
            ),
            Self::Name(name) => write!(
                f,
                "name {name:?} is blank or longer than {} characters",
                Tuning::MAX_TEXT
            ),
            Self::StringCount(count) => write!(
                f,
                "{count} strings; a tuning has {} to {} strings",
                Tuning::MIN_STRINGS,
                Tuning::MAX_STRINGS
            ),
            Self::NoteOutOfRange(note) => write!(
                f,
                "open string {} is outside the range C0 to C6",
                note.format(crate::Accidentals::Sharps, crate::Glyphs::Ascii)
            ),
        }
    }
}

impl std::error::Error for TuningError {}

/// One `[[tuning]]` table as written in TOML.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawTuning {
    id: String,
    name: String,
    kind: InstrumentKind,
    notes: Vec<String>,
}

impl RawTuning {
    fn into_tuning(self) -> Result<Tuning, String> {
        let notes = self
            .notes
            .iter()
            .enumerate()
            .map(|(i, note)| {
                note.parse::<Note>()
                    .map_err(|err| format!("notes[{i}]: {err}"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        Tuning::new(self.id, self.name, self.kind, notes).map_err(|err| err.to_string())
    }
}

/// The tunings read from a TOML document, and the items that were skipped.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ParsedTunings {
    /// Valid items, in file order.
    pub tunings: Vec<Tuning>,
    /// One entry per skipped item.
    pub errors: Vec<TuningItemError>,
}

/// Why one `[[tuning]]` item was skipped.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TuningItemError {
    /// Which `[[tuning]]` table: 1 for the first in the file.
    pub number: usize,
    /// Its `id`, if it has a string one.
    pub id: Option<String>,
    /// What is wrong with it.
    pub reason: String,
}

impl fmt::Display for TuningItemError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "tuning {}", self.number)?;
        if let Some(id) = &self.id {
            write!(f, " ({id:?})")?;
        }
        write!(f, ": {}", self.reason)
    }
}

impl std::error::Error for TuningItemError {}

/// Why a tunings document couldn't be read at all.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum TuningFileError {
    /// Not valid TOML; carries the parser's message.
    Toml(String),
    /// A top-level key other than `tuning`.
    UnknownKey(String),
    /// `tuning` is not an array of tables (`[[tuning]]`).
    NotAnArray,
}

impl fmt::Display for TuningFileError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Toml(message) => write!(f, "not valid TOML: {}", message.trim_end()),
            Self::UnknownKey(key) => write!(
                f,
                "unknown top-level key {key:?}; a tunings file only has [[tuning]] tables"
            ),
            Self::NotAnArray => f.write_str("`tuning` must be an array of [[tuning]] tables"),
        }
    }
}

impl std::error::Error for TuningFileError {}

/// Reads tunings from a TOML document of `[[tuning]]` tables (the format of
/// `data/tunings.toml`).
///
/// A document that isn't TOML, has other top-level keys or no array under `tuning` is an
/// error. Otherwise every valid item loads and every invalid one is listed in
/// [`ParsedTunings::errors`]: a missing, unknown or mistyped field, a note that doesn't parse,
/// an invalid tuning ([`Tuning::new`]) or an id already used earlier in the same document.
pub fn parse_tunings(input: &str) -> Result<ParsedTunings, TuningFileError> {
    let mut table: toml::Table = input
        .parse()
        .map_err(|err: toml::de::Error| TuningFileError::Toml(err.message().to_owned()))?;
    let items = match table.remove("tuning") {
        None => Vec::new(),
        Some(toml::Value::Array(items)) => items,
        Some(_) => return Err(TuningFileError::NotAnArray),
    };
    if let Some(key) = table.keys().next() {
        return Err(TuningFileError::UnknownKey(key.clone()));
    }

    let mut parsed = ParsedTunings::default();
    let mut seen = HashSet::new();
    for (i, item) in items.into_iter().enumerate() {
        let number = i + 1;
        let id = item
            .get("id")
            .and_then(toml::Value::as_str)
            .map(str::to_owned);
        let result = if item.is_table() {
            item.try_into::<RawTuning>()
                .map_err(|err| err.message().trim_end().to_owned())
                .and_then(RawTuning::into_tuning)
        } else {
            Err("not a table".to_owned())
        };
        match result {
            Ok(tuning) if !seen.insert(tuning.id().to_owned()) => {
                parsed.errors.push(TuningItemError {
                    number,
                    id,
                    reason: "duplicate id; an earlier tuning in this file already uses it"
                        .to_owned(),
                });
            }
            Ok(tuning) => parsed.tunings.push(tuning),
            Err(reason) => parsed.errors.push(TuningItemError { number, id, reason }),
        }
    }
    Ok(parsed)
}

static BUILTIN: LazyLock<Vec<Tuning>> = LazyLock::new(|| {
    let parsed = parse_tunings(BUILTIN_TOML).expect("data/tunings.toml is a tunings document");
    assert!(
        parsed.errors.is_empty(),
        "data/tunings.toml has invalid items: {:?}",
        parsed.errors
    );
    parsed.tunings
});

/// The built-in presets from `data/tunings.toml`, in file order.
pub fn builtin_tunings() -> &'static [Tuning] {
    &BUILTIN
}

/// The tunings to offer: the built-ins with the user's on top.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TuningCatalog {
    tunings: Vec<Tuning>,
}

impl TuningCatalog {
    /// Only the built-in presets.
    pub fn builtin() -> Self {
        Self {
            tunings: builtin_tunings().to_vec(),
        }
    }

    /// Adds `user` tunings. One whose id is already in the catalog replaces that tuning in
    /// its place; the others are appended in order.
    pub fn merge(&mut self, user: impl IntoIterator<Item = Tuning>) {
        for tuning in user {
            match self.tunings.iter_mut().find(|t| t.id == tuning.id) {
                Some(existing) => *existing = tuning,
                None => self.tunings.push(tuning),
            }
        }
    }

    /// Every tuning: built-ins in file order, then user additions.
    pub fn tunings(&self) -> &[Tuning] {
        &self.tunings
    }

    /// The tuning with id `id`.
    pub fn get(&self, id: &str) -> Option<&Tuning> {
        self.tunings.iter().find(|t| t.id == id)
    }
}

impl Default for TuningCatalog {
    fn default() -> Self {
        Self::builtin()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notes(names: &[&str]) -> Vec<Note> {
        names.iter().map(|n| n.parse().unwrap()).collect()
    }

    #[test]
    fn builtin_tunings_are_valid() {
        let parsed = parse_tunings(BUILTIN_TOML).unwrap();
        assert_eq!(parsed.errors, []);
        assert!(!parsed.tunings.is_empty());
        for tuning in &parsed.tunings {
            // Built-in ids follow `<kind>-<strings>-<name>`.
            let prefix = format!("{}-{}-", tuning.kind(), tuning.string_count());
            assert!(
                tuning.id().starts_with(&prefix),
                "{} should start with {prefix}",
                tuning.id()
            );
            // Built-ins rise from string to string.
            assert!(
                tuning.notes().windows(2).all(|w| w[0] < w[1]),
                "{} does not rise",
                tuning.id()
            );
        }
        assert_eq!(builtin_tunings(), parsed.tunings.as_slice());
    }

    #[test]
    fn builtin_presets_cover_every_string_count() {
        for count in Tuning::MIN_STRINGS..=Tuning::MAX_STRINGS {
            assert!(
                builtin_tunings()
                    .iter()
                    .any(|t| t.string_count() == count && t.id().ends_with("-standard")),
                "no standard tuning with {count} strings"
            );
        }
    }

    #[test]
    fn builtin_presets_named_in_the_spec() {
        let catalog = TuningCatalog::builtin();
        let expect = |id: &str, names: &[&str], kind: InstrumentKind| {
            let tuning = catalog.get(id).unwrap_or_else(|| panic!("missing {id}"));
            assert_eq!(tuning.notes(), notes(names), "{id}");
            assert_eq!(tuning.kind(), kind, "{id}");
        };
        use InstrumentKind::{Bass, Guitar};
        // The default in settings.toml (#38).
        expect(
            "guitar-6-standard",
            &["E2", "A2", "D3", "G3", "B3", "E4"],
            Guitar,
        );
        expect(
            "guitar-6-drop-d",
            &["D2", "A2", "D3", "G3", "B3", "E4"],
            Guitar,
        );
        expect(
            "guitar-6-dadgad",
            &["D2", "A2", "D3", "G3", "A3", "D4"],
            Guitar,
        );
        expect(
            "guitar-6-open-g",
            &["D2", "G2", "D3", "G3", "B3", "D4"],
            Guitar,
        );
        expect(
            "guitar-6-open-d",
            &["D2", "A2", "D3", "F#3", "A3", "D4"],
            Guitar,
        );
        expect(
            "guitar-7-standard",
            &["B1", "E2", "A2", "D3", "G3", "B3", "E4"],
            Guitar,
        );
        expect(
            "guitar-8-standard",
            &["F#1", "B1", "E2", "A2", "D3", "G3", "B3", "E4"],
            Guitar,
        );
        expect(
            "guitar-9-standard",
            &["C#1", "F#1", "B1", "E2", "A2", "D3", "G3", "B3", "E4"],
            Guitar,
        );
        expect("bass-4-standard", &["E1", "A1", "D2", "G2"], Bass);
        expect("bass-5-standard", &["B0", "E1", "A1", "D2", "G2"], Bass);
        expect(
            "bass-6-standard",
            &["B0", "E1", "A1", "D2", "G2", "C3"],
            Bass,
        );
    }

    #[test]
    fn open_note_numbers_strings_from_the_highest() {
        let standard = TuningCatalog::builtin();
        let standard = standard.get("guitar-6-standard").unwrap();
        assert_eq!(standard.open_note(1), Some("E4".parse().unwrap()));
        assert_eq!(standard.open_note(6), Some("E2".parse().unwrap()));
        assert_eq!(standard.open_note(0), None);
        assert_eq!(standard.open_note(7), None);
    }

    #[test]
    fn validates_tunings() {
        let six = || notes(&["E2", "A2", "D3", "G3", "B3", "E4"]);
        let guitar = InstrumentKind::Guitar;
        assert!(Tuning::new("my-tuning-2", "Mine", guitar, six()).is_ok());
        for id in [
            "",
            "Upper",
            "a--b",
            "-a",
            "a-",
            "a_b",
            "a b",
            &"a".repeat(65),
        ] {
            assert_eq!(
                Tuning::new(id, "Mine", guitar, six()),
                Err(TuningError::Id(id.to_owned())),
                "{id:?}"
            );
        }
        assert_eq!(
            Tuning::new("a", "  ", guitar, six()),
            Err(TuningError::Name(String::new()))
        );
        assert_eq!(
            Tuning::new("a", "  Padded  ", guitar, six())
                .unwrap()
                .name(),
            "Padded"
        );
        assert_eq!(
            Tuning::new("a", "x", guitar, notes(&["E2", "A2", "D3"])),
            Err(TuningError::StringCount(3))
        );
        assert_eq!(
            Tuning::new("a", "x", guitar, notes(&["E2"; 10])),
            Err(TuningError::StringCount(10))
        );
        assert_eq!(
            Tuning::new("a", "x", guitar, notes(&["B-1", "E2", "A2", "D3"])),
            Err(TuningError::NoteOutOfRange("B-1".parse().unwrap()))
        );
        assert_eq!(
            Tuning::new("a", "x", guitar, notes(&["E2", "A2", "D3", "C#6"])),
            Err(TuningError::NoteOutOfRange("C#6".parse().unwrap()))
        );
        // The edges of the range are accepted, and so are re-entrant tunings.
        assert!(Tuning::new("a", "x", guitar, notes(&["C0", "C6", "G3", "D4"])).is_ok());
    }

    #[test]
    fn parses_valid_items_and_reports_the_bad_ones() {
        let input = r#"
            [[tuning]]
            id = "guitar-6-open-c6"
            name = "Open C6"
            kind = "guitar"
            notes = ["C2", "A2", "C3", "G3", "C4", "E4"]

            [[tuning]]
            id = "too-few"
            name = "Too few"
            kind = "bass"
            notes = ["E1", "A1", "D2"]

            [[tuning]]
            id = "bad-note"
            name = "Bad note"
            kind = "guitar"
            notes = ["E2", "A2", "H3", "G3"]

            [[tuning]]
            id = "ukulele-4"
            name = "Uke"
            kind = "ukulele"
            notes = ["G4", "C4", "E4", "A4"]

            [[tuning]]
            name = "No id"
            kind = "guitar"
            notes = ["E2", "A2", "D3", "G3"]

            [[tuning]]
            id = "extra"
            name = "Extra"
            kind = "bass"
            notes = ["E1", "A1", "D2", "G2"]
            frets = 24

            [[tuning]]
            id = "guitar-6-open-c6"
            name = "Again"
            kind = "guitar"
            notes = ["C2", "A2", "C3", "G3", "C4", "E4"]

            [[tuning]]
            id = "bass-4-low"
            name = "Low"
            kind = "bass"
            notes = ["C1", "G1", "C2", "F2"]
        "#;
        let parsed = parse_tunings(input).unwrap();
        let ids: Vec<&str> = parsed.tunings.iter().map(Tuning::id).collect();
        assert_eq!(ids, ["guitar-6-open-c6", "bass-4-low"]);

        let errors: Vec<(usize, Option<&str>)> = parsed
            .errors
            .iter()
            .map(|e| (e.number, e.id.as_deref()))
            .collect();
        assert_eq!(
            errors,
            [
                (2, Some("too-few")),
                (3, Some("bad-note")),
                (4, Some("ukulele-4")),
                (5, None),
                (6, Some("extra")),
                (7, Some("guitar-6-open-c6")),
            ]
        );
        let reason = |n: usize| parsed.errors[n].reason.as_str();
        assert!(reason(0).contains("3 strings"), "{}", reason(0));
        assert!(
            reason(1).contains("notes[2]") && reason(1).contains("\"H3\""),
            "{}",
            reason(1)
        );
        assert!(reason(2).contains("ukulele"), "{}", reason(2));
        assert!(reason(3).contains("id"), "{}", reason(3));
        assert!(reason(4).contains("frets"), "{}", reason(4));
        assert!(reason(5).contains("duplicate id"), "{}", reason(5));
        assert_eq!(
            parsed.errors[0].to_string(),
            format!("tuning 2 (\"too-few\"): {}", reason(0))
        );
    }

    #[test]
    fn rejects_documents_that_are_not_tunings_files() {
        assert!(matches!(
            parse_tunings("[[tuning]\n"),
            Err(TuningFileError::Toml(_))
        ));
        assert_eq!(
            parse_tunings("version = 1\n"),
            Err(TuningFileError::UnknownKey("version".to_owned()))
        );
        assert_eq!(
            parse_tunings("tuning = 3\n"),
            Err(TuningFileError::NotAnArray)
        );
        assert_eq!(
            parse_tunings("[tuning]\nid = \"a\"\n"),
            Err(TuningFileError::NotAnArray)
        );
        assert_eq!(parse_tunings("").unwrap(), ParsedTunings::default());
        let parsed = parse_tunings("tuning = [1]\n").unwrap();
        assert_eq!(parsed.errors[0].reason, "not a table");
    }

    #[test]
    fn user_tunings_replace_builtins_with_the_same_id() {
        let user = parse_tunings(
            r#"
            [[tuning]]
            id = "guitar-6-drop-d"
            name = "My drop D"
            kind = "guitar"
            notes = ["D2", "A2", "D3", "G3", "B3", "D4"]

            [[tuning]]
            id = "guitar-6-nashville"
            name = "Nashville"
            kind = "guitar"
            notes = ["E3", "A3", "D4", "G4", "B3", "E4"]
            "#,
        )
        .unwrap();
        assert_eq!(user.errors, []);

        let mut catalog = TuningCatalog::builtin();
        let builtin_count = catalog.tunings().len();
        let drop_d_at = catalog
            .tunings()
            .iter()
            .position(|t| t.id() == "guitar-6-drop-d")
            .unwrap();
        catalog.merge(user.tunings);

        assert_eq!(catalog.tunings().len(), builtin_count + 1);
        assert_eq!(catalog.tunings()[drop_d_at].name(), "My drop D");
        assert_eq!(catalog.get("guitar-6-drop-d").unwrap().name(), "My drop D");
        assert_eq!(catalog.tunings().last().unwrap().id(), "guitar-6-nashville");
        // The built-ins themselves are untouched.
        assert_eq!(
            TuningCatalog::builtin()
                .get("guitar-6-drop-d")
                .unwrap()
                .name(),
            "Drop D"
        );
    }
}
