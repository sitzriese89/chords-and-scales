/**
 * What the Chords page shows about the chosen chord: its name, its notes and the pitches its
 * strum plays. Everything comes from the core (`chordNotes`, the fretboard mapping, the
 * voicing generator).
 */
import { instrumentTuning } from '../instrument/tuning';
import type { Settings } from '../settings';
import { chordNotes, fretboardPositions, type ChordNote, type ChordVoicing } from '../theory';
import { chordSymbol } from './display';
import { shapePitches, strumPitches } from './strum';
import type { ActiveChord } from './state.svelte';

export interface ChordView {
  /** The chord as written, in the display style: `G7`, `CΔ7`, `Am7/E`. */
  symbol: string;
  /** The catalog name: `Dominant seventh`. */
  name: string;
  /** The chord's notes in formula order. */
  notes: ChordNote[];
  /** The pitches to strum, lowest string first, as MIDI numbers; empty if the neck has none. */
  strum: number[];
}

type ViewSettings = Pick<Settings, 'accidentals' | 'instrument' | 'chordSymbols'>;

/**
 * The Chords page's view of `active`. With a `voicing` chosen in the voicing browser (ADR-37), the
 * strum plays that shape; without, the chord stacked up from its lowest root (ADR-32).
 */
export function chordView(
  settings: ViewSettings,
  active: ActiveChord,
  voicing: ChordVoicing | null = null,
): ChordView {
  const { chord, root } = active;
  const notes = chordNotes(chord.id, root, settings.accidentals);
  return {
    symbol: chordSymbol(root, chord, settings.chordSymbols, active.bass),
    name: chord.name,
    notes,
    strum: voicing ? shapePitches(voicing) : stackedStrum(settings, notes),
  };
}

/** The chord stacked up from its lowest root on the neck (`strumPitches`). */
function stackedStrum(settings: ViewSettings, notes: ChordNote[]): number[] {
  const tuning = instrumentTuning(settings.instrument);
  const pitchClasses = [...new Set(notes.map((note) => note.pitchClass))];
  const positions = fretboardPositions(
    tuning,
    settings.instrument.frets,
    settings.instrument.capo,
    pitchClasses,
    notes[0].pitchClass,
  );
  return strumPitches(
    positions,
    notes.map((note) => note.pitchClass),
  );
}
