use std::fmt;

/// Why a note name, note or interval label could not be parsed. Each variant carries the
/// input as given.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum ParseError {
    /// Not a note name such as `C`, `F#`, `Db` or `E♭`.
    NoteName(String),
    /// Not a note with an octave such as `E2`, `C#4` or `B♭-1`.
    Note(String),
    /// A well-formed note outside the MIDI range C-1 (0) … G9 (127).
    NoteOutOfRange(String),
    /// Not an interval label such as `1`, `b3`, `#4` or `13`.
    Interval(String),
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoteName(input) => write!(
                f,
                "{input:?} is not a note name (expected a letter A-G with optional sharps or flats, e.g. C, F#, Db, E♭)"
            ),
            Self::Note(input) => write!(
                f,
                "{input:?} is not a note (expected a note name and an octave, e.g. E2, C#4, B♭-1)"
            ),
            Self::NoteOutOfRange(input) => {
                write!(f, "{input:?} is outside the MIDI range C-1 to G9")
            }
            Self::Interval(input) => write!(
                f,
                "{input:?} is not an interval (expected a degree with optional sharps or flats, e.g. 1, b3, #4, 13)"
            ),
        }
    }
}

impl std::error::Error for ParseError {}
