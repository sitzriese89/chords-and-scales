// Exporting the sheet to SVG and HTML in the real app (SPEC §5.10, ADR-44), with the
// components' own styles loaded (the `styled` test project), real WASM core and storage.
import '../../styles/base.css';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.svelte';
import { cMajorHarmonizer } from '../chords/fixture-harmonizer';
import { defaultSettings, SETTINGS_DOCUMENT, serializeSettings } from '../settings';
import { BrowserStorage, type SaveRequest, type UserFiles } from '../storage';
import { BUILT_IN_THEMES, schemesOf, THEME_STYLE_ID } from '../themes';
import type { Scheme } from '../themes/tokens';

/** Records what the app saves; `answer` says whether the user kept the file. */
class RecordingFiles implements UserFiles {
  saved: SaveRequest[] = [];
  answer: boolean | Error = true;
  async save(file: SaveRequest) {
    if (this.answer instanceof Error) throw this.answer;
    this.saved.push(file);
    return this.answer;
  }
  async open() {
    return null;
  }
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const pick = (name: string, value: string) =>
  fireEvent.change(screen.getByRole('combobox', { name }), { target: { value } });

/** Parses an SVG export; fails the test on an XML error. */
function parseSvg(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  expect(doc.documentElement.localName).toBe('svg');
  expect(doc.documentElement.namespaceURI).toBe('http://www.w3.org/2000/svg');
  return doc;
}

/** Nothing in `text` that the file would have to fetch, or that depends on the app. */
function expectSelfContained(text: string) {
  expect(text).not.toMatch(/var\(/);
  expect(text).not.toMatch(/@import/i);
  expect(text).not.toMatch(/url\(/i);
  expect(text).not.toMatch(/<(link|script|img|iframe|object)\b/i);
  expect(text).not.toMatch(/\s(src|href)=/i);
  expect(text).not.toMatch(/svelte-/);
}

describe('sheet export', () => {
  let storage: BrowserStorage;
  let files: RecordingFiles;

  beforeEach(async () => {
    window.localStorage.clear();
    storage = new BrowserStorage(window.localStorage);
    files = new RecordingFiles();
    const settings = defaultSettings();
    settings.lastView = { root: 'A', scale: 'dorian' };
    await storage.write(SETTINGS_DOCUMENT, serializeSettings(settings));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.getElementById(THEME_STYLE_ID)?.remove();
    delete document.documentElement.dataset.scheme;
  });

  /** Starts the app, adds a scale, its tab, a chord and a voicing, and opens the sheet. */
  async function sheetWithEveryKind() {
    render(App, { storage, harmonizer: cMajorHarmonizer, files });
    await screen.findByRole('grid', { name: /^Fretboard/ });
    await click('Add scale to sheet');
    await click('Add tab to sheet');
    await pick('Chord root', 'G');
    await pick('Chord quality', 'dom7');
    await click('Add chord to sheet');
    await pick('Chord root', 'C');
    await pick('Chord quality', 'major');
    await fireEvent.click(screen.getByRole('button', { name: /^\d+\. x32010(,|$)/ }));
    await click('Add shape to sheet');
    await click(/^Sheet \(\d+\)$/);
    await fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Dorian practice' },
    });
  }

  async function useTheme(id: string, scheme: Scheme) {
    await pick('Sheet theme', id);
    const theme = BUILT_IN_THEMES.find((t) => t.id === id)!;
    if (schemesOf(theme).length > 1) {
      await fireEvent.click(
        screen.getByRole('radio', { name: scheme === 'dark' ? 'Dark' : 'Light' }),
      );
    }
  }

  const cases = BUILT_IN_THEMES.flatMap((theme) =>
    schemesOf(theme).map((scheme) => [theme, scheme] as const),
  );

  it.each(cases)('exports the sheet as SVG in the $0.name theme, $1', async (theme, scheme) => {
    await sheetWithEveryKind();
    await useTheme(theme.id, scheme);
    await click('Export sheet as SVG');

    expect(files.saved).toHaveLength(1);
    const [file] = files.saved;
    expect(file.suggestedName).toBe('dorian-practice.svg');
    expect(file.format).toBe('svg');
    expectSelfContained(file.content);
    const svg = parseSvg(file.content);
    expect(svg.querySelector('title')?.textContent).toBe('Dorian practice');

    // Title, then every item's caption and drawing, in order.
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent);
    const order = [
      'Dorian practice',
      'A Dorian',
      'A Dorian, Pattern 1 (from A)',
      'G7',
      'C: x32010',
    ];
    const at = order.map((text) => texts.indexOf(text));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // The four drawings, nested in the document.
    expect(svg.querySelectorAll('svg > g svg')).toHaveLength(4);

    // The theme's colours, as literal values.
    const tokens = theme.schemes[scheme]!;
    for (const token of [
      '--surface',
      '--text',
      '--fretboard-wood',
      '--fretboard-root',
      '--fretboard-dot',
    ]) {
      expect(file.content, token).toContain(tokens[token as keyof typeof tokens]);
    }
    const board = svg.querySelector('rect.board')!;
    expect(board.getAttribute('style')).toContain(`fill: ${tokens['--fretboard-wood']}`);
    const root = svg.querySelector('g.dot.root .shape')!;
    expect(root.getAttribute('style')).toContain(`fill: ${tokens['--fretboard-root']}`);
    // The page itself is the sheet's paper.
    expect(svg.querySelector('rect')?.getAttribute('style')).toBe(`fill: ${tokens['--surface']}`);
  });

  it.each(cases)('exports the sheet as HTML in the $0.name theme, $1', async (theme, scheme) => {
    await sheetWithEveryKind();
    await useTheme(theme.id, scheme);
    await click('Export sheet as HTML');

    const [file] = files.saved;
    expect(file.suggestedName).toBe('dorian-practice.html');
    expect(file.format).toBe('html');
    expectSelfContained(file.content);
    expect(file.content).not.toMatch(/https?:/i);
    expect(file.content).not.toMatch(/\/\//);
    expect(file.content).toMatch(/^<!doctype html>/);

    const page = new DOMParser().parseFromString(file.content, 'text/html');
    expect(page.title).toBe('Dorian practice');
    const article = page.querySelector<HTMLElement>('article[data-sheet]')!;
    expect(article.dataset.scheme).toBe(scheme);
    expect(article.querySelector('style')).toBeNull();
    const tokens = theme.schemes[scheme]!;
    expect(article.getAttribute('style')).toContain(`background: ${tokens['--surface']}`);
    expect(article.getAttribute('style')).toContain(`color: ${tokens['--text']}`);
    // The same items as on screen, with their drawings.
    const titles = [...article.querySelectorAll('figure[data-sheet-item] figcaption .title')].map(
      (t) => t.textContent,
    );
    expect(titles).toEqual(['A Dorian', 'A Dorian, Pattern 1 (from A)', 'G7', 'C: x32010']);
    expect(article.querySelectorAll('figure[data-sheet-item] svg').length).toBe(4);
    expect(article.querySelector('rect.board')?.getAttribute('style')).toContain(
      `fill: ${tokens['--fretboard-wood']}`,
    );
    // No controls: the page is the sheet only.
    expect(page.querySelector('button, input, select')).toBeNull();
    expect(page.querySelector('[tabindex]')).toBeNull();
  });

  it('exports one item as SVG, on the sheet paper', async () => {
    await sheetWithEveryKind();
    await useTheme('default', 'dark');
    await click('Export C: x32010 as SVG');

    const [file] = files.saved;
    expect(file.suggestedName).toBe('c-x32010.svg');
    expect(file.format).toBe('svg');
    expectSelfContained(file.content);
    const svg = parseSvg(file.content);
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent);
    expect(texts).toContain('C: x32010');
    expect(texts).not.toContain('A Dorian');
    expect(svg.querySelector('title')?.textContent).toBe('C: x32010');
    expect(svg.querySelectorAll('svg svg')).toHaveLength(1);
    // Cropped to the item: a small diagram isn't a page-wide file.
    expect(Number(svg.documentElement.getAttribute('width'))).toBeLessThan(400);
    const dark = BUILT_IN_THEMES.find((t) => t.id === 'default')!.schemes.dark!;
    expect(svg.querySelector('rect')?.getAttribute('style')).toBe(`fill: ${dark['--surface']}`);
    expect(file.content).toContain(dark['--fretboard-root']);
    expect(screen.getByRole('status')).toHaveTextContent('Exported c-x32010.svg.');
  });

  it('places the parts where the browser laid them out', async () => {
    await sheetWithEveryKind();
    const article = document.querySelector<HTMLElement>('article[data-sheet]')!;
    const fretboard = article.querySelector('svg.fretboard')!;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this === article) return new DOMRect(100, 50, 900, 1200);
      if (this === fretboard) return new DOMRect(124, 140, 852, 124);
      return new DOMRect(124, 80, 300, 24);
    });
    await click('Export sheet as SVG');
    const svg = parseSvg(files.saved[0].content);
    expect(svg.documentElement.getAttribute('width')).toBe('900');
    expect(svg.documentElement.getAttribute('height')).toBe('1200');
    const nested = svg.querySelector('svg.fretboard')!;
    expect([...['x', 'y', 'width', 'height'].map((a) => nested.getAttribute(a))]).toEqual([
      '24',
      '90',
      '852',
      '124',
    ]);
    expect(nested.getAttribute('viewBox')).toBe(fretboard.getAttribute('viewBox'));
  });

  it('says when an export could not be saved and saves nothing when cancelled', async () => {
    await sheetWithEveryKind();
    files.answer = false;
    await click('Export sheet as HTML');
    expect(screen.queryByRole('status')).toBeNull();
    files.answer = new Error('access denied');
    await click('Export sheet as SVG');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Could not export dorian-practice.svg: access denied',
    );
  });

  it('keeps the export controls outside the sheet and offers them only with items', async () => {
    render(App, { storage, harmonizer: cMajorHarmonizer, files });
    await screen.findByRole('grid', { name: /^Fretboard/ });
    await click(/^Sheet \(\d+\)$/);
    expect(screen.getByRole('button', { name: 'Export sheet as SVG' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export sheet as HTML' })).toBeDisabled();
    const article = document.querySelector<HTMLElement>('article[data-sheet]')!;
    expect(within(article).queryAllByRole('button')).toHaveLength(0);
  });
});
