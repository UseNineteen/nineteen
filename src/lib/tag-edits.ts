import { joinTags, normalizeTag, sortTags, splitTags, withCell, withColumn, type DataItem } from './data';
import { saveSession } from './persist';
import { COMBINATION_SEPARATOR, tagKey } from './tags';
import type { Viz } from './viz.svelte';

/**
 * Editing tags: the viewer's tag field, "Tag these…" on search matches, and Manage tags. Every
 * change rewrites the tags column of the view's dataset (creating the column on first use),
 * keeps the open file in session storage up to date, and leaves one undo on the view. The
 * functions take the view they work on; `Viz` exposes them as methods.
 */

/** A column that has just been created is shown in the viewer and searched. */
function showNewColumn(viz: Viz, column: string): void {
  if (!viz.searchScope.includes(column)) viz.searchScope = [...viz.searchScope, column];
  if (!viz.viewerColumns.includes(column)) viz.viewerColumns = [...viz.viewerColumns, column];
}

/** The existing spelling of a tag, or the new one, tidied */
export function canonicalTag(viz: Viz, tag: string): string {
  const key = tagKey(tag);
  return viz.catalog(viz.tagEditColumn).find((t) => t.key === key)?.label ?? normalizeTag(tag);
}

/** Writes one row's tags (sorted, de-duplicated). */
export function setTags(viz: Viz, itemId: number, tags: string[]): void {
  const column = viz.tagEditColumn;
  const isNew = !viz.dataset.columns.includes(column);
  viz.dataset = withCell(viz.dataset, itemId, column, joinTags(tags, viz.separatorOf(column)));
  if (isNew) showNewColumn(viz, column);
  if (!viz.tagColumns.includes(column)) viz.tagColumns = [...viz.tagColumns, column];
  // A hand edit after a bulk change: undoing the bulk change would also undo this one
  viz.tagUndo = null;
  saveSession(viz.dataset);
}

/**
 * Rewrites the tags of every data item through `edit`, keeping what's needed to undo it.
 * `renames` maps old tag keys to new labels (null: removed), so legend order and display
 * options follow renamed, combined and deleted tags. Returns how many items changed.
 */
function editTags(
  viz: Viz,
  label: string,
  edit: (tags: string[], item: DataItem) => string[],
  renames?: Map<string, string | null>,
): number {
  const column = viz.tagEditColumn;
  const separator = viz.separatorOf(column);
  const saved = {
    dataset: viz.dataset,
    tagColumns: viz.tagColumns,
    tagIgnored: viz.tagIgnored,
    valueOrders: viz.valueOrders,
    searchScope: viz.searchScope,
    viewerColumns: viz.viewerColumns,
  };
  const isNew = !viz.dataset.columns.includes(column);
  let changed = 0;
  const dataset = withColumn(viz.dataset, column, (item) => {
    const before = splitTags(item.raw[column], separator);
    const after = edit(before, item);
    if (joinTags(after, separator) === joinTags(before, separator)) return item.raw[column] ?? '';
    changed++;
    return joinTags(after, separator);
  });
  if (changed === 0) return 0;
  viz.dataset = dataset;
  if (isNew) showNewColumn(viz, column);
  if (!viz.tagColumns.includes(column)) viz.tagColumns = [...viz.tagColumns, column];
  if (renames) followRenames(viz, column, renames);
  saveSession(viz.dataset);
  viz.tagUndo = {
    label,
    restore: () => {
      Object.assign(viz, saved);
      viz.tagUndo = null;
      saveSession(viz.dataset);
    },
  };
  return changed;
}

/** Keeps legend order and hidden tags pointing at the right tags after a rename, combine or delete. */
function followRenames(viz: Viz, column: string, renames: Map<string, string | null>): void {
  const renamed = (label: string): string | null => {
    const key = tagKey(label);
    return renames.has(key) ? renames.get(key)! : label;
  };
  const order = viz.valueOrders[column];
  if (order) {
    // Each entry is a combination like "gift + price"; '' is "(no tags)"
    const next = order.map((combo) => {
      const labels = combo.split(COMBINATION_SEPARATOR).filter(Boolean).map(renamed);
      const kept = [...new Map(labels.filter((l): l is string => l !== null).map((l) => [tagKey(l), l])).values()];
      return sortTags(kept).join(COMBINATION_SEPARATOR);
    });
    viz.valueOrders = { ...viz.valueOrders, [column]: [...new Set(next)] };
  }
  const ignored = viz.tagIgnored[column];
  if (ignored) {
    const next = ignored.map((key) => (renames.has(key) ? renames.get(key) : key)).filter((k): k is string => !!k);
    viz.tagIgnored = { ...viz.tagIgnored, [column]: [...new Set(next.map(tagKey))] };
  }
}

