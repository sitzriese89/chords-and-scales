import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { chordVoicings, getTuning, type ChordVoicing, type VoicingBarre } from '../theory';
import ChordDiagram from './ChordDiagram.svelte';
import {
  BARRE_WIDTH,
  DOT_RADIUS,
  MARKER_OFFSET,
  MARKER_RADIUS,
  barreRect,
  diagramSize,
  diagramWindow,
  fretLabel,
  fretX,
  labelY,
  markerX,
  shapeText,
  stringY,
  wireX,
} from './diagram';

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
    expect(diagramWindow(openC)).toEqual({ firstFret: 1, frets: 4, start: 'nut', label: null });
    expect(diagramWindow(voicing('x 2 4 4 4 2', ['1', '5', '1', '3', '5']))).toMatchObject({
      start: 'nut',
    });
  });

  it('starts at the lowest fret, numbered, higher up the neck', () => {
    expect(diagramWindow(gBarre)).toEqual({ firstFret: 3, frets: 4, start: 'fret', label: 3 });
    // An open string far below the hand: the window still starts at the hand.
    expect(diagramWindow(voicing('0 x 9 9 9 7', ['1', '1', '3', '5', '1']))).toEqual({
      firstFret: 7,
      frets: 4,
      start: 'fret',
      label: 7,
    });
  });

  it('grows past four frets for a wide shape', () => {
    expect(diagramWindow(voicing('5 x 7 8 9 10', ['1', '1', '3', '5', '1']))).toMatchObject({
      firstFret: 5,
      frets: 6,
    });
  });

  it('starts at the capo, numbering its first fret, and counts from there', () => {
    // Capo on 2: the C shape played as D.
    const d = voicing('x 5 4 2 3 2', ['1', '3', '5', '1', '3']);
    expect(diagramWindow(d, 2)).toEqual({ firstFret: 3, frets: 4, start: 'capo', label: 3 });
    expect(diagramWindow(voicing('x 9 11 11 11 9', ['1', '5', '1', '3', '5']), 2)).toMatchObject({
      start: 'fret',
      firstFret: 9,
    });
  });
});

describe('shapeText', () => {
  it('writes a shape lowest string first, spaced once a fret has two digits', () => {
    expect(shapeText(openC)).toBe('x32010');
    expect(shapeText(voicing('x 10 12 12 11 x', ['1', '5', '1', '3']))).toBe('x 10 12 12 11 x');
  });

  it('joins the strings with a separator when given one', () => {
    expect(shapeText(openC, ',')).toBe('x,3,2,0,1,0');
    expect(shapeText(voicing('x 10 12 12 11 x', ['1', '5', '1', '3']), ',')).toBe(
      'x,10,12,12,11,x',
    );
  });
});

