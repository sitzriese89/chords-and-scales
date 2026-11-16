// The theory core, compiled to WASM from crates/theory-wasm by `pnpm wasm` (ADR-2, ADR-14).
// Components import theory functions from here, never from ./wasm directly.
import init from './wasm/theory_wasm.js';

export { version } from './wasm/theory_wasm.js';

// Notes and intervals (crates/theory-wasm/src/notes.rs). Inputs accept ASCII and Unicode
// (`Db`, `D♭`); outputs are Unicode, for display. Invalid input throws an Error.
export type { Accidentals, NoteParts } from './wasm/theory_wasm.js';
export {
  formatInterval,
  formatNote,
  formatNoteName,
  intervalLabel,
  intervalSemitones,
  noteFromParts,
  noteParts,
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
// `writeScales` turns user scales into the text of `scales.toml` (checked by the core, which
// also refuses a duplicate id or name) and `newScaleId` makes the id of a new one (ADR-26).
export type { ScaleFamily, ScaleInfo, ScaleInput, ScaleNote } from './wasm/theory_wasm.js';
export {
  getScale,
  listScales,
  newScaleId,
  scaleNotes,
  setUserScales,
  writeScales,
} from './wasm/theory_wasm.js';

// Chord catalog (crates/theory-wasm/src/chords.rs): the built-ins, with the user chords last
// passed to setUserChords merged over them, same report as scales. Intervals and note names are
// Unicode; the suffixes (`symbol`, `aliases`, `jazzSymbol`) are stored as written, ASCII.
export type { ChordFamily, ChordInfo, ChordNote } from './wasm/theory_wasm.js';
export { chordNotes, getChord, listChords, setUserChords } from './wasm/theory_wasm.js';

// Chord symbols (crates/theory-wasm/src/symbols.rs, SPEC §4.4): `parseChordSymbol` reads typed
// text against the current chord catalog and never throws (`ok: false` carries the position of
// the first unreadable character); `formatChordSymbol` is the one place symbols become display
// text, in the 'standard' or 'jazz' style. Bass notes are printed as given.
export type { ChordSymbolResult, SymbolStyle } from './wasm/theory_wasm.js';
export { formatChordSymbol, parseChordSymbol } from './wasm/theory_wasm.js';

// Harmonize (crates/theory-wasm/src/harmonize.rs): the chord on every degree of a scale, from
// the current scale and chord catalogs. Returns the spelled root, the catalog chord id (null
// where no chord forms), the stacked tones and the Roman numeral in parts. Chord symbols are
// written from the chord id (M2.2), not here.
export type {
  HarmonizedChord,
  HarmonizedDegree,
  RomanNumeralParts,
  Stacking,
} from './wasm/theory_wasm.js';
export { harmonizeScale } from './wasm/theory_wasm.js';

// Reverse lookup and the scale finder (crates/theory-wasm/src/lookup.rs, ADR-31): clicked
// pitch classes (0 … 11) plus an optional bass note give ranked chords (slash chords and
// omitted 5ths included) and the scales/modes that contain them. They search the current
// chord and scale catalogs, user items included. Results hold ids, spelled names and the
// numbers the ranking used, not display strings: chord symbols come from the symbol formatter.
export type { ChordLookupMatch, ScaleLookupMatch } from './wasm/theory_wasm.js';
export { findScales, lookupChords } from './wasm/theory_wasm.js';

// Tunings and the fretboard mapping (crates/theory-wasm/src/fretboard.rs): the built-ins,
// with the user tunings last passed to setUserTunings on top. Tunings list MIDI notes lowest
// string first; positions use the fretboard's coordinates (string 1 = highest, absolute
// frets, ADR-18), so they pass straight to the Fretboard component. `writeTunings` turns
// tunings into the text of `tunings.toml` (checked by the core) and `newTuningId` makes the id
// of a new user tuning (ADR-24).
export type { NotePosition, Tuning } from './wasm/theory_wasm.js';
export {
  fretboardPositions,
  getTuning,
  listTunings,
  newTuningId,
  setUserTunings,
  writeTunings,
} from './wasm/theory_wasm.js';

// Scale positions (crates/theory-wasm/src/positions.rs): a fret window and 3-notes-per-string
// patterns, for a tuning and a scale given as pitch classes plus root. Positions use the
// fretboard's coordinates and come in tab order: lowest string first, then by fret.
export type { ScalePattern } from './wasm/theory_wasm.js';
export { fretWindow, threeNotesPerString } from './wasm/theory_wasm.js';

// Chord voicings (crates/theory-wasm/src/voicings.rs, ADR-34): playable shapes of a catalog
// chord on any tuning, best first. Takes the neck as fretboardPositions does plus a chord id
// and root pitch class; `strings` come lowest string first (`x32010`), null for a muted one.
export type {
  ChordVoicing,
  VoicedString,
  VoicingBarre,
  VoicingOptions,
} from './wasm/theory_wasm.js';
export { chordVoicings } from './wasm/theory_wasm.js';

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
