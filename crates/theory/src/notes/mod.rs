//! Pitches, intervals and note names (SPEC §4.1, ADR-6).
//!
//! The model is 12-TET throughout:
//!
//! - [`PitchClass`]: one of the 12 pitch classes, `0` = C … `11` = B. What scales, chords and
//!   the fretboard compute with.
//! - [`Note`]: a pitch class in an octave, identified by its MIDI number (C4 = 60).
//! - [`Interval`]: a distance in semitones together with its degree label (`1`, `b3`, `#4`,
//!   `b9`, `13`, …).
//! - [`NoteName`]: a spelled note (letter plus [`Accidental`]), as typed or shown. Several names
//!   share a pitch class (`C#`, `Db`, `B##`).
//! - [`Spelling`]: turns pitch classes back into names: by the global [`Accidentals`]
//!   preference, except the root, which keeps its own spelling.
//!
//! Names and labels parse from ASCII (`C#`, `Db`, `bb7`) and Unicode (`C♯`, `D♭`, `𝄫7`) and
//! format as either ([`Glyphs`]); `Display` gives ASCII.

mod accidental;
mod error;
mod interval;
mod name;
mod pitch;
mod spelling;

pub use accidental::{Accidental, Glyphs};
pub use error::ParseError;
pub use interval::Interval;
pub use name::{Letter, NoteName};
pub use pitch::{Note, PitchClass};
pub use spelling::{Accidentals, Spelling};
