/**
 * A stand-in for the harmonize core (M2.3) in tests: the chords of C major, written out by
 * hand. It answers only for C major; any other scale or root has no chord.
 */
import type { DegreeChord, Harmonizer } from './harmonize';

const TRIADS: DegreeChord[] = [
  { root: 'C', chordId: 'major', numeral: 'I' },
  { root: 'D', chordId: 'minor', numeral: 'ii' },
  { root: 'E', chordId: 'minor', numeral: 'iii' },
  { root: 'F', chordId: 'major', numeral: 'IV' },
  { root: 'G', chordId: 'major', numeral: 'V' },
  { root: 'A', chordId: 'minor', numeral: 'vi' },
  { root: 'B', chordId: 'dim', numeral: 'vii°' },
];

const SEVENTHS: DegreeChord[] = [
  { root: 'C', chordId: 'maj7', numeral: 'Imaj7' },
  { root: 'D', chordId: 'min7', numeral: 'ii7' },
  { root: 'E', chordId: 'min7', numeral: 'iii7' },
  { root: 'F', chordId: 'maj7', numeral: 'IVmaj7' },
  { root: 'G', chordId: 'dom7', numeral: 'V7' },
  { root: 'A', chordId: 'min7', numeral: 'vi7' },
  { root: 'B', chordId: 'min7b5', numeral: 'viiø7' },
];

export const cMajorHarmonizer: Harmonizer = {
  chordOnDegree({ scaleId, root, degree, size }) {
    if (scaleId !== 'major' || root !== 'C') return undefined;
    return (size === 'sevenths' ? SEVENTHS : TRIADS)[degree];
  },
};
