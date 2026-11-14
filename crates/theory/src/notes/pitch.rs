use std::str::FromStr;

use super::accidental::Glyphs;
use super::error::ParseError;
use super::interval::Interval;
use super::name::NoteName;
use super::spelling::{Accidentals, Spelling};

/// One of the 12 pitch classes of 12-TET: `0` = C, `1` = C♯/D♭, … `11` = B.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct PitchClass(u8);

impl PitchClass {
    /// The pitch class `value` (0 … 11), or `None` for anything larger.
    pub fn new(value: u8) -> Option<Self> {
        (value < 12).then_some(Self(value))
    }

    /// The pitch class `semitones` above C, wrapping around the octave in either direction.
    pub fn from_semitones(semitones: i32) -> Self {
        Self(semitones.rem_euclid(12) as u8)
    }

    /// 0 = C … 11 = B.
    pub fn value(self) -> u8 {
        self.0
    }

    /// The pitch class `semitones` higher (or lower, if negative).
    pub fn transpose(self, semitones: i32) -> Self {
        Self::from_semitones(i32::from(self.0) + semitones)
    }

    /// The pitch class `interval` higher.
    pub fn up(self, interval: Interval) -> Self {
        self.transpose(i32::from(interval.semitones()))
    }

    /// The pitch class `interval` lower.
    pub fn down(self, interval: Interval) -> Self {
        self.transpose(-i32::from(interval.semitones()))
    }

    /// The interval up from `self` to the next `other` (0 … 11 semitones), with its default
    /// label ([`Interval::from_semitones`]).
    pub fn interval_to(self, other: PitchClass) -> Interval {
        Interval::from_semitones((other.0 + 12 - self.0) % 12)
            .expect("an interval within an octave is valid")
    }
}

/// A pitch: a pitch class in an octave, identified by its MIDI number.
///
/// Octaves are scientific pitch notation: C4 (middle C) is MIDI 60, and the range is the MIDI
/// range C-1 (0) … G9 (127). Has no spelling of its own; [`Note::format`] spells it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Note(u8);

impl Note {
    /// The highest MIDI number, G9.
    pub const MAX_MIDI: u8 = 127;

    /// The note with MIDI number `midi`, or `None` above 127.
    pub fn from_midi(midi: u8) -> Option<Self> {
        (midi <= Self::MAX_MIDI).then_some(Self(midi))
    }

    /// `pitch_class` in `octave` (C4 = middle C), or `None` outside the MIDI range.
    pub fn new(pitch_class: PitchClass, octave: i8) -> Option<Self> {
        Self::from_midi_i32((i32::from(octave) + 1) * 12 + i32::from(pitch_class.value()))
    }

    fn from_midi_i32(midi: i32) -> Option<Self> {
        u8::try_from(midi).ok().and_then(Self::from_midi)
    }

    /// The MIDI number, 0 … 127.
    pub fn midi(self) -> u8 {
        self.0
    }

    pub fn pitch_class(self) -> PitchClass {
        PitchClass(self.0 % 12)
    }

    /// The octave in scientific pitch notation: -1 … 9, changing between B and C.
    pub fn octave(self) -> i8 {
        (self.0 / 12) as i8 - 1
    }

    /// The note `semitones` higher (or lower, if negative), or `None` if that leaves the MIDI
    /// range.
    pub fn transpose(self, semitones: i32) -> Option<Self> {
        Self::from_midi_i32(i32::from(self.0) + semitones)
    }

    /// The note `interval` higher, or `None` above G9.
    pub fn up(self, interval: Interval) -> Option<Self> {
        self.transpose(i32::from(interval.semitones()))
    }

    /// The note `interval` lower, or `None` below C-1.
    pub fn down(self, interval: Interval) -> Option<Self> {
        self.transpose(-i32::from(interval.semitones()))
    }

    /// The note spelled by `accidentals`, with its octave: `E2`, `C#4` or `C♯4`.
    pub fn format(self, accidentals: Accidentals, glyphs: Glyphs) -> String {
        let name = Spelling::new(accidentals).spell(self.pitch_class());
        format!("{}{}", name.format(glyphs), self.octave())
    }
}

impl FromStr for Note {
    type Err = ParseError;

