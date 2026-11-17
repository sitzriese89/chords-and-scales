/**
 * Which pitches the chord panel's strum plays.
 *
 * The chord is stacked upward from its lowest root on the neck: each next tone is the nearest
 * higher pitch of the next chord tone on a higher string (a string numbered lower, ADR-18),
 * so every string sounds at most once and the notes come out lowest string first. Strings
 * that aren't used are left out, as are tones that find no string above. This is a stand-in
 * for the voicing generator (M2.11, ADR-8): it picks among the core's positions and does no
 * interval arithmetic itself.
 */
import type { ChordVoicing, NotePosition } from '../theory';

/**
 * The notes a voicing (ADR-35) plays, lowest string first, as MIDI numbers: what a chosen
 * shape strums (ADR-37).
 */
export const shapePitches = (voicing: ChordVoicing): number[] =>
  voicing.strings.flatMap((s) => (s === null ? [] : [s.midi]));

/** The lower of two positions by pitch; on a tie, the one on the lower string. */
const lower = (a: NotePosition, b: NotePosition): NotePosition =>
  b.midi < a.midi || (b.midi === a.midi && b.string > a.string) ? b : a;

/**
 * The MIDI pitches to strum, lowest string first. `positions` are the chord's positions on
 * the neck (from the core); `tones` are the chord's pitch classes, root first, in formula
 * order.
 */
export function strumPitches(
  positions: readonly NotePosition[],
  tones: readonly number[],
): number[] {
  if (tones.length === 0) return [];
  const roots = positions.filter((p) => p.pitchClass === tones[0]);
  if (roots.length === 0) return [];
  let current = roots.reduce(lower);
  const pitches = [current.midi];
  for (const tone of tones.slice(1)) {
    const above = positions.filter(
      (p) => p.pitchClass === tone && p.string < current.string && p.midi > current.midi,
    );
    if (above.length === 0) continue;
    current = above.reduce(lower);
    pitches.push(current.midi);
  }
  return pitches;
}
