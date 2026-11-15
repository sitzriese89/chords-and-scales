//! Chord symbols: parsing what a user types and formatting what is shown (SPEC §4.4, ADR-29).
//!
//! A symbol is a root, a suffix and an optional bass: `Cmaj7`, `F♯m7♭5`, `C/E`. Nothing about
//! chord names is written in this file: the suffixes a chord answers to are the `symbol`,
//! `aliases` and `jazz_symbol` of its catalog entry (ADR-27), so a user chord with a symbol is
//! typeable without changes here. The parser only normalises what was typed before asking the
//! catalog (flat and sharp signs, other dashes and triangles, spaces and parentheses) and tries
//! a few fallbacks (order of trailing alterations, letter case) that never guess between two
//! chords.

use std::fmt;

use super::{Chord, ChordCatalog};
use crate::notes::{Glyphs, NoteName};

/// How chord symbols are displayed (SPEC §4.4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum SymbolStyle {
    /// `Cmaj7`, `Cm7♭5`, `Cdim7`: the chord's `symbol`.
    #[default]
    Standard,
    /// `CΔ7`, `Cø`, `C°7`: the chord's `jazz_symbol`, or its `symbol` where there is none.
    Jazz,
}

/// A parsed chord symbol: what the user typed, as data.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChordSymbol {
    /// The root, spelled as typed (`D♭` stays `D♭`, ADR-6).
    pub root: NoteName,
    /// The id of the catalog chord.
    pub chord_id: String,
    /// The bass of a slash chord, spelled as typed.
    pub bass: Option<NoteName>,
}

/// Why a chord symbol could not be read, and where.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SymbolError {
    position: usize,
    kind: SymbolErrorKind,
}

/// What is wrong with a chord symbol.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum SymbolErrorKind {
    /// Nothing but white space.
    Empty,
    /// The text does not start with a note name (A-G).
    Root,
    /// The suffix after the root (as typed) is not a chord of the catalog.
    Chord(String),
    /// The part after the slash (as typed) is not a note name.
    Bass(String),
}

impl SymbolError {
    /// The 0-based index, in characters, of the first character of the input that could not be
    /// read: the first non-blank one for an empty or rootless text, the first character no
    /// known suffix continues with, or the start of the bass after the slash.
    pub fn position(&self) -> usize {
        self.position
    }

    pub fn kind(&self) -> &SymbolErrorKind {
        &self.kind
    }

    /// The message without the position.
    pub fn message(&self) -> String {
        match &self.kind {
            SymbolErrorKind::Empty => "enter a chord such as Cmaj7, F#m7b5 or G7/B".to_owned(),
            SymbolErrorKind::Root => {
                "a chord starts with a note name (A-G, with # or b), e.g. Cmaj7".to_owned()
            }
            SymbolErrorKind::Chord(suffix) => format!("{suffix:?} is not a known chord"),
            SymbolErrorKind::Bass(bass) => {
                format!("{bass:?} after the slash is not a note name (e.g. C/E)")
            }
        }
    }
}

impl fmt::Display for SymbolError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} (at position {})", self.message(), self.position)
    }
}

impl std::error::Error for SymbolError {}

impl ChordCatalog {
    /// Reads a chord symbol such as `Cmaj7`, `bbm7b5`, `F#°7` or `Am6/9/E` against this
    /// catalog. See [`parse_symbol`].
    pub fn parse_symbol(&self, text: &str) -> Result<ChordSymbol, SymbolError> {
        parse_symbol(self, text)
    }
}

