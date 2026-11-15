// The chord panel in the real app: the real WASM core, settings and storage and a fake
// AudioContext. Most tests pass a C major fixture for the harmonize seam; the last block uses
// the app's own default, the core's harmonize.
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
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
  await screen.findByRole('grid', { name: /^Fretboard/ });
  return storage;
}

/** The neck's dots by role, as the set of their labels. */
function neck(): Record<string, Set<string>> {
  const roles: Record<string, Set<string>> = { root: new Set(), tone: new Set(), dim: new Set() };
  for (const g of document.querySelectorAll<SVGGElement>('svg.fretboard g.dot')) {
    roles[g.dataset.role ?? ''].add(g.querySelector('text')?.textContent ?? '');
  }
  return roles;
}

const pickMode = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));
const pick = (name: string, value: string) =>
  fireEvent.change(screen.getByRole('combobox', { name }), { target: { value } });

describe('chord panel', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('shows degree V of C major as G7 over the dimmed scale', async () => {
    await startApp({});
    // Before a chord is chosen the neck shows the plain scale.
    expect(neck().dim.size).toBe(0);
    expect(neck().tone).toEqual(new Set(['D', 'E', 'F', 'G', 'A', 'B']));

    await pickMode('Degree of the scale');
    await fireEvent.click(screen.getByRole('radio', { name: '7th chords' }));
    await pick('Degree of C Major', '4');

    expect(screen.getByRole('heading', { name: 'G7' })).toBeInTheDocument();
    expect(screen.getByText(/Dominant seventh \(V7\) on degree 5 of C Major/)).toBeInTheDocument();
    expect(neck()).toEqual({
      root: new Set(['G']),
      tone: new Set(['B', 'D', 'F']),
      dim: new Set(['C', 'E', 'A']),
    });
    expect(screen.getByRole('grid', { name: /^Fretboard: G7 over C Major/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Notes of G7')).toHaveTextContent('1 G3 B5 D♭7 F');
  });

  it('draws the chord over the scale also while the tab highlights a position', async () => {
    await startApp({ change: (s) => (s.tab.highlight = true) });
    await pickMode('Degree of the scale');
    await pick('Degree of C Major', '4');
    expect(neck()).toEqual({
      root: new Set(['G']),
      tone: new Set(['B', 'D']),
      dim: new Set(['C', 'E', 'F', 'A']),
    });
  });

  it('shows the triad on the degree, and follows the size toggle', async () => {
    await startApp({});
    await pickMode('Degree of the scale');
    await pick('Degree of C Major', '4');
    expect(screen.getByRole('heading', { name: 'G' })).toBeInTheDocument();
    expect(neck().tone).toEqual(new Set(['B', 'D']));
    expect(neck().dim).toEqual(new Set(['C', 'E', 'F', 'A']));

    await fireEvent.click(screen.getByRole('radio', { name: '7th chords' }));
    expect(screen.getByRole('heading', { name: 'G7' })).toBeInTheDocument();
    expect(neck().tone).toEqual(new Set(['B', 'D', 'F']));
  });

  it('shows a chord from root and quality alone, without the scale', async () => {
    await startApp({});
    await pick('Chord root', 'E♭');
    expect(screen.getByText('Choose a chord to see it on the neck.')).toBeInTheDocument();
    await pick('Chord quality', 'min7');
    expect(screen.getByRole('heading', { name: 'E♭m7' })).toBeInTheDocument();
    expect(neck()).toEqual({
      root: new Set(['E♭']),
      tone: new Set(['F♯', 'A♯', 'C♯']),
      dim: new Set(),
    });
  });

  it('spells the chord by the sharp/flat setting but keeps the root as picked', async () => {
    await startApp({ change: (s) => (s.accidentals = 'flats') });
    await pick('Chord root', 'E♭');
    await pick('Chord quality', 'min7');
    expect(neck().root).toEqual(new Set(['E♭']));
    expect(neck().tone).toEqual(new Set(['G♭', 'B♭', 'D♭']));
  });

  it('clears the chord and shows the scale alone again', async () => {
    await startApp({});
    await pick('Chord quality', 'major');
    expect(neck().root).toEqual(new Set(['C']));
    await fireEvent.click(screen.getByRole('button', { name: 'Clear chord' }));
    expect(neck().tone).toEqual(new Set(['D', 'E', 'F', 'G', 'A', 'B']));
    expect(neck().dim.size).toBe(0);
  });

  it('says so when a degree has no chord', async () => {
    await startApp({ change: (s) => (s.lastView.scale = 'dorian') });
    await pickMode('Degree of the scale');
    await pick('Degree of C Dorian', '4');
    expect(screen.getByText('No chord forms on degree 5 of C Dorian.')).toBeInTheDocument();
    expect(neck().dim.size).toBe(0);
  });

  it('offers the degree input only when the harmonize core is there', async () => {
    await startApp({ harmonizer: null });
    expect(screen.getByRole('radio', { name: 'Degree of the scale' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Root and quality' })).toBeChecked();
    expect(screen.getByText('Choosing by degree is not available yet.')).toBeInTheDocument();
  });

  it('strums the chord lowest string first, after the first user gesture', async () => {
    const { audio, gesture, frequencies } = audioSetup();
    await startApp({ audio });
    await pickMode('Degree of the scale');
    await fireEvent.click(screen.getByRole('radio', { name: '7th chords' }));
    await pick('Degree of C Major', '4');
    gesture.happen();

    await fireEvent.click(screen.getByRole('button', { name: 'Strum G7' }));
    // G2 on the low E string, B2, D3, and F4 on the high E string: pitches from the core.
    expect(frequencies).toEqual([43, 47, 50, 65].map(midiToHz));
  });

  it('plays nothing while muted, and says so', async () => {
    const { audio, gesture, frequencies } = audioSetup();
    await startApp({ audio, change: (s) => (s.audio.muted = true) });
    await pick('Chord quality', 'major');
    gesture.happen();
    expect(screen.getByText('Sound is muted.', { selector: '.chord-panel *' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Strum C' }));
    expect(frequencies).toEqual([]);
  });

  it('plays a clicked chord dot at its real pitch', async () => {
    const { audio, gesture, frequencies } = audioSetup();
    await startApp({ audio });
    await pick('Chord quality', 'major');
    gesture.happen();
    // The 5th fret of the D string is G3.
    await fireEvent.click(screen.getByRole('gridcell', { name: /^String 4, fret 5, G/ }));
    expect(frequencies).toEqual([midiToHz(55)]);
  });

  describe('collapsed and size', () => {
    it('collapses to the title bar and keeps that across a restart', async () => {
      const storage = await startApp({});
      expect(screen.getByRole('combobox', { name: 'Chord quality' })).toBeVisible();
      const toggle = screen.getByRole('button', { name: 'Collapse' });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      await fireEvent.click(toggle);
      expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      expect(screen.queryByRole('combobox', { name: 'Chord quality' })).toBeNull();
      expect(screen.queryByRole('separator')).toBeNull();
      await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/collapsed = true/);
      cleanup();

      await startApp({ storage });
      expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: 'Chord quality' })).toBeNull();

      await fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
      expect(screen.getByRole('combobox', { name: 'Chord quality' })).toBeVisible();
      await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/collapsed = false/);
    });

    it('keeps showing the chord on the neck, and its name in the title bar, while collapsed', async () => {
      await startApp({});
      await pick('Chord quality', 'dom7');
      await fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
      expect(neck().root).toEqual(new Set(['C']));
      expect(screen.getByText('C7', { selector: '.current' })).toBeInTheDocument();
    });

    it('resizes with the arrow keys and saves the height', async () => {
      const storage = await startApp({});
      const edge = screen.getByRole('separator', { name: 'Resize chord panel' });
      expect(edge).toHaveAttribute('aria-valuenow', '220');

      await fireEvent.keyDown(edge, { key: 'ArrowUp' });
      expect(edge).toHaveAttribute('aria-valuenow', '244');
      await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/height = 244/);
      expect(document.getElementById('chord-panel-body')).toHaveStyle({ height: '244px' });

      await fireEvent.keyDown(edge, { key: 'ArrowDown' });
      await fireEvent.keyDown(edge, { key: 'ArrowDown' });
      expect(edge).toHaveAttribute('aria-valuenow', '196');

      await fireEvent.keyDown(edge, { key: 'Home' });
      expect(edge).toHaveAttribute('aria-valuenow', '96');
      await fireEvent.keyDown(edge, { key: 'ArrowDown' });
      expect(edge).toHaveAttribute('aria-valuenow', '96');
      await fireEvent.keyDown(edge, { key: 'End' });
      expect(edge).toHaveAttribute('aria-valuenow', '640');
      cleanup();

      await startApp({ storage });
      expect(screen.getByRole('separator', { name: 'Resize chord panel' })).toHaveAttribute(
        'aria-valuenow',
        '640',
      );
    });

    it('resizes by dragging the top edge, saving the height when it is let go', async () => {
      const storage = await startApp({});
      const edge = screen.getByRole('separator', { name: 'Resize chord panel' });
      const move = (type: string, clientY: number) =>
        fireEvent(
          edge,
          Object.assign(new MouseEvent(type, { bubbles: true, clientY }), { pointerId: 1 }),
        );

      move('pointerdown', 400);
      move('pointermove', 350);
      // Dragging up makes the panel taller; nothing is written until the edge is released.
      expect(edge).toHaveAttribute('aria-valuenow', '270');
      expect(await storage.read(SETTINGS_DOCUMENT)).toMatch(/height = 220/);
      move('pointerup', 350);
      await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/height = 270/);

      move('pointerdown', 400);
      move('pointermove', 900);
      expect(edge).toHaveAttribute('aria-valuenow', '96');
      move('pointerup', 900);
      await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/height = 96/);
    });
  });
});

