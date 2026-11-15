import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../settings';
import { displayRoot, explorerView, rootChoices } from './view';

describe('explorer view model', () => {
  it('offers every root with sharps and with flats, from the core', () => {
    expect(rootChoices()).toEqual([
      'C',
      'C♯',
      'D♭',
      'D',
      'D♯',
      'E♭',
      'E',
      'F',
      'F♯',
      'G♭',
      'G',
      'G♯',
      'A♭',
      'A',
      'A♯',
      'B♭',
      'B',
    ]);
  });

  it('reads typed roots through the core, keeping their spelling', () => {
    expect(displayRoot(' db ')).toBe('D♭');
    expect(displayRoot('F##')).toBe('F𝄪');
    expect(displayRoot('H')).toBeUndefined();
    expect(displayRoot('')).toBeUndefined();
  });

  it('uses the scale’s own interval labels, not the default ones', () => {
    const settings = defaultSettings();
    settings.labels = 'intervals';
    settings.lastView = { root: 'C', scale: 'lydian' };
    const view = explorerView(settings);
    // F♯ on the high E string, fret 2: ♯4 in Lydian (the default label would be ♭5).
    expect(view.dots.find((d) => d.string === 1 && d.fret === 2)?.label).toBe('♯4');
  });

  it('dims the notes outside the tab position and orders the tab by direction', () => {
    const settings = defaultSettings();
    settings.lastView = { root: 'G', scale: 'major' };
    settings.tab = { ...settings.tab, system: 'window', windowStart: 2, windowSpan: 4 };
    const view = explorerView(settings);
    const shown = view.dots.filter((d) => d.role !== 'dim');
    expect(shown.length).toBe(view.position.positions.length);
    expect(shown.every((d) => d.fret >= 2 && d.fret <= 5)).toBe(true);
    expect(view.tabNotes[0]).toEqual({ string: 6, fret: 2, root: false });
    expect(view.tabNotes[1]).toEqual({ string: 6, fret: 3, root: true });

    settings.tab.direction = 'descending';
    expect(explorerView(settings).tabNotes.at(-1)).toEqual({ string: 6, fret: 2, root: false });

    settings.tab.highlight = false;
    expect(explorerView(settings).dots.some((d) => d.role === 'dim')).toBe(false);
  });

  it('dims nothing when the position is empty', () => {
    const settings = defaultSettings();
    settings.tab = { ...settings.tab, system: 'window', windowStart: 26, windowSpan: 2 };
    const view = explorerView(settings);
    expect(view.position.positions).toEqual([]);
    expect(view.dots.some((d) => d.role === 'dim')).toBe(false);
  });

  it('leaves out frets below the capo', () => {
    const settings = defaultSettings();
    settings.instrument.capo = 3;
    const view = explorerView(settings);
    expect(Math.min(...view.dots.map((d) => d.fret))).toBe(3);
    expect(view.fallbacks).toEqual([]);
  });

  it('falls back to the default tuning for an unknown one', () => {
    const settings = defaultSettings();
    settings.instrument.tuning = 'guitar-6-nope';
    const view = explorerView(settings);
    expect(view.tuning.id).toBe('guitar-6-standard');
    expect(view.fallbacks).toEqual([
      'There is no tuning “guitar-6-nope”; showing Standard (6 strings).',
    ]);
  });
});
