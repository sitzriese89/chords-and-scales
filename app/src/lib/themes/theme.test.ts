import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, THEME_STYLE_ID } from './apply';
import { BUILT_IN_THEMES, DEFAULT_THEME } from './builtin';
import { buildTheme, parseThemeFile, resolveScheme, themeCss, type Theme } from './theme';
import { TOKENS } from './tokens';

const print = BUILT_IN_THEMES.find((t) => t.id === 'print')!;

function usable(text: string) {
  const file = parseThemeFile(text);
  if (!file.ok) throw new Error(`expected a theme file, got: ${file.reason}`);
  return file;
}

/** A complete scheme block with the Default theme's values and some overrides. */
function block(scheme: 'light' | 'dark', overrides: Record<string, string> = {}): string {
  const tokens = { ...DEFAULT_THEME.schemes[scheme], ...overrides };
  const lines = TOKENS.map((t) => `  ${t}: ${tokens[t]};`).join('\n');
  return `[data-scheme="${scheme}"] {\n${lines}\n}\n`;
}

describe('parseThemeFile', () => {
  it('reads the name and both schemes, ignoring comments and color-scheme', () => {
    const file = usable(`/* My theme */
:root { --theme-name: "Solar"; }
[data-scheme='light'] { color-scheme: light; --surface: #FDF6E3; }
[data-scheme=dark] { --surface: #002b36 }
`);
    expect(file).toEqual({
      ok: true,
      name: 'Solar',
      schemes: { light: { '--surface': '#fdf6e3' }, dark: { '--surface': '#002b36' } },
      problems: [],
    });
  });

  it('names what it ignores: unknown tokens, bad values, other blocks', () => {
    const file = usable(`
:root { --theme-name: 'X'; --surface: #000000; }
body { color: red; }
@font-face { font-family: X; }
[data-scheme='light'] {
  --surface: red;
  --text: #11223344;
  --background: #ffffff;
  --text-muted: #555555;
}
`);
    expect(file.ok).toBe(true);
    expect(file.schemes.light).toEqual({ '--text-muted': '#555555' });
    expect(file.problems).toEqual([
      '":root { --surface }" was ignored: only --theme-name goes there',
      `the block "body" was ignored: use [data-scheme='light'] or [data-scheme='dark']`,
      `"@font-face" was ignored: a theme file has no at-rules`,
      'light: --surface should be an opaque #rrggbb colour, not "red"',
      'light: --text should be an opaque #rrggbb colour, not "#11223344"',
      'light: --background was ignored: it is not a theme token',
    ]);
  });

  it.each([
    ['empty', '', /no \[data-scheme='light'\] or \[data-scheme='dark'\] block/],
    ['only a name', ':root { --theme-name: "X"; }', /no \[data-scheme/],
    ['unclosed', "[data-scheme='light'] { --surface: #ffffff;", /not closed/],
    ['nested', "[data-scheme='light'] { a { --surface: #ffffff; } }", /block inside it/],
    ['stray text', "[data-scheme='light'] { } trailing", /"trailing" is not part of a block/],
    ['unclosed comment', "/* [data-scheme='light'] { }", /comment is not closed/],
  ])('rejects a file that is %s', (_, text, reason) => {
    const file = parseThemeFile(text);
    expect(file.ok).toBe(false);
    expect(!file.ok && file.reason).toMatch(reason);
  });
});

describe('buildTheme', () => {
  it('fills missing tokens from the fallback scheme and says which', () => {
    const theme = buildTheme(
      'solar-flare',
      usable(`[data-scheme='dark'] { --surface: #000000; --text: #ffffff; }`),
      DEFAULT_THEME,
      'theme-solar-flare.css',
    );
    expect(theme.name).toBe('Solar flare');
    expect(theme.document).toBe('theme-solar-flare.css');
    expect(Object.keys(theme.schemes)).toEqual(['dark']);
    expect(theme.schemes.dark).toEqual({
      ...DEFAULT_THEME.schemes.dark,
      '--surface': '#000000',
      '--text': '#ffffff',
    });
    expect(theme.problems).toHaveLength(1);
    expect(theme.problems[0]).toMatch(
      /^dark: --surface-raised, .*--degree-11 are missing and use the Default theme's value$/,
    );
  });

  it('keeps colours that fail contrast and reports each failure', () => {
    const theme = buildTheme(
      'pale',
      usable(block('light', { '--text': '#dddddd' })),
      DEFAULT_THEME,
    );
    expect(theme.schemes.light!['--text']).toBe('#dddddd');
    expect(theme.problems).toEqual([
      expect.stringMatching(/^light: --text on --surface has a contrast of 1\.\d+:1, below 4.5:1$/),
      expect.stringMatching(/^light: --text on --surface-raised /),
      expect.stringMatching(/^light: --text on --surface-sunken /),
    ]);
  });

  it('reports nothing for a complete theme that meets every rule', () => {
    const theme = buildTheme('copy', usable(block('light') + block('dark')), DEFAULT_THEME);
    expect(theme.problems).toEqual([]);
  });
});

describe('resolveScheme', () => {
  it('follows the OS for "system" and the setting otherwise', () => {
    expect(resolveScheme(DEFAULT_THEME, 'system', false)).toBe('light');
    expect(resolveScheme(DEFAULT_THEME, 'system', true)).toBe('dark');
    expect(resolveScheme(DEFAULT_THEME, 'dark', false)).toBe('dark');
    expect(resolveScheme(DEFAULT_THEME, 'light', true)).toBe('light');
  });

  it("shows a one-scheme theme's only scheme whatever is asked", () => {
    expect(resolveScheme(print, 'dark', true)).toBe('light');
    expect(resolveScheme(print, 'system', true)).toBe('light');
  });
});

describe('themeCss', () => {
  it('writes one data-scheme block per scheme with color-scheme and every token', () => {
    const css = themeCss(DEFAULT_THEME);
    expect(css).toContain("[data-scheme='light'] {\n  color-scheme: light;\n  --surface: #f7f6f3;");
    expect(css).toContain("[data-scheme='dark'] {\n  color-scheme: dark;\n  --surface: #171615;");
    expect(themeCss(print)).not.toContain("[data-scheme='dark']");
  });

  it('scopes every block to a selector when asked, for a sheet inside the app (ADR-43)', () => {
    const css = themeCss(DEFAULT_THEME, '[data-sheet]');
    expect(css).toContain("[data-sheet][data-scheme='light'] {\n  color-scheme: light;");
    expect(css).toContain("[data-sheet][data-scheme='dark'] {\n  color-scheme: dark;");
    expect(css).not.toMatch(/^\[data-scheme/m);
  });

  it('reads back as the same theme', () => {
    for (const theme of BUILT_IN_THEMES) {
      const again = buildTheme(theme.id, usable(themeCss(theme)), null);
      expect(again.schemes).toEqual(theme.schemes);
    }
  });
});

describe('applyTheme', () => {
  const root = document.documentElement;
  const surface = () => getComputedStyle(root).getPropertyValue('--surface').trim();

  /** A stand-in for `matchMedia` whose dark preference can be flipped. */
  function fakeOs(dark: boolean) {
    const listeners = new Set<() => void>();
    const list = {
      get matches() {
        return dark;
      },
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    } as unknown as MediaQueryList;
    return {
      matchMedia: () => list,
      listeners,
      set(value: boolean) {
        dark = value;
        listeners.forEach((l) => l());
      },
    };
  }

  afterEach(() => {
    document.getElementById(THEME_STYLE_ID)?.remove();
    delete root.dataset.scheme;
  });

  it('puts the theme in one style element and the scheme on the root', () => {
    applyTheme(DEFAULT_THEME, 'dark', { matchMedia: undefined });
    expect(root.dataset.scheme).toBe('dark');
    expect(surface()).toBe('#171615');
    applyTheme(print, 'dark', { matchMedia: undefined });
    expect(document.querySelectorAll(`#${THEME_STYLE_ID}`)).toHaveLength(1);
    expect(root.dataset.scheme).toBe('light');
    expect(surface()).toBe('#ffffff');
  });

  it('follows the OS preference for "system" until stopped', () => {
    const os = fakeOs(false);
    const stop = applyTheme(DEFAULT_THEME, 'system', { matchMedia: os.matchMedia });
    expect(root.dataset.scheme).toBe('light');
    os.set(true);
    expect(root.dataset.scheme).toBe('dark');
    expect(surface()).toBe('#171615');
    stop();
    expect(os.listeners.size).toBe(0);
    os.set(false);
    expect(root.dataset.scheme).toBe('dark');
  });

  it('ignores the OS when a scheme is chosen', () => {
    const os = fakeOs(true);
    applyTheme(DEFAULT_THEME, 'light', { matchMedia: os.matchMedia });
    expect(root.dataset.scheme).toBe('light');
    expect(os.listeners.size).toBe(0);
  });

  it('shows light without matchMedia (jsdom) for "system"', () => {
    applyTheme(DEFAULT_THEME as Theme, 'system');
    expect(root.dataset.scheme).toBe('light');
    expect(surface()).toBe('#f7f6f3');
  });
});
