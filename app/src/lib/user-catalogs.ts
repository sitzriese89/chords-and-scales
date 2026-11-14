/**
 * The user's own scales and tunings (SPEC §3.2, ADR-23): the documents `scales` and `tunings`
 * (`scales.toml`, `tunings.toml` in the app-data folder), in the same format as the built-in
 * catalogs. They are read once at start and handed to the core, which merges them over the
 * built-ins. A missing document means "none"; a broken item is skipped and reported, and a
 * broken file leaves the built-ins. The editors (#10 tunings, #12 scales) write these
 * documents and call the matching `setUser…` again after saving.
 */
import type { Storage } from './storage';
import { setUserScales, setUserTunings, type UserFileReport } from './theory';

export const USER_SCALES_DOCUMENT = 'scales';
export const USER_TUNINGS_DOCUMENT = 'tunings';

const loaders: [document: string, load: (toml: string) => UserFileReport][] = [
  [USER_SCALES_DOCUMENT, setUserScales],
  [USER_TUNINGS_DOCUMENT, setUserTunings],
];

/**
 * Loads both user documents into the core's catalogs. Returns one readable line per problem,
 * prefixed with the file name: `tunings.toml: tuning 2 ("bass-3"): …`. Never rejects.
 */
export async function loadUserCatalogs(storage: Storage): Promise<string[]> {
  const problems: string[] = [];
  for (const [document, load] of loaders) {
    let text: string | null;
    try {
      text = await storage.read(document);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      problems.push(`${document}.toml could not be read: ${reason}`);
      continue;
    }
    const report = load(text ?? '');
    for (const error of report.errors) problems.push(`${document}.toml: ${error.message}`);
  }
  return problems;
}
