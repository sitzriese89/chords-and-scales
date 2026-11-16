import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { chordVoicings, getTuning, type ChordVoicing, type VoicingBarre } from '../theory';
import ChordDiagram from './ChordDiagram.svelte';
import { diagramWindow, shapeText, stringIndex, stringX } from './diagram';

/**
 * A voicing as the core gives it, from a written shape (lowest string first, `x` muted,
 * frets separated by spaces) and the interval each played string sounds. Only what a diagram
 * draws is filled in properly.
 */
function voicing(shape: string, intervals: string[], barre: VoicingBarre | null = null) {
  const frets = shape.split(' ');
  const labels = [...intervals];
  const strings = frets.map((fret, index) =>
    fret === 'x'
      ? null
      : {
          string: frets.length - index,
          fret: Number(fret),
          midi: 40 + index * 5 + Number(fret),
          pitchClass: 0,
          interval: labels.shift()!,
        },
  );
  return {
    strings,
    bass: '1',
    omitted: [],
    lowestFret: null,
    span: 0,
    played: strings.filter(Boolean).length,
    barre,
    score: 0,
  } satisfies ChordVoicing;
}

const openC = voicing('x 3 2 0 1 0', ['1', '3', '5', '1', '3']);
const gBarre = voicing('3 5 5 4 3 3', ['1', '5', '1', '3', '5', '1'], {
  fret: 3,
  lowestString: 6,
  highestString: 1,
});

function draw(v: ChordVoicing, props: Record<string, unknown> = {}) {
  return render(ChordDiagram, { voicing: v, ...props }).container;
}

const all = (c: Element, selector: string) => [...c.querySelectorAll(selector)];
const markers = (c: Element, kind: string) => all(c, `[data-marker="${kind}"]`);
const dots = (c: Element) =>
  all(c, 'g.dot').map(
    (g) => `${(g as SVGGElement).dataset.string}:${(g as SVGGElement).dataset.fret}`,
  );

describe('diagramWindow', () => {
  it('starts at the nut while the shape fits the first frets', () => {
    expect(diagramWindow(openC)).toEqual({ firstFret: 1, rows: 4, top: 'nut', label: null });
    expect(diagramWindow(voicing('x 2 4 4 4 2', ['1', '5', '1', '3', '5']))).toMatchObject({
      top: 'nut',
    });
  });

  it('starts at the lowest fret, numbered, higher up the neck', () => {
    expect(diagramWindow(gBarre)).toEqual({ firstFret: 3, rows: 4, top: 'fret', label: 3 });
    // An open string far below the hand: the window still starts at the hand.
    expect(diagramWindow(voicing('0 x 9 9 9 7', ['1', '1', '3', '5', '1']))).toEqual({
      firstFret: 7,
      rows: 4,
      top: 'fret',
      label: 7,
    });
  });

  it('grows past four rows for a wide shape', () => {
    expect(diagramWindow(voicing('5 x 7 8 9 10', ['1', '1', '3', '5', '1']))).toMatchObject({
      firstFret: 5,
      rows: 6,
    });
  });

  it('starts at the capo, numbering its first fret, and counts from there', () => {
    // Capo on 2: the C shape played as D.
    const d = voicing('x 5 4 2 3 2', ['1', '3', '5', '1', '3']);
    expect(diagramWindow(d, 2)).toEqual({ firstFret: 3, rows: 4, top: 'capo', label: 3 });
    expect(diagramWindow(voicing('x 9 11 11 11 9', ['1', '5', '1', '3', '5']), 2)).toMatchObject({
      top: 'fret',
      firstFret: 9,
    });
  });
});

describe('shapeText', () => {
  it('writes a shape lowest string first, spaced once a fret has two digits', () => {
    expect(shapeText(openC)).toBe('x32010');
    expect(shapeText(voicing('x 10 12 12 11 x', ['1', '5', '1', '3']))).toBe('x 10 12 12 11 x');
  });
});

