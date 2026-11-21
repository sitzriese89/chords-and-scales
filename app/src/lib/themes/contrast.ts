/**
 * The contrast rules every theme scheme must meet (ADR-19, docs/theme-tokens.md): text meets
 * WCAG AA on its background, graphics meet the WCAG non-text minimum, and the degree palette
 * stays distinguishable with colour-vision deficiencies. `tokens.test.ts` holds every built-in
 * theme to them; a user theme that misses one loads anyway, with a warning (ADR-40).
 *
 * This is colour math, not music theory, so it lives in TypeScript.
 */
import { DEGREE_TOKENS, SURFACE_TOKENS, type Tokens } from './tokens';

type Rgb = [number, number, number];

/** `#rrggbb` as 0–1 sRGB channels. */
export function parseHex(value: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as Rgb;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** WCAG 2.x relative luminance. */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio of two `#rrggbb` colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(parseHex(a)), luminance(parseHex(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Colour-vision deficiency simulation: Machado, Oliveira & Fernandes (2009), severity 1.0,
 * applied to linear RGB.
 */
export const VISION: Readonly<Record<string, readonly number[]>> = {
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
function perceived(hex: string, matrix: readonly number[]): Rgb {
  const [r, g, b] = parseHex(hex).map(toLinear);
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

/** OKLab distance between two colours as seen with the given vision. */
export function perceivedDistance(a: string, b: string, matrix: readonly number[]): number {
  const p = perceived(a, matrix);
  const q = perceived(b, matrix);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** WCAG 1.4.3 (AA): normal-size text needs 4.5:1 against its background. */
export const TEXT_MINIMUM = 4.5;
/** WCAG 1.4.11 (AA): graphics needed to understand the content need 3:1. */
export const GRAPHIC_MINIMUM = 3;

/** [foreground, background] pairs held to `TEXT_MINIMUM`. */
export const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ...['--text', '--text-muted', '--text-link', '--text-danger'].flatMap((text) =>
    SURFACE_TOKENS.map((bg) => [text, bg] as const),
  ),
  ['--accent-text', '--accent'],
  ['--accent-text', '--accent-hover'],
  ['--fretboard-dot-text', '--fretboard-dot'],
  ...DEGREE_TOKENS.map((degree) => ['--fretboard-dot-text', degree] as const),
  ['--fretboard-root-text', '--fretboard-root'],
  ['--fretboard-dim-text', '--fretboard-dim'],
];

/** [foreground, background] pairs held to `GRAPHIC_MINIMUM`. */
export const GRAPHIC_PAIRS: readonly (readonly [string, string])[] = [
  ...['--border-strong', '--accent', '--focus-ring'].flatMap((fg) =>
    SURFACE_TOKENS.map((bg) => [fg, bg] as const),
  ),
  ...[
    '--fretboard-nut',
    '--fretboard-fret',
    '--fretboard-string',
    '--fretboard-dot',
    '--fretboard-root',
    '--fretboard-focus',
    '--fretboard-capo',
    '--fretboard-selected',
    ...DEGREE_TOKENS,
  ].map((fg) => [fg, '--fretboard-wood'] as const),
];

/**
 * Smallest OKLab distance between two degree colours. About 0.02 is a just-noticeable
 * difference; dots are also labelled, so colour is never the only cue (ADR-11).
 */
export function degreeMinimum(vision: string): number {
  return vision === 'normal' ? 0.09 : 0.045;
}

const ratio = (value: number) => `${Math.floor(value * 100) / 100}:1`;

/**
 * Every contrast rule a complete scheme breaks, as readable sentences; empty if it meets all
 * of them.
 */
export function contrastProblems(tokens: Tokens): string[] {
  const problems: string[] = [];
  const pairs = [
    ...TEXT_PAIRS.map((pair) => [...pair, TEXT_MINIMUM] as const),
    ...GRAPHIC_PAIRS.map((pair) => [...pair, GRAPHIC_MINIMUM] as const),
  ];
  for (const [fg, bg, minimum] of pairs) {
    const value = contrastRatio(tokens[fg], tokens[bg]);
    if (value < minimum) {
      problems.push(`${fg} on ${bg} has a contrast of ${ratio(value)}, below ${minimum}:1`);
    }
  }
  for (const [vision, matrix] of Object.entries(VISION)) {
    const minimum = degreeMinimum(vision);
    for (let i = 0; i < DEGREE_TOKENS.length; i++) {
      for (let j = i + 1; j < DEGREE_TOKENS.length; j++) {
        const [a, b] = [DEGREE_TOKENS[i], DEGREE_TOKENS[j]];
        if (perceivedDistance(tokens[a], tokens[b], matrix) < minimum) {
          problems.push(`${a} and ${b} are too close to tell apart with ${vision} vision`);
        }
      }
    }
  }
  return problems;
}
