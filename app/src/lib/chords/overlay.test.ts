// The chord overlay, the strum choice and the panel's view model, with the real WASM core.
import { describe, expect, it } from 'vitest';
import { explorerView } from '../explorer';
import { defaultSettings, type LabelMode, type Settings } from '../settings';
import {
  chordNotes,
  fretboardPositions,
  getChord,
  getTuning,
  scaleNotes,
  type NotePosition,
} from '../theory';
import { chordSymbol } from './display';
import { chordOverlay } from './overlay';
import { strumPitches } from './strum';
import { chordPanelView } from './view';

const tuning = getTuning('guitar-6-standard')!;
const noteNames = (names: string) => names.split(' ');

function overlay(chordId: string, root: string, withScale: boolean, labels: LabelMode = 'notes') {
  return chordOverlay({
    tuning,
    frets: 24,
    capo: 0,
    labels,
    chord: chordNotes(chordId, root, 'sharps'),
    scale: withScale ? scaleNotes('major', 'C', 'sharps') : null,
  });
}

describe('chordOverlay', () => {
  it('shows G7 emphasized over the dimmed C major scale', () => {
    const { dots } = overlay('dom7', 'G', true);
    const byRole = (role: string) =>
      new Set(dots.filter((d) => d.role === role).map((d) => d.label));
    expect(byRole('root')).toEqual(new Set(['G']));
    expect(byRole('tone')).toEqual(new Set(['B', 'D', 'F']));
    expect(byRole('dim')).toEqual(new Set(['C', 'E', 'A']));
    // Every note of the scale is there once per position, nothing else.
    expect(new Set(dots.map((d) => d.label))).toEqual(new Set(noteNames('C D E F G A B')));
  });

  it('shows a chord alone when it does not come from a scale', () => {
    const { dots } = overlay('dom7', 'G', false);
    expect(dots.some((d) => d.role === 'dim')).toBe(false);
    expect(new Set(dots.map((d) => d.label))).toEqual(new Set(noteNames('G B D F')));
  });

  it('keeps a chord tone outside the scale emphasized', () => {
    // C7 has B♭, which C major lacks.
    const { dots } = overlay('dom7', 'C', true);
    const flat = dots.filter((d) => d.label === 'A♯');
    expect(flat.length).toBeGreaterThan(0);
    expect(flat.every((d) => d.role === 'tone')).toBe(true);
  });

  it('labels chord tones by their interval from the chord root, and leaves the dimmed ones blank', () => {
    const { dots } = overlay('dom7', 'G', true, 'intervals');
    expect(new Set(dots.filter((d) => d.role !== 'dim').map((d) => d.label))).toEqual(
      new Set(['1', '3', '5', '♭7']),
    );
    expect(dots.filter((d) => d.role === 'dim').every((d) => d.label === '')).toBe(true);
    expect(overlay('dom7', 'G', true, 'none').dots.every((d) => d.label === '')).toBe(true);
  });

  it('measures the degree from the chord root', () => {
    const { dots } = overlay('dom7', 'G', true);
    expect(dots.find((d) => d.label === 'B')?.degree).toBe(4);
    expect(dots.find((d) => d.label === 'G')?.degree).toBe(0);
  });
});

describe('explorerView with a chord', () => {
  const settings: Settings = defaultSettings();
  settings.tab.highlight = false;

  it('draws the chord over the scale, and the plain scale without one', () => {
    const plain = explorerView(settings);
    expect(plain.chord).toBeNull();
    expect(plain.dots.every((d) => d.role !== 'dim')).toBe(true);

    const view = explorerView(settings, { root: 'G', chordId: 'dom7', fromScale: true });
    expect(view.chord).toEqual({ name: 'G7', overScale: true });
    expect(view.dots.filter((d) => d.role === 'tone' || d.role === 'root')).toHaveLength(
      overlay('dom7', 'G', false).dots.length,
    );
    expect(view.dots.length).toBe(plain.dots.length);
  });

  it('plays a clicked chord dot at its real pitch', () => {
    const view = explorerView(settings, { root: 'G', chordId: 'dom7', fromScale: true });
    // The open G string is G3 = MIDI 55.
    expect(view.pitches.get('3:0')).toBe(55);
  });

  it('names the chord in the display style, with the bass of a slash chord', () => {
    const jazz: Settings = { ...settings, chordSymbols: 'jazz' };
    expect(explorerView(jazz, { root: 'B', chordId: 'min7b5', fromScale: true }).chord).toEqual({
      name: 'Bø',
      overScale: true,
    });
    const slash = { root: 'A', chordId: 'min7b5', fromScale: false, bass: 'G' };
    expect(explorerView(settings, slash).chord?.name).toBe('Am7♭5/G');
    expect(explorerView(jazz, slash).chord?.name).toBe('Aø/G');
  });

  it('ignores a chord that is not in the catalog', () => {
    const view = explorerView(settings, { root: 'G', chordId: 'no-such-chord', fromScale: false });
    expect(view.chord).toBeNull();
    expect(view.dots).toEqual(explorerView(settings).dots);
  });
});

