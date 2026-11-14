use std::fmt;
use std::str::FromStr;

use super::accidental::{Accidental, Glyphs, split_accidental};
use super::error::ParseError;
use super::pitch::PitchClass;

/// A note letter, C … B.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Letter {
    C,
    D,
    E,
    F,
    G,
    A,
    B,
}

impl Letter {
    /// The pitch class of the natural note.
    pub fn pitch_class(self) -> PitchClass {
        PitchClass::from_semitones(self.semitones_from_c())
    }

    fn semitones_from_c(self) -> i32 {
        match self {
            Self::C => 0,
            Self::D => 2,
            Self::E => 4,
            Self::F => 5,
            Self::G => 7,
            Self::A => 9,
            Self::B => 11,
        }
    }

    /// The letter, case-insensitively.
    fn from_char(c: char) -> Option<Self> {
        match c.to_ascii_uppercase() {
            'C' => Some(Self::C),
            'D' => Some(Self::D),
            'E' => Some(Self::E),
            'F' => Some(Self::F),
            'G' => Some(Self::G),
            'A' => Some(Self::A),
            'B' => Some(Self::B),
            _ => None,
        }
    }
}

impl fmt::Display for Letter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(self, f)
    }
}

/// A spelled note without an octave: a letter and an accidental, such as `D♭` or `F##`.
///
/// Different names can share a pitch class (`C#`, `Db`, `B##`); equality compares spellings.
/// Compare [`NoteName::pitch_class`] to compare pitches.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct NoteName {
    letter: Letter,
    accidental: Accidental,
}

impl NoteName {
    pub fn new(letter: Letter, accidental: Accidental) -> Self {
        Self { letter, accidental }
    }

    pub fn letter(self) -> Letter {
        self.letter
    }

    pub fn accidental(self) -> Accidental {
        self.accidental
    }

    /// The pitch class this name sounds as (`B#` → C).
    pub fn pitch_class(self) -> PitchClass {
        PitchClass::from_semitones(self.semitones_from_c())
    }

    /// Semitones above the C of the letter's octave: -2 (`Cbb`) … 13 (`B##`).
    pub(super) fn semitones_from_c(self) -> i32 {
        self.letter.semitones_from_c() + i32::from(self.accidental.semitones())
    }

    /// The name with ASCII (`Db`) or Unicode (`D♭`) accidentals.
    pub fn format(self, glyphs: Glyphs) -> String {
        format!("{}{}", self.letter, self.accidental.symbol(glyphs))
    }

    /// Parses `input` with nothing around it: a letter, then accidental signs.
    pub(super) fn parse_exact(input: &str) -> Option<Self> {
        let mut chars = input.chars();
        let letter = Letter::from_char(chars.next()?)?;
        match split_accidental(chars.as_str())? {
            (accidental, "") => Some(Self::new(letter, accidental)),
            _ => None,
        }
    }
}

impl fmt::Display for NoteName {
    /// The ASCII spelling, e.g. `Db` (use [`NoteName::format`] for Unicode).
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.format(Glyphs::Ascii))
    }
}

impl FromStr for NoteName {
    type Err = ParseError;

    /// Parses a letter (either case) and up to two sharps or flats, ASCII or Unicode: `C`,
    /// `c#`, `Db`, `D♭`, `F##`, `Fx`, `F𝄪`, `Ebb`, `E♭♭`, `E𝄫`. Surrounding whitespace is
    /// ignored.
    fn from_str(input: &str) -> Result<Self, Self::Err> {
        Self::parse_exact(input.trim()).ok_or_else(|| ParseError::NoteName(input.to_owned()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn name(input: &str) -> NoteName {
        input.parse().unwrap()
    }

    #[test]
    fn parses_naturals_sharps_and_flats() {
        assert_eq!(name("C"), NoteName::new(Letter::C, Accidental::Natural));
        assert_eq!(name("c"), NoteName::new(Letter::C, Accidental::Natural));
        assert_eq!(name("C#"), NoteName::new(Letter::C, Accidental::Sharp));
        assert_eq!(name("Db"), NoteName::new(Letter::D, Accidental::Flat));
        assert_eq!(name("bb"), NoteName::new(Letter::B, Accidental::Flat));
        assert_eq!(
            name("Bbb"),
            NoteName::new(Letter::B, Accidental::DoubleFlat)
        );
        assert_eq!(
            name(" F## "),
            NoteName::new(Letter::F, Accidental::DoubleSharp)
        );
    }

    #[test]
    fn ascii_and_unicode_parse_to_the_same_name() {
        for (ascii, unicode) in [
            ("C#", "C♯"),
            ("Db", "D♭"),
            ("Ebb", "E♭♭"),
            ("Ebb", "E𝄫"),
            ("F##", "F♯♯"),
            ("F##", "F𝄪"),
            ("F##", "Fx"),
        ] {
            assert_eq!(name(ascii), name(unicode), "{ascii} vs {unicode}");
        }
    }

    #[test]
    fn pitch_classes_include_enharmonics() {
        let value = |input| name(input).pitch_class().value();
        assert_eq!(value("C"), 0);
        assert_eq!(value("C#"), 1);
        assert_eq!(value("Db"), 1);
        assert_eq!(value("B#"), 0);
        assert_eq!(value("Cb"), 11);
        assert_eq!(value("Cbb"), 10);
        assert_eq!(value("B##"), 1);
        assert_eq!(value("Ebb"), 2);
    }

    #[test]
    fn formats_ascii_and_unicode() {
        assert_eq!(name("Db").to_string(), "Db");
        assert_eq!(name("D♭").format(Glyphs::Unicode), "D♭");
        assert_eq!(name("F#").format(Glyphs::Unicode), "F♯");
        assert_eq!(name("Ebb").format(Glyphs::Unicode), "E𝄫");
        assert_eq!(name("Fx").to_string(), "F##");
        assert_eq!(name("Fx").format(Glyphs::Unicode), "F𝄪");
        assert_eq!(name("g").format(Glyphs::Unicode), "G");
    }

    #[test]
    fn invalid_names_are_errors() {
        for input in [
            "", " ", "H", "Cb#", "C#b", "Dbbb", "E###", "C4", "#", "Do", "C ♯", "♯C",
        ] {
            assert_eq!(
                input.parse::<NoteName>(),
                Err(ParseError::NoteName(input.to_owned())),
                "{input:?}"
            );
        }
    }
}