/// Reads a chord symbol: a root (letter A-G in either case, up to two sharps or flats), a
/// suffix the catalog knows, and an optional `/bass`.
///
/// - The suffix is looked up as a `symbol`, alias or `jazz_symbol` of a chord, after flat and
///   sharp signs (`♭ ♯`), minus signs and dashes, triangles (`△ ∆`), `Ø`/`∅` and degree-like
///   signs are replaced by the characters the catalog uses. White space, parentheses and commas
///   are ignored if the suffix is not found as typed (`C7(b9)`, `Cm(add9)`).
/// - Trailing alterations may come in any order (`C7#9b5` for `7b5#9`) and letter case is
///   ignored if only one chord fits (`CMAJ7`), but an exact match always wins (`CM7` and `Cm7`
///   differ).
/// - A slash starts a bass note unless the whole suffix is a symbol: `6/9` and `m6/9` are
///   chords, `C6/9/E` is `C6/9` over `E`.
///
/// Errors carry the position of the first character that can't be read (see
/// [`SymbolError::position`]).
pub fn parse_symbol(catalog: &ChordCatalog, text: &str) -> Result<ChordSymbol, SymbolError> {
    let chars: Vec<char> = text.chars().collect();
    let Some(start) = chars.iter().position(|c| !c.is_whitespace()) else {
        return Err(SymbolError {
            position: 0,
            kind: SymbolErrorKind::Empty,
        });
    };
    let end = chars
        .iter()
        .rposition(|c| !c.is_whitespace())
        .map_or(start, |last| last + 1);
    let Some((root, root_len)) = parse_root(&chars[start..end]) else {
        return Err(SymbolError {
            position: start,
            kind: SymbolErrorKind::Root,
        });
    };
    let rest_start = start + root_len;
    let rest: Vec<char> = chars[rest_start..end]
        .iter()
        .map(|&c| normalize_char(c))
        .collect();
    let found = |chord: &Chord, bass| ChordSymbol {
        root,
        chord_id: chord.id().to_owned(),
        bass,
    };

    // The whole suffix first: `6/9` is a chord, not a `6` over a `9`.
    if let Some(chord) = lookup(catalog, &rest.iter().collect::<String>()) {
        return Ok(found(chord, None));
    }
    let leading = rest.iter().take_while(|c| c.is_whitespace()).count();
    let known = known_prefix_len(catalog, &rest[leading..]);
    if let Some(slash) = rest.iter().rposition(|&c| c == '/')
        && let Some(chord) = lookup(catalog, &rest[..slash].iter().collect::<String>())
    {
        let tail: String = chars[rest_start + slash + 1..end].iter().collect();
        if let Ok(bass) = tail.trim().parse::<NoteName>() {
            return Ok(found(chord, Some(bass)));
        }
        // `6/9x`: if the text still follows a known suffix past the slash, that is the error.
        if leading + known <= slash {
            let skipped = tail.chars().take_while(|c| c.is_whitespace()).count();
            return Err(SymbolError {
                position: rest_start + slash + 1 + skipped,
                kind: SymbolErrorKind::Bass(tail.trim().to_owned()),
            });
        }
    }
    let suffix: String = chars[rest_start..end].iter().collect();
    Err(SymbolError {
        position: rest_start + leading + known,
        kind: SymbolErrorKind::Chord(suffix.trim().to_owned()),
    })
}

/// The text of a chord symbol: the root as given, the chord's suffix for `style` with `b` and
/// `#` before a number shown as `♭` and `♯`, and `/bass` if there is one.
///
/// `root` keeps its spelling (ADR-6). `bass` is printed as given: the caller spells it, by the
/// sharp/flat preference for a computed bass or as typed for a parsed one.
///
/// ```
/// use theory::{ChordCatalog, NoteName, SymbolStyle, format_symbol};
/// let catalog = ChordCatalog::builtin();
/// let root: NoteName = "Bb".parse().unwrap();
/// let chord = catalog.get("min7b5").unwrap();
/// assert_eq!(format_symbol(root, chord, None, SymbolStyle::Standard), "B♭m7♭5");
/// assert_eq!(format_symbol(root, chord, None, SymbolStyle::Jazz), "B♭ø");
/// ```
pub fn format_symbol(
    root: NoteName,
    chord: &Chord,
    bass: Option<NoteName>,
    style: SymbolStyle,
) -> String {
    let suffix = match style {
        SymbolStyle::Standard => chord.symbol(),
        SymbolStyle::Jazz => chord.jazz_symbol(),
    };
    let mut text = root.format(Glyphs::Unicode);
    push_display_suffix(&mut text, suffix);
    if let Some(bass) = bass {
        text.push('/');
        text.push_str(&bass.format(Glyphs::Unicode));
    }
    text
}

