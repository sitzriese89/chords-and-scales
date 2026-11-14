/// A sharp or flat sign on a note name or interval label, from double flat to double sharp.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Accidental {
    DoubleFlat,
    Flat,
    Natural,
    Sharp,
    DoubleSharp,
}

/// Which characters to format accidentals with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Glyphs {
    /// `b`, `#`, `bb`, `##`: for files, catalogs and typing.
    Ascii,
    /// `♭`, `♯`, `𝄫`, `𝄪`: for display.
    Unicode,
}

impl Accidental {
    /// How many semitones the sign raises (positive) or lowers (negative) the pitch: -2 … 2.
    pub fn semitones(self) -> i8 {
        match self {
            Self::DoubleFlat => -2,
            Self::Flat => -1,
            Self::Natural => 0,
            Self::Sharp => 1,
            Self::DoubleSharp => 2,
        }
    }

    /// The accidental that alters by `semitones`, if it is in -2 … 2.
    pub fn from_semitones(semitones: i8) -> Option<Self> {
        match semitones {
            -2 => Some(Self::DoubleFlat),
            -1 => Some(Self::Flat),
            0 => Some(Self::Natural),
            1 => Some(Self::Sharp),
            2 => Some(Self::DoubleSharp),
            _ => None,
        }
    }

    /// The sign as written. A natural is written as nothing.
    pub fn symbol(self, glyphs: Glyphs) -> &'static str {
        match (self, glyphs) {
            (Self::Natural, _) => "",
            (Self::DoubleFlat, Glyphs::Ascii) => "bb",
            (Self::Flat, Glyphs::Ascii) => "b",
            (Self::Sharp, Glyphs::Ascii) => "#",
            (Self::DoubleSharp, Glyphs::Ascii) => "##",
            (Self::DoubleFlat, Glyphs::Unicode) => "𝄫",
            (Self::Flat, Glyphs::Unicode) => "♭",
            (Self::Sharp, Glyphs::Unicode) => "♯",
            (Self::DoubleSharp, Glyphs::Unicode) => "𝄪",
        }
    }
}

/// Reads the accidental signs at the start of `input` and returns them with the rest.
///
/// Accepts `b`/`♭`, `#`/`♯`, `𝄫`, `𝄪` and `x` (double sharp), in any combination that adds up
/// to at most a double sharp or flat in one direction. No signs is a natural. Returns `None`
/// for mixed directions (`#b`) or more than two (`bbb`).
pub(super) fn split_accidental(input: &str) -> Option<(Accidental, &str)> {
    let mut total: i8 = 0;
    let mut sharps = false;
    let mut flats = false;
    let mut rest = input;
    while let Some(c) = rest.chars().next() {
        let step = match c {
            'b' | '♭' => -1,
            '#' | '♯' => 1,
            '𝄫' => -2,
            '𝄪' | 'x' => 2,
            _ => break,
        };
        flats |= step < 0;
        sharps |= step > 0;
        total += step;
        if (sharps && flats) || !(-2..=2).contains(&total) {
            return None;
        }
        rest = &rest[c.len_utf8()..];
    }
    Accidental::from_semitones(total).map(|accidental| (accidental, rest))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semitones_round_trip() {
        for semitones in -2..=2 {
            let accidental = Accidental::from_semitones(semitones).unwrap();
            assert_eq!(accidental.semitones(), semitones);
        }
        assert_eq!(Accidental::from_semitones(3), None);
        assert_eq!(Accidental::from_semitones(-3), None);
    }

    #[test]
    fn splits_ascii_and_unicode_signs() {
        assert_eq!(split_accidental("4"), Some((Accidental::Natural, "4")));
        assert_eq!(split_accidental("b3"), Some((Accidental::Flat, "3")));
        assert_eq!(split_accidental("♭3"), Some((Accidental::Flat, "3")));
        assert_eq!(split_accidental("#"), Some((Accidental::Sharp, "")));
        assert_eq!(split_accidental("♯"), Some((Accidental::Sharp, "")));
        assert_eq!(split_accidental("bb7"), Some((Accidental::DoubleFlat, "7")));
        assert_eq!(split_accidental("♭♭"), Some((Accidental::DoubleFlat, "")));
        assert_eq!(split_accidental("𝄫"), Some((Accidental::DoubleFlat, "")));
        assert_eq!(split_accidental("##"), Some((Accidental::DoubleSharp, "")));
        assert_eq!(split_accidental("x"), Some((Accidental::DoubleSharp, "")));
        assert_eq!(split_accidental("𝄪4"), Some((Accidental::DoubleSharp, "4")));
    }

    #[test]
    fn rejects_mixed_or_triple_signs() {
        assert_eq!(split_accidental("#b"), None);
        assert_eq!(split_accidental("b#"), None);
        assert_eq!(split_accidental("bbb"), None);
        assert_eq!(split_accidental("###"), None);
        assert_eq!(split_accidental("x#"), None);
        assert_eq!(split_accidental("𝄫b"), None);
    }
}
