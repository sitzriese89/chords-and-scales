// The voicing browser in the real app: the real WASM core, settings and storage, a fake
// AudioContext and the C major fixture for the harmonize seam.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import { appReady, chordPicker, chordsPage, goTo, instrumentPanel, on } from '../../test-shell';
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
  await appReady();
  return storage;
}

const pick = (name: string, value: string) =>
  fireEvent.change(
    (name === 'Tuning'
      ? instrumentPanel()
      : name === 'Max fret span'
        ? chordsPage()
        : chordPicker()
    ).getByRole('combobox', { name }),
    { target: { value } },
  );

/** The shapes in the list, as their names write them: `1. x32010, bass 3` is `x32010`. */
function shapes(): string[] {
  const list = on('Chords').queryByRole('list', { name: /^Voicings of/ });
  if (!list) return [];
  return within(list)
    .getAllByRole('button')
    .map(
      (b) =>
        b
          .getAttribute('aria-label')!
          .replace(/^\d+\. /, '')
          .split(',')[0],
    );
}

const shapeButton = (shape: string) =>
  on('Chords').getByRole('button', { name: new RegExp(`^\\d+\\. ${shape}(,|$)`) });

/** The neck's dots as `string:fret`, sorted. */
function neck(): string[] {
  goTo('Scales');
  return [...document.querySelectorAll<SVGGElement>('svg.fretboard g.dot')]
    .map((g) => `${g.dataset.string}:${g.dataset.fret}`)
    .sort();
}

