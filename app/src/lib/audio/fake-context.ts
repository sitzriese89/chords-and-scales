import type {
  AudioBufferLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  BufferSourceLike,
  GainNodeLike,
  GestureTracker,
} from './engine';

/**
 * For tests: an `AudioContext` that makes no sound and records what was asked of it, with a
 * clock the test moves (`context.currentTime = 2`).
 */
export class FakeParam implements AudioParamLike {
  value = 1;
  /** `[target, startTime, timeConstant]` of each `setTargetAtTime`. */
  targets: [number, number, number][] = [];
  cancelled: number[] = [];
  setTargetAtTime(target: number, startTime: number, timeConstant: number) {
    this.targets.push([target, startTime, timeConstant]);
  }
  cancelScheduledValues(startTime: number) {
    this.cancelled.push(startTime);
  }
}

export class FakeNode implements AudioNodeLike {
  connections: AudioNodeLike[] = [];
  disconnected = false;
  connect(destination: AudioNodeLike) {
    this.connections.push(destination);
  }
  disconnect() {
    this.disconnected = true;
  }
}

export class FakeGain extends FakeNode implements GainNodeLike {
  readonly gain = new FakeParam();
}

export class FakeBuffer implements AudioBufferLike {
  readonly data: Float32Array;
  constructor(length: number) {
    this.data = new Float32Array(length);
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

export class FakeSource extends FakeNode implements BufferSourceLike {
  buffer: AudioBufferLike | null = null;
  onended: (() => void) | null = null;
  /** Each `start(when)` and `stop(when)` call. */
  starts: (number | undefined)[] = [];
  stops: (number | undefined)[] = [];
  start(when?: number) {
    this.starts.push(when);
  }
  stop(when?: number) {
    this.stops.push(when);
  }
  /** Plays out: the browser calls `onended` when a source has finished. */
  end() {
    this.onended?.();
  }
}

export class FakeAudioContext implements AudioContextLike {
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  resumed = 0;
  closed = false;
  readonly destination = new FakeNode();
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];

  resume() {
    this.resumed += 1;
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createBuffer(_channels: number, length: number) {
    return new FakeBuffer(length);
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  /** The master gain: the first gain made, connected to the destination. */
  get master(): FakeGain {
    return this.gains[0];
  }
}

/** A gesture tracker the test flips by hand (`gesture.happen()`). */
export class FakeGesture implements GestureTracker {
  private done: boolean;
  stopped = false;
  constructor(done = false) {
    this.done = done;
  }
  happen() {
    this.done = true;
  }
  happened() {
    return this.done;
  }
  stop() {
    this.stopped = true;
  }
}
