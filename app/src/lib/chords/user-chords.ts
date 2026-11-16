/**
 * The custom chord editor's form state (ADR-36): an interval-set draft (ADR-26) plus the chord's
 * symbols, and how a draft becomes the `ChordInput` the core checks and writes. Nothing here is
 * checked: the core refuses what isn't a chord, and the editor shows its message.
 */
import type { IntervalSetDraft } from '../editor';
import type { ChordInfo, ChordInput } from '../theory';

/** What the chord editor edits and saves. */
export interface ChordDraft extends IntervalSetDraft {
  /** The suffix after the root, as stored (ASCII): `m7b5`. */
  symbol: string;
  /** The suffix in the Jazz style; blank when it is the symbol. */
  jazzSymbol: string;
}

/** A new chord's draft: no name, no symbol, the given intervals (the root alone by default). */
export function newDraft(intervals: readonly string[] = ['1']): ChordDraft {
  return { name: '', family: '', intervals: [...intervals], symbol: '', jazzSymbol: '' };
}

/** The draft of a chord to edit. Its Jazz symbol is blank when it has no special one. */
export function draftOf(chord: ChordInfo): ChordDraft {
  return {
    name: chord.name,
    family: chord.family,
    intervals: [...chord.intervals],
    symbol: chord.symbol,
    jazzSymbol: chord.jazzSymbol === chord.symbol ? '' : chord.jazzSymbol,
  };
}

/** The chord to save with `id` from a draft; a blank family or Jazz symbol means none. */
export function chordInput(
  id: string,
  draft: ChordDraft,
  aliases: readonly string[] = [],
): ChordInput {
  return {
    id,
    name: draft.name,
    symbol: draft.symbol,
    aliases: [...aliases],
    jazzSymbol: draft.jazzSymbol === '' ? undefined : draft.jazzSymbol,
    family: draft.family === '' ? undefined : draft.family,
    intervals: draft.intervals,
  };
}
