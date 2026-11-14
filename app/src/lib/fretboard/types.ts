/**
 * A position on the neck.
 *
 * - `string`: 1-based. String 1 is the highest-pitched string and is drawn at the top; the
 *   lowest-pitched string has the highest number.
 * - `fret`: the absolute fret on the neck. 0 is the open string; with a capo on fret 2 the
 *   lowest playable position is fret 2.
 */
export interface FretPosition {
  string: number;
  fret: number;
}

/**
 * How a dot is drawn.
 *
 * - `root`: the root, drawn as a square (shape, not only colour, sets it apart).
 * - `tone`: any other note, drawn as a circle.
 * - `dim`: a de-emphasized note, drawn as a smaller circle in the dim colour (for example the
 *   scale behind a chord overlay).
 */
export type DotRole = 'root' | 'tone' | 'dim';

/** A note to show on the fretboard. Everything in it is computed by the caller. */
export interface FretboardDot extends FretPosition {
  /** Visible text, already computed by the core (a note name, an interval or ''). */
  label: string;
  role: DotRole;
  /**
   * Semitones above the root, 0–11 (0 = root, 3 = minor third, 7 = fifth). Picks the
   * `--degree-<n>` colour when the fretboard colours by degree.
   */
  degree: number;
}
