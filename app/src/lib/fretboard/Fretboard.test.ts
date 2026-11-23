import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Fretboard from './Fretboard.svelte';
import type { FretboardDot } from './types';

const dots: FretboardDot[] = [
  { string: 6, fret: 5, label: 'A', role: 'root', degree: 0 },
  { string: 6, fret: 8, label: 'C', role: 'tone', degree: 3 },
  { string: 5, fret: 7, label: 'E', role: 'tone', degree: 7 },
  { string: 4, fret: 5, label: 'G', role: 'dim', degree: 10 },
  { string: 1, fret: 0, label: 'E', role: 'tone', degree: 7 },
];

function dotEl(container: Element, string: number, fret: number): Element {
  const el = container.querySelector(`.dot[data-string="${string}"][data-fret="${fret}"]`);
  if (!el) throw new Error(`no dot at string ${string}, fret ${fret}`);
  return el;
}

/** Centre x of a dot, read from its shape (a circle's centre, or the middle of the square). */
function dotX(container: Element, string: number, fret: number): number {
  const shape = dotEl(container, string, fret).querySelector('.shape')!;
  if (shape.tagName === 'circle') return Number(shape.getAttribute('cx'));
  return Number(shape.getAttribute('x')) + Number(shape.getAttribute('width')) / 2;
}

function viewBoxWidth(container: Element): number {
  return Number(container.querySelector('svg')!.getAttribute('viewBox')!.split(' ')[2]);
}

