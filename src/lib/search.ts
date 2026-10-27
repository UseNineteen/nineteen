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

/** A letter or digit, for whole-word matching (Latin with accents, Greek and Cyrillic; \b knows only ASCII) */
const WORD = '[\\w\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF]';

/** The pattern for a term; with `wholeWords`, it must not sit inside a longer word ("hose" is not in "chose") */
export function termPattern(token: string, flags = 'i', wholeWords = false): RegExp {
  const escaped = token.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&').replace(/\\\*/g, '.');
  return new RegExp(wholeWords ? `(?<!${WORD})(?:${escaped})(?!${WORD})` : escaped, flags);
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
  tagColumns: ReadonlyMap<string, ListSeparator> = new Map(),
  /** Match whole words only (the text hits of a meaning search), instead of anywhere in a word */
  wholeWords = false,
): Set<number> | null {
  // Groups without a term don't filter (a blank search, or "dog AND " before its second term is typed)
  const termGroups = groups(term)
    .map(tokens)
    .filter((toks) => toks.length > 0);
  if (termGroups.length === 0) return null;
  const matches = termGroups.map((toks) => {
    const patterns = toks.map((t) => termPattern(t, 'i', wholeWords));
    const whole = toks.map((t) => new RegExp(`^(?:${termPattern(t).source})$`, 'i'));
    const matched = new Set<number>();
    for (const item of items) {
      const hit = scope.some((column) => {
        const value = item.raw[column] ?? '';
        const separator = tagColumns.get(column);
        if (separator) {
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
export function highlightRanges(text: string, term: string, wholeWords = false): [number, number][] {
  if (!term) return [];
  const ranges: [number, number][] = [];
  for (const group of groups(term)) {
    for (const token of tokens(group)) {
      const pattern = termPattern(token, 'gi', wholeWords);
      for (const m of text.matchAll(pattern)) {
        if (m[0].length > 0) ranges.push([m.index, m.index + m[0].length]);
      }
    }
  }
  return mergeRanges(ranges);
}

/** Sorts character ranges and joins the ones that touch or overlap. */
export function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const range of sorted) {
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
