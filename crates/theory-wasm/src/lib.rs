//! WebAssembly bindings for the `theory` crate.
//!
//! A thin layer: one module per core area, no theory logic here (ADR-2). The app builds it
//! with `wasm-pack` (`pnpm --dir app wasm`, ADR-14).

mod chords;
mod fretboard;
mod harmonize;
mod lookup;
mod meta;
mod notes;
mod positions;
mod records;
mod scales;
mod symbols;
mod tags;
mod user_files;
mod voicings;

pub use chords::{
    chord_interval_labels_js, chord_notes, get_chord, list_chords, new_chord_id, set_user_chords,
    write_chords_toml,
};
pub use fretboard::{
    fretboard_positions, get_tuning, list_tunings, new_tuning_id, set_user_tunings,
    write_tunings_toml,
};
pub use harmonize::{Stacking, harmonize_scale};
pub use lookup::{find_scales_js, lookup_chords_js};
pub use meta::version;
pub use notes::{
    Accidentals, format_interval, format_note, format_note_name, interval_label,
    interval_semitones, note_from_parts, note_parts, parse_note, pitch_class_of, spell_pitch_class,
};
pub use positions::{fret_window_positions, three_nps_patterns};
pub use scales::{
    get_scale, list_scales, new_scale_id, scale_notes, set_user_scales, write_scales_toml,
};
pub use symbols::{SymbolStyle, format_chord_symbol, parse_chord_symbol};
pub use tags::{chord_tags, list_tags, scale_tags, set_user_tag_rules};
pub use voicings::chord_voicings;
