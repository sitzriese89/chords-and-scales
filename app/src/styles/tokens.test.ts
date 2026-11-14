// Checks the theme tokens in tokens.css (ADR-11, ADR-19): both themes define the full token
// contract, every token is documented, text meets WCAG AA on its surface, graphics meet the
// WCAG non-text minimum, and the degree palette stays distinguishable with colour-vision
// deficiencies. The values are read from the CSS itself, so there is one source.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The token contract. Renaming or removing a token breaks user themes (ADR-11). */
const DEGREES = Array.from({ length: 12 }, (_, i) => `--degree-${i}`);
const TOKENS = [
  '--surface',
  '--surface-raised',
  '--surface-sunken',
  '--border',
  '--border-strong',
  '--text',
  '--text-muted',
  '--text-link',
  '--text-danger',
  '--accent',
  '--accent-hover',
  '--accent-text',
  '--focus-ring',
  '--fretboard-wood',
  '--fretboard-nut',
  '--fretboard-fret',
  '--fretboard-string',
  '--fretboard-inlay',
  '--fretboard-dot',
  '--fretboard-dot-text',
  '--fretboard-root',
  '--fretboard-root-text',
  '--fretboard-dim',
  '--fretboard-dim-text',
  '--fretboard-focus',
  '--fretboard-capo',
  ...DEGREES,
];

type Theme = Map<string, string>;

/** Reads the custom properties of one rule, plus its `color-scheme`. */
function declarations(rule: CSSStyleRule): Theme {
  const theme: Theme = new Map();
  for (const name of Array.from(rule.style)) {
    theme.set(name, rule.style.getPropertyValue(name).trim());
  }
  return theme;
}

