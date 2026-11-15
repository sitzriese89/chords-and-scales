/**
 * The state of the interval-set editor (ADR-26): which of the 12 semitones above the root are
 * chosen, and the label each one carries. Labels come from the core: the ones the edited item
 * already had (`♯4` stays `♯4`) or the default label for the width (`intervalLabel`). Nothing
 * here computes an interval; the editor only looks them up.
 */
import type { FretboardDot, FretPosition } from '../fretboard';
import {
  fretboardPositions,
  formatInterval,
  intervalLabel,
  intervalSemitones,
  type Tuning,
} from '../theory';

/** What the editor edits and saves. `intervals` are labels from the root, `1` first. */
export interface IntervalSetDraft {
  name: string;
  /** Blank for the default family. */
  family: string;
  intervals: string[];
}

/** The semitones the picker offers: the root (0) to the major seventh (11). */
export const SEMITONES = Array.from({ length: 12 }, (_, n) => n);

/** Per semitone 0–11: the label shown when it is chosen, `null` when it is not. */
export type Chosen = (string | null)[];

/** The neck the editor draws, from the current instrument settings. */
export interface Neck {
  tuning: Tuning;
  frets: number;
  capo: number;
  leftHanded: boolean;
}

/** The default label of each semitone, by the core: `1 ♭2 2 ♭3 …`. */
export function defaultLabels(): string[] {
  return SEMITONES.map((n) => intervalLabel(n));
}

/**
 * The choice for an item with `intervals` (labels, ASCII or Unicode). The root is always
 * chosen; labels beyond the octave are not offered by the picker and are left out.
 */
export function chosenFrom(intervals: readonly string[]): Chosen {
  const chosen: Chosen = SEMITONES.map(() => null);
  for (const label of intervals) {
    const semitones = intervalSemitones(label);
    if (semitones < chosen.length) chosen[semitones] = formatInterval(label);
  }
  chosen[0] = intervalLabel(0);
  return chosen;
}

/** `chosen` with `semitones` switched on (default label) or off. The root stays chosen. */
export function toggle(chosen: Chosen, semitones: number, labels: readonly string[]): Chosen {
  if (semitones === 0) return chosen;
  return chosen.map((label, n) => (n !== semitones ? label : label === null ? labels[n] : null));
}

/** The chosen labels, root first, in ascending order. */
export function intervalsOf(chosen: Chosen): string[] {
  return chosen.filter((label): label is string => label !== null);
}

/** A playable position and its semitones above the root (0–11), as the core reports them. */
export interface NeckNote extends FretPosition {
  degree: number;
}

/** Every playable position of `neck`, with its semitones above `rootPitchClass`. */
export function neckNotes(neck: Neck, rootPitchClass: number): NeckNote[] {
  return fretboardPositions(neck.tuning, neck.frets, neck.capo, SEMITONES, rootPitchClass).map(
    ({ string, fret, degree }) => ({ string, fret, degree }),
  );
}

/** The semitones above the root of the note at `position`, if it is on the neck. */
export function degreeAt(notes: readonly NeckNote[], position: FretPosition): number | undefined {
  return notes.find((n) => n.string === position.string && n.fret === position.fret)?.degree;
}

/** The dots of the chosen notes on the neck, labelled by interval; the root is a square. */
export function chosenDots(notes: readonly NeckNote[], chosen: Chosen): FretboardDot[] {
  return notes.flatMap(({ string, fret, degree }): FretboardDot[] => {
    const label = chosen[degree];
    if (label === null) return [];
    return [{ string, fret, label, degree, role: degree === 0 ? 'root' : 'tone' }];
  });
}
