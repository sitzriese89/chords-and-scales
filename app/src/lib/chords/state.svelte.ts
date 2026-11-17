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
  type ChordVoicing,
  type ScaleInfo,
  type ScaleNote,
} from '../theory';
import type { UserCatalogs } from '../user-catalogs.svelte';
import { chordSymbol } from './display';
import { shapePositions, type ChordOnNeck } from './overlay';
import type { ChordSize, Harmonizer } from './harmonize';

/**
 * Where the chord comes from (SPEC §5.3 input modes 1, 2 and 4). Reverse lookup (mode 3) chooses
 * its chord as root and quality, or as a typed symbol for a slash chord (`chooseChord`).
 */
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

/**
 * What the chord editor is open for (ADR-36): a new chord, starting from `intervals` (labels
 * from the root, `1` first) on `root` if given, or one of the user's chords.
 */
export type ChordEditing =
  { mode: 'new'; intervals: string[]; root?: string } | { mode: 'edit'; chord: ChordInfo };

export class ChordState {
  /** The open chord editor, `null` while it is closed. */
  editing = $state<ChordEditing | null>(null);
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

  /**
   * The reset key of the chosen voicing (ADR-37): what it belongs to, the chord, the neck and
   * the constraints. `voicing` goes back to `null` whenever this changes.
   */
  private readonly voicingResetKey = $derived.by((): string => {
    const active = this.active;
    if (!active) return '';
    const { instrument, voicings } = this.settings.current;
    const { tuning, frets, capo } = instrument;
    const { revision } = this.catalogs;
    return JSON.stringify([
      active.root,
      active.chord.id,
      active.bass,
      tuning,
      frets,
      capo,
      voicings,
      revision,
    ]);
  });

  /**
   * The voicing chosen in the voicing browser (SPEC §5.6, ADR-37): the neck shows only its
   * positions and the panel's Strum plays it. Assign it to choose one; it goes back to `null`
   * whenever `voicingResetKey` changes: the chord, the instrument, its tuning or the voicing
   * constraints.
   */
  voicing = $derived.by((): ChordVoicing | null => {
    void this.voicingResetKey;
    return null;
  });

  /** What the scale explorer draws on the neck. */
  readonly onNeck = $derived.by((): ChordOnNeck | null => {
    // Read first, also with no chord: a derived only notices a change while it is read, so
    // the chosen voicing must not survive Clear chord and come back with the same chord.
    const voicing = this.voicing;
    const active = this.active;
    return active
      ? {
          root: active.root,
          chordId: active.chord.id,
          fromScale: active.fromScale,
          bass: active.bass,
          shape: voicing ? shapePositions(voicing) : undefined,
        }
      : null;
  });

  /**
   * The chord on a degree of the current scale, over the dimmed scale, in the current size:
   * what a click in the harmonize row (SPEC §5.5) chooses.
   */
  chooseDegree(degree: number): void {
    this.mode = 'degree';
    this.degree = degree;
  }

  /**
   * A chord found by reverse lookup (SPEC §5.4, ADR-38): `root` and catalog `chordId`, over
   * `bass` for a slash chord. Without a bass it is chosen as root and quality; with one, as the
   * typed symbol the formatter writes for it (`C/E`), which the parser reads back with the bass.
   * A symbol that doesn't read back as the chord (a hand-edited user suffix) falls back to root
   * and quality, without the bass.
   */
  chooseChord(root: string, chordId: string, bass?: string | null): void {
    if (bass) {
      const symbol = chordSymbol(root, { id: chordId }, 'standard', bass);
      const parsed = parseChordSymbol(symbol);
      if (parsed.ok && parsed.chordId === chordId && parsed.bass !== undefined) {
        this.mode = 'symbol';
        this.symbol = symbol;
        return;
      }
    }
    this.mode = 'root';
    this.root = root;
    this.chordId = chordId;
  }

  /**
   * Opens the chord editor for a new chord. `intervals` (labels from the root, `1` first, e.g.
   * notes picked on the neck) preset its notes and `root` the root its neck is shown on; by
   * default only the root, on the panel's root. Saving it chooses it as root and quality.
   */
  newChord(intervals: readonly string[] = ['1'], root?: string): void {
    this.editing = { mode: 'new', intervals: [...intervals], root };
  }

  /** Opens the chord editor on one of the user's chords. */
  editChord(chord: ChordInfo): void {
    if (!chord.builtIn) this.editing = { mode: 'edit', chord };
  }

  closeEditor(): void {
    this.editing = null;
  }

  /** Back to no chord: the neck shows the scale alone. */
  clear(): void {
    this.chordId = '';
    this.degree = null;
    this.symbol = '';
  }
}

/** `getChordState()` in any component below `App`; `App` calls `setChordState()`. */
export const [getChordState, setChordState] = createContext<ChordState>();
