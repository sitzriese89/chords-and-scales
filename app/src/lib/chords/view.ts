/**
 * What the chord panel shows about the chosen chord: its name, its notes and the pitches its
 * strum plays. Everything comes from the core (`chordNotes`, the fretboard mapping).
 */
import type { Settings } from '../settings';
import { DEFAULT_SETTINGS } from '../settings';
import { chordNotes, fretboardPositions, getTuning, type ChordNote } from '../theory';
import { chordSymbol } from './display';
import { strumPitches } from './strum';
import type { ActiveChord } from './state.svelte';

export interface ChordPanelView {
  /** The chord as written: `G7`. */
  symbol: string;
  /** The catalog name: `Dominant seventh`. */
  name: string;
  /** The chord's notes in formula order. */
  notes: ChordNote[];
  /** The pitches to strum, lowest string first, as MIDI numbers; empty if the neck has none. */
  strum: number[];
}

type ViewSettings = Pick<Settings, 'accidentals' | 'instrument'>;

export function chordPanelView(settings: ViewSettings, active: ActiveChord): ChordPanelView {
  const { chord, root } = active;
  const notes = chordNotes(chord.id, root, settings.accidentals);

  const tuning =
    getTuning(settings.instrument.tuning) ?? getTuning(DEFAULT_SETTINGS.instrument.tuning)!;
  const pitchClasses = [...new Set(notes.map((note) => note.pitchClass))];
  const positions = fretboardPositions(
    tuning,
    settings.instrument.frets,
    settings.instrument.capo,
    pitchClasses,
    notes[0].pitchClass,
  );
  return {
    symbol: chordSymbol(root, chord),
    name: chord.name,
    notes,
    strum: strumPitches(
      positions,
      notes.map((note) => note.pitchClass),
    ),
  };
}
