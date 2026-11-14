import { createContext } from 'svelte';
import type { Storage } from '../storage';
import { defaultSettings, parseSettings, serializeSettings, type Settings } from './schema';

/** The stored document holding the settings: `settings.toml` in the app-data folder. */
export const SETTINGS_DOCUMENT = 'settings';
/** Where an unusable settings file is kept before defaults replace it. */
export const SETTINGS_BACKUP_DOCUMENT = 'settings-backup';

/** A change to some settings; nested groups can be changed partly. */
export type SettingsChange = Partial<Omit<Settings, 'instrument' | 'lastView'>> & {
  instrument?: Partial<Settings['instrument']>;
  lastView?: Partial<Settings['lastView']>;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The app's settings, loaded once at start and saved on every change (ADR-17). Components get
 * it with `getSettings()`; read `settings.current`, change it with `settings.update(...)`.
 *
 * Loading never fails: a missing file becomes a file with the defaults, a file with some bad
 * values keeps the good ones, and an unusable file (not TOML, unknown version) is kept as
 * `settings-backup.toml` and replaced by the defaults. Anything but a clean load sets
 * `warning`, which the app shows until dismissed.
 */
export class SettingsStore {
  current = $state<Settings>(defaultSettings());
  warning = $state<string | null>(null);
  loaded = $state(false);

  /** Saves run one after another, so the last change always wins on disk. */
  private saving: Promise<void> = Promise.resolve();

  constructor(private readonly storage: Storage) {}

  async load(): Promise<void> {
    try {
      const text = await this.storage.read(SETTINGS_DOCUMENT);
      if (text === null) {
        await this.storage.write(SETTINGS_DOCUMENT, serializeSettings(this.current));
        return;
      }
      const parsed = parseSettings(text);
      if (parsed.ok) {
        this.current = parsed.settings;
        if (parsed.problems.length > 0) {
          this.warning =
            `Some settings in ${SETTINGS_DOCUMENT}.toml were not understood and use their ` +
            `defaults: ${parsed.problems.join('; ')}.`;
        }
        return;
      }
      this.current = defaultSettings();
      await this.storage.write(SETTINGS_BACKUP_DOCUMENT, text);
      await this.storage.write(SETTINGS_DOCUMENT, serializeSettings(this.current));
      this.warning =
        `${SETTINGS_DOCUMENT}.toml could not be used because ${parsed.reason}, so the ` +
        `default settings are in use. ` +
        `The old file was kept as ${SETTINGS_BACKUP_DOCUMENT}.toml.`;
    } catch (error) {
      this.warning = `Settings could not be loaded, so the defaults are in use: ${message(error)}`;
    } finally {
      this.loaded = true;
    }
  }

  /**
   * Applies `change` and saves. Rejects a change the settings file couldn't hold (an out-of-
   * range fret count, say) without applying it, so what is saved always loads back the same.
   */
  update(change: SettingsChange): Promise<void> {
    const next: Settings = {
      ...this.current,
      ...change,
      instrument: { ...this.current.instrument, ...change.instrument },
      lastView: { ...this.current.lastView, ...change.lastView },
    };
    const text = serializeSettings(next);
    const check = parseSettings(text);
    if (!check.ok || check.problems.length > 0) {
      const problems = check.ok ? check.problems.join('; ') : check.reason;
      return Promise.reject(new RangeError(`invalid settings change: ${problems}`));
    }
    this.current = check.settings;
    this.saving = this.saving.then(() =>
      this.storage.write(SETTINGS_DOCUMENT, text).catch((error) => {
        this.warning = `Settings could not be saved: ${message(error)}`;
      }),
    );
    return this.saving;
  }

  dismissWarning(): void {
    this.warning = null;
  }
}

/** `getSettings()` in any component below `App`; `App` calls `setSettings()`. */
export const [getSettings, setSettings] = createContext<SettingsStore>();
