/**
 * The chord chosen in the chord panel, shared with the scale explorer's neck (ADR-32).
 *
 * The panel writes the inputs (`mode`, `root`, `chordId`, `degree`, `size`, `symbol`); `active`
 * is the chord they come to, with its root and catalog entry, or `null` while nothing is chosen.
 * In degree mode the chord follows the explorer's scale: change the scale and it is looked up
 * again. A typed symbol is read by the core's parser (ADR-29, ADR-33). Nothing here is theory: the
 * chord on a degree comes from the `Harmonizer` seam, the rest from the catalogs and the core.
 */
import { createContext } from 'svelte';
import { displayRoot, resolveScale } from '../explorer/view';
import type { SettingsStore } from '../settings';
import {
  getChord,
  parseChordSymbol,
  scaleNotes,
  type ChordInfo,
  type ScaleInfo,
  type ScaleNote,
} from '../theory';
import type { UserCatalogs } from '../user-catalogs.svelte';
import type { ChordOnNeck } from './overlay';
import type { ChordSize, Harmonizer } from './harmonize';

/** Where the chord comes from (SPEC §5.3 input modes 1, 2 and 4). */
export type ChordMode = 'root' | 'degree' | 'symbol';

/** Why the typed symbol could not be read. */
export interface SymbolProblem {
  /** 0-based index, in characters (code points), of the first character that could not be read. */
  position: number;
  message: string;
}

/** The chord the inputs come to. */
export interface ActiveChord {
  /** The chord's root as displayed (`G`, `D♭`). */
  root: string;
  chord: ChordInfo;
  /** From a degree of the current scale: the scale is drawn dimmed behind it. */
  fromScale: boolean;
  /** The Roman numeral the harmonizer gave, if any. */
  numeral?: string;
  /** The bass of a typed slash chord, as typed (Unicode): `E` in `Am7/E`. */
  bass?: string;
}

export class ChordState {
  mode = $state<ChordMode>('root');
  /** Root and quality input: the root as picked. */
  root = $state('C');
  /** Root and quality input: the chord id, `''` while no quality is picked. */
  chordId = $state('');
  /** Degree input: 0-based degree of the current scale, `null` while none is picked. */
  degree = $state<number | null>(null);
  size = $state<ChordSize>('triads');
  /** Symbol input: the text as typed (`F#m7b5`). */
  symbol = $state('');

  constructor(
    private readonly settings: SettingsStore,
    /** Where chords on a degree come from (`harmonize.ts`); `null` turns the degree input off. */
    readonly harmonizer: Harmonizer | null,
    private readonly catalogs: UserCatalogs,
  ) {}

  /** The scale the degree input counts in: the explorer's. Read again after catalog changes. */
  readonly scale = $derived.by((): { root: string; info: ScaleInfo; notes: ScaleNote[] } => {
    void this.catalogs.revision;
    const { root, scale } = resolveScale(this.settings.current);
    return {
      root,
      info: scale,
      notes: scaleNotes(scale.id, root, this.settings.current.accidentals),
    };
  });

  /** The harmonizer's answer for the picked degree. */
  private readonly onDegree = $derived.by(() => {
    const degree = this.degree;
    if (this.mode !== 'degree' || degree === null || !this.harmonizer) return undefined;
    if (degree >= this.scale.notes.length) return undefined;
    return this.harmonizer.chordOnDegree({
      scaleId: this.scale.info.id,
      root: this.scale.root,
      degree,
      size: this.size,
      accidentals: this.settings.current.accidentals,
    });
  });

  /** The core's reading of the typed symbol, against the current catalogs (user chords too). */
  private readonly parsed = $derived.by(() => {
    void this.catalogs.revision;
    return this.mode === 'symbol' ? parseChordSymbol(this.symbol) : undefined;
  });

  readonly active = $derived.by((): ActiveChord | null => {
    void this.catalogs.revision;
    if (this.mode === 'symbol') {
      const parsed = this.parsed;
      const chord = parsed?.ok ? getChord(parsed.chordId) : undefined;
      if (!parsed?.ok || !chord) return null;
      return { root: parsed.root, chord, fromScale: false, bass: parsed.bass };
    }
    if (this.mode === 'root') {
      const chord = this.chordId ? getChord(this.chordId) : undefined;
      const root = displayRoot(this.root);
      return chord && root ? { root, chord, fromScale: false } : null;
    }
    const found = this.onDegree;
    const chord = found ? getChord(found.chordId) : undefined;
    return found && chord
      ? { root: found.root, chord, fromScale: true, numeral: found.numeral }
      : null;
  });

  /** Where and why the typed symbol could not be read; `null` while the field is blank. */
  readonly symbolProblem = $derived.by((): SymbolProblem | null => {
    const parsed = this.parsed;
    if (!parsed || parsed.ok || this.symbol.trim() === '') return null;
    return { position: parsed.position, message: parsed.message };
  });

  /** Why degree mode shows no chord although a degree is picked. */
  readonly problem = $derived.by((): string | null => {
    if (this.mode !== 'degree' || this.degree === null || !this.harmonizer) return null;
    if (this.active) return null;
    return `No ${this.size === 'sevenths' ? '7th ' : ''}chord forms on degree ${this.degree + 1} of ${this.scale.root} ${this.scale.info.name}.`;
  });

  /** What the scale explorer draws on the neck. */
  readonly onNeck = $derived.by((): ChordOnNeck | null => {
    const active = this.active;
    return active
      ? {
          root: active.root,
          chordId: active.chord.id,
          fromScale: active.fromScale,
          bass: active.bass,
        }
      : null;
  });

  /** Back to no chord: the neck shows the scale alone. */
  clear(): void {
    this.chordId = '';
    this.degree = null;
    this.symbol = '';
  }
}

/** `getChordState()` in any component below `App`; `App` calls `setChordState()`. */
export const [getChordState, setChordState] = createContext<ChordState>();