/// Appends `suffix` with the `b`/`#` that sit before a digit written as `♭`/`♯`.
fn push_display_suffix(text: &mut String, suffix: &str) {
    let mut chars = suffix.chars().peekable();
    while let Some(c) = chars.next() {
        let before_digit = chars.peek().is_some_and(char::is_ascii_digit);
        text.push(match c {
            'b' if before_digit => '♭',
            '#' if before_digit => '♯',
            other => other,
        });
    }
}

/// The root at the start of `chars`: a letter and up to two accidental signs. Returns the
/// note and how many characters it took.
fn parse_root(chars: &[char]) -> Option<(NoteName, usize)> {
    let first = *chars.first()?;
    if !matches!(first.to_ascii_uppercase(), 'A'..='G') {
        return None;
    }
    let signs = chars[1..]
        .iter()
        .take(2)
        .take_while(|&&c| matches!(c, '#' | 'b' | '♯' | '♭' | '𝄪' | '𝄫'))
        .count();
    (0..=signs).rev().find_map(|n| {
        let text: String = chars[..=n].iter().collect();
        text.parse().ok().map(|note| (note, n + 1))
    })
}

/// Maps look-alikes to the characters the catalog uses. One character in, one out, so
/// positions stay valid.
fn normalize_char(c: char) -> char {
    match c {
        '♭' => 'b',
        '♯' => '#',
        '\u{2212}' | '\u{2013}' | '\u{2014}' => '-',
        '△' | '∆' => 'Δ',
        'Ø' | '∅' => 'ø',
        'º' | '˚' => '°',
        other => other,
    }
}

/// The chord whose suffix is `suffix` (already normalised): as typed, then without white
/// space, parentheses and commas, then with trailing alterations reordered, then ignoring
/// case if exactly one chord fits.
fn lookup<'a>(catalog: &'a ChordCatalog, suffix: &str) -> Option<&'a Chord> {
    let stripped: String = suffix
        .chars()
        .filter(|c| !c.is_whitespace() && !matches!(c, '(' | ')' | ','))
        .collect();
    catalog
        .find_by_symbol(suffix)
        .or_else(|| catalog.find_by_symbol(&stripped))
        .or_else(|| lookup_reordered(catalog, &stripped))
        .or_else(|| lookup_ignoring_case(catalog, &stripped))
}

/// Alterations are a set (`7#9b5` is `7b5#9`): tries the other orders of two to four trailing
/// `b`/`#` + number groups.
fn lookup_reordered<'a>(catalog: &'a ChordCatalog, suffix: &str) -> Option<&'a Chord> {
    let (head, tail) = split_alterations(suffix);
    if !(2..=4).contains(&tail.len()) {
        return None;
    }
    let mut order: Vec<usize> = (0..tail.len()).collect();
    let mut found = None;
    permute(&mut order, 0, &mut |order| {
        if found.is_none() {
            let text: String = std::iter::once(head)
                .chain(order.iter().map(|&i| tail[i]))
                .collect();
            found = catalog.find_by_symbol(&text);
        }
    });
    found
}

/// Splits trailing `[b#]<digits>` groups off: `7#9b5` into `7` and `[#9, b5]`.
fn split_alterations(suffix: &str) -> (&str, Vec<&str>) {
    let bytes = suffix.as_bytes();
    let mut tail = Vec::new();
    let mut end = bytes.len();
    loop {
        let digits = bytes[..end]
            .iter()
            .rev()
            .take_while(|b| b.is_ascii_digit())
            .count();
        if digits == 0 || digits == end || !matches!(bytes[end - digits - 1], b'b' | b'#') {
            break;
        }
        end -= digits + 1;
        tail.push(&suffix[end..end + digits + 1]);
    }
    tail.reverse();
    (&suffix[..end], tail)
}

fn permute(items: &mut [usize], from: usize, visit: &mut impl FnMut(&[usize])) {
    if from == items.len() {
        visit(items);
        return;
    }
    for i in from..items.len() {
        items.swap(from, i);
        permute(items, from + 1, visit);
        items.swap(from, i);
    }
}

fn lookup_ignoring_case<'a>(catalog: &'a ChordCatalog, suffix: &str) -> Option<&'a Chord> {
    let lower = suffix.to_lowercase();
    let mut matches = catalog.chords().iter().filter(|chord| {
        chord
            .suffixes()
            .any(|symbol| symbol.to_lowercase() == lower)
    });
    let first = matches.next()?;
    matches.next().is_none().then_some(first)
}

