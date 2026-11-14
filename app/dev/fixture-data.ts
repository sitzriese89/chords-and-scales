// Hand-written sample data for the fretboard fixture page: A minor pentatonic (A C D E G) on
// standard tunings for 4–9 strings, frets 0–27. Static data, not computed: the frontend does
// no music theory, and the real app gets its dots from the core.

import type { DotRole, FretboardDot } from '../src/lib/fretboard';

/** Pentatonic notes on each open string as [fret, degree], degree = semitones above A. */
// prettier-ignore
const ROWS: Record<string, [number, number][]> = {
  E: [[0, 7], [3, 10], [5, 0], [8, 3], [10, 5], [12, 7], [15, 10], [17, 0], [20, 3], [22, 5], [24, 7], [27, 10]],
  B: [[1, 3], [3, 5], [5, 7], [8, 10], [10, 0], [13, 3], [15, 5], [17, 7], [20, 10], [22, 0], [25, 3], [27, 5]],
  G: [[0, 10], [2, 0], [5, 3], [7, 5], [9, 7], [12, 10], [14, 0], [17, 3], [19, 5], [21, 7], [24, 10], [26, 0]],
  D: [[0, 5], [2, 7], [5, 10], [7, 0], [10, 3], [12, 5], [14, 7], [17, 10], [19, 0], [22, 3], [24, 5], [26, 7]],
  A: [[0, 0], [3, 3], [5, 5], [7, 7], [10, 10], [12, 0], [15, 3], [17, 5], [19, 7], [22, 10], [24, 0], [27, 3]],
  'F#': [[1, 10], [3, 0], [6, 3], [8, 5], [10, 7], [13, 10], [15, 0], [18, 3], [20, 5], [22, 7], [25, 10], [27, 0]],
  'C#': [[1, 5], [3, 7], [6, 10], [8, 0], [11, 3], [13, 5], [15, 7], [18, 10], [20, 0], [23, 3], [25, 5], [27, 7]],
};

/** Open strings from string 1 (highest) down. */
export const TUNINGS: Record<number, string[]> = {
  4: ['G', 'D', 'A', 'E'],
  5: ['G', 'D', 'A', 'E', 'B'],
  6: ['E', 'B', 'G', 'D', 'A', 'E'],
  7: ['E', 'B', 'G', 'D', 'A', 'E', 'B'],
  8: ['E', 'B', 'G', 'D', 'A', 'E', 'B', 'F#'],
  9: ['E', 'B', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'],
};

const NAMES: Record<number, string> = { 0: 'A', 3: 'C', 5: 'D', 7: 'E', 10: 'G' };
const INTERVALS: Record<number, string> = { 0: '1', 3: '♭3', 5: '4', 7: '5', 10: '♭7' };
/** Degrees of the A minor triad, for the chord-over-scale overlay. */
const CHORD = [0, 3, 7];

export type LabelMode = 'names' | 'intervals' | 'none';

export function fixtureDots(strings: number, labels: LabelMode, overlay: boolean): FretboardDot[] {
  return (TUNINGS[strings] ?? TUNINGS[6]).flatMap((open, i) =>
    ROWS[open].map(([fret, degree]) => {
      let role: DotRole = degree === 0 ? 'root' : 'tone';
      if (overlay && !CHORD.includes(degree)) role = 'dim';
      const label =
        labels === 'names' ? NAMES[degree] : labels === 'intervals' ? INTERVALS[degree] : '';
      return { string: i + 1, fret, label, role, degree };
    }),
  );
}
