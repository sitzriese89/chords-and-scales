// The sheet store on both Storage implementations (ADR-4, ADR-43): what is added survives a
// restart, broken files are kept and reported, every change is saved.
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../settings';
import { BrowserStorage, TauriStorage, type Storage } from '../storage';
import { fakeCommands } from '../storage/fake-commands';
import { chordItem, scaleItem, tabItem, voicingItem } from './capture';
import { SHEET_BACKUP_DOCUMENT, SHEET_DOCUMENT, SheetStore } from './store.svelte';

/** A fresh backing store and a way to open it again, as the app does on every start. */
const fixtures: [string, () => () => Storage][] = [
  [
    'browser',
    () => {
      window.localStorage.clear();
      return () => new BrowserStorage(window.localStorage);
    },
  ],
  [
    'Tauri (fake commands)',
    () => {
      const folder = new Map<string, string>();
      return () => new TauriStorage(fakeCommands(folder));
    },
  ],
];

function settings() {
  const s = defaultSettings();
  s.lastView = { root: 'Db', scale: 'dorian' };
  s.instrument.capo = 3;
  s.leftHanded = true;
  return s;
}

describe.each(fixtures)('sheet store: %s', (_, fixture) => {
  it('keeps a scale, a tab and a chord across a restart, in order', async () => {
    const open = fixture();
    const sheet = new SheetStore(open());
    await sheet.load();
    expect(sheet.items).toEqual([]);
    await sheet.setTitle('  Warm-up  ');
    await sheet.setTheme({ themeId: 'high-contrast', scheme: 'dark' });
    await sheet.add(scaleItem(settings()));
    await sheet.add(tabItem(settings(), 2));
    await sheet.add(chordItem(settings(), { root: 'G', chordId: 'dom7', fromScale: false }));
    await sheet.add(voicingItem(settings(), { root: 'C', chordId: 'major' }, 'x,3,2,0,1,0'));

    const again = new SheetStore(open());
    await again.load();
    expect(again.warning).toBeNull();
    expect(again.title).toBe('Warm-up');
    expect(again.themeId).toBe('high-contrast');
    expect(again.scheme).toBe('dark');
    expect(again.items.map((e) => e.item.kind)).toEqual(['scale', 'tab', 'chord', 'voicing']);
    const [scale, tab, chord, voicing] = again.items.map((e) => e.item);
    expect(scale.view.lastView).toEqual({ root: 'Db', scale: 'dorian' });
    expect(scale.view.instrument.capo).toBe(3);
    expect(scale.view.leftHanded).toBe(true);
    expect(tab.view.tab.pattern).toBe(2);
    expect(chord.kind === 'chord' && chord.chord).toEqual({
      root: 'G',
      id: 'dom7',
      overScale: false,
    });
    expect(voicing.kind === 'voicing' && voicing.chord.shape).toBe('x,3,2,0,1,0');
  });

  it('saves moving and removing items', async () => {
    const open = fixture();
    const sheet = new SheetStore(open());
    await sheet.load();
    await sheet.add(scaleItem(settings()));
    await sheet.add(tabItem(settings(), null));
    await sheet.add(chordItem(settings(), { root: 'G', chordId: 'dom7', fromScale: false }));
    const [first, second, third] = sheet.items.map((e) => e.key);
    await sheet.move(third, -1);
    await sheet.move(first, -1); // already first: stays
    await sheet.remove(second);
    expect(sheet.items.map((e) => e.key)).toEqual([first, third]);

    const again = new SheetStore(open());
    await again.load();
    expect(again.items.map((e) => e.item.kind)).toEqual(['scale', 'chord']);
  });

  it('keeps an unusable file as a backup and starts empty, with a warning', async () => {
    const open = fixture();
    await open().write(SHEET_DOCUMENT, 'not [toml');
    const sheet = new SheetStore(open());
    await sheet.load();
    expect(sheet.items).toEqual([]);
    expect(sheet.warning).toMatch(/could not be used because it is not valid TOML/);
    expect(await open().read(SHEET_BACKUP_DOCUMENT)).toBe('not [toml');
    expect(await open().read(SHEET_DOCUMENT)).toMatch(/^version = 1$/m);
  });

  it('loads the good items of a file with a broken one and names it', async () => {
    const open = fixture();
    await open().write(
      SHEET_DOCUMENT,
      `version = 1
[[item]]
kind = "scale"
scale = { root = "A", scale = "minor" }

[[item]]
kind = "chord"
`,
    );
    const sheet = new SheetStore(open());
    await sheet.load();
    expect(sheet.items.map((e) => e.item.kind)).toEqual(['scale']);
    expect(sheet.warning).toMatch(/item 2 is dropped because it has no chord root/);
    // The file is left alone until the sheet changes.
    expect(await open().read(SHEET_DOCUMENT)).toMatch(/kind = "chord"/);
  });

  it('does not write a file until something changes', async () => {
    const open = fixture();
    const sheet = new SheetStore(open());
    await sheet.load();
    expect(await open().read(SHEET_DOCUMENT)).toBeNull();
  });
});

describe('sheet items from the app', () => {
  it('copy the settings, so later changes leave them alone', () => {
    const s = settings();
    const item = scaleItem(s);
    s.lastView.root = 'E';
    s.instrument.capo = 0;
    expect(item.view.lastView.root).toBe('Db');
    expect(item.view.instrument.capo).toBe(3);
  });

  it('store what the app shows for a stored scale or tuning that is gone', () => {
    const s = settings();
    s.lastView.scale = 'no-such-scale';
    s.instrument.tuning = 'no-such-tuning';
    const item = scaleItem(s);
    expect(item.view.lastView).toEqual({ root: 'Db', scale: 'major' });
    expect(item.view.instrument.tuning).toBe('guitar-6-standard');
  });
});