describe('diagram geometry', () => {
  const nut = diagramWindow(openC);
  const high = diagramWindow(gBarre);

  it('lays the strings across, the lowest at the bottom', () => {
    expect(stringY(0, 6)).toBeGreaterThan(stringY(1, 6));
    expect(stringY(5, 6)).toBeLessThan(stringY(4, 6));
    // More strings make it taller, not wider: the width follows the frets.
    expect(diagramSize(9, 4).height).toBeGreaterThan(diagramSize(6, 4).height);
    expect(diagramSize(9, 4).width).toBe(diagramSize(4, 4).width);
  });

  it('counts the frets up to the right from the nut, mirrored when left-handed', () => {
    const { width } = diagramSize(6, nut.frets);
    expect(fretX(2, nut, false)).toBeGreaterThan(fretX(1, nut, false));
    expect(wireX(0, nut, false)).toBeLessThan(fretX(1, nut, false));
    expect(fretX(2, nut, true)).toBeLessThan(fretX(1, nut, true));
    expect(wireX(0, nut, true)).toBeGreaterThan(fretX(1, nut, true));
    for (const fret of [1, 2, 3, 4]) {
      expect(fretX(fret, nut, true)).toBe(width - fretX(fret, nut, false));
    }
    // Higher up the neck the first column is the shape's lowest fret.
    expect(fretX(3, high, false)).toBe(fretX(1, nut, false));
  });

  it('puts the markers just beyond the nut, and the fret number under the lowest string', () => {
    expect(markerX(nut, false)).toBe(wireX(0, nut, false) - MARKER_OFFSET);
    expect(markerX(nut, true)).toBe(wireX(0, nut, true) + MARKER_OFFSET);
    // Closer to the nut than to the diagram's outer edge, and inside the drawing.
    const { width } = diagramSize(6, nut.frets);
    expect(markerX(nut, false)).toBeGreaterThan(wireX(0, nut, false) / 2);
    expect(markerX(nut, false) - MARKER_RADIUS).toBeGreaterThan(0);
    expect(markerX(nut, true) + MARKER_RADIUS).toBeLessThan(width);
    expect(labelY(6)).toBeGreaterThan(stringY(0, 6));
    expect(labelY(6)).toBeLessThan(diagramSize(6, 4).height);
  });

  it('writes the fret under the first column as a fret: 3fr', () => {
    expect(fretLabel(3)).toBe('3fr');
    expect(fretLabel(12)).toBe('12fr');
  });

  it('draws a barre as a narrow bar from its highest string to its lowest', () => {
    const bar = barreRect(gBarre.barre!, 6, high, false);
    expect(bar.width).toBe(BARRE_WIDTH);
    expect(bar.width).toBeLessThan(DOT_RADIUS);
    expect(bar.x + bar.width / 2).toBe(fretX(3, high, false));
    expect(bar.y).toBe(stringY(5, 6));
    expect(bar.y + bar.height).toBe(stringY(0, 6));
    // Part of the neck: three strings of a bass, mirrored left-handed.
    const partial = barreRect({ fret: 3, lowestString: 3, highestString: 1 }, 4, high, true);
    expect(partial.y).toBe(stringY(3, 4));
    expect(partial.y + partial.height).toBe(stringY(1, 4));
    expect(partial.x + partial.width / 2).toBe(fretX(3, high, true));
  });
});

