//! WebAssembly bindings for the `theory` crate.
//!
//! A thin layer: one module per core area, no theory logic here (ADR-2). The app builds it
//! with `wasm-pack` (`pnpm --dir app wasm`, ADR-14).

mod fretboard;
mod meta;
mod notes;
mod positions;
mod scales;

pub use fretboard::{fretboard_positions, tuning_catalog};
pub use meta::version;
pub use notes::{
    Accidentals, format_interval, format_note, format_note_name, interval_label,
    interval_semitones, parse_note, pitch_class_of, spell_pitch_class,
};
pub use positions::{fret_window_positions, three_nps_patterns};
pub use scales::{get_scale, list_scales, scale_notes, set_user_scales};
