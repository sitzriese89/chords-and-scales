// The Chords page and its chord picker in the real app (ADR-54): the real WASM core, settings
// and storage and a fake AudioContext. Most tests pass a C major fixture for the harmonize
// seam; one block uses the app's own default, the core's harmonize.
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import { appReady, chordPicker, chordPickerButton, chordsPage, goTo, on } from '../../test-shell';
import { AudioEngine, midiToHz } from '../audio';
import { FakeAudioContext, FakeGesture } from '../audio/fake-context';
import { defaultSettings, SETTINGS_DOCUMENT, serializeSettings, type Settings } from '../settings';
import { BrowserStorage } from '../storage';
import { cMajorHarmonizer } from './fixture-harmonizer';
import type { Harmonizer } from './harmonize';

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

async function startApp(options: {
  /** Omitted: the C major fixture. 'core': the app's own default, the real harmonize core. */
  harmonizer?: Harmonizer | null | 'core';
  change?: (s: Settings) => void;
  audio?: AudioEngine;
  storage?: BrowserStorage;
}): Promise<BrowserStorage> {
  const storage = options.storage ?? new BrowserStorage(window.localStorage);
  if (!options.storage) {
    const settings = defaultSettings();
    // The tab's position highlight dims part of the scale; it has its own tests.
    settings.tab.highlight = false;
    options.change?.(settings);
    await storage.write(SETTINGS_DOCUMENT, serializeSettings(settings));
  }
  render(App, {
    storage,
    ...(options.harmonizer === 'core'
      ? {}
      : { harmonizer: options.harmonizer === undefined ? cMajorHarmonizer : options.harmonizer }),
    ...(options.audio ? { audio: options.audio } : {}),
  });
  await appReady();
  return storage;
}

/** The Scales neck's dots by role, as the set of their labels. */
function neck(): Record<string, Set<string>> {
  goTo('Scales');
  const roles: Record<string, Set<string>> = { root: new Set(), tone: new Set(), dim: new Set() };
  for (const g of document.querySelectorAll<SVGGElement>('svg.fretboard g.dot')) {
    roles[g.dataset.role ?? ''].add(g.querySelector('text')?.textContent ?? '');
  }
  return roles;
}

/** C major on the neck, as it is with no chord chosen. */
const C_MAJOR = {
  root: new Set(['C']),
  tone: new Set(['D', 'E', 'F', 'G', 'A', 'B']),
  dim: new Set(),
};

const pickMode = (name: string) => fireEvent.click(chordPicker().getByRole('radio', { name }));
const pick = (name: string, value: string) =>
  fireEvent.change(chordPicker().getByRole('combobox', { name }), { target: { value } });
const heading = (name: string) => chordsPage().getByRole('heading', { level: 2, name });

