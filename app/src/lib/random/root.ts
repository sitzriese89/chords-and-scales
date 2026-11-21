/**
 * Roots for the random pick, through the core (ADR-6): the pitch class of what is shown now, and
 * the name of a picked pitch class in the sharp/flat preference.
 */
import { pitchClassOf, spellPitchClass, type Accidentals } from '../theory';

/** The pitch class of the note name `root`; `-1` if it isn't one. */
export function rootPitchClass(root: string): number {
  try {
    return pitchClassOf(root.trim());
  } catch {
    return -1;
  }
}

/** The root to show for a picked pitch class: `1` → `C♯` or `D♭`, by the preference. */
export function spellRoot(pitchClass: number, accidentals: Accidentals): string {
  return spellPitchClass(pitchClass, accidentals);
}
