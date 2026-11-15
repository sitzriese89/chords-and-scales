import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, LEAD_SECONDS, trackUserGesture, volumeToGain } from './engine';
import { FakeAudioContext, FakeGesture } from './fake-context';

/** An engine on a fake context. `renders` collects the frequency of every note rendered. */
function setup(options: { gesture?: boolean; volume?: number; muted?: boolean } = {}) {
  const context = new FakeAudioContext();
  const gesture = new FakeGesture(options.gesture ?? true);
  const renders: number[] = [];
  const createContext = vi.fn(() => context);
  const engine = new AudioEngine({
    createContext,
    gesture,
    volume: options.volume,
    muted: options.muted,
    render: (frequency, sampleRate) => {
      renders.push(frequency);
      return new Float32Array(Math.round(sampleRate / 100)).fill(0.25);
    },
  });
  return { engine, context, gesture, renders, createContext };
}

const starts = (context: FakeAudioContext) => context.sources.map((s) => s.starts[0]);
const velocities = (context: FakeAudioContext) =>
  context.gains.slice(1).map((g) => g.gain.value / 0.5);

describe('no sound before a user gesture', () => {
  it('creates no context when built, nor when volume and mute change', () => {
    const { engine, createContext } = setup({ gesture: false });
    engine.configure({ volume: 40, muted: true });
    engine.configure({ muted: false });
    expect(engine.started).toBe(false);
    expect(createContext).not.toHaveBeenCalled();
  });

  it.each([
    ['a note', (e: AudioEngine) => e.playNote(60)],
    ['a sequence', (e: AudioEngine) => e.playSequence([60, 62])],
    ['a strum', (e: AudioEngine) => e.strum([40, 45, 50])],
  ])('plays %s only after the first gesture', (_, play) => {
    const { engine, context, createContext, gesture } = setup({ gesture: false });
    expect(play(engine)).toBe(false);
    expect(createContext).not.toHaveBeenCalled();
    expect(context.sources).toHaveLength(0);

    gesture.happen();
    expect(play(engine)).toBe(true);
    expect(createContext).toHaveBeenCalledOnce();
    expect(context.sources.length).toBeGreaterThan(0);
  });

  it('makes the context once and reuses it', () => {
    const { engine, createContext } = setup();
    engine.playNote(60);
    engine.playNote(62);
    engine.strum([40, 45]);
    expect(createContext).toHaveBeenCalledOnce();
    expect(engine.started).toBe(true);
  });

  it('by default waits for a click, touch or key press in the page', () => {
    const context = new FakeAudioContext();
    const createContext = vi.fn(() => context);
    const engine = new AudioEngine({ createContext });
    expect(engine.playNote(60)).toBe(false);
    expect(createContext).not.toHaveBeenCalled();

    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(engine.playNote(60)).toBe(true);
    expect(createContext).toHaveBeenCalledOnce();
    engine.dispose();
  });

  it('tracks the first gesture on its target and then stops listening', () => {
    const target = new EventTarget();
    const remove = vi.spyOn(target, 'removeEventListener');
    const tracker = trackUserGesture(target);
    expect(tracker.happened()).toBe(false);
    target.dispatchEvent(new Event('mousemove'));
    expect(tracker.happened()).toBe(false);
    target.dispatchEvent(new Event('keydown'));
    expect(tracker.happened()).toBe(true);
    expect(remove).toHaveBeenCalled();
  });

  it('does nothing where Web Audio is missing or fails to start', () => {
    const none = new AudioEngine({ createContext: () => null, gesture: new FakeGesture(true) });
    expect(none.playNote(60)).toBe(false);
    const broken = new AudioEngine({
      createContext: () => {
        throw new Error('not allowed');
      },
      gesture: new FakeGesture(true),
    });
    expect(broken.playNote(60)).toBe(false);
    expect(broken.started).toBe(false);
  });
});

describe('playNote', () => {
  it('starts the note just ahead of the clock at the pitch of its MIDI number', () => {
    const { engine, context, renders } = setup();
    context.currentTime = 3;
    engine.playNote(69);
    expect(starts(context)).toEqual([3 + LEAD_SECONDS]);
    expect(renders[0]).toBeCloseTo(440, 6);
  });

  it.each([
    [40, 82.407],
    [45, 110],
    [60, 261.626],
    [64, 329.628],
    [81, 880],
  ])('turns MIDI %i into %f Hz', (midi, hz) => {
    const { engine, renders } = setup();
    engine.playNote(midi);
    expect(renders[0]).toBeCloseTo(hz, 2);
  });

  it('plays the rendered samples, through a gain into the master volume', () => {
    const { engine, context } = setup({ volume: 50 });
    engine.playNote(60, 0.5);
    const [source] = context.sources;
    const samples = source.buffer!.getChannelData(0);
    expect(samples).toHaveLength(80);
    expect(samples[0]).toBe(0.25);
    const [master, voice] = context.gains;
    expect(master.gain.value).toBeCloseTo(volumeToGain(50));
    expect(master.connections).toEqual([context.destination]);
    expect(source.connections).toEqual([voice]);
    expect(voice.connections).toEqual([master]);
    expect(voice.gain.value).toBeCloseTo(0.25);
  });

  it('adds to what is already playing', () => {
    const { engine, context } = setup();
    engine.playNote(60);
    engine.playNote(64);
    expect(context.sources.map((s) => s.stops)).toEqual([[], []]);
  });

  it('cleans up a note when it has finished', () => {
    const { engine, context } = setup();
    engine.playNote(60);
    const [source] = context.sources;
    source.end();
    expect(source.disconnected).toBe(true);
    expect(context.gains[1].disconnected).toBe(true);
  });

  it('wakes a suspended context', () => {
    const { engine, context } = setup();
    context.state = 'suspended';
    engine.playNote(60);
    expect(context.resumed).toBe(1);
  });
});