describe('Chords page', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('has no fretboard, and asks for a chord until one is chosen', async () => {
    await startApp({ change: (s) => (s.page = 'chords') });
    expect(document.querySelector('main[aria-label="Chords"] svg.fretboard')).toBeNull();
    expect(chordsPage().queryByRole('grid')).toBeNull();
    expect(
      chordsPage().getByText(
        /^Choose a chord with ☰ Choose chord, or a degree chord in Harmonize/,
      ),
    ).toBeInTheDocument();
    expect(chordsPage().queryByText(/on the neck/)).toBeNull();

    await pick('Chord quality', 'major');
    expect(heading('C')).toBeInTheDocument();
    expect(document.querySelector('main[aria-label="Chords"] svg.fretboard')).toBeNull();
    expect(chordsPage().getAllByRole('img', { name: /^C: / }).length).toBeGreaterThan(0);
  });

  it('opens the chord picker in a drawer from "Choose chord", which only the Chords page has', async () => {
    await startApp({});
    expect(on('Scales').queryByRole('button', { name: 'Choose chord' })).toBeNull();
    const button = chordPickerButton();
    expect(screen.queryByRole('button', { name: 'Choose scale' })).toBeNull();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'chord-drawer');
    expect(screen.queryByRole('dialog', { name: 'Choose chord' })).toBeNull();

    const picker = chordPicker();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(picker.getByRole('radio', { name: 'Root and quality' })).toBeChecked();
    expect(picker.getByRole('combobox', { name: 'Chord quality' })).toBeVisible();
    expect(picker.getByRole('button', { name: 'Random chord' })).toBeVisible();
    expect(picker.getByRole('button', { name: 'New chord' })).toBeVisible();
    expect(picker.getByRole('radio', { name: /^Jazz/ })).toBeVisible();
    // The panel's dock is gone: no title bar toggle and no resize edge.
    expect(screen.queryByRole('button', { name: /^(Collapse|Expand)$/ })).toBeNull();
    expect(screen.queryByRole('separator', { name: 'Resize chord panel' })).toBeNull();

    // A page switch closes it.
    goTo('Scales');
    goTo('Chords');
    expect(chordPickerButton()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog', { name: 'Choose chord' })).toBeNull();
  });

  it('shows degree V of C major as G7, and never on the Scales neck', async () => {
    await startApp({});
    await pickMode('Degree of the scale');
    await fireEvent.click(chordPicker().getByRole('radio', { name: '7th chords' }));
    await pick('Degree of C Major', '4');

    expect(heading('G7')).toBeInTheDocument();
    expect(
      chordsPage().getByText(/Dominant seventh \(V7\) on degree 5 of C Major/),
    ).toBeInTheDocument();
    expect(chordsPage().getByLabelText('Notes of G7')).toHaveTextContent('1 G3 B5 D♭7 F');
    expect(chordsPage().getByRole('heading', { name: 'Voicings of G7' })).toBeInTheDocument();

    expect(neck()).toEqual(C_MAJOR);
    expect(on('Scales').getByRole('grid', { name: /^Fretboard: C Major, / })).toBeInTheDocument();
  });

  it('shows the triad on the degree, and follows the size toggle', async () => {
    await startApp({});
    await pickMode('Degree of the scale');
    await pick('Degree of C Major', '4');
    expect(heading('G')).toBeInTheDocument();

    await fireEvent.click(chordPicker().getByRole('radio', { name: '7th chords' }));
    expect(heading('G7')).toBeInTheDocument();
  });

  it('shows a chord from root and quality, and the Scales neck keeps the scale', async () => {
    await startApp({});
    await pick('Chord root', 'E♭');
    expect(chordsPage().getByText(/^Choose a chord with/)).toBeInTheDocument();
    await pick('Chord quality', 'min7');
    expect(heading('E♭m7')).toBeInTheDocument();
    expect(chordsPage().getByLabelText('Notes of E♭m7')).toHaveTextContent('1 E♭♭3 F♯5 A♯♭7 C♯');
    expect(neck()).toEqual(C_MAJOR);
    expect(on('Scales').getByRole('grid', { name: /^Fretboard: C Major, / })).toBeInTheDocument();
  });

  it('spells the chord by the sharp/flat setting but keeps the root as picked', async () => {
    await startApp({ change: (s) => (s.accidentals = 'flats') });
    await pick('Chord root', 'E♭');
    await pick('Chord quality', 'min7');
    expect(chordsPage().getByLabelText('Notes of E♭m7')).toHaveTextContent('1 E♭♭3 G♭5 B♭♭7 D♭');
  });

  it('clears the chord', async () => {
    await startApp({});
    await pick('Chord quality', 'major');
    expect(heading('C')).toBeInTheDocument();
    await fireEvent.click(chordsPage().getByRole('button', { name: 'Clear chord' }));
    expect(chordsPage().queryByRole('heading', { level: 2 })).toBeNull();
    expect(chordsPage().queryByRole('heading', { name: /^Voicings/ })).toBeNull();
    expect(chordsPage().getByText(/^Choose a chord with/)).toBeInTheDocument();
  });

  it('says so when a degree has no chord, in the picker and on the page', async () => {
    await startApp({ change: (s) => (s.lastView.scale = 'dorian') });
    await pickMode('Degree of the scale');
    await pick('Degree of C Dorian', '4');
    const problem = 'No chord forms on degree 5 of C Dorian.';
    expect(
      chordPicker().getByRole('combobox', { name: 'Degree of C Dorian' }),
    ).toHaveAccessibleDescription(problem);
    expect(chordsPage().getByText(problem)).toBeInTheDocument();
  });

  it('offers the degree input only when the harmonize core is there', async () => {
    await startApp({ harmonizer: null });
    expect(chordPicker().getByRole('radio', { name: 'Degree of the scale' })).toBeDisabled();
    expect(chordPicker().getByRole('radio', { name: 'Root and quality' })).toBeChecked();
    expect(chordPicker().getByText('Choosing by degree is not available yet.')).toBeInTheDocument();
  });

  it('strums the chord lowest string first, after the first user gesture', async () => {
    const { audio, gesture, frequencies } = audioSetup();
    await startApp({ audio });
    await pickMode('Degree of the scale');
    await fireEvent.click(chordPicker().getByRole('radio', { name: '7th chords' }));
    await pick('Degree of C Major', '4');
    gesture.happen();

    await fireEvent.click(chordsPage().getByRole('button', { name: 'Strum G7' }));
    // G2 on the low E string, B2, D3, and F4 on the high E string: pitches from the core.
    expect(frequencies).toEqual([43, 47, 50, 65].map(midiToHz));
  });

  it('strums the shape chosen in the grid, and the stacked chord without one', async () => {
    const { audio, gesture, frequencies } = audioSetup();
    await startApp({ audio });
    await pick('Chord quality', 'major');
    gesture.happen();
    const strum = async () => {
      frequencies.length = 0;
      await fireEvent.click(chordsPage().getByRole('button', { name: 'Strum C' }));
      return [...frequencies];
    };
    // No shape chosen: C3 E3 G3, stacked up from the lowest C on the neck (ADR-32).
    expect(await strum()).toEqual([48, 52, 55].map(midiToHz));

    const shape = chordsPage().getByRole('button', { name: /^\d+\. x32010(,|$)/ });
    await fireEvent.click(shape);
    // x32010: C3 E3 G3 C4 E4, the shape's own notes lowest string first.
    expect(await strum()).toEqual([48, 52, 55, 60, 64].map(midiToHz));

    await fireEvent.click(shape);
    expect(await strum()).toEqual([48, 52, 55].map(midiToHz));
  });

  it('plays nothing while muted, and says so', async () => {
    const { audio, gesture, frequencies } = audioSetup();
    await startApp({ audio, change: (s) => (s.audio.muted = true) });
    await pick('Chord quality', 'major');
    gesture.happen();
    expect(chordsPage().getByText('Sound is muted.')).toBeInTheDocument();
    await fireEvent.click(chordsPage().getByRole('button', { name: 'Strum C' }));
    expect(frequencies).toEqual([]);
  });

  it('opens an old settings file with the chord panel table without a warning', async () => {
    const storage = new BrowserStorage(window.localStorage);
    await storage.write(
      SETTINGS_DOCUMENT,
      'version = 1\npage = "chords"\n[chord_panel]\ncollapsed = true\nheight = 340\n',
    );
    render(App, { storage, harmonizer: cMajorHarmonizer });
    await appReady();
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('.settings-warning')).toBeNull();
    await pick('Chord quality', 'major');
    expect(heading('C')).toBeVisible();
    // The next save leaves the retired table out.
    goTo('Scales');
    await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/^page = "scales"$/m);
    expect(await storage.read(SETTINGS_DOCUMENT)).not.toMatch(/chord_panel/);
  });
});

