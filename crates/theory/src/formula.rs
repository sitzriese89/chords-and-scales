//! Interval formulas: the shared format of scales and chords (SPEC §4.2, §4.3, ADR-5, ADR-20).

use std::fmt;

use crate::notes::{Glyphs, Interval, ParseError, PitchClass};

/// An interval formula such as `1 2 b3 4 5 b6 b7` or `1 3 5 b7 9`: what a scale or chord is
/// made of, as degree labels up from its root.
///
/// A formula starts at the root (`1`) and its intervals strictly ascend in semitones. Labels
/// are kept as written (`#4` and `b5` stay apart, ADR-15). Compound intervals (`9`, `#11`,
/// `13`) are allowed here; scales add their own rule that every interval is within the
/// octave.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Formula {
    intervals: Vec<Interval>,
}

/// Why a list of interval labels is not a [`Formula`].
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum FormulaError {
    /// No intervals at all.
    Empty,
    /// A label that is not an interval.
    Interval(ParseError),
    /// The first interval is not the root, `1`.
    NotFromRoot(Interval),
    /// An interval that is not higher than the one before it.
    NotAscending { previous: Interval, next: Interval },
}

impl fmt::Display for FormulaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => f.write_str("the formula has no intervals"),
            Self::Interval(error) => error.fmt(f),
            Self::NotFromRoot(first) => {
                write!(
                    f,
                    "the formula must start at the root \"1\", not {:?}",
                    first.to_string()
                )
            }
            Self::NotAscending { previous, next } => write!(
                f,
                "intervals must ascend: {:?} ({} semitones) comes after {:?} ({} semitones)",
                next.to_string(),
                next.semitones(),
                previous.to_string(),
                previous.semitones()
            ),
        }
    }
}

impl std::error::Error for FormulaError {}

impl From<ParseError> for FormulaError {
    fn from(error: ParseError) -> Self {
        Self::Interval(error)
    }
}

impl Formula {
    /// The root interval `1`.
    fn root() -> Interval {
        Interval::from_semitones(0).expect("0 semitones is an interval")
    }

    /// A formula of `intervals`: non-empty, starting at `1`, strictly ascending.
    pub fn new(intervals: Vec<Interval>) -> Result<Self, FormulaError> {
        let first = *intervals.first().ok_or(FormulaError::Empty)?;
        if first != Self::root() {
            return Err(FormulaError::NotFromRoot(first));
        }
        for pair in intervals.windows(2) {
            if pair[1].semitones() <= pair[0].semitones() {
                return Err(FormulaError::NotAscending {
                    previous: pair[0],
                    next: pair[1],
                });
            }
        }
        Ok(Self { intervals })
    }

    /// Parses degree labels (ASCII or Unicode) into a formula: `["1", "b3", "5"]`.
    pub fn parse<S: AsRef<str>>(labels: &[S]) -> Result<Self, FormulaError> {
        let intervals = labels
            .iter()
            .map(|label| label.as_ref().parse())
            .collect::<Result<Vec<Interval>, _>>()?;
        Self::new(intervals)
    }

    /// The intervals, root first.
    pub fn intervals(&self) -> &[Interval] {
        &self.intervals
    }

    /// The number of intervals, the root included.
    pub fn len(&self) -> usize {
        self.intervals.len()
    }

    /// Always `false`: a formula has at least the root.
    pub fn is_empty(&self) -> bool {
        self.intervals.is_empty()
    }

