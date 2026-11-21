/**
 * Standalone exports of the export sheet (SPEC §5.10, ADR-44): the sheet or one item as an SVG
 * document, the sheet as one HTML page. Both are built from the sheet's subtree on screen
 * (`article[data-sheet]`, ADR-43), so an export looks like the screen (ADR-3, ADR-11).
 *
 * - **HTML:** a copy of the article with every element's resolved declarations in its `style`
 *   attribute (`StyleResolver`), in a page with no scripts, links, fonts or images.
 * - **SVG:** the item drawings are the components' own `<svg>` elements, copied with resolved
 *   presentation styles and placed as nested `<svg>` elements; the HTML around them (the title,
 *   captions, the tab's box, a "Missing" note) becomes `<rect>` and `<text>` at the place the
 *   browser laid it out. When the sheet has no layout (jsdom, or not shown), the parts are
 *   stacked top to bottom instead.
 */
import { REM_PX, StyleResolver, styleText, type ResolvedStyle } from './styles';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Space around one item in its own SVG. */
const ITEM_MARGIN = 16;
/** Gap between stacked parts when the sheet has no layout. */
const STACK_GAP = 8;
/** Width of the sheet when it has no layout. */
const STACK_WIDTH = 800;

/** Presentation properties kept on SVG elements; the rest is layout or interaction. */
const SVG_PROPERTIES = new Set([
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-variant',
  'font-variant-numeric',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'visibility',
]);

/** Properties that only matter to a pointer or to focus, left out of an HTML export. */
const INTERACTIVE =
  /^(cursor|user-select|-webkit-user-select|pointer-events|outline.*|transition.*)$/;

type Mode = 'svg' | 'html';

function isSvgElement(element: Element): boolean {
  return element.namespaceURI === SVG_NS;
}

