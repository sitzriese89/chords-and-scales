// The sheet file `sheet.toml` (ADR-43): round trips, defaults, and broken files and items.
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../settings';
import {
  emptySheet,
  parseSheet,
  serializeSheet,
  viewOf,
  type ParsedSheet,
  type Sheet,
  type SheetItem,
} from './schema';

function view(change: (s: ReturnType<typeof defaultSettings>) => void = () => {}) {
  const settings = defaultSettings();
  change(settings);
  return viewOf(settings);
}

const scale: SheetItem = {
  kind: 'scale',
  view: view((s) => {
    s.lastView = { root: 'Db', scale: 'dorian' };
    s.accidentals = 'flats';
    s.labels = 'intervals';
    s.leftHanded = true;
    s.instrument = { kind: 'guitar', strings: 7, tuning: 'guitar-7-standard', frets: 22, capo: 2 };
  }),
};
const tab: SheetItem = {
  kind: 'tab',
  view: view((s) => {
    s.tab = { ...s.tab, system: 'window', windowStart: 7, windowSpan: 5, direction: 'both' };
  }),
};
const chord: SheetItem = {
  kind: 'chord',
  view: view((s) => (s.lastView = { root: 'C', scale: 'major' })),
  chord: { root: 'G', id: 'dom7', overScale: true },
};
const slash: SheetItem = {
  kind: 'chord',
  view: view((s) => (s.chordSymbols = 'jazz')),
  chord: { root: 'A', id: 'min7', overScale: false, bass: 'E' },
};
const voicing: SheetItem = {
  kind: 'voicing',
  view: view((s) => (s.voicings = { ...s.voicings, maxSpan: 5, openStrings: false, startFret: 5 })),
  chord: { root: 'C', id: 'major', overScale: false, shape: 'x,3,2,0,1,0' },
};

function ok(parsed: ParsedSheet) {
  if (!parsed.ok) throw new Error(`unusable: ${parsed.reason}`);
  return parsed;
}

describe('sheet file', () => {
  it('reads back every kind of item, the title and the theme', () => {
    const sheet: Sheet = {
      title: 'Jazz practice',
      themeId: 'high-contrast',
      scheme: 'dark',
      items: [scale, tab, chord, slash, voicing],
    };
    const text = serializeSheet(sheet);
    expect(text).toMatch(/^version = 1$/m);
    expect(text).toContain('[[item]]');
    const parsed = ok(parseSheet(text));
    expect(parsed.problems).toEqual([]);
    // What each kind doesn't use is not written, so it reads back as the default.
    const expected = [scale, tab, chord, slash, voicing].map((item) => {
      const copy = structuredClone(item);
      const d = defaultSettings();
      if (copy.kind === 'scale' || copy.kind === 'tab') copy.view.voicings = d.voicings;
      if (copy.kind === 'chord' || copy.kind === 'voicing') copy.view.tab = d.tab;
      if (copy.kind === 'chord') copy.view.voicings = d.voicings;
      if (copy.kind === 'voicing' || (copy.kind === 'chord' && !copy.chord.overScale)) {
        copy.view.lastView = d.lastView;
      }
      return copy;
    });
    expect(parsed.sheet).toEqual({ ...sheet, items: expected });
  });

  it('reads a minimal hand-written file with the defaults', () => {
    const parsed = ok(
      parseSheet(`version = 1
[[item]]
kind = "scale"
scale = { root = "E", scale = "minor-pentatonic" }
`),
    );
    expect(parsed.problems).toEqual([]);
    expect(parsed.sheet.title).toBe('Sheet');
    expect(parsed.sheet.themeId).toBe('print');
    expect(parsed.sheet.scheme).toBe('light');
    expect(parsed.sheet.items).toEqual([
      {
        kind: 'scale',
        view: view((s) => (s.lastView = { root: 'E', scale: 'minor-pentatonic' })),
      },
    ]);
  });

  it('writes an empty sheet that reads back empty', () => {
    expect(ok(parseSheet(serializeSheet(emptySheet()))).sheet).toEqual(emptySheet());
  });

  it.each([
    ['not [toml', /not valid TOML/],
    ['title = "x"', /no version/],
    ['version = 99', /newer version/],
    ['version = "one"', /not a whole number/],
  ])('refuses the whole file %j', (text, reason) => {
    const parsed = parseSheet(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toMatch(reason);
  });

  it('drops an item it cannot draw, with a warning, and keeps the others', () => {
    const good = serializeSheet({ ...emptySheet(), items: [scale, chord] });
    const broken = `${good}
[[item]]
kind = "poster"

[[item]]
kind = "chord"
chord = { id = "major" }

[[item]]
kind = "voicing"
chord = { root = "C", id = "major", shape = "x32010" }

[[item]]
kind = "voicing"
chord = { root = "C", id = "major", shape = "x,3,2,0" }

[[item]]
kind = "tab"
scale = { root = 5, scale = "major" }

[[item]]
kind = "chord"
chord = { root = "G", id = "dom7", over_scale = true }
`;
    const parsed = ok(parseSheet(broken));
    expect(parsed.sheet.items.map((i) => i.kind)).toEqual(['scale', 'chord']);
    expect(parsed.problems).toEqual([
      'item 3 is dropped because its kind "poster" is not one of "scale", "tab", "chord", "voicing"',
      'item 4 is dropped because it has no chord root',
      'item 5 is dropped because its shape "x32010" is not frets like "x,3,2,0,1,0"',
      'item 6 is dropped because its shape "x,3,2,0" does not have 6 strings',
      'item 7 is dropped because its scale root should be a text of 1 to 64 characters, not 5',
      'item 8 is dropped because it has no scale root and it has no scale id',
    ]);
  });

  it('keeps an item with a bad optional value, using the default and saying so', () => {
    const parsed = ok(
      parseSheet(`version = 1
title = ""
theme = "sepia"
[[item]]
kind = "scale"
colour = "red"
scale = { root = "C", scale = "major" }
display = { labels = "fingers" }
instrument = { frets = 99 }
`),
    );
    expect(parsed.sheet.title).toBe('Sheet');
    expect(parsed.sheet.scheme).toBe('light');
    expect(parsed.sheet.items).toHaveLength(1);
    expect(parsed.sheet.items[0].view.labels).toBe('notes');
    expect(parsed.sheet.items[0].view.instrument.frets).toBe(24);
    expect(parsed.problems).toEqual([
      'title should be a text of 1 to 120 characters, not ""',
      'theme should be "light" or "dark", not "sepia"',
      'item 1.display.labels should be "notes" or "intervals" or "none", not "fingers"',
      'item 1.instrument.frets should be a whole number from 12 to 27, not 99',
      'item 1.colour is not a known setting',
    ]);
  });

  it('says so when item is not a list of tables', () => {
    const parsed = ok(parseSheet('version = 1\nitem = 3\n'));
    expect(parsed.sheet.items).toEqual([]);
    expect(parsed.problems).toEqual(['item should be a list of [[item]] tables']);
  });
});