/** Parses tokens.css with the browser CSS parser and returns its three theme blocks. */
function parseTokens(source: string) {
  const style = document.createElement('style');
  style.textContent = source;
  document.head.append(style);
  try {
    const rules = Array.from(style.sheet!.cssRules);
    const bySelector = (list: CSSRule[], selector: string) => {
      const found = list.filter(
        (r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText === selector,
      );
      expect(found, `exactly one rule for ${selector}`).toHaveLength(1);
      return declarations(found[0]);
    };
    const media = rules.filter(
      (r): r is CSSMediaRule =>
        r instanceof CSSMediaRule && r.media.mediaText === '(prefers-color-scheme: dark)',
    );
    expect(media, 'exactly one prefers-color-scheme: dark block').toHaveLength(1);
    return {
      light: bySelector(rules, ':root'),
      darkFromOs: bySelector(Array.from(media[0].cssRules), ':root:not([data-theme="light"])'),
      darkForced: bySelector(rules, ':root[data-theme="dark"]'),
    };
  } finally {
    style.remove();
  }
}

// --- Colour math -------------------------------------------------------------------------

type Rgb = [number, number, number];

function parseHex(value: string): Rgb {
  expect(value, 'token values are opaque #rrggbb').toMatch(/^#[0-9a-f]{6}$/);
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as Rgb;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** WCAG 2.x relative luminance. */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1 to 21. */
function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Colour-vision deficiency simulation: Machado, Oliveira & Fernandes (2009), severity 1.0,
 * applied to linear RGB.
 */
const VISION = {
  normal: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  protanopia: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039,
  ],
};

/** The colour as seen with the given vision, in OKLab. */
function perceived(rgb: Rgb, matrix: number[]): Rgb {
  const [r, g, b] = rgb.map(toLinear);
  const sim = [0, 3, 6].map((i) =>
    Math.min(1, Math.max(0, matrix[i] * r + matrix[i + 1] * g + matrix[i + 2] * b)),
  );
  const l = Math.cbrt(0.4122214708 * sim[0] + 0.5363325363 * sim[1] + 0.0514459929 * sim[2]);
  const m = Math.cbrt(0.2119034982 * sim[0] + 0.6806995451 * sim[1] + 0.1073969566 * sim[2]);
  const s = Math.cbrt(0.0883024619 * sim[0] + 0.2817188376 * sim[1] + 0.6299787005 * sim[2]);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const distance = (p: Rgb, q: Rgb) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

// --- Tests -------------------------------------------------------------------------------

// Read from disk: vitest doesn't load CSS imports, not even with ?raw.
const themes = parseTokens(readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8'));
const THEMES = { light: themes.light, dark: themes.darkForced };

/** WCAG 1.4.3 (AA): normal-size text needs 4.5:1 against its background. */
const TEXT_ON = [
  ...['--text', '--text-muted', '--text-link', '--text-danger'].flatMap((text) =>
    ['--surface', '--surface-raised', '--surface-sunken'].map((bg) => [text, bg]),
  ),
  ['--accent-text', '--accent'],
  ['--accent-text', '--accent-hover'],
  ['--fretboard-dot-text', '--fretboard-dot'],
  ...DEGREES.map((degree) => ['--fretboard-dot-text', degree]),
  ['--fretboard-root-text', '--fretboard-root'],
  ['--fretboard-dim-text', '--fretboard-dim'],
];

/** WCAG 1.4.11 (AA): graphics needed to understand the content need 3:1 against neighbours. */
const GRAPHIC_ON = [
  ...['--border-strong', '--accent', '--focus-ring'].flatMap((fg) =>
    ['--surface', '--surface-raised', '--surface-sunken'].map((bg) => [fg, bg]),
  ),
  ...[
    '--fretboard-nut',
    '--fretboard-fret',
    '--fretboard-string',
    '--fretboard-dot',
    '--fretboard-root',
    '--fretboard-focus',
    '--fretboard-capo',
    ...DEGREES,
  ].map((fg) => [fg, '--fretboard-wood']),
];

describe('theme tokens', () => {
  it('defines the dark theme identically for the OS preference and for data-theme', () => {
    expect(Object.fromEntries(themes.darkFromOs)).toEqual(Object.fromEntries(themes.darkForced));
  });

  for (const [name, theme] of Object.entries(THEMES)) {
    describe(`${name} theme`, () => {
      it('sets color-scheme so native controls match', () => {
        expect(theme.get('color-scheme')).toBe(name);
      });

      it('defines exactly the token contract, all as #rrggbb', () => {
        const defined = [...theme.keys()].filter((key) => key.startsWith('--'));
        expect(defined.sort()).toEqual([...TOKENS].sort());
        for (const token of TOKENS) parseHex(theme.get(token)!);
      });

      it.each(TEXT_ON)('%s on %s meets WCAG AA for text (4.5:1)', (fg, bg) => {
        const ratio = contrastRatio(parseHex(theme.get(fg)!), parseHex(theme.get(bg)!));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });

      it.each(GRAPHIC_ON)('%s on %s meets WCAG AA for graphics (3:1)', (fg, bg) => {
        const ratio = contrastRatio(parseHex(theme.get(fg)!), parseHex(theme.get(bg)!));
        expect(ratio).toBeGreaterThanOrEqual(3);
      });

      it.each(Object.entries(VISION))(
        'keeps the 12 degree colours apart with %s vision',
        (vision, matrix) => {
          // Minimum OKLab distance between any two degrees. About 0.02 is a just-noticeable
          // difference; dots are also labelled, so colour is never the only cue (ADR-11).
          const minimum = vision === 'normal' ? 0.09 : 0.045;
          const colours = DEGREES.map((d) => perceived(parseHex(theme.get(d)!), matrix));
          for (let i = 0; i < colours.length; i++) {
            for (let j = i + 1; j < colours.length; j++) {
              expect(
                distance(colours[i], colours[j]),
                `${DEGREES[i]} vs ${DEGREES[j]}`,
              ).toBeGreaterThanOrEqual(minimum);
            }
          }
        },
      );
    });
  }

  it('documents every token in docs/theme-tokens.md', () => {
    const docs = readFileSync(join(import.meta.dirname, '../../../docs/theme-tokens.md'), 'utf8');
    // One table row per token: | `--name` | ...
    const documented = [...docs.matchAll(/^\| `(--[a-z0-9-]+)` \|/gm)].map((m) => m[1]);
    expect(documented.sort()).toEqual([...TOKENS].sort());
  });
});
