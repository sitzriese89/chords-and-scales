/**
 * Styles for standalone exports (ADR-44): the declarations that apply to an element on screen,
 * resolved to literal values, so a copy of the element can carry them in its `style` attribute
 * and look the same outside the app.
 *
 * The app's look lives in stylesheets the exported file can't use: Svelte's scoped rules (hashed
 * class names), the theme's tokens (`var(--surface)`, …) and `currentColor`. `StyleResolver`
 * runs a small cascade over the document's own stylesheets: the rules whose selectors match an
 * element (no `:hover`/`:focus`: an export is the resting state), ordered by importance,
 * specificity and source order, then the element's `style` attribute. Custom properties are
 * inherited and every `var()` is replaced by its value, `currentColor` and `inherit` by what
 * they inherit, and a simple `calc()` and `rem` lengths by pixels. The result needs no
 * stylesheet, no custom properties and no `var()`, which viewers like Inkscape don't support.
 *
 * It reads the declared text of each rule (`style.cssText`) rather than `getComputedStyle`, so
 * it gives the same answer in every browser and in jsdom, which doesn't resolve `var()`.
 */

/** The resolved declarations of one element, in the order they must be written. */
export type Declarations = Map<string, string>;

/** What an element passes on to its children. */
export interface ResolvedStyle {
  /** The element's own declarations, resolved: no `var()`, `inherit` or `currentColor`. */
  readonly own: Declarations;
  /** Custom properties in effect on the element (its own and inherited), resolved. */
  readonly custom: ReadonlyMap<string, string>;
  /** Inherited properties in effect on the element (its own and inherited), resolved. */
  readonly inherited: ReadonlyMap<string, string>;
}

/** CSS properties a child inherits (the ones the app's components use). */
export const INHERITED = new Set([
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-variant',
  'font-variant-numeric',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'white-space',
  'visibility',
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-dasharray',
  'text-anchor',
]);

/** One pixel per `rem`, as a viewer without the app's root font size uses. */
export const REM_PX = 16;

/** Pseudo-classes that depend on the pointer or focus: never part of an export. */
const DYNAMIC = /:(hover|focus|focus-visible|focus-within|active|visited|target)\b|::/;

interface Selector {
  readonly text: string;
  readonly specificity: number;
  /** Classes the matched element itself must have: a cheap test before `matches`. */
  readonly classes: readonly string[];
}

interface Rule {
  readonly selectors: readonly Selector[];
  readonly declarations: readonly Declaration[];
  readonly order: number;
}

interface Declaration {
  readonly name: string;
  readonly value: string;
  readonly important: boolean;
}

/** User-agent defaults the copies lose when they leave HTML for SVG. */
const UA_RULES: readonly { selector: string; declarations: Declaration[] }[] = [
  {
    selector: 'h1, h2, h3, h4, h5, h6, b, strong, th',
    declarations: [{ name: 'font-weight', value: '700', important: false }],
  },
];

/** Finds the end of a bracketed group starting at `start` (an opening `(` or `[`). */
function closing(text: string, start: number): number {
  const open = text[start];
  const close = open === '(' ? ')' : ']';
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return i;
  }
  return text.length - 1;
}

/** Splits `text` at `separator` where it isn't inside brackets or quotes. */
export function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') i = closing(text, i);
    else if (ch === separator) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

/** A character of a CSS identifier: word characters, `-`, an escape, or non-ASCII. */
const IDENT = {
  test: (ch: string) => /[\w\-\\]/.test(ch) || ch.charCodeAt(0) > 127,
};

function skipIdent(text: string, i: number): number {
  while (i < text.length && IDENT.test(text[i])) i += text[i] === '\\' ? 2 : 1;
  return i;
}

/**
 * The specificity of one selector as one number: ids × 10⁴ + classes, attributes and
 * pseudo-classes × 10² + types and pseudo-elements. `:where()` counts nothing; `:is()`,
 * `:not()` and `:has()` count their most specific argument.
 */
export function specificity(selector: string): number {
  let ids = 0;
  let classes = 0;
  let types = 0;
  let extra = 0;
  let i = 0;
  while (i < selector.length) {
    const ch = selector[i];
    if (ch === '#') {
      ids++;
      i = skipIdent(selector, i + 1);
    } else if (ch === '.') {
      classes++;
      i = skipIdent(selector, i + 1);
    } else if (ch === '[') {
      classes++;
      i = closing(selector, i) + 1;
    } else if (ch === ':') {
      if (selector[i + 1] === ':') {
        types++;
        i = skipIdent(selector, i + 2);
        continue;
      }
      const end = skipIdent(selector, i + 1);
      const name = selector.slice(i + 1, end).toLowerCase();
      i = end;
      let argument: string | null = null;
      if (selector[i] === '(') {
        const close = closing(selector, i);
        argument = selector.slice(i + 1, close);
        i = close + 1;
      }
      if (name === 'where') continue;
      if ((name === 'is' || name === 'not' || name === 'has') && argument !== null) {
        extra += Math.max(0, ...splitTopLevel(argument, ',').map(specificity));
      } else classes++;
    } else if (IDENT.test(ch)) {
      types++;
      i = skipIdent(selector, i);
    } else i++;
  }
  return ids * 10_000 + classes * 100 + types + extra;
}

