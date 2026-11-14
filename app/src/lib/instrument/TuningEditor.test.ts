import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseNote } from '../theory';
import type { TuningDraft } from './presets';
import TuningEditor from './TuningEditor.svelte';

const bass = (): TuningDraft => ({
  name: '',
  kind: 'bass',
  notes: ['E1', 'A1', 'D2', 'G2'].map(parseNote),
});

function renderEditor(
  initial = bass(),
  onsave = vi.fn<(draft: TuningDraft) => Promise<void>>(async () => {}),
) {
  const oncancel = vi.fn();
  render(TuningEditor, { title: 'New tuning', initial, accidentals: 'flats', onsave, oncancel });
  return { onsave, oncancel };
}

const field = (name: string) => screen.getByRole('textbox', { name });
const note = (string: number) => screen.getByRole('combobox', { name: `String ${string} note` });
const octave = (string: number) =>
  screen.getByRole('spinbutton', { name: `String ${string} octave` });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('TuningEditor', () => {
  afterEach(cleanup);

  it('lists the strings as on the neck, string 1 (the highest) first', () => {
    renderEditor();
    const labels = screen.getAllByRole('combobox').map((s) => s.getAttribute('aria-label'));
    expect(labels).toEqual(['String 1 note', 'String 2 note', 'String 3 note', 'String 4 note']);
    expect(note(1)).toHaveDisplayValue('G');
    expect(octave(1)).toHaveValue(2);
    expect(note(4)).toHaveDisplayValue('E');
    expect(octave(4)).toHaveValue(1);
    // Choices are spelled by the preference.
    expect(screen.getAllByRole('option', { name: 'D♭' })).toHaveLength(4);
  });

  it('rejects a tuning without a name', async () => {
    const { onsave } = renderEditor();
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent('Give the tuning a name.');
    expect(field('Name')).toHaveAttribute('aria-invalid', 'true');
    await fireEvent.input(field('Name'), { target: { value: '   ' } });
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent('Give the tuning a name.');
    expect(onsave).not.toHaveBeenCalled();
  });

  it('rejects empty strings: a string without a note or an octave', async () => {
    const { onsave } = renderEditor();
    await fireEvent.input(field('Name'), { target: { value: 'Gaps' } });
    await fireEvent.change(note(2), { target: { value: '' } });
    await fireEvent.input(octave(4), { target: { value: '' } });
    await save();

    const alert = screen.getByRole('alert');
    expect([...alert.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'String 2 needs a note and an octave.',
      'String 4 needs a note and an octave.',
    ]);
    expect(note(2)).toHaveAttribute('aria-invalid', 'true');
    expect(octave(4)).toHaveAttribute('aria-invalid', 'true');
    expect(note(1)).not.toHaveAttribute('aria-invalid');
    expect(onsave).not.toHaveBeenCalled();

    // Filled in again, it saves.
    await fireEvent.change(note(2), { target: { value: '2' } });
    await fireEvent.input(octave(4), { target: { value: '1' } });
    await save();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onsave).toHaveBeenCalledWith({
      name: 'Gaps',
      kind: 'bass',
      notes: ['E1', 'A1', 'D2', 'G2'].map(parseNote),
    });
  });

  it('rejects an octave that is not a whole number', async () => {
    const { onsave } = renderEditor();
    await fireEvent.input(field('Name'), { target: { value: 'Half' } });
    await fireEvent.input(octave(3), { target: { value: '1.5' } });
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent('String 3 needs a note and an octave.');
    expect(onsave).not.toHaveBeenCalled();
  });

  it('saves the name trimmed, the kind and the notes lowest string first', async () => {
    const { onsave } = renderEditor();
    await fireEvent.input(field('Name'), { target: { value: '  Drop C  ' } });
    await fireEvent.click(screen.getByRole('radio', { name: 'Guitar' }));
    // String 4 (the lowest) to C1.
    await fireEvent.change(note(4), { target: { value: '0' } });
    await save();
    expect(onsave).toHaveBeenCalledWith({
      name: 'Drop C',
      kind: 'guitar',
      notes: ['C1', 'A1', 'D2', 'G2'].map(parseNote),
    });
  });

  it('shows why saving failed and keeps the form', async () => {
    const onsave = vi.fn(async () => {
      throw new Error('“Mine”: open string G9 is outside the range C0 to C6');
    });
    renderEditor({ ...bass(), name: 'Mine' }, onsave);
    await save();
    expect(await screen.findByRole('alert')).toHaveTextContent('open string G9 is outside');
    expect(field('Name')).toHaveValue('Mine');
  });

  it('cancels', async () => {
    const { oncancel, onsave } = renderEditor();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(oncancel).toHaveBeenCalledOnce();
    expect(onsave).not.toHaveBeenCalled();
  });
});
