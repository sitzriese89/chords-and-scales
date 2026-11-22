/**
 * The built-in themes (ADR-40): CSS files in `app/src/styles/themes/`, embedded at build time
 * and read with the same parser as user themes. `tokens.test.ts` holds each to the contrast
 * rules in every scheme it has.
 */
import atomOneCss from '../../styles/themes/atom-one.css?raw';
import catppuccinCss from '../../styles/themes/catppuccin.css?raw';
import defaultCss from '../../styles/themes/default.css?raw';
import draculaCss from '../../styles/themes/dracula.css?raw';
import highContrastCss from '../../styles/themes/high-contrast.css?raw';
import nordCss from '../../styles/themes/nord.css?raw';
import printCss from '../../styles/themes/print.css?raw';
import { buildTheme, parseThemeFile, type Theme } from './theme';

/** The theme in use when none is chosen, and the source of a user theme's missing tokens. */
export const DEFAULT_THEME_ID = 'default';

/**
 * Built-in theme files by id, in picker order: the app's own two, then the themes after
 * editor palettes (ADR-48) alphabetically, then Print.
 */
export const BUILT_IN_THEME_FILES: Readonly<Record<string, string>> = {
  [DEFAULT_THEME_ID]: defaultCss,
  'high-contrast': highContrastCss,
  'atom-one': atomOneCss,
  catppuccin: catppuccinCss,
  dracula: draculaCss,
  nord: nordCss,
  print: printCss,
};

function load(id: string, text: string): Theme {
  const file = parseThemeFile(text);
  if (!file.ok) throw new Error(`built-in theme ${id} is broken: ${file.reason}`);
  return buildTheme(id, file, null);
}

export const DEFAULT_THEME: Theme = load(DEFAULT_THEME_ID, defaultCss);

/** Every built-in theme, Default first. */
export const BUILT_IN_THEMES: readonly Theme[] = Object.entries(BUILT_IN_THEME_FILES).map(
  ([id, text]) => (id === DEFAULT_THEME_ID ? DEFAULT_THEME : load(id, text)),
);
