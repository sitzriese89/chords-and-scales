/**
 * The voicing browser's list (SPEC §5.6, ADR-37): the core's best shapes of the chosen chord on
 * the current instrument, under the constraints in the settings. Everything comes from the
 * core (`chordVoicings`, ADR-35); this only picks the arguments.
 */
import { instrumentTuning } from '../instrument/tuning';
import type { Settings } from '../settings';
import {
  chordNotes,
  chordVoicings,
  pitchClassOf,
  type ChordVoicing,
  type VoicedString,
} from '../theory';
import { shapeText } from './diagram';

type ListSettings = Pick<Settings, 'instrument' | 'voicings'>;

/** The chord to voice: its root as displayed and its catalog id. */
export interface VoicedChord {
  root: string;
  chordId: string;
}

/** The best shapes of `chord`, best first; the core's default of at most 50. */
export function voicingList(settings: ListSettings, chord: VoicedChord): ChordVoicing[] {
  const { instrument, voicings } = settings;
  return chordVoicings(
    instrumentTuning(instrument),
    instrument.frets,
    instrument.capo,
    chord.chordId,
    pitchClassOf(chord.root),
    {
      maxSpan: voicings.maxSpan,
      openStrings: voicings.openStrings,
      mutedStrings: voicings.mutedStrings,
      inversions: voicings.inversions,
    },
  );
}

/** Identifies a shape: its frets, lowest string first (`x,3,2,0,1,0`). */
export const shapeKey = (voicing: ChordVoicing): string => shapeText(voicing, ',');

/**
 * What a diagram's dots say for the label setting: the note's name (the chord's own spelling,
 * from the core), its interval in the chord, or nothing.
 */
export function dotLabeller(
  labels: Settings['labels'],
  chord: VoicedChord,
  accidentals: Settings['accidentals'],
): (note: VoicedString) => string {
  if (labels === 'intervals') return (note) => note.interval;
  if (labels === 'none') return () => '';
  const names = new Map(
    // The first spelling of a pitch class wins, as on the neck.
    chordNotes(chord.chordId, chord.root, accidentals)
      .map((n) => [n.pitchClass, n.name] as const)
      .reverse(),
  );
  return (note) => names.get(note.pitchClass) ?? '';
}
