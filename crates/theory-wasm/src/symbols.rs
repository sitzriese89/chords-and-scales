//! Chord symbols (`theory::chords::symbols`, SPEC §4.4, ADR-29).
//!
//! `parseChordSymbol` reads what the user typed against the current chord catalog (the
//! built-ins and the user chords, see `chords.rs`) and never throws: a result with `ok: false`
//! carries the position of the first character that could not be read, for typed input.
//! `formatChordSymbol` is the one place symbols are turned into display text. Note names in
//! results are Unicode, for display; inputs accept ASCII and Unicode.

use serde::Serialize;
use theory::{Chord, Glyphs, NoteName, format_symbol};
use wasm_bindgen::prelude::*;

use crate::chords::with_catalog;
use crate::user_files::to_js;

#[wasm_bindgen(typescript_custom_section)]
const TYPES: &'static str = r#"
/** The result of `parseChordSymbol`: the chord, or where the text could not be read. */
export type ChordSymbolResult =
  | {
      ok: true;
      /** The root as typed, Unicode: `D♭`. */
      root: string;
      /** The id of the catalog chord: `min7b5`. */
      chordId: string;
      /** The bass of a slash chord as typed, Unicode; absent without a slash. */
      bass?: string;
    }
  | {
      ok: false;
      /** 0-based index (in characters) of the first character that could not be read. */
      position: number;
      /** What is wrong, in a sentence. */
      message: string;
    };
"#;

/// How chord symbols are displayed.
#[wasm_bindgen]
#[derive(Clone, Copy)]
pub enum SymbolStyle {
    /// `Cmaj7`, `Cm7♭5`, `Cdim7`.
    Standard = "standard",
    /// `CΔ7`, `Cø`, `C°7`.
    Jazz = "jazz",
}

impl TryFrom<SymbolStyle> for theory::SymbolStyle {
    type Error = JsError;

    fn try_from(style: SymbolStyle) -> Result<Self, JsError> {
        match style {
            SymbolStyle::Standard => Ok(Self::Standard),
            SymbolStyle::Jazz => Ok(Self::Jazz),
            // Any other string from untyped JS.
            SymbolStyle::__Invalid => Err(JsError::new("style must be \"standard\" or \"jazz\"")),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SymbolResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    chord_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    bass: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    position: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

/// Reads a chord symbol such as `Cmaj7`, `bbm7b5`, `F#ø`, `G7(b9)` or `Am6/9/E`. Never throws.
#[wasm_bindgen(js_name = parseChordSymbol, unchecked_return_type = "ChordSymbolResult")]
pub fn parse_chord_symbol(text: &str) -> Result<JsValue, JsError> {
    let result = match with_catalog(|catalog| catalog.parse_symbol(text)) {
        Ok(symbol) => SymbolResult {
            ok: true,
            root: Some(symbol.root.format(Glyphs::Unicode)),
            chord_id: Some(symbol.chord_id),
            bass: symbol.bass.map(|bass| bass.format(Glyphs::Unicode)),
            position: None,
            message: None,
        },
        Err(error) => SymbolResult {
            ok: false,
            root: None,
            chord_id: None,
            bass: None,
            position: Some(error.position()),
            message: Some(error.message()),
        },
    };
    to_js(&result)
}

/// The display text of chord `chordId` on `root` (a note name, keeping its spelling) with an
/// optional `bass` note name, printed as given: `Cm7♭5`, `CΔ7`, `E♭m7♭5/B♭`.
#[wasm_bindgen(js_name = formatChordSymbol)]
pub fn format_chord_symbol(
    root: &str,
    chord_id: &str,
    bass: Option<String>,
    style: SymbolStyle,
) -> Result<String, JsError> {
    let root: NoteName = root.parse()?;
    let bass: Option<NoteName> = bass.map(|bass| bass.parse()).transpose()?;
    let style = style.try_into()?;
    with_catalog(|catalog| {
        let chord: &Chord = catalog
            .get(chord_id)
            .ok_or_else(|| JsError::new(&format!("no chord with id {chord_id:?}")))?;
        Ok(format_symbol(root, chord, bass, style))
    })
}
