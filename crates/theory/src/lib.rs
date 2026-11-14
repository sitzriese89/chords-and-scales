//! Pure music theory for Chords & Scales.
//!
//! No IO, no UI, no `wasm-bindgen`: everything here is testable with `cargo test` (ADR-2).
//! The frontend reaches it through the `theory-wasm` crate.

pub mod notes;

pub use notes::{
    Accidental, Accidentals, Glyphs, Interval, Letter, Note, NoteName, ParseError, PitchClass,
    Spelling,
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
