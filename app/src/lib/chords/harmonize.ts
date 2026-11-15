/**
 * The seam for "the chord on degree n of the current scale" (SPEC §5.3, input mode 2).
 *
 * Which chord stands on a degree is theory (stacking every other scale tone, then naming the
 * result), so it comes from the core's harmonize (SPEC §5.5, ADR-30) and never from
 * TypeScript. The panel only asks through this interface. `harmonizer` is the real one, a
 * lookup in `harmonizeScale`'s table; `App` takes another as a prop, and tests pass a fixture
 * or `null` (no degree input).
 */
import { harmonizeScale, type Accidentals } from '../theory';

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

/**
 * The harmonize core's chords: the binding's table for the scale, the entry at the degree.
 * No chord there, or none the catalog names, is `undefined`.
 */
export const harmonizer: Harmonizer | null = {
  chordOnDegree({ scaleId, root, degree, size, accidentals }) {
    const entry = harmonizeScale(scaleId, root, accidentals, size)[degree];
    const chord = entry?.chord;
    if (!chord?.chordId) return undefined;
    return { root: entry.root.name, chordId: chord.chordId, numeral: chord.numeral.text };
  },
};
