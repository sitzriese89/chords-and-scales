import { describe, expect, it } from 'vitest';
import {
  type Accidentals,
  formatInterval,
  formatNote,
  formatNoteName,
  intervalLabel,
  intervalSemitones,
  parseNote,
  pitchClassOf,
  spellPitchClass,
} from './theory';

const twelve = (f: (n: number) => string) => Array.from({ length: 12 }, (_, n) => f(n)).join(' ');

describe('notes (WASM)', () => {
  it('parses ASCII and Unicode note names to the same pitch class', () => {
    expect(pitchClassOf('C')).toBe(0);
    expect(pitchClassOf('C#')).toBe(1);
    expect(pitchClassOf('C♯')).toBe(1);
    expect(pitchClassOf('Db')).toBe(1);
    expect(pitchClassOf('D♭')).toBe(1);
    expect(pitchClassOf('Ebb')).toBe(pitchClassOf('E𝄫'));
    expect(pitchClassOf('B#')).toBe(0);
  });

  it('formats note names for display, keeping the spelling', () => {
    expect(formatNoteName('db')).toBe('D♭');
    expect(formatNoteName('F#')).toBe('F♯');
    expect(formatNoteName('Fx')).toBe('F𝄪');
  });

  it('spells by the sharp/flat preference, except the root', () => {
    expect(twelve((pc) => spellPitchClass(pc, 'sharps'))).toBe('C C♯ D D♯ E F F♯ G G♯ A A♯ B');
    expect(twelve((pc) => spellPitchClass(pc, 'flats'))).toBe('C D♭ D E♭ E F G♭ G A♭ A B♭ B');
    expect(twelve((pc) => spellPitchClass(pc, 'sharps', 'Db'))).toBe(
      'C D♭ D D♯ E F F♯ G G♯ A A♯ B',
    );
  });

  it('converts notes with octaves to and from MIDI numbers', () => {
    expect(parseNote('E2')).toBe(40);
    expect(parseNote('C4')).toBe(60);
    expect(parseNote('B♭-1')).toBe(10);
    expect(formatNote(61, 'sharps')).toBe('C♯4');
    expect(formatNote(61, 'flats')).toBe('D♭4');
    expect(formatNote(40, 'flats')).toBe('E2');
  });

  it('reads and labels intervals', () => {
    expect(intervalSemitones('b3')).toBe(3);
    expect(intervalSemitones('♯4')).toBe(6);
    expect(intervalSemitones('13')).toBe(21);
    expect(formatInterval('bb7')).toBe('𝄫7');
    expect(formatInterval('#11')).toBe('♯11');
    expect(twelve(intervalLabel)).toBe('1 ♭2 2 ♭3 3 4 ♭5 5 ♭6 6 ♭7 7');
    expect(intervalLabel(13)).toBe('♭9');
  });

  it('throws errors for invalid input instead of panicking', () => {
    expect(() => pitchClassOf('H')).toThrow(/not a note name/);
    expect(() => formatNoteName('C#b')).toThrow(/not a note name/);
    expect(() => spellPitchClass(12, 'sharps')).toThrow(/not a pitch class/);
    expect(() => spellPitchClass(-1, 'sharps')).toThrow(/not a pitch class/);
    expect(() => spellPitchClass(0, 'sharps', 'X')).toThrow(/not a note name/);
    expect(() => spellPitchClass(0, 'natural' as Accidentals)).toThrow(/sharps.*flats/);
    expect(() => parseNote('E')).toThrow(/not a note/);
    expect(() => parseNote('A9')).toThrow(/outside the MIDI range/);
    expect(() => formatNote(128, 'sharps')).toThrow(/not a MIDI note/);
    expect(() => intervalSemitones('b1')).toThrow(/not an interval/);
    expect(() => intervalLabel(128)).toThrow(/not an interval/);
    // The module keeps working after an error.
    expect(pitchClassOf('A')).toBe(9);
  });
});
