//! Pure music theory for Chords & Scales.
//!
//! No IO, no UI, no `wasm-bindgen`: everything here is testable with `cargo test` (ADR-2).
//! The frontend reaches it through the `theory-wasm` crate.

pub mod formula;
pub mod fretboard;
pub mod notes;
pub mod scale_positions;
pub mod scales;
pub mod tuning;

pub use formula::{Formula, FormulaError};
pub use fretboard::{FretboardError, Position, positions};
pub use notes::{
    Accidental, Accidentals, Glyphs, Interval, Letter, Note, NoteName, ParseError, PitchClass,
    Spelling,
};
pub use scale_positions::{ThreeNpsPattern, fret_window, three_notes_per_string};
pub use scales::{
    CatalogError, ParsedScales, Scale, ScaleCatalog, ScaleFamily, ScaleNote, Source,
    parse_user_scales,
};
pub use tuning::{
    InstrumentKind, ParsedTunings, Tuning, TuningCatalog, TuningError, TuningFileError,
    TuningItemError, builtin_tunings, parse_tunings,
};

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
