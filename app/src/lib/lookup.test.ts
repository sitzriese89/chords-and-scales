import { afterEach, describe, expect, it } from 'vitest';
import {
  findScales,
  getChord,
  getScale,
  listChords,
  lookupChords,
  setUserChords,
  setUserScales,
} from './theory';

// C = 0, D = 2, E = 4, G = 7, A = 9, B♭ = 10.
const C = 0;
const E = 4;
const G = 7;

describe('lookupChords (WASM)', () => {
  afterEach(() => {
    setUserChords('');
    setUserScales('');
  });

  it('puts C/E first for C E G with E in the bass', () => {
    const found = lookupChords([C, E, G], E, 'sharps');
    expect(found[0]).toEqual({
      chordId: 'major',
      root: 'C',
      rootPitchClass: 0,
      bass: 'E',
      bassPitchClass: 4,
      bassInterval: '3',
      omitted: [],
      score: 95,
    });
  });

  it('has no bass for a chord in root position', () => {
    const found = lookupChords([C, E, G], C, 'sharps');
    expect(found[0]).toMatchObject({
      chordId: 'major',
      root: 'C',
      bass: null,
      bassPitchClass: null,
      bassInterval: null,
      score: 100,
    });
  });

  it('ranks C9 first for C E G B♭ D', () => {
    const found = lookupChords([C, E, G, 10, 2], undefined, 'flats');
    expect(found[0]).toMatchObject({ chordId: 'dom9', root: 'C', omitted: [], score: 100 });
    expect(found.slice(1).every((match) => match.score < 100)).toBe(true);
  });

  it('reports a left-out 5th', () => {
    const found = lookupChords([C, E, 10, 2], undefined, 'sharps');
    expect(found[0]).toMatchObject({ chordId: 'dom9', root: 'C', omitted: ['5'] });
    expect(found[0].score).toBeLessThan(100);
  });

  it('spells the root and bass by the preference', () => {
    const notes = [1, 5, 8];
    expect(lookupChords(notes, 5, 'sharps')[0]).toMatchObject({ root: 'C♯', bass: 'F' });
    expect(lookupChords(notes, 5, 'flats')[0]).toMatchObject({ root: 'D♭', bass: 'F' });
  });

  it('knows every chord it names and takes a limit', () => {
    const found = lookupChords([C, E, G, 9], undefined, 'sharps', 1);
    expect(found).toHaveLength(1);
    expect(getChord(found[0].chordId)).toBeDefined();
    expect(lookupChords([C, E, G, 9], undefined, 'sharps').length).toBeGreaterThan(1);
  });

  it('finds every catalog chord from its own tones', () => {
    for (const family of listChords()) {
      for (const chord of family.chords) {
        const tones = chord.semitones.map((semitones) => (7 + semitones) % 12);
        const found = lookupChords(tones, 7, 'sharps', 100);
        expect(
          found.some(
            (match) =>
              match.chordId === chord.id && match.rootPitchClass === 7 && match.score === 100,
          ),
          chord.id,
        ).toBe(true);
      }
    }
  });

  it('searches user chords', () => {
    setUserChords(`
[[chord]]
id = "mystic"
name = "Mystic"
symbol = "myst"
intervals = ["1", "4", "#4", "b7"]
`);
    const found = lookupChords([2, 7, 8, 0], 2, 'sharps');
    expect(found.some((match) => match.chordId === 'mystic')).toBe(true);
  });

  it('gives nothing for fewer than two notes', () => {
    expect(lookupChords([C], undefined, 'sharps')).toEqual([]);
    expect(lookupChords([], undefined, 'sharps')).toEqual([]);
  });

  it('throws on a bad pitch class or accidentals', () => {
    expect(() => lookupChords([C, 12], undefined, 'sharps')).toThrow(/not a pitch class/);
    expect(() => lookupChords([C, E], 13, 'sharps')).toThrow(/not a pitch class/);
    // @ts-expect-error not a preference
    expect(() => lookupChords([C, E], undefined, 'neither')).toThrow();
  });
});

describe('findScales (WASM)', () => {
  afterEach(() => {
    setUserScales('');
  });

  it('ranks the major pentatonic family first for C D E G A', () => {
    const found = findScales([C, 2, E, G, 9], undefined, 'sharps');
    expect(found.slice(0, 5).map((match) => `${match.scaleId} ${match.root}`)).toEqual([
      'major-pentatonic C',
      'minor-pentatonic A',
      'egyptian D',
      'man-gong E',
      'ritusen G',
    ]);
    expect(found.slice(0, 5).every((match) => match.extra === 0)).toBe(true);
    expect(found[0].matched).toEqual(['C', 'D', 'E', 'G', 'A']);
    expect(found[0].unmatched).toEqual([]);
    expect(found[5].extra).toBeGreaterThan(0);
  });

  it('prefers a scale rooted on the bass among equals', () => {
    const found = findScales([C, 2, E, G, 9], E, 'sharps', 3);
    expect(found).toHaveLength(3);
    expect(found[0]).toMatchObject({ scaleId: 'man-gong', root: 'E', rootPitchClass: 4 });
    expect(getScale(found[0].scaleId)).toBeDefined();
  });

  it('lists the notes a scale lacks when it may miss some', () => {
    const found = findScales([C, E, G, 10], undefined, 'flats', 200, 1);
    const major = found.find((match) => match.scaleId === 'major' && match.root === 'C');
    expect(major).toMatchObject({ matched: ['C', 'E', 'G'], unmatched: ['B♭'] });
    // The default is scales that contain every note.
    const strict = findScales([C, E, G, 10], undefined, 'flats', 200);
    expect(strict.every((match) => match.unmatched.length === 0)).toBe(true);
    expect(strict.some((match) => match.scaleId === 'major' && match.root === 'C')).toBe(false);
  });

  it('searches user scales', () => {
    setUserScales(`
[[scale]]
id = "tiny"
name = "Tiny"
intervals = ["1", "b2", "4"]
`);
    const found = findScales([C, 1, 5], undefined, 'sharps');
    expect(found[0]).toMatchObject({ scaleId: 'tiny', root: 'C', extra: 0 });
  });

  it('throws on a bad pitch class', () => {
    expect(() => findScales([C, 99], undefined, 'sharps')).toThrow(/not a pitch class/);
  });
});