/** The classes on the subject (rightmost compound) of `selector`, outside any `:fn()`. */
function subjectClasses(selector: string): string[] {
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === '(' || ch === '[') i = closing(selector, i);
    else if (ch === ' ' || ch === '>' || ch === '+' || ch === '~') start = i + 1;
  }
  const subject = selector.slice(start);
  const classes: string[] = [];
  for (let i = 0; i < subject.length; i++) {
    const ch = subject[i];
    if (ch === '(' || ch === '[') i = closing(subject, i);
    else if (ch === '.') {
      const end = skipIdent(subject, i + 1);
      if (!subject.slice(i + 1, end).includes('\\')) classes.push(subject.slice(i + 1, end));
      i = end - 1;
    }
  }
  return classes;
}

/** Reads `a: b; c: d !important` into declarations, in order. */
export function parseDeclarations(text: string): Declaration[] {
  const out: Declaration[] = [];
  for (const part of splitTopLevel(text.replace(/\/\*[\s\S]*?\*\//g, ''), ';')) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const name = part.slice(0, colon).trim();
    let value = part.slice(colon + 1).trim();
    const important = /!\s*important$/i.test(value);
    if (important) value = value.replace(/!\s*important$/i, '').trim();
    if (value === '') continue;
    out.push({ name: name.startsWith('--') ? name : name.toLowerCase(), value, important });
  }
  return out;
}

function prepareSelectors(selectorText: string): Selector[] {
  return splitTopLevel(selectorText, ',')
    .filter((text) => !DYNAMIC.test(text))
    .map((text) => ({ text, specificity: specificity(text), classes: subjectClasses(text) }));
}

/** The value of `var(--name, fallback)` references in `value`; `null` if one can't resolve. */
export function substituteVars(
  value: string,
  custom: ReadonlyMap<string, string>,
  depth = 0,
): string | null {
  if (depth > 20) return null;
  let out = '';
  let i = 0;
  for (;;) {
    const at = value.toLowerCase().indexOf('var(', i);
    if (at < 0) return out + value.slice(i);
    out += value.slice(i, at);
    const close = closing(value, at + 3);
    const inner = value.slice(at + 4, close);
    const comma = splitTopLevel(inner, ',');
    const name = (comma[0] ?? '').trim();
    const fallbackAt = inner.indexOf(',');
    const fallback = fallbackAt < 0 ? null : inner.slice(fallbackAt + 1).trim();
    let replacement: string | null = custom.get(name) ?? null;
    if (replacement === null && fallback !== null) {
      replacement = substituteVars(fallback, custom, depth + 1);
    } else if (replacement !== null && /var\(/i.test(replacement)) {
      replacement = substituteVars(replacement, custom, depth + 1);
    }
    if (replacement === null) return null;
    out += replacement;
    i = close + 1;
  }
}

function toPx(amount: number, unit: string): number | null {
  if (unit === 'px') return amount;
  if (unit === 'rem') return amount * REM_PX;
  return null;
}

function formatPx(px: number): string {
  return `${Number(px.toFixed(3))}px`;
}

/** `rem` lengths as pixels and `calc(<length> * <number>)`-style sums as one length. */
export function simplifyLengths(value: string): string {
  const number = '(-?\\d*\\.?\\d+)(px|rem)?';
  const calc = new RegExp(`calc\\(\\s*${number}\\s*([*/+-])\\s*${number}\\s*\\)`, 'gi');
  const simplified = value.replace(calc, (whole, a, unitA = '', op, b, unitB = '') => {
    const x = Number(a);
    const y = Number(b);
    if (op === '*' || op === '/') {
      // A length times or by a number; dividing by a length isn't a length.
      if ((unitA && unitB) || (op === '/' && unitB)) return whole;
      const unit = unitA || unitB;
      const product = op === '*' ? x * y : x / y;
      if (!unit) return String(Number(product.toFixed(4)));
      const px = toPx(product, unit);
      return px === null ? whole : formatPx(px);
    }
    const px = toPx(x, unitA || 'px');
    const py = toPx(y, unitB || 'px');
    if (px === null || py === null || !unitA || !unitB) return whole;
    return formatPx(op === '+' ? px + py : px - py);
  });
  return simplified.replace(/(-?\d*\.?\d+)rem\b/gi, (_, n) => formatPx(Number(n) * REM_PX));
}

const EMPTY: ResolvedStyle = { own: new Map(), custom: new Map(), inherited: new Map() };

/**
 * Resolves the declarations that apply to elements of one document, from the stylesheets it has
 * when constructed. Make one per export: the theme or the components may change in between.
 */
export class StyleResolver {
  private readonly rules: Rule[] = [];

  constructor(private readonly doc: Document) {
    let order = 0;
    for (const ua of UA_RULES) {
      this.rules.push({
        selectors: prepareSelectors(ua.selector).map((s) => ({ ...s, specificity: -1 })),
        declarations: ua.declarations,
        order: order++,
      });
    }
    const visit = (list: CSSRuleList) => {
      for (const rule of Array.from(list)) {
        if ('selectorText' in rule && 'style' in rule) {
          const style = rule as CSSStyleRule;
          const selectors = prepareSelectors(style.selectorText);
          if (selectors.length > 0) {
            this.rules.push({
              selectors,
              declarations: parseDeclarations(style.style.cssText),
              order: order++,
            });
          }
        } else if ('media' in rule && 'cssRules' in rule) {
          const media = (rule as CSSMediaRule).media.mediaText;
          if (doc.defaultView?.matchMedia?.(media).matches) visit((rule as CSSMediaRule).cssRules);
        } else if ('conditionText' in rule && 'cssRules' in rule) {
          visit((rule as unknown as CSSGroupingRule).cssRules);
        }
      }
    };
    for (const sheet of Array.from(doc.styleSheets)) {
      if (sheet.disabled) continue;
      let list: CSSRuleList;
      try {
        list = sheet.cssRules;
      } catch {
        continue; // A cross-origin sheet: nothing the app's own components rely on.
      }
      visit(list);
    }
  }

  /** The declarations that win for `element`, unresolved, in cascade order (lowest first). */
  private cascade(element: Element): Declaration[] {
    const winners = new Map<string, { declaration: Declaration; rank: number[] }>();
    const offer = (declaration: Declaration, rank: number[]) => {
      const current = winners.get(declaration.name);
      if (!current || compare(rank, current.rank) >= 0) {
        winners.set(declaration.name, { declaration, rank });
      }
    };
    for (const rule of this.rules) {
      let best = -Infinity;
      for (const selector of rule.selectors) {
        if (selector.specificity <= best) continue;
        if (!selector.classes.every((c) => element.classList.contains(c))) continue;
        if (matches(element, selector.text)) best = selector.specificity;
      }
      if (best === -Infinity) continue;
      for (const declaration of rule.declarations) {
        offer(declaration, [declaration.important ? 1 : 0, 0, best, rule.order]);
      }
    }
    const inline = element.getAttribute('style');
    if (inline) {
      parseDeclarations(inline).forEach((declaration, index) => {
        offer(declaration, [declaration.important ? 1 : 0, 1, 0, index]);
      });
    }
    return [...winners.values()]
      .sort((a, b) => compare(a.rank, b.rank))
      .map((entry) => entry.declaration);
  }

  /** Resolves `element`'s declarations given what its parent passes on. */
  resolve(element: Element, parent: ResolvedStyle = EMPTY): ResolvedStyle {
    const declarations = this.cascade(element);
    const custom = new Map(parent.custom);
    const raw = declarations.filter((d) => d.name.startsWith('--'));
    for (const d of raw) custom.set(d.name, d.value);
    for (const d of raw) {
      const value = substituteVars(d.value, custom);
      if (value === null) custom.delete(d.name);
      else custom.set(d.name, value);
    }

    const own: Declarations = new Map();
    const lookup = (name: string) => own.get(name) ?? parent.inherited.get(name);
    const regular = declarations.filter((d) => !d.name.startsWith('--'));
    // `color` first: `currentColor` in the other properties means the element's colour.
    regular.sort((a, b) => Number(b.name === 'color') - Number(a.name === 'color'));
    for (const d of regular) {
      let value = substituteVars(d.value, custom);
      if (value === null) continue;
      value = value.trim();
      const keyword = value.toLowerCase();
      if (keyword === 'inherit') {
        const inheritedValue = parent.inherited.get(d.name);
        if (inheritedValue === undefined) continue;
        value = inheritedValue;
      } else if (keyword === 'initial' || keyword === 'unset' || keyword === 'revert') continue;
      if (/currentcolor/i.test(value)) {
        const color = d.name === 'color' ? parent.inherited.get('color') : lookup('color');
        if (color === undefined) continue;
        value = value.replace(/currentcolor/gi, color);
      }
      own.set(d.name, simplifyLengths(value));
    }
    // Back in cascade order, so a later shorthand or longhand still wins when written out.
    const ordered: Declarations = new Map();
    for (const d of declarations) {
      const value = own.get(d.name);
      if (value !== undefined) ordered.set(d.name, value);
    }

    const inherited = new Map(parent.inherited);
    for (const [name, value] of ordered) if (INHERITED.has(name)) inherited.set(name, value);
    return { own: ordered, custom, inherited };
  }

  /** What `element`'s parent passes on, resolved from the document root down. */
  context(element: Element): ResolvedStyle {
    const chain: Element[] = [];
    for (let e = element.parentElement; e; e = e.parentElement) chain.unshift(e);
    let style = EMPTY;
    for (const ancestor of chain) style = this.resolve(ancestor, style);
    return style;
  }

  /** The document these styles are read from. */
  get document(): Document {
    return this.doc;
  }
}

/** `element.matches(selector)`, false for a selector this engine can't parse. */
function matches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Writes declarations as the text of a `style` attribute. */
export function styleText(declarations: Iterable<[string, string]>): string {
  return [...declarations].map(([name, value]) => `${name}: ${value}`).join('; ');
}