describe('voicing browser', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('shows nothing until a chord is chosen, then the ranked shapes as diagrams', async () => {
    await startApp();
    expect(on('Chords').queryByRole('heading', { name: /^Voicings/ })).not.toBeInTheDocument();

    await pick('Chord quality', 'major');
    expect(on('Chords').getByRole('heading', { name: 'Voicings of C' })).toBeInTheDocument();
    expect(on('Chords').getByText('50 shapes, best first')).toBeInTheDocument();
    const list = shapes();
    expect(list).toHaveLength(50);
    expect(list.slice(0, 5)).toContain('x32010');
    // Every shape is a diagram with a name.
    expect(on('Chords').getAllByRole('img', { name: /^C: / })).toHaveLength(50);
    expect(on('Chords').getByRole('img', { name: 'C: x32010' })).toBeInTheDocument();
  });

  it('writes no shape text under the diagrams; the shape is in their names', async () => {
    await startApp();
    await pick('Chord quality', 'major');
    const list = on('Chords').getByRole('list', { name: 'Voicings of C' });
    const button = within(list).getByRole('button', { name: /^\d+\. x32010$/ });
    // The diagram and the button carry the shape for screen readers…
    expect(within(button).getByRole('img', { name: 'C: x32010' })).toBeInTheDocument();
    // …but no visible text spells it out: only the diagram's own numbers and labels.
    const visible = [...button.childNodes]
      .filter((n) => !(n instanceof SVGElement))
      .map((n) => n.textContent!.trim())
      .join('');
    expect(visible).toBe('');
    expect(list.textContent).not.toMatch(/x32010/);
  });

  it('heads a slash chord by the chord alone and says its bass is not voiced', async () => {
    await startApp();
    await pick('Chord quality', 'major');
    expect(on('Chords').queryByText(/bass isn't voiced/)).not.toBeInTheDocument();

    await fireEvent.click(chordPicker().getByRole('radio', { name: 'Typed symbol' }));
    await fireEvent.input(chordPicker().getByRole('textbox', { name: 'Chord symbol' }), {
      target: { value: 'Am7/G' },
    });
    expect(on('Chords').getByRole('heading', { name: 'Voicings of Am7' })).toBeInTheDocument();
    expect(
      on('Chords').queryByRole('heading', { name: /^Voicings of Am7\/G/ }),
    ).not.toBeInTheDocument();
    expect(on('Chords').getByText("Shapes of Am7; the G bass isn't voiced.")).toBeInTheDocument();
    expect(on('Chords').getByRole('list', { name: 'Voicings of Am7' })).toBeInTheDocument();
    expect(on('Chords').getAllByRole('img', { name: /^Am7: / }).length).toBeGreaterThan(0);
  });

  it('updates the list when a constraint changes, and saves the constraints', async () => {
    const storage = await startApp();
    await pick('Chord quality', 'major');
    const before = shapes();

    await fireEvent.click(on('Chords').getByRole('checkbox', { name: 'Open strings' }));
    const closed = shapes();
    expect(closed).not.toEqual(before);
    expect(closed).not.toContain('x32010');
    expect(document.querySelectorAll('.voicings [data-marker="open"]')).toHaveLength(0);

    await pick('Max fret span', '2');
    expect(shapes().length).toBeGreaterThan(0);
    expect(shapes()).not.toEqual(closed);

    await fireEvent.click(on('Chords').getByRole('checkbox', { name: 'Muted strings' }));
    expect(document.querySelectorAll('.voicings [data-marker="muted"]')).toHaveLength(0);

    expect(await storage.read(SETTINGS_DOCUMENT)).toMatch(
      /\[voicings\]\nmax_span = 2\nopen_strings = false\nmuted_strings = false\ninversions = false/,
    );
  });

  it('keeps the shapes on or above the start fret, and keeps the start fret over a restart', async () => {
    const storage = await startApp();
    await pick('Chord quality', 'major');
    const startFret = () => on('Chords').getByRole('spinbutton', { name: 'Start fret' });
    expect(startFret()).toHaveValue(0);
    expect(startFret()).toHaveAttribute('max', '24');
    expect(shapes()).toContain('x32010');

    await fireEvent.change(startFret(), { target: { value: '5' } });
    const high = shapes();
    expect(high).toHaveLength(50);
    expect(high).not.toContain('x32010');
    expect(high).not.toContain('x35553');
    expect(high).toContain('8 10 10 9 8 8');
    // Every fretted note is on fret 5 or higher; open strings may still ring.
    const frets = [...document.querySelectorAll<SVGGElement>('.voicings g.dot')].map((g) =>
      Number(g.dataset.fret),
    );
    expect(frets.length).toBeGreaterThan(0);
    expect(frets.every((fret) => fret >= 5)).toBe(true);
    expect(await storage.read(SETTINGS_DOCUMENT)).toMatch(/\[voicings\][^[]*\nstart_fret = 5\n/);

    cleanup();
    await startApp({ storage });
    await pick('Chord quality', 'major');
    expect(startFret()).toHaveValue(5);
    expect(shapes()).toEqual(high);

    await fireEvent.change(startFret(), { target: { value: '0' } });
    expect(shapes()).toContain('x32010');
  });

  it('refuses a start fret off the neck and puts the saved one back', async () => {
    const storage = await startApp({ change: (s) => (s.instrument.frets = 22) });
    await pick('Chord quality', 'major');
    const startFret = on('Chords').getByRole('spinbutton', { name: 'Start fret' });
    await fireEvent.change(startFret, { target: { value: '3' } });
    await fireEvent.change(startFret, { target: { value: '23' } });
    expect(on('Chords').getByRole('alert')).toHaveTextContent(
      'The start fret is a fret from 0 to 22.',
    );
    expect(startFret).toHaveValue(3);
    expect(await storage.read(SETTINGS_DOCUMENT)).toMatch(/\nstart_fret = 3\n/);
    await fireEvent.change(startFret, { target: { value: '7' } });
    expect(on('Chords').queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lists inversions only when asked, naming their bass', async () => {
    await startApp();
    await pick('Chord quality', 'major');
    expect(on('Chords').queryByText(/^bass /)).not.toBeInTheDocument();
    await fireEvent.click(on('Chords').getByRole('checkbox', { name: 'Inversions' }));
    expect(on('Chords').getAllByRole('button', { name: /, bass (3|5)/ }).length).toBeGreaterThan(0);
  });

  it('says so when no shape fits', async () => {
    // Every string played, none open, on the 9-string guitar: no G7 (ADR-35's hand model).
    await startApp({
      change: (s) => {
        s.instrument = { ...s.instrument, strings: 9, tuning: 'guitar-9-standard' };
        s.voicings = { ...s.voicings, maxSpan: 1, openStrings: false, mutedStrings: false };
      },
    });
    await pick('Chord root', 'G');
    await pick('Chord quality', 'dom7');
    expect(on('Chords').getByText('No shapes')).toBeInTheDocument();
    expect(
      on('Chords').getByText('No playable shape of G7 fits these constraints on this neck.'),
    ).toBeInTheDocument();
  });

  it('marks a chosen shape, strums it and enables "Add shape to sheet"; choosing it again unmarks it', async () => {
    const { audio, gesture, frequencies } = audioSetup();
    await startApp({ audio });
    await pick('Chord quality', 'major');
    const addShape = () => chordsPage().getByRole('button', { name: 'Add shape to sheet' });
    expect(addShape()).toBeDisabled();
    expect(chordsPage().queryByRole('button', { pressed: true })).not.toBeInTheDocument();
    gesture.happen();

    await fireEvent.click(shapeButton('x32010'));
    expect(shapeButton('x32010')).toHaveAttribute('aria-pressed', 'true');
    expect(chordsPage().getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(addShape()).toBeEnabled();
    // C3 E3 G3 C4 E4, lowest string first: pitches from the core.
    expect(frequencies).toEqual([48, 52, 55, 60, 64].map(midiToHz));
    // "Show all positions" went with the neck.
    expect(screen.queryByRole('button', { name: 'Show all positions' })).not.toBeInTheDocument();

    await fireEvent.click(addShape());
    expect(chordsPage().getByRole('status')).toHaveTextContent('Added to the sheet (1 item).');

    await fireEvent.click(shapeButton('x32010'));
    expect(shapeButton('x32010')).toHaveAttribute('aria-pressed', 'false');
    expect(addShape()).toBeDisabled();
  });

  it('draws no chord and no shape on the Scales neck', async () => {
    await startApp();
    const scaleNeck = neck();
    await fireEvent.click(chordPicker().getByRole('radio', { name: 'Degree of the scale' }));
    await pick('Degree of C Major', '4');
    expect(neck()).toEqual(scaleNeck);
    await fireEvent.click(shapeButton('320003'));
    expect(neck()).toEqual(scaleNeck);
    expect(document.querySelectorAll('svg.fretboard g.dot[data-role="dim"]')).toHaveLength(0);
    expect(on('Scales').getByRole('grid', { name: /^Fretboard: C Major, / })).toBeInTheDocument();
  });

  it('drops the chosen shape when the chord, the tuning or a constraint changes', async () => {
    await startApp();
    await pick('Chord quality', 'major');
    const pressed = () => chordsPage().queryByRole('button', { pressed: true });

    await fireEvent.click(shapeButton('x32010'));
    await pick('Chord quality', 'minor');
    expect(on('Chords').getByRole('heading', { name: 'Voicings of Cm' })).toBeInTheDocument();
    expect(pressed()).not.toBeInTheDocument();
    // Back to C major: the shape is not chosen again.
    await pick('Chord quality', 'major');
    expect(pressed()).not.toBeInTheDocument();

    // Clear chord and the same chord again: no shape comes back (ADR-53).
    await fireEvent.click(shapeButton('x32010'));
    await fireEvent.click(chordsPage().getByRole('button', { name: 'Clear chord' }));
    await pick('Chord quality', 'major');
    expect(pressed()).not.toBeInTheDocument();
    expect(chordsPage().getByRole('button', { name: 'Add shape to sheet' })).toBeDisabled();

    await fireEvent.click(shapeButton('x32010'));
    await pick('Tuning', 'guitar-6-drop-d');
    expect(pressed()).not.toBeInTheDocument();
    await pick('Tuning', 'guitar-6-standard');
    expect(pressed()).not.toBeInTheDocument();

    await fireEvent.click(shapeButton('x32010'));
    await fireEvent.click(on('Chords').getByRole('checkbox', { name: 'Inversions' }));
    expect(pressed()).not.toBeInTheDocument();
  });

  it('keeps the chosen shape when only the labels change, and labels the dots alike', async () => {
    await startApp();
    await pick('Chord quality', 'major');
    const diagram = () => on('Chords').getByRole('img', { name: 'C: x32010' });
    const labels = () => [...diagram().querySelectorAll('g.dot text')].map((t) => t.textContent);
    expect(labels()).toEqual(['C', 'E', 'C']);
    await fireEvent.click(shapeButton('x32010'));

    await fireEvent.click(on('Scales').getByRole('radio', { name: 'Intervals' }));
    expect(labels()).toEqual(['1', '3', '1']);
    expect(shapeButton('x32010')).toHaveAttribute('aria-pressed', 'true');
  });

  it('draws the grid larger than its natural size, the same drawing scaled', async () => {
    await startApp();
    await pick('Chord quality', 'major');
    const svg = on('Chords').getByRole('img', { name: 'C: x32010' });
    const [, , width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    expect(Number(svg.getAttribute('width'))).toBe(width * 1.5);
    expect(Number(svg.getAttribute('height'))).toBe(height * 1.5);
  });

  it('mirrors the diagrams when left-handed', async () => {
    await startApp({ change: (s) => (s.leftHanded = true) });
    await pick('Chord quality', 'major');
    const diagram = on('Chords').getByRole('img', { name: 'C: x32010' });
    const at = (string: number, name: string) =>
      Number(diagram.querySelector(`g.dot[data-string="${string}"] text`)!.getAttribute(name));
    // The nut on the right, as on the neck: fret 3 (string 5) left of fret 1 (string 2).
    expect(at(5, 'x')).toBeLessThan(at(2, 'x'));
    expect(diagram.querySelector('rect.nut')!.getAttribute('x')).toSatisfy(
      (x: string) => Number(x) > at(2, 'x'),
    );
    // The strings are not mirrored: the lowest stays at the bottom.
    expect(at(5, 'y')).toBeGreaterThan(at(2, 'y'));
  });
});
