import { afterEach, describe, expect, it } from 'vitest';
import {
  chordTags,
  listChords,
  listScales,
  listTags,
  scaleTags,
  setUserChords,
  setUserScales,
  setUserTagRules,
} from './theory';

describe('mood tags (WASM)', () => {
  afterEach(() => {
    setUserTagRules('');
    setUserScales('');
    setUserChords('');
  });

  it('lists the built-in tags with the kinds they apply to', () => {
    const tags = listTags();
    const names = tags.map((tag) => tag.name);
    expect(names).toEqual([...names].sort());
    for (const name of ['sad', 'evil', 'melancholic', 'dissonant', 'jazzy', 'bright', 'exotic']) {
      expect(names).toContain(name);
    }
    expect(tags.find((tag) => tag.name === 'dark')).toEqual({
      name: 'dark',
      scales: true,
      chords: true,
    });
    expect(tags.find((tag) => tag.name === 'jazzy')).toMatchObject({ scales: false, chords: true });
    expect(tags.find((tag) => tag.name === 'exotic')).toMatchObject({
      scales: true,
      chords: false,
    });
  });

  it('tags built-in scales and chords by id', () => {
    expect(scaleTags('phrygian')).toContain('dark');
    expect(scaleTags('locrian')).toContain('dark');
    expect(scaleTags('lydian')).toContain('bright');
    expect(chordTags('dim7')).toContain('dissonant');
    expect(chordTags('maj9')).toContain('jazzy');
    for (const family of listScales()) {
      for (const scale of family.scales) {
        expect(Array.isArray(scaleTags(scale.id))).toBe(true);
      }
    }
    for (const family of listChords()) {
      for (const chord of family.chords) {
        expect(Array.isArray(chordTags(chord.id))).toBe(true);
      }
    }
  });

  it('throws for an unknown id', () => {
    expect(() => scaleTags('nope')).toThrow('no scale with id "nope"');
    expect(() => chordTags('nope')).toThrow('no chord with id "nope"');
  });

  it('tags user scales and chords like built-ins', () => {
    setUserScales(`
[[scale]]
id = "my-locrian"
name = "My Locrian"
intervals = ["1", "b2", "b3", "4", "b5", "b6", "b7"]
`);
    expect(scaleTags('my-locrian')).toEqual(scaleTags('locrian'));
    setUserChords(`
[[chord]]
id = "my-dim"
name = "My diminished"
symbol = "mydim"
intervals = ["1", "b3", "b5"]
`);
    expect(chordTags('my-dim')).toEqual(chordTags('dim'));
  });

  it('adds a tag from a user rules file and reports broken tables', () => {
    const report = setUserTagRules(`
[tag.spanish]
scale-threshold = 4
[tag.spanish.weights]
b2 = 2
3 = 2

[tag.dark.weights]
b9 = 1
`);
    expect(report.tags).toContain('spanish');
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].tag).toBe('dark');
    expect(report.errors[0].message).toMatch(/^tag "dark": unknown feature "b9"/);
    expect(scaleTags('phrygian-dominant')).toContain('spanish');
    expect(scaleTags('major')).not.toContain('spanish');
    expect(listTags().find((tag) => tag.name === 'spanish')).toEqual({
      name: 'spanish',
      scales: true,
      chords: false,
    });
    // The broken table left `dark` as it was.
    expect(scaleTags('phrygian')).toContain('dark');

    setUserTagRules('');
    expect(scaleTags('phrygian-dominant')).not.toContain('spanish');
  });

  it('reports a file that is not TOML without throwing', () => {
    const report = setUserTagRules('[tag.mine\n');
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].tag).toBeNull();
    expect(report.errors[0].message).toMatch(/^not valid TOML/);
    expect(scaleTags('lydian')).toContain('bright');
  });
});
