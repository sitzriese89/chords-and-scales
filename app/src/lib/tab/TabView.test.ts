import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../settings';
import { getTuning, scaleNotes } from '../theory';
import { playingOrder, tabPosition, tabStrings } from './position';
import TabView from './TabView.svelte';

const standard = () => getTuning('guitar-6-standard')!;

/** The drawn notes, left to right: `string:fret`. */
function drawn(container: Element): string[] {
  return [...container.querySelectorAll<SVGGElement>('g.note')]
    .sort((a, b) => Number(a.dataset.column) - Number(b.dataset.column))
    .map((g) => `${g.dataset.string}:${g.querySelector('text')!.textContent}`);
}

/** The y of each string's line, by string number. */
function lineYs(container: Element): Map<number, number> {
  return new Map(
    [...container.querySelectorAll<SVGLineElement>('line.string-line')].map((line) => [
      Number(line.dataset.string),
      Number(line.getAttribute('y1')),
    ]),
  );
}

function gMajorPattern1(direction: 'ascending' | 'descending' | 'both') {
  const tuning = standard();
  const position = tabPosition({
    tuning,
    frets: 24,
    capo: 0,
    notes: scaleNotes('major', 'G', 'sharps'),
    tab: { ...defaultSettings().tab, system: '3nps', pattern: 0 },
  });
  return {
    strings: tabStrings(tuning, 'sharps'),
    notes: playingOrder(position.positions, direction).map((p) => ({
      string: p.string,
      fret: p.fret,
      root: p.degree === 0,
    })),
  };
}

describe('TabView', () => {
  it('renders G major 3NPS pattern 1 in standard tuning with the expected fret numbers', () => {
    const { container } = render(TabView, gMajorPattern1('ascending'));
    expect(drawn(container)).toEqual([
      '6:3',
      '6:5',
      '6:7',
      '5:3',
      '5:5',
      '5:7',
      '4:4',
      '4:5',
      '4:7',
      '3:4',
      '3:5',
      '3:7',
      '2:5',
      '2:7',
      '2:8',
      '1:5',
      '1:7',
      '1:8',
    ]);
    // Each number sits on its string's line, string 1 on top.
    const ys = lineYs(container);
    expect([...ys.keys()]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ys.get(1)!).toBeLessThan(ys.get(6)!);
    for (const g of container.querySelectorAll<SVGGElement>('g.note')) {
      const y = Number(g.querySelector('text')!.getAttribute('y'));
      expect(y).toBe(ys.get(Number(g.dataset.string)));
    }
    // Columns go left to right in playing order.
    const xs = [...container.querySelectorAll<SVGGElement>('g.note')].map((g) =>
      Number(g.querySelector('text')!.getAttribute('x')),
    );
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('labels each line with its open note and marks the roots', () => {
    const { container } = render(TabView, gMajorPattern1('ascending'));
    expect([...container.querySelectorAll('text.string-label')].map((t) => t.textContent)).toEqual([
      'E',
      'B',
      'G',
      'D',
      'A',
      'E',
    ]);
    const roots = [...container.querySelectorAll<SVGGElement>('g.note.root')].map(
      (g) => `${g.dataset.string}:${g.dataset.fret}`,
    );
    // G on the low E (3), on D (5) and on the B string (8).
    expect(roots).toEqual(['6:3', '4:5', '2:8']);
  });

  it('plays down and up and back down', () => {
    const down = render(TabView, gMajorPattern1('descending'));
    expect(drawn(down.container).slice(0, 3)).toEqual(['1:8', '1:7', '1:5']);
    down.unmount();

    const both = render(TabView, gMajorPattern1('both'));
    const columns = drawn(both.container);
    expect(columns).toHaveLength(35);
    expect(columns[17]).toBe('1:8');
    expect(columns[18]).toBe('1:7');
    expect(columns.at(-1)).toBe('6:3');
  });

  it('names a capo and keeps the fret numbers absolute', () => {
    const { container } = render(TabView, {
      strings: tabStrings(standard(), 'sharps'),
      notes: [
        { string: 6, fret: 3 },
        { string: 6, fret: 5 },
      ],
      capo: 3,
    });
    expect(screen.getByText('Capo 3 (fret numbers are absolute)')).toBeInTheDocument();
    expect(drawn(container)).toEqual(['6:3', '6:5']);
  });

  it('draws 4 to 9 lines', () => {
    for (const id of ['bass-4-standard', 'guitar-9-standard']) {
      const tuning = getTuning(id)!;
      const { container, unmount } = render(TabView, {
        strings: tabStrings(tuning, 'sharps'),
        notes: [],
      });
      expect(container.querySelectorAll('line.string-line')).toHaveLength(tuning.notes.length);
      unmount();
    }
  });

  it('lists the notes for screen readers', () => {
    render(TabView, {
      strings: tabStrings(standard(), 'sharps'),
      notes: [
        { string: 5, fret: 0 },
        { string: 6, fret: 3, root: true },
      ],
      ariaLabel: 'Tab: test',
    });
    expect(screen.getByRole('img', { name: 'Tab: test' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Tab: test, notes in playing order' });
    expect([...list.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'String 5, open',
      'String 6, fret 3, root',
    ]);
  });

  it('draws its own frame unless a card already frames it', () => {
    const tab = { strings: tabStrings(standard(), 'sharps'), notes: [{ string: 6, fret: 3 }] };
    const framed = render(TabView, tab);
    expect(framed.container.querySelector('figure.tab')).toHaveClass('framed');
    framed.unmount();
    const bare = render(TabView, { ...tab, framed: false });
    expect(bare.container.querySelector('figure.tab')).not.toHaveClass('framed');
  });
});
