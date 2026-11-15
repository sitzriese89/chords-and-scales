import type { ChordInfo } from '../theory';

/**
 * How a chord is written: its root and the catalog's suffix as stored (`Gm7b5`, `Dmaj7`).
 * Every place that shows a chord's name goes through here, so that the symbol formatter and
 * the display style (M2.2, M2.6) replace it in one spot.
 */
export function chordSymbol(root: string, chord: Pick<ChordInfo, 'symbol'>): string {
  return `${root}${chord.symbol}`;
}
