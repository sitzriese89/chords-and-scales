import { afterEach, describe, expect, it } from 'vitest';
import { formatChordSymbol, listChords, parseChordSymbol, setUserChords } from './theory';

describe('chord symbols (WASM)', () => {
  afterEach(() => {
    setUserChords('');
  });

  it('parses typed symbols into root, chord id and bass', () => {
    expect(parseChordSymbol('Cmaj7')).toEqual({ ok: true, root: 'C', chordId: 'maj7' });
    expect(parseChordSymbol('Dbm7b5')).toEqual({ ok: true, root: 'D♭', chordId: 'min7b5' });
    expect(parseChordSymbol('F#ø')).toEqual({ ok: true, root: 'F♯', chordId: 'min7b5' });
    expect(parseChordSymbol('CΔ7')).toEqual({ ok: true, root: 'C', chordId: 'maj7' });
    expect(parseChordSymbol('G7(b9)/B')).toEqual({
      ok: true,
      root: 'G',
      chordId: 'dom7flat9',
      bass: 'B',
    });
    expect(parseChordSymbol('c/e')).toEqual({ ok: true, root: 'C', chordId: 'major', bass: 'E' });
  });

  it('keeps 6/9 whole and still splits a bass after it', () => {
    expect(parseChordSymbol('C6/9')).toEqual({ ok: true, root: 'C', chordId: 'maj6-9' });
    expect(parseChordSymbol('Am6/9/E')).toEqual({
      ok: true,
      root: 'A',
      chordId: 'min6-9',
      bass: 'E',
    });
  });

  it('returns an error with a position instead of throwing', () => {
    expect(parseChordSymbol('Cfoo')).toMatchObject({ ok: false, position: 1 });
    expect(parseChordSymbol('Cmaj7x')).toMatchObject({ ok: false, position: 5 });
    expect(parseChordSymbol('H7')).toMatchObject({ ok: false, position: 0 });
    expect(parseChordSymbol('C/H')).toMatchObject({ ok: false, position: 2 });
    const empty = parseChordSymbol('');
    expect(empty).toMatchObject({ ok: false, position: 0 });
    expect(empty.ok === false && empty.message).toMatch(/enter a chord/);
  });

  it('formats in the Standard and Jazz styles', () => {
    expect(formatChordSymbol('C', 'maj7', undefined, 'standard')).toBe('Cmaj7');
    expect(formatChordSymbol('C', 'maj7', undefined, 'jazz')).toBe('CΔ7');
    expect(formatChordSymbol('C', 'min7b5', undefined, 'standard')).toBe('Cm7♭5');
    expect(formatChordSymbol('C', 'min7b5', undefined, 'jazz')).toBe('Cø');
    expect(formatChordSymbol('C', 'dim7', undefined, 'jazz')).toBe('C°7');
    expect(formatChordSymbol('Eb', 'min7b5', 'Bb', 'standard')).toBe('E♭m7♭5/B♭');
    expect(formatChordSymbol('c#', 'major', undefined, 'standard')).toBe('C♯');
  });

  it('throws on a bad root, bass, chord id or style', () => {
    expect(() => formatChordSymbol('H', 'maj7', undefined, 'standard')).toThrow();
    expect(() => formatChordSymbol('C', 'maj7', 'X', 'standard')).toThrow();
    expect(() => formatChordSymbol('C', 'no-such-chord', undefined, 'standard')).toThrow(
      /no chord with id/,
    );
    // @ts-expect-error not a style
    expect(() => formatChordSymbol('C', 'maj7', undefined, 'fancy')).toThrow(/style/);
  });

  it('round-trips every catalog chord on every root in both styles', () => {
    const roots = ['C', 'D♭', 'E', 'F♯', 'A♭', 'B'];
    for (const chord of listChords().flatMap((family) => family.chords)) {
      for (const root of roots) {
        for (const style of ['standard', 'jazz'] as const) {
          const text = formatChordSymbol(root, chord.id, 'G', style);
          expect(parseChordSymbol(text), text).toEqual({
            ok: true,
            root,
            chordId: chord.id,
            bass: 'G',
          });
        }
      }
    }
  });

  it('reads the symbols of user chords', () => {
    setUserChords(`
[[chord]]
id = "mine"
name = "Mine"
symbol = "mine"
jazz_symbol = "Ж"
intervals = ["1", "b2", "5"]
`);
    expect(parseChordSymbol('Amine')).toEqual({ ok: true, root: 'A', chordId: 'mine' });
    expect(formatChordSymbol('A', 'mine', undefined, 'jazz')).toBe('AЖ');
    setUserChords('');
    expect(parseChordSymbol('Amine')).toMatchObject({ ok: false });
  });
});
