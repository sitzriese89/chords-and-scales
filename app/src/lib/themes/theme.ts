/**
 * Themes (ADR-11, ADR-40): a name and the token values for a light scheme, a dark scheme or
 * both. Built-in and user themes are the same kind of CSS file:
 *
 * ```css
 * :root { --theme-name: 'Solar'; }
 * [data-scheme='light'] { --surface: #fdf6e3; ... }
 * [data-scheme='dark'] { --surface: #002b36; ... }
 * ```
 *
 * `parseThemeFile` reads one, `buildTheme` completes it, and `themeCss` writes the stylesheet
 * the app (and later the exports) apply: whatever carries `data-scheme="light"` or `"dark"`
 * gets that scheme's tokens. Format reference: docs/theme-tokens.md.
 */
import { contrastProblems } from './contrast';
import { COLOUR, SCHEMES, TOKENS, type Scheme, type Tokens } from './tokens';

/** The custom property naming a theme in the picker. */
export const NAME_PROPERTY = '--theme-name';
/** Longest theme name shown; longer ones are cut. */
export const MAX_THEME_NAME = 48;

export interface Theme {
  /** `default`, `print`, …; a user theme's is its file name without `theme-` and `.css`. */
  readonly id: string;
  readonly name: string;
  /** The document a user theme was read from (`theme-solar.css`); `null` for a built-in. */
  readonly document: string | null;
  /** The schemes the theme has, each with every token. At least one. */
  readonly schemes: Readonly<Partial<Record<Scheme, Tokens>>>;
  /** What was wrong with the file but didn't stop it loading (ADR-40). */
  readonly problems: readonly string[];
}

/** A theme file as written: the tokens it sets, which may be incomplete. */
export type ParsedThemeFile =
  | {
      ok: true;
      name: string | null;
      schemes: Partial<Record<Scheme, Record<string, string>>>;
      /** Declarations and blocks that were ignored. */
      problems: string[];
    }
  | { ok: false; reason: string };

