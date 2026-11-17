import { afterEach, describe, expect, it } from 'vitest';
import {
  chordIntervalLabels,
  chordNotes,
  getChord,
  listChords,
  newChordId,
  setUserChords,
  writeChords,
} from './theory';

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

  it('writes user chords that load back as they were', () => {
    const text = writeChords([
      {
        id: 'mine',
        name: 'Mine',
        symbol: 'q7#9',
        jazzSymbol: 'Q#9',
        family: 'Mine',
        intervals: ['1', '3', '♭7', '♯9'],
      },
      { id: 'plain', name: 'Plain', symbol: 'qq', intervals: ['1', '4', '5'] },
    ]);
    expect(text).toContain('intervals = ["1", "3", "b7", "#9"]');
    expect(text).toContain('family = "Custom"');
    expect(setUserChords(text)).toEqual({ loaded: ['mine', 'plain'], errors: [] });
    expect(getChord('mine')).toMatchObject({
      symbol: 'q7#9',
      jazzSymbol: 'Q#9',
      family: 'Mine',
      intervals: ['1', '3', '♭7', '♯9'],
      builtIn: false,
    });
    // A ChordInfo is a ChordInput: writing the loaded chords gives the same text.
    expect(writeChords([getChord('mine')!, getChord('plain')!])).toBe(text);
  });

  it('refuses what is not a user chord, naming it', () => {
    const chord = { id: 'mine', name: 'Mine', symbol: 'q', intervals: ['1', '3'] };
    expect(() => writeChords([{ ...chord, intervals: ['1'] }])).toThrow(
      '“Mine”: a chord needs at least one note besides the root',
    );
    expect(() => writeChords([{ ...chord, name: 'Minor seventh' }])).toThrow(
      'there is already a chord called "Minor seventh"',
    );
    expect(() => writeChords([{ ...chord, symbol: 'm7' }])).toThrow(
      'the symbol "m7" already means the chord "Minor seventh"',
    );
    expect(() => writeChords([{ ...chord, symbol: '' }])).toThrow(/^a chord needs a symbol/);
    expect(() => writeChords([{ ...chord, symbol: 'b9' }])).toThrow(/"b9" would not be read back/);
    expect(() => writeChords([chord, { ...chord, name: 'Other', symbol: 'r' }])).toThrow(
      'two chords have the id "mine"',
    );
  });

  it('makes ids for new chords that no chord has', () => {
    expect(newChordId('My 7♯9')).toBe('my-7-9');
    expect(newChordId('maj7')).toBe('maj7-2');
    setUserChords(writeChords([{ id: 'mine', name: 'Mine', symbol: 'q', intervals: ['1', '3'] }]));
    expect(newChordId('Mine')).toBe('mine-2');
  });

  it('offers the chord labels for two octaves, none for an octave-up chord tone', () => {
    expect(chordIntervalLabels()).toEqual([
      '1',
      '♭2',
      '2',
      '♭3',
      '3',
      '4',
      '♭5',
      '5',
      '♯5',
      '6',
      '♭7',
      '7',
      null,
      '♭9',
      '9',
      '♯9',
      null,
      '11',
      '♯11',
      null,
      '♭13',
      '13',
      null,
      null,
    ]);
  });

  it('reports a file that is not TOML as one error and keeps the built-ins', () => {
    const report = setUserChords('[[chord]\n');
    expect(report.loaded).toEqual([]);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].item).toBeNull();
    expect(getChord('maj7')?.builtIn).toBe(true);
  });
});
