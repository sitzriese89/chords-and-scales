import { DEFAULT_SETTINGS, type Settings } from '../settings';
import { getTuning, type Tuning } from '../theory';

/**
 * The tuning the instrument plays: the stored one from the catalog, or the default tuning if
 * the stored one is gone (a deleted user tuning, ADR-24). Read the catalogs' `revision` with
 * it, since a user tuning can change. Fell back when the result's id is not the stored one.
 */
export function instrumentTuning(instrument: Pick<Settings['instrument'], 'tuning'>): Tuning {
  return getTuning(instrument.tuning) ?? getTuning(DEFAULT_SETTINGS.instrument.tuning)!;
}

/**
 * The toolbar's one-line summary of the neck (ADR-51): "6-string guitar · Standard · 24 frets",
 * then "· capo 2" with a capo. Strings and kind are the tuning's, as the instrument panel shows
 * them. Read the catalogs' `revision` with it, like `instrumentTuning`.
 */
export function instrumentSummary(instrument: Settings['instrument']): string {
  const tuning = instrumentTuning(instrument);
  const parts = [`${tuning.notes.length}-string ${tuning.kind}`, tuning.name];
  parts.push(`${instrument.frets} frets`);
  if (instrument.capo > 0) parts.push(`capo ${instrument.capo}`);
  return parts.join(' · ');
}
