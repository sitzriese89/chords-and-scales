/**
 * The plucked-string synth (ADR-12, ADR-28): Karplus–Strong, rendered to a sample buffer.
 *
 * Signal processing only. Which pitch to play (a MIDI note number) comes from the core; this
 * file turns it into sound and knows no music theory.
 *
 * The string is a ring buffer of one period of noise. Each time round the loop the sample is
 * averaged with its neighbour (a gentle low-pass, so high partials die first, as on a real
 * string), scaled by a loss factor, and passed through a first-order all-pass filter that
 * tunes the loop to a fraction of a sample. Rendering to a buffer, rather than running a
 * feedback loop of Web Audio nodes, is what makes high notes in tune: a node loop can't be
 * shorter than one render quantum (128 samples).
 */

/** Concert pitch: MIDI note 69 (A4) sounds at 440 Hz (12-TET, ADR-6). */
const A4_MIDI = 69;
const A4_HZ = 440;

/** The frequency of a MIDI note number in 12-tone equal temperament. */
export function midiToHz(midi: number): number {
  return A4_HZ * 2 ** ((midi - A4_MIDI) / 12);
}

/** How long a plucked note takes to fall 60 dB, in seconds (about the same at every pitch). */
const DECAY_SECONDS = 2.2;
/** The rendered note ends this many seconds after the pluck. */
const NOTE_SECONDS = 3;
/** The last stretch of a note fades to nothing so a buffer never ends with a click. */
const FADE_SECONDS = 0.1;
/** Peak level of a rendered note, leaving headroom for several notes at once. */
const PEAK = 0.9;

/** A small deterministic noise source (mulberry32), so a note always renders the same. */
function noise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/**
 * One plucked note as mono samples in -1…1.
 *
 * @param frequency Pitch in Hz, from `midiToHz`.
 * @param sampleRate Sample rate of the AudioContext it will play in.
 * @param seconds Length of the buffer; the note has faded out before it ends.
 */
export function renderPluck(
  frequency: number,
  sampleRate: number,
  seconds: number = NOTE_SECONDS,
): Float32Array {
  const length = Math.max(1, Math.round(seconds * sampleRate));
  const out = new Float32Array(length);
  if (!(frequency > 0) || !(sampleRate > 0)) return out;

  // The loop delay is the ring (N samples) + 0.5 from the averaging filter + the all-pass's
  // fraction `frac`, and must add up to one period. frac in [0.5, 1.5) keeps the all-pass
  // coefficient small and stable.
  const period = sampleRate / frequency;
  const ringLength = Math.max(2, Math.floor(period - 1));
  const frac = Math.max(0.5, period - 0.5 - ringLength);
  const allpass = (1 - frac) / (1 + frac);

  // Loss per trip round the loop so the note falls 60 dB in DECAY_SECONDS at any pitch.
  const loss = Math.min(0.9999, 10 ** (-3 / (frequency * DECAY_SECONDS)));

  // The pluck: noise, softened by a one-pole low-pass so the attack isn't harsh.
  const random = noise(Math.round(frequency * 1000));
  const ring = new Float32Array(ringLength);
  let soft = 0;
  for (let i = 0; i < ringLength; i++) {
    soft += 0.6 * (random() - soft);
    ring[i] = soft;
  }

  let position = 0;
  let previous = ring[ringLength - 1];
  let apInput = 0;
  let apOutput = 0;
  for (let n = 0; n < length; n++) {
    const current = ring[position];
    out[n] = current;
    const averaged = loss * 0.5 * (current + previous);
    previous = current;
    // y[n] = c·x[n] + x[n-1] − c·y[n-1]
    const tuned = allpass * averaged + apInput - allpass * apOutput;
    apInput = averaged;
    apOutput = tuned;
    ring[position] = tuned;
    position = position + 1 === ringLength ? 0 : position + 1;
  }

  // Normalise to PEAK, then fade the tail.
  let peak = 0;
  for (let n = 0; n < length; n++) peak = Math.max(peak, Math.abs(out[n]));
  const gain = peak > 0 ? PEAK / peak : 0;
  const fade = Math.min(length, Math.round(FADE_SECONDS * sampleRate));
  for (let n = 0; n < length; n++) {
    const tail = length - n;
    out[n] *= tail < fade ? gain * (tail / fade) : gain;
  }
  return out;
}