const SCHEME_SELECTOR = /^\[\s*data-scheme\s*=\s*(['"]?)(light|dark)\1\s*\]$/;

function unquote(value: string): string {
  const match = /^(['"])(.*)\1$/.exec(value);
  return (match ? match[2] : value).trim();
}

/**
 * Reads a theme file: plain CSS with a `:root` block holding `--theme-name` and one
 * `[data-scheme='light']` and/or `[data-scheme='dark']` block of tokens. No nesting and no
 * at-rules. Never throws; a file with no scheme block, or that isn't such CSS, is unusable.
 */
export function parseThemeFile(text: string): ParsedThemeFile {
  const source = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (source.includes('/*')) return { ok: false, reason: 'a comment is not closed' };
  const problems: string[] = [];
  const schemes: Partial<Record<Scheme, Record<string, string>>> = {};
  let name: string | null = null;

  let rest = source;
  for (;;) {
    const open = rest.indexOf('{');
    if (open < 0) break;
    const selector = rest.slice(0, open).trim().replace(/\s+/g, ' ');
    const close = rest.indexOf('}', open);
    if (close < 0) return { ok: false, reason: `the block "${selector}" is not closed` };
    const body = rest.slice(open + 1, close);
    if (body.includes('{')) {
      return { ok: false, reason: `the block "${selector}" has a block inside it` };
    }
    rest = rest.slice(close + 1);
    if (selector.startsWith('@')) {
      problems.push(`"${selector}" was ignored: a theme file has no at-rules`);
      continue;
    }

    const declarations = body
      .split(';')
      .map((d) => d.trim())
      .filter((d) => d.length > 0)
      .map((d) => {
        const colon = d.indexOf(':');
        return colon < 0
          ? { property: d, value: null }
          : { property: d.slice(0, colon).trim(), value: d.slice(colon + 1).trim() };
      });

    if (selector === ':root') {
      for (const { property, value } of declarations) {
        if (property === NAME_PROPERTY && value !== null && unquote(value).length > 0) {
          name = unquote(value).slice(0, MAX_THEME_NAME);
        } else {
          problems.push(`":root { ${property} }" was ignored: only ${NAME_PROPERTY} goes there`);
        }
      }
      continue;
    }

    const scheme = SCHEME_SELECTOR.exec(selector)?.[2] as Scheme | undefined;
    if (!scheme) {
      problems.push(
        `the block "${selector}" was ignored: use [data-scheme='light'] or [data-scheme='dark']`,
      );
      continue;
    }
    const tokens = (schemes[scheme] ??= {});
    for (const { property, value } of declarations) {
      if (property === 'color-scheme') continue; // set by the app from the scheme
      if (!TOKENS.includes(property)) {
        problems.push(`${scheme}: ${property} was ignored: it is not a theme token`);
      } else if (value === null || !COLOUR.test(value)) {
        problems.push(
          `${scheme}: ${property} should be an opaque #rrggbb colour, not ${JSON.stringify(value ?? '')}`,
        );
      } else {
        tokens[property] = value.toLowerCase();
      }
    }
  }
  if (rest.trim().length > 0) {
    return { ok: false, reason: `"${rest.trim().slice(0, 40)}" is not part of a block` };
  }
  if (Object.keys(schemes).length === 0) {
    return { ok: false, reason: `it has no [data-scheme='light'] or [data-scheme='dark'] block` };
  }
  return { ok: true, name, schemes, problems };
}

/** "solar-flare" → "Solar flare". */
function nameFromId(id: string): string {
  const words = id.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Completes a parsed theme file. Each scheme it has gets every token: a missing one takes the
 * value `fallback` (the Default theme) has in the same scheme, and is reported. The finished
 * schemes are checked against the contrast rules; what fails is reported, not changed, so a
 * user theme looks as written (ADR-40).
 */
export function buildTheme(
  id: string,
  file: Extract<ParsedThemeFile, { ok: true }>,
  fallback: Theme | null,
  document: string | null = null,
): Theme {
  const problems = [...file.problems];
  const schemes: Partial<Record<Scheme, Tokens>> = {};
  for (const scheme of SCHEMES) {
    const given = file.schemes[scheme];
    if (!given) continue;
    const base = fallback?.schemes[scheme] ?? {};
    const missing = TOKENS.filter((token) => given[token] === undefined);
    if (missing.length > 0 && fallback) {
      problems.push(
        `${scheme}: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing and ` +
          `use${missing.length === 1 ? 's' : ''} the ${fallback.name} theme's value`,
      );
    }
    const tokens = Object.fromEntries(
      TOKENS.flatMap((token) => {
        const value = given[token] ?? base[token];
        return value === undefined ? [] : [[token, value]];
      }),
    );
    schemes[scheme] = tokens;
    if (TOKENS.every((token) => tokens[token] !== undefined)) {
      problems.push(...contrastProblems(tokens).map((p) => `${scheme}: ${p}`));
    }
  }
  return { id, name: file.name ?? nameFromId(id), document, schemes, problems };
}

/** The schemes a theme has, light first. */
export function schemesOf(theme: Theme): Scheme[] {
  return SCHEMES.filter((scheme) => theme.schemes[scheme] !== undefined);
}

/** What the user asked for: follow the OS, or one scheme. */
export type SchemePreference = 'system' | Scheme;

/**
 * The scheme to show: the one asked for (the OS's for `'system'`), or the theme's only scheme
 * when it has just one, as the Print theme does.
 */
export function resolveScheme(
  theme: Theme,
  preference: SchemePreference,
  osPrefersDark: boolean,
): Scheme {
  const wanted: Scheme = preference === 'system' ? (osPrefersDark ? 'dark' : 'light') : preference;
  return theme.schemes[wanted] ? wanted : schemesOf(theme)[0];
}

/**
 * The theme as a stylesheet: one `[data-scheme='…']` block per scheme, with `color-scheme`
 * so native controls match. Put `data-scheme` on the element to style (the root element in
 * the app, the sheet's root in an export).
 */
export function themeCss(theme: Theme): string {
  const blocks = schemesOf(theme).map((scheme) => {
    const tokens = theme.schemes[scheme]!;
    const lines = TOKENS.filter((token) => tokens[token] !== undefined).map(
      (token) => `  ${token}: ${tokens[token]};`,
    );
    return `[data-scheme='${scheme}'] {\n  color-scheme: ${scheme};\n${lines.join('\n')}\n}\n`;
  });
  return `/* Theme: ${theme.name.replace(/\*\//g, '* /')} */\n${blocks.join('\n')}`;
}
