use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use serde::Serialize;

use super::{Chord, ChordError, ChordSpec, SymbolStyle, format_symbol};
use crate::catalog_file::{CatalogError, name_key, new_id, parse_items};
use crate::notes::{Interval, NoteName};
use crate::scales::Source;

/// The built-in catalog, embedded at build time.
const BUILTIN_TOML: &str = include_str!("../../data/chords.toml");

/// Chord intervals stay below this many semitones: two octaves.
pub const MAX_CHORD_SEMITONES: u8 = 24;

/// A set of chords: the built-ins, optionally with user chords merged over them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChordCatalog {
    chords: Vec<Chord>,
}

/// A family of chords as listed: its name and its chords in catalog order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChordFamily<'a> {
    pub name: &'a str,
    pub chords: Vec<&'a Chord>,
}

/// A chord file read item by item: the valid chords, and an error for each item that is not.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ParsedChords {
    pub chords: Vec<Chord>,
    pub errors: Vec<CatalogError>,
}

impl ChordCatalog {
    /// The built-in catalog. Its validity is checked by the `builtin_chords_are_valid` test.
    pub fn builtin() -> &'static ChordCatalog {
        static BUILTIN: OnceLock<ChordCatalog> = OnceLock::new();
        BUILTIN.get_or_init(|| {
            let parsed = parse(BUILTIN_TOML, Source::BuiltIn);
            if let Some(error) = parsed.errors.first() {
                panic!("invalid built-in chord catalog: {error}");
            }
            ChordCatalog {
                chords: parsed.chords,
            }
        })
    }

    /// All chords in catalog order.
    pub fn chords(&self) -> &[Chord] {
        &self.chords
    }

    /// The chord with `id`, if any.
    pub fn get(&self, id: &str) -> Option<&Chord> {
        self.chords.iter().find(|chord| chord.id == id)
    }

    /// The chord that `suffix` (`m7b5`, `M7`, `""`) is a symbol, alias or Jazz symbol of: an
    /// exact, case-sensitive match. If several chords have it, the last wins, so a user chord
    /// takes a suffix over a built-in one. The symbol parser ([`super::parse_symbol`])
    /// normalises what the user typed (flat and sharp signs, parentheses) before it asks.
    pub fn find_by_symbol(&self, suffix: &str) -> Option<&Chord> {
        self.chords
            .iter()
            .rev()
            .find(|chord| chord.suffixes().any(|symbol| symbol == suffix))
    }

    /// The chords grouped by family; families in the order they first appear.
    pub fn families(&self) -> Vec<ChordFamily<'_>> {
        let mut families: Vec<ChordFamily<'_>> = Vec::new();
        for chord in &self.chords {
            match families
                .iter_mut()
                .find(|family| family.name == chord.family)
            {
                Some(family) => family.chords.push(chord),
                None => families.push(ChordFamily {
                    name: &chord.family,
                    chords: vec![chord],
                }),
            }
        }
        families
    }

    /// This catalog with `user` chords merged over it: a user chord with the id of an existing
    /// one replaces it in place; others are added at the end, in order.
    pub fn with_user_chords(&self, user: impl IntoIterator<Item = Chord>) -> ChordCatalog {
        let mut chords = self.chords.clone();
        for chord in user {
            match chords.iter_mut().find(|existing| existing.id == chord.id) {
                Some(existing) => *existing = chord,
                None => chords.push(chord),
            }
        }
        ChordCatalog { chords }
    }
}

/// Reads a user chord file: a TOML string of `[[chord]]` tables in the catalog format. Never
/// fails as a whole: each broken item gets a [`CatalogError`] and the valid items still load.
/// Within the file the first item with an id wins; later ones with the same id are errors.
pub fn parse_user_chords(toml: &str) -> ParsedChords {
    parse(toml, Source::User)
}

fn parse(toml: &str, source: Source) -> ParsedChords {
    let (chords, errors) = parse_items(
        toml,
        "chord",
        |item| match item.try_into::<ChordSpec>() {
            Ok(spec) => Chord::from_spec(spec, source).map_err(|error| error.to_string()),
            Err(error) => Err(error.message().trim().to_owned()),
        },
        Chord::id,
    );
    ParsedChords { chords, errors }
}

impl ChordCatalog {
    /// The id for a new user chord called `name`, made as for scales
    /// ([`crate::ScaleCatalog::new_id`]): the kebab-case slug of the name (`"My 7♯9"` →
    /// `my-7-9`), with `-2`, `-3`, … if a chord in this catalog or a built-in one has it, so a
    /// new chord never replaces another. `custom` for a name without ASCII letters or digits;
    /// at most 64 characters.
    pub fn new_id(&self, name: &str) -> String {
        new_id(name, |id| {
            self.get(id).is_some() || ChordCatalog::builtin().get(id).is_some()
        })
    }
}

