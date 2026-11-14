import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings/schema';
import { fretboardPositions, parseNote, type Tuning, tuningCatalog } from './theory';

const standard = (): Tuning => {
  const tuning = tuningCatalog().tunings.find((t) => t.id === 'guitar-6-standard');
  if (!tuning) throw new Error('no standard tuning');
  return tuning;
};

const E = 4;
const A = 9;

describe('tunings and fretboard mapping (WASM)', () => {
  it('lists the built-in presets, lowest string first', () => {
    const { tunings, errors } = tuningCatalog();
    expect(errors).toEqual([]);
    expect(standard()).toEqual({
      id: 'guitar-6-standard',
      name: 'Standard',
      kind: 'guitar',
      notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'].map(parseNote),
    });
    // The default tuning in settings.toml exists.
    expect(tunings.map((t) => t.id)).toContain(DEFAULT_SETTINGS.instrument.tuning);
    const counts = new Set(tunings.map((t) => t.notes.length));
    expect([...counts].sort()).toEqual([4, 5, 6, 7, 8, 9]);
  });

  it('maps notes in the fretboard component’s coordinates', () => {
    const lowE = fretboardPositions(standard(), 24, 0, [E], E).filter((p) => p.string === 6);
    expect(lowE.map((p) => p.fret)).toEqual([0, 12, 24]);
    expect(lowE[0]).toEqual({
      string: 6,
      fret: 0,
      midi: parseNote('E2'),
      pitchClass: E,
      degree: 0,
      interval: '1',
    });

    const a = fretboardPositions(standard(), 24, 0, [A], E);
    expect(a.find((p) => p.string === 6)).toMatchObject({ fret: 5, degree: 5, interval: '4' });
    expect(fretboardPositions(standard(), 24, 0, [3], 0)[0]?.interval).toBe('♭3');
  });

  it('leaves out frets below the capo', () => {
    const all = Array.from({ length: 12 }, (_, pc) => pc);
    const open = fretboardPositions(standard(), 24, 0, all, E);
    const capo = fretboardPositions(standard(), 24, 2, all, E);
    expect(capo).toEqual(open.filter((p) => p.fret >= 2));
    expect(Math.min(...capo.map((p) => p.fret))).toBe(2);
  });

  it('merges user tunings and reports the bad items', () => {
    const { tunings, errors } = tuningCatalog(`
      [[tuning]]
      id = "guitar-6-drop-d"
      name = "My drop D"
      kind = "guitar"
      notes = ["D2", "A2", "D3", "G3", "B3", "D4"]

      [[tuning]]
      id = "bass-3"
      name = "Three"
      kind = "bass"
      notes = ["E1", "A1", "D2"]
    `);
    expect(tunings.find((t) => t.id === 'guitar-6-drop-d')?.name).toBe('My drop D');
    expect(tunings.some((t) => t.id === 'bass-3')).toBe(false);
    expect(errors).toEqual([
      { number: 2, id: 'bass-3', message: expect.stringMatching(/tuning 2.*3 strings/) },
    ]);
  });

  it('throws errors for invalid input', () => {
    expect(() => tuningCatalog('[[tuning]')).toThrow(/not valid TOML/);
    expect(() => fretboardPositions(standard(), 11, 0, [E], E)).toThrow(/12 to 27 frets/);
    expect(() => fretboardPositions(standard(), 24, 24, [E], E)).toThrow(/below the last fret/);
    expect(() => fretboardPositions(standard(), 24, 0, [12], E)).toThrow(/not a pitch class/);
    expect(() => fretboardPositions(standard(), 24, 0, [E], -1)).toThrow();
    expect(() => fretboardPositions({ ...standard(), notes: [40, 45, 50] }, 24, 0, [E], E)).toThrow(
      /3 strings/,
    );
    expect(() =>
      fretboardPositions({ ...standard(), kind: 'banjo' as 'guitar' }, 24, 0, [E], E),
    ).toThrow(/guitar.*bass/);
    // The module keeps working after an error.
    expect(fretboardPositions(standard(), 24, 0, [E], E)).toHaveLength(14);
  });
});
