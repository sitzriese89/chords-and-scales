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