/// The label the chord editor offers for each width from 0 to 23 semitones (index =
/// semitones): the label the built-in chords use most for that width (`#5`, `#9`, `#11`, `b13`;
/// the first one in catalog order on a tie), the default label ([`Interval::from_semitones`])
/// for a width within the octave that no built-in chord uses (`b2`), and `None` for a width
/// above the octave that none uses (`8`, `10`, `12`, `b14`, `14`): those are chord tones an
/// octave up, which a chord writes within the octave.
pub fn chord_interval_labels() -> &'static [Option<Interval>] {
    static LABELS: OnceLock<Vec<Option<Interval>>> = OnceLock::new();
    LABELS.get_or_init(|| {
        let mut used: Vec<Vec<(Interval, usize)>> = vec![Vec::new(); MAX_CHORD_SEMITONES.into()];
        for chord in ChordCatalog::builtin().chords() {
            for &interval in chord.formula().intervals() {
                let counts = &mut used[usize::from(interval.semitones())];
                match counts.iter_mut().find(|(label, _)| *label == interval) {
                    Some((_, count)) => *count += 1,
                    None => counts.push((interval, 1)),
                }
            }
        }
        (0..MAX_CHORD_SEMITONES)
            .map(|semitones| {
                let counts = &used[usize::from(semitones)];
                // `max_by_key` would keep the last of equals; the first one wins here.
                let most =
                    counts
                        .iter()
                        .fold(None::<&(Interval, usize)>, |best, entry| match best {
                            Some(best) if best.1 >= entry.1 => Some(best),
                            _ => Some(entry),
                        });
                most.map(|&(label, _)| label).or_else(|| {
                    (semitones < 12)
                        .then(|| Interval::from_semitones(semitones))
                        .flatten()
                })
            })
            .collect()
    })
}

/// The header of a chord file written by [`write_chords`].
const WRITTEN_HEADER: &str = "\
# Your chords, written by Chords & Scales in the format of the built-in chords.
# You can edit this file while the app is closed; the app doesn't keep comments when it saves.
";

/// One `[[chord]]` table as [`write_chords`] writes it.
#[derive(Serialize)]
struct WrittenChord<'a> {
    id: &'a str,
    name: &'a str,
    symbol: &'a str,
    #[serde(skip_serializing_if = "<[String]>::is_empty")]
    aliases: &'a [String],
    #[serde(skip_serializing_if = "Option::is_none")]
    jazz_symbol: Option<&'a str>,
    family: &'a str,
    intervals: Vec<String>,
}

#[derive(Serialize)]
struct WrittenFile<'a> {
    chord: Vec<WrittenChord<'a>>,
}

/// Writes `chords` as a user chord file that [`parse_user_chords`] reads back unchanged and in
/// order (intervals as ASCII labels, kept as they are: `#11` stays `#11`; `aliases` and
/// `jazz_symbol` only when there are some).
///
/// Refuses what reading the file back would not keep, or what would make chords ambiguous, in
/// the catalog the file gives (the built-ins merged with these chords; a user chord that
/// replaces a built-in by id may keep its name and suffixes):
/// - two chords with one id ([`ChordError::DuplicateId`]);
/// - two chords with one name, case and extra spaces ignored ([`ChordError::DuplicateName`]);
/// - a suffix (symbol, alias or Jazz symbol) of a chord of `chords` that another chord has
///   ([`ChordError::SymbolTaken`], or [`ChordError::NoSymbol`] for an empty symbol): the parser
///   would read it as only one of them;
/// - a suffix of a chord of `chords` that the symbol parser doesn't read back as that chord
///   after the root `C`, as typed and as the formatter shows it
///   ([`ChordError::UnreadableSymbol`]).
pub fn write_chords(chords: &[Chord]) -> Result<String, ChordError> {
    let mut ids = HashSet::new();
    if let Some(chord) = chords.iter().find(|chord| !ids.insert(chord.id())) {
        return Err(ChordError::DuplicateId(chord.id().to_owned()));
    }
    let merged = ChordCatalog::builtin().with_user_chords(chords.iter().cloned());
    let mut names = HashSet::new();
    if let Some(chord) = merged
        .chords()
        .iter()
        .find(|chord| !names.insert(name_key(chord.name())))
    {
        return Err(ChordError::DuplicateName(chord.name().to_owned()));
    }
    check_suffixes(&merged)?;
    if chords.is_empty() {
        return Ok(WRITTEN_HEADER.to_owned());
    }
    let file = WrittenFile {
        chord: chords
            .iter()
            .map(|chord| WrittenChord {
                id: chord.id(),
                name: chord.name(),
                symbol: chord.symbol(),
                aliases: chord.aliases(),
                jazz_symbol: chord.jazz_symbol.as_deref(),
                family: chord.family(),
                intervals: chord
                    .formula()
                    .intervals()
                    .iter()
                    .map(ToString::to_string)
                    .collect(),
            })
            .collect(),
    };
    let body = toml::to_string(&file).expect("a list of chords is valid TOML");
    Ok(format!("{WRITTEN_HEADER}\n{body}"))
}

