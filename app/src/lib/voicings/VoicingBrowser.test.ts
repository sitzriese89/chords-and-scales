// The voicing browser in the real app: the real WASM core, settings and storage, a fake
// AudioContext and the C major fixture for the harmonize seam.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import { AudioEngine, midiToHz } from '../audio';
import { FakeAudioContext, FakeGesture } from '../audio/fake-context';
import { cMajorHarmonizer } from '../chords/fixture-harmonizer';
import { defaultSettings, SETTINGS_DOCUMENT, serializeSettings, type Settings } from '../settings';
import { BrowserStorage } from '../storage';

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
  options: { change?: (s: Settings) => void; audio?: AudioEngine; storage?: BrowserStorage } = {},
): Promise<BrowserStorage> {
  const storage = options.storage ?? new BrowserStorage(window.localStorage);
  if (!options.storage) {
    const settings = defaultSettings();
    settings.tab.highlight = false;
    options.change?.(settings);
    await storage.write(SETTINGS_DOCUMENT, serializeSettings(settings));
  }
  render(App, {
    storage,
    harmonizer: cMajorHarmonizer,
    ...(options.audio ? { audio: options.audio } : {}),
  });
  await screen.findByRole('grid', { name: /^Fretboard/ });
  return storage;
}

const pick = (name: string, value: string) =>
  fireEvent.change(screen.getByRole('combobox', { name }), { target: { value } });

/** The shapes in the list, as written: `x32010`. */
function shapes(): string[] {
  const list = screen.queryByRole('list', { name: /^Voicings of/ });
  if (!list) return [];
  return within(list)
    .getAllByRole('button')
    .map((b) => b.querySelector('.shape')!.textContent!);
}

const shapeButton = (shape: string) =>
  screen.getByRole('button', { name: new RegExp(`^\\d+\\. ${shape}(,|$)`) });

/** The neck's dots as `string:fret`, sorted. */
function neck(): string[] {
  return [...document.querySelectorAll<SVGGElement>('svg.fretboard g.dot')]
    .map((g) => `${g.dataset.string}:${g.dataset.fret}`)
    .sort();
}

