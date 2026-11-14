/**
 * The user's own scales and tunings (SPEC §3.2, ADR-23, ADR-24): the documents `scales` and
 * `tunings` (`scales.toml`, `tunings.toml` in the app-data folder), in the same format as the
 * built-in catalogs. They are read once at start and handed to the core, which merges them
 * over the built-ins. A missing document means "none"; a broken item is skipped and reported,
 * and a broken file leaves the built-ins.
 *
 * The catalogs live in the WASM binding, so a component can't see when they change. Every
 * change goes through `UserCatalogs`, which bumps `revision`; components that read a catalog
 * read `revision` in the same `$derived` so they re-read it (ADR-24). The tuning editor saves
 * through `saveUserTunings`; the scale editor (#12) adds the same for scales.
 */
import { createContext } from 'svelte';
import type { Storage } from './storage';
import {
  getTuning,
  setUserScales,
  setUserTunings,
  writeTunings,
  type Tuning,
  type UserFileReport,
} from './theory';

export const USER_SCALES_DOCUMENT = 'scales';
export const USER_TUNINGS_DOCUMENT = 'tunings';
/** Where `tunings.toml` is kept before the app first rewrites a file with broken items. */
export const USER_TUNINGS_BACKUP_DOCUMENT = 'tunings-backup';

const loaders: [document: string, load: (toml: string) => UserFileReport][] = [
  [USER_SCALES_DOCUMENT, setUserScales],
  [USER_TUNINGS_DOCUMENT, setUserTunings],
];

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class UserCatalogs {
  /** Bumped after every change to the core's catalogs. Read it to re-read a catalog. */
  revision = $state(0);
  /** The user's tunings as loaded from `tunings.toml`, in file order. */
  userTunings = $state<Tuning[]>([]);
  /** Readable problems per document, `tunings.toml: tuning 2 ("bass-3"): …`. */
  private problemsBy = $state<Record<string, string[]>>({});

  /**
   * The text of `tunings.toml` as loaded, while it had items that didn't load: the first save
   * keeps it as `tunings-backup.toml`, since the app writes only the tunings it understood.
   */
  private unsavedTuningsText: string | null = null;

  constructor(private readonly storage: Storage) {}

  /** Every problem from loading or saving the user files, prefixed with the file name. */
  get problems(): string[] {
    return loaders.flatMap(([document]) => this.problemsBy[document] ?? []);
  }

  /** Loads both user documents into the core's catalogs. Never rejects. */
  async load(): Promise<void> {
    for (const [document, load] of loaders) {
      let text: string | null;
      try {
        text = await this.storage.read(document);
      } catch (error) {
        this.problemsBy[document] = [`${document}.toml could not be read: ${message(error)}`];
        continue;
      }
      const report = load(text ?? '');
      this.problemsBy[document] = report.errors.map((e) => `${document}.toml: ${e.message}`);
      if (document === USER_TUNINGS_DOCUMENT) {
        this.userTunings = tuningsOf(report);
        this.unsavedTuningsText = report.errors.length > 0 ? text : null;
      }
    }
    this.revision += 1;
  }

  /**
   * Replaces the user's tunings with `tunings`: checks them in the core, writes
   * `tunings.toml` and loads it into the catalog. Rejects with the core's message for an
   * invalid tuning, or the storage's when writing fails; either way nothing changes.
   */
  async saveUserTunings(tunings: readonly Tuning[]): Promise<void> {
    const text = writeTunings($state.snapshot(tunings) as Tuning[]);
    if (this.unsavedTuningsText !== null) {
      await this.storage.write(USER_TUNINGS_BACKUP_DOCUMENT, this.unsavedTuningsText);
      this.unsavedTuningsText = null;
      this.problemsBy[USER_TUNINGS_DOCUMENT] = [
        `${USER_TUNINGS_DOCUMENT}.toml had tunings that could not be loaded; the old file was ` +
          `kept as ${USER_TUNINGS_BACKUP_DOCUMENT}.toml.`,
      ];
    }
    await this.storage.write(USER_TUNINGS_DOCUMENT, text);
    this.userTunings = tuningsOf(setUserTunings(text));
    this.revision += 1;
  }
}

function tuningsOf(report: UserFileReport): Tuning[] {
  return report.loaded.flatMap((id) => getTuning(id) ?? []);
}

/** `getUserCatalogs()` in any component below `App`; `App` calls `setUserCatalogs()`. */
export const [getUserCatalogs, setUserCatalogs] = createContext<UserCatalogs>();