describe('ChordDiagram', () => {
  it('draws the open C shape: a nut, × and ○ markers, five dots', () => {
    const c = draw(openC);
    expect(all(c, 'line.string')).toHaveLength(6);
    expect(all(c, 'line.fret')).toHaveLength(5);
    expect(all(c, 'rect.nut')).toHaveLength(1);
    expect(all(c, '.fret-label')).toHaveLength(0);
    expect(markers(c, 'muted')).toHaveLength(1);
    expect(markers(c, 'open')).toHaveLength(2);
    expect(dots(c)).toEqual(['5:3', '4:2', '2:1']);
    expect(all(c, 'g.dot[data-role="root"]')).toHaveLength(2);
    expect(all(c, 'g.dot text').map((t) => t.textContent)).toEqual(['1', '3', '1']);
    expect(all(c, 'rect.barre')).toHaveLength(0);
  });

  it('draws a barre across its strings and numbers the first fret', () => {
    const c = draw(gBarre);
    expect(all(c, 'rect.nut')).toHaveLength(0);
    expect(c.querySelector('.fret-label')?.textContent).toBe('3');
    const barre = c.querySelector('rect.barre')!;
    expect(barre.getAttribute('data-fret')).toBe('3');
    // From the low E string to the high one.
    const width = Number(barre.getAttribute('width'));
    expect(width).toBeCloseTo(stringX(5, 6, false) - stringX(0, 6, false) + 15);
    expect(markers(c, 'muted')).toHaveLength(0);
    expect(markers(c, 'open')).toHaveLength(0);
    expect(dots(c)).toHaveLength(6);
  });

  it('draws four strings of a bass', () => {
    const c = draw(voicing('x 3 5 5', ['1', '5', '1']));
    expect(all(c, 'line.string')).toHaveLength(4);
    expect(markers(c, 'muted')).toHaveLength(1);
    expect(dots(c)).toEqual(['3:3', '2:5', '1:5']);
    expect(c.querySelector('.fret-label')?.textContent).toBe('3');
  });

  it('draws nine strings from the core', () => {
    const nine = getTuning('guitar-9-standard')!;
    const [best] = chordVoicings(nine, 24, 0, 'major', 4, { limit: 1 });
    const c = draw(best);
    expect(all(c, 'line.string')).toHaveLength(9);
    const muted = best.strings.filter((s) => s === null).length;
    const open = best.strings.filter((s) => s?.fret === 0).length;
    expect(markers(c, 'muted')).toHaveLength(muted);
    expect(markers(c, 'open')).toHaveLength(open);
    expect(dots(c)).toHaveLength(9 - muted - open);
    const width = Number(c.querySelector('svg')!.getAttribute('width'));
    expect(width).toBeGreaterThan(Number(draw(openC).querySelector('svg')!.getAttribute('width')));
  });

  it('draws the capo as the top edge and an open string at the capo fret as ○', () => {
    const c = draw(voicing('x 5 4 2 3 2', ['1', '3', '5', '1', '3']), { capo: 2 });
    expect(all(c, 'rect.capo')).toHaveLength(1);
    expect(all(c, 'rect.nut')).toHaveLength(0);
    expect(c.querySelector('.fret-label')?.textContent).toBe('3');
    expect(markers(c, 'open')).toHaveLength(2);
    expect(dots(c)).toEqual(['5:5', '4:4', '2:3']);
  });

  it('mirrors the strings when left-handed', () => {
    const right = draw(openC);
    const left = draw(openC, { leftHanded: true });
    const x = (c: Element, string: number) =>
      Number(c.querySelector(`g.dot[data-string="${string}"] text`)!.getAttribute('x'));
    const width = Number(right.querySelector('svg')!.getAttribute('width'));
    expect(x(right, 5)).toBe(stringX(stringIndex(5, 6), 6, false));
    expect(x(left, 5)).toBe(width - x(right, 5));
    // The low string is on the left right-handed, on the right left-handed.
    expect(x(right, 5)).toBeLessThan(x(right, 2));
    expect(x(left, 5)).toBeGreaterThan(x(left, 2));
  });

  it('labels dots as asked and has an accessible name', () => {
    const c = draw(openC, { label: () => 'C', ariaLabel: 'C: x32010' });
    expect(all(c, 'g.dot text').map((t) => t.textContent)).toEqual(['C', 'C', 'C']);
    expect(c.querySelector('svg')).toHaveAttribute('role', 'img');
    expect(c.querySelector('svg')).toHaveAttribute('aria-label', 'C: x32010');
  });
});
