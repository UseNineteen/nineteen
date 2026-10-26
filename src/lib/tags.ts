import { normalizeTag, sortTags, splitTags, type DataItem, type ListSeparator, type Row } from './data';
import type { Parsed } from './values';

/**
 * Grouping and coloring by a tag column. Every row still gets exactly one
 * box: its group is the combination of its tags ("gift + price"), built from
 * a canonical spelling of each tag, sorted, and leaving out ignored tags.
 * The data itself is never changed by any of this.
 */

export interface TagInfo {
  /** Case-insensitive identity */
  key: string;
  /** Canonical spelling: the first one found in the file */
  label: string;
  /** Number of rows carrying this tag */
  count: number;
}

export const COMBINATION_SEPARATOR = ' + ';

/** Case-insensitive identity of a tag (its normalized spelling, lower-cased) */
export function tagKey(tag: string): string {
  return normalizeTag(tag).toLowerCase();
}

/** All tags in a column, most used first. */
export function tagCatalog(items: DataItem[], column: string, separator: ListSeparator = 'auto'): TagInfo[] {
  const tags = new Map<string, TagInfo>();
  for (const item of items) {
    for (const tag of splitTags(item.raw[column], separator)) {
      const key = tagKey(tag);
      const info = tags.get(key);
      if (info) info.count++;
      else tags.set(key, { key, label: tag, count: 1 });
    }
  }
  return [...tags.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** A row's group: its tags in canonical spelling and alphabetical order, minus ignored tags ('' if none remain). */
export function combination(
  value: string | undefined,
  labels: Map<string, string>,
  ignored: ReadonlySet<string>,
  separator: ListSeparator = 'auto',
): string {
  const kept = splitTags(value, separator)
    .map(tagKey)
    .filter((key) => !ignored.has(key))
    .map((key) => labels.get(key) ?? key);
  return sortTags(kept).join(COMBINATION_SEPARATOR);
}

export interface TagGrouping {
  column: string;
  catalog: TagInfo[];
  ignored: ReadonlySet<string>;
  separator?: ListSeparator;
}

/**
 * Copies of the items in which each given tag column holds the row's combination,
 * for use by the layout (grouping, coloring, sorting). Other columns are untouched.
 */
export function groupingItems(items: DataItem[], groupings: TagGrouping[]): DataItem[] {
  if (groupings.length === 0) return items;
  const prepared = groupings.map((g) => ({ ...g, labels: new Map(g.catalog.map((t) => [t.key, t.label])) }));
  return items.map((item) => {
    const raw: Row = Object.assign(Object.create(null), item.raw);
    const parsed: Record<string, Parsed> = Object.assign(Object.create(null), item.parsed);
    for (const g of prepared) {
      const combo = combination(item.raw[g.column], g.labels, g.ignored, g.separator);
      raw[g.column] = combo;
      // Sort as text; '' (no tags) sorts last like any blank value
      parsed[g.column] = combo;
    }
    return { id: item.id, raw, parsed };
  });
}
