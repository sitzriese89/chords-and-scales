/**
 * Where a chord diagram draws a voicing (ADR-37, ADR-49): which frets the window shows, what
 * its starting edge is, and the x of every fret and the y of every string. The diagram lies
 * like the neck: strings run across, the lowest at the bottom, the nut (or capo) on the left
 * and the frets counting up to the right; left-handed it is mirrored, the nut on the right.
 * Geometry only: the voicing, its frets and its labels come from the core (`chordVoicings`,
 * ADR-35).
 */
import type { ChordVoicing } from '../theory';

/** Fret columns a diagram shows at least. */
export const MIN_FRETS = 4;
/** Space between two strings. */
export const STRING_GAP = 18;
/** Width of one fret column. */
export const FRET_WIDTH = 24;
/** Room on the nut's side for the muted and open markers. */
export const NUT_SIDE = 22;
/** Room past the last fret. */
export const END_SIDE = 6;
/** Room above the highest string. */
export const TOP = 10;
/** Room below the lowest string, for the lowest fret's number. */
export const BOTTOM = 24;
/** Radius of a dot. */
export const DOT_RADIUS = 7.5;

/** What the diagram's starting edge (left, or right when left-handed) is. */
export type DiagramStart = 'nut' | 'capo' | 'fret';

export interface DiagramWindow {
  /** The fret of the first column (absolute, ADR-18). */
  firstFret: number;
  /** How many fret columns are drawn. */
  frets: number;
  /**
   * `nut`: the window starts at the nut. `capo`: it starts at the capo, which plays the nut's
   * part. `fret`: it starts higher up the neck.
   */
  start: DiagramStart;
  /** The fret number written under the first column; `null` at the nut. */
  label: number | null;
}

/**
 * The fret window for `voicing` on a neck with a capo on `capo` (0 = none). A shape whose
 * fretted notes all lie within `MIN_FRETS` frets of the nut (or the capo) is drawn from there;
 * any other starts at its lowest fretted fret, numbered. Frets keep their numbers with a capo,
 * so the first fret above the capo is numbered too.
 */
export function diagramWindow(voicing: ChordVoicing, capo = 0): DiagramWindow {
  const fretted = voicing.strings.flatMap((s) => (s !== null && s.fret > capo ? [s.fret] : []));
  const lowest = fretted.length > 0 ? Math.min(...fretted) : capo + 1;
  const highest = fretted.length > 0 ? Math.max(...fretted) : capo + 1;
  if (highest <= capo + MIN_FRETS) {
    return {
      firstFret: capo + 1,
      frets: MIN_FRETS,
      start: capo === 0 ? 'nut' : 'capo',
      label: capo === 0 ? null : capo + 1,
    };
  }
  return {
    firstFret: lowest,
    frets: Math.max(MIN_FRETS, highest - lowest + 1),
    start: 'fret',
    label: lowest,
  };
}

/** The size of a diagram for `strings` strings and `frets` fret columns. */
export function diagramSize(strings: number, frets: number): { width: number; height: number } {
  return {
    width: NUT_SIDE + frets * FRET_WIDTH + END_SIDE,
    height: TOP + (strings - 1) * STRING_GAP + BOTTOM,
  };
}

/**
 * The y of a string, by its index in the voicing (0 = the lowest string): the lowest string at
 * the bottom and the highest at the top, as the neck draws them. Not mirrored left-handed.
 */
export function stringY(index: number, strings: number): number {
  return TOP + (strings - 1 - index) * STRING_GAP;
}

/** Right-handed x to drawn x: left-handed the diagram is mirrored, the nut on the right. */
function mirror(x: number, window: DiagramWindow, leftHanded: boolean): number {
  return leftHanded ? diagramSize(1, window.frets).width - x : x;
}

/**
 * The x of the wire at the start of fret column `column` (0 = the nut, capo or first fret's
 * edge; `window.frets` = the far end).
 */
export function wireX(column: number, window: DiagramWindow, leftHanded: boolean): number {
  return mirror(NUT_SIDE + column * FRET_WIDTH, window, leftHanded);
}

/** The x of the middle of a fret's column. */
export function fretX(fret: number, window: DiagramWindow, leftHanded: boolean): number {
  return mirror(NUT_SIDE + (fret - window.firstFret + 0.5) * FRET_WIDTH, window, leftHanded);
}

/** The x of the muted and open markers: at the strings' end, beyond the starting edge. */
export function markerX(window: DiagramWindow, leftHanded: boolean): number {
  return mirror(NUT_SIDE / 2 - 1, window, leftHanded);
}

/** The y of the lowest fret's number: under the lowest string, below its column. */
export function labelY(strings: number): number {
  return stringY(0, strings) + DOT_RADIUS + 8;
}

/** A voicing's index in `strings` for a fretboard string number (1 = the highest). */
export function stringIndex(string: number, strings: number): number {
  return strings - string;
}

/**
 * A shape as players write it, lowest string first, `x` for a muted string: `x32010`; with a
 * fret of 10 or more, spaced: `x 10 12 12 11 x`. A `separator` joins the strings instead
 * (`x,3,2,0,1,0`). The voicing list names its shapes with it (their accessible names), and
 * the sheet titles a stored shape with it.
 */
export function shapeText(voicing: ChordVoicing, separator?: string): string {
  const parts = voicing.strings.map((s) => (s === null ? 'x' : String(s.fret)));
  return parts.join(separator ?? (parts.some((p) => p.length > 1) ? ' ' : ''));
}
