// The standalone exports on a hand-made sheet (ADR-44); the real sheet in every theme is
// tested in `lib/sheet/export.styled.test.ts`.
import { afterEach, describe, expect, it } from 'vitest';
import { exportFileName, itemSvg, sheetHtml, sheetSvg } from './standalone';

const CSS = `
[data-sheet][data-scheme='light'] { --surface: #fefefe; --text: #010101; --muted: #555555; --wood: #eeddcc; }
.sheet { background: var(--surface); color: var(--text); padding: 1.5rem; border: 1px solid var(--muted); }
.title { font-weight: 600; }
.missing { border: 1px dashed var(--muted); border-radius: 0.375rem; color: var(--muted); }
.board { fill: var(--wood); }
.cell { fill: transparent; cursor: pointer; }
.cell:hover { fill: var(--text); }
.hidden { position: absolute; clip-path: inset(50%); }
`;

const SHEET = `
<article class="sheet" data-sheet data-scheme="light">
  <style>[data-sheet] { --x: 1; }</style>
  <h2>Étude in C#</h2>
  <figure data-sheet-item data-kind="fretboard">
    <figcaption><span class="title">C Major</span></figcaption>
    <!---->
    <svg viewBox="0 0 200 50" width="100%"><rect class="board svelte-abc" width="200" height="50"></rect><rect class="cell" tabindex="0" width="10" height="10"></rect></svg>
    <ol class="hidden"><li>String 1, open</li></ol>
  </figure>
  <figure data-sheet-item data-kind="missing">
    <figcaption><span class="title">Gone</span></figcaption>
    <p class="missing">Missing: the scale is gone.</p>
  </figure>
</article>`;

describe('standalone exports', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  function sheet() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    document.body.innerHTML = SHEET;
    return document.querySelector<HTMLElement>('article[data-sheet]')!;
  }

  function parse(text: string) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    return doc;
  }

  it('writes the sheet as one SVG document with literal colours', () => {
    const text = sheetSvg(sheet());
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns=')).toBe(true);
    const svg = parse(text);
    expect(svg.querySelector('title')?.textContent).toBe('Étude in C#');
    expect([...svg.querySelectorAll('text')].map((t) => t.textContent)).toEqual([
      'Étude in C#',
      'C Major',
      'Gone',
      'Missing: the scale is gone.',
    ]);
    // The sheet's paper and border, the missing note's dashed border.
    const rects = [...svg.querySelectorAll('svg > g rect:not(svg svg rect)')];
    expect(rects[0].getAttribute('style')).toBe('fill: #fefefe');
    expect(rects[1].getAttribute('style')).toBe('fill: none; stroke: #555555; stroke-width: 1');
    expect(text).toMatch(/stroke: #555555; stroke-width: 1; stroke-dasharray: 4 3/);
    // The drawing keeps its own coordinates and gets the resolved colours.
    const drawing = svg.querySelector('svg svg')!;
    expect(drawing.getAttribute('viewBox')).toBe('0 0 200 50');
    expect(drawing.querySelector('.board')?.getAttribute('style')).toBe('fill: #eeddcc');
    expect(drawing.querySelector('.cell')?.getAttribute('style')).toBe('fill: none');
    expect(drawing.querySelector('[tabindex]')).toBeNull();
    // Titles are bold as in HTML; captions take the sheet's text colour.
    expect(svg.querySelectorAll('text')[0].getAttribute('style')).toContain('font-weight: 700');
    expect(svg.querySelectorAll('text')[1].getAttribute('style')).toContain('fill: #010101');
    expect(text).not.toMatch(/var\(|svelte-|<!--|String 1, open/);
  });

  it('writes one item on the sheet paper', () => {
    const figure = sheet().querySelector<HTMLElement>('figure[data-kind="missing"]')!;
    const svg = parse(itemSvg(figure));
    expect(svg.querySelector('title')?.textContent).toBe('Gone');
    expect(svg.querySelector('rect')?.getAttribute('style')).toBe('fill: #fefefe');
    expect([...svg.querySelectorAll('text')].map((t) => t.textContent)).toEqual([
      'Gone',
      'Missing: the scale is gone.',
    ]);
  });

  it('writes the sheet as a page with nothing to load', () => {
    const html = sheetHtml(sheet());
    expect(html).not.toMatch(/https?:|\/\/|@import|url\(|<link|<script|var\(|svelte-|<!---->/);
    const page = new DOMParser().parseFromString(html, 'text/html');
    expect(page.title).toBe('Étude in C#');
    expect(page.querySelector('meta[charset]')?.getAttribute('charset')).toBe('utf-8');
    const article = page.querySelector<HTMLElement>('article[data-sheet]')!;
    expect(article.getAttribute('style')).toBe(
      'background: #fefefe; color: #010101; padding: 24px; border: 1px solid #555555',
    );
    expect(article.querySelector('style')).toBeNull();
    expect(article.querySelector('.cell')?.getAttribute('style')).toBe('fill: none');
    // Kept for screen readers, hidden as on screen.
    expect(article.querySelector('ol')?.getAttribute('style')).toContain('position: absolute');
    expect(page.querySelector('html')?.innerHTML).toContain('html { background: #fefefe;');
  });
});

describe('exportFileName', () => {
  it.each([
    ['Dorian practice', 'svg', 'dorian-practice.svg'],
    ['C# Major, Pattern 1 (from C#)', 'svg', 'c-sharp-major-pattern-1-from-c-sharp.svg'],
    ['B♭7', 'svg', 'b-flat-7.svg'],
    ['Étude', 'html', 'etude.html'],
    ['', 'html', 'sheet.html'],
    ['   ', 'svg', 'sheet.svg'],
  ])('%j → %s', (title, extension, expected) => {
    expect(exportFileName(title, extension)).toBe(expected);
  });
});
