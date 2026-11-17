/**
 * The notes selected on the explorer's neck for reverse lookup (ADR-38). The explorer owns one:
 * in select mode a click on the neck adds or removes a position, and everything else (the notes,
 * the bass, the chords and scales found) follows from the positions, the instrument and the
 * catalogs. The selection is not saved; it is kept while select mode is off.
 */
import { editorNeck } from '../editor';
import type { FretPosition } from '../fretboard';
import type { SettingsStore } from '../settings';
import type { UserCatalogs } from '../user-catalogs.svelte';
import {
  lookupResults,
  selectedNotes,
  type LookupNeck,
  type LookupResults,
  type SelectedNote,
} from './view';

const same = (a: FretPosition, b: FretPosition) => a.string === b.string && a.fret === b.fret;

export class NoteSelection {
  /** Select mode: neck clicks select notes instead of only playing them. */
  selecting = $state(false);
  /** The selected positions, in the order they were clicked. */
  positions = $state<FretPosition[]>([]);

  constructor(
    private readonly settings: SettingsStore,
    private readonly catalogs: UserCatalogs,
  ) {}

  /** The explorer's instrument; re-read when a user tuning changes. */
  readonly neck = $derived.by((): LookupNeck => {
    void this.catalogs.revision;
    const { tuning, frets, capo } = editorNeck(this.settings.current);
    return { tuning, frets, capo };
  });

  /** The selected notes on the current neck, lowest first: the first is the bass. */
  readonly notes = $derived.by((): SelectedNote[] =>
    selectedNotes(this.neck, this.positions, this.settings.current.accidentals),
  );

  /** What the core finds for the notes, from the current catalogs (user chords and scales too). */
  readonly results = $derived.by((): LookupResults => {
    void this.catalogs.revision;
    return lookupResults(this.notes, this.settings.current);
  });

  /** Adds `position` or, if it is selected, removes it. Returns its note when it was added. */
  toggle(position: FretPosition): SelectedNote | undefined {
    if (this.positions.some((p) => same(p, position))) {
      this.positions = this.positions.filter((p) => !same(p, position));
      return undefined;
    }
    this.positions = [...this.positions, { string: position.string, fret: position.fret }];
    return this.notes.find((note) => same(note, position));
  }

  clear(): void {
    this.positions = [];
  }
}
