// The harmonize row without the DOM: the real WASM core (loaded in test-setup.ts) and the chord
// panel's harmonizer seam, real or a fixture.
import { describe, expect, it } from 'vitest';
import { harmonizer as coreHarmonizer } from '../chords';
import { cMajorHarmonizer } from '../chords/fixture-harmonizer';
import { scaleNotes, type Accidentals } from '../theory';
import { harmonizeRow, type HarmonizeCell, type HarmonizeSettings } from './view';

const scale = (id: string, root: string, accidentals: Accidentals = 'sharps') => ({
  id,
  root,
  notes: scaleNotes(id, root, accidentals),
});

const SHARPS: HarmonizeSettings = { accidentals: 'sharps', chordSymbols: 'standard' };
const FLATS: HarmonizeSettings = { accidentals: 'flats', chordSymbols: 'standard' };
const JAZZ: HarmonizeSettings = { accidentals: 'sharps', chordSymbols: 'jazz' };

/** The row as `numeral:symbol`, `note:-` for no chord. */
const cells = (row: HarmonizeCell[]) =>
  row.map((cell) =>
    cell.chord ? `${cell.chord.numeral}:${cell.chord.symbol}` : `${cell.note.name}:-`,
  );

describe('harmonizeRow', () => {
  it('harmonizes D Dorian in 7ths, numbered by the mode’s own degrees', () => {
    const row = harmonizeRow(coreHarmonizer!, scale('dorian', 'D'), 'sevenths', SHARPS);
    expect(cells(row)).toEqual([
      'i7:Dm7',
      'ii7:Em7',
      'IIImaj7:Fmaj7',
      'IV7:G7',
      'v7:Am7',
      'viø7:Bm7♭5',
      'VIImaj7:Cmaj7',
    ]);
    expect(row[5].chord?.name).toBe('Half-diminished seventh');
    expect(row.map((cell) => cell.degree)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('writes the chords in the Jazz style when that is the setting', () => {
    const row = harmonizeRow(coreHarmonizer!, scale('dorian', 'D'), 'sevenths', JAZZ);
    expect(cells(row)).toEqual([
      'i7:Dm7',
      'ii7:Em7',
      'IIImaj7:FΔ7',
      'IV7:G7',
      'v7:Am7',
      'viø7:Bø',
      'VIImaj7:CΔ7',
    ]);
  });

  it('harmonizes D Dorian in triads', () => {
    const row = harmonizeRow(coreHarmonizer!, scale('dorian', 'D'), 'triads', SHARPS);
    expect(cells(row)).toEqual(['i:Dm', 'ii:Em', 'III:F', 'IV:G', 'v:Am', 'vi°:Bdim', 'VII:C']);
  });

  it('marks the degrees of a pentatonic scale where no chord forms', () => {
    const minorPentatonic = scale('minor-pentatonic', 'C', 'flats');
    expect(cells(harmonizeRow(coreHarmonizer!, minorPentatonic, 'triads', FLATS))).toEqual([
      'i:Cm',
      '♭III:E♭',
      'F:-',
      'G:-',
      'B♭:-',
    ]);
    expect(cells(harmonizeRow(coreHarmonizer!, minorPentatonic, 'sevenths', FLATS))).toEqual([
      'i7:Cm7',
      'E♭:-',
      'F:-',
      'G:-',
      'B♭:-',
    ]);
  });

  it('asks the harmonizer it is given', () => {
    expect(cells(harmonizeRow(cMajorHarmonizer, scale('major', 'C'), 'sevenths', SHARPS))).toEqual([
      'Imaj7:Cmaj7',
      'ii7:Dm7',
      'iii7:Em7',
      'IVmaj7:Fmaj7',
      'V7:G7',
      'vi7:Am7',
      'viiø7:Bm7♭5',
    ]);
    // The fixture knows only C major.
    expect(cells(harmonizeRow(cMajorHarmonizer, scale('major', 'D'), 'triads', SHARPS))).toEqual([
      'D:-',
      'E:-',
      'F♯:-',
      'G:-',
      'A:-',
      'B:-',
      'C♯:-',
    ]);
  });

  it('shows a chord the catalog does not have as no chord', () => {
    const unknown = {
      chordOnDegree: () => ({ root: 'C', chordId: 'no-such-chord', numeral: 'I' }),
    };
    const row = harmonizeRow(unknown, scale('major', 'C'), 'triads', SHARPS);
    expect(row.every((cell) => cell.chord === null)).toBe(true);
  });
});
