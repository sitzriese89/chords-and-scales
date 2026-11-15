import { afterEach, describe, expect, it } from 'vitest';
import { harmonizeScale, setUserChords, setUserScales } from './theory';

const numerals = (scale: string, root: string, stacking: 'triads' | 'sevenths') =>
  harmonizeScale(scale, root, 'sharps', stacking).map((d) => d.chord?.numeral.text ?? '-');

describe('harmonizeScale (WASM)', () => {
  afterEach(() => {
    setUserChords('');
    setUserScales('');
  });

  it('gives the textbook major table, triads and sevenths', () => {
    expect(numerals('major', 'C', 'triads')).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    expect(numerals('major', 'C', 'sevenths')).toEqual([
      'Imaj7',
      'ii7',
      'iii7',
      'IVmaj7',
      'V7',
      'vi7',
      'viiø7',
    ]);
  });

  it('gives the minor tables', () => {
    expect(numerals('aeolian', 'A', 'triads')).toEqual(['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
    expect(numerals('harmonic-minor', 'A', 'sevenths')).toEqual([
      'imaj7',
      'iiø7',
      'III+maj7',
      'iv7',
      'V7',
      'VImaj7',
      'vii°7',
    ]);
    expect(numerals('melodic-minor', 'A', 'triads')).toEqual([
      'i',
      'ii',
      'III+',
      'IV',
      'V',
      'vi°',
      'vii°',
    ]);
  });

  it('returns structured degrees: root, chord id, tones and numeral parts', () => {
    const degrees = harmonizeScale('major', 'C', 'sharps', 'sevenths');
    expect(degrees).toHaveLength(7);
    expect(degrees[4]).toEqual({
      degree: 5,
      root: { interval: '5', semitones: 7, pitchClass: 7, name: 'G' },
      chord: {
        chordId: 'dom7',
        tones: [
          { interval: '1', semitones: 0, pitchClass: 7, name: 'G' },
          { interval: '3', semitones: 4, pitchClass: 11, name: 'B' },
          { interval: '5', semitones: 7, pitchClass: 2, name: 'D' },
          { interval: '♭7', semitones: 10, pitchClass: 5, name: 'F' },
        ],
        numeral: {
          accidental: 0,
          number: 5,
          lowercase: false,
          mark: null,
          seventh: '7',
          text: 'V7',
        },
      },
    });
    expect(degrees[6].chord?.numeral.mark).toBe('ø');
    expect(degrees[6].chord?.chordId).toBe('min7b5');
  });

  it('keeps the root spelling and follows the preference for the rest', () => {
    const names = (accidentals: 'sharps' | 'flats') =>
      harmonizeScale('major', 'Db', accidentals, 'triads').map((d) => d.root.name);
    expect(names('sharps')).toEqual(['D♭', 'D♯', 'F', 'F♯', 'G♯', 'A♯', 'C']);
    expect(names('flats')).toEqual(['D♭', 'E♭', 'F', 'G♭', 'A♭', 'B♭', 'C']);
  });

  it('marks degrees without a chord as null in pentatonic and whole-tone scales', () => {
    const pent = harmonizeScale('minor-pentatonic', 'C', 'flats', 'triads');
    expect(pent.map((d) => d.chord?.chordId ?? null)).toEqual(['minor', 'major', null, null, null]);
    expect(pent[1].chord?.numeral.text).toBe('♭III');
    const pent7 = harmonizeScale('minor-pentatonic', 'C', 'flats', 'sevenths');
    expect(pent7.map((d) => d.chord?.chordId ?? null)).toEqual(['min7', null, null, null, null]);
    const whole = harmonizeScale('whole-tone', 'C', 'sharps', 'triads');
    expect(whole.every((d) => d.chord?.chordId === 'aug')).toBe(true);
    expect(
      harmonizeScale('whole-tone', 'C', 'sharps', 'sevenths').every((d) => d.chord === null),
    ).toBe(true);
  });

  it('names chords from the current catalog, user chords included', () => {
    setUserChords(`
[[chord]]
id = "my-minor"
name = "My minor"
symbol = "mymin"
intervals = ["1", "b3", "5"]
`);
    const degrees = harmonizeScale('major', 'C', 'sharps', 'triads');
    expect(degrees[1].chord?.chordId).toBe('my-minor');
    expect(degrees[0].chord?.chordId).toBe('major');
  });

  it('uses user scales', () => {
    setUserScales(`
[[scale]]
id = "my-triad-scale"
name = "My triad scale"
intervals = ["1", "3", "5"]
`);
    const degrees = harmonizeScale('my-triad-scale', 'C', 'sharps', 'triads');
    expect(degrees.map((d) => d.chord?.chordId ?? null)).toEqual(['major', null, null]);
  });

  it('throws for an unknown scale, a bad root and a bad stacking', () => {
    expect(() => harmonizeScale('nope', 'C', 'sharps', 'triads')).toThrow(/no scale/);
    expect(() => harmonizeScale('major', 'H', 'sharps', 'triads')).toThrow();
    // @ts-expect-error not a stacking
    expect(() => harmonizeScale('major', 'C', 'sharps', 'ninths')).toThrow(/stacking/);
  });
});
