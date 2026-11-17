/**
 * Reverse lookup on the fretboard (SPEC §5.3 input mode 3, §5.4, ADR-38): the notes selected on
 * the neck, what the core finds for them, and what the editors are handed to save them. Nothing
 * here is theory: the notes, their pitches and their intervals above the bass come from the
 * core's fretboard mapping, the chords and scales from `lookupChords` and `findScales`, and the
 * chord names from the symbol formatter.
 */
import { chordSymbol } from '../chords/display';
import { positionKey } from '../explorer/view';
import type { FretboardDot, FretPosition } from '../fretboard';
import type { Settings } from '../settings';
import {
  chordIntervalLabels,
  findScales,
  formatNote,
  fretboardPositions,
  getChord,
  getScale,
  lookupChords,
  spellPitchClass,
  type Tuning,
} from '../theory';

/** The neck the selection is on: the explorer's instrument. */
export interface LookupNeck {
  tuning: Tuning;
  frets: number;
  capo: number;
}

/** A selected position and its note, as the core reports it. */
export interface SelectedNote extends FretPosition {
  /** The sounding pitch, a MIDI number. */
  midi: number;
  pitchClass: number;
  /** The note's name, by the sharp/flat setting: `C♯`. */
  name: string;
  /** The name with its octave: `C♯4`. */
  pitch: string;
  /** Semitones above the bass (the lowest selected note), 0–11. */
  degree: number;
  /** The interval above the bass, the core's default label: `1`, `♭3`, `5`. */
  interval: string;
}

/** A chord the selected notes make. */
export interface ChordResult {
  key: string;
  /** The chord's name in the display style: `A`, `C/E`, `Am7`. */
  symbol: string;
  /** The catalog name, the bass's degree and what is left out: `Major, 3 in the bass`. */
  description: string;
  root: string;
  chordId: string;
  bass: string | null;
}

/** A scale or mode that has every selected note. */
export interface ScaleResult {
  key: string;
  /** Root and scale: `A Mixolydian`. */
  name: string;
  root: string;
  scaleId: string;
  /** How many of the scale's notes are not selected. */
  extra: number;
}

/** What the core finds for the selection: chords and scales, best first. */
export interface LookupResults {
  chords: ChordResult[];
  scales: ScaleResult[];
}

/** How many scales are listed (the core's default is 24; the top of the list is what helps). */
export const SCALE_LIMIT = 12;

/** Every pitch class, to place every note of the neck. */
const ALL_PITCH_CLASSES = Array.from({ length: 12 }, (_, pc) => pc);

/**
 * The selected positions that are on the neck, lowest pitch first: the first is the bass. Pitches
 * and intervals come from the core's fretboard mapping, so a re-entrant tuning or a capo is no
 * special case. Of two positions with one pitch, the one on the lower string comes first.
 */
export function selectedNotes(
  neck: LookupNeck,
  positions: readonly FretPosition[],
  accidentals: Settings['accidentals'],
): SelectedNote[] {
  const wanted = new Set(positions.map(positionKey));
  const placed = (rootPitchClass: number) =>
    fretboardPositions(
      neck.tuning,
      neck.frets,
      neck.capo,
      ALL_PITCH_CLASSES,
      rootPitchClass,
    ).filter((p) => wanted.has(positionKey(p)));
  const found = placed(0).sort((a, b) => a.midi - b.midi || b.string - a.string);
  if (found.length === 0) return [];
  const aboveBass = new Map(placed(found[0].pitchClass).map((p) => [positionKey(p), p]));
  return found.map((p) => {
    const fromBass = aboveBass.get(positionKey(p))!;
    return {
      string: p.string,
      fret: p.fret,
      midi: p.midi,
      pitchClass: p.pitchClass,
      name: spellPitchClass(p.pitchClass, accidentals),
      pitch: formatNote(p.midi, accidentals),
      degree: fromBass.degree,
      interval: fromBass.interval,
    };
  });
}

/** The different pitch classes of the selection, bass first. */
export function pitchClassesOf(notes: readonly SelectedNote[]): number[] {
  return [...new Set(notes.map((note) => note.pitchClass))];
}

/**
 * The chords and scales for the selected notes, with the lowest as the bass. Fewer than two
 * different notes find nothing: no chord has one note, and every scale has any one note.
 */
export function lookupResults(
  notes: readonly SelectedNote[],
  settings: Pick<Settings, 'accidentals' | 'chordSymbols'>,
): LookupResults {
  const pitchClasses = pitchClassesOf(notes);
  if (pitchClasses.length < 2) return { chords: [], scales: [] };
  const bass = notes[0].pitchClass;
  const { accidentals, chordSymbols } = settings;

  const chords = lookupChords(pitchClasses, bass, accidentals).flatMap((m): ChordResult[] => {
    const chord = getChord(m.chordId);
    if (!chord) return [];
    const details = [chord.name];
    if (m.bass && m.bassInterval) details.push(`${m.bassInterval} in the bass`);
    if (m.omitted.length > 0) details.push(`without ${m.omitted.join(' and ')}`);
    return [
      {
        key: `${m.chordId}:${m.rootPitchClass}:${m.bassPitchClass ?? ''}`,
        symbol: chordSymbol(m.root, chord, chordSymbols, m.bass ?? undefined),
        description: details.join(', '),
        root: m.root,
        chordId: m.chordId,
        bass: m.bass,
      },
    ];
  });

  const scales = findScales(pitchClasses, bass, accidentals, SCALE_LIMIT).flatMap(
    (m): ScaleResult[] => {
      const scale = getScale(m.scaleId);
      if (!scale) return [];
      return [
        {
          key: `${m.scaleId}:${m.rootPitchClass}`,
          name: `${m.root} ${scale.name}`,
          root: m.root,
          scaleId: m.scaleId,
          extra: m.extra,
        },
      ];
    },
  );
  return { chords, scales };
}

/**
 * What the editors are handed to save the selection as a scale or a chord (ADR-38): the bass as
 * the root, and every other selected note as its interval above it, within the octave, lowest
 * first. A scale gets the core's default labels (`♭6`), a chord the labels the chord editor
 * offers (`♯5`, from `chordIntervalLabels`). `undefined` with fewer than two different notes.
 */
export function selectionDraft(
  notes: readonly SelectedNote[],
  kind: 'scale' | 'chord',
): { root: string; intervals: string[] } | undefined {
  if (pitchClassesOf(notes).length < 2) return undefined;
  const byDegree = new Map(notes.map((note) => [note.degree, note.interval]));
  const offered = kind === 'chord' ? chordIntervalLabels() : [];
  const intervals = [...byDegree.keys()]
    .sort((a, b) => a - b)
    .map((degree) => offered[degree] ?? byDegree.get(degree)!);
  return { root: notes[0].name, intervals };
}

/**
 * The neck's dots with the selected notes on top: a selected position that already has a dot
 * keeps it; one that has none gets a dot named by its note (no label with labels off).
 */
export function withSelection(
  dots: readonly FretboardDot[],
  notes: readonly SelectedNote[],
  labels: Settings['labels'],
): FretboardDot[] {
  const dotted = new Set(dots.map(positionKey));
  const added = notes
    .filter((note) => !dotted.has(positionKey(note)))
    .map((note): FretboardDot => ({
      string: note.string,
      fret: note.fret,
      label: labels === 'none' ? '' : note.name,
      role: 'tone',
      degree: note.degree,
    }));
  return [...dots, ...added];
}