describe('chord panel with the real harmonize core', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('is enabled in the app without any harmonizer passed in', async () => {
    await startApp({ harmonizer: 'core' });
    expect(screen.getByRole('radio', { name: 'Degree of the scale' })).toBeEnabled();
    expect(screen.queryByText('Choosing by degree is not available yet.')).toBeNull();
  });

  it('shows degree V of C major as 7th chords: G7 over the dimmed scale', async () => {
    await startApp({ harmonizer: 'core' });
    await pickMode('Degree of the scale');
    await fireEvent.click(screen.getByRole('radio', { name: '7th chords' }));
    await pick('Degree of C Major', '4');

    expect(screen.getByRole('heading', { name: 'G7' })).toBeInTheDocument();
    expect(screen.getByText(/Dominant seventh \(V7\) on degree 5 of C Major/)).toBeInTheDocument();
    expect(neck()).toEqual({
      root: new Set(['G']),
      tone: new Set(['B', 'D', 'F']),
      dim: new Set(['C', 'E', 'A']),
    });
    expect(screen.getByRole('grid', { name: /^Fretboard: G7 over C Major/ })).toBeInTheDocument();
  });

  it('shows the triad on degree V of C major', async () => {
    await startApp({ harmonizer: 'core' });
    await pickMode('Degree of the scale');
    await pick('Degree of C Major', '4');
    expect(screen.getByRole('heading', { name: 'G' })).toBeInTheDocument();
    expect(neck().root).toEqual(new Set(['G']));
    expect(neck().tone).toEqual(new Set(['B', 'D']));
    expect(neck().dim).toEqual(new Set(['C', 'E', 'F', 'A']));
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
    expect(screen.getByRole('heading', { name: 'E♭' })).toBeInTheDocument();
    expect(screen.getByText(/\(♭III\) on degree 2 of C Minor pentatonic/)).toBeInTheDocument();

    await pick('Degree of C Minor pentatonic', '2');
    expect(
      screen.getByText('No chord forms on degree 3 of C Minor pentatonic.'),
    ).toBeInTheDocument();
    expect(neck().dim.size).toBe(0);
    expect(neck().tone).toEqual(new Set(['E♭', 'F', 'G', 'B♭']));
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
    await fireEvent.click(screen.getByRole('radio', { name: '7th chords' }));
    await pick('Degree of D♭ Major', '4');
    expect(screen.getByRole('heading', { name: 'A♭7' })).toBeInTheDocument();
    expect(neck()).toEqual({
      root: new Set(['A♭']),
      tone: new Set(['C', 'E♭', 'G♭']),
      dim: new Set(['D♭', 'F', 'B♭']),
    });
  });
});
