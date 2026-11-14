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
