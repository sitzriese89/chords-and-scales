// The theory core, compiled to WASM from crates/theory-wasm by `pnpm wasm` (ADR-2, ADR-14).
// Components import theory functions from here, never from ./wasm directly.
import init from './wasm/theory_wasm.js';

export { version } from './wasm/theory_wasm.js';

// Notes and intervals (crates/theory-wasm/src/notes.rs). Inputs accept ASCII and Unicode
// (`Db`, `D♭`); outputs are Unicode, for display. Invalid input throws an Error.
export type { Accidentals } from './wasm/theory_wasm.js';
export {
  formatInterval,
  formatNote,
  formatNoteName,
  intervalLabel,
  intervalSemitones,
  parseNote,
  pitchClassOf,
  spellPitchClass,
} from './wasm/theory_wasm.js';

// User catalog files (crates/theory-wasm/src/user_files.rs, ADR-23). Scales and tunings load
// the same way: `setUserScales(toml)` / `setUserTunings(toml)` replace the user items in the
// current catalog and return a UserFileReport (0-based `item`, null for the whole file; a bad
// file never throws). Call them at start and after each change to the user file.
export type { UserFileError, UserFileReport } from './wasm/theory_wasm.js';

// Scale catalog (crates/theory-wasm/src/scales.rs): the built-ins, with the user scales last
// passed to setUserScales merged over them. Intervals and note names are Unicode.
export type { ScaleFamily, ScaleInfo, ScaleNote } from './wasm/theory_wasm.js';
export { getScale, listScales, scaleNotes, setUserScales } from './wasm/theory_wasm.js';

// Tunings and the fretboard mapping (crates/theory-wasm/src/fretboard.rs): the built-ins,
// with the user tunings last passed to setUserTunings on top. Tunings list MIDI notes lowest
// string first; positions use the fretboard's coordinates (string 1 = highest, absolute
// frets, ADR-18), so they pass straight to the Fretboard component.
export type { NotePosition, Tuning } from './wasm/theory_wasm.js';
export { fretboardPositions, getTuning, listTunings, setUserTunings } from './wasm/theory_wasm.js';

let ready: Promise<void> | undefined;

/**
 * Loads the WASM module. Call once before using any theory function; later calls return the
 * same promise. In the browser and in Tauri the module is fetched next to the bundle; tests
 * pass the module bytes instead.
 */
export function initTheory(wasm?: BufferSource): Promise<void> {
  ready ??= init(wasm ? { module_or_path: wasm } : undefined).then(() => undefined);
  return ready;
}