describe('ChordDiagram', () => {
  const num = (e: Element | null, name: string) => Number(e!.getAttribute(name));
  const dotAt = (c: Element, string: number) =>
    c.querySelector(`g.dot[data-string="${string}"] text`)!;
  /** A marker's extent: ○ is a circle, × a path of two strokes through its centre. */
  const box = (e: Element) => {
    if (e.localName === 'circle') {
      const [cx, cy, r] = ['cx', 'cy', 'r'].map((a) => num(e, a));
      return { left: cx - r, right: cx + r, cx, cy };
    }
    const n = e
      .getAttribute('d')!
      .match(/-?[\d.]+/g)!
      .map(Number);
    const xs = n.filter((_, i) => i % 2 === 0);
    const ys = n.filter((_, i) => i % 2 === 1);
    const [left, right] = [Math.min(...xs), Math.max(...xs)];
    return { left, right, cx: (left + right) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 };
  };

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
    expect(c.querySelector('svg')).toHaveAttribute('data-start', 'nut');
  });

  it('lies like the neck: strings across, the lowest at the bottom, frets to the right', () => {
    const c = draw(openC);
    for (const line of all(c, 'line.string')) {
      expect(num(line, 'y1')).toBe(num(line, 'y2'));
    }
    for (const line of all(c, 'line.fret')) {
      expect(num(line, 'x1')).toBe(num(line, 'x2'));
    }
    // C on the A string (5) at fret 3 sits lower and further right than C on the B string
    // (2) at fret 1; E on the D string (4) at fret 2 between them.
    const [a, d, b] = [5, 4, 2].map((s) => dotAt(c, s));
    expect(num(a, 'y')).toBeGreaterThan(num(d, 'y'));
    expect(num(d, 'y')).toBeGreaterThan(num(b, 'y'));
    expect(num(a, 'x')).toBeGreaterThan(num(d, 'x'));
    expect(num(d, 'x')).toBeGreaterThan(num(b, 'x'));
    // The nut is the left edge; the markers sit just left of it, clear of it, on their strings.
    const nutX = num(c.querySelector('rect.nut'), 'x');
    expect(nutX).toBeLessThan(num(b, 'x'));
    const muted = box(markers(c, 'muted')[0]);
    expect(muted.right).toBeLessThan(nutX - 1);
    expect(muted.right).toBeGreaterThan(nutX - 4);
    expect(muted.right - muted.left).toBe(2 * MARKER_RADIUS);
    expect(muted.cy).toBe(stringY(0, 6));
    const open = markers(c, 'open').map(box);
    expect(open.map((m) => m.cy)).toEqual([stringY(3, 6), stringY(5, 6)]);
    for (const m of open) {
      expect(m.cx).toBe(muted.cx);
      expect(m.right).toBeLessThan(nutX - 1);
    }
  });

  it('draws a barre as a narrow bar under its dots', () => {
    const c = draw(gBarre);
    const barre = c.querySelector('rect.barre')!;
    expect(num(barre, 'width')).toBe(BARRE_WIDTH);
    expect(num(barre, 'width')).toBeLessThan(2 * DOT_RADIUS);
    // Thinner than the nut and the capo, so a barre beside them isn't a second edge.
    const nut = draw(openC).querySelector('rect.nut')!;
    const capo = draw(openC, { capo: 2 }).querySelector('rect.capo')!;
    expect(num(barre, 'width')).toBeLessThan(num(nut, 'width'));
    expect(num(barre, 'width')).toBeLessThan(num(capo, 'width'));
    // It ends at its outer dots' middles, so its ends hide under them.
    expect(num(barre, 'y')).toBe(stringY(5, 6));
    expect(num(barre, 'y') + num(barre, 'height')).toBe(stringY(0, 6));
    // Drawn before the dots, so every dot is on top of it.
    for (const g of all(c, 'g.dot')) {
      expect(barre.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('draws a barre across its strings and numbers the lowest fret under its column', () => {
    const c = draw(gBarre);
    expect(all(c, 'rect.nut')).toHaveLength(0);
    expect(c.querySelector('svg')).toHaveAttribute('data-start', 'fret');
    const label = c.querySelector('.fret-label')!;
    expect(label.textContent).toBe('3fr');
    const window = diagramWindow(gBarre);
    expect(num(label, 'x')).toBe(fretX(3, window, false));
    // Under the lowest string, and under every dot.
    expect(num(label, 'y')).toBeGreaterThan(stringY(0, 6));
    for (const t of all(c, 'g.dot text')) expect(num(label, 'y')).toBeGreaterThan(num(t, 'y'));
    const barre = c.querySelector('rect.barre')!;
    expect(barre.getAttribute('data-fret')).toBe('3');
    // Upright on fret 3, from the high E string down to the low one.
    expect(num(barre, 'x') + num(barre, 'width') / 2).toBe(fretX(3, window, false));
    expect(num(barre, 'height')).toBe(stringY(0, 6) - stringY(5, 6));
    expect(markers(c, 'muted')).toHaveLength(0);
    expect(markers(c, 'open')).toHaveLength(0);
    expect(dots(c)).toHaveLength(6);
  });

  it('draws four strings of a bass', () => {
    const c = draw(voicing('x 3 5 5', ['1', '5', '1']));
    expect(all(c, 'line.string')).toHaveLength(4);
    expect(markers(c, 'muted')).toHaveLength(1);
    expect(dots(c)).toEqual(['3:3', '2:5', '1:5']);
    expect(c.querySelector('.fret-label')?.textContent).toBe('3fr');
  });

  it.each([
    ['bass-5-standard', 5],
    ['guitar-7-standard', 7],
    ['guitar-8-standard', 8],
    ['guitar-9-standard', 9],
  ])('draws %s from the core: %i strings', (id, strings) => {
    const tuning = getTuning(id)!;
    const [best] = chordVoicings(tuning, 24, 0, 'major', 4, { limit: 1 });
    const c = draw(best);
    expect(all(c, 'line.string')).toHaveLength(strings);
    const muted = best.strings.filter((s) => s === null).length;
    const open = best.strings.filter((s) => s?.fret === 0).length;
    expect(markers(c, 'muted')).toHaveLength(muted);
    expect(markers(c, 'open')).toHaveLength(open);
    expect(dots(c)).toHaveLength(strings - muted - open);
    // One row per string: taller than a 6-string diagram with more strings, shorter with
    // fewer; the width follows the frets, not the strings.
    const svg = c.querySelector('svg')!;
    const six = draw(openC).querySelector('svg')!;
    expect(Math.sign(num(svg, 'height') - num(six, 'height'))).toBe(Math.sign(strings - 6));
    expect(num(svg, 'width')).toBe(diagramSize(strings, diagramWindow(best).frets).width);
  });

  it('draws the capo as the starting edge, numbered, and an open string at the capo as ○', () => {
    const c = draw(voicing('x 5 4 2 3 2', ['1', '3', '5', '1', '3']), { capo: 2 });
    expect(all(c, 'rect.capo')).toHaveLength(1);
    expect(all(c, 'rect.nut')).toHaveLength(0);
    expect(c.querySelector('svg')).toHaveAttribute('data-start', 'capo');
    const label = c.querySelector('.fret-label')!;
    expect(label.textContent).toBe('3fr');
    // The capo is the left edge, the first fret above it numbered under its column.
    expect(num(c.querySelector('rect.capo'), 'x')).toBeLessThan(num(label, 'x'));
    expect(markers(c, 'open')).toHaveLength(2);
    expect(dots(c)).toEqual(['5:5', '4:4', '2:3']);
  });

  it('mirrors the frets when left-handed: the nut and the markers on the right', () => {
    const right = draw(openC);
    const left = draw(openC, { leftHanded: true });
    const width = num(right.querySelector('svg'), 'width');
    expect(num(left.querySelector('svg'), 'width')).toBe(width);
    for (const string of [5, 4, 2]) {
      expect(num(dotAt(left, string), 'x')).toBe(width - num(dotAt(right, string), 'x'));
      // The strings stay where they are: the lowest at the bottom.
      expect(num(dotAt(left, string), 'y')).toBe(num(dotAt(right, string), 'y'));
    }
    expect(num(dotAt(left, 5), 'x')).toBeLessThan(num(dotAt(left, 2), 'x'));
    const nut = left.querySelector('rect.nut')!;
    expect(num(nut, 'x')).toBeGreaterThan(num(dotAt(left, 5), 'x'));
    // The markers just right of the nut, clear of it, mirrored from the right-handed ones.
    const nutRight = num(nut, 'x') + num(nut, 'width');
    for (const kind of ['muted', 'open']) {
      const l = markers(left, kind).map(box);
      const r = markers(right, kind).map(box);
      expect(l.map((m) => m.cx)).toEqual(r.map((m) => width - m.cx));
      for (const m of l) {
        expect(m.left).toBeGreaterThan(nutRight + 1);
        expect(m.left).toBeLessThan(nutRight + 4);
      }
    }
  });

  it('puts the markers just beyond the capo, and beyond the first wire higher up', () => {
    const capo = draw(voicing('x 5 4 2 3 2', ['1', '3', '5', '1', '3']), { capo: 2 });
    const edge = num(capo.querySelector('rect.capo'), 'x');
    for (const m of all(capo, '[data-marker]').map(box)) {
      expect(m.right).toBeLessThan(edge - 1);
      expect(m.right).toBeGreaterThan(edge - 4);
    }
    const high = draw(voicing('x 10 12 12 12 0', ['1', '5', '1', '3', '3']));
    const window = diagramWindow(voicing('x 10 12 12 12 0', ['1', '5', '1', '3', '3']));
    const [muted] = markers(high, 'muted').map(box);
    expect(muted.cx).toBe(wireX(0, window, false) - MARKER_OFFSET);
    expect(markers(high, 'open')).toHaveLength(1);
  });

  it('mirrors the fret number with its column when left-handed', () => {
    const right = draw(gBarre).querySelector('.fret-label')!;
    const left = draw(gBarre, { leftHanded: true }).querySelector('.fret-label')!;
    const width = diagramSize(6, 4).width;
    expect(num(left, 'x')).toBe(width - num(right, 'x'));
    expect(num(left, 'y')).toBe(num(right, 'y'));
    expect(left.textContent).toBe('3fr');
  });

  it('labels dots as asked and has an accessible name', () => {
    const c = draw(openC, { label: () => 'C', ariaLabel: 'C: x32010' });
    expect(all(c, 'g.dot text').map((t) => t.textContent)).toEqual(['C', 'C', 'C']);
    expect(c.querySelector('svg')).toHaveAttribute('role', 'img');
    expect(c.querySelector('svg')).toHaveAttribute('aria-label', 'C: x32010');
  });
});
