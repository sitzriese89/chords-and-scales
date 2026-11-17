// The chord form on its own (ADR-36): the interval-set editor on two octaves with the core's
// chord labels, plus the symbol fields, with the real WASM core.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Neck } from '../editor';
import { getTuning } from '../theory';
import ChordEditor from './ChordEditor.svelte';
import { newDraft, type ChordDraft } from './user-chords';

const neck = (): Neck => ({
  tuning: getTuning('guitar-6-standard')!,
  frets: 12,
  capo: 0,
  leftHanded: false,
});

function renderEditor(
  initial: ChordDraft = newDraft(),
  onsave = vi.fn<(draft: ChordDraft) => Promise<void>>(async () => {}),
) {
  render(ChordEditor, {
    title: 'New chord',
    initial,
    families: ['Sevenths', 'Custom'],
    root: 'A',
    neck: neck(),
    onsave,
    oncancel: vi.fn(),
  });
  return { onsave };
}

const lower = () => within(screen.getByRole('group', { name: 'Intervals up to the octave' }));
const upper = () => within(screen.getByRole('group', { name: 'Intervals above the octave' }));
const labels = (row: ReturnType<typeof lower>) =>
  row.getAllByRole('button').map((b) => b.textContent?.trim());
const pressed = () =>
  [lower(), upper()].flatMap((row) =>
    row
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.textContent?.trim()),
  );
const cell = (name: string) => screen.getByRole('gridcell', { name });
const type = (name: string, value: string) =>
  fireEvent.input(screen.getByRole('textbox', { name }), { target: { value } });

describe('ChordEditor', () => {
  afterEach(cleanup);

  it('offers two octaves with the labels chords use', () => {
    renderEditor();
    expect(labels(lower())).toEqual([
      '1',
      '♭2',
      '2',
      '♭3',
      '3',
      '4',
      '♭5',
      '5',
      '♯5',
      '6',
      '♭7',
      '7',
    ]);
    expect(labels(upper())).toEqual(['♭9', '9', '♯9', '11', '♯11', '♭13', '13']);
    expect(pressed()).toEqual(['1']);
    expect(screen.getByRole('textbox', { name: 'Symbol' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Jazz symbol' })).toHaveValue('');
  });

  it('keeps one interval per note: a 9 replaces the 2, and the neck shows it', async () => {
    renderEditor();
    // B (the 2 or 9 of A) on string 6, fret 7: a click on the neck takes the lower one.
    await fireEvent.click(cell('String 6, fret 7'));
    expect(pressed()).toEqual(['1', '2']);
    await fireEvent.click(upper().getByRole('button', { name: '9' }));
    expect(pressed()).toEqual(['1', '9']);
    expect(cell('String 6, fret 7, 9')).toBeInTheDocument();
    expect(cell('String 2, open, 9')).toBeInTheDocument();
    // A click on any B takes the note out, whichever octave it was in.
    await fireEvent.click(cell('String 2, open, 9'));
    expect(pressed()).toEqual(['1']);
  });

  it('starts from given intervals, e.g. notes picked on the neck', () => {
    renderEditor(newDraft(['1', '3', '5', '♭7', '♯9']));
    expect(pressed()).toEqual(['1', '3', '5', '♭7', '♯9']);
    // C (the ♯9 of A) on string 5, fret 3.
    expect(cell('String 5, fret 3, ♯9')).toBeInTheDocument();
  });

  it('shows labels the chord has that the picker does not offer', () => {
    renderEditor({ ...newDraft(['1', '3', '10']), name: 'Odd' });
    expect(pressed()).toEqual(['1', '3', '10']);
  });

  it('saves the intervals, name, family and symbols, trimmed', async () => {
    const { onsave } = renderEditor();
    await type('Name', ' Hendrix ');
    await type('Symbol', ' hx ');
    await type('Jazz symbol', ' HX ');
    await fireEvent.click(lower().getByRole('button', { name: '3' }));
    await fireEvent.click(lower().getByRole('button', { name: '♭7' }));
    await fireEvent.click(upper().getByRole('button', { name: '♯9' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onsave).toHaveBeenCalledWith({
      name: 'Hendrix',
      family: '',
      intervals: ['1', '3', '♭7', '♯9'],
      symbol: 'hx',
      jazzSymbol: 'HX',
    });
  });

  it('shows the core’s message when saving is refused', async () => {
    const onsave = vi.fn(async () => {
      throw new Error('the symbol "m7" already means the chord "Minor seventh"');
    });
    renderEditor(undefined, onsave);
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'the symbol "m7" already means the chord "Minor seventh"',
    );
  });
});
