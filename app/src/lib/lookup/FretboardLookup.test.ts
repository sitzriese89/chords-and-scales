// Reverse lookup on the fretboard in the real app (ADR-38): the real WASM core, settings and
// storage, the core's harmonize and a fake AudioContext.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import { AudioEngine, midiToHz } from '../audio';
import { FakeAudioContext, FakeGesture } from '../audio/fake-context';
import { defaultSettings, SETTINGS_DOCUMENT, serializeSettings, type Settings } from '../settings';
import { BrowserStorage } from '../storage';
import { setUserChords, setUserScales } from '../theory';
import { USER_CHORDS_DOCUMENT } from '../user-catalogs.svelte';

function audioSetup() {
  const gesture = new FakeGesture(false);
  const frequencies: number[] = [];
  const audio = new AudioEngine({
    createContext: () => new FakeAudioContext(),
    gesture,
    render: (frequency) => {
      frequencies.push(frequency);
      return new Float32Array(16);
    },
  });
  return { audio, gesture, frequencies };
}

async function startApp(
  options: { change?: (s: Settings) => void; audio?: AudioEngine; chords?: string } = {},
) {
  const storage = new BrowserStorage(window.localStorage);
  const settings = defaultSettings();
  // The tab's position highlight dims part of the scale; it has its own tests.
  settings.tab.highlight = false;
  options.change?.(settings);
  await storage.write(SETTINGS_DOCUMENT, serializeSettings(settings));
  if (options.chords) await storage.write(USER_CHORDS_DOCUMENT, options.chords);
  render(App, { storage, ...(options.audio ? { audio: options.audio } : {}) });
  await screen.findByRole('grid', { name: /^Fretboard/ });
  return storage;
}

const lookup = () => within(screen.getByRole('region', { name: 'Find chords and scales' }));
const selectMode = () => lookup().getByRole('button', { name: 'Select notes' });
const board = () => screen.getByRole('grid', { name: /^Fretboard/ });
const cell = (string: number, fret: number) =>
  within(board()).getByRole('gridcell', {
    name: new RegExp(`^String ${string}, ${fret === 0 ? 'open' : `fret ${fret}`}(,|$)`),
  });

/** Clicks a shape written lowest string first (`x02220`) on the neck. */
async function play(shape: string) {
  for (const [i, fret] of [...shape].entries()) {
    if (fret !== 'x') await fireEvent.click(cell(shape.length - i, Number(fret)));
  }
}

/** The listed chord names, best first. */
function chords(): string[] {
  const list = lookup().queryByRole('list', { name: 'Chords of the selected notes' });
  if (!list) return [];
  return within(list)
    .getAllByRole('button')
    .map((b) => b.querySelector('.name')!.textContent!);
}

function scales(): string[] {
  const list = lookup().queryByRole('list', { name: 'Scales with the selected notes' });
  if (!list) return [];
  return within(list)
    .getAllByRole('button')
    .map((b) => b.querySelector('.name')!.textContent!);
}

/** The ringed positions on the neck, as `string:fret`, sorted. */
function ringed(): string[] {
  return [...document.querySelectorAll<SVGElement>('svg.fretboard .selection')]
    .map((el) => `${el.dataset.string}:${el.dataset.fret}`)
    .sort();
}

/** The line that lists the selected notes, as text. */
const selectedText = () =>
  lookup()
    .getByText(
      (_, el) => el?.tagName === 'P' && /^(Selected:|Click notes)/.test(el.textContent!.trim()),
    )
    .textContent!.trim();

