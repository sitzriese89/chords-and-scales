use std::fmt;
use std::str::FromStr;

use super::accidental::{Accidental, Glyphs, split_accidental};
use super::error::ParseError;
use super::pitch::Note;

/// An ascending interval: a distance in semitones together with its degree label, such as
/// `1`, `b3`, `#4`, `bb7`, `b9` or `13`.
///
/// The label is a degree (1 = root, 8 = octave, 9 = 2 an octave up, …) and an accidental
/// relative to the major scale: `3` is 4 semitones, `b3` 3, `#4` and `b5` both 6. Labels are
/// kept as given, so `#4` and `b5` are different intervals with the same
/// [`semitones`](Interval::semitones). Spans at most the MIDI range, 127 semitones.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Interval {
    degree: u8,
    accidental: Accidental,
}

/// Semitones of the major-scale degrees 1 … 7.
const MAJOR_SCALE: [u8; 7] = [0, 2, 4, 5, 7, 9, 11];

/// The default label for each semitone count within an octave.
const DEFAULT_LABELS: [(u8, Accidental); 12] = [
    (1, Accidental::Natural),
    (2, Accidental::Flat),
    (2, Accidental::Natural),
    (3, Accidental::Flat),
    (3, Accidental::Natural),
    (4, Accidental::Natural),
    (5, Accidental::Flat),
    (5, Accidental::Natural),
    (6, Accidental::Flat),
    (6, Accidental::Natural),
    (7, Accidental::Flat),
    (7, Accidental::Natural),
];

impl Interval {
    /// The largest interval, from C-1 to G9.
    pub const MAX_SEMITONES: u8 = 127;

    /// The interval labelled `accidental` + `degree` (degree 1 = root). `None` for degree 0,
    /// or if the label would be below the root (`b1`) or wider than 127 semitones.
    pub fn new(degree: u8, accidental: Accidental) -> Option<Self> {
        let semitones = label_semitones(degree, accidental)?;
        (0..=i32::from(Self::MAX_SEMITONES))
            .contains(&semitones)
            .then_some(Self { degree, accidental })
    }

    /// The interval of `semitones` with its default label, or `None` above 127.
    ///
    /// Within an octave the labels are `1 b2 2 b3 3 4 b5 5 b6 6 b7 7`; each further octave adds
    /// 7 to the degree (12 → `8`, 13 → `b9`, 21 → `13`). Scales and chords that mean `#4`,
    /// `#9` or `#11` say so in their own labels.
    pub fn from_semitones(semitones: u8) -> Option<Self> {
        let (degree, accidental) = DEFAULT_LABELS[usize::from(semitones % 12)];
        Self::new(degree + 7 * (semitones / 12), accidental)
    }

    /// The interval up from the lower of two notes to the higher, with its default label.
    pub fn between(a: Note, b: Note) -> Self {
        Self::from_semitones(a.midi().abs_diff(b.midi()))
            .expect("two MIDI notes are at most 127 semitones apart")
    }

    /// The width in semitones.
    pub fn semitones(self) -> u8 {
        label_semitones(self.degree, self.accidental)
            .and_then(|semitones| u8::try_from(semitones).ok())
            .expect("checked by Interval::new")
    }

    /// The degree number of the label: 1 = root, 3 for `b3`, 13 for `13`.
    pub fn degree(self) -> u8 {
        self.degree
    }

    /// The accidental of the label: flat for `b3`, natural for `5`.
    pub fn accidental(self) -> Accidental {
        self.accidental
    }

    /// The label with ASCII (`b3`) or Unicode (`♭3`) accidentals.
    pub fn format(self, glyphs: Glyphs) -> String {
        format!("{}{}", self.accidental.symbol(glyphs), self.degree)
    }
}

/// Semitones of a degree label, before range checks; `None` for degree 0.
fn label_semitones(degree: u8, accidental: Accidental) -> Option<i32> {
    let steps = usize::from(degree.checked_sub(1)?);
    let natural = 12 * (steps / 7) + usize::from(MAJOR_SCALE[steps % 7]);
    i32::try_from(natural)
        .ok()
        .map(|n| n + i32::from(accidental.semitones()))
}

impl fmt::Display for Interval {
    /// The ASCII label, e.g. `b3` (use [`Interval::format`] for Unicode).
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.format(Glyphs::Ascii))
    }
}

impl FromStr for Interval {
    type Err = ParseError;

