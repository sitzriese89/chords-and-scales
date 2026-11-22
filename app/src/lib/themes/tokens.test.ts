// Checks every built-in theme (ADR-11, ADR-19, ADR-40): each scheme defines exactly the token
// contract, text meets WCAG AA on its surface, graphics meet the WCAG non-text minimum, and
// the degree palette stays distinguishable with colour-vision deficiencies. The values are
// read from the theme files on disk, so there is one source; every token is documented.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_THEME_FILES, BUILT_IN_THEMES, DEFAULT_THEME_ID } from './builtin';
import {
  contrastProblems,
  contrastRatio,
  degreeMinimum,
  GRAPHIC_MINIMUM,
  GRAPHIC_PAIRS,
  perceivedDistance,
  TEXT_MINIMUM,
  TEXT_PAIRS,
  VISION,
} from './contrast';
import { parseThemeFile, schemesOf } from './theme';
import { DEGREE_TOKENS, TOKENS } from './tokens';

const THEMES_DIR = join(import.meta.dirname, '../../styles/themes');

describe('built-in themes', () => {
  it('are the CSS files in styles/themes, embedded as written', () => {
    const files = readdirSync(THEMES_DIR).filter((f) => f.endsWith('.css'));
    expect(files.map((f) => f.replace(/\.css$/, '')).sort()).toEqual(
      Object.keys(BUILT_IN_THEME_FILES).sort(),
    );
    for (const [id, text] of Object.entries(BUILT_IN_THEME_FILES)) {
      expect(text).toBe(readFileSync(join(THEMES_DIR, `${id}.css`), 'utf8'));
    }
  });

  it('are three or more, Default first, with light and dark in Default', () => {
    expect(BUILT_IN_THEMES.length).toBeGreaterThanOrEqual(3);
    expect(BUILT_IN_THEMES[0].id).toBe(DEFAULT_THEME_ID);
    expect(schemesOf(BUILT_IN_THEMES[0])).toEqual(['light', 'dark']);
  });

  it('include a print-friendly theme: light only, on white paper', () => {
    const print = BUILT_IN_THEMES.find((t) => t.id === 'print')!;
    expect(schemesOf(print)).toEqual(['light']);
    expect(print.schemes.light!['--surface']).toBe('#ffffff');
    expect(print.schemes.light!['--fretboard-wood']).toBe('#ffffff');
  });

  it.each([
    ['atom-one', 'Atom One'],
    ['catppuccin', 'Catppuccin'],
    ['dracula', 'Dracula'],
    ['nord', 'Nord'],
  ])('include %s after an editor palette, light and dark, crediting it (ADR-48)', (id, name) => {
    const ids = BUILT_IN_THEMES.map((t) => t.id);
    const theme = BUILT_IN_THEMES.find((t) => t.id === id)!;
    expect(theme.name).toBe(name);
    expect(schemesOf(theme)).toEqual(['light', 'dark']);
    // After the app's own themes, before Print.
    expect(ids.indexOf(id)).toBeGreaterThan(ids.indexOf('high-contrast'));
    expect(ids.indexOf(id)).toBeLessThan(ids.indexOf('print'));
    const header = BUILT_IN_THEME_FILES[id].slice(0, BUILT_IN_THEME_FILES[id].indexOf('*/'));
    expect(header).toMatch(/https:\/\//);
    expect(header).toMatch(/MIT/);
  });

  it('have distinct names', () => {
    const names = BUILT_IN_THEMES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  for (const theme of BUILT_IN_THEMES) {
    for (const scheme of schemesOf(theme)) {
      describe(`${theme.name} theme, ${scheme}`, () => {
        const tokens = theme.schemes[scheme]!;

        it('parses without a problem', () => {
          const file = parseThemeFile(BUILT_IN_THEME_FILES[theme.id]);
          expect(file.ok && file.problems).toEqual([]);
          expect(theme.problems).toEqual([]);
        });

        it('defines exactly the token contract, all as #rrggbb', () => {
          expect(Object.keys(tokens).sort()).toEqual([...TOKENS].sort());
          for (const token of TOKENS) expect(tokens[token]).toMatch(/^#[0-9a-f]{6}$/);
        });

        it.each(TEXT_PAIRS)(`%s on %s meets WCAG AA for text (${TEXT_MINIMUM}:1)`, (fg, bg) => {
          expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(TEXT_MINIMUM);
        });

        it.each(GRAPHIC_PAIRS)(
          `%s on %s meets WCAG AA for graphics (${GRAPHIC_MINIMUM}:1)`,
          (fg, bg) => {
            expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(GRAPHIC_MINIMUM);
          },
        );

        it.each(Object.entries(VISION))(
          'keeps the 12 degree colours apart with %s vision',
          (vision, matrix) => {
            for (let i = 0; i < DEGREE_TOKENS.length; i++) {
              for (let j = i + 1; j < DEGREE_TOKENS.length; j++) {
                const [a, b] = [DEGREE_TOKENS[i], DEGREE_TOKENS[j]];
                expect(
                  perceivedDistance(tokens[a], tokens[b], matrix),
                  `${a} vs ${b}`,
                ).toBeGreaterThanOrEqual(degreeMinimum(vision));
              }
            }
          },
        );

        it('has no contrast problem by the check user themes get', () => {
          expect(contrastProblems(tokens)).toEqual([]);
        });
      });
    }
  }
});

describe('contrastProblems', () => {
  const light = BUILT_IN_THEMES[0].schemes.light!;

  it('names each pair below its minimum', () => {
    const problems = contrastProblems({ ...light, '--text-muted': '#c0c0c0' });
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(
      /^--text-muted on --surface has a contrast of 1\.\d+:1, below 4.5:1$/,
    );
    expect(problems.every((p) => p.startsWith('--text-muted on --surface'))).toBe(true);
  });

  it('names degree colours that are too close', () => {
    const problems = contrastProblems({ ...light, '--degree-1': light['--degree-0'] });
    expect(problems).toContain(
      '--degree-0 and --degree-1 are too close to tell apart with normal vision',
    );
  });
});

describe('theme tokens', () => {
  it('documents every token in docs/theme-tokens.md', () => {
    const docs = readFileSync(
      join(import.meta.dirname, '../../../../docs/theme-tokens.md'),
      'utf8',
    );
    // One table row per token: | `--name` | ...
    const documented = [...docs.matchAll(/^\| `(--[a-z0-9-]+)` \|/gm)].map((m) => m[1]);
    expect(documented.sort()).toEqual([...TOKENS].sort());
  });
});