describe('reverse lookup on the fretboard', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    setUserChords('');
    setUserScales('');
  });

  it('lists A first for an open E-shape A chord, updating on every click', async () => {
    await startApp();
    expect(selectMode()).toHaveAttribute('aria-pressed', 'false');
    await fireEvent.click(selectMode());
    expect(selectMode()).toHaveAttribute('aria-pressed', 'true');
    expect(board()).toHaveAccessibleName(/selecting notes$/);
    expect(selectedText()).toMatch(/^Click notes on the neck/);

    // A2 alone finds nothing; A2 E3 is a power chord; the full shape is A.
    await fireEvent.click(cell(5, 0));
    expect(chords()).toEqual([]);
    expect(lookup().getByText('Select at least two different notes.')).toBeInTheDocument();
    await fireEvent.click(cell(4, 2));
    expect(chords()[0]).toBe('A5');
    const fifths = scales();
    expect(fifths.length).toBeGreaterThan(0);
    await play('xxx22x');
    expect(chords()[0]).toBe('A');
    expect(scales()).not.toEqual(fifths);
    await fireEvent.click(cell(1, 0));

    expect(chords()[0]).toBe('A');
    expect(selectedText().replace(/\s+/g, ' ')).toBe('Selected: A2 (bass) E3 A3 C♯4 E4');
    expect(ringed()).toEqual(['1:0', '2:2', '3:2', '4:2', '5:0']);
    expect(cell(2, 2)).toHaveAccessibleName('String 2, fret 2, C♯, selected');
    // A scale note keeps its dot, ringed.
    expect(cell(5, 0)).toHaveAccessibleName('String 5, open, A, selected');
    expect(scales()).toContain('A Major pentatonic');
  });

  it('removes a note clicked again, takes the lowest note as the bass, and clears', async () => {
    await startApp();
    await fireEvent.click(selectMode());
    // E2 C3 G3: C/E.
    await fireEvent.click(cell(6, 0));
    await fireEvent.click(cell(5, 3));
    await fireEvent.click(cell(3, 0));
    expect(chords()[0]).toBe('C/E');

    // Without the low E, C is in the bass.
    await fireEvent.click(cell(6, 0));
    expect(ringed()).toEqual(['3:0', '5:3']);
    expect(chords()).toContain('C5');
    // Back with a high E instead: C in the bass again, so C.
    await fireEvent.click(cell(1, 0));
    expect(chords()[0]).toBe('C');

    await fireEvent.click(lookup().getByRole('button', { name: 'Clear selection' }));
    expect(ringed()).toEqual([]);
    expect(chords()).toEqual([]);
    expect(scales()).toEqual([]);
    expect(selectedText()).toMatch(/^Click notes on the neck/);
    expect(lookup().getByRole('button', { name: 'Clear selection' })).toBeDisabled();
    expect(lookup().getByRole('button', { name: 'Save as chord' })).toBeDisabled();
    // The neck shows the scale as before.
    expect(cell(5, 3)).toHaveAccessibleName('String 5, fret 3, C, root');
  });

  it('plays a note it adds; out of select mode a click only plays and selects nothing', async () => {
    const { audio, gesture, frequencies } = audioSetup();
    await startApp({ audio });
    gesture.happen();

    await fireEvent.click(cell(5, 3));
    expect(frequencies).toEqual([midiToHz(48)]);
    expect(ringed()).toEqual([]);

    await fireEvent.click(selectMode());
    // C♯3 is not in C major: it is selected (and sounds) all the same.
    await fireEvent.click(cell(5, 4));
    expect(frequencies).toEqual([48, 49].map(midiToHz));
    // Removing it is silent.
    await fireEvent.click(cell(5, 4));
    expect(frequencies).toHaveLength(2);
    expect(ringed()).toEqual([]);

    // Select mode off hides the selection and keeps it for when it is back on.
    await fireEvent.click(cell(5, 4));
    await fireEvent.click(selectMode());
    expect(ringed()).toEqual([]);
    expect(lookup().queryByRole('button', { name: 'Clear selection' })).toBeNull();
    await fireEvent.click(selectMode());
    expect(ringed()).toEqual(['5:4']);
  });

  it('shows a clicked chord in the chord panel and on the neck', async () => {
    await startApp();
    await fireEvent.click(selectMode());
    await play('x02220');
    const result = within(
      lookup().getByRole('list', { name: 'Chords of the selected notes' }),
    ).getAllByRole('button')[0];
    expect(result).toHaveAttribute('aria-pressed', 'false');

    await fireEvent.click(result);
    expect(result).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: 'Chord root' })).toHaveValue('A');
    expect(screen.getByRole('combobox', { name: 'Chord quality' })).toHaveValue('major');
    expect(board()).toHaveAccessibleName(/^Fretboard: A chord/);
    // The chord's tones across the neck, the selection still ringed over them.
    expect(cell(6, 5)).toHaveAccessibleName('String 6, fret 5, A, root');
    expect(ringed()).toEqual(['1:0', '2:2', '3:2', '4:2', '5:0']);
  });

  it('falls back to root and quality for a slash chord whose symbol does not read back', async () => {
    // Hand-edited: a suffix starting with `b` reads as a flat root, so the app never saves one.
    await startApp({
      chords:
        '[[chord]]\nid = "odd"\nname = "Odd"\nsymbol = "bodd"\nintervals = ["1", "b2", "5"]\n',
    });
    await fireEvent.click(selectMode());
    // G2 C3 C♯3: C D♭ G over G.
    await fireEvent.click(cell(6, 3));
    await fireEvent.click(cell(5, 3));
    await fireEvent.click(cell(5, 4));
    const odd = within(lookup().getByRole('list', { name: 'Chords of the selected notes' }))
      .getAllByRole('button')
      .find((b) => b.textContent!.includes('Odd'))!;
    await fireEvent.click(odd);

    expect(screen.getByRole('radio', { name: 'Root and quality' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Chord root' })).toHaveValue('C');
    expect(screen.getByRole('combobox', { name: 'Chord quality' })).toHaveValue('odd');
  });

  it('shows a slash chord as its typed symbol, with the bass', async () => {
    await startApp({ change: (s) => (s.chordPanel.collapsed = true) });
    await fireEvent.click(selectMode());
    await fireEvent.click(cell(6, 0));
    await fireEvent.click(cell(5, 3));
    await fireEvent.click(cell(3, 0));
    await fireEvent.click(lookup().getByRole('button', { name: /^C\/E/ }));

    // The panel opens on the typed symbol.
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Typed symbol' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Chord symbol' })).toHaveValue('C/E');
    expect(board()).toHaveAccessibleName(/^Fretboard: C\/E chord/);
    expect(lookup().getByRole('button', { name: /^C\/E/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('names chords in the Jazz style when that is chosen', async () => {
    await startApp({ change: (s) => (s.chordSymbols = 'jazz') });
    await fireEvent.click(selectMode());
    await play('x32000');
    expect(chords()[0]).toBe('CΔ7');
  });

  it('makes a clicked scale the explorer’s scale and root', async () => {
    await startApp();
    await fireEvent.click(screen.getByRole('radio', { name: 'Root and quality' }));
    await fireEvent.change(screen.getByRole('combobox', { name: 'Chord quality' }), {
      target: { value: 'minor' },
    });
    await fireEvent.click(selectMode());
    await play('x02220');
    await fireEvent.click(lookup().getByRole('button', { name: /^A Major pentatonic/ }));

    expect(screen.getByRole('heading', { name: 'A Major pentatonic' })).toBeInTheDocument();
    expect(lookup().getByRole('button', { name: /^A Major pentatonic/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The chosen chord is cleared, so the neck shows the scale.
    expect(board()).toHaveAccessibleName(/^Fretboard: A Major pentatonic,/);
  });

  it('hands the selection to the chord editor, on the bass', async () => {
    await startApp();
    await fireEvent.click(selectMode());
    // A2 C♯3 F3: 1 3 ♯5 above A.
    await fireEvent.click(cell(5, 0));
    await fireEvent.click(cell(5, 4));
    await fireEvent.click(cell(4, 3));
    await fireEvent.click(lookup().getByRole('button', { name: 'Save as chord' }));

    const dialog = within(screen.getByRole('dialog', { name: 'New chord' }));
    const chosen = dialog
      .getAllByRole('button', { pressed: true })
      .map((b) => b.textContent!.trim());
    expect(chosen).toEqual(['1', '3', '♯5']);
    // The editor's neck is on the bass: A is its root.
    expect(dialog.getByRole('gridcell', { name: 'String 5, open, 1, root' })).toBeInTheDocument();
  });

  it('hands the selection to the scale editor; saving shows it on the bass', async () => {
    await startApp();
    await fireEvent.click(selectMode());
    // D3 F♯3 A3 B3: 1 3 5 6 above D.
    await play('xx0202');
    await fireEvent.click(lookup().getByRole('button', { name: 'Save as scale' }));

    const dialog = within(screen.getByRole('dialog', { name: 'New scale' }));
    const chosen = dialog
      .getAllByRole('button', { pressed: true })
      .map((b) => b.textContent!.trim());
    expect(chosen).toEqual(['1', '3', '5', '6']);
    await fireEvent.input(dialog.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Sixth' },
    });
    await fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { name: 'D Sixth' })).toBeInTheDocument();
  });
});
