/**
 * The audio engine (SPEC §5.9, ADR-12, ADR-27): plays notes as plucked strings through Web
 * Audio. It is the only place that touches an `AudioContext`.
 *
 * The API is small and takes MIDI note numbers, which the core reports (`NotePosition.midi`,
 * `Tuning.notes`); the engine does no music theory.
 *
 * - `playNote(midi)`: one note, on top of whatever rings.
 * - `playSequence(midis)`: the notes one after another (a scale up, down or both). Replaces
 *   what was playing.
 * - `strum(midis)`: the notes of a chord, string by string, lowest string first (or last with
 *   `direction: 'up'`). Replaces what was playing.
 * - `stop()`: fades out everything.
 *
 * The browser only lets a page make sound after a user gesture, and the engine holds to that
 * itself: it creates no `AudioContext` before the first click, touch or key press, and a
 * play call before then does nothing. The context is created by the first play call after
 * that, not at construction. While muted, play calls do nothing and no context is created.
 *
 * Everything it needs from the platform is injectable, so tests run it with a fake context.
 */
import {
  sequenceEvents,
  strumEvents,
  type NoteEvent,
  type SequenceOptions,
  type StrumOptions,
} from './schedule';
import { midiToHz, renderPluck } from './synth';

// The part of the Web Audio API the engine uses. The real `AudioContext` fits it (see
// `browserContext`); tests pass a fake.

export interface AudioParamLike {
  value: number;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
  cancelScheduledValues(startTime: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface BufferSourceLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  onended: (() => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: AudioNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
  createGain(): GainNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): BufferSourceLike;
}

/** A new browser `AudioContext`, or `null` where there is none. */
export function browserContext(): AudioContextLike | null {
  const scope = globalThis as { AudioContext?: new () => unknown; webkitAudioContext?: unknown };
  const Context =
    scope.AudioContext ?? (scope.webkitAudioContext as (new () => unknown) | undefined);
  return Context ? (new Context() as AudioContextLike) : null;
}

/** Answers whether the user has clicked, touched or typed in the page yet. */
export interface GestureTracker {
  happened(): boolean;
  stop(): void;
}

const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;

/** Watches `target` for the first user gesture. */
export function trackUserGesture(target: EventTarget): GestureTracker {
  let happened = false;
  const listener = () => {
    happened = true;
    stop();
  };
  const stop = () => {
    for (const type of GESTURE_EVENTS) target.removeEventListener(type, listener, true);
  };
  for (const type of GESTURE_EVENTS) target.addEventListener(type, listener, true);
  return { happened: () => happened, stop };
}

export interface EngineOptions {
  /** Makes the `AudioContext`; called once, at the first play after a user gesture. */
  createContext?: () => AudioContextLike | null;
  /** Renders one note; defaults to the Karplus–Strong synth. */
  render?: (frequency: number, sampleRate: number) => Float32Array;
  /** Tells whether a user gesture has happened; defaults to watching `document`. */
  gesture?: GestureTracker;
  /** Starting volume, 0 to 100 percent. */
  volume?: number;
  muted?: boolean;
}

/** Seconds between a play call and the first note, so scheduling never lands in the past. */
export const LEAD_SECONDS = 0.02;
/** Level of one note at full velocity before the master volume. */
const NOTE_GAIN = 0.5;
/** Time constant of the fade when notes are cut off, in seconds. */
const STOP_FADE = 0.02;

interface Voice {
  source: BufferSourceLike;
  gain: GainNodeLike;
}

/** The master volume curve: percent to gain, squared so the slider feels even. */
export function volumeToGain(percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent)) / 100;
  return clamped * clamped;
}

export class AudioEngine {
  private readonly createContext: () => AudioContextLike | null;
  private readonly render: (frequency: number, sampleRate: number) => Float32Array;
  private readonly gesture: GestureTracker;

  private volume: number;
  private muted: boolean;
  private context: AudioContextLike | null = null;
  private master: GainNodeLike | null = null;
  private readonly voices = new Set<Voice>();

  constructor(options: EngineOptions = {}) {
    this.createContext = options.createContext ?? browserContext;
    this.render = options.render ?? renderPluck;
    this.gesture =
      options.gesture ??
      (typeof document === 'undefined'
        ? { happened: () => false, stop: () => {} }
        : trackUserGesture(document));
    this.volume = options.volume ?? 70;
    this.muted = options.muted ?? false;
  }

  /** Whether an `AudioContext` exists yet. It doesn't until the first sound after a gesture. */
  get started(): boolean {
    return this.context !== null;
  }

  /** Sets the volume (0 to 100 percent) and mute. Takes effect on notes already ringing. */
  configure(settings: { volume?: number; muted?: boolean }): void {
    if (settings.volume !== undefined) this.volume = settings.volume;
    if (settings.muted !== undefined) this.muted = settings.muted;
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.value = this.muted ? 0 : volumeToGain(this.volume);
    }
  }

  /** One note, on top of what is still ringing. `velocity` is 0 to 1. Returns whether it plays. */
  playNote(midi: number, velocity = 1): boolean {
    return this.schedule([{ midi, at: 0, velocity }], false);
  }

  /** The notes one after another, replacing what was playing. Returns whether they play. */
  playSequence(midis: readonly number[], options?: SequenceOptions): boolean {
    return this.schedule(sequenceEvents(midis, options), true);
  }

  /**
   * The notes of a chord as a strum, replacing what was playing. `midis` are in string order,
   * lowest string first, with muted strings left out. Returns whether they play.
   */
  strum(midis: readonly number[], options?: StrumOptions): boolean {
    return this.schedule(strumEvents(midis, options), true);
  }

  /** Fades out everything, including notes not yet started. */
  stop(): void {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    for (const voice of this.voices) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, STOP_FADE);
      voice.source.stop(now + STOP_FADE * 8);
    }
  }

  /** Stops listening for gestures and closes the context. The engine is not used afterwards. */
  dispose(): void {
    this.gesture.stop();
    this.stop();
    const context = this.context;
    this.context = null;
    this.master = null;
    this.voices.clear();
    context?.close().catch(() => {});
  }

  private schedule(events: readonly NoteEvent[], replace: boolean): boolean {
    if (events.length === 0 || this.muted || this.volume === 0) return false;
    const context = this.ensureContext();
    if (!context || !this.master) return false;
    if (context.state === 'suspended') context.resume().catch(() => {});
    if (replace) this.stop();

    const start = context.currentTime + LEAD_SECONDS;
    for (const event of events) {
      const samples = this.render(midiToHz(event.midi), context.sampleRate);
      const buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.getChannelData(0).set(samples);

      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      gain.gain.value = NOTE_GAIN * event.velocity;
      source.connect(gain);
      gain.connect(this.master);

      const voice: Voice = { source, gain };
      this.voices.add(voice);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        this.voices.delete(voice);
      };
      source.start(start + event.at);
    }
    return true;
  }

  /** The context, made on first use and only after a user gesture. */
  private ensureContext(): AudioContextLike | null {
    if (this.context) return this.context;
    if (!this.gesture.happened()) return null;
    try {
      const context = this.createContext();
      if (!context) return null;
      const master = context.createGain();
      master.gain.value = this.muted ? 0 : volumeToGain(this.volume);
      master.connect(context.destination);
      this.context = context;
      this.master = master;
      return context;
    } catch {
      return null;
    }
  }
}