    /// Parses a degree label: up to two sharps or flats, ASCII or Unicode, then a degree
    /// number: `1`, `b3`, `♭3`, `#4`, `bb7`, `𝄫7`, `#11`, `13`. Surrounding whitespace is
    /// ignored.
    fn from_str(input: &str) -> Result<Self, Self::Err> {
        let error = || ParseError::Interval(input.to_owned());
        let (accidental, degree) = split_accidental(input.trim()).ok_or_else(error)?;
        if degree.is_empty() || !degree.bytes().all(|b| b.is_ascii_digit()) {
            return Err(error());
        }
        let degree: u8 = degree.parse().map_err(|_| error())?;
        Self::new(degree, accidental).ok_or_else(error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn interval(label: &str) -> Interval {
        label.parse().unwrap()
    }

    fn semitones(label: &str) -> u8 {
        interval(label).semitones()
    }

    #[test]
    fn simple_degrees() {
        let labels = [
            "1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7",
        ];
        for (expected, label) in labels.into_iter().enumerate() {
            assert_eq!(usize::from(semitones(label)), expected, "{label}");
        }
        assert_eq!(semitones("#4"), 6);
        assert_eq!(semitones("#5"), 8);
        assert_eq!(semitones("bb7"), 9);
        assert_eq!(semitones("#2"), 3);
        assert_eq!(semitones("bb3"), 2);
    }

    #[test]
    fn compound_degrees() {
        assert_eq!(semitones("8"), 12);
        assert_eq!(semitones("b9"), 13);
        assert_eq!(semitones("9"), 14);
        assert_eq!(semitones("#9"), 15);
        assert_eq!(semitones("11"), 17);
        assert_eq!(semitones("#11"), 18);
        assert_eq!(semitones("b13"), 20);
        assert_eq!(semitones("13"), 21);
        assert_eq!(semitones("15"), 24);
    }

    #[test]
    fn labels_are_kept_as_given() {
        assert_ne!(interval("#4"), interval("b5"));
        assert_eq!(interval("#4").semitones(), interval("b5").semitones());
        assert_eq!(interval("#11").to_string(), "#11");
        assert_eq!(interval("#4").degree(), 4);
        assert_eq!(interval("#4").accidental(), Accidental::Sharp);
    }

    #[test]
    fn ascii_and_unicode_labels_parse_alike() {
        for (ascii, unicode) in [("b3", "♭3"), ("#4", "♯4"), ("bb7", "𝄫7"), ("bb7", "♭♭7")]
        {
            assert_eq!(interval(ascii), interval(unicode), "{ascii} vs {unicode}");
        }
        assert_eq!(interval("b3").format(Glyphs::Unicode), "♭3");
        assert_eq!(interval("bb7").format(Glyphs::Unicode), "𝄫7");
        assert_eq!(interval("♯11").to_string(), "#11");
    }

    #[test]
    fn default_labels() {
        let label = |semitones| Interval::from_semitones(semitones).unwrap().to_string();
        assert_eq!(label(0), "1");
        assert_eq!(label(6), "b5");
        assert_eq!(label(11), "7");
        assert_eq!(label(12), "8");
        assert_eq!(label(13), "b9");
        assert_eq!(label(21), "13");
        assert_eq!(label(127), "75");
        assert_eq!(Interval::from_semitones(128), None);
        for semitones in 0..=Interval::MAX_SEMITONES {
            assert_eq!(
                Interval::from_semitones(semitones).unwrap().semitones(),
                semitones
            );
        }
    }

    #[test]
    fn invalid_labels_are_errors() {
        for input in [
            "", "b", "0", "b1", "bb1", "3b", "b 3", "+3", "-3", "#b3", "bbb3", "3.0", "m3", "76",
            "256", "١",
        ] {
            assert_eq!(
                input.parse::<Interval>(),
                Err(ParseError::Interval(input.to_owned())),
                "{input:?}"
            );
        }
    }

    #[test]
    fn between_notes() {
        let note = |input: &str| input.parse::<Note>().unwrap();
        assert_eq!(Interval::between(note("E2"), note("A2")).to_string(), "4");
        assert_eq!(Interval::between(note("A2"), note("E2")).to_string(), "4");
        assert_eq!(Interval::between(note("C4"), note("D5")).to_string(), "9");
        assert_eq!(Interval::between(note("C4"), note("C4")).to_string(), "1");
    }
}
