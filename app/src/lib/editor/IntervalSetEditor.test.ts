import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTuning } from '../theory';
import IntervalSetEditor from './IntervalSetEditor.svelte';
import type { IntervalSetDraft, Neck } from './intervals';

const neck = (): Neck => ({
  tuning: getTuning('guitar-6-standard')!,
  frets: 12,
  capo: 0,
  leftHanded: false,
});

function renderEditor(
  initial: IntervalSetDraft = { name: '', family: '', intervals: ['1'] },
  onsave = vi.fn<(draft: IntervalSetDraft) => Promise<void>>(async () => {}),
) {
  const oncancel = vi.fn();
  render(IntervalSetEditor, {
    title: 'New scale',
    noun: 'scale',
    initial,
    families: ['Diatonic modes', 'Custom'],
    defaultFamily: 'Custom',
    root: 'A',
    neck: neck(),
    onsave,
    oncancel,
  });
  return { onsave, oncancel };
}

const picker = () => within(screen.getByRole('group', { name: 'Intervals' }));
const semitone = (label: string) => picker().getByRole('button', { name: label });
const pressed = () =>
  picker()
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.textContent?.trim());
const cell = (name: string) => screen.getByRole('gridcell', { name });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('IntervalSetEditor', () => {
  afterEach(cleanup);

  it('offers the 12 semitones by their default labels, with the root always in', () => {
    renderEditor();
    expect(
      picker()
        .getAllByRole('button')
        .map((b) => b.textContent?.trim()),
    ).toEqual(['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7']);
    expect(pressed()).toEqual(['1']);
    expect(semitone('1')).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('toggles a note from the picker and shows it on the neck', async () => {
    renderEditor();
    // A on string 6, fret 5 is the root; C (♭3 of A) is on string 6, fret 8.
    expect(cell('String 6, fret 5, 1, root')).toBeInTheDocument();
    expect(cell('String 6, fret 8')).toBeInTheDocument();
    await fireEvent.click(semitone('♭3'));
    expect(pressed()).toEqual(['1', '♭3']);
    expect(cell('String 6, fret 8, ♭3')).toBeInTheDocument();
    await fireEvent.click(semitone('♭3'));
    expect(pressed()).toEqual(['1']);
    expect(cell('String 6, fret 8')).toBeInTheDocument();
  });

  it('toggles the note of a clicked position, by its interval from the root', async () => {
    renderEditor();
    // G (♭7 of A) on string 6, fret 3; every G on the neck lights up.
    await fireEvent.click(cell('String 6, fret 3'));
    expect(pressed()).toEqual(['1', '♭7']);
    expect(cell('String 1, fret 3, ♭7')).toBeInTheDocument();
    expect(cell('String 4, fret 5, ♭7')).toBeInTheDocument();
    // Clicking any G takes it out again; clicking the root changes nothing.
    await fireEvent.click(cell('String 1, fret 3, ♭7'));
    expect(pressed()).toEqual(['1']);
    await fireEvent.click(cell('String 5, open, 1, root'));
    expect(pressed()).toEqual(['1']);
  });

  it('keeps the labels of what it edits', () => {
    renderEditor({ name: 'Lydian-ish', family: 'Mine', intervals: ['1', '3', '#4', '5'] });
    expect(pressed()).toEqual(['1', '3', '♯4', '5']);
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Lydian-ish');
    expect(screen.getByRole('combobox', { name: 'Family' })).toHaveValue('Mine');
  });

  it('saves what was entered, trimmed', async () => {
    const { onsave } = renderEditor();
    await fireEvent.input(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: '  Mine ' },
    });
    await fireEvent.click(semitone('5'));
    await fireEvent.click(semitone('2'));
    await save();
    expect(onsave).toHaveBeenCalledWith({ name: 'Mine', family: '', intervals: ['1', '2', '5'] });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows why saving was refused, in the form', async () => {
    const onsave = vi.fn(async () => {
      throw new Error('“Mine”: a scale needs at least one note besides the root');
    });
    renderEditor(undefined, onsave);
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '“Mine”: a scale needs at least one note besides the root',
    );
  });

  it('cancels', async () => {
    const { oncancel, onsave } = renderEditor();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(oncancel).toHaveBeenCalled();
    expect(onsave).not.toHaveBeenCalled();
  });
});
