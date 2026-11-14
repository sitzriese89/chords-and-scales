import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings/schema';
import {
  fretboardPositions,
  getTuning,
  listTunings,
  parseNote,
  setUserTunings,
  type Tuning,
} from './theory';

const standard = (): Tuning => {
  const tuning = getTuning('guitar-6-standard');
  if (!tuning) throw new Error('no standard tuning');
  return tuning;
};

const E = 4;
const A = 9;

describe('tunings and fretboard mapping (WASM)', () => {
  afterEach(() => {
    setUserTunings('');
  });

  it('lists the built-in presets, lowest string first', () => {
    const tunings = listTunings();
    expect(tunings[0]).toEqual(standard());
    expect(getTuning('no-such-tuning')).toBeUndefined();
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

  it('merges user tunings and reports the bad items like user scales', () => {
    const report = setUserTunings(`
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

      [[tuning]]
      id = "guitar-4-mine"
      name = "Mine"
      kind = "guitar"
      notes = ["D3", "G3", "B3", "E4"]
    `);
    // Same shape as setUserScales: 0-based item, null when there is no id or no item.
    expect(report).toEqual({
      loaded: ['guitar-6-drop-d', 'guitar-4-mine'],
      errors: [{ item: 1, id: 'bass-3', message: expect.stringMatching(/^tuning 2.*3 strings/) }],
    });
    const tunings = listTunings();
    expect(getTuning('guitar-6-drop-d')?.name).toBe('My drop D');
    expect(tunings.findIndex((t) => t.id === 'guitar-6-drop-d')).toBe(1);
    expect(tunings.at(-1)?.id).toBe('guitar-4-mine');
    expect(getTuning('bass-3')).toBeUndefined();

    expect(setUserTunings('')).toEqual({ loaded: [], errors: [] });
    expect(getTuning('guitar-6-drop-d')?.name).toBe('Drop D');
    expect(getTuning('guitar-4-mine')).toBeUndefined();
  });

  it('reports a tunings file that is not TOML as a whole, without throwing', () => {
    setUserTunings(
      '[[tuning]]\nid = "guitar-4-mine"\nname = "M"\nkind = "guitar"\nnotes = ["D3", "G3", "B3", "E4"]\n',
    );
    const report = setUserTunings('[[tuning]');
    expect(report).toEqual({
      loaded: [],
      errors: [{ item: null, id: null, message: expect.stringMatching(/^not valid TOML/) }],
    });
    // The user tunings are gone; the built-ins stay.
    expect(getTuning('guitar-4-mine')).toBeUndefined();
    expect(getTuning('guitar-6-standard')).toBeDefined();
  });

  it('throws errors for invalid input', () => {
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
