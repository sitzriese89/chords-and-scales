/**
 * The user's own scales, chords and tunings (SPEC §3.2, ADR-23, ADR-24, ADR-26, ADR-36): the
 * documents `scales`, `chords` and `tunings` (`scales.toml`, `chords.toml`, `tunings.toml` in
 * the app-data folder), in the same format as the built-in catalogs. They are read once at
 * start and handed to the core, which merges them over the built-ins. A missing document means
 * "none"; a broken item is skipped and reported, and a broken file leaves the built-ins.
 *
 * The catalogs live in the WASM binding, so a component can't see when they change. Every
 * change goes through `UserCatalogs`, which bumps `revision`; components that read a catalog
 * read `revision` in the same `$derived` so they re-read it (ADR-24). The tuning editor saves
 * through `saveUserTunings`, the scale editor through `saveUserScales` and the chord editor
 * through `saveUserChords`; all write only what the core checked and wrote.
 */
import { createContext } from 'svelte';
import type { Storage } from './storage';
import {
  getChord,
  getScale,
  getTuning,
  setUserChords,
  setUserScales,
  setUserTunings,
  writeChords,
  writeScales,
  writeTunings,
  type ChordInfo,
  type ChordInput,
  type ScaleInfo,
  type ScaleInput,
  type Tuning,
} from './theory';

export const USER_SCALES_DOCUMENT = 'scales';
export const USER_CHORDS_DOCUMENT = 'chords';
export const USER_TUNINGS_DOCUMENT = 'tunings';
/** Where `scales.toml` is kept before the app first rewrites a file with broken items. */
export const USER_SCALES_BACKUP_DOCUMENT = 'scales-backup';
/** Where `chords.toml` is kept before the app first rewrites a file with broken items. */
export const USER_CHORDS_BACKUP_DOCUMENT = 'chords-backup';
/** Where `tunings.toml` is kept before the app first rewrites a file with broken items. */
export const USER_TUNINGS_BACKUP_DOCUMENT = 'tunings-backup';

type Kind = 'scales' | 'chords' | 'tunings';

interface UserDocument {
  name: string;
  backup: string;
  /** Hands the document's text to the core's catalog. */
  load: typeof setUserScales;
  /** Keeps the items the core loaded (by id) as the user's items of this kind. */
  keep: (catalogs: UserCatalogs, loaded: string[]) => void;
}

const documents: Record<Kind, UserDocument> = {
  scales: {
    name: USER_SCALES_DOCUMENT,
    backup: USER_SCALES_BACKUP_DOCUMENT,
    load: setUserScales,
    keep: (catalogs, loaded) => (catalogs.userScales = loaded.flatMap((id) => getScale(id) ?? [])),
  },
  chords: {
    name: USER_CHORDS_DOCUMENT,
    backup: USER_CHORDS_BACKUP_DOCUMENT,
    load: setUserChords,
    keep: (catalogs, loaded) => (catalogs.userChords = loaded.flatMap((id) => getChord(id) ?? [])),
  },
  tunings: {
    name: USER_TUNINGS_DOCUMENT,
    backup: USER_TUNINGS_BACKUP_DOCUMENT,
    load: setUserTunings,
    keep: (catalogs, loaded) =>
      (catalogs.userTunings = loaded.flatMap((id) => getTuning(id) ?? [])),
  },
};
const kinds: Kind[] = ['scales', 'chords', 'tunings'];

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class UserCatalogs {
  /** Bumped after every change to the core's catalogs. Read it to re-read a catalog. */
  revision = $state(0);
  /** The user's scales as loaded from `scales.toml`, in file order. */
  userScales = $state<ScaleInfo[]>([]);
  /** The user's chords as loaded from `chords.toml`, in file order. */
  userChords = $state<ChordInfo[]>([]);
  /** The user's tunings as loaded from `tunings.toml`, in file order. */
  userTunings = $state<Tuning[]>([]);
  /** Readable problems per document, `tunings.toml: tuning 2 ("bass-3"): …`. */
  private problemsBy = $state<Record<string, string[]>>({});

  /**
   * The text of a document as loaded, while it had items that didn't load: the first save
   * keeps it as `<name>-backup.toml`, since the app writes only the items it understood.
   */
  private unsavedText: Partial<Record<Kind, string>> = {};

  constructor(private readonly storage: Storage) {}

  /** Every problem from loading or saving the user files, prefixed with the file name. */
  get problems(): string[] {
    return kinds.flatMap((kind) => this.problemsBy[documents[kind].name] ?? []);
  }

  /** Loads the user documents into the core's catalogs. Never rejects. */
  async load(): Promise<void> {
    for (const kind of kinds) {
      const { name, load, keep } = documents[kind];
      let text: string | null;
      try {
        text = await this.storage.read(name);
      } catch (error) {
        this.problemsBy[name] = [`${name}.toml could not be read: ${message(error)}`];
        continue;
      }
      const report = load(text ?? '');
      this.problemsBy[name] = report.errors.map((e) => `${name}.toml: ${e.message}`);
      keep(this, report.loaded);
      if (report.errors.length > 0 && text !== null) this.unsavedText[kind] = text;
      else delete this.unsavedText[kind];
    }
    this.revision += 1;
  }

  /**
   * Replaces the user's scales with `scales`: checks them in the core (which also refuses a
   * duplicate id or name), writes `scales.toml` and loads it into the catalog. Rejects with
   * the core's message for an invalid scale, or the storage's when writing fails; either way
   * nothing changes.
   */
  async saveUserScales(scales: readonly ScaleInput[]): Promise<void> {
    await this.save('scales', writeScales($state.snapshot(scales) as ScaleInput[]));
  }

  /**
   * Replaces the user's chords with `chords`: checks them in the core (which also refuses a
   * duplicate id, name or suffix, and a suffix it can't read back), writes `chords.toml` and
   * loads it into the catalog. Rejects with the core's message for an invalid chord, or the
   * storage's when writing fails; either way nothing changes.
   */
  async saveUserChords(chords: readonly ChordInput[]): Promise<void> {
    await this.save('chords', writeChords($state.snapshot(chords) as ChordInput[]));
  }

  /**
   * Replaces the user's tunings with `tunings`: checks them in the core, writes
   * `tunings.toml` and loads it into the catalog. Rejects with the core's message for an
   * invalid tuning, or the storage's when writing fails; either way nothing changes.
   */
  async saveUserTunings(tunings: readonly Tuning[]): Promise<void> {
    await this.save('tunings', writeTunings($state.snapshot(tunings) as Tuning[]));
  }

  /** Writes `text` (made by the core) as the user's document of `kind` and loads it. */
  private async save(kind: Kind, text: string): Promise<void> {
    const { name, backup, load, keep } = documents[kind];
    const old = this.unsavedText[kind];
    if (old !== undefined) {
      await this.storage.write(backup, old);
      delete this.unsavedText[kind];
      this.problemsBy[name] = [
        `${name}.toml had ${kind} that could not be loaded; the old file was kept as ` +
          `${backup}.toml.`,
      ];
    }
    await this.storage.write(name, text);
    keep(this, load(text).loaded);
    this.revision += 1;
  }
}

/** `getUserCatalogs()` in any component below `App`; `App` calls `setUserCatalogs()`. */
export const [getUserCatalogs, setUserCatalogs] = createContext<UserCatalogs>();
