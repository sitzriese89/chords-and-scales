import { instrumentTuning } from '../instrument/tuning';
import type { Settings } from '../settings';
import type { Neck } from './intervals';

/**
 * The neck an editor shows: the current instrument (tuning, frets, capo, left-handed), with the
 * default tuning if the stored one is gone. Read the catalogs' `revision` with it, since a
 * user tuning can change.
 */
export function editorNeck(settings: Settings): Neck {
  const { instrument, leftHanded } = settings;
  const tuning = instrumentTuning(instrument);
  return { tuning, frets: instrument.frets, capo: instrument.capo, leftHanded };
}
