// What the sheet draws for each kind of item (ADR-43), from the real WASM core.
import { describe, expect, it } from 'vitest';
import { explorerView } from '../explorer/view';
import { defaultSettings } from '../settings';
import { chordItem, scaleItem, tabItem, voicingItem } from './capture';
import type { SheetItem } from './schema';
import { sheetItemView } from './view';

function settings() {
  const s = defaultSettings();
  s.lastView = { root: 'A', scale: 'minor-pentatonic' };
  s.tab.highlight = true;
  return s;
}

describe('sheet item view', () => {
  it('draws a scale as the explorer does, with the position highlighted', () => {
    const s = settings();
    const view = sheetItemView(scaleItem(s));
    expect(view.kind).toBe('fretboard');
    if (view.kind !== 'fretboard') return;
    expect(view.title).toBe('A Minor pentatonic');
    expect(view.caption).toBe('Standard tuning (6 strings)');
    expect(view.dots).toEqual(explorerView(s).dots);
    expect(view.dots.some((d) => d.role === 'dim')).toBe(true);
  });

  it('draws a tab of the stored position', () => {
    const s = settings();
    s.instrument.capo = 2;
    const view = sheetItemView(tabItem(s, 1));
    expect(view.kind).toBe('tab');
    if (view.kind !== 'tab') return;
    expect(view.title).toBe('A Minor pentatonic, Pattern 2 (from C)');
    expect(view.caption).toBe('Standard tuning (6 strings), capo 2');
    expect(view.capo).toBe(2);
    expect(view.strings).toHaveLength(6);
    expect(view.notes.length).toBeGreaterThan(0);
  });

  it('draws a chord alone, or over its scale, named in the stored style', () => {
    const s = settings();
    s.chordSymbols = 'jazz';
    const alone = sheetItemView(chordItem(s, { root: 'C', chordId: 'maj7', fromScale: false }));
    expect(alone.kind === 'fretboard' && alone.title).toBe('CΔ7');
    if (alone.kind === 'fretboard') {
      expect(alone.dots.every((d) => d.role !== 'dim')).toBe(true);
    }

    s.lastView = { root: 'C', scale: 'major' };
    const over = sheetItemView(chordItem(s, { root: 'G', chordId: 'dom7', fromScale: true }));
    expect(over.kind === 'fretboard' && over.title).toBe('G7 over C Major');
    if (over.kind === 'fretboard') expect(over.dots.some((d) => d.role === 'dim')).toBe(true);
  });

  it('finds a stored shape again and draws it as a diagram', () => {
    const s = settings();
    s.leftHanded = true;
    const view = sheetItemView(voicingItem(s, { root: 'C', chordId: 'major' }, 'x,3,2,0,1,0'));
    expect(view.kind).toBe('diagram');
    if (view.kind !== 'diagram') return;
    expect(view.title).toBe('C: x32010');
    expect(view.leftHanded).toBe(true);
    expect(view.voicing.strings.map((n) => (n ? n.fret : null))).toEqual([null, 3, 2, 0, 1, 0]);
    expect(view.label(view.voicing.strings[1]!)).toBe('C');
  });

  it.each<[string, SheetItem, RegExp]>([
    [
      'a scale',
      {
        ...scaleItem(settings()),
        view: { ...scaleItem(settings()).view, lastView: { root: 'A', scale: 'gone' } },
      },
      /scale “gone” no longer exists/,
    ],
    [
      'a tuning',
      {
        ...tabItem(settings(), null),
        view: {
          ...tabItem(settings(), null).view,
          instrument: { ...settings().instrument, tuning: 'gone' },
        },
      },
      /tuning “gone” no longer exists/,
    ],
    [
      'a chord',
      {
        ...chordItem(settings(), { root: 'C', chordId: 'major', fromScale: false }),
        chord: { root: 'C', id: 'gone', overScale: false },
      },
      /chord “gone” no longer exists/,
    ],
    [
      'a root',
      {
        ...chordItem(settings(), { root: 'C', chordId: 'major', fromScale: false }),
        chord: { root: 'H', id: 'major', overScale: false },
      },
      /“H” is not a note name/,
    ],
    [
      'a shape',
      voicingItem(settings(), { root: 'C', chordId: 'major' }, '0,0,0,0,0,0'),
      /shape 0,0,0,0,0,0 is not a voicing of C/,
    ],
  ])('shows an item whose %s is gone as missing', (_, item, reason) => {
    const view = sheetItemView(item);
    expect(view.kind).toBe('missing');
    if (view.kind === 'missing') expect(view.reason).toMatch(reason);
  });
});