describe('Chords page with the real harmonize core', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('is enabled in the app without any harmonizer passed in', async () => {
    await startApp({ harmonizer: 'core' });
    expect(chordPicker().getByRole('radio', { name: 'Degree of the scale' })).toBeEnabled();
    expect(chordPicker().queryByText('Choosing by degree is not available yet.')).toBeNull();
  });

  it('shows degree V of C major as 7th chords: G7', async () => {
    await startApp({ harmonizer: 'core' });
    await pickMode('Degree of the scale');
    await fireEvent.click(chordPicker().getByRole('radio', { name: '7th chords' }));
    await pick('Degree of C Major', '4');

    expect(heading('G7')).toBeInTheDocument();
    expect(
      chordsPage().getByText(/Dominant seventh \(V7\) on degree 5 of C Major/),
    ).toBeInTheDocument();
    expect(neck()).toEqual(C_MAJOR);
  });

  it('shows a chord where the pentatonic has one and says so where it has none', async () => {
    await startApp({
      harmonizer: 'core',
      change: (s) => {
        s.lastView.scale = 'minor-pentatonic';
        s.accidentals = 'flats';
      },
    });
    await pickMode('Degree of the scale');
    await pick('Degree of C Minor pentatonic', '1');
    expect(heading('E♭')).toBeInTheDocument();
    expect(
      chordsPage().getByText(/\(♭III\) on degree 2 of C Minor pentatonic/),
    ).toBeInTheDocument();

    await pick('Degree of C Minor pentatonic', '2');
    expect(
      chordsPage().getByText('No chord forms on degree 3 of C Minor pentatonic.'),
    ).toBeInTheDocument();
  });

  it('keeps the root as picked and spells the chord by the sharp/flat setting', async () => {
    await startApp({
      harmonizer: 'core',
      change: (s) => {
        s.lastView.root = 'D♭';
        s.accidentals = 'flats';
      },
    });
    await pickMode('Degree of the scale');
    await fireEvent.click(chordPicker().getByRole('radio', { name: '7th chords' }));
    await pick('Degree of D♭ Major', '4');
    expect(heading('A♭7')).toBeInTheDocument();
    expect(chordsPage().getByLabelText('Notes of A♭7')).toHaveTextContent('1 A♭3 C5 E♭♭7 G♭');
  });
});

