import { createContext } from 'svelte';
import type { Storage } from '../storage';
import {
  emptySheet,
  MAX_SHEET_TITLE,
  parseSheet,
  serializeSheet,
  type Sheet,
  type SheetItem,
  type SheetScheme,
} from './schema';

/** The stored document holding the export sheet: `sheet.toml` in the app-data folder. */
export const SHEET_DOCUMENT = 'sheet';
/** Where an unusable sheet file is kept before an empty sheet replaces it. */
export const SHEET_BACKUP_DOCUMENT = 'sheet-backup';

/** An item with a key that stays the same while it is moved, for keyed lists. */
export interface KeyedItem {
  key: number;
  item: SheetItem;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The export sheet (SPEC §5.10, ADR-43), loaded once at start and saved on every change, like
 * the settings (ADR-17). Components get it with `getSheet()`.
 *
 * Loading never fails: a missing file is an empty sheet (written on the first change), a file
 * with bad items keeps the others, and an unusable file (not TOML, unknown version) is kept as
 * `sheet-backup.toml` and replaced by an empty sheet. Anything but a clean load sets
 * `warning`, which the sheet view shows until dismissed.
 */
export class SheetStore {
  title = $state(emptySheet().title);
  themeId = $state(emptySheet().themeId);
  scheme = $state<SheetScheme>(emptySheet().scheme);
  items = $state<KeyedItem[]>([]);
  warning = $state<string | null>(null);

  private nextKey = 1;
  /** Saves run one after another, so the last change always wins on disk. */
  private saving: Promise<void> = Promise.resolve();

  constructor(private readonly storage: Storage) {}

  /** The sheet as stored. */
  get sheet(): Sheet {
    return {
      title: this.title,
      themeId: this.themeId,
      scheme: this.scheme,
      items: this.items.map((entry) => $state.snapshot(entry.item) as SheetItem),
    };
  }

  private show(sheet: Sheet): void {
    this.title = sheet.title;
    this.themeId = sheet.themeId;
    this.scheme = sheet.scheme;
    this.items = sheet.items.map((item) => ({ key: this.nextKey++, item }));
  }

  async load(): Promise<void> {
    try {
      const text = await this.storage.read(SHEET_DOCUMENT);
      if (text === null) return;
      const parsed = parseSheet(text);
      if (parsed.ok) {
        this.show(parsed.sheet);
        if (parsed.problems.length > 0) {
          this.warning =
            `Some of ${SHEET_DOCUMENT}.toml was not understood: ` +
            `${parsed.problems.join('; ')}.`;
        }
        return;
      }
      this.show(emptySheet());
      await this.storage.write(SHEET_BACKUP_DOCUMENT, text);
      await this.storage.write(SHEET_DOCUMENT, serializeSheet(this.sheet));
      this.warning =
        `${SHEET_DOCUMENT}.toml could not be used because ${parsed.reason}, so the sheet ` +
        `starts empty. The old file was kept as ${SHEET_BACKUP_DOCUMENT}.toml.`;
    } catch (error) {
      this.warning = `The sheet could not be loaded: ${message(error)}`;
    }
  }

  private save(): Promise<void> {
    const text = serializeSheet(this.sheet);
    this.saving = this.saving.then(() =>
      this.storage.write(SHEET_DOCUMENT, text).catch((error) => {
        this.warning = `The sheet could not be saved: ${message(error)}`;
      }),
    );
    return this.saving;
  }

  /** Adds `item` at the end. */
  add(item: SheetItem): Promise<void> {
    this.items = [...this.items, { key: this.nextKey++, item: structuredClone(item) }];
    return this.save();
  }

  remove(key: number): Promise<void> {
    this.items = this.items.filter((entry) => entry.key !== key);
    return this.save();
  }

  /** Moves the item `by` places (-1 up, 1 down); past either end it stays. */
  move(key: number, by: number): Promise<void> {
    const from = this.items.findIndex((entry) => entry.key === key);
    const to = from + by;
    if (from < 0 || to < 0 || to >= this.items.length) return this.saving;
    const items = [...this.items];
    const [entry] = items.splice(from, 1);
    items.splice(to, 0, entry);
    this.items = items;
    return this.save();
  }

  /** Sets the title; a blank one is the default title, a long one is cut. */
  setTitle(title: string): Promise<void> {
    const trimmed = title.trim().slice(0, MAX_SHEET_TITLE);
    this.title = trimmed === '' ? emptySheet().title : trimmed;
    return this.save();
  }

  setTheme(change: { themeId?: string; scheme?: SheetScheme }): Promise<void> {
    if (change.themeId !== undefined) this.themeId = change.themeId;
    if (change.scheme !== undefined) this.scheme = change.scheme;
    return this.save();
  }

  dismissWarning(): void {
    this.warning = null;
  }
}

/** `getSheet()` in any component below `App`; `App` calls `setSheet()`. */
export const [getSheet, setSheet] = createContext<SheetStore>();
