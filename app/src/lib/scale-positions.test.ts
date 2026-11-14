import { describe, expect, it } from 'vitest';
import {
  fretboardPositions,
  fretWindow,
  scaleNotes,
  threeNotesPerString,
  type Tuning,
  tuningCatalog,
} from './theory';

const tuning = (id: string): Tuning => {
  const found = tuningCatalog().tunings.find((t) => t.id === id);
  if (!found) throw new Error(`no tuning ${id}`);
  return found;
};

const G = 7;
const gMajor = () => scaleNotes('major', 'G', 'sharps').map((note) => note.pitchClass);

describe('scale positions (WASM)', () => {
  it('gives a fret window in tab order', () => {
    const standard = tuning('guitar-6-standard');
    const window = fretWindow(standard, 24, 0, gMajor(), G, 2, 4);
    // The lowest string (6) first, then by fret.
    expect(window.slice(0, 4).map((p) => [p.string, p.fret])).toEqual([
      [6, 2],
      [6, 3],
      [6, 5],
      [5, 2],
    ]);
    expect(window[1]).toMatchObject({ string: 6, fret: 3, pitchClass: G, interval: '1' });
    // The same positions as the fretboard mapping, filtered to the window.
    const inWindow = fretboardPositions(standard, 24, 0, gMajor(), G).filter(
      (p) => p.fret >= 2 && p.fret < 6,
    );
    const key = (p: { string: number; fret: number }) => `${p.string}/${p.fret}`;
    expect(window.map(key).sort()).toEqual(inWindow.map(key).sort());
  });

  it('generates the 3-notes-per-string patterns', () => {
    const patterns = threeNotesPerString(tuning('guitar-6-standard'), 24, 0, gMajor(), G);
    expect(patterns.map((p) => p.degree)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const first = patterns[0]?.positions ?? [];
    expect(first).toHaveLength(18);
    expect(first.slice(0, 3).map((p) => [p.string, p.fret])).toEqual([
      [6, 3],
      [6, 5],
      [6, 7],
    ]);
    expect(first.slice(0, 3).map((p) => p.interval)).toEqual(['1', '2', '3']);
    const midi = first.map((p) => p.midi);
    expect(midi).toEqual([...midi].sort((a, b) => a - b));

    // On 12 frets the patterns from C and D don't fit and are left out.
    const short = threeNotesPerString(tuning('guitar-6-standard'), 12, 0, gMajor(), G);
    expect(short.map((p) => p.degree)).toEqual([0, 1, 2, 5, 6]);
  });

  it('throws on invalid input', () => {
    const standard = tuning('guitar-6-standard');
    expect(() => threeNotesPerString(standard, 30, 0, gMajor(), G)).toThrow(/frets/);
    expect(() => fretWindow(standard, 24, 0, [12], G, 0, 4)).toThrow(/not a pitch class/);
    expect(() => fretWindow(standard, 24, 0, gMajor(), G, 0, 300)).toThrow(/out of range/);
  });
});
