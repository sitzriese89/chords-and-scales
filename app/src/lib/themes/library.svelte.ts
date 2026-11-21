/**
 * The themes on offer (ADR-40): the built-ins and the user's theme files. A user theme is the
 * CSS document `theme-<id>.css` (the file `theme-<id>.css` in the app-data folder, or its
 * localStorage entry in the browser), read through `Storage` at start like the user catalogs.
 *
 * A file that isn't a theme file is left out and reported. A theme with missing tokens gets
 * the Default theme's values for them; one that misses a contrast rule is offered as written.
 * Both are reported in `problems`. A user theme whose id is a built-in's replaces it.
 */
import { createContext } from 'svelte';
import { CSS_EXTENSION, type Storage } from '../storage';
import { BUILT_IN_THEMES, DEFAULT_THEME } from './builtin';
import { buildTheme, parseThemeFile, type Theme } from './theme';

/** User theme documents are named `theme-<id>.css`. */
export const THEME_DOCUMENT_PREFIX = 'theme-';

/** The theme id a document holds, or `null` if it isn't a theme document. */
export function themeIdOf(document: string): string | null {
  if (!document.startsWith(THEME_DOCUMENT_PREFIX) || !document.endsWith(CSS_EXTENSION)) {
    return null;
  }
  const id = document.slice(THEME_DOCUMENT_PREFIX.length, -CSS_EXTENSION.length);
  return id.length > 0 ? id : null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ThemeLibrary {
  /** The user's themes, sorted by document name. */
  userThemes = $state<Theme[]>([]);
  /** Files that couldn't be used at all, as readable sentences. */
  private fileProblems = $state<string[]>([]);

  constructor(private readonly storage: Storage) {}

  /** The built-ins the user hasn't replaced, in their fixed order. */
  get builtIn(): Theme[] {
    return BUILT_IN_THEMES.filter((t) => !this.userThemes.some((mine) => mine.id === t.id));
  }

  /** Every theme on offer: built-ins first, then the user's. */
  get themes(): Theme[] {
    return [...this.builtIn, ...this.userThemes];
  }

  /** The theme with `id`, or the Default theme if there is none (a deleted file, a typo). */
  get(id: string): Theme {
    return this.themes.find((t) => t.id === id) ?? DEFAULT_THEME;
  }

  /**
   * Everything wrong with the user's theme files, prefixed with the file name: files left out,
   * then each loaded theme's warnings.
   */
  get problems(): string[] {
    return [
      ...this.fileProblems,
      ...this.userThemes.flatMap((t) => t.problems.map((p) => `${t.document}: ${p}`)),
    ];
  }

  /** Reads every `theme-*.css` document. Never rejects. */
  async load(): Promise<void> {
    const themes: Theme[] = [];
    const problems: string[] = [];
    let documents: string[];
    try {
      documents = await this.storage.list();
    } catch (error) {
      this.fileProblems = [`Theme files could not be listed: ${message(error)}`];
      return;
    }
    for (const document of documents) {
      const id = themeIdOf(document);
      if (id === null) continue;
      let text: string | null;
      try {
        text = await this.storage.read(document);
      } catch (error) {
        problems.push(`${document} could not be read: ${message(error)}`);
        continue;
      }
      if (text === null) continue;
      const file = parseThemeFile(text);
      if (!file.ok) {
        problems.push(`${document} is not used because ${file.reason}`);
        continue;
      }
      themes.push(buildTheme(id, file, DEFAULT_THEME, document));
    }
    this.userThemes = themes;
    this.fileProblems = problems;
  }
}

/** `getThemes()` in any component below `App`; `App` calls `setThemes()`. */
export const [getThemes, setThemes] = createContext<ThemeLibrary>();
