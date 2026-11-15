import { afterEach, describe, expect, it } from 'vitest';
import { getScale, listScales, newScaleId, scaleNotes, setUserScales, writeScales } from './theory';

const names = (id: string, root: string, accidentals: 'sharps' | 'flats' = 'sharps') =>
  scaleNotes(id, root, accidentals)
    .map((note) => note.name)
    .join(' ');

describe('scales (WASM)', () => {
  afterEach(() => {
    setUserScales('');
  });

  it('lists the built-in catalog grouped by family', () => {
    const families = listScales();
    expect(families.map((family) => family.name)).toEqual([
      'Diatonic modes',
      'Harmonic minor modes',
      'Melodic minor modes',
      'Pentatonic',
      'Blues',
      'Bebop',
      'Symmetric',
      'Exotic',
    ]);
    const [diatonic] = families;
    expect(diatonic.scales.map((scale) => scale.id)).toEqual([
      'major',
      'dorian',
      'phrygian',
      'lydian',
      'mixolydian',
      'aeolian',
      'locrian',
    ]);
  });

  it('gets a scale by id, with Unicode labels and semitones', () => {
    expect(getScale('lydian')).toEqual({
      id: 'lydian',
      name: 'Lydian',
      aliases: [],
      family: 'Diatonic modes',
      intervals: ['1', '2', '3', '♯4', '5', '6', '7'],
      semitones: [0, 2, 4, 6, 7, 9, 11],
      builtIn: true,
    });
    expect(getScale('major')?.aliases).toEqual(['Ionian']);
    expect(getScale('no-such-scale')).toBeUndefined();
  });

  it('spells the notes of a scale on a root', () => {
    expect(names('major', 'C')).toBe('C D E F G A B');
    expect(names('minor-pentatonic', 'A')).toBe('A C D E G');
    expect(names('phrygian-dominant', 'E')).toBe('E F G♯ A B C D');
    expect(names('phrygian-dominant', 'E', 'flats')).toBe('E F A♭ A B C D');
    expect(names('major', 'Db')).toBe('D♭ D♯ F F♯ G♯ A♯ C');
    expect(scaleNotes('aeolian', 'A', 'flats')[2]).toEqual({
      interval: '♭3',
      semitones: 3,
      pitchClass: 0,
      name: 'C',
    });
  });

  it('throws for an unknown scale or root', () => {
    expect(() => scaleNotes('nope', 'C', 'sharps')).toThrow(/no scale with id "nope"/);
    expect(() => scaleNotes('major', 'H', 'sharps')).toThrow(/not a note name/);
  });

  it('merges user scales over the built-ins and reports broken items', () => {
    const report = setUserScales(`
[[scale]]
id = "dorian"
name = "My Dorian"
family = "Diatonic modes"
intervals = ["1", "2", "b3", "4", "5", "6", "b7"]

[[scale]]
id = "broken"
name = "Broken"
intervals = ["1", "5", "3"]

[[scale]]
id = "mine"
name = "Mine"
intervals = ["1", "b2", "5"]
`);
    expect(report.loaded).toEqual(['dorian', 'mine']);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatchObject({ item: 1, id: 'broken' });
    expect(report.errors[0].message).toMatch(/^scale 2 \("broken"\): intervals must ascend/);

    expect(getScale('dorian')).toMatchObject({ name: 'My Dorian', builtIn: false });
    expect(listScales().at(-1)).toMatchObject({ name: 'Custom', scales: [{ id: 'mine' }] });
    expect(names('mine', 'C')).toBe('C C♯ G');

    expect(setUserScales('')).toEqual({ loaded: [], errors: [] });
    expect(getScale('dorian')?.name).toBe('Dorian');
    expect(getScale('mine')).toBeUndefined();
  });

  it('reports a file that is not TOML as a whole', () => {
    const report = setUserScales('[[scale]\n');
    expect(report.loaded).toEqual([]);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatchObject({ item: null, id: null });
    expect(report.errors[0].message).toMatch(/^not valid TOML \(line 1\)/);
  });

  it('writes user scales that load back as they were', () => {
    const text = writeScales([
      { id: 'mine', name: 'Mine', intervals: ['1', '♭3', '♯4', '5'] },
      { id: 'two', name: 'Two', family: 'Pairs', aliases: ['Duo'], intervals: ['1', 'b5'] },
    ]);
    expect(text).toContain('intervals = ["1", "b3", "#4", "5"]');
    expect(setUserScales(text)).toEqual({ loaded: ['mine', 'two'], errors: [] });
    expect(getScale('mine')).toMatchObject({
      family: 'Custom',
      intervals: ['1', '♭3', '♯4', '5'],
      semitones: [0, 3, 6, 7],
      builtIn: false,
    });
    // A ScaleInfo is a ScaleInput: what was loaded can be written again unchanged.
    expect(writeScales([getScale('mine')!, getScale('two')!])).toBe(text);
  });

  it('refuses invalid scales with the core message, naming the scale', () => {
    expect(() => writeScales([{ id: 'x', name: 'Lonely', intervals: ['1'] }])).toThrow(
      '“Lonely”: a scale needs at least one note besides the root',
    );
    expect(() => writeScales([{ id: 'x', name: ' ', intervals: ['1', '3'] }])).toThrow(
      'name must not be empty',
    );
    expect(() => writeScales([{ id: 'x', name: 'Phrygian', intervals: ['1', '3'] }])).toThrow(
      'there is already a scale called "Phrygian"',
    );
    expect(() =>
      writeScales([
        { id: 'x', name: 'A', intervals: ['1', '3'] },
        { id: 'x', name: 'B', intervals: ['1', '3'] },
      ]),
    ).toThrow('two scales have the id "x"');
  });

  it('makes new scale ids that no scale has', () => {
    expect(newScaleId('My Dorian ♭2')).toBe('my-dorian-2');
    expect(newScaleId('Dorian')).toBe('dorian-2');
    expect(newScaleId('♯♭')).toBe('custom');
    setUserScales('[[scale]]\nid = "custom"\nname = "Mine"\nintervals = ["1", "3"]\n');
    expect(newScaleId('')).toBe('custom-2');
  });
});
