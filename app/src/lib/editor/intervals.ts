/**
 * The state of the interval-set editor (ADR-26, ADR-36): which semitones above the root are
 * chosen, and the label each one carries. Labels come from the core: the ones the edited item
 * already had (`♯4` stays `♯4`) or the label the picker offers for the width (`intervalLabel`
 * for scales, `chordIntervalLabels` for chords). Nothing here computes an interval; the editor
 * only looks them up.
 *
 * The picker is laid out in rows of one octave: a scale has one row, a chord two (`9`, `♯11`,
 * `13` sit above `2`, `♯4`, `6`). A column is one note on the neck, so at most one cell per
 * column is chosen, and a click on the neck toggles the note's column.
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

/** Cells per picker row: the 12 notes of an octave. */
export const COLUMNS = 12;

/** The semitones of one octave: the root (0) to the major seventh (11). */
export const SEMITONES = Array.from({ length: COLUMNS }, (_, n) => n);

/**
 * What the picker offers, per semitone from the root (0) up: the label a cell gets when it is
 * chosen, `null` where the picker offers no cell. Its length is the picker's span.
 */
export type Offered = readonly (string | null)[];

/** Per semitone of the span: the label shown when it is chosen, `null` when it is not. */
export type Chosen = (string | null)[];

/** The neck the editor draws, from the current instrument settings. */
export interface Neck {
  tuning: Tuning;
  frets: number;
  capo: number;
  leftHanded: boolean;
}

/** The default label of each semitone of one octave, by the core: `1 ♭2 2 ♭3 …`. */
export function defaultLabels(): string[] {
  return SEMITONES.map((n) => intervalLabel(n));
}

/** The picker column of a cell: the note on the neck, counted in semitones from the root. */
export function columnOf(semitones: number): number {
  return semitones % COLUMNS;
}

/** The semitones of each picker row for a span: `[[0 … 11], [12 … 23]]` for two octaves. */
export function rowsOf(span: number): number[][] {
  return Array.from({ length: Math.ceil(span / COLUMNS) }, (_, row) =>
    SEMITONES.map((n) => row * COLUMNS + n).filter((n) => n < span),
  );
}

/**
 * The choice for an item with `intervals` (labels, ASCII or Unicode) on a picker of `span`
 * semitones. The root is always chosen; labels the span doesn't reach are left out.
 */
export function chosenFrom(intervals: readonly string[], span = COLUMNS): Chosen {
  const chosen: Chosen = Array.from({ length: span }, () => null);
  for (const label of intervals) {
    const semitones = intervalSemitones(label);
    if (semitones < chosen.length) chosen[semitones] = formatInterval(label);
  }
  chosen[0] = intervalLabel(0);
  return chosen;
}

/**
 * `chosen` with the cell at `semitones` switched on (with its offered label) or off. Switching a
 * cell on switches off the other cells of its column. The root stays chosen, and a cell that
 * isn't offered can only be switched off.
 */
export function toggle(chosen: Chosen, semitones: number, labels: Offered): Chosen {
  if (semitones === 0) return chosen;
  if (chosen[semitones] !== null) {
    return chosen.map((label, n) => (n === semitones ? null : label));
  }
  const label = labels[semitones];
  if (label === null || label === undefined) return chosen;
  const column = columnOf(semitones);
  return chosen.map((old, n) =>
    n === semitones ? label : n !== 0 && columnOf(n) === column ? null : old,
  );
}

/**
 * `chosen` after a click on a note of `column` on the neck: the column's chosen cells off if
 * there are any, else its first offered cell on. The root's column changes nothing.
 */
export function toggleColumn(chosen: Chosen, column: number, labels: Offered): Chosen {
  if (column === 0) return chosen;
  const cells = chosen.map((_, n) => n).filter((n) => columnOf(n) === column);
  if (cells.some((n) => chosen[n] !== null)) {
    return chosen.map((label, n) => (columnOf(n) === column ? null : label));
  }
  const first = cells.find((n) => labels[n] !== null && labels[n] !== undefined);
  return first === undefined ? chosen : toggle(chosen, first, labels);
}

/** The chosen labels, root first, in ascending order. */
export function intervalsOf(chosen: Chosen): string[] {
  return chosen.filter((label): label is string => label !== null);
}

/** The chosen label in `column`, if any. */
function labelIn(chosen: Chosen, column: number): string | undefined {
  return chosen.find((label, n) => label !== null && columnOf(n) === column) ?? undefined;
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
    const label = labelIn(chosen, degree);
    if (label === undefined) return [];
    return [{ string, fret, label, degree, role: degree === 0 ? 'root' : 'tone' }];
  });
}
