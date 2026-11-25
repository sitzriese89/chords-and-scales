// The barre's colour (ADR-60): with the component's styles loaded, the barre takes the tone
// dots' colour, never the nut's or the capo's, so a barre next to the nut or the capo can't
// read as a second edge.
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { ChordVoicing } from '../theory';
import ChordDiagram from './ChordDiagram.svelte';

/** F on the first fret: a full barre right next to the nut (or the capo, given one). */
function fBarre(capo: number): ChordVoicing {
  const frets = [1, 3, 3, 2, 1, 1].map((f) => f + capo);
  const intervals = ['1', '5', '1', '3', '5', '1'];
  return {
    strings: frets.map((fret, i) => ({
      string: 6 - i,
      fret,
      midi: 40 + i * 5 + fret,
      pitchClass: 0,
      interval: intervals[i],
    })),
    bass: '1',
    omitted: [],
    lowestFret: capo + 1,
    span: 3,
    played: 6,
    barre: { fret: capo + 1, lowestString: 6, highestString: 1 },
    score: 0,
  };
}

const fill = (e: Element) => getComputedStyle(e).fill;

describe('ChordDiagram styles', () => {
  it.each([
    [0, 'nut'],
    [2, 'capo'],
  ])('draws a barre beside the %s edge in the dot colour, not the edge colour', (capo, edge) => {
    const c = render(ChordDiagram, { voicing: fBarre(capo), capo }).container;
    const barre = c.querySelector('rect.barre')!;
    const dot = c.querySelector('g.dot circle')!;
    const start = c.querySelector(`rect.${edge}`)!;
    expect(fill(barre)).not.toBe('');
    expect(fill(barre)).toBe(fill(dot));
    expect(fill(barre)).not.toBe(fill(start));
  });
});
