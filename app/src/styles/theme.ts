// Theme selection (ADR-11, ADR-19). The themes themselves are in tokens.css: the light theme
// is the default, the OS dark preference switches to dark, and `data-theme` on the root
// element overrides both.

/** What the user picked: follow the OS, or force one theme. */
export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * Applies a theme preference by setting `data-theme` on the root element, or removing it for
 * `'system'` so the OS preference (`prefers-color-scheme`) decides.
 */
export function applyTheme(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
): void {
  if (preference === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = preference;
  }
}