describe('chord picker: typed symbols and the display style', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  const symbolInput = () => chordPicker().getByRole('textbox', { name: 'Chord symbol' });
  const type = (text: string) => fireEvent.input(symbolInput(), { target: { value: text } });
  const marked = () => document.querySelector('#chord-symbol-help mark');

  it('shows a typed symbol with its shapes', async () => {
    await startApp({});
    await pickMode('Typed symbol');
    expect(
      chordsPage().getByText(
        'Type a chord symbol under ☰ Choose chord to see its notes and shapes.',
      ),
    ).toBeInTheDocument();

    await type('F#m7b5');
    expect(heading('F♯m7♭5')).toBeInTheDocument();
    expect(chordsPage().getByLabelText('Notes of F♯m7♭5')).toHaveTextContent('1 F♯♭3 A♭5 C♭7 E');
    expect(chordsPage().getAllByRole('img', { name: /^F♯m7♭5: / }).length).toBeGreaterThan(0);
    expect(symbolInput()).not.toHaveAttribute('aria-invalid');
    expect(neck()).toEqual(C_MAJOR);
  });

  it('reads the jazz spellings and keeps the typed root', async () => {
    await startApp({});
    await pickMode('Typed symbol');
    await type('dbΔ7');
    expect(heading('D♭maj7')).toBeInTheDocument();
  });

  it('writes the bass of a slash chord in its name', async () => {
    await startApp({});
    await pickMode('Typed symbol');
    await type('Am7/G');
    expect(heading('Am7/G')).toBeInTheDocument();
    expect(chordsPage().getByText('Minor seventh, bass G')).toBeInTheDocument();
    expect(chordsPage().getByRole('button', { name: 'Strum Am7/G' })).toBeEnabled();
  });

  it('marks where an invalid symbol could not be read, and shows no chord', async () => {
    await startApp({});
    await pickMode('Typed symbol');
    await type('Cmaj7x');

    expect(symbolInput()).toHaveAttribute('aria-invalid', 'true');
    expect(symbolInput()).toHaveAccessibleDescription(
      '"maj7x" is not a known chord. (character 6)',
    );
    expect(marked()).toHaveTextContent('x');
    expect(document.querySelector('#chord-symbol-help code')).toHaveTextContent('Cmaj7x');
    expect(chordsPage().queryByRole('heading', { level: 2 })).toBeNull();

    await type('H7');
    expect(marked()).toHaveTextContent('H');
    expect(symbolInput()).toHaveAccessibleDescription(/^A chord starts with a note name/);

    await type('Cmaj7');
    expect(symbolInput()).not.toHaveAttribute('aria-invalid');
    expect(heading('Cmaj7')).toBeInTheDocument();
  });

  it('counts characters, not UTF-16 units, and marks the end of a symbol cut short', async () => {
    await startApp({});
    await pickMode('Typed symbol');
    await type('C♭Δ7x');
    expect(marked()).toHaveTextContent('x');
    expect(symbolInput()).toHaveAccessibleDescription(/\(character 5\)$/);

    await type('C/');
    expect(marked()).toHaveClass('end');
    expect(symbolInput()).toHaveAccessibleDescription(/\(character 3\)$/);
  });

  it('shows no error for an empty field, and Clear chord empties it', async () => {
    await startApp({});
    await pickMode('Typed symbol');
    await type('   ');
    expect(symbolInput()).not.toHaveAttribute('aria-invalid');

    await type('G7');
    await fireEvent.click(chordsPage().getByRole('button', { name: 'Clear chord' }));
    expect(symbolInput()).toHaveValue('');
    expect(chordsPage().queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('renames every visible chord when the style changes, and keeps it across a restart', async () => {
    const storage = await startApp({});
    // Each choice shows what its style looks like, written by the core.
    expect(chordPicker().getByRole('radio', { name: 'Standard Cmaj7 Cm7♭5' })).toBeChecked();
    expect(chordPicker().getByRole('radio', { name: 'Jazz CΔ7 Cø' })).not.toBeChecked();

    await pickMode('Typed symbol');
    await type('Bm7b5');
    expect(heading('Bm7♭5')).toBeInTheDocument();

    await fireEvent.click(chordPicker().getByRole('radio', { name: /^Jazz/ }));
    expect(heading('Bø')).toBeInTheDocument();
    expect(chordsPage().getByRole('button', { name: 'Strum Bø' })).toBeInTheDocument();
    expect(chordsPage().getByLabelText('Notes of Bø')).toBeInTheDocument();
    expect(chordsPage().getByRole('heading', { name: 'Voicings of Bø' })).toBeInTheDocument();
    await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/chord_symbols = "jazz"/);
    cleanup();

    await startApp({ storage });
    expect(chordPicker().getByRole('radio', { name: /^Jazz/ })).toBeChecked();
    await pick('Chord quality', 'maj7');
    expect(heading('CΔ7')).toBeInTheDocument();
  });

  it('names a chord on a degree in the chosen style', async () => {
    await startApp({ change: (s) => (s.chordSymbols = 'jazz') });
    await pickMode('Degree of the scale');
    await fireEvent.click(chordPicker().getByRole('radio', { name: '7th chords' }));
    await pick('Degree of C Major', '6');
    expect(heading('Bø')).toBeInTheDocument();
  });
});
