// Sound in the real app: the real WASM core and settings, with a fake AudioContext.
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.svelte';
import { defaultSettings, SETTINGS_DOCUMENT, serializeSettings, type Settings } from '../settings';
import { BrowserStorage } from '../storage';
import { AudioEngine, volumeToGain } from './engine';
import { FakeAudioContext, FakeGesture } from './fake-context';
import { midiToHz } from './synth';

/** Open strings of six-string standard tuning, string 1 (high E) first, as MIDI numbers. */
const OPEN = [64, 59, 55, 50, 45, 40];

const hz = (midi: number) => midiToHz(midi);

function setup() {
  const context = new FakeAudioContext();
  const gesture = new FakeGesture(false);
  const frequencies: number[] = [];
  const createContext = vi.fn(() => context);
  const audio = new AudioEngine({
    createContext,
    gesture,
    render: (frequency) => {
      frequencies.push(frequency);
      return new Float32Array(16);
    },
  });
  return { audio, context, gesture, frequencies, createContext };
}

async function startApp(
  audio: AudioEngine,
  change: (s: Settings) => void = () => {},
): Promise<BrowserStorage> {
  const storage = new BrowserStorage(window.localStorage);
  const settings = defaultSettings();
  change(settings);
  await storage.write(SETTINGS_DOCUMENT, serializeSettings(settings));
  render(App, { storage, audio });
  await screen.findByRole('grid', { name: /^Fretboard/ });
  return storage;
}

/** The tab's notes left to right, as sounding MIDI numbers worked out from string and fret. */
function tabMidis(): number[] {
  return [...document.querySelectorAll<SVGGElement>('svg.tab-drawing g.note')]
    .sort((a, b) => Number(a.dataset.column) - Number(b.dataset.column))
    .map((g) => OPEN[Number(g.dataset.string) - 1] + Number(g.querySelector('text')?.textContent));
}

describe('sound in the app', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('plays a clicked dot at its real pitch, after the first user gesture', async () => {
    const { audio, gesture, frequencies, createContext } = setup();
    await startApp(audio);
    expect(createContext).not.toHaveBeenCalled();

    // Before any gesture nothing sounds and no context exists.
    await fireEvent.click(screen.getByRole('gridcell', { name: /^String 1, fret 5, A/ }));
    expect(createContext).not.toHaveBeenCalled();
    expect(frequencies).toEqual([]);

    gesture.happen();
    // The A on the 5th fret of the high E string is A4; the open A string is A2.
    await fireEvent.click(screen.getByRole('gridcell', { name: /^String 1, fret 5, A/ }));
    await fireEvent.click(screen.getByRole('gridcell', { name: /^String 5, open, A/ }));
    expect(createContext).toHaveBeenCalledOnce();
    expect(frequencies).toEqual([hz(69), hz(45)]);
    expect(frequencies[0]).toBeCloseTo(440, 6);
    expect(frequencies[1]).toBeCloseTo(110, 6);
  });

  it('plays a dot with the keyboard too', async () => {
    const { audio, gesture, frequencies } = setup();
    await startApp(audio);
    gesture.happen();
    await fireEvent.keyDown(screen.getByRole('gridcell', { name: /^String 1, fret 5, A/ }), {
      key: 'Enter',
    });
    expect(frequencies).toEqual([hz(69)]);
  });

  it('follows the tuning: a lower tuning sounds lower', async () => {
    const { audio, gesture, frequencies } = setup();
    await startApp(audio, (s) => {
      s.instrument.tuning = 'guitar-6-drop-d';
    });
    gesture.happen();
    // Drop D has D2 (MIDI 38) on the lowest string, so its fret 2 is E2, not F♯2.
    await fireEvent.click(screen.getByRole('gridcell', { name: /^String 6, fret 2, E/ }));
    expect(frequencies).toEqual([hz(40)]);
  });

  it('plays the tab position as shown, up', async () => {
    const { audio, context, gesture, frequencies } = setup();
    await startApp(audio);
    gesture.happen();
    const shown = tabMidis();
    expect(shown.length).toBeGreaterThan(6);

    await fireEvent.click(screen.getByRole('button', { name: /^Play / }));
    expect(frequencies).toEqual(shown.map(hz));
    expect(frequencies).toEqual([...frequencies].sort((a, b) => a - b));
    const times = context.sources.map((s) => s.starts[0] as number);
    expect(times.map((t) => +(t - times[0]).toFixed(6))).toEqual(
      shown.map((_, i) => +(i * 0.3).toFixed(6)),
    );
  });

  it('plays the position down, or up and back down, as the direction says', async () => {
    const down = setup();
    await startApp(down.audio, (s) => {
      s.tab.direction = 'descending';
    });
    down.gesture.happen();
    // The tab is drawn in playing order, so what it shows is what must sound.
    const shown = tabMidis();
    await fireEvent.click(screen.getByRole('button', { name: /^Play / }));
    expect(down.frequencies).toEqual(shown.map(hz));
    expect(shown).toEqual([...shown].sort((a, b) => b - a));
    cleanup();

    window.localStorage.clear();
    const both = setup();
    await startApp(both.audio, (s) => {
      s.tab.direction = 'both';
    });
    both.gesture.happen();
    const there = tabMidis();
    await fireEvent.click(screen.getByRole('button', { name: /^Play / }));
    expect(both.frequencies).toEqual(there.map(hz));
    // Up to the top note, once, and back down the same way.
    expect(there).toHaveLength(2 * shown.length - 1);
    expect(there).toEqual([...there].reverse());
  });

  it('keeps mute across a restart, and plays nothing while muted', async () => {
    const first = setup();
    const storage = await startApp(first.audio);
    first.gesture.happen();
    const mute = screen.getByRole('checkbox', { name: 'Mute' });
    expect(mute).not.toBeChecked();
    await fireEvent.click(mute);
    await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/muted = true/);
    expect(screen.getByText('Sound is muted.')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('gridcell', { name: /^String 1, fret 5, A/ }));
    await fireEvent.click(screen.getByRole('button', { name: /^Play / }));
    expect(first.frequencies).toEqual([]);
    expect(first.createContext).not.toHaveBeenCalled();
    cleanup();

    // A new start reads the file: still muted.
    const second = setup();
    render(App, { storage, audio: second.audio });
    await screen.findByRole('grid', { name: /^Fretboard/ });
    second.gesture.happen();
    expect(screen.getByRole('checkbox', { name: 'Mute' })).toBeChecked();
    await fireEvent.click(screen.getByRole('gridcell', { name: /^String 1, fret 5, A/ }));
    expect(second.frequencies).toEqual([]);
  });

  it('sets the volume as the slider moves and saves it when it is let go', async () => {
    const { audio, context, gesture } = setup();
    const storage = await startApp(audio, (s) => {
      s.audio.volume = 50;
    });
    gesture.happen();
    const slider = screen.getByRole('slider', { name: 'Volume' });
    expect(slider).toHaveValue('50');

    await fireEvent.click(screen.getByRole('gridcell', { name: /^String 1, fret 5, A/ }));
    expect(context.master.gain.value).toBeCloseTo(volumeToGain(50));

    await fireEvent.input(slider, { target: { value: '20' } });
    expect(context.master.gain.value).toBeCloseTo(volumeToGain(20));
    expect(await storage.read(SETTINGS_DOCUMENT)).toMatch(/volume = 50/);

    await fireEvent.change(slider, { target: { value: '20' } });
    await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/volume = 20/);
    expect(context.master.gain.value).toBeCloseTo(volumeToGain(20));
  });
});
