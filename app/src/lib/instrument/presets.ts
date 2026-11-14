/**
 * What the instrument panel offers (ADR-24): the tunings of the current catalog for one
 * string count, and the tuning a string count starts on. Only lookups in the core's catalog;
 * the tunings themselves are checked by the core.
 */
import type { InstrumentKind } from '../settings';
import { listTunings, type Tuning } from '../theory';

/** A tuning in the editor, before it has an id. */
export interface TuningDraft {
  name: string;
  kind: InstrumentKind;
  /** Open strings as MIDI numbers, lowest string first. */
  notes: number[];
}

/** The catalog's tunings with `strings` strings, built-ins first, in catalog order. */
export function tuningsWithStrings(strings: number): Tuning[] {
  return listTunings().filter((tuning) => tuning.notes.length === strings);
}

/**
 * The tuning to switch to when the string count changes to `strings`: that count's standard
 * preset for the current `kind` (`bass-5-standard`), else its standard preset for the other
 * kind (four strings on a guitar give `bass-4-standard`), else the first tuning with that
 * many strings. Built-in ids are `<kind>-<strings>-<name>` (ADR-21).
 */
export function standardTuning(strings: number, kind: InstrumentKind): Tuning | undefined {
  const tunings = tuningsWithStrings(strings);
  return (
    tunings.find((t) => t.id === `${kind}-${strings}-standard`) ??
    tunings.find((t) => t.id.endsWith(`-${strings}-standard`)) ??
    tunings[0]
  );
}
