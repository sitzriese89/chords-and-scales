// The tab view model over the real WASM core (loaded in test-setup.ts).
import { describe, expect, it } from 'vitest';
import { defaultSettings, type Settings } from '../settings';
import { getTuning, scaleNotes, type Tuning } from '../theory';
import { playingOrder, tabPosition, tabStrings } from './position';

const tuning = (id: string): Tuning => {
  const found = getTuning(id);
  if (!found) throw new Error(`no tuning ${id}`);
  return found;
};

const tab = (change: Partial<Settings['tab']> = {}): Settings['tab'] => ({
  ...defaultSettings().tab,
  ...change,
});

const gMajor = () => scaleNotes('major', 'G', 'sharps');
const frets = (list: { string: number; fret: number }[]) =>
  list.map((p) => `${p.string}:${p.fret}`);

/**
 * G major, 3NPS pattern 1, six-string standard tuning, written out by hand: G A B on the low
 * E string (3 5 7), C D E on A (3 5 7), F♯ G A on D (4 5 7), B C D on G (4 5 7), E F♯ G on B
 * (5 7 8), A B C on the high E (5 7 8).
 */
const G_MAJOR_PATTERN_1 = [
  '6:3 6:5 6:7',
  '5:3 5:5 5:7',
  '4:4 4:5 4:7',
  '3:4 3:5 3:7',
  '2:5 2:7 2:8',
  '1:5 1:7 1:8',
]
  .join(' ')
  .split(' ');

describe('tabPosition', () => {
  it('gives G major 3NPS pattern 1 in standard tuning', () => {
    const position = tabPosition({
      tuning: tuning('guitar-6-standard'),
      frets: 24,
      capo: 0,
      notes: gMajor(),
      tab: tab({ system: '3nps', pattern: 0 }),
    });
    expect(position.pattern).toBe(0);
    expect(position.description).toBe('Pattern 1 (from G)');
    expect(frets(position.positions)).toEqual(G_MAJOR_PATTERN_1);
    expect(position.notes).toEqual([]);
    expect(position.patterns.map((p) => p.label)).toEqual([
      'Pattern 1 (from G)',
      'Pattern 2 (from A)',
      'Pattern 3 (from B)',
      'Pattern 4 (from C)',
      'Pattern 5 (from D)',
      'Pattern 6 (from E)',
      'Pattern 7 (from F♯)',
    ]);
  });

  it('names the patterns that do not fit and falls back from a missing one', () => {
    const position = tabPosition({
      tuning: tuning('guitar-6-standard'),
      frets: 12,
      capo: 0,
      notes: gMajor(),
      tab: tab({ pattern: 3 }),
    });
    expect(position.patterns.map((p) => p.degree)).toEqual([0, 1, 2, 5, 6]);
    expect(position.pattern).toBe(0);
    expect(position.notes).toEqual([
      "Patterns 4, 5 don't fit between the capo and the last fret.",
      'Showing pattern 1 instead of pattern 4.',
    ]);
  });

  it('falls back from a pattern number the scale does not have', () => {
    const position = tabPosition({
      tuning: tuning('guitar-6-standard'),
      frets: 24,
      capo: 0,
      notes: gMajor(),
      tab: tab({ pattern: 9 }),
    });
    expect(position.patterns).toHaveLength(7);
    expect(position.pattern).toBe(0);
    expect(position.notes).toEqual(['This scale has no pattern 10; showing pattern 1.']);
  });

  it('keeps absolute frets above a capo', () => {
    const position = tabPosition({
      tuning: tuning('guitar-6-standard'),
      frets: 24,
      capo: 5,
      notes: gMajor(),
      tab: tab(),
    });
    // Pattern 1 now starts an octave up: G on the low string at fret 15.
    expect(position.positions[0]).toMatchObject({ string: 6, fret: 15 });
    expect(Math.min(...position.positions.map((p) => p.fret))).toBeGreaterThanOrEqual(5);
  });

  it('says when no pattern fits', () => {
    const position = tabPosition({
      tuning: tuning('guitar-6-standard'),
      frets: 12,
      capo: 11,
      notes: gMajor(),
      tab: tab(),
    });
    expect(position.positions).toEqual([]);
    expect(position.pattern).toBeNull();
    expect(position.notes).toEqual([
      'No 3-notes-per-string pattern of this scale fits between the capo and the last fret.',
    ]);
  });

  it('gives a fret window in tab order', () => {
    const position = tabPosition({
      tuning: tuning('guitar-6-standard'),
      frets: 24,
      capo: 0,
      notes: gMajor(),
      tab: tab({ system: 'window', windowStart: 2, windowSpan: 4 }),
    });
    expect(position.description).toBe('Frets 2–5');
    expect(frets(position.positions).slice(0, 7)).toEqual([
      '6:2',
      '6:3',
      '6:5',
      '5:2',
      '5:3',
      '5:5',
      '4:2',
    ]);
    expect(position.positions.every((p) => p.fret >= 2 && p.fret <= 5)).toBe(true);
  });

  it('says when a fret window holds no note', () => {
    const position = tabPosition({
      tuning: tuning('guitar-6-standard'),
      frets: 12,
      capo: 0,
      notes: gMajor(),
      tab: tab({ system: 'window', windowStart: 20, windowSpan: 1 }),
    });
    expect(position.description).toBe('Fret 20');
    expect(position.positions).toEqual([]);
    expect(position.notes).toEqual(['No note of the scale lies in fret 20.']);
  });

  it.each([
    'bass-4-standard',
    'bass-5-standard',
    'guitar-6-standard',
    'guitar-7-standard',
    'guitar-8-standard',
    'guitar-9-standard',
  ])('works on %s', (id) => {
    const t = tuning(id);
    const position = tabPosition({ tuning: t, frets: 24, capo: 0, notes: gMajor(), tab: tab() });
    expect(position.positions).toHaveLength(3 * t.notes.length);
    expect(new Set(position.positions.map((p) => p.string)).size).toBe(t.notes.length);
  });
});