describe('Fretboard', () => {
  it.each([
    [4, 12],
    [6, 24],
    [9, 27],
  ])('renders %i strings × %i frets', (strings, frets) => {
    const { container } = render(Fretboard, { strings, frets });
    expect(container.querySelectorAll('line.string')).toHaveLength(strings);
    expect(container.querySelectorAll('line.fret')).toHaveLength(frets);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(strings);
    for (const row of rows) {
      // Open string plus every fret.
      expect(row.querySelectorAll('[role="gridcell"]')).toHaveLength(frets + 1);
    }
  });

  it('draws single and double inlays', () => {
    const { container } = render(Fretboard, { strings: 6, frets: 24 });
    expect(container.querySelectorAll('.inlay[data-fret="5"]')).toHaveLength(1);
    expect(container.querySelectorAll('.inlay[data-fret="12"]')).toHaveLength(2);
    expect(container.querySelectorAll('.inlay[data-fret="24"]')).toHaveLength(2);
    expect(container.querySelectorAll('.inlay[data-fret="4"]')).toHaveLength(0);
  });

  it('mirrors x positions when left-handed', () => {
    const right = render(Fretboard, { strings: 6, frets: 24, dots });
    const width = viewBoxWidth(right.container);
    const rx = dots.map((d) => dotX(right.container, d.string, d.fret));
    right.unmount();

    const left = render(Fretboard, { strings: 6, frets: 24, dots, leftHanded: true });
    expect(viewBoxWidth(left.container)).toBe(width);
    dots.forEach((d, i) => {
      expect(dotX(left.container, d.string, d.fret)).toBeCloseTo(width - rx[i], 6);
    });
    // The nut side flips: the open string is now right of fret 5.
    expect(dotX(left.container, 1, 0)).toBeGreaterThan(dotX(left.container, 6, 5));
  });

  it('draws the root as a square and other notes as circles', () => {
    const { container } = render(Fretboard, { strings: 6, frets: 24, dots });
    expect(dotEl(container, 6, 5).querySelector('.shape')!.tagName).toBe('rect');
    expect(dotEl(container, 6, 8).querySelector('.shape')!.tagName).toBe('circle');
    expect(dotEl(container, 5, 7).querySelector('.shape')!.tagName).toBe('circle');
  });

  it('draws dimmed notes smaller', () => {
    const { container } = render(Fretboard, { strings: 6, frets: 24, dots });
    const dim = Number(dotEl(container, 4, 5).querySelector('circle')!.getAttribute('r'));
    const tone = Number(dotEl(container, 6, 8).querySelector('circle')!.getAttribute('r'));
    expect(dim).toBeLessThan(tone);
  });

  it('draws dimmed notes as rings without a label, still named for assistive tech', () => {
    const { container } = render(Fretboard, { strings: 6, frets: 24, dots });
    const dim = dotEl(container, 4, 5);
    expect(dim.querySelector('circle.shape')).not.toBeNull();
    expect(dim.querySelector('text')).toBeNull();
    expect(dim).toHaveTextContent('');
    // Other dots keep their labels.
    expect(dotEl(container, 6, 8).querySelector('text.label')).toHaveTextContent('C');
    expect(
      screen.getByRole('gridcell', { name: 'String 4, fret 5, G, dimmed' }),
    ).toBeInTheDocument();
  });

  it('uses the roomier ADR-56 neck: 36 units between strings, dots up to 13', () => {
    const { container } = render(Fretboard, { strings: 6, frets: 12, dots });
    const ys = [...container.querySelectorAll('line.string')].map((l) =>
      Number(l.getAttribute('y1')),
    );
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBe(36);
    const cell = container.querySelector('[data-cell="1:3"]')!;
    expect(cell.getAttribute('height')).toBe('36');
    // A full-size dot on a 12-fret neck.
    expect(dotEl(container, 6, 8).querySelector('circle')!.getAttribute('r')).toBe('13');
  });

  it('draws one dot per position, the last one given', () => {
    const { container } = render(Fretboard, {
      strings: 6,
      frets: 24,
      dots: [
        { string: 2, fret: 3, label: 'X', role: 'tone', degree: 2 },
        { string: 2, fret: 3, label: 'Y', role: 'root', degree: 0 },
        { string: 7, fret: 3, label: 'Z', role: 'tone', degree: 2 },
      ],
    });
    expect(container.querySelectorAll('.dot')).toHaveLength(1);
    expect(dotEl(container, 2, 3)).toHaveTextContent('Y');
  });

  it('shows the labels it is given', () => {
    render(Fretboard, { strings: 6, frets: 24, dots });
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    // G is dimmed: a ring without a label.
    expect(screen.queryByText('G')).toBeNull();
  });

  it('colours by degree token only when asked', () => {
    const plain = render(Fretboard, { strings: 6, frets: 24, dots });
    expect((dotEl(plain.container, 6, 8) as SVGElement).style.getPropertyValue('--dot-fill')).toBe(
      '',
    );
    plain.unmount();

    const { container } = render(Fretboard, { strings: 6, frets: 24, dots, colorByDegree: true });
    const fill = (el: Element) => (el as SVGElement).style.getPropertyValue('--dot-fill');
    expect(fill(dotEl(container, 6, 8))).toMatch(/^var\(--degree-3,/);
    expect(fill(dotEl(container, 6, 5))).toMatch(/^var\(--degree-0,/);
    // Dimmed notes keep the dim colour.
    expect(fill(dotEl(container, 4, 5))).toBe('');
  });

  it('names every position for assistive tech', () => {
    render(Fretboard, { strings: 6, frets: 24, dots });
    expect(screen.getByRole('grid', { name: 'Fretboard' })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: 'String 6, fret 5, A, root' })).toBeInTheDocument();
    expect(
      screen.getByRole('gridcell', { name: 'String 4, fret 5, G, dimmed' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: 'String 1, open, E' })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: 'String 3, fret 2' })).toBeInTheDocument();
  });

  it('rings selected positions in the shape of their dot, and names them selected', () => {
    const { container } = render(Fretboard, {
      strings: 6,
      frets: 24,
      capo: 1,
      dots,
      selected: [
        { string: 6, fret: 5 },
        { string: 6, fret: 8 },
        { string: 3, fret: 2 },
        // Off the neck or below the capo: not drawn.
        { string: 7, fret: 2 },
        { string: 2, fret: 0 },
      ],
    });
    const rings = [...container.querySelectorAll<SVGElement>('.selection')];
    expect(rings.map((r) => [r.dataset.string, r.dataset.fret, r.tagName])).toEqual([
      ['6', '5', 'rect'],
      ['6', '8', 'circle'],
      ['3', '2', 'circle'],
    ]);
    expect(
      screen.getByRole('gridcell', { name: 'String 6, fret 5, A, root, selected' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('gridcell', { name: 'String 3, fret 2, selected' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: 'String 5, fret 7, E' })).toBeInTheDocument();
  });

  it('emits the clicked position', async () => {
    const onactivate = vi.fn();
    render(Fretboard, { strings: 6, frets: 24, dots, onactivate });
    await fireEvent.click(screen.getByRole('gridcell', { name: 'String 5, fret 7, E' }));
    expect(onactivate).toHaveBeenCalledExactlyOnceWith({ string: 5, fret: 7 });
    await fireEvent.click(screen.getByRole('gridcell', { name: 'String 2, fret 11' }));
    expect(onactivate).toHaveBeenLastCalledWith({ string: 2, fret: 11 });
  });

  it('has one tab stop, starting on the root', () => {
    render(Fretboard, { strings: 6, frets: 24, dots });
    const stops = screen.getAllByRole('gridcell').filter((c) => c.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAccessibleName('String 6, fret 5, A, root');
  });

  it('moves with arrow keys and activates with Enter and Space', async () => {
    const onactivate = vi.fn();
    render(Fretboard, { strings: 6, frets: 24, dots, onactivate });
    const root = screen.getByRole('gridcell', { name: 'String 6, fret 5, A, root' });
    root.focus();

    await fireEvent.keyDown(root, { key: 'ArrowRight' });
    const next = screen.getByRole('gridcell', { name: 'String 6, fret 6' });
    expect(next).toHaveFocus();
    expect(next).toHaveAttribute('tabindex', '0');
    expect(root).toHaveAttribute('tabindex', '-1');

    await fireEvent.keyDown(next, { key: 'ArrowUp' });
    const up = screen.getByRole('gridcell', { name: 'String 5, fret 6' });
    expect(up).toHaveFocus();

    await fireEvent.keyDown(up, { key: 'Enter' });
    expect(onactivate).toHaveBeenLastCalledWith({ string: 5, fret: 6 });
    await fireEvent.keyDown(up, { key: ' ' });
    expect(onactivate).toHaveBeenCalledTimes(2);

    await fireEvent.keyDown(up, { key: 'Home' });
    expect(screen.getByRole('gridcell', { name: 'String 5, open' })).toHaveFocus();
  });

  it('mirrors left/right arrow keys when left-handed', async () => {
    render(Fretboard, { strings: 6, frets: 24, dots, leftHanded: true });
    const root = screen.getByRole('gridcell', { name: 'String 6, fret 5, A, root' });
    root.focus();
    await fireEvent.keyDown(root, { key: 'ArrowRight' });
    expect(screen.getByRole('gridcell', { name: 'String 6, fret 4' })).toHaveFocus();
  });

  it('shades frets below the capo and leaves them out of the grid', () => {
    const { container } = render(Fretboard, {
      strings: 6,
      frets: 24,
      capo: 3,
      dots: [...dots, { string: 3, fret: 2, label: 'A', role: 'tone', degree: 0 }],
    });
    expect(container.querySelector('.capo')).not.toBeNull();
    expect(screen.queryAllByRole('gridcell', { name: /^String 1, (open|fret [12])(,|$)/ })).toEqual(
      [],
    );
    expect(screen.getByRole('gridcell', { name: 'String 1, fret 3' })).toBeInTheDocument();
    // The open-string dot and the dot below the capo are not drawn.
    expect(container.querySelector('.dot[data-fret="0"]')).toBeNull();
    expect(container.querySelector('.dot[data-fret="2"]')).toBeNull();
    for (const row of screen.getAllByRole('row')) {
      expect(row.querySelectorAll('[role="gridcell"]')).toHaveLength(24 - 3 + 1);
    }
  });
});
