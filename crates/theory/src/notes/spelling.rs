use super::accidental::Accidental;
use super::name::{Letter, NoteName};
use super::pitch::PitchClass;

/// The global sharp/flat preference: how pitch classes off the white keys are spelled
/// (ADR-6).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Accidentals {
    /// C♯ D♯ F♯ G♯ A♯.
    Sharps,
    /// D♭ E♭ G♭ A♭ B♭.
    Flats,
}

/// Spells pitch classes as note names (SPEC §4.1, ADR-6).
///
/// Every pitch class is spelled as a natural or with one sharp or flat, by the [`Accidentals`]
/// preference. The exception is the root: its pitch class keeps the root's own spelling, as the
/// user typed or picked it. Per-key spelling (G♭ in D♭ major) is deliberately not done.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Spelling {
    accidentals: Accidentals,
    root: Option<NoteName>,
}

impl Spelling {
    /// Spelling by the preference alone, without a root.
    pub fn new(accidentals: Accidentals) -> Self {
        Self {
            accidentals,
            root: None,
        }
    }

    /// The same preference, with `root` keeping its spelling.
    pub fn with_root(self, root: NoteName) -> Self {
        Self {
            root: Some(root),
            ..self
        }
    }

    pub fn accidentals(self) -> Accidentals {
        self.accidentals
    }

    pub fn root(self) -> Option<NoteName> {
        self.root
    }

    /// The name of `pitch_class`: the root's own spelling for the root's pitch class, otherwise
    /// a natural, or a sharp or flat by the preference.
    pub fn spell(self, pitch_class: PitchClass) -> NoteName {
        if let Some(root) = self.root.filter(|root| root.pitch_class() == pitch_class) {
            return root;
        }
        let (letter, accidental) = match (self.accidentals, pitch_class.value()) {
            (_, 0) => (Letter::C, Accidental::Natural),
            (_, 2) => (Letter::D, Accidental::Natural),
            (_, 4) => (Letter::E, Accidental::Natural),
            (_, 5) => (Letter::F, Accidental::Natural),
            (_, 7) => (Letter::G, Accidental::Natural),
            (_, 9) => (Letter::A, Accidental::Natural),
            (_, 11) => (Letter::B, Accidental::Natural),
            (Accidentals::Sharps, 1) => (Letter::C, Accidental::Sharp),
            (Accidentals::Sharps, 3) => (Letter::D, Accidental::Sharp),
            (Accidentals::Sharps, 6) => (Letter::F, Accidental::Sharp),
            (Accidentals::Sharps, 8) => (Letter::G, Accidental::Sharp),
            (Accidentals::Sharps, _) => (Letter::A, Accidental::Sharp),
            (Accidentals::Flats, 1) => (Letter::D, Accidental::Flat),
            (Accidentals::Flats, 3) => (Letter::E, Accidental::Flat),
            (Accidentals::Flats, 6) => (Letter::G, Accidental::Flat),
            (Accidentals::Flats, 8) => (Letter::A, Accidental::Flat),
            (Accidentals::Flats, _) => (Letter::B, Accidental::Flat),
        };
        NoteName::new(letter, accidental)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::Glyphs;

    fn name(input: &str) -> NoteName {
        input.parse().unwrap()
    }

    fn chromatic(spelling: Spelling) -> Vec<String> {
        (0..12)
            .map(|value| {
                let pitch_class = PitchClass::new(value).unwrap();
                spelling.spell(pitch_class).format(Glyphs::Unicode)
            })
            .collect()
    }

    #[test]
    fn spells_by_preference() {
        assert_eq!(
            chromatic(Spelling::new(Accidentals::Sharps)),
            [
                "C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"
            ]
        );
        assert_eq!(
            chromatic(Spelling::new(Accidentals::Flats)),
            [
                "C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"
            ]
        );
    }

    #[test]
    fn root_keeps_its_spelling_against_the_preference() {
        let spelling = Spelling::new(Accidentals::Sharps).with_root(name("Db"));
        assert_eq!(
            chromatic(spelling),
            [
                "C", "D♭", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"
            ]
        );
        let spelling = Spelling::new(Accidentals::Flats).with_root(name("F#"));
        assert_eq!(
            chromatic(spelling),
            [
                "C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"
            ]
        );
    }

    #[test]
    fn root_keeps_unusual_spellings() {
        let spelling = Spelling::new(Accidentals::Sharps).with_root(name("Cb"));
        let b = PitchClass::new(11).unwrap();
        assert_eq!(spelling.spell(b), name("Cb"));
        let spelling = Spelling::new(Accidentals::Flats).with_root(name("Fx"));
        let g = PitchClass::new(7).unwrap();
        assert_eq!(spelling.spell(g), name("F##"));
        let c = PitchClass::new(0).unwrap();
        assert_eq!(spelling.spell(c), name("C"));
    }

    #[test]
    fn a_natural_root_changes_nothing() {
        let plain = Spelling::new(Accidentals::Flats);
        assert_eq!(chromatic(plain.with_root(name("E"))), chromatic(plain));
        assert_eq!(plain.with_root(name("E")).root(), Some(name("E")));
        assert_eq!(plain.accidentals(), Accidentals::Flats);
    }
}