describe('playSequence', () => {
  it('starts each note an interval after the one before, at its own pitch', () => {
    const { engine, context, renders } = setup();
    context.currentTime = 10;
    // E3 F♯3 A3: MIDI 52, 54, 57
    engine.playSequence([52, 54, 57]);
    expect(starts(context)).toEqual([
      10 + LEAD_SECONDS,
      10 + LEAD_SECONDS + 0.3,
      10 + LEAD_SECONDS + 0.6,
    ]);
    expect(renders).toEqual([52, 54, 57].map((m) => 440 * 2 ** ((m - 69) / 12)));
  });

  it('takes the interval as an option, and plays a descending line as given', () => {
    const { engine, context, renders } = setup();
    engine.playSequence([64, 62, 60], { interval: 0.5 });
    expect(starts(context)).toEqual([LEAD_SECONDS, LEAD_SECONDS + 0.5, LEAD_SECONDS + 1]);
    expect(renders[0]).toBeGreaterThan(renders[2]);
  });

  it('plays nothing for an empty list', () => {
    const { engine, createContext } = setup();
    expect(engine.playSequence([])).toBe(false);
    expect(createContext).not.toHaveBeenCalled();
  });

  it('cuts off what was playing, with a short fade', () => {
    const { engine, context } = setup();
    engine.playSequence([60, 62]);
    context.currentTime = 1;
    engine.playSequence([64]);
    const [first, second, third] = context.sources;
    for (const old of [first, second]) {
      expect(old.stops).toHaveLength(1);
      expect(old.stops[0]).toBeGreaterThan(1);
    }
    expect(third.stops).toEqual([]);
    expect(context.gains[1].gain.targets[0][0]).toBe(0);
  });
});

describe('strum', () => {
  it('plays a downstrum from the lowest string up, a few milliseconds apart', () => {
    const { engine, context, renders } = setup();
    // An open E minor on six strings, lowest first: E2 B2 E3 G3 B3 E4
    engine.strum([40, 47, 52, 55, 59, 64]);
    const times = starts(context) as number[];
    expect(times.map((t) => +(t - LEAD_SECONDS).toFixed(6))).toEqual([
      0, 0.035, 0.07, 0.105, 0.14, 0.175,
    ]);
    expect(renders).toEqual([40, 47, 52, 55, 59, 64].map((m) => 440 * 2 ** ((m - 69) / 12)));
  });

  it('plays an upstrum from the highest string down', () => {
    const { engine, renders } = setup();
    engine.strum([40, 47, 52], { direction: 'up', spread: 0.02 });
    expect(renders).toEqual([52, 47, 40].map((m) => 440 * 2 ** ((m - 69) / 12)));
  });

  it('keeps a chord from being louder than a note by lowering each string', () => {
    const { engine, context } = setup();
    engine.strum([40, 47, 52, 55]);
    for (const v of velocities(context)) expect(v).toBeCloseTo(0.5);
  });

  it('cuts off what was playing', () => {
    const { engine, context } = setup();
    engine.playNote(60);
    engine.strum([40, 45]);
    expect(context.sources[0].stops).toHaveLength(1);
  });
});

describe('volume and mute', () => {
  it('maps the volume to a gain from silence to full, quieter than linear in between', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(100)).toBe(1);
    expect(volumeToGain(50)).toBeLessThan(0.5);
    expect(volumeToGain(250)).toBe(1);
    expect(volumeToGain(-3)).toBe(0);
  });

  it('plays nothing and makes no context while muted, from the start or after', () => {
    const { engine, createContext } = setup({ muted: true });
    expect(engine.playNote(60)).toBe(false);
    expect(engine.strum([40, 45])).toBe(false);
    expect(createContext).not.toHaveBeenCalled();
  });

  it('silences notes still ringing when muted, and brings the volume back after', () => {
    const { engine, context } = setup({ volume: 80 });
    engine.playNote(60);
    expect(context.master.gain.value).toBeCloseTo(volumeToGain(80));
    engine.configure({ muted: true });
    expect(context.master.gain.value).toBe(0);
    expect(engine.playNote(62)).toBe(false);
    expect(context.sources).toHaveLength(1);
    engine.configure({ muted: false });
    expect(context.master.gain.value).toBeCloseTo(volumeToGain(80));
    expect(engine.playNote(62)).toBe(true);
  });

  it('follows the volume while notes ring, and plays nothing at 0', () => {
    const { engine, context } = setup();
    engine.playNote(60);
    engine.configure({ volume: 25 });
    expect(context.master.gain.value).toBeCloseTo(volumeToGain(25));
    engine.configure({ volume: 0 });
    expect(engine.playNote(62)).toBe(false);
  });
});

describe('dispose', () => {
  afterEach(() => vi.restoreAllMocks());

  it('stops watching for gestures and closes the context', () => {
    const { engine, context, gesture } = setup();
    engine.playNote(60);
    engine.dispose();
    expect(gesture.stopped).toBe(true);
    expect(context.closed).toBe(true);
    expect(engine.started).toBe(false);
  });
});