function round(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** The declarations of `style` an exported copy keeps, as written into it. */
function kept(style: Map<string, string>, mode: Mode, svg: boolean): [string, string][] {
  const out: [string, string][] = [];
  for (const [name, value] of style) {
    if (name.startsWith('--')) continue;
    if (mode === 'html' && !svg) {
      if (!INTERACTIVE.test(name)) out.push([name, value]);
      continue;
    }
    if (!svg || !SVG_PROPERTIES.has(name) || INTERACTIVE.test(name)) continue;
    // SVG 1.1 viewers don't know `transparent`; an unpainted shape is `none`.
    const v = (name === 'fill' || name === 'stroke') && value === 'transparent' ? 'none' : value;
    out.push([name, v]);
  }
  return out;
}

function hidden(style: ResolvedStyle): boolean {
  const own = style.own;
  if (own.get('display') === 'none' || own.get('visibility') === 'hidden') return true;
  // The "visually hidden" pattern: kept for screen readers, never drawn.
  return own.get('position') === 'absolute' && (own.has('clip-path') || own.has('clip'));
}

/**
 * Writes the resolved styles of `original` and its descendants into the matching elements of
 * `copy` (a deep clone of it), and drops what an export doesn't need: comments, `<style>` and
 * `<script>` elements, tab stops, Svelte's scoping classes and hidden elements.
 */
function applyStyles(
  resolver: StyleResolver,
  original: Element,
  copy: Element,
  parent: ResolvedStyle,
  mode: Mode,
  root: boolean,
  resolved?: ResolvedStyle,
): void {
  const style = resolved ?? resolver.resolve(original, parent);
  const svg = isSvgElement(original);
  const declarations = new Map(style.own);
  if (root) {
    // The copy leaves its ancestors behind: it carries what it inherited from them.
    for (const [name, value] of parent.inherited) {
      if (!declarations.has(name)) declarations.set(name, value);
    }
  }
  const text = styleText(kept(declarations, mode, svg));
  if (text) copy.setAttribute('style', text);
  else copy.removeAttribute('style');
  copy.removeAttribute('tabindex');
  const classes = (copy.getAttribute('class') ?? '')
    .split(/\s+/)
    .filter((c) => c && !/^svelte-/.test(c));
  if (classes.length > 0) copy.setAttribute('class', classes.join(' '));
  else copy.removeAttribute('class');

  for (const node of Array.from(copy.childNodes)) {
    if (node.nodeType === 8) node.remove();
  }
  const originals = Array.from(original.children);
  const copies = Array.from(copy.children);
  originals.forEach((child, index) => {
    const childCopy = copies[index];
    if (child.localName === 'style' || child.localName === 'script') {
      childCopy.remove();
      return;
    }
    const childStyle = resolver.resolve(child, style);
    if (hidden(childStyle) && (mode === 'svg' || childStyle.own.get('display') === 'none')) {
      childCopy.remove();
      return;
    }
    applyStyles(resolver, child, childCopy, style, mode, false, childStyle);
  });
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A length in pixels (`px` or `rem`); `0` for anything else. */
function px(value: string | undefined): number {
  const match = /^(-?\d*\.?\d+)(px|rem)?$/.exec((value ?? '').trim());
  if (!match) return 0;
  return Number(match[1]) * (match[2] === 'rem' ? REM_PX : 1);
}

/** Top, right, bottom and left of a `padding`-style shorthand and its longhands. */
function sides(own: Map<string, string>, property: string, suffix = ''): number[] {
  const values = (own.get(property + suffix) ?? '').split(/\s+/).filter(Boolean).map(px);
  const [top = 0, right = top, bottom = top, left = right] = values;
  const out = [top, right, bottom, left];
  ['top', 'right', 'bottom', 'left'].forEach((side, i) => {
    const longhand = own.get(`${property}-${side}${suffix}`);
    if (longhand !== undefined) out[i] = px(longhand);
  });
  return out;
}

interface Border {
  width: number;
  style: string;
  color: string;
}

/** The element's border, from `border` and its longhands (the top side stands for all). */
function border(own: Map<string, string>): Border {
  const result: Border = { width: 0, style: 'none', color: 'currentColor' };
  const shorthand = own.get('border') ?? own.get('border-top');
  if (shorthand) {
    const rest: string[] = [];
    for (const token of shorthand.split(/\s+(?![^(]*\))/)) {
      if (/^(none|hidden|solid|dashed|dotted|double|groove|ridge|inset|outset)$/.test(token)) {
        result.style = token;
      } else if (/^-?\d*\.?\d+(px|rem)?$/.test(token)) result.width = px(token);
      else if (token === 'thin') result.width = 1;
      else if (token === 'medium') result.width = 3;
      else rest.push(token);
    }
    if (rest.length > 0) result.color = rest.join(' ');
    if (result.width === 0 && result.style !== 'none') result.width = 3;
  }
  const width = own.get('border-top-width') ?? own.get('border-width')?.split(/\s+/)[0];
  const style = own.get('border-top-style') ?? own.get('border-style')?.split(/\s+/)[0];
  const color = own.get('border-top-color') ?? own.get('border-color')?.split(/\s+(?![^(]*\))/)[0];
  if (width !== undefined) result.width = px(width);
  if (style !== undefined) result.style = style;
  if (color !== undefined) result.color = color;
  if (result.style === 'none' || result.style === 'hidden') result.width = 0;
  return result;
}

/** The background colour, if the element paints one. */
function background(own: Map<string, string>): string | null {
  const value = (own.get('background-color') ?? own.get('background') ?? '').trim();
  if (!value || /url\(|gradient\(/i.test(value)) return null;
  if (/^(transparent|none|initial)$/i.test(value)) return null;
  return value;
}

/** Turns the sheet's HTML into SVG shapes and text; see the module comment. */
class SvgWriter {
  readonly out: Document;
  private readonly origin: DOMRect | null;
  /** The right edge of everything drawn inside the root, for cropping an item. */
  right = 0;

  constructor(
    private readonly resolver: StyleResolver,
    private readonly root: Element,
  ) {
    this.out = root.ownerDocument.implementation.createDocument(SVG_NS, 'svg', null);
    const rect = root.getBoundingClientRect();
    this.origin = rect.width > 0 && rect.height > 0 ? rect : null;
  }

  element(name: string, attributes: Record<string, string | number> = {}): Element {
    const element = this.out.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, typeof value === 'number' ? round(value) : value);
    }
    return element;
  }

  /** Where the browser put `element`, relative to the root; `null` without a layout. */
  private measured(element: Element): Box | null {
    if (!this.origin) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left - this.origin.left,
      y: rect.top - this.origin.top,
      width: rect.width,
      height: rect.height,
    };
  }

  /** The size of an `<svg>` drawn `width` wide when the sheet has no layout. */
  private stackedSvg(svg: Element, width: number): { width: number; height: number } {
    const attribute = (name: string) => {
      const value = svg.getAttribute(name);
      return value && !value.endsWith('%') ? Number(value) : NaN;
    };
    const viewBox = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
    const w = Number.isFinite(attribute('width')) ? attribute('width') : width;
    if (Number.isFinite(attribute('height'))) return { width: w, height: attribute('height') };
    const ratio = viewBox.length === 4 && viewBox[2] > 0 ? viewBox[3] / viewBox[2] : 0.5;
    return { width: w, height: w * ratio };
  }

  /** One of the item drawings, as a nested `<svg>` at its place. Returns its height. */
  private drawing(original: Element, parent: ResolvedStyle, at: Box, into: Element): number {
    const copy = this.out.importNode(original, true) as Element;
    applyStyles(this.resolver, original, copy, parent, 'svg', true);
    const box = this.measured(original) ?? { ...at, ...this.stackedSvg(original, at.width) };
    if (!copy.hasAttribute('viewBox')) {
      copy.setAttribute('viewBox', `0 0 ${round(box.width)} ${round(box.height)}`);
    }
    copy.setAttribute('x', round(box.x));
    copy.setAttribute('y', round(box.y));
    copy.setAttribute('width', round(box.width));
    copy.setAttribute('height', round(box.height));
    into.append(copy);
    this.right = Math.max(this.right, box.x + box.width);
    return box.height;
  }

  /** An HTML element: its background and border, its text, its children. Returns its height. */
  html(original: Element, parent: ResolvedStyle, at: Box, into: Element): number {
    const style = this.resolver.resolve(original, parent);
    if (hidden(style)) return 0;
    const own = style.own;
    const group = this.element('g');
    into.append(group);
    const [padTop, , padBottom, padLeft] = sides(own, 'padding');
    const line = border(own);
    const measured = this.measured(original);
    const box: Box = measured ?? { ...at, height: 0 };
    const inner: Box = {
      x: box.x + padLeft + line.width,
      y: box.y + padTop + line.width,
      width: box.width - padLeft - sides(own, 'padding')[1] - 2 * line.width,
      height: 0,
    };

    const fontSize = px(style.inherited.get('font-size')) || REM_PX;
    const children = Array.from(original.children).filter(
      (child) => child.localName !== 'style' && child.localName !== 'script',
    );
    let cursor = inner.y;
    if (children.length > 0) {
      for (const child of children) {
        const at: Box = { x: inner.x, y: cursor, width: inner.width, height: 0 };
        const height = isSvgElement(child)
          ? this.drawing(child, style, at, group)
          : this.html(child, style, at, group);
        if (height > 0) cursor += height + STACK_GAP;
      }
      if (cursor > inner.y) cursor -= STACK_GAP;
    } else {
      const text = (original.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text) {
        const lineHeight = fontSize * 1.5;
        const contentHeight = measured
          ? box.height - padTop - padBottom - 2 * line.width
          : lineHeight;
        const textStyle: [string, string][] = [];
        const color = style.inherited.get('color');
        if (color) textStyle.push(['fill', color]);
        for (const name of ['font-family', 'font-size', 'font-style', 'font-weight']) {
          const value = style.inherited.get(name);
          if (value) textStyle.push([name, value]);
        }
        const node = this.element('text', {
          x: inner.x,
          y: inner.y + contentHeight / 2 + fontSize * 0.35,
          style: styleText(textStyle),
        });
        node.textContent = text;
        group.append(node);
        const textRight = measured ? box.x + box.width : inner.x + text.length * fontSize * 0.6;
        if (original !== this.root) this.right = Math.max(this.right, textRight);
        cursor = inner.y + lineHeight;
      }
    }
    if (!measured) box.height = cursor - box.y + padBottom + line.width;

    // Background and border go under the content, so they are drawn first.
    const fill = background(own);
    const radius = px(own.get('border-radius')?.split(/\s+/)[0]);
    const shapes: Element[] = [];
    if (fill) {
      shapes.push(
        this.element('rect', { ...boxAttributes(box), rx: radius, style: `fill: ${fill}` }),
      );
    }
    if (line.width > 0) {
      const half = line.width / 2;
      const dash =
        line.style === 'dashed'
          ? `; stroke-dasharray: ${round(line.width * 4)} ${round(line.width * 3)}`
          : line.style === 'dotted'
            ? `; stroke-dasharray: ${round(line.width)} ${round(line.width)}`
            : '';
      shapes.push(
        this.element('rect', {
          x: box.x + half,
          y: box.y + half,
          width: Math.max(0, box.width - line.width),
          height: Math.max(0, box.height - line.width),
          rx: radius,
          style: `fill: none; stroke: ${line.color}; stroke-width: ${round(line.width)}${dash}`,
        }),
      );
    }
    group.prepend(...shapes);
    if (shapes.length > 0 && original !== this.root) {
      this.right = Math.max(this.right, box.x + box.width);
    }
    if (group.childNodes.length === 0) group.remove();
    return box.height;
  }

  /** The SVG document around `content`, `width` × `height`. */
  document(title: string, width: number, height: number, content: Element[]): string {
    const svg = this.out.documentElement;
    svg.setAttribute('width', round(width));
    svg.setAttribute('height', round(height));
    svg.setAttribute('viewBox', `0 0 ${round(width)} ${round(height)}`);
    const name = this.element('title');
    name.textContent = title;
    svg.append(name, ...content);
    const xml = new XMLSerializer().serializeToString(svg);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}\n`;
  }

  /** The root's size: as laid out, or `height` when stacked. */
  size(height: number): { width: number; height: number } {
    return this.origin
      ? { width: this.origin.width, height: this.origin.height }
      : { width: STACK_WIDTH, height };
  }
}

function boxAttributes(box: Box): Record<string, number> {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function titleOf(element: Element): string {
  const heading =
    element.querySelector('h2, figcaption .title') ?? element.querySelector('figcaption');
  return (heading?.textContent ?? '').replace(/s+/g, ' ').trim();
}

/** The whole sheet (`article[data-sheet]`) as an SVG document: title, items, captions. */
export function sheetSvg(article: HTMLElement): string {
  const resolver = new StyleResolver(article.ownerDocument);
  const writer = new SvgWriter(resolver, article);
  const group = writer.element('g');
  const at: Box = { x: 0, y: 0, width: STACK_WIDTH, height: 0 };
  const height = writer.html(article, resolver.context(article), at, group);
  const size = writer.size(height);
  return writer.document(titleOf(article), size.width, size.height, [group]);
}

/** One item of the sheet (`figure[data-sheet-item]`) as an SVG document, on the sheet's paper. */
export function itemSvg(figure: HTMLElement): string {
  const resolver = new StyleResolver(figure.ownerDocument);
  const writer = new SvgWriter(resolver, figure);
  const context = resolver.context(figure);
  const sheet = figure.closest('[data-sheet]');
  const paper = sheet ? background(resolver.resolve(sheet, resolver.context(sheet)).own) : null;
  const content = writer.element('g', { transform: `translate(${ITEM_MARGIN} ${ITEM_MARGIN})` });
  const at: Box = { x: 0, y: 0, width: STACK_WIDTH - 2 * ITEM_MARGIN, height: 0 };
  const height = writer.html(figure, context, at, content);
  const size = writer.size(height);
  const width = Math.ceil(writer.right) + 2 * ITEM_MARGIN;
  const total = size.height + 2 * ITEM_MARGIN;
  const parts: Element[] = [];
  if (paper) {
    parts.push(writer.element('rect', { width: '100%', height: '100%', style: `fill: ${paper}` }));
  }
  parts.push(content);
  return writer.document(titleOf(figure), width, total, parts);
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
}

/**
 * The whole sheet as one HTML page: the article with its styles inlined, nothing loaded from
 * anywhere, so it opens offline and looks like the sheet on screen.
 */
export function sheetHtml(article: HTMLElement): string {
  const doc = article.ownerDocument;
  const resolver = new StyleResolver(doc);
  const context = resolver.context(article);
  const copy = article.cloneNode(true) as HTMLElement;
  applyStyles(resolver, article, copy, context, 'html', true);
  const own = resolver.resolve(article, context).own;
  const paper = background(own) ?? '#ffffff';
  const scheme = article.dataset.scheme === 'dark' ? 'dark' : 'light';
  const title = titleOf(article) || 'Sheet';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Chords &amp; Scales">
<title>${escapeHtml(title)}</title>
<style>
html { background: ${paper}; color-scheme: ${scheme}; }
body { margin: 0; padding: 2rem; }
</style>
</head>
<body>
${copy.outerHTML}
</body>
</html>
`;
}

/** A file name for an export: `Dorian practice` → `dorian-practice.svg`. */
export function exportFileName(title: string, extension: string): string {
  const base = title
    .replace(/[#♯]/g, ' sharp ')
    .replace(/♭/g, ' flat ')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  return `${base || 'sheet'}.${extension}`;
}
