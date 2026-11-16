/**
 * The harmonize row (SPEC §5.5, ADR-33): the chord on every degree of the explorer's scale,
 * with its Roman numeral, or "no chord" where no stack of thirds forms.
 *
 * Nothing here is theory. Each degree is asked through the chord panel's `Harmonizer` seam
 * (ADR-32), which the app answers from the core's harmonize (ADR-30), so the row and the
 * panel's degree input cannot disagree. The chord's name is written by `chordSymbol`.
 */
import { chordSymbol, type ChordSize, type Harmonizer } from '../chords';
import { getChord, type Accidentals, type ScaleNote } from '../theory';

/** The chord on one degree of the row. */
export interface HarmonizeChord {
  /** The chord as written: `Bm7b5`. */
  symbol: string;
  /** The catalog name: `Half-diminished seventh`. */
  name: string;
  /** The Roman numeral: `viø7`; empty if the harmonizer gave none. */
  numeral: string;
}

/** One degree of the row. */
export interface HarmonizeCell {
  /** 0-based index of the degree (0 = the scale's root). */
  degree: number;
  /** The scale's note on that degree. */
  note: ScaleNote;
  /** The chord on the degree, `null` for "no chord". */
  chord: HarmonizeChord | null;
}

export interface HarmonizeScale {
  /** Scale id from the catalog. */
  id: string;
  /** The scale's root as displayed (`D♭`). */
  root: string;
  /** The scale's notes, from the core, one per degree. */
  notes: ScaleNote[];
}

export function harmonizeRow(
  harmonizer: Harmonizer,
  scale: HarmonizeScale,
  size: ChordSize,
  accidentals: Accidentals,
): HarmonizeCell[] {
  return scale.notes.map((note, degree) => {
    const found = harmonizer.chordOnDegree({
      scaleId: scale.id,
      root: scale.root,
      degree,
      size,
      accidentals,
    });
    // A chord id the catalog doesn't have (a user chord just deleted) counts as no chord, as
    // in the chord panel.
    const info = found ? getChord(found.chordId) : undefined;
    const chord =
      found && info
        ? { symbol: chordSymbol(found.root, info), name: info.name, numeral: found.numeral ?? '' }
        : null;
    return { degree, note, chord };
  });
}