    /// Parses a note name followed by an octave: `E2`, `C#4`, `D♭3`, `Bb-1`.
    ///
    /// The octave belongs to the letter, as in scientific pitch notation: `Cb4` is the B below
    /// middle C and `B#3` is middle C.
    fn from_str(input: &str) -> Result<Self, Self::Err> {
        let trimmed = input.trim();
        let octave_at = trimmed
            .find(|c: char| c == '-' || c.is_ascii_digit())
            .ok_or_else(|| ParseError::Note(input.to_owned()))?;
        let (name, octave) = trimmed.split_at(octave_at);
        let name = NoteName::parse_exact(name).ok_or_else(|| ParseError::Note(input.to_owned()))?;
        let octave: i32 = octave
            .parse()
            .map_err(|_| ParseError::Note(input.to_owned()))?;
        let midi = octave
            .checked_add(1)
            .and_then(|o| o.checked_mul(12))
            .and_then(|m| m.checked_add(name.semitones_from_c()));
        midi.and_then(Self::from_midi_i32)
            .ok_or_else(|| ParseError::NoteOutOfRange(input.to_owned()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pc(value: u8) -> PitchClass {
        PitchClass::new(value).unwrap()
    }

    fn note(input: &str) -> Note {
        input.parse().unwrap()
    }

    #[test]
    fn pitch_class_range() {
        assert_eq!(PitchClass::new(11).map(PitchClass::value), Some(11));
        assert_eq!(PitchClass::new(12), None);
        assert_eq!(PitchClass::from_semitones(-1), pc(11));
        assert_eq!(PitchClass::from_semitones(25), pc(1));
    }

    #[test]
    fn pitch_class_transposition_wraps() {
        assert_eq!(pc(10).transpose(3), pc(1));
        assert_eq!(pc(1).transpose(-3), pc(10));
        let fifth: Interval = "5".parse().unwrap();
        assert_eq!(pc(9).up(fifth), pc(4));
        assert_eq!(pc(4).down(fifth), pc(9));
    }

    #[test]
    fn pitch_class_interval_is_ascending_within_an_octave() {
        assert_eq!(pc(0).interval_to(pc(7)).to_string(), "5");
        assert_eq!(pc(7).interval_to(pc(0)).to_string(), "4");
        assert_eq!(pc(5).interval_to(pc(5)).to_string(), "1");
    }

    #[test]
    fn midi_numbers_and_octaves() {
        let middle_c = Note::new(pc(0), 4).unwrap();
        assert_eq!(middle_c.midi(), 60);
        assert_eq!(middle_c.octave(), 4);
        assert_eq!(Note::from_midi(59).unwrap().octave(), 3);
        assert_eq!(Note::from_midi(0).unwrap().octave(), -1);
        assert_eq!(Note::from_midi(127).unwrap().octave(), 9);
        assert_eq!(Note::from_midi(128), None);
        assert_eq!(Note::new(pc(8), 9), None);
        assert_eq!(Note::new(pc(11), -2), None);
    }

    #[test]
    fn parses_notes_with_octaves() {
        assert_eq!(note("E2").midi(), 40);
        assert_eq!(note("A4").midi(), 69);
        assert_eq!(note("C#4").midi(), 61);
        assert_eq!(note("D♭4").midi(), 61);
        assert_eq!(note(" F♯1 ").midi(), 30);
        assert_eq!(note("C-1").midi(), 0);
        assert_eq!(note("G9").midi(), 127);
        assert_eq!(note("Cb4").midi(), 59);
        assert_eq!(note("B#3").midi(), 60);
        assert_eq!(note("e2"), note("E2"));
    }

    #[test]
    fn rejects_malformed_notes() {
        for input in [
            "", "E", "H2", "E 2", "E2x", "E-", "4", "-1", "E--1", "Eb+2", "E2.5",
        ] {
            assert_eq!(
                input.parse::<Note>(),
                Err(ParseError::Note(input.to_owned())),
                "{input:?}"
            );
        }
    }

    #[test]
    fn rejects_notes_outside_the_midi_range() {
        for input in ["G#9", "A9", "Cb-1", "C-2", "C10"] {
            assert_eq!(
                input.parse::<Note>(),
                Err(ParseError::NoteOutOfRange(input.to_owned())),
                "{input:?}"
            );
        }
    }

    #[test]
    fn transposition_stays_in_the_midi_range() {
        assert_eq!(note("E2").transpose(5), Some(note("A2")));
        assert_eq!(note("E2").transpose(-40), Some(note("C-1")));
        assert_eq!(note("E2").transpose(-41), None);
        assert_eq!(note("G9").transpose(1), None);
        let octave: Interval = "8".parse().unwrap();
        assert_eq!(note("A4").up(octave), Some(note("A5")));
        assert_eq!(note("A4").down(octave), Some(note("A3")));
    }

    #[test]
    fn formats_by_preference() {
        assert_eq!(
            note("C#4").format(Accidentals::Sharps, Glyphs::Ascii),
            "C#4"
        );
        assert_eq!(note("C#4").format(Accidentals::Flats, Glyphs::Ascii), "Db4");
        assert_eq!(
            note("C#4").format(Accidentals::Flats, Glyphs::Unicode),
            "D♭4"
        );
        assert_eq!(
            note("C-1").format(Accidentals::Sharps, Glyphs::Unicode),
            "C-1"
        );
    }
}
