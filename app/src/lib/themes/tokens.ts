/**
 * The theme token contract (ADR-11, ADR-19): every theme sets exactly these CSS custom
 * properties, as opaque `#rrggbb`, for each scheme it has. What each one is for:
 * docs/theme-tokens.md. Renaming or removing a token breaks user themes.
 */

/** The two colour schemes a theme can define (ADR-40). */
export const SCHEMES = ['light', 'dark'] as const;
export type Scheme = (typeof SCHEMES)[number];

/** The degree palette, indexed by semitones above the root. */
export const DEGREE_TOKENS = Array.from({ length: 12 }, (_, i) => `--degree-${i}`);

export const SURFACE_TOKENS = ['--surface', '--surface-raised', '--surface-sunken'];

export const TOKENS: readonly string[] = [
  ...SURFACE_TOKENS,
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
  '--fretboard-selected',
  ...DEGREE_TOKENS,
];

/** One scheme's values: token name to `#rrggbb` (lowercase). */
export type Tokens = Readonly<Record<string, string>>;

/** A token value: an opaque colour, so contrast doesn't depend on what is underneath. */
export const COLOUR = /^#[0-9a-f]{6}$/i;
