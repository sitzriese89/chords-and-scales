/**
 * Whether the scale editor is open, and for what (ADR-26, ADR-38). The scale picker shows the
 * editor's dialog while `editing` is set; anything can open it, as `ChordState.newChord` opens
 * the chord editor (ADR-36): the picker's **New scale** and **Edit scale**, and reverse lookup's
 * **Save as scale** with the selected notes.
 */
import { createContext } from 'svelte';
import type { ScaleInfo } from '../theory';

/**
 * What the scale editor is open for: a new scale, starting from `intervals` (labels from the
 * root, `1` first) on `root` if given (else the explorer's root), or one of the user's scales.
 */
export type ScaleEditing =
  { mode: 'new'; intervals: string[]; root?: string } | { mode: 'edit'; scale: ScaleInfo };

export class ScaleEditorState {
  /** The open scale editor, `null` while it is closed. */
  editing = $state<ScaleEditing | null>(null);

  /**
   * Opens the scale editor for a new scale. `intervals` preset its notes and `root` the root it
   * is shown on; by default only the root, on the explorer's root. Saving it shows it in the
   * explorer, on that root.
   */
  newScale(intervals: readonly string[] = ['1'], root?: string): void {
    this.editing = { mode: 'new', intervals: [...intervals], root };
  }

  /** Opens the scale editor on one of the user's scales. */
  editScale(scale: ScaleInfo): void {
    if (!scale.builtIn) this.editing = { mode: 'edit', scale };
  }

  close(): void {
    this.editing = null;
  }
}

/** `getScaleEditor()` in any component below `App`; `App` calls `setScaleEditor()`. */
export const [getScaleEditor, setScaleEditor] = createContext<ScaleEditorState>();