describe('playingOrder', () => {
  it('plays up, down, or up and back down with the top note once', () => {
    expect(playingOrder([1, 2, 3], 'ascending')).toEqual([1, 2, 3]);
    expect(playingOrder([1, 2, 3], 'descending')).toEqual([3, 2, 1]);
    expect(playingOrder([1, 2, 3], 'both')).toEqual([1, 2, 3, 2, 1]);
    expect(playingOrder([], 'both')).toEqual([]);
    expect(playingOrder([1], 'both')).toEqual([1]);
  });

  it('does not change its input', () => {
    const input = [1, 2, 3];
    playingOrder(input, 'descending');
    expect(input).toEqual([1, 2, 3]);
  });
});

describe('tabStrings', () => {
  it('labels the lines top to bottom with the open notes', () => {
    expect(tabStrings(tuning('guitar-6-standard'), 'sharps')).toEqual(
      ['E', 'B', 'G', 'D', 'A', 'E'].map((label, i) => ({ string: i + 1, label })),
    );
    expect(tabStrings(tuning('bass-4-standard'), 'sharps').map((s) => s.label)).toEqual([
      'G',
      'D',
      'A',
      'E',
    ]);
    expect(tabStrings(tuning('guitar-9-standard'), 'sharps').map((s) => s.label)).toEqual([
      'E',
      'B',
      'G',
      'D',
      'A',
      'E',
      'B',
      'F♯',
      'C♯',
    ]);
  });

  it('spells the open notes by the sharp/flat preference', () => {
    expect(tabStrings(tuning('guitar-6-eb-standard'), 'flats').map((s) => s.label)).toEqual([
      'E♭',
      'B♭',
      'G♭',
      'D♭',
      'A♭',
      'E♭',
    ]);
  });
});
