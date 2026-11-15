//! Roman numerals for the chords of a scale (SPEC §5.5, ADR-30).

use std::fmt;

use crate::notes::{Accidental, Glyphs};

/// The mark after the numeral that says what the triad is, besides major or minor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NumeralMark {
    /// `°`: a diminished triad, or a fully diminished seventh chord.
    Diminished,
    /// `+`: an augmented triad (the fifth is raised), or a seventh chord on one.
    Augmented,
    /// `ø`: a half-diminished seventh chord (diminished triad, minor seventh).
    HalfDiminished,
}

impl NumeralMark {
    pub fn symbol(self) -> &'static str {
        match self {
            Self::Diminished => "°",
            Self::Augmented => "+",
            Self::HalfDiminished => "ø",
        }
    }
}

/// The seventh of a seventh chord, as the numeral writes it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NumeralSeventh {
    /// `7`: a minor seventh, or the diminished seventh of `°7`.
    Seventh,
    /// `maj7`: a major seventh.
    Major,
}

impl NumeralSeventh {
    pub fn symbol(self) -> &'static str {
        match self {
            Self::Seventh => "7",
            Self::Major => "maj7",
        }
    }
}

/// A Roman numeral in parts: `♭III+maj7` is accidental -1, number 3, upper case, mark
/// [`NumeralMark::Augmented`], seventh [`NumeralSeventh::Major`].
///
/// The case says the third (upper case for a major third, lower case for a minor one).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RomanNumeral {
    /// Semitones the numeral is raised (+) or lowered (-) for the degree's place: 0 in
    /// scales of seven notes, whose numerals count the scale's own degrees (ADR-30).
    pub accidental: i8,
    /// The degree, 1 … 7.
    pub number: u8,
    /// True for a minor third (`ii`), false for a major one (`II`).
    pub lowercase: bool,
    pub mark: Option<NumeralMark>,
    pub seventh: Option<NumeralSeventh>,
}

const NUMERALS: [&str; 7] = ["I", "II", "III", "IV", "V", "VI", "VII"];

impl RomanNumeral {
    /// The numeral as text, e.g. `♭III+maj7`, `viiø7`, `ii°`.
    pub fn format(self, glyphs: Glyphs) -> String {
        let mut text = String::new();
        if let Some(accidental) = Accidental::from_semitones(self.accidental) {
            text.push_str(accidental.symbol(glyphs));
        }
        let numeral = NUMERALS[usize::from(self.number.saturating_sub(1)) % 7];
        if self.lowercase {
            text.push_str(&numeral.to_lowercase());
        } else {
            text.push_str(numeral);
        }
        if let Some(mark) = self.mark {
            text.push_str(mark.symbol());
        }
        if let Some(seventh) = self.seventh {
            text.push_str(seventh.symbol());
        }
        text
    }
}

impl fmt::Display for RomanNumeral {
    /// The numeral with ASCII accidentals (`bIII+maj7`); the marks stay `°`, `ø` and `+`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.format(Glyphs::Ascii))
    }
}

/// The numeral of a stack of thirds with `third`, `fifth` and (for sevenths) `seventh` in
/// semitones above the root. `None` if the stack is not made of thirds, which
/// [`super::harmonize`] never produces.
pub(super) fn numeral(
    accidental: i8,
    number: u8,
    third: u8,
    fifth: u8,
    seventh: Option<u8>,
) -> Option<RomanNumeral> {
    let lowercase = match third {
        3 => true,
        4 => false,
        _ => return None,
    };
    let mark = match (fifth, seventh) {
        (6, Some(10)) => Some(NumeralMark::HalfDiminished),
        (6, _) => Some(NumeralMark::Diminished),
        (8, _) => Some(NumeralMark::Augmented),
        (7, _) => None,
        _ => return None,
    };
    let seventh = match seventh {
        None => None,
        Some(9 | 10) => Some(NumeralSeventh::Seventh),
        Some(11) => Some(NumeralSeventh::Major),
        Some(_) => return None,
    };
    Some(RomanNumeral {
        accidental,
        number,
        lowercase,
        mark,
        seventh,
    })
}