/// How many characters at the start of `rest` begin some known suffix.
fn known_prefix_len(catalog: &ChordCatalog, rest: &[char]) -> usize {
    catalog
        .chords()
        .iter()
        .flat_map(Chord::suffixes)
        .map(|symbol| {
            symbol
                .chars()
                .zip(rest)
                .take_while(|(a, b)| a == *b)
                .count()
        })
        .max()
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chords::parse_user_chords;

    const ROOTS: [&str; 17] = [
        "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb",
        "B",
    ];

    fn note(name: &str) -> NoteName {
        name.parse().unwrap()
    }

    fn parse(text: &str) -> Result<ChordSymbol, SymbolError> {
        ChordCatalog::builtin().parse_symbol(text)
    }

    /// The root, chord id and bass of `text` as one string, for tables.
    fn read(text: &str) -> String {
        match parse(text) {
            Ok(symbol) => match symbol.bass {
                Some(bass) => format!("{} {} /{bass}", symbol.root, symbol.chord_id),
                None => format!("{} {}", symbol.root, symbol.chord_id),
            },
            Err(error) => panic!("{text:?}: {error}"),
        }
    }

    fn formatted(root: &str, id: &str, bass: Option<&str>, style: SymbolStyle) -> String {
        let chord = ChordCatalog::builtin().get(id).unwrap();
        format_symbol(note(root), chord, bass.map(note), style)
    }

    #[test]
    fn every_chord_on_every_root_round_trips_in_both_styles() {
        let catalog = ChordCatalog::builtin();
        for chord in catalog.chords() {
            for root in ROOTS {
                for style in [SymbolStyle::Standard, SymbolStyle::Jazz] {
                    for bass in [None, Some("E"), Some("Bb"), Some("F#")] {
                        let text = format_symbol(note(root), chord, bass.map(note), style);
                        let parsed = catalog
                            .parse_symbol(&text)
                            .unwrap_or_else(|error| panic!("{text:?}: {error}"));
                        assert_eq!(parsed.root, note(root), "{text}");
                        assert_eq!(parsed.chord_id, chord.id(), "{text}");
                        assert_eq!(parsed.bass, bass.map(note), "{text}");
                    }
                }
            }
        }
    }

    #[test]
    fn every_stored_suffix_parses_to_its_chord() {
        let catalog = ChordCatalog::builtin();
        for chord in catalog.chords() {
            for suffix in chord.suffixes() {
                let parsed = parse(&format!("G{suffix}")).unwrap_or_else(|error| {
                    panic!("G{suffix} ({}): {error}", chord.id());
                });
                assert_eq!(parsed.chord_id, chord.id(), "G{suffix}");
                assert_eq!(parsed.root, note("G"));
            }
        }
    }

    #[test]
    fn formats_both_styles() {
        use SymbolStyle::{Jazz, Standard};
        for (root, id, bass, style, text) in [
            ("C", "major", None, Standard, "C"),
            ("C", "maj7", None, Standard, "Cmaj7"),
            ("C", "maj7", None, Jazz, "CΔ7"),
            ("C", "min7b5", None, Standard, "Cm7♭5"),
            ("C", "min7b5", None, Jazz, "Cø"),
            ("C", "dim7", None, Standard, "Cdim7"),
            ("C", "dim7", None, Jazz, "C°7"),
            ("C", "dim", None, Jazz, "C°"),
            ("C", "aug", None, Jazz, "C+"),
            ("C", "minmaj7", None, Jazz, "CmΔ7"),
            ("C", "dom7sharp9", None, Standard, "C7♯9"),
            ("C", "dom7sharp9", None, Jazz, "C7♯9"),
            ("C", "dom13flat9", None, Standard, "C13♭9"),
            ("C", "maj6-9", None, Standard, "C6/9"),
            ("Db", "min7", None, Standard, "D♭m7"),
            ("F#", "dom7", None, Standard, "F♯7"),
            ("Eb", "min7b5", Some("Bb"), Standard, "E♭m7♭5/B♭"),
            ("C", "major", Some("E"), Jazz, "C/E"),
            ("C", "maj6-9", Some("E"), Standard, "C6/9/E"),
        ] {
            assert_eq!(formatted(root, id, bass, style), text, "{root} {id}");
        }
    }

    #[test]
    fn the_root_keeps_its_typed_spelling() {
        assert_eq!(read("Dbmaj7"), "Db maj7");
        assert_eq!(read("C#maj7"), "C# maj7");
        assert_eq!(formatted("Db", "major", None, SymbolStyle::Standard), "D♭");
        assert_eq!(formatted("C#", "major", None, SymbolStyle::Standard), "C♯");
    }

    #[test]
    fn real_world_spellings() {
        for (text, expected) in [
            // Major, minor, the usual aliases.
            ("C", "C major"),
            ("Cmaj", "C major"),
            ("CM", "C major"),
            ("Cm", "C minor"),
            ("Cmin", "C minor"),
            ("Cmi", "C minor"),
            ("C-", "C minor"),
            ("C−", "C minor"),
            ("c", "C major"),
            ("am7", "A min7"),
            ("bbm7", "Bb min7"),
            ("  Dm7  ", "D min7"),
            // Sevenths.
            ("Cmaj7", "C maj7"),
            ("CM7", "C maj7"),
            ("CΔ7", "C maj7"),
            ("CΔ", "C maj7"),
            ("C△7", "C maj7"),
            ("C∆7", "C maj7"),
            ("CMaj7", "C maj7"),
            ("CMAJ7", "C maj7"),
            ("Cma7", "C maj7"),
            ("C7", "C dom7"),
            ("Cm7", "C min7"),
            ("Cmin7", "C min7"),
            ("C-7", "C min7"),
            ("CmM7", "C minmaj7"),
            ("Cm(maj7)", "C minmaj7"),
            ("C-Δ7", "C minmaj7"),
            // Half-diminished and diminished.
            ("Cø", "C min7b5"),
            ("CØ", "C min7b5"),
            ("Cø7", "C min7b5"),
            ("Cm7b5", "C min7b5"),
            ("Cm7♭5", "C min7b5"),
            ("Cm7(b5)", "C min7b5"),
            ("C-7b5", "C min7b5"),
            ("C°", "C dim"),
            ("Cº", "C dim"),
            ("Cdim", "C dim"),
            ("Co", "C dim"),
            ("C°7", "C dim7"),
            ("Cdim7", "C dim7"),
            ("Co7", "C dim7"),
            // Augmented, suspended.
            ("Caug", "C aug"),
            ("C+", "C aug"),
            ("C7+", "C dom7sharp5"),
            ("C+7", "C dom7sharp5"),
            ("Caug7", "C dom7sharp5"),
            ("C7#5", "C dom7sharp5"),
            ("Csus", "C sus4"),
            ("Csus4", "C sus4"),
            ("Csus2", "C sus2"),
            ("C7sus", "C dom7sus4"),
            ("C7sus4", "C dom7sus4"),
            ("C9sus4", "C dom9sus4"),
            // Added tones, sixths, power chords.
            ("Cadd9", "C add9"),
            ("C(add9)", "C add9"),
            ("Cadd 9", "C add9"),
            ("Cmadd9", "C minadd9"),
            ("Cm(add9)", "C minadd9"),
            ("C6", "C maj6"),
            ("Cm6", "C min6"),
            ("C5", "C power"),
            // Extensions.
            ("C9", "C dom9"),
            ("Cmaj9", "C maj9"),
            ("Cm9", "C min9"),
            ("C11", "C dom11"),
            ("Cm11", "C min11"),
            ("C13", "C dom13"),
            ("Cmaj13", "C maj13"),
            // Alterations, in any notation and order.
            ("C7b9", "C dom7flat9"),
            ("C7♭9", "C dom7flat9"),
            ("C7(b9)", "C dom7flat9"),
            ("C7 b9", "C dom7flat9"),
            ("C7#9", "C dom7sharp9"),
            ("C7♯9", "C dom7sharp9"),
            ("C7(#9)", "C dom7sharp9"),
            ("C7b5", "C dom7flat5"),
            ("C7alt", "C dom7alt"),
            ("Calt", "C dom7alt"),
            ("C7#11", "C dom7sharp11"),
            ("C7b13", "C dom7flat13"),
            ("C7b9b5", "C dom7flat5flat9"),
            ("C7b5b9", "C dom7flat5flat9"),
            ("C7#9#5", "C dom7sharp5sharp9"),
            ("C7(#5,#9)", "C dom7sharp5sharp9"),
            ("C7#5#9", "C dom7sharp5sharp9"),
            ("C9#11", "C dom9sharp11"),
            ("C13b9", "C dom13flat9"),
            ("Cmaj7#11", "C maj7sharp11"),
            ("Cmaj7(#11)", "C maj7sharp11"),
            // Roots with accidentals.
            ("C#m7", "C# min7"),
            ("C♯m7", "C# min7"),
            ("Dbmaj7", "Db maj7"),
            ("D♭maj7", "Db maj7"),
            ("Ebm7b5", "Eb min7b5"),
            ("F#ø", "F# min7b5"),
            ("Bb7", "Bb dom7"),
            ("B7", "B dom7"),
        ] {
            assert_eq!(read(text), expected, "{text:?}");
        }
    }

    #[test]
    fn slash_chords_split_but_never_the_sixth_nine() {
        for (text, expected) in [
            ("C/E", "C major /E"),
            ("C/Eb", "C major /Eb"),
            ("C/E♭", "C major /Eb"),
            ("c/e", "C major /E"),
            ("Am/G", "A minor /G"),
            ("G7/B", "G dom7 /B"),
            ("Cmaj7/G#", "C maj7 /G#"),
            ("F#m7b5/C", "F# min7b5 /C"),
            ("D/F#", "D major /F#"),
            ("C / E", "C major /E"),
            ("C6/9", "C maj6-9"),
            ("Cm6/9", "C min6-9"),
            ("Cmin6/9", "C min6-9"),
            ("C69", "C maj6-9"),
            ("C6/9/E", "C maj6-9 /E"),
            ("Cm6/9/Bb", "C min6-9 /Bb"),
            ("C6/9/B", "C maj6-9 /B"),
        ] {
            assert_eq!(read(text), expected, "{text:?}");
        }
    }

    #[test]
    fn a_user_chord_is_typeable_and_can_take_a_suffix() {
        let user = parse_user_chords(
            r#"
[[chord]]
id = "mystic"
name = "Mystic"
symbol = "myst"
aliases = ["mys/4"]
jazz_symbol = "Ж"
intervals = ["1", "4", "b7"]

[[chord]]
id = "minor-alt"
name = "Alt minor"
symbol = "m"
intervals = ["1", "b3", "6"]
"#,
        );
        assert!(user.errors.is_empty(), "{:?}", user.errors);
        let catalog = ChordCatalog::builtin().with_user_chords(user.chords);
        let id = |text: &str| catalog.parse_symbol(text).unwrap().chord_id;
        assert_eq!(id("Amyst"), "mystic");
        assert_eq!(id("AЖ"), "mystic");
        assert_eq!(id("Amys/4"), "mystic");
        // The user's `m` shadows the built-in minor (ADR-27).
        assert_eq!(id("Am"), "minor-alt");
        let chord = catalog.get("mystic").unwrap();
        assert_eq!(
            format_symbol(note("A"), chord, None, SymbolStyle::Jazz),
            "AЖ"
        );
    }

    #[test]
    fn a_user_chord_symbol_with_a_slash_beats_a_bass() {
        let user = parse_user_chords(
            "[[chord]]\nid = \"x\"\nname = \"X\"\nsymbol = \"5/A\"\nintervals = [\"1\", \"5\"]\n",
        );
        let catalog = ChordCatalog::builtin().with_user_chords(user.chords);
        let parsed = catalog.parse_symbol("C5/A").unwrap();
        assert_eq!((parsed.chord_id.as_str(), parsed.bass), ("x", None));
        let parsed = catalog.parse_symbol("C5/E").unwrap();
        assert_eq!(
            (parsed.chord_id.as_str(), parsed.bass),
            ("power", Some(note("E")))
        );
    }

    fn fails(text: &str) -> (usize, SymbolErrorKind) {
        match parse(text) {
            Ok(symbol) => panic!("{text:?} parsed as {symbol:?}"),
            Err(error) => (error.position(), error.kind().clone()),
        }
    }

    #[test]
    fn garbage_is_an_error_with_a_position() {
        assert_eq!(fails(""), (0, SymbolErrorKind::Empty));
        assert_eq!(fails("   "), (0, SymbolErrorKind::Empty));
        assert_eq!(fails("H7"), (0, SymbolErrorKind::Root));
        assert_eq!(fails("  H7"), (2, SymbolErrorKind::Root));
        assert_eq!(fails("7"), (0, SymbolErrorKind::Root));
        assert_eq!(fails("#m7"), (0, SymbolErrorKind::Root));
        // The first character no known suffix continues with.
        assert_eq!(fails("Cfoo"), (1, SymbolErrorKind::Chord("foo".into())));
        assert_eq!(fails("Cmaj7x"), (5, SymbolErrorKind::Chord("maj7x".into())));
        assert_eq!(fails("C7b9x"), (4, SymbolErrorKind::Chord("7b9x".into())));
        assert_eq!(fails("Cm7b6"), (4, SymbolErrorKind::Chord("m7b6".into())));
        assert_eq!(fails("F#zz"), (2, SymbolErrorKind::Chord("zz".into())));
        assert_eq!(fails("Cm7b"), (4, SymbolErrorKind::Chord("m7b".into())));
        // A slash must be followed by a note.
        assert_eq!(fails("C/"), (2, SymbolErrorKind::Bass(String::new())));
        assert_eq!(fails("C/H"), (2, SymbolErrorKind::Bass("H".into())));
        assert_eq!(fails("Cm7/X"), (4, SymbolErrorKind::Bass("X".into())));
        assert_eq!(fails("C/E7"), (2, SymbolErrorKind::Bass("E7".into())));
        // `6/9x` is a bad suffix, not a bad bass.
        assert_eq!(fails("C6/9x"), (4, SymbolErrorKind::Chord("6/9x".into())));
    }

    #[test]
    fn errors_have_readable_messages() {
        let error = parse("Cfoo").unwrap_err();
        assert_eq!(
            error.to_string(),
            "\"foo\" is not a known chord (at position 1)"
        );
        assert!(parse("").unwrap_err().to_string().contains("enter a chord"));
    }

    #[test]
    fn exact_matches_beat_case_folding() {
        // `M` and `m` are different chords; neither falls back to the other.
        assert_eq!(read("CM7"), "C maj7");
        assert_eq!(read("Cm7"), "C min7");
        // A case-folded match is taken only when a single chord fits.
        assert!(parse("CMIN").is_ok());
        assert!(parse("CMi7").is_ok());
    }

    proptest::proptest! {
        /// Any text either parses to a chord of the catalog or fails inside the input.
        #[test]
        fn arbitrary_text_never_panics_and_errors_point_into_it(text in "\\PC{0,24}") {
            match parse(&text) {
                Ok(symbol) => {
                    proptest::prop_assert!(ChordCatalog::builtin().get(&symbol.chord_id).is_some());
                }
                Err(error) => {
                    proptest::prop_assert!(error.position() <= text.chars().count());
                }
            }
        }

        /// Text made of chord-like characters hits the slash, sign and alteration paths.
        #[test]
        fn chord_like_text_is_safe(text in "[A-Ga-g][#b♭♯]{0,2}[mMa-z0-9#b/(),+°ø Δ-]{0,14}") {
            if let Err(error) = parse(&text) {
                proptest::prop_assert!(error.position() <= text.chars().count());
            }
        }
    }

    #[test]
    fn splits_alterations() {
        assert_eq!(split_alterations("7#9b5"), ("7", vec!["#9", "b5"]));
        assert_eq!(split_alterations("m7b5"), ("m7", vec!["b5"]));
        assert_eq!(split_alterations("13b9"), ("13", vec!["b9"]));
        assert_eq!(split_alterations("b9"), ("", vec!["b9"]));
        assert_eq!(split_alterations("9"), ("9", vec![]));
        assert_eq!(split_alterations("maj7"), ("maj7", vec![]));
        assert_eq!(split_alterations(""), ("", vec![]));
    }
}
