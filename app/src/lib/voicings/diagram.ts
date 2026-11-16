/**
 * Where a chord diagram draws a voicing (ADR-37): which frets the window shows, what its top
 * edge is, and the x and y of every string and fret. Geometry only: the voicing, its frets and
 * its labels come from the core (`chordVoicings`, ADR-35).
 */
import type { ChordVoicing } from '../theory';

/** Fret rows a diagram shows at least. */
export const MIN_ROWS = 4;
/** Space between two strings. */
export const STRING_GAP = 18;
/** Height of one fret row. */
export const ROW_HEIGHT = 22;
/** Room left and right of the outer strings (the fret number sits there). */
export const SIDE = 24;
/** Room above the top edge for the muted and open markers. */
export const TOP = 26;
export const BOTTOM = 8;
/** Radius of a dot. */
export const DOT_RADIUS = 7.5;

/** What the diagram's top edge is. */
export type DiagramTop = 'nut' | 'capo' | 'fret';

export interface DiagramWindow {
  /** The fret of the first row (absolute, ADR-18). */
  firstFret: number;
  /** How many fret rows are drawn. */
  rows: number;
  /**
   * `nut`: the window starts at the nut. `capo`: it starts at the capo, which plays the nut's
   * part. `fret`: it starts higher up the neck.
   */
  top: DiagramTop;
  /** The fret number written beside the first row; `null` at the nut. */
  label: number | null;
}

/**
 * The fret window for `voicing` on a neck with a capo on `capo` (0 = none). A shape whose
 * fretted notes all lie within `MIN_ROWS` frets of the nut (or the capo) is drawn from there;
 * any other starts at its lowest fretted fret, numbered. Frets keep their numbers with a capo,
 * so the first row above the capo is numbered too.
 */
export function diagramWindow(voicing: ChordVoicing, capo = 0): DiagramWindow {
  const fretted = voicing.strings.flatMap((s) => (s !== null && s.fret > capo ? [s.fret] : []));
  const lowest = fretted.length > 0 ? Math.min(...fretted) : capo + 1;
  const highest = fretted.length > 0 ? Math.max(...fretted) : capo + 1;
  if (highest <= capo + MIN_ROWS) {
    return {
      firstFret: capo + 1,
      rows: MIN_ROWS,
      top: capo === 0 ? 'nut' : 'capo',
      label: capo === 0 ? null : capo + 1,
    };
  }
  return {
    firstFret: lowest,
    rows: Math.max(MIN_ROWS, highest - lowest + 1),
    top: 'fret',
    label: lowest,
  };
}

/** The size of a diagram for `strings` strings and `rows` fret rows. */
export function diagramSize(strings: number, rows: number): { width: number; height: number } {
  return {
    width: 2 * SIDE + (strings - 1) * STRING_GAP,
    height: TOP + rows * ROW_HEIGHT + BOTTOM,
  };
}

/**
 * The x of a string, by its index in the voicing (0 = the lowest string). Right-handed the
 * lowest string is on the left, as chord books draw it; left-handed the diagram is mirrored.
 */
export function stringX(index: number, strings: number, leftHanded: boolean): number {
  const column = leftHanded ? strings - 1 - index : index;
  return SIDE + column * STRING_GAP;
}

/** The y of the middle of a fret's row. */
export function fretY(fret: number, window: DiagramWindow): number {
  return TOP + (fret - window.firstFret + 0.5) * ROW_HEIGHT;
}

/** A voicing's index in `strings` for a fretboard string number (1 = the highest). */
export function stringIndex(string: number, strings: number): number {
  return strings - string;
}

/**
 * A shape as players write it, lowest string first: `x32010`; with a fret of 10 or more,
 * spaced: `x 10 12 12 11 x`.
 */
export function shapeText(voicing: ChordVoicing): string {
  const parts = voicing.strings.map((s) => (s === null ? 'x' : String(s.fret)));
  return parts.join(parts.some((p) => p.length > 1) ? ' ' : '');
}
