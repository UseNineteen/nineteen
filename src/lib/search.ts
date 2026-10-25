import { splitTags, type DataItem, type ListSeparator } from './data';

/**
 * Search grammar, ported from the original Search model:
 * - `dog food`      matches items containing "dog" OR "food"
 * - `"dog food"`    matches the exact phrase (quotes can include spaces: `" food "`)
 * - `dog AND food`  matches items containing both (AND must be upper-case)
 * - `*`             matches any single character
 * Matching is case-insensitive and limited to the columns in `scope`.
 */

const TOKEN = /"(.+?)"|(\S+)/g;

export function tokens(group: string): string[] {
  return [...group.matchAll(TOKEN)].map((m) => m[1] ?? m[2]);
}

export function termPattern(token: string, flags = 'i'): RegExp {
  const escaped = token.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&').replace(/\\\*/g, '.');
  return new RegExp(escaped, flags);
}

function groups(term: string): string[] {
  return term.split(' AND ');
}

/**
 * Returns the ids of matching items, or null when there is no search term.
 * In tag columns a term must match a whole tag, so "price" finds "price" but not "pricey".
 */
export function search(
  items: DataItem[],
  term: string,
  scope: string[],
  /** List (tag) columns, with how each one's cells are split */
  tagColumns: ReadonlySet<string> | ReadonlyMap<string, ListSeparator> = new Set(),
): Set<number> | null {
  // Groups without a term don't filter (a blank search, or "dog AND " before its second term is typed)
  const termGroups = groups(term)
    .map(tokens)
    .filter((toks) => toks.length > 0);
  if (termGroups.length === 0) return null;
  const matches = termGroups.map((toks) => {
    const patterns = toks.map((t) => termPattern(t));
    const whole = toks.map((t) => new RegExp(`^(?:${termPattern(t).source})$`, 'i'));
    const matched = new Set<number>();
    for (const item of items) {
      const hit = scope.some((column) => {
        const value = item.raw[column] ?? '';
        if (tagColumns.has(column)) {
          const separator = tagColumns instanceof Map ? tagColumns.get(column) : 'auto';
          return splitTags(value, separator).some((tag) => whole.some((p) => p.test(tag)));
        }
        return patterns.some((p) => p.test(value));
      });
      if (hit) matched.add(item.id);
    }
    return matched;
  });
  return matches.reduce((all, next) => new Set([...all].filter((id) => next.has(id))));
}

/** Character ranges in `text` that match any term, merged so they never overlap. */
export function highlightRanges(text: string, term: string): [number, number][] {
  if (!term) return [];
  const ranges: [number, number][] = [];
  for (const group of groups(term)) {
    for (const token of tokens(group)) {
      const pattern = termPattern(token, 'gi');
      for (const m of text.matchAll(pattern)) {
        if (m[0].length > 0) ranges.push([m.index, m.index + m[0].length]);
      }
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

/** Adds a term to the search, joined with AND when `newGroup` (shift-click in the word list). */
export function addTerm(current: string, term: string, newGroup: boolean): string {
  const parts = [current, term];
  if (current && newGroup) parts.splice(1, 0, 'AND');
  return parts.join(' ').trim();
}
