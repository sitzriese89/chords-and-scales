import { afterEach, describe, expect, it } from 'vitest';
import { chordNotes, getChord, listChords, setUserChords } from './theory';

const names = (id: string, root: string, accidentals: 'sharps' | 'flats' = 'sharps') =>
  chordNotes(id, root, accidentals)
    .map((note) => note.name)
    .join(' ');

describe('chords (WASM)', () => {
  afterEach(() => {
    setUserChords('');
  });

  it('lists the built-in catalog grouped by family', () => {
    const families = listChords();
    expect(families.map((family) => family.name)).toEqual([
      'Triads',
      'Suspended',
      'Power chords',
      'Sixths',
      'Sevenths',
      'Ninths',
      'Elevenths',
      'Thirteenths',
      'Altered',
      'Added tone',
    ]);
    expect(families[0].chords.map((chord) => chord.id)).toEqual(['major', 'minor', 'dim', 'aug']);
    expect(families.flatMap((family) => family.chords).length).toBeGreaterThanOrEqual(55);
  });

  it('gets a chord by id, with Unicode labels and semitones', () => {
    expect(getChord('dom7sharp9')).toEqual({
      id: 'dom7sharp9',
      name: 'Seventh sharp nine',
      symbol: '7#9',
      aliases: ['7(#9)'],
      jazzSymbol: '7#9',
      family: 'Altered',
      intervals: ['1', '3', '5', '♭7', '♯9'],
      semitones: [0, 4, 7, 10, 15],
      builtIn: true,
    });
    expect(getChord('major')?.symbol).toBe('');
    expect(getChord('maj7')?.jazzSymbol).toBe('Δ7');
    expect(getChord('no-such-chord')).toBeUndefined();
  });

  it('spells the known chords', () => {
    expect(names('maj7', 'C')).toBe('C E G B');
    expect(names('min7b5', 'F♯')).toBe('F♯ A C E');
    expect(names('dom7sharp9', 'G')).toBe('G B D F A♯');
    expect(names('dom7sharp9', 'G', 'flats')).toBe('G B D F B♭');
    expect(names('sus4', 'D')).toBe('D G A');
  });

  it('gives pitch classes and semitones, compound intervals included', () => {
    const notes = chordNotes('dom7sharp9', 'G', 'sharps');
    expect(notes.map((note) => note.pitchClass)).toEqual([7, 11, 2, 5, 10]);
    expect(notes.map((note) => note.semitones)).toEqual([0, 4, 7, 10, 15]);
    expect(notes.map((note) => note.interval)).toEqual(['1', '3', '5', '♭7', '♯9']);
  });

  it('keeps the root spelling and spells the rest by the preference', () => {
    expect(names('minor', 'D♭')).toBe('D♭ E G♯');
    expect(names('minor', 'C♯', 'flats')).toBe('C♯ E A♭');
  });

  it('throws on a bad root or an unknown id', () => {
    expect(() => chordNotes('maj7', 'H', 'sharps')).toThrow();
    expect(() => chordNotes('no-such-chord', 'C', 'sharps')).toThrow(/no chord with id/);
  });

  it('merges user chords over the built-ins and reports broken items', () => {
    const report = setUserChords(`
[[chord]]
id = "maj7"
name = "My major seventh"
symbol = "maj7"
family = "Sevenths"
intervals = ["1", "3", "7"]

[[chord]]
id = "mine"
name = "Mine"
symbol = "mine"
aliases = ["my"]
intervals = ["1", "b2", "5", "9"]

[[chord]]
id = "broken"
name = "Broken"
symbol = "broken"
intervals = ["1", "5", "3"]
`);
    expect(report.loaded).toEqual(['maj7', 'mine']);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatchObject({ item: 2, id: 'broken' });
    expect(report.errors[0].message).toMatch(/^chord 3 \("broken"\): /);

    expect(getChord('maj7')).toMatchObject({ name: 'My major seventh', builtIn: false });
    expect(names('maj7', 'C')).toBe('C E B');
    expect(getChord('mine')).toMatchObject({ family: 'Custom', builtIn: false });
    const families = listChords();
    expect(families.at(-1)?.name).toBe('Custom');

    setUserChords('');
    expect(getChord('maj7')?.builtIn).toBe(true);
    expect(getChord('mine')).toBeUndefined();
  });

  it('reports a file that is not TOML as one error and keeps the built-ins', () => {
    const report = setUserChords('[[chord]\n');
    expect(report.loaded).toEqual([]);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].item).toBeNull();
    expect(getChord('maj7')?.builtIn).toBe(true);
  });
});
