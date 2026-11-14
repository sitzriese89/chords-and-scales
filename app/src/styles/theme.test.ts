import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { applyTheme } from './theme';

const root = document.documentElement;
const surface = () => getComputedStyle(root).getPropertyValue('--surface').trim();

/** The value a theme block in tokens.css gives a token. */
function tokenIn(selector: string, token: string): string {
  const rule = Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .find((r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText === selector);
  return rule!.style.getPropertyValue(token).trim();
}

describe('applyTheme', () => {
  beforeAll(() => {
    // vitest doesn't load CSS imports, so add the stylesheet by hand.
    const style = document.createElement('style');
    style.textContent = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');
    document.head.append(style);
  });

  afterEach(() => applyTheme('system'));

  it('selects the dark theme with data-theme="dark"', () => {
    applyTheme('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(surface()).toBe(tokenIn(':root[data-theme="dark"]', '--surface'));
  });

  it('selects the light theme with data-theme="light"', () => {
    applyTheme('dark');
    applyTheme('light');
    expect(root.dataset.theme).toBe('light');
    expect(surface()).toBe(tokenIn(':root', '--surface'));
  });

  it('removes data-theme for "system", leaving the choice to the OS', () => {
    applyTheme('dark');
    applyTheme('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
    // jsdom matches no media queries, so the OS preference here is "light".
    expect(surface()).toBe(tokenIn(':root', '--surface'));
  });

  it('gives the two themes different surfaces', () => {
    expect(tokenIn(':root', '--surface')).not.toBe(
      tokenIn(':root[data-theme="dark"]', '--surface'),
    );
  });
});
