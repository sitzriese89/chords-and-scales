/**
 * The chord on the neck (SPEC §5.3): where its tones are, and, for a chord that comes from
 * the current scale, the scale behind it dimmed. Positions come from the core's fretboard
 * mapping; this only decides how each one is drawn.
 */
import type { FretboardDot } from '../fretboard';
import type { LabelMode } from '../settings';
import {
  fretboardPositions,
  type ChordNote,
  type NotePosition,
  type ScaleNote,
  type Tuning,
} from '../theory';

/** A chord to show on the neck: what `explorerView` needs to draw it. */
export interface ChordOnNeck {
  /** The chord's root as displayed (`G`, `D♭`). */
  root: string;
  /** Chord id from the catalog. */
  chordId: string;
  /** The chord comes from the current scale, so the scale is drawn dimmed behind it. */
  fromScale: boolean;
  /**
   * The bass of a typed slash chord, written in the chord's name; the neck shows the chord's
   * own tones (ADR-33).
   */
  bass?: string;
}

export interface ChordOverlayInput {
  tuning: Tuning;
  frets: number;
  capo: number;
  labels: LabelMode;
  /** The chord's notes, root first (`chordNotes`). */
  chord: readonly ChordNote[];
  /** The scale the chord comes from, drawn dimmed behind it; `null` shows the chord alone. */
  scale: readonly ScaleNote[] | null;
}

export interface ChordOverlay {
  /**
   * One dot per position: the chord's tones (the root a square, the others circles) and, when
   * there is a scale, its other notes as `dim`.
   */
  dots: FretboardDot[];
  /** The positions the dots stand on, with their pitches. */
  positions: NotePosition[];
}

/**
 * Chord tones are labelled with the chord's own names or intervals (`♭7` of G7, not of C).
 * The dimmed scale notes carry their name and no interval: it would be measured from another
 * root.
 */
export function chordOverlay(input: ChordOverlayInput): ChordOverlay {
  const { tuning, frets, capo, labels, chord, scale } = input;
  const chordByPitchClass = new Map<number, ChordNote>();
  for (const note of chord) {
    if (!chordByPitchClass.has(note.pitchClass)) chordByPitchClass.set(note.pitchClass, note);
  }
  const scaleByPitchClass = new Map<number, ScaleNote>();
  for (const note of scale ?? []) scaleByPitchClass.set(note.pitchClass, note);

  const rootPitchClass = chord[0].pitchClass;
  const pitchClasses = [...new Set([...chordByPitchClass.keys(), ...scaleByPitchClass.keys()])];
  const positions = fretboardPositions(tuning, frets, capo, pitchClasses, rootPitchClass);

  const dots: FretboardDot[] = positions.map((p) => {
    const tone = chordByPitchClass.get(p.pitchClass);
    let label = '';
    if (labels === 'notes') label = (tone ?? scaleByPitchClass.get(p.pitchClass))?.name ?? '';
    else if (labels === 'intervals') label = tone?.interval ?? '';
    return {
      string: p.string,
      fret: p.fret,
      label,
      role: !tone ? 'dim' : p.pitchClass === rootPitchClass ? 'root' : 'tone',
      degree: p.degree,
    };
  });
  return { dots, positions };
}
