import { afterEach, describe, expect, it } from 'vitest';
import { chordVoicings, getTuning, setUserChords, type ChordVoicing, type Tuning } from './theory';

const tuning = (id: string): Tuning => {
  const found = getTuning(id);
  if (!found) throw new Error(`no tuning ${id}`);
  return found;
};

// C = 0, E = 4, G = 7.
const C = 0;
const G = 7;

/** A shape as written, lowest string first: `x32010`. */
const written = (voicing: ChordVoicing): string =>
  voicing.strings
    .map((string) =>
      string === null ? 'x' : string.fret < 10 ? `${string.fret}` : `(${string.fret})`,
    )
    .join('');

describe('chordVoicings (WASM)', () => {
  afterEach(() => {
    setUserChords('');
  });

  it('finds the open C shape among the first C major voicings', () => {
    const found = chordVoicings(tuning('guitar-6-standard'), 24, 0, 'major', C);
    const index = found.map(written).indexOf('x32010');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(5);
    const openC = found[index];
    expect(openC.strings[0]).toBeNull();
    expect(openC.strings[1]).toEqual({
      string: 5,
      fret: 3,
      midi: 48,
      pitchClass: 0,
      interval: '1',
    });
    expect(openC).toMatchObject({
      bass: '1',
      omitted: [],
      lowestFret: 1,
      span: 3,
      played: 5,
      barre: null,
    });
  });

  it('finds the E-shape barre for G major, with its barre', () => {
    const found = chordVoicings(tuning('guitar-6-standard'), 24, 0, 'major', G);
    const barre = found.find((voicing) => written(voicing) === '355433');
    expect(barre).toBeDefined();
    expect(found.indexOf(barre!)).toBeLessThan(5);
    expect(barre!.barre).toEqual({ fret: 3, lowestString: 6, highestString: 1 });
  });

  it('ranks best first and takes a limit', () => {
    const found = chordVoicings(tuning('guitar-6-standard'), 24, 0, 'dom7', G, { limit: 4 });
    expect(found).toHaveLength(4);
    const scores = found.map((voicing) => voicing.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(chordVoicings(tuning('guitar-6-standard'), 24, 0, 'dom7', G).length).toBe(50);
  });

  it('applies the constraints', () => {
    const standard = tuning('guitar-6-standard');
    const noOpen = chordVoicings(standard, 24, 0, 'major', C, { openStrings: false });
    expect(noOpen.length).toBeGreaterThan(0);
    expect(noOpen.every((v) => v.strings.every((s) => s === null || s.fret > 0))).toBe(true);

    const allStrings = chordVoicings(standard, 24, 0, 'major', G, { mutedStrings: false });
    expect(allStrings.every((v) => v.played === 6 && v.strings.every((s) => s !== null))).toBe(
      true,
    );

    const rootPosition = chordVoicings(standard, 24, 0, 'major', C, { limit: 500 });
    expect(rootPosition.every((v) => v.bass === '1')).toBe(true);
    const inversions = chordVoicings(standard, 24, 0, 'major', C, { inversions: true, limit: 500 });
    expect(inversions.some((v) => v.bass === '3')).toBe(true);

    const narrow = chordVoicings(standard, 24, 0, 'major', C, { maxSpan: 2, limit: 500 });
    expect(narrow.every((v) => v.span <= 2)).toBe(true);
  });

  it('keeps above the capo', () => {
    // Capo on 2: the C shape sounds D (pitch class 2).
    const found = chordVoicings(tuning('guitar-6-standard'), 24, 2, 'major', 2);
    expect(found.every((v) => v.strings.every((s) => s === null || s.fret >= 2))).toBe(true);
    expect(found.map(written)).toContain('x54232');
  });

  it('labels tones as the chord does and works on nine strings', () => {
    const nine = tuning('guitar-9-standard');
    const found = chordVoicings(nine, 24, 0, 'dom9', C, { limit: 10 });
    expect(found.length).toBeGreaterThan(0);
    for (const voicing of found) {
      expect(voicing.strings).toHaveLength(9);
      const labels = voicing.strings.flatMap((s) => (s === null ? [] : [s.interval]));
      expect(labels).toContain('♭7');
      expect(labels).not.toContain('2');
    }
  });

  it('uses user chords', () => {
    setUserChords(`
[[chord]]
id = "mystic"
name = "Mystic"
symbol = "myst"
intervals = ["1", "4", "#4", "b7"]
`);
    const found = chordVoicings(tuning('guitar-6-standard'), 24, 0, 'mystic', C, { limit: 5 });
    expect(found.length).toBeGreaterThan(0);
  });

  it('throws on bad input', () => {
    const standard = tuning('guitar-6-standard');
    expect(() => chordVoicings(standard, 24, 0, 'nope', C)).toThrow(/no chord/);
    expect(() => chordVoicings(standard, 24, 0, 'major', 12)).toThrow(/not a pitch class/);
    expect(() => chordVoicings(standard, 11, 0, 'major', C)).toThrow(/frets/);
    expect(() => chordVoicings(standard, 24, 0, 'major', C, { maxSpan: 0 })).toThrow(/span/);
    // @ts-expect-error not a number
    expect(() => chordVoicings(standard, 24, 0, 'major', C, { maxSpan: 'wide' })).toThrow(
      /options/,
    );
  });
});
