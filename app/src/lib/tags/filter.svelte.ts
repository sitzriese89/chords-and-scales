/**
 * Tag filters for the scale and chord pickers (SPEC §5.7, ADR-41). The tags come from the core
 * (`listTags`, `scaleTags`, `chordTags`, ADR-39); this module only keeps which chips are on and
 * which catalog items carry all of them (AND).
 *
 * One `TagFilter` per picker, both held by `TagFilters` in the app's context, so the random pick
 * (M3.3) can draw from `items` without filtering again. The filters are not saved: every start
 * shows the whole catalog.
 *
 * The tags and the catalogs live in the WASM binding; every derived value here reads
 * `UserCatalogs.revision`, which `UserCatalogs` bumps after loading the user files (the rules
 * file `tags.toml` among them) and after every save (ADR-24).
 */
import { createContext } from 'svelte';
import {
  chordTags,
  listChords,
  listScales,
  listTags,
  scaleTags,
  type ChordInfo,
  type ScaleInfo,
} from '../theory';
import type { UserCatalogs } from '../user-catalogs.svelte';

/** A catalog item with its tags, by name. */
export interface Tagged<T> {
  item: T;
  tags: string[];
}

/** A family of the catalog with its items, in catalog order. */
export interface TaggedFamily<T> {
  name: string;
  items: Tagged<T>[];
}

/** Where a filter reads its catalog. */
export interface TagSource<T> {
  /** Which tags apply: those with a threshold for this kind. */
  kind: 'scales' | 'chords';
  /** The current catalog, by family. */
  families: () => { name: string; items: T[] }[];
  /** The core's tags for an item of the current catalog. */
  tagsOf: (id: string) => string[];
}

export class TagFilter<T extends { id: string }> {
  /** The chips that are on, in the order they were turned on. */
  selected = $state<string[]>([]);

  constructor(
    private readonly catalogs: UserCatalogs,
    private readonly source: TagSource<T>,
  ) {}

  /** The tags of the current rules that can apply to this kind, by name. */
  readonly available = $derived.by((): string[] => {
    void this.catalogs.revision;
    return listTags()
      .filter((tag) => tag[this.source.kind])
      .map((tag) => tag.name);
  });

  /** The chips that are on and still exist in the current rules. */
  readonly active = $derived(this.selected.filter((tag) => this.available.includes(tag)));

  /** The whole catalog with every item's tags. */
  readonly all = $derived.by((): TaggedFamily<T>[] => {
    void this.catalogs.revision;
    return this.source.families().map((family) => ({
      name: family.name,
      items: family.items.map((item) => ({ item, tags: this.source.tagsOf(item.id) })),
    }));
  });

  /** The catalog's families with only the items that carry every active tag; empty ones go. */
  readonly families = $derived.by((): TaggedFamily<T>[] => {
    const active = this.active;
    if (active.length === 0) return this.all;
    return this.all
      .map((family) => ({
        name: family.name,
        items: family.items.filter((tagged) => active.every((tag) => tagged.tags.includes(tag))),
      }))
      .filter((family) => family.items.length > 0);
  });

  /** The items that pass the filter, in catalog order: what a random pick draws from (M3.3). */
  readonly items = $derived(this.families.flatMap((family) => family.items.map((t) => t.item)));

  /** Whether the chip `tag` is on. */
  isSelected(tag: string): boolean {
    return this.active.includes(tag);
  }

  /** Turns the chip `tag` on or off. */
  toggle(tag: string): void {
    this.selected = this.selected.includes(tag)
      ? this.selected.filter((t) => t !== tag)
      : [...this.selected, tag];
  }

  /** Turns every chip off. */
  clear(): void {
    this.selected = [];
  }

  /** The tags of the item `id` (`[]` for an id not in the catalog). */
  tagsOf(id: string): string[] {
    for (const family of this.all) {
      const found = family.items.find((tagged) => tagged.item.id === id);
      if (found) return found.tags;
    }
    return [];
  }

  /**
   * `families` (this filter's, or a narrower list made from them) with the item `id` put back
   * in its family and place: a current item the chips hide stays in its picker, so the picker
   * never shows blank. `items` never includes it.
   */
  keeping(families: TaggedFamily<T>[], id: string): TaggedFamily<T>[] {
    const listed = families.flatMap((family) => family.items.map((t) => t.item.id));
    if (listed.includes(id)) return families;
    return this.all
      .map((family) => ({
        name: family.name,
        items: family.items.filter((t) => t.item.id === id || listed.includes(t.item.id)),
      }))
      .filter((family) => family.items.length > 0);
  }

  /** Whether the item `id` is in the catalog and passes the filter. */
  matches(id: string): boolean {
    return this.families.some((family) => family.items.some((tagged) => tagged.item.id === id));
  }
}

/** The tag filters of the scale picker and the chord picker. */
export class TagFilters {
  readonly scales: TagFilter<ScaleInfo>;
  readonly chords: TagFilter<ChordInfo>;

  constructor(catalogs: UserCatalogs) {
    this.scales = new TagFilter(catalogs, {
      kind: 'scales',
      families: () => listScales().map((f) => ({ name: f.name, items: f.scales })),
      tagsOf: scaleTags,
    });
    this.chords = new TagFilter(catalogs, {
      kind: 'chords',
      families: () => listChords().map((f) => ({ name: f.name, items: f.chords })),
      tagsOf: chordTags,
    });
  }
}

/** `getTagFilters()` in any component below `App`; `App` calls `setTagFilters()`. */
export const [getTagFilters, setTagFilters] = createContext<TagFilters>();

/** `dark, sad` → `Phrygian — dark, sad`; the name alone for an item without tags. */
export function withTags(name: string, tags: readonly string[]): string {
  return tags.length === 0 ? name : `${name} — ${tags.join(', ')}`;
}

/** The mark on a current item that is listed although the chips hide it. */
export const HIDDEN_BY_TAGS = '(hidden by tags)';

/** `["dark"]` → `dark`; `["dark", "sad", "evil"]` → `dark, sad and evil`. */
export function tagList(tags: readonly string[]): string {
  if (tags.length <= 1) return tags.join('');
  return `${tags.slice(0, -1).join(', ')} and ${tags.at(-1)}`;
}