/** Adds a tag to the given data items (those that don't have it already). */
export function tagItems(viz: Viz, ids: ReadonlySet<number>, tag: string): number {
  const label = canonicalTag(viz, tag);
  const key = tagKey(label);
  if (!key) return 0;
  return editTags(viz, `Tagged with “${label}”`, (tags, item) =>
    ids.has(item.id) && !tags.some((t) => tagKey(t) === key) ? [...tags, label] : tags,
  );
}

/** Removes a tag from the given data items. */
export function untagItems(viz: Viz, ids: ReadonlySet<number>, tag: string): number {
  const key = tagKey(tag);
  return editTags(viz, `Removed “${canonicalTag(viz, tag)}”`, (tags, item) =>
    ids.has(item.id) ? tags.filter((t) => tagKey(t) !== key) : tags,
  );
}

/** Renames a tag everywhere; renaming onto another existing tag combines the two. */
export function renameTag(viz: Viz, from: string, to: string): number {
  const fromKey = tagKey(from);
  const target = normalizeTag(to);
  if (!target || target === from) return 0;
  const existing = viz.catalog(viz.tagEditColumn).find((t) => t.key === tagKey(target) && t.key !== fromKey);
  const label = existing?.label ?? target;
  return editTags(
    viz,
    existing ? `Combined “${from}” into “${label}”` : `Renamed “${from}” to “${label}”`,
    (tags) => tags.map((t) => (tagKey(t) === fromKey ? label : t)),
    new Map([[fromKey, label]]),
  );
}

/** Combines one tag into another: every item tagged `from` is tagged `into` instead. */
export function combineTags(viz: Viz, from: string, into: string): number {
  return renameTag(viz, from, canonicalTag(viz, into));
}

/** Removes a tag from every data item. */
export function deleteTag(viz: Viz, tag: string): number {
  const key = tagKey(tag);
  return editTags(viz, `Deleted “${canonicalTag(viz, tag)}”`, (tags) => tags.filter((t) => tagKey(t) !== key), new Map([[key, null]]));
}

/** Colors the view by one tag: data items with it versus everything else (the "Only this" display option). */
export function colorByTag(viz: Viz, tag: string): void {
  const column = viz.tagEditColumn;
  const key = tagKey(tag);
  viz.setColorKey(column);
  viz.setIgnoredTags(
    column,
    viz
      .catalog(column)
      .map((t) => t.key)
      .filter((k) => k !== key),
  );
}

/**
 * Converts a tag into a data field: "True" for every data item that has the tag, "False" for the
 * rest. The tag is removed from the data items unless `keepTag` (then the field is a copy that
 * later tag changes don't update). One Undo reverses both. Returns the new field's name.
 */
export function tagToColumn(viz: Viz, tag: string, name: string, keepTag = false): string {
  const key = tagKey(tag);
  const column = viz.freeColumnName(name.trim() || canonicalTag(viz, tag));
  const tags = viz.tagEditColumn;
  const separator = viz.separatorOf(tags);
  const saved = {
    dataset: viz.dataset,
    searchScope: viz.searchScope,
    viewerColumns: viz.viewerColumns,
    tagIgnored: viz.tagIgnored,
    valueOrders: viz.valueOrders,
  };
  let dataset = withColumn(viz.dataset, column, (item) =>
    splitTags(item.raw[tags], separator).some((t) => tagKey(t) === key) ? 'True' : 'False',
  );
  if (!keepTag) {
    dataset = withColumn(dataset, tags, (item) => {
      const before = splitTags(item.raw[tags], separator);
      const after = before.filter((t) => tagKey(t) !== key);
      return after.length === before.length ? (item.raw[tags] ?? '') : joinTags(after, separator);
    });
  }
  viz.dataset = dataset;
  showNewColumn(viz, column);
  if (!keepTag) followRenames(viz, tags, new Map([[key, null]]));
  saveSession(viz.dataset);
  viz.tagUndo = {
    label: `${keepTag ? 'Added' : 'Converted into'} data field “${column}”`,
    restore: () => {
      Object.assign(viz, saved);
      viz.tagUndo = null;
      saveSession(viz.dataset);
    },
  };
  return column;
}
