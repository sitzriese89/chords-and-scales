// User theme files through both Storage implementations (ADR-4, ADR-40).
import { describe, expect, it } from 'vitest';
import { BrowserStorage, TauriStorage, type Storage } from '../storage';
import { fakeCommands } from '../storage/fake-commands';
import { DEFAULT_THEME } from './builtin';
import { ThemeLibrary, themeIdOf } from './library.svelte';

const SOLAR = `:root { --theme-name: 'Solar'; }
[data-scheme='light'] { --surface: #fdf6e3; }
`;

/** Each implementation on a fresh, empty store. */
const implementations: [string, () => Storage][] = [
  [
    'browser',
    () => {
      window.localStorage.clear();
      return new BrowserStorage(window.localStorage);
    },
  ],
  ['Tauri', () => new TauriStorage(fakeCommands())],
];

describe('themeIdOf', () => {
  it.each([
    ['theme-solar.css', 'solar'],
    ['theme-high-contrast.css', 'high-contrast'],
    ['theme-.css', null],
    ['theme-solar', null],
    ['themes.css', null],
    ['settings', null],
  ])('%s → %s', (document, id) => {
    expect(themeIdOf(document)).toBe(id);
  });
});

describe.each(implementations)('ThemeLibrary on %s storage', (_, open) => {
  it('offers the built-ins alone when there are no theme files', async () => {
    const library = new ThemeLibrary(open());
    await library.load();
    expect(library.themes.map((t) => t.id)).toEqual(['default', 'high-contrast', 'print']);
    expect(library.userThemes).toEqual([]);
    expect(library.problems).toEqual([]);
  });

  it('loads theme-*.css documents after the built-ins, missing tokens from Default', async () => {
    const storage = open();
    await storage.write('theme-solar.css', SOLAR);
    await storage.write('scales', '');
    const library = new ThemeLibrary(storage);
    await library.load();
    expect(library.themes.map((t) => t.name)).toEqual([
      'Default',
      'High contrast',
      'Print',
      'Solar',
    ]);
    const solar = library.get('solar');
    expect(solar.document).toBe('theme-solar.css');
    expect(solar.schemes.light!['--surface']).toBe('#fdf6e3');
    expect(solar.schemes.light!['--text']).toBe(DEFAULT_THEME.schemes.light!['--text']);
    expect(solar.schemes.dark).toBeUndefined();
    expect(library.problems).toEqual([
      expect.stringMatching(/^theme-solar\.css: light: --surface-raised, .* are missing/),
    ]);
  });

  it('leaves out a file that is not a theme file, and says why', async () => {
    const storage = open();
    await storage.write('theme-broken.css', 'body { color: red; ');
    const library = new ThemeLibrary(storage);
    await library.load();
    expect(library.userThemes).toEqual([]);
    expect(library.problems).toEqual([
      'theme-broken.css is not used because the block "body" is not closed',
    ]);
  });

  it('lets a user theme replace the built-in with its id', async () => {
    const storage = open();
    await storage.write(
      'theme-print.css',
      ":root { --theme-name: 'My print'; }\n" + SOLAR.split('\n')[1],
    );
    const library = new ThemeLibrary(storage);
    await library.load();
    expect(library.builtIn.map((t) => t.id)).toEqual(['default', 'high-contrast']);
    expect(library.get('print').name).toBe('My print');
  });

  it('gives the Default theme for an id that names no theme', async () => {
    const library = new ThemeLibrary(open());
    await library.load();
    expect(library.get('gone')).toBe(DEFAULT_THEME);
  });
});

describe('ThemeLibrary', () => {
  it('reports a storage that fails and keeps the built-ins', async () => {
    const storage = new TauriStorage(async () => {
      throw 'disk on fire';
    });
    const library = new ThemeLibrary(storage);
    await library.load();
    expect(library.themes).toHaveLength(3);
    expect(library.problems).toEqual(['Theme files could not be listed: disk on fire']);
  });
});