describe('strumPitches', () => {
  const positions = (id: string, root: string): NotePosition[] => {
    const notes = chordNotes(id, root, 'sharps');
    return fretboardPositions(
      tuning,
      24,
      0,
      notes.map((n) => n.pitchClass),
      notes[0].pitchClass,
    );
  };
  const tones = (id: string, root: string) =>
    chordNotes(id, root, 'sharps').map((n) => n.pitchClass);

  it('stacks the chord upward from its lowest root, one note per string', () => {
    // C major from the lowest C on the neck: C3 (E string, 8th fret), then E3, G3.
    const pitches = strumPitches(positions('major', 'C'), tones('major', 'C'));
    expect(pitches).toEqual([48, 52, 55]);
  });

  it('plays a seventh chord in four notes, rising', () => {
    const pitches = strumPitches(positions('dom7', 'G'), tones('dom7', 'G'));
    expect(pitches).toEqual([43, 47, 50, 65]);
    expect(pitches).toEqual([...pitches].sort((a, b) => a - b));
  });

  it('leaves out the tones that find no string above', () => {
    // A four-string bass has no string left for the ninth chord's upper tones.
    const bass = getTuning('bass-4-standard')!;
    const notes = chordNotes('dom9', 'G', 'sharps');
    const found = fretboardPositions(
      bass,
      24,
      0,
      notes.map((n) => n.pitchClass),
      notes[0].pitchClass,
    );
    const pitches = strumPitches(found, tones('dom9', 'G'));
    expect(pitches.length).toBeLessThanOrEqual(4);
    expect(pitches.length).toBeGreaterThanOrEqual(2);
  });

  it('plays nothing when the root is not on the neck', () => {
    expect(strumPitches([], [0, 4, 7])).toEqual([]);
    expect(strumPitches(positions('major', 'C'), [])).toEqual([]);
  });
});

describe('chordPanelView', () => {
  it('names the chord, lists its notes and picks the strum from the tuning', () => {
    const settings = defaultSettings();
    const view = chordPanelView(settings, {
      root: 'G',
      chord: getChord('dom7')!,
      fromScale: true,
    });
    expect(view.symbol).toBe('G7');
    expect(view.name).toBe('Dominant seventh');
    expect(view.notes.map((n) => n.name)).toEqual(['G', 'B', 'D', 'F']);
    expect(view.strum).toEqual([43, 47, 50, 65]);
  });

  it('follows the tuning: drop D gives a lower strum', () => {
    const settings = defaultSettings();
    settings.instrument.tuning = 'guitar-6-drop-d';
    const view = chordPanelView(settings, {
      root: 'D',
      chord: getChord('major')!,
      fromScale: false,
    });
    // The open low D string is D2 = MIDI 38.
    expect(view.strum[0]).toBe(38);
  });
});

describe('chordSymbol', () => {
  it('writes the chord in the Standard style', () => {
    expect(chordSymbol('G', getChord('dom7')!, 'standard')).toBe('G7');
    expect(chordSymbol('D♭', getChord('major')!, 'standard')).toBe('D♭');
    expect(chordSymbol('B', getChord('min7b5')!, 'standard')).toBe('Bm7♭5');
    expect(chordSymbol('C', getChord('maj7')!, 'standard')).toBe('Cmaj7');
  });

  it('writes the chord in the Jazz style', () => {
    expect(chordSymbol('B', getChord('min7b5')!, 'jazz')).toBe('Bø');
    expect(chordSymbol('C', getChord('maj7')!, 'jazz')).toBe('CΔ7');
    expect(chordSymbol('C', getChord('dim7')!, 'jazz')).toBe('C°7');
    // A chord without a jazz suffix keeps its standard one.
    expect(chordSymbol('G', getChord('dom7')!, 'jazz')).toBe('G7');
  });

  it('adds the bass of a slash chord', () => {
    expect(chordSymbol('A', getChord('min7')!, 'standard', 'E')).toBe('Am7/E');
    expect(chordSymbol('E♭', getChord('min7b5')!, 'jazz', 'B♭')).toBe('E♭ø/B♭');
  });
});

describe('chordPanelView in the display style', () => {
  it('writes the symbol in the chosen style, with the bass', () => {
    const settings = defaultSettings();
    const active = { root: 'C', chord: getChord('maj7')!, fromScale: false, bass: 'E' };
    expect(chordPanelView(settings, active).symbol).toBe('Cmaj7/E');
    settings.chordSymbols = 'jazz';
    expect(chordPanelView(settings, active).symbol).toBe('CΔ7/E');
  });
});
