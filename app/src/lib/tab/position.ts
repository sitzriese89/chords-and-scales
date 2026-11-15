/**
 * The tab view's model (ADR-25): which scale position is shown, in which order it is played,
 * and how the tab's strings are labelled. The positions themselves come from the core
 * (`fretWindow`, `threeNotesPerString`, ADR-22) in tab order; this module only picks one and
 * orders its list, so it does no music theory (AGENTS.md).
 */
import type { Direction, Settings } from '../settings';
import {
  fretWindow,
  noteParts,
  spellPitchClass,
  threeNotesPerString,
  type Accidentals,
  type NotePosition,
  type ScaleNote,
  type Tuning,
} from '../theory';

/** A 3NPS pattern the user can pick. */
export interface PatternChoice {
  /** Index of the scale degree it starts on (0 = from the root), as stored in the settings. */
  degree: number;
  /** `Pattern 1 (from G)`: numbered from 1, named by the note it starts on. */
  label: string;
}

export interface TabPosition {
  system: Settings['tab']['system'];
  /** The 3NPS patterns that fit on this neck, by degree. */
  patterns: PatternChoice[];
  /** The pattern shown (its degree), or `null` in a fret window or when none fits. */
  pattern: number | null;
  /** The position's notes in tab order (lowest string first, then by fret), from the core. */
  positions: NotePosition[];
  /** What is shown, for headings and accessible names: `Pattern 1 (from G)`, `Frets 5–8`. */
  description: string;
  /** Why the stored choice isn't shown, or why nothing is. */
  notes: string[];
}

export interface PositionInput {
  tuning: Tuning;
  frets: number;
  capo: number;
  /** The scale's notes on the root, root first (`scaleNotes`). */
  notes: ScaleNote[];
  tab: Settings['tab'];
}

/** The pattern number people see: degree 0 is pattern 1. */
export const patternNumber = (degree: number): number => degree + 1;

/** The position `input.tab` asks for, or the nearest one that exists. */
export function tabPosition({ tuning, frets, capo, notes, tab }: PositionInput): TabPosition {
  const pitchClasses = notes.map((note) => note.pitchClass);
  const root = pitchClasses[0];
  const names = new Map(notes.map((note) => [note.pitchClass, note.name]));

  if (tab.system === 'window') {
    const last = tab.windowStart + tab.windowSpan - 1;
    const positions = fretWindow(
      tuning,
      frets,
      capo,
      pitchClasses,
      root,
      tab.windowStart,
      tab.windowSpan,
    );
    const description =
      tab.windowSpan === 1 ? `Fret ${tab.windowStart}` : `Frets ${tab.windowStart}–${last}`;
    return {
      system: 'window',
      patterns: [],
      pattern: null,
      positions,
      description,
      notes:
        positions.length === 0
          ? [`No note of the scale lies in ${description.toLowerCase()}.`]
          : [],
    };
  }

  const found = threeNotesPerString(tuning, frets, capo, pitchClasses, root);
  const patterns = found.map((pattern) => ({
    degree: pattern.degree,
    label: `Pattern ${patternNumber(pattern.degree)} (from ${names.get(pattern.positions[0].pitchClass) ?? '?'})`,
  }));
  const degrees = new Set(pitchClasses).size;
  const missing = Array.from({ length: degrees }, (_, degree) => degree).filter(
    (degree) => !found.some((pattern) => pattern.degree === degree),
  );

  const result: string[] = [];
  if (found.length === 0) {
    result.push(
      'No 3-notes-per-string pattern of this scale fits between the capo and the last fret.',
    );
    return {
      system: '3nps',
      patterns,
      pattern: null,
      positions: [],
      description: 'No pattern',
      notes: result,
    };
  }
  if (missing.length > 0) {
    const list = missing.map(patternNumber).join(', ');
    result.push(
      missing.length === 1
        ? `Pattern ${list} doesn't fit between the capo and the last fret.`
        : `Patterns ${list} don't fit between the capo and the last fret.`,
    );
  }
  let shown = found.find((pattern) => pattern.degree === tab.pattern);
  if (!shown) {
    shown = found[0];
    result.push(
      tab.pattern < degrees
        ? `Showing pattern ${patternNumber(shown.degree)} instead of pattern ${patternNumber(tab.pattern)}.`
        : `This scale has no pattern ${patternNumber(tab.pattern)}; showing pattern ${patternNumber(shown.degree)}.`,
    );
  }
  return {
    system: '3nps',
    patterns,
    pattern: shown.degree,
    positions: shown.positions,
    description: patterns.find((p) => p.degree === shown.degree)!.label,
    notes: result,
  };
}

/**
 * The positions in the order they are played. Tab order (lowest string first, then by fret) is
 * ascending; descending is the reverse; both goes up and back down, playing the top note once.
 */
export function playingOrder<T>(positions: readonly T[], direction: Direction): T[] {
  const up = [...positions];
  switch (direction) {
    case 'ascending':
      return up;
    case 'descending':
      return up.reverse();
    case 'both':
      return [...up, ...up.slice(0, -1).reverse()];
  }
}

/** One line of the tab. */
export interface TabString {
  /** Fretboard string number: 1 = the highest string, drawn at the top. */
  string: number;
  /** The open string's note name by the sharp/flat preference, without octave: `E`. */
  label: string;
}

/**
 * The tab's lines, top to bottom: string 1 (the highest) first, each labelled with its open
 * note, named by the core.
 */
export function tabStrings(tuning: Tuning, accidentals: Accidentals): TabString[] {
  const count = tuning.notes.length;
  // Tunings list notes lowest string first; string 1 is the last of them (ADR-21).
  return Array.from({ length: count }, (_, i) => ({
    string: i + 1,
    label: spellPitchClass(noteParts(tuning.notes[count - 1 - i]).pitchClass, accidentals),
  }));
}
