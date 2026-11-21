/**
 * Shows a theme in the app (ADR-40): its stylesheet goes into one `<style>` element in the
 * document head, and `data-scheme` on the root element picks the scheme. For `'system'` the
 * OS preference (`prefers-color-scheme`) decides, and a change to it is followed until the
 * returned function stops watching.
 */
import { resolveScheme, themeCss, type SchemePreference, type Theme } from './theme';

/** The `id` of the `<style>` element holding the theme. */
export const THEME_STYLE_ID = 'app-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export interface ThemeTarget {
  /** The element `data-scheme` goes on; the root element by default. */
  root?: HTMLElement;
  /** The OS preference; `window.matchMedia` by default, absent in jsdom (light). */
  matchMedia?: ((query: string) => MediaQueryList) | undefined;
}

/**
 * Applies `theme` in the scheme `preference` asks for and returns a function that stops
 * following the OS preference. Applying again replaces the theme.
 */
export function applyTheme(
  theme: Theme,
  preference: SchemePreference,
  target: ThemeTarget = {},
): () => void {
  const root = target.root ?? document.documentElement;
  const matchMedia =
    'matchMedia' in target
      ? target.matchMedia
      : typeof window.matchMedia === 'function'
        ? window.matchMedia.bind(window)
        : undefined;
  const doc = root.ownerDocument;

  let style = doc.getElementById(THEME_STYLE_ID);
  if (!(style instanceof HTMLStyleElement)) {
    style = doc.createElement('style');
    style.id = THEME_STYLE_ID;
    doc.head.prepend(style);
  }
  style.textContent = themeCss(theme);

  const query = preference === 'system' ? matchMedia?.(DARK_QUERY) : undefined;
  const show = () => {
    root.dataset.scheme = resolveScheme(theme, preference, query?.matches ?? false);
  };
  show();
  query?.addEventListener('change', show);
  return () => query?.removeEventListener('change', show);
}
