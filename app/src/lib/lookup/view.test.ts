// The reverse-lookup view model over the real WASM core (ADR-38).
import { describe, expect, it } from 'vitest';
import type { FretboardDot } from '../fretboard';
import { getTuning } from '../theory';
import {
  lookupResults,
  selectedNotes,
  selectionDraft,
  withSelection,
  type LookupNeck,
  type SelectedNote,
} from './view';

const neck: LookupNeck = { tuning: getTuning('guitar-6-standard')!, frets: 24, capo: 0 };
const style = { accidentals: 'sharps', chordSymbols: 'standard' } as const;

/** A shape written lowest string first (`x02220`), as positions on the fretboard. */
function shape(frets: string): { string: number; fret: number }[] {
  const strings = frets.length;
  return [...frets].flatMap((fret, i) =>
    fret === 'x' ? [] : [{ string: strings - i, fret: Number(fret) }],
  );
}

const notesOf = (frets: string, accidentals: 'sharps' | 'flats' = 'sharps') =>
  selectedNotes(neck, shape(frets), accidentals);

describe('selected notes', () => {
  it('puts the open E-shape A chord in pitch order, the bass first, with intervals above it', () => {
    const notes = notesOf('x02220');
    expect(notes.map((n) => n.pitch)).toEqual(['A2', 'E3', 'A3', 'C♯4', 'E4']);
    expect(notes.map((n) => n.interval)).toEqual(['1', '5', '1', '3', '5']);
    expect(notes[0]).toMatchObject({ string: 5, fret: 0, midi: 45, pitchClass: 9, name: 'A' });
  });

  it('orders by pitch, not by the order of the clicks', () => {
    const clicked = shape('x02220').reverse();
    expect(selectedNotes(neck, clicked, 'sharps').map((n) => n.pitch)).toEqual([
      'A2',
      'E3',
      'A3',
      'C♯4',
      'E4',
    ]);
  });

  it('takes the lowest pitch as the bass on any tuning, the lower string first on a tie', () => {
    // A2 twice: string 6 fret 5 and the open A string.
    const notes = selectedNotes(
      neck,
      [
        { string: 5, fret: 0 },
        { string: 6, fret: 5 },
      ],
      'sharps',
    );
    expect(notes.map((n) => [n.string, n.pitch])).toEqual([
      [6, 'A2'],
      [5, 'A2'],
    ]);
    // Drop D: the open low string is a D2 below everything else.
    const dropD = { ...neck, tuning: getTuning('guitar-6-drop-d')! };
    const low = selectedNotes(
      dropD,
      [
        { string: 4, fret: 0 },
        { string: 6, fret: 0 },
      ],
      'sharps',
    );
    expect(low.map((n) => n.pitch)).toEqual(['D2', 'D3']);
  });

  it('spells by the sharp/flat setting and leaves out positions off the neck', () => {
    expect(notesOf('x0222x', 'flats').map((n) => n.pitch)).toEqual(['A2', 'E3', 'A3', 'D♭4']);
    const capo = { ...neck, capo: 3 };
    expect(selectedNotes(capo, [{ string: 1, fret: 0 }], 'sharps')).toEqual([]);
    expect(selectedNotes(neck, [{ string: 7, fret: 0 }], 'sharps')).toEqual([]);
  });
});

describe('lookup results', () => {
  it('lists A first for the open E-shape A chord', () => {
    const { chords, scales } = lookupResults(notesOf('x02220'), style);
    expect(chords[0]).toMatchObject({
      symbol: 'A',
      description: 'Major',
      root: 'A',
      chordId: 'major',
      bass: null,
    });
    expect(scales.length).toBeGreaterThan(0);
    expect(scales.every((s) => s.extra >= 0 && s.name.length > 0)).toBe(true);
    expect(scales.some((s) => s.name === 'A Major pentatonic')).toBe(true);
  });

  it('names a slash chord with its bass, in the display style', () => {
    // E2 C3 G3: C over E.
    const notes = selectedNotes(
      neck,
      [
        { string: 6, fret: 0 },
        { string: 5, fret: 3 },
        { string: 3, fret: 0 },
      ],
      'sharps',
    );
    const [first] = lookupResults(notes, style).chords;
    expect(first).toMatchObject({
      symbol: 'C/E',
      description: 'Major, 3 in the bass',
      root: 'C',
      bass: 'E',
    });
    // x32010 as Jazz names: CΔ7 needs a B; C E G stays C.
    const cmaj7 = selectedNotes(neck, shape('x32000'), 'sharps');
    expect(lookupResults(cmaj7, { ...style, chordSymbols: 'jazz' }).chords[0].symbol).toBe('CΔ7');
  });

  it('says which tone is left out', () => {
    // C3 E3 B♭3: C7 without its 5th.
    const notes = selectedNotes(
      neck,
      [
        { string: 5, fret: 3 },
        { string: 4, fret: 2 },
        { string: 3, fret: 3 },
      ],
      'flats',
    );
    const c7 = lookupResults(notes, { ...style, accidentals: 'flats' }).chords.find(
      (c) => c.chordId === 'dom7',
    );
    expect(c7).toMatchObject({ symbol: 'C7', description: 'Dominant seventh, without 5' });
  });

  it('finds nothing for fewer than two different notes', () => {
    expect(lookupResults([], style)).toEqual({ chords: [], scales: [] });
    const octaves = selectedNotes(neck, shape('x0x2xx'), 'sharps');
    expect(octaves.map((n) => n.pitch)).toEqual(['A2', 'A3']);
    expect(lookupResults(octaves, style)).toEqual({ chords: [], scales: [] });
  });
});

describe('selection draft', () => {
  it('hands the editors the bass as the root and each note once, within the octave', () => {
    const notes = notesOf('x02220');
    expect(selectionDraft(notes, 'scale')).toEqual({ root: 'A', intervals: ['1', '3', '5'] });
    expect(selectionDraft(notes, 'chord')).toEqual({ root: 'A', intervals: ['1', '3', '5'] });
  });

  it('labels a scale by the core’s default and a chord as the chord editor offers', () => {
    // A2 C♯3 F3: 8 semitones above A is ♭6 in a scale, ♯5 in a chord.
    const notes = selectedNotes(
      neck,
      [
        { string: 5, fret: 0 },
        { string: 5, fret: 4 },
        { string: 4, fret: 3 },
      ],
      'sharps',
    );
    expect(selectionDraft(notes, 'scale')?.intervals).toEqual(['1', '3', '♭6']);
    expect(selectionDraft(notes, 'chord')?.intervals).toEqual(['1', '3', '♯5']);
  });

  it('has nothing to save for one note', () => {
    expect(selectionDraft(notesOf('x0x2xx'), 'scale')).toBeUndefined();
    expect(selectionDraft([], 'chord')).toBeUndefined();
  });
});

describe('selection on the neck', () => {
  const dots: FretboardDot[] = [{ string: 5, fret: 0, label: '1', role: 'root', degree: 0 }];

  it('keeps the dots there are and adds one, named by its note, where there is none', () => {
    const notes: SelectedNote[] = notesOf('x0x2xx');
    expect(withSelection(dots, notes, 'intervals')).toEqual([
      dots[0],
      { string: 3, fret: 2, label: 'A', role: 'tone', degree: 0 },
    ]);
    expect(withSelection(dots, notes, 'none')[1].label).toBe('');
  });
});