/// The suffix rules of [`write_chords`], for the user chords of `merged`.
fn check_suffixes(merged: &ChordCatalog) -> Result<(), ChordError> {
    let mut owners: HashMap<&str, &Chord> = HashMap::new();
    for chord in merged.chords() {
        for suffix in chord.suffixes() {
            let Some(&owner) = owners.get(suffix) else {
                owners.insert(suffix, chord);
                continue;
            };
            if owner.id() == chord.id()
                || (owner.source() == Source::BuiltIn && chord.source() == Source::BuiltIn)
            {
                continue;
            }
            // Report it for the user's chord, naming the other one.
            let (mine, other) = if chord.source() == Source::User {
                (chord, owner)
            } else {
                (owner, chord)
            };
            if suffix.is_empty() && mine.symbol().is_empty() {
                return Err(ChordError::NoSymbol);
            }
            return Err(ChordError::SymbolTaken {
                symbol: suffix.to_owned(),
                chord: other.name().to_owned(),
            });
        }
    }

    let root: NoteName = "C".parse().expect("C is a note");
    for chord in merged
        .chords()
        .iter()
        .filter(|chord| chord.source() == Source::User)
    {
        let reads_back = |text: &str| {
            merged.parse_symbol(text).is_ok_and(|found| {
                found.root == root && found.chord_id == chord.id() && found.bass.is_none()
            })
        };
        for suffix in chord.suffixes() {
            if !reads_back(&format!("C{suffix}")) {
                return Err(ChordError::UnreadableSymbol(suffix.to_owned()));
            }
        }
        for (style, suffix) in [
            (SymbolStyle::Standard, chord.symbol()),
            (SymbolStyle::Jazz, chord.jazz_symbol()),
        ] {
            if !reads_back(&format_symbol(root, chord, None, style)) {
                return Err(ChordError::UnreadableSymbol(suffix.to_owned()));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;
    use crate::notes::{Accidentals, NoteName, PitchClass};
    use crate::scales::CUSTOM_FAMILY as CUSTOM;

    fn errors(toml: &str) -> Vec<String> {
        parse_user_chords(toml)
            .errors
            .iter()
            .map(ToString::to_string)
            .collect()
    }

    fn ids(parsed: &ParsedChords) -> Vec<&str> {
        parsed.chords.iter().map(Chord::id).collect()
    }

    fn item(id: &str, symbol: &str, intervals: &str) -> String {
        format!(
            "[[chord]]\nid = {id:?}\nname = \"X\"\nsymbol = {symbol:?}\nintervals = {intervals}\n"
        )
    }

    /// The chord's tones on `root` as note names, Unicode.
    fn tones(id: &str, root: &str, accidentals: Accidentals) -> String {
        let chord = ChordCatalog::builtin().get(id).expect(id);
        let root: NoteName = root.parse().unwrap();
        chord
            .notes(root, accidentals)
            .iter()
            .map(|note| note.name.to_string())
            .collect::<Vec<_>>()
            .join(" ")
    }

    fn pitch_classes(id: &str, root: u8) -> Vec<u8> {
        let chord = ChordCatalog::builtin().get(id).expect(id);
        chord
            .pitch_classes(PitchClass::new(root).unwrap())
            .into_iter()
            .map(PitchClass::value)
            .collect()
    }

    #[test]
    fn builtin_chords_are_valid() {
        let parsed = parse(BUILTIN_TOML, Source::BuiltIn);
        assert_eq!(parsed.errors, [], "built-in catalog errors");
        assert!(parsed.chords.len() >= 60, "{} chords", parsed.chords.len());
        let mut ids = HashMap::new();
        let mut names = HashMap::new();
        let mut symbols: HashMap<&str, &str> = HashMap::new();
        let mut formulas: HashMap<String, &str> = HashMap::new();
        for chord in &parsed.chords {
            assert_ne!(chord.family(), CUSTOM, "{} has no family", chord.id());
            assert_eq!(ids.insert(chord.id(), ()), None, "id {}", chord.id());
            let name = chord.name().to_lowercase();
            assert_eq!(names.insert(name, ()), None, "name {}", chord.name());
            // The parser matches suffixes exactly, so no suffix may mean two chords.
            for symbol in chord.symbols() {
                assert_eq!(
                    symbols.insert(symbol, chord.id()),
                    None,
                    "suffix {symbol:?} of {} is used twice",
                    chord.id()
                );
            }
            // No two chords are the same notes under two names.
            assert_eq!(
                formulas.insert(chord.formula().to_string(), chord.id()),
                None,
                "{} repeats another chord's intervals",
                chord.id()
            );
            assert!(
                chord.symbol().is_ascii(),
                "the symbol of {} is not ASCII",
                chord.id()
            );
        }
        // The major triad is the one chord without a suffix.
        let bare: Vec<&str> = parsed
            .chords
            .iter()
            .filter(|chord| chord.symbol().is_empty())
            .map(Chord::id)
            .collect();
        assert_eq!(bare, ["major"]);
        // Settings and user files refer to these ids.
        assert!(ChordCatalog::builtin().get("major").is_some());
    }

    #[test]
    fn builtin_families_cover_the_spec() {
        let catalog = ChordCatalog::builtin();
        let families: Vec<&str> = catalog.families().iter().map(|f| f.name).collect();
        assert_eq!(
            families,
            [
                "Triads",
                "Suspended",
                "Power chords",
                "Sixths",
                "Sevenths",
                "Ninths",
                "Elevenths",
                "Thirteenths",
                "Altered",
                "Added tone",
            ]
        );
        // SPEC §4.3: triads, sus, power, 6ths, 7ths, 9/11/13, altered, add chords.
        for id in [
            "major",
            "minor",
            "dim",
            "aug",
            "sus2",
            "sus4",
            "power",
            "maj6",
            "min6",
            "maj7",
            "dom7",
            "min7",
            "minmaj7",
            "min7b5",
            "dim7",
            "maj9",
            "dom9",
            "min9",
            "dom11",
            "dom13",
            "dom7flat5",
            "dom7sharp5",
            "dom7flat9",
            "dom7sharp9",
            "dom7alt",
            "add9",
            "add11",
        ] {
            assert!(catalog.get(id).is_some(), "{id}");
        }
        assert_eq!(catalog.get("nope"), None);
    }

    #[test]
    fn known_chords_give_the_expected_pitch_classes() {
        // C E G B
        assert_eq!(pitch_classes("maj7", 0), [0, 4, 7, 11]);
        // F# A C E
        assert_eq!(pitch_classes("min7b5", 6), [6, 9, 0, 4]);
        // G B D F A#
        assert_eq!(pitch_classes("dom7sharp9", 7), [7, 11, 2, 5, 10]);
        // D G A
        assert_eq!(pitch_classes("sus4", 2), [2, 7, 9]);
        // Power chord, minor, diminished seventh, 13th.
        assert_eq!(pitch_classes("power", 9), [9, 4]);
        assert_eq!(pitch_classes("minor", 9), [9, 0, 4]);
        assert_eq!(pitch_classes("dim7", 0), [0, 3, 6, 9]);
        assert_eq!(pitch_classes("dom13", 7), [7, 11, 2, 5, 9, 4]);
    }

    #[test]
    fn known_chords_spell_by_the_preference_with_the_root_kept() {
        let s = Accidentals::Sharps;
        let f = Accidentals::Flats;
        assert_eq!(tones("maj7", "C", s), "C E G B");
        assert_eq!(tones("min7b5", "F#", s), "F# A C E");
        assert_eq!(tones("min7b5", "F♯", f), "F# A C E");
        assert_eq!(tones("dom7sharp9", "G", s), "G B D F A#");
        assert_eq!(tones("dom7sharp9", "G", f), "G B D F Bb");
        assert_eq!(tones("sus4", "D", s), "D G A");
        // The root keeps the spelling the user gave; the other notes follow the preference.
        assert_eq!(tones("minor", "Db", s), "Db E G#");
        assert_eq!(tones("minor", "C#", f), "C# E Ab");
        assert_eq!(tones("dom7", "Bb", s), "Bb D F G#");
        assert_eq!(tones("dom7", "Bb", f), "Bb D F Ab");
    }

    #[test]
    fn notes_carry_their_interval_labels() {
        let chord = ChordCatalog::builtin().get("dom7sharp9").unwrap();
        let notes = chord.notes("G".parse().unwrap(), Accidentals::Sharps);
        let labels: Vec<String> = notes.iter().map(|n| n.interval.to_string()).collect();
        assert_eq!(labels, ["1", "3", "5", "b7", "#9"]);
        assert_eq!(notes[4].pitch_class().value(), 10);
        assert_eq!(chord.formula().to_string(), "1 3 5 b7 #9");
    }

    #[test]
    fn symbols_are_looked_up_exactly() {
        let catalog = ChordCatalog::builtin();
        for (suffix, id) in [
            ("", "major"),
            ("m", "minor"),
            ("-", "minor"),
            ("maj7", "maj7"),
            ("M7", "maj7"),
            ("Δ7", "maj7"),
            ("m7", "min7"),
            ("m7b5", "min7b5"),
            ("ø", "min7b5"),
            ("7", "dom7"),
            ("7#9", "dom7sharp9"),
            ("sus", "sus4"),
            ("5", "power"),
            ("6/9", "maj6-9"),
        ] {
            assert_eq!(catalog.find_by_symbol(suffix).map(Chord::id), Some(id));
        }
        // Case matters: M7 is major seventh, m7 minor seventh.
        assert_eq!(catalog.find_by_symbol("MAJ7"), None);
        assert_eq!(catalog.find_by_symbol("nope"), None);
        let dim7 = catalog.get("dim7").unwrap();
        assert_eq!(dim7.symbol(), "dim7");
        assert_eq!(dim7.jazz_symbol(), "°7");
        assert_eq!(catalog.get("dom7").unwrap().jazz_symbol(), "7");
        assert_eq!(
            catalog.get("min7b5").unwrap().symbols().next(),
            Some("m7b5")
        );
    }

    #[test]
    fn unknown_fields_fail() {
        assert_eq!(
            errors(&format!(
                "{}colour = \"red\"\n",
                item("mine", "x", r#"["1", "3"]"#)
            )),
            [
                "chord 1 (\"mine\"): unknown field `colour`, expected one of `id`, `name`, `symbol`, `aliases`, `jazz_symbol`, `family`, `intervals`"
            ]
        );
    }

    #[test]
    fn missing_fields_fail() {
        assert_eq!(
            errors("[[chord]]\nid = \"mine\"\nname = \"X\"\nintervals = [\"1\", \"3\"]\n"),
            ["chord 1 (\"mine\"): missing field `symbol`"]
        );
    }

    #[test]
    fn duplicate_ids_fail() {
        let parsed = parse_user_chords(&format!(
            "{}\n{}",
            item("mine", "x", r#"["1", "3"]"#),
            item("mine", "y", r#"["1", "b3"]"#)
        ));
        assert_eq!(ids(&parsed), ["mine"]);
        assert_eq!(parsed.chords[0].symbol(), "x");
        assert_eq!(
            parsed.errors[0].to_string(),
            "chord 2 (\"mine\"): duplicate id, already used by chord 1"
        );
    }

    #[test]
    fn broken_intervals_fail() {
        assert_eq!(
            errors(&item("x", "x", r#"["1", "3", "b3"]"#)),
            [
                "chord 1 (\"x\"): intervals must ascend: \"b3\" (3 semitones) comes after \"3\" (4 semitones)"
            ]
        );
        assert_eq!(
            errors(&item("x", "x", r#"["3", "5"]"#)),
            ["chord 1 (\"x\"): the formula must start at the root \"1\", not \"3\""]
        );
        assert_eq!(
            errors(&item("x", "x", r#"["1", "m3"]"#)).len(),
            1,
            "not a label"
        );
        assert_eq!(
            errors(&item("x", "x", "[]")),
            ["chord 1 (\"x\"): the formula has no intervals"]
        );
        // Only the root.
        assert_eq!(
            errors(&item("x", "x", r#"["1"]"#)),
            ["chord 1 (\"x\"): a chord needs at least one note besides the root"]
        );
        // A power chord is the smallest chord.
        assert!(errors(&item("x", "x", r#"["1", "5"]"#)).is_empty());
    }

    #[test]
    fn compound_intervals_are_chords_but_two_octaves_are_too_wide() {
        let parsed = parse_user_chords(&item(
            "x",
            "x",
            r##"["1", "3", "5", "b7", "b9", "#11", "13"]"##,
        ));
        assert_eq!(parsed.errors, []);
        assert_eq!(
            parsed.chords[0].formula().semitones().collect::<Vec<_>>(),
            [0, 4, 7, 10, 13, 18, 21]
        );
        assert!(
            errors(&item("x", "x", r#"["1", "3", "14"]"#)).is_empty(),
            "23 semitones"
        );
        assert_eq!(
            errors(&item("x", "x", r#"["1", "3", "15"]"#)),
            [
                "chord 1 (\"x\"): \"15\" is too wide (a chord's intervals stay below two octaves, up to 14)"
            ]
        );
    }

    #[test]
    fn two_intervals_on_one_pitch_class_fail() {
        assert_eq!(
            errors(&item("x", "x", r##"["1", "3", "b5", "#11"]"##)),
            ["chord 1 (\"x\"): \"b5\" and \"#11\" are the same note"]
        );
        assert_eq!(
            errors(&item("x", "x", r#"["1", "3", "5", "9", "10"]"#)).len(),
            1
        );
        assert_eq!(
            errors(&item("x", "x", r#"["1", "5", "8"]"#)).len(),
            1,
            "octave is the root"
        );
    }

    #[test]
    fn bad_ids_names_symbols_and_families_fail() {
        for id in ["", "My-Chord", "my_chord", "my--chord", "-x", "x-", "m7 b5"] {
            let found = errors(&item(id, "x", r#"["1", "3"]"#));
            assert_eq!(found.len(), 1, "{id:?}");
            assert!(found[0].contains("kebab-case"), "{found:?}");
        }
        assert_eq!(
            errors(
                "[[chord]]\nid = \"x\"\nname = \" \"\nsymbol = \"x\"\nintervals = [\"1\", \"3\"]\n"
            ),
            ["chord 1 (\"x\"): name must not be empty"]
        );
        for symbol in ["m 7", " m7", "m7 "] {
            assert_eq!(
                errors(&item("x", symbol, r#"["1", "3"]"#)),
                [format!(
                    "chord 1 (\"x\"): symbol {symbol:?} must not be blank or contain white space"
                )]
            );
        }
        let with = |extra: &str| errors(&format!("{}{extra}", item("x", "x", r#"["1", "3"]"#)));
        assert_eq!(with("aliases = [\"\"]\n").len(), 1, "blank alias");
        assert_eq!(with("aliases = [\"a b\"]\n").len(), 1);
        assert_eq!(with("jazz_symbol = \" \"\n").len(), 1);
        assert_eq!(
            with("family = \" \"\n"),
            ["chord 1 (\"x\"): family must not be empty"]
        );
        assert_eq!(
            with("aliases = [\"y\", \"x\"]\n"),
            ["chord 1 (\"x\"): symbol \"x\" is listed twice for one chord"]
        );
        assert_eq!(with("aliases = [\"y\", \"y\"]\n").len(), 1);
        assert!(with("aliases = [\"y\"]\njazz_symbol = \"x\"\nfamily = \"Mine\"\n").is_empty());
    }

    #[test]
    fn valid_items_load_next_to_broken_ones() {
        let parsed = parse_user_chords(
            r##"
            [[chord]]
            id = "good-one"
            name = "Good one"
            symbol = "g1"
            intervals = ["1", "♭3", "5", "9"]

            [[chord]]
            name = "No id"
            symbol = "n"
            intervals = ["1", "3"]

            [[chord]]
            id = "bad-order"
            name = "Bad order"
            symbol = "b"
            intervals = ["1", "5", "3"]

            [[chord]]
            id = "good-two"
            name = "Good two"
            symbol = "g2"
            aliases = ["second"]
            jazz_symbol = "g²"
            family = "Mine"
            intervals = ["1", "#4", "5"]
            "##,
        );
        assert_eq!(ids(&parsed), ["good-one", "good-two"]);
        let good_one = &parsed.chords[0];
        assert_eq!(good_one.family(), CUSTOM);
        assert_eq!(good_one.source(), Source::User);
        assert_eq!(good_one.formula().to_string(), "1 b3 5 9");
        let good_two = &parsed.chords[1];
        assert_eq!(good_two.aliases(), ["second"]);
        assert_eq!(good_two.jazz_symbol(), "g²");
        assert_eq!(good_two.family(), "Mine");
        let items: Vec<_> = parsed
            .errors
            .iter()
            .map(|e| (e.item, e.id.clone()))
            .collect();
        assert_eq!(
            items,
            [(Some(1), None), (Some(2), Some("bad-order".into()))]
        );
        assert_eq!(parsed.errors[0].to_string(), "chord 2: missing field `id`");
    }

    #[test]
    fn whole_file_errors() {
        assert_eq!(parse_user_chords(""), ParsedChords::default());
        let broken = errors("[[chord]]\nid = \"x\"\nname = \n");
        assert_eq!(broken.len(), 1);
        assert!(
            broken[0].starts_with("not valid TOML (line 3): "),
            "{broken:?}"
        );
        assert_eq!(
            errors("chord = 3\n"),
            ["\"chord\" must be a list of [[chord]] tables"]
        );
        assert_eq!(errors("chord = [3]\n").len(), 1);
        // A scale file is not a chord file.
        assert_eq!(
            errors("[[scale]]\nid = \"x\"\n"),
            ["unknown key \"scale\" (a chord file holds only [[chord]] tables)"]
        );
        let parsed =
            parse_user_chords(&format!("version = 1\n{}", item("x", "x", r#"["1", "3"]"#)));
        assert_eq!(ids(&parsed), ["x"]);
        assert_eq!(
            parsed.errors[0].to_string(),
            "unknown key \"version\" (a chord file holds only [[chord]] tables)"
        );
    }

    #[test]
    fn user_chords_merge_over_the_builtins() {
        let builtin = ChordCatalog::builtin();
        let parsed = parse_user_chords(
            r#"
            [[chord]]
            id = "maj7"
            name = "My major seventh"
            symbol = "maj7"
            family = "Sevenths"
            intervals = ["1", "3", "7"]

            [[chord]]
            id = "mine"
            name = "Mine"
            symbol = "m7"
            intervals = ["1", "b2", "5"]
            "#,
        );
        assert_eq!(parsed.errors, []);
        let merged = builtin.with_user_chords(parsed.chords);
        assert_eq!(merged.chords().len(), builtin.chords().len() + 1);
        let maj7 = merged.get("maj7").unwrap();
        assert_eq!(maj7.name(), "My major seventh");
        assert_eq!(maj7.source(), Source::User);
        let position = |catalog: &ChordCatalog| {
            catalog
                .chords()
                .iter()
                .position(|chord| chord.id() == "maj7")
        };
        assert_eq!(position(&merged), position(builtin), "replaced in place");
        assert_eq!(merged.chords().last().unwrap().id(), "mine");
        let families = merged.families();
        let custom = families.last().unwrap();
        assert_eq!(custom.name, CUSTOM);
        assert_eq!(custom.chords.len(), 1);
        // The last chord with a suffix wins: the user's "m7" takes it from the minor seventh.
        assert_eq!(merged.find_by_symbol("m7").map(Chord::id), Some("mine"));
        assert_eq!(builtin.find_by_symbol("m7").map(Chord::id), Some("min7"));
        // The built-in catalog itself is untouched.
        assert_eq!(builtin.get("maj7").unwrap().name(), "Major seventh");
        assert_eq!(builtin.get("maj7").unwrap().source(), Source::BuiltIn);
    }

    #[test]
    fn a_new_chord_is_checked_like_a_file_item() {
        let spec = |id: &str| ChordSpec {
            id: id.to_owned(),
            name: "X".to_owned(),
            symbol: "x".to_owned(),
            aliases: Vec::new(),
            jazz_symbol: None,
            family: None,
            intervals: vec!["1".to_owned(), "3".to_owned()],
        };
        assert_eq!(
            Chord::new(spec("My chord")),
            Err(crate::chords::ChordError::Id("My chord".into()))
        );
        let chord = Chord::new(spec("mine")).unwrap();
        assert_eq!(chord.source(), Source::User);
        assert_eq!(chord.family(), CUSTOM);
    }

    fn user(id: &str, name: &str, symbol: &str, intervals: &[&str]) -> Chord {
        user_with(id, name, symbol, None, intervals)
    }

    fn user_with(
        id: &str,
        name: &str,
        symbol: &str,
        jazz_symbol: Option<&str>,
        intervals: &[&str],
    ) -> Chord {
        Chord::new(ChordSpec {
            id: id.to_owned(),
            name: name.to_owned(),
            symbol: symbol.to_owned(),
            aliases: Vec::new(),
            jazz_symbol: jazz_symbol.map(str::to_owned),
            family: None,
            intervals: intervals.iter().map(|&s| s.to_owned()).collect(),
        })
        .unwrap()
    }

    #[test]
    fn a_jazz_symbol_equal_to_the_symbol_is_none() {
        let chord = user_with("x", "X", "x", Some("x"), &["1", "3"]);
        assert_eq!(chord, user("x", "X", "x", &["1", "3"]));
        assert_eq!(chord.jazz_symbol(), "x");
    }

    #[test]
    fn written_chords_read_back_unchanged() {
        let chords = vec![
            Chord::new(ChordSpec {
                id: "my-lydian".into(),
                name: "My \"Lydian\", ♯11\\b5".into(),
                symbol: "maj7#11no5".into(),
                aliases: vec!["Δ#11no5".into(), "M7#11no5".into()],
                jazz_symbol: Some("Δ7#11no5".into()),
                family: Some("Mine".into()),
                intervals: ["1", "3", "7", "9", "#11", "13"].map(str::to_owned).into(),
            })
            .unwrap(),
            user("two-notes", "Two notes", "tt", &["1", "b5"]),
            // A user chord that replaces a built-in keeps its name and suffixes.
            Chord::new(ChordSpec {
                id: "maj7".into(),
                name: "Major seventh".into(),
                symbol: "maj7".into(),
                aliases: vec!["M7".into()],
                jazz_symbol: Some("Δ7".into()),
                family: Some("Sevenths".into()),
                intervals: ["1", "3", "5", "7", "9"].map(str::to_owned).into(),
            })
            .unwrap(),
        ];
        let text = write_chords(&chords).unwrap();
        assert!(text.starts_with("# Your chords"), "{text}");
        assert!(
            text.contains(r##"intervals = ["1", "3", "7", "9", "#11", "13"]"##),
            "{text}"
        );
        assert!(text.contains("family = \"Custom\""), "{text}");
        assert_eq!(text.matches("jazz_symbol").count(), 2, "{text}");
        assert_eq!(text.matches("aliases").count(), 2, "{text}");
        let parsed = parse_user_chords(&text);
        assert_eq!(parsed.errors, []);
        assert_eq!(parsed.chords, chords);
        assert_eq!(write_chords(&parsed.chords).unwrap(), text);
    }

    #[test]
    fn writing_no_chords_gives_an_empty_chord_file() {
        let text = write_chords(&[]).unwrap();
        assert_eq!(parse_user_chords(&text), ParsedChords::default());
    }

    #[test]
    fn writing_two_chords_with_one_id_fails() {
        let a = user("a", "A", "aa", &["1", "3"]);
        let b = user("a", "B", "bb", &["1", "b3"]);
        assert_eq!(
            write_chords(&[a, b]),
            Err(ChordError::DuplicateId("a".into()))
        );
    }

    #[test]
    fn a_duplicate_name_is_the_same_display_name() {
        let error = write_chords(&[user("x", "  major SEVENTH ", "x", &["1", "3"])]).unwrap_err();
        assert_eq!(error, ChordError::DuplicateName("  major SEVENTH ".into()));
        assert_eq!(
            error.to_string(),
            "there is already a chord called \"  major SEVENTH \""
        );
        assert_eq!(
            write_chords(&[
                user("a", "Mine", "q1", &["1", "3"]),
                user("b", "MINE", "q2", &["1", "b3"])
            ]),
            Err(ChordError::DuplicateName("MINE".into()))
        );
        // Replacing a built-in by id frees its name and its suffixes.
        assert!(
            write_chords(&[
                user("maj7", "Not major seventh", "q1", &["1", "3"]),
                user("mine", "Major seventh", "maj7", &["1", "3", "5", "7"]),
            ])
            .is_ok()
        );
    }

    #[test]
    fn a_suffix_may_mean_one_chord_only() {
        // A built-in chord's symbol, alias or Jazz symbol.
        for (symbol, owner) in [
            ("m7", "Minor seventh"),
            ("-7", "Minor seventh"),
            ("ø", "Half-diminished seventh"),
        ] {
            let error = write_chords(&[user("x", "X", symbol, &["1", "3"])]).unwrap_err();
            assert_eq!(
                error,
                ChordError::SymbolTaken {
                    symbol: symbol.into(),
                    chord: owner.into()
                }
            );
        }
        assert_eq!(
            write_chords(&[user("x", "X", "m7", &["1", "3"])])
                .unwrap_err()
                .to_string(),
            "the symbol \"m7\" already means the chord \"Minor seventh\""
        );
        // The Jazz symbol counts too, and so does another user chord.
        assert_eq!(
            write_chords(&[user_with("x", "X", "x", Some("°7"), &["1", "3"])]),
            Err(ChordError::SymbolTaken {
                symbol: "°7".into(),
                chord: "Diminished seventh".into()
            })
        );
        assert_eq!(
            write_chords(&[
                user("a", "A", "q", &["1", "3"]),
                user_with("b", "B", "r", Some("q"), &["1", "b3"])
            ]),
            Err(ChordError::SymbolTaken {
                symbol: "q".into(),
                chord: "A".into()
            })
        );
        // Only the major triad goes without a symbol.
        let error = write_chords(&[user("x", "X", "", &["1", "3"])]).unwrap_err();
        assert_eq!(error, ChordError::NoSymbol);
        assert!(error.to_string().starts_with("a chord needs a symbol"));
        // Case matters, as in the parser.
        assert!(write_chords(&[user("x", "X", "M7b9", &["1", "3"])]).is_ok());
    }

    #[test]
    fn a_suffix_must_read_back_after_a_root() {
        for symbol in [
            "b9", "#11", "blues", "♭9", "m7♭5x", "△9", "Ø7", "º7", "♯x", "−7x",
        ] {
            assert_eq!(
                write_chords(&[user("x", "X", symbol, &["1", "3"])]),
                Err(ChordError::UnreadableSymbol(symbol.into())),
                "{symbol:?}"
            );
        }
        assert_eq!(
            write_chords(&[user_with("x", "X", "x", Some("b9"), &["1", "3"])]),
            Err(ChordError::UnreadableSymbol("b9".into()))
        );
        let message = ChordError::UnreadableSymbol("b9".into()).to_string();
        assert!(message.contains("\"Cb9\""), "{message}");
        // Symbols the parser keeps as typed are fine: signs before a digit, slashes, other
        // letters and signs, a Jazz symbol beside the symbol.
        for symbol in [
            "q7b9b13", "qadd2/4", "q(maj9)", "x7#11", "Δq", "ø9x", "°x", "qsus24",
        ] {
            assert!(
                write_chords(&[user("x", "X", symbol, &["1", "3"])]).is_ok(),
                "{symbol:?}"
            );
        }
        assert!(write_chords(&[user_with("x", "X", "q7#9", Some("q7♯9x"), &["1", "3"])]).is_err());
        assert!(write_chords(&[user_with("x", "X", "q7#9", Some("Q7#9"), &["1", "3"])]).is_ok());
    }

    #[test]
    fn saved_user_chords_are_typeable_and_formatted_in_both_styles() {
        let mine = user_with("mine", "Mine", "q7#9", Some("Q#9"), &["1", "3", "b7", "#9"]);
        let plain = user("plain", "Plain", "qq", &["1", "4", "b7"]);
        let text = write_chords(&[mine, plain]).unwrap();
        let catalog = ChordCatalog::builtin().with_user_chords(parse_user_chords(&text).chords);
        let root: NoteName = "Bb".parse().unwrap();
        let mine = catalog.get("mine").unwrap();
        assert_eq!(
            format_symbol(root, mine, None, SymbolStyle::Standard),
            "B♭q7♯9"
        );
        assert_eq!(format_symbol(root, mine, None, SymbolStyle::Jazz), "B♭Q♯9");
        // Without a Jazz symbol both styles use the symbol.
        let plain = catalog.get("plain").unwrap();
        assert_eq!(format_symbol(root, plain, None, SymbolStyle::Jazz), "B♭qq");
        for text in ["Bbq7#9", "B♭Q♯9", "bbq7(#9)", "Bbqq/D"] {
            let found = catalog.parse_symbol(text).unwrap();
            assert_eq!(found.root, root, "{text}");
            assert!(
                ["mine", "plain"].contains(&found.chord_id.as_str()),
                "{text}"
            );
        }
    }

    #[test]
    fn new_chord_ids_are_slugs_that_no_chord_has() {
        let builtin = ChordCatalog::builtin();
        assert_eq!(builtin.new_id("My 7♯9"), "my-7-9");
        assert_eq!(builtin.new_id("♯♭"), "custom");
        assert_eq!(builtin.new_id(&"x".repeat(100)).len(), 64);
        // Built-in ids are never handed out, even when a user chord replaced one.
        assert_eq!(builtin.new_id("maj7"), "maj7-2");
        let replaced = builtin.with_user_chords([user("maj7", "Mine", "q", &["1", "3"])]);
        assert_eq!(replaced.new_id("Maj7"), "maj7-2");
        let catalog = builtin.with_user_chords([
            user("mine", "Mine", "q1", &["1", "3"]),
            user("mine-2", "Mine 2", "q2", &["1", "3"]),
        ]);
        assert_eq!(catalog.new_id("Mine"), "mine-3");
    }

    #[test]
    fn the_editor_offers_the_labels_the_chords_use() {
        let labels: Vec<String> = chord_interval_labels()
            .iter()
            .map(|label| label.map_or("-".to_owned(), |l| l.to_string()))
            .collect();
        assert_eq!(
            labels.join(" "),
            "1 b2 2 b3 3 4 b5 5 #5 6 b7 7 - b9 9 #9 - 11 #11 - b13 13 - -"
        );
        for (semitones, label) in chord_interval_labels().iter().enumerate() {
            if let Some(label) = label {
                assert_eq!(usize::from(label.semitones()), semitones);
            }
        }
    }
}
