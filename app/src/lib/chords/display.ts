import type { ChordSymbolStyle } from '../settings';
import { formatChordSymbol, type ChordInfo } from '../theory';

/**
 * How a chord is written: `Gm7♭5` in the Standard style, `Gø` in the Jazz one (SPEC §4.4,
 * ADR-33). Every place that shows a chord's name goes through here, with the style from the
 * settings (`settings.current.chordSymbols`), so switching the style renames every chord on
 * screen. The text comes from the core's formatter: the root as given, the suffix for the
 * style, and `/bass` for a slash chord.
 */
export function chordSymbol(
  root: string,
  chord: Pick<ChordInfo, 'id'>,
  style: ChordSymbolStyle,
  bass?: string,
): string {
  return formatChordSymbol(root, chord.id, bass, style);
}
