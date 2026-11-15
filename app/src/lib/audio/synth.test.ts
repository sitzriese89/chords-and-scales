import { describe, expect, it } from 'vitest';
import { midiToHz, renderPluck } from './synth';

const SAMPLE_RATE = 44100;

/**
 * The lag, in samples, where the signal best matches itself shifted: its period, to a
 * fraction of a sample (parabola through the three best lags).
 */
function period(samples: Float32Array, around: number): number {
  // Compare a stretch just after the attack, where the note is loud.
  const span = Math.round(around * 8);
  const correlation = (lag: number) => {
    let sum = 0;
    for (let i = 0; i < span; i++) sum += samples[i + 200] * samples[i + 200 + lag];
    return sum;
  };
  let bestLag = Math.floor(around * 0.8);
  for (let lag = bestLag; lag <= Math.ceil(around * 1.2); lag++) {
    if (correlation(lag) > correlation(bestLag)) bestLag = lag;
  }
  const [a, b, c] = [bestLag - 1, bestLag, bestLag + 1].map(correlation);
  return bestLag + (0.5 * (a - c)) / (a - 2 * b + c);
}

function rms(samples: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (to - from));
}

describe('midiToHz', () => {
  it('is concert pitch: A4 is 440 Hz and an octave doubles', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(57)).toBeCloseTo(220, 9);
    expect(midiToHz(81)).toBeCloseTo(880, 9);
  });

  it('puts middle C and the lowest guitar string where they belong', () => {
    expect(midiToHz(60)).toBeCloseTo(261.6256, 3);
    expect(midiToHz(40)).toBeCloseTo(82.4069, 3);
  });
});

describe('renderPluck', () => {
  it.each([
    ['low B on a 7-string bass', 23],
    ['E1', 28],
    ['E2', 40],
    ['A3', 57],
    ['E4', 64],
    ['A5', 81],
    ['E6', 88],
  ])('rings at the pitch of %s', (_, midi) => {
    const hz = midiToHz(midi);
    const samples = renderPluck(hz, SAMPLE_RATE, 1);
    const expected = SAMPLE_RATE / hz;
    // Within 0.3% of the pitch: a twentieth of a semitone, too little to hear.
    expect(Math.abs(period(samples, expected) - expected) / expected).toBeLessThan(0.003);
  });

  it('gives the same sound every time for the same note', () => {
    expect(renderPluck(220, SAMPLE_RATE, 0.2)).toEqual(renderPluck(220, SAMPLE_RATE, 0.2));
  });

  it('differs between notes', () => {
    expect(renderPluck(220, SAMPLE_RATE, 0.2)).not.toEqual(renderPluck(221, SAMPLE_RATE, 0.2));
  });

  it('has the length asked for and stays within -1 and 1 with headroom', () => {
    const samples = renderPluck(196, SAMPLE_RATE, 0.5);
    expect(samples).toHaveLength(Math.round(0.5 * SAMPLE_RATE));
    const peak = Math.max(...samples.map(Math.abs));
    expect(peak).toBeGreaterThan(0.85);
    expect(peak).toBeLessThanOrEqual(0.9 + 1e-6);
  });

  it('dies away like a plucked string and ends in silence', () => {
    const samples = renderPluck(196, SAMPLE_RATE);
    const early = rms(samples, 0, 4410);
    const middle = rms(samples, 44100, 44100 + 4410);
    const late = rms(samples, samples.length - 4410, samples.length);
    expect(middle).toBeLessThan(early * 0.7);
    expect(late).toBeLessThan(middle);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(1e-3);
  });

  it('loses its high partials first, so it goes from bright to mellow', () => {
    const samples = renderPluck(110, SAMPLE_RATE);
    // Sample-to-sample change relative to level is large for bright, noisy sound.
    const roughness = (from: number, to: number) => {
      let diff = 0;
      for (let i = from + 1; i < to; i++) diff += (samples[i] - samples[i - 1]) ** 2;
      return Math.sqrt(diff / (to - from)) / rms(samples, from, to);
    };
    expect(roughness(SAMPLE_RATE, SAMPLE_RATE + 8820)).toBeLessThan(roughness(0, 8820));
  });

  it('gives silence for a frequency or sample rate that cannot be played', () => {
    expect(renderPluck(0, SAMPLE_RATE, 0.1).every((s) => s === 0)).toBe(true);
    expect(renderPluck(440, 0, 0.1).every((s) => s === 0)).toBe(true);
  });
});
