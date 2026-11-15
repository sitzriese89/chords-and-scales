/**
 * The seam for "the chord on degree n of the current scale" (SPEC §5.3, input mode 2).
 *
 * Which chord stands on a degree is theory (stacking every other scale tone, then naming the
 * result), so it comes from the core's harmonize (M2.3, SPEC §5.5) and never from TypeScript.
 * The panel only asks through this interface. Until the harmonize binding exists
 * `harmonizer` is `null`, and the panel offers the degree input disabled; tests pass a
 * fixture. Wiring the real one is one line here: `harmonizer = { chordOnDegree: … }` calling
 * the binding.
 */
import type { Accidentals } from '../theory';

/** Triads or seventh chords, as in the harmonize view (SPEC §5.5). */
export type ChordSize = 'triads' | 'sevenths';

export interface DegreeChordRequest {
  /** Scale id from the catalog. */
  scaleId: string;
  /** The scale's root as displayed (`D♭`). */
  root: string;
  /** 0-based index of the scale degree (0 = the root). */
  degree: number;
  size: ChordSize;
  accidentals: Accidentals;
}

/** The chord a degree gives. */
export interface DegreeChord {
  /** The chord's root, spelled by the core (`G`, `B♭`). */
  root: string;
  /** Chord id from the chord catalog (`dom7`). */
  chordId: string;
  /** The Roman numeral, when the core provides one (`V7`). */
  numeral?: string;
}

export interface Harmonizer {
  /** The chord on the degree, or `undefined` when no chord forms there (SPEC §5.5). */
  chordOnDegree(request: DegreeChordRequest): DegreeChord | undefined;
}

/** The harmonize core's chords, or `null` while it isn't wired in (M2.3). */
export const harmonizer: Harmonizer | null = null;
