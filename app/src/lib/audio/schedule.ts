/**
 * When each note of a sequence or a strum starts. Pure functions from a list of MIDI notes to
 * timed events; the engine plays the events. Which notes to play, and in what order, is the
 * caller's business (the core gives the pitches; the tab's `playingOrder` gives the order).
 */

/** One note to start. */
export interface NoteEvent {
  /** The sounding note as a MIDI number, as the core reports it (`NotePosition.midi`). */
  midi: number;
  /** Seconds after the start of the phrase. */
  at: number;
  /** Loudness relative to one note on its own, above 0 and up to 1. */
  velocity: number;
}

/** Seconds from one note of a played scale to the next. */
export const DEFAULT_NOTE_INTERVAL = 0.3;
/** Seconds from one string of a strum to the next. */
export const DEFAULT_STRUM_SPREAD = 0.035;

export interface SequenceOptions {
  /** Seconds between the starts of two notes. */
  interval?: number;
}

/**
 * The notes one after another, in the order given: a scale going up, down, or both. Each
 * note rings on while the next starts.
 */
export function sequenceEvents(
  midis: readonly number[],
  { interval = DEFAULT_NOTE_INTERVAL }: SequenceOptions = {},
): NoteEvent[] {
  return midis.map((midi, i) => ({ midi, at: i * interval, velocity: 1 }));
}

export type StrumDirection = 'down' | 'up';

export interface StrumOptions {
  /** `down` hits the lowest string first, `up` the highest. Default `down`. */
  direction?: StrumDirection;
  /** Seconds between the starts of two neighbouring strings. */
  spread?: number;
}

/**
 * The notes of a chord almost at once, one string after the next.
 *
 * `midis` are in string order, the lowest string first (the order of `Tuning.notes`), so a
 * voicing's notes go in as they lie on the neck; a muted string is left out. `down` plays
 * them in that order, `up` in reverse. A chord is quieter note by note than a single note, so
 * the sum doesn't clip: velocity is 1/√n.
 */
export function strumEvents(
  midis: readonly number[],
  { direction = 'down', spread = DEFAULT_STRUM_SPREAD }: StrumOptions = {},
): NoteEvent[] {
  const ordered = direction === 'down' ? [...midis] : [...midis].reverse();
  const velocity = ordered.length > 0 ? 1 / Math.sqrt(ordered.length) : 1;
  return ordered.map((midi, i) => ({ midi, at: i * spread, velocity }));
}
