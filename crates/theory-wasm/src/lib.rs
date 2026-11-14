//! WebAssembly bindings for the `theory` crate.
//!
//! A thin layer: one module per core area, no theory logic here (ADR-2). The app builds it
//! with `wasm-pack` (`pnpm --dir app wasm`, ADR-14).

mod meta;
mod notes;

pub use meta::version;
pub use notes::{
    Accidentals, format_interval, format_note, format_note_name, interval_label,
    interval_semitones, parse_note, pitch_class_of, spell_pitch_class,
};
