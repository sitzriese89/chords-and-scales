import { afterEach, describe, expect, it } from 'vitest';
import {
  parseDeclarations,
  simplifyLengths,
  specificity,
  splitTopLevel,
  StyleResolver,
  styleText,
  substituteVars,
} from './styles';

describe('specificity', () => {
  it.each([
    ['p', 1],
    ['.a', 100],
    ['#x', 10_000],
    ['.a .b', 200],
    ['.dot.root.svelte-x .shape:where(.svelte-x)', 400],
    ['[data-sheet][data-scheme="light"]', 200],
    ['.degrees .dot:where(.s):not(.dim) .label:where(.s)', 400],
    ['svg', 1],
    ['h2.svelte-x', 101],
    [':is(.a, #b) p', 10_001],
    ['li:first-child', 101],
  ])('%s is %i', (selector, expected) => {
    expect(specificity(selector)).toBe(expected);
  });
});

describe('text helpers', () => {
  it('splits outside brackets and quotes', () => {
    expect(splitTopLevel('a, :is(b, c), [x=","], d', ',')).toEqual([
      'a',
      ':is(b, c)',
      '[x=","]',
      'd',
    ]);
  });

  it('reads declarations with their importance', () => {
    expect(parseDeclarations('fill: var(--a, #fff); --x: 1px; color: red !important;')).toEqual([
      { name: 'fill', value: 'var(--a, #fff)', important: false },
      { name: '--x', value: '1px', important: false },
      { name: 'color', value: 'red', important: true },
    ]);
  });

  it('replaces var() by its value or its fallback', () => {
    const custom = new Map([
      ['--a', '#111111'],
      ['--b', 'var(--a)'],
    ]);
    expect(substituteVars('var(--a)', custom)).toBe('#111111');
    expect(substituteVars('var(--b)', custom)).toBe('#111111');
    expect(substituteVars('var(--none, var(--a))', custom)).toBe('#111111');
    expect(substituteVars('1px solid var(--none, #222222)', custom)).toBe('1px solid #222222');
    expect(substituteVars('var(--none)', custom)).toBeNull();
    expect(substituteVars('red', custom)).toBe('red');
  });

  it('turns rem and simple calc() into pixels', () => {
    expect(simplifyLengths('0.875rem')).toBe('14px');
    expect(simplifyLengths('calc(12px * 0.75)')).toBe('9px');
    expect(simplifyLengths('calc(1rem + 2px)')).toBe('18px');
    expect(simplifyLengths('0.25rem 0.5rem')).toBe('4px 8px');
    expect(simplifyLengths('calc(100% - 2px)')).toBe('calc(100% - 2px)');
    expect(simplifyLengths('#a1b2c3')).toBe('#a1b2c3');
  });

  it('writes a style attribute', () => {
    expect(
      styleText([
        ['fill', '#fff'],
        ['font-size', '12px'],
      ]),
    ).toBe('fill: #fff; font-size: 12px');
  });
});

describe('StyleResolver', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  function setUp(css: string, html: string) {
    const style = document.createElement('style');
    // Custom properties keep their text; a literal colour would read back as rgb().
    const markers = [1, 2, 3, 4, 5, 6, 7].map((n) => `--c${n}: C${n};`).join(' ');
    style.textContent = `:root { ${markers} }\n${css}`;
    document.head.append(style);
    document.body.innerHTML = html;
    return new StyleResolver(document);
  }

  function resolved(resolver: StyleResolver, selector: string) {
    const element = document.querySelector(selector)!;
    return Object.fromEntries(resolver.resolve(element, resolver.context(element)).own);
  }

  it('resolves tokens, inheritance and currentColor to literal values', () => {
    const resolver = setUp(
      `[data-scheme='light'] { --surface: #fafafa; --text: #101010; --dot: #c5365f; }
       [data-sheet][data-scheme='light'] { --surface: #ffffff; }
       .sheet { background: var(--surface); color: var(--text); font-size: 0.875rem; }
       .dot.s1 .shape:where(.s1) { fill: var(--dot-fill, var(--dot, #000)); }
       .number { fill: currentColor; font-size: calc(var(--label) * 0.5); }
       .shape:hover { fill: blue; }`,
      `<div data-scheme="light">
         <article class="sheet" data-sheet data-scheme="light">
           <svg style="--label: 20px">
             <g class="dot s1"><circle class="shape s1" /></g>
             <g class="dot s1" style="--dot-fill: var(--surface)"><circle id="mine" class="shape s1" /></g>
             <text class="number">1</text>
           </svg>
         </article>
       </div>`,
    );
    expect(resolved(resolver, '.sheet')).toEqual({
      background: '#ffffff',
      color: '#101010',
      'font-size': '14px',
    });
    expect(resolved(resolver, 'circle')).toEqual({ fill: '#c5365f' });
    expect(resolved(resolver, '#mine')).toEqual({ fill: '#ffffff' });
    expect(resolved(resolver, '.number')).toEqual({ fill: '#101010', 'font-size': '10px' });
  });

  it('orders by importance, specificity, then source order; the style attribute wins', () => {
    const resolver = setUp(
      `.a.b { color: var(--c1); }
       .a { color: var(--c2); stroke: var(--c3) !important; }
       .a { fill: var(--c4); }
       .a { fill: var(--c5); }`,
      `<p class="a b" style="stroke: var(--c6); fill: var(--c7)"></p><p class="a" id="two"></p>`,
    );
    expect(resolved(resolver, '.b')).toEqual({
      color: 'C1',
      stroke: 'C3',
      fill: 'C7',
    });
    expect(resolved(resolver, '#two')).toEqual({ color: 'C2', stroke: 'C3', fill: 'C5' });
  });

  it('takes inherit from the parent and drops what cannot be resolved', () => {
    const resolver = setUp(
      `.outer { font-family: serif; }
       .inner { font-family: inherit; fill: var(--missing); }`,
      `<div class="outer"><svg><text class="inner">x</text></svg></div>`,
    );
    expect(resolved(resolver, '.inner')).toEqual({ 'font-family': 'serif' });
  });

  it('reads media rules that apply and skips the others', () => {
    const resolver = setUp(
      `@media print { .a { color: var(--c1); } }
       @supports (display: grid) { .a { fill: var(--c2); } }`,
      `<p class="a"></p>`,
    );
    expect(resolved(resolver, '.a')).toEqual({ fill: 'C2' });
  });
});