    /// The widths in semitones, root (0) first.
    pub fn semitones(&self) -> impl Iterator<Item = u8> + '_ {
        self.intervals.iter().map(|interval| interval.semitones())
    }

    /// The pitch classes of this formula on `root`, in formula order.
    pub fn pitch_classes(&self, root: PitchClass) -> impl Iterator<Item = PitchClass> + '_ {
        self.intervals
            .iter()
            .map(move |&interval| root.up(interval))
    }

    /// The formula heard from its interval at `index` (0 = the root): the intervals from there
    /// on, then the earlier ones an octave up, all reduced into one octave and given their
    /// default labels (ADR-15). Mode 2 of major (`rotate(1)`) is Dorian. `None` if `index` is
    /// out of range or two intervals fall on the same pitch class.
    pub fn rotate(&self, index: usize) -> Option<Self> {
        let start = self.intervals.get(index)?.semitones();
        let mut semitones: Vec<u8> = self
            .semitones()
            .map(|s| (s + 12 - start % 12) % 12)
            .collect();
        semitones.rotate_left(index);
        let intervals = semitones
            .into_iter()
            .map(Interval::from_semitones)
            .collect::<Option<Vec<_>>>()?;
        Self::new(intervals).ok()
    }

    /// The labels joined by spaces, with ASCII (`1 b3 5`) or Unicode (`1 ♭3 5`) accidentals.
    pub fn format(&self, glyphs: Glyphs) -> String {
        self.intervals
            .iter()
            .map(|interval| interval.format(glyphs))
            .collect::<Vec<_>>()
            .join(" ")
    }
}

impl fmt::Display for Formula {
    /// The ASCII labels joined by spaces: `1 2 b3 4 5 b6 b7`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.format(Glyphs::Ascii))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn formula(labels: &str) -> Formula {
        Formula::parse(&labels.split_whitespace().collect::<Vec<_>>()).unwrap()
    }

    fn error(labels: &[&str]) -> FormulaError {
        Formula::parse(labels).unwrap_err()
    }

    #[test]
    fn parses_scale_and_chord_formulas() {
        let minor = formula("1 2 b3 4 5 b6 b7");
        assert_eq!(
            minor.semitones().collect::<Vec<_>>(),
            [0, 2, 3, 5, 7, 8, 10]
        );
        assert_eq!(minor.len(), 7);
        assert!(!minor.is_empty());
        assert_eq!(minor.to_string(), "1 2 b3 4 5 b6 b7");
        assert_eq!(minor.format(Glyphs::Unicode), "1 2 ♭3 4 5 ♭6 ♭7");

        let ninth = formula("1 3 5 b7 9 #11 13");
        assert_eq!(
            ninth.semitones().collect::<Vec<_>>(),
            [0, 4, 7, 10, 14, 18, 21]
        );
        assert_eq!(formula("1 ♭3 ♯4").to_string(), "1 b3 #4");
    }

    #[test]
    fn keeps_labels_as_written() {
        assert_eq!(formula("1 #4").to_string(), "1 #4");
        assert_ne!(formula("1 #4"), formula("1 b5"));
    }

    #[test]
    fn rejects_broken_formulas() {
        assert_eq!(error(&[]), FormulaError::Empty);
        assert_eq!(
            error(&["1", "m3"]),
            FormulaError::Interval(ParseError::Interval("m3".into()))
        );
        assert!(matches!(error(&["2", "3"]), FormulaError::NotFromRoot(_)));
        assert!(matches!(
            error(&["1", "3", "b3"]),
            FormulaError::NotAscending { .. }
        ));
        assert!(matches!(
            error(&["1", "#4", "b5"]),
            FormulaError::NotAscending { .. }
        ));
        assert!(matches!(
            error(&["1", "1"]),
            FormulaError::NotAscending { .. }
        ));
        assert_eq!(
            error(&["1", "3", "b3"]).to_string(),
            "intervals must ascend: \"b3\" (3 semitones) comes after \"3\" (4 semitones)"
        );
    }

    #[test]
    fn rotates_into_modes() {
        let major = formula("1 2 3 4 5 6 7");
        assert_eq!(major.rotate(0).unwrap(), major);
        assert_eq!(major.rotate(1).unwrap().to_string(), "1 2 b3 4 5 6 b7");
        assert_eq!(major.rotate(3).unwrap().to_string(), "1 2 3 b5 5 6 7");
        assert_eq!(major.rotate(6).unwrap().to_string(), "1 b2 b3 4 b5 b6 b7");
        assert_eq!(major.rotate(7), None);
    }

    #[test]
    fn pitch_classes_on_a_root() {
        let a = PitchClass::new(9).unwrap();
        let values: Vec<u8> = formula("1 b3 4 5 b7")
            .pitch_classes(a)
            .map(PitchClass::value)
            .collect();
        assert_eq!(values, [9, 0, 2, 4, 7]);
    }
}