describe('voicing browser', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('shows nothing until a chord is chosen, then the ranked shapes as diagrams', async () => {
    await startApp();
    expect(screen.queryByRole('heading', { name: /^Voicings/ })).not.toBeInTheDocument();

    await pick('Chord quality', 'major');
    expect(screen.getByRole('heading', { name: 'Voicings of C' })).toBeInTheDocument();
    expect(screen.getByText('50 shapes, best first')).toBeInTheDocument();
    const list = shapes();
    expect(list).toHaveLength(50);
    expect(list.slice(0, 5)).toContain('x32010');
    // Every shape is a diagram with a name.
    expect(screen.getAllByRole('img', { name: /^C: / })).toHaveLength(50);
    expect(screen.getByRole('img', { name: 'C: x32010' })).toBeInTheDocument();
  });

  it('heads a slash chord by the chord alone and says its bass is not voiced', async () => {
    await startApp();
    await pick('Chord quality', 'major');
    expect(screen.queryByText(/bass isn't voiced/)).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('radio', { name: 'Typed symbol' }));
    await fireEvent.input(screen.getByRole('textbox', { name: 'Chord symbol' }), {
      target: { value: 'Am7/G' },
    });
    expect(screen.getByRole('heading', { name: 'Voicings of Am7' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Voicings of Am7\/G/ })).not.toBeInTheDocument();
    expect(screen.getByText("Shapes of Am7; the G bass isn't voiced.")).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Voicings of Am7' })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /^Am7: / }).length).toBeGreaterThan(0);
  });

  it('updates the list when a constraint changes, and saves the constraints', async () => {
    const storage = await startApp();
    await pick('Chord quality', 'major');
    const before = shapes();

    await fireEvent.click(screen.getByRole('checkbox', { name: 'Open strings' }));
    const closed = shapes();
    expect(closed).not.toEqual(before);
    expect(closed).not.toContain('x32010');
    expect(document.querySelectorAll('.voicings [data-marker="open"]')).toHaveLength(0);

    await pick('Max fret span', '2');
    expect(shapes().length).toBeGreaterThan(0);
    expect(shapes()).not.toEqual(closed);

    await fireEvent.click(screen.getByRole('checkbox', { name: 'Muted strings' }));
    expect(document.querySelectorAll('.voicings [data-marker="muted"]')).toHaveLength(0);

    expect(await storage.read(SETTINGS_DOCUMENT)).toMatch(
      /\[voicings\]\nmax_span = 2\nopen_strings = false\nmuted_strings = false\ninversions = false/,
    );
  });

  it('lists inversions only when asked, naming their bass', async () => {
    await startApp();
    await pick('Chord quality', 'major');
    expect(screen.queryByText(/^bass /)).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Inversions' }));
    expect(screen.getAllByRole('button', { name: /, bass (3|5)/ }).length).toBeGreaterThan(0);
  });

  it('says so when no shape fits', async () => {
    // Every string played, none open, on the 9-string guitar: no G7 (ADR-35's hand model).
    await startApp({
      change: (s) => {
        s.instrument = { ...s.instrument, strings: 9, tuning: 'guitar-9-standard' };
        s.voicings = { maxSpan: 1, openStrings: false, mutedStrings: false, inversions: false };
      },
    });
    await pick('Chord root', 'G');
    await pick('Chord quality', 'dom7');
    expect(screen.getByText('No shapes')).toBeInTheDocument();
    expect(
      screen.getByText('No playable shape of G7 fits these constraints on this neck.'),
    ).toBeInTheDocument();
  });

  it('shows a chosen shape alone on the neck and strums it; choosing it again shows all', async () => {
    const { audio, gesture, frequencies } = audioSetup();
    await startApp({ audio });
    await pick('Chord quality', 'major');
    const everywhere = neck();
    expect(everywhere.length).toBeGreaterThan(20);
    gesture.happen();

    await fireEvent.click(shapeButton('x32010'));
    expect(shapeButton('x32010')).toHaveAttribute('aria-pressed', 'true');
    expect(neck()).toEqual(['1:0', '2:1', '3:0', '4:2', '5:3']);
    // Still drawn and named as the chord.
    expect(screen.getByRole('grid', { name: /^Fretboard: C chord/ })).toBeInTheDocument();
    // C3 E3 G3 C4 E4, lowest string first: pitches from the core.
    expect(frequencies).toEqual([48, 52, 55, 60, 64].map(midiToHz));

    await fireEvent.click(shapeButton('x32010'));
    expect(shapeButton('x32010')).toHaveAttribute('aria-pressed', 'false');
    expect(neck()).toEqual(everywhere);

    await fireEvent.click(shapeButton('x32010'));
    await fireEvent.click(screen.getByRole('button', { name: 'Show all positions' }));
    expect(neck()).toEqual(everywhere);
  });

  it('draws the shape without the scale for a chord on a degree', async () => {
    await startApp();
    await fireEvent.click(screen.getByRole('radio', { name: 'Degree of the scale' }));
    await pick('Degree of C Major', '4');
    expect(
      document.querySelectorAll('svg.fretboard g.dot[data-role="dim"]').length,
    ).toBeGreaterThan(0);
    await fireEvent.click(shapeButton('320003'));
    expect(neck()).toEqual(['1:3', '2:0', '3:0', '4:0', '5:2', '6:3']);
    expect(document.querySelectorAll('svg.fretboard g.dot[data-role="dim"]')).toHaveLength(0);
    expect(screen.getByRole('grid', { name: /^Fretboard: G chord/ })).toBeInTheDocument();
  });

  it('drops the chosen shape when the chord, the tuning or a constraint changes', async () => {
    await startApp();
    await pick('Chord quality', 'major');
    const everywhere = neck();

    await fireEvent.click(shapeButton('x32010'));
    await pick('Chord quality', 'minor');
    expect(screen.getByRole('heading', { name: 'Voicings of Cm' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { pressed: true })).not.toBeInTheDocument();
    // Back to C major: the shape is not chosen again.
    await pick('Chord quality', 'major');
    expect(neck()).toEqual(everywhere);

    await fireEvent.click(shapeButton('x32010'));
    await fireEvent.click(screen.getByRole('button', { name: 'Clear chord' }));
    await pick('Chord quality', 'major');
    expect(screen.queryByRole('button', { pressed: true })).not.toBeInTheDocument();
    expect(neck()).toEqual(everywhere);

    await fireEvent.click(shapeButton('x32010'));
    await pick('Tuning', 'guitar-6-drop-d');
    expect(screen.queryByRole('button', { pressed: true })).not.toBeInTheDocument();
    await pick('Tuning', 'guitar-6-standard');
    expect(neck()).toEqual(everywhere);

    await fireEvent.click(shapeButton('x32010'));
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Inversions' }));
    expect(screen.queryByRole('button', { pressed: true })).not.toBeInTheDocument();
    expect(neck().length).toBeGreaterThan(20);
  });

  it('keeps the chosen shape when only the labels change, and labels the dots alike', async () => {
    await startApp();
    await pick('Chord quality', 'major');
    const diagram = () => screen.getByRole('img', { name: 'C: x32010' });
    const labels = () => [...diagram().querySelectorAll('g.dot text')].map((t) => t.textContent);
    expect(labels()).toEqual(['C', 'E', 'C']);
    await fireEvent.click(shapeButton('x32010'));

    await fireEvent.click(screen.getByRole('radio', { name: 'Intervals' }));
    expect(labels()).toEqual(['1', '3', '1']);
    expect(shapeButton('x32010')).toHaveAttribute('aria-pressed', 'true');
    expect(neck()).toEqual(['1:0', '2:1', '3:0', '4:2', '5:3']);
  });

  it('mirrors the diagrams when left-handed', async () => {
    await startApp({ change: (s) => (s.leftHanded = true) });
    await pick('Chord quality', 'major');
    const diagram = screen.getByRole('img', { name: 'C: x32010' });
    const x = (string: number) =>
      Number(diagram.querySelector(`g.dot[data-string="${string}"] text`)!.getAttribute('x'));
    expect(x(5)).toBeGreaterThan(x(2));
  });
});
