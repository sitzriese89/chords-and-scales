//! Pure music theory for Chords & Scales.
//!
//! No IO, no UI, no `wasm-bindgen`: everything here is testable with `cargo test` (ADR-2).
//! The frontend reaches it through the `theory-wasm` crate.

mod catalog_file;
pub mod chords;
pub mod formula;
pub mod fretboard;
pub mod harmonize;
pub mod lookup;
pub mod notes;
pub mod scale_positions;
pub mod scales;
pub mod tags;
pub mod tuning;
pub mod voicings;

pub use catalog_file::CatalogError;
pub use chords::{
    Chord, ChordCatalog, ChordError, ChordFamily, ChordNote, ChordSpec, ParsedChords,
    chord_interval_labels, parse_user_chords, write_chords,
};
pub use chords::{
    ChordSymbol, SymbolError, SymbolErrorKind, SymbolStyle, format_symbol, parse_symbol,
};
pub use formula::{Formula, FormulaError};
pub use fretboard::{FretboardError, Position, positions};
pub use harmonize::{
    HarmonizedChord, HarmonizedDegree, NumeralMark, NumeralSeventh, RomanNumeral, Stacking,
    harmonize,
};
pub use lookup::{ChordMatch, NoteSet, ScaleMatch, ScaleSearch, find_scales, lookup_chords};
pub use notes::{
    Accidental, Accidentals, Glyphs, Interval, Letter, Note, NoteName, ParseError, PitchClass,
    Spelling,
};
pub use scale_positions::{ThreeNpsPattern, fret_window, three_notes_per_string};
pub use scales::{
    CUSTOM_FAMILY, ParsedScales, Scale, ScaleCatalog, ScaleError, ScaleFamily, ScaleNote, Source,
    parse_user_scales, write_scales,
};
pub use tags::{Feature, Features, ItemKind, ParsedTagRules, TagRule, TagRuleError, TagRules};
pub use tuning::{
    InstrumentKind, ParsedTunings, Tuning, TuningCatalog, TuningError, TuningFileError,
    TuningItemError, builtin_tunings, parse_tunings, write_tunings,
};
pub use voicings::{Barre, VoicedNote, Voicing, VoicingError, VoicingOptions, voicings};

/// The version of the theory core, as set in the workspace `Cargo.toml`.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_major_minor_patch() {
        let parts: Vec<&str> = version().split('.').collect();
        assert_eq!(parts.len(), 3, "version {:?}", version());
        for part in parts {
            assert!(part.parse::<u32>().is_ok(), "version {:?}", version());
        }
    }
}
