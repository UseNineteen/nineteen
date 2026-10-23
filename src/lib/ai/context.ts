import { buildDataset, displayLabel, type DataItem, type Dataset } from '../data';

/**
 * Packages the user's data for an AI model: which rows, which columns, and a
 * plain-text rendering in which every row keeps its "Row N" number (the same
 * number the viewer shows as "File row N"), so answers can cite rows and
 * Nineteen can highlight them.
 */

export type RowScope = 'all' | 'matches';

export interface ShareSelection {
  rows: RowScope;
  columns: string[];
}

export interface ViewContext {
  fileName: string;
  groupKey: string;
  colorKey: string;
  searchTerm: string;
}

export function selectItems(dataset: Dataset, scope: RowScope, matches: Set<number> | null): DataItem[] {
  if (scope === 'matches' && matches) return dataset.items.filter((item) => matches.has(item.id));
  return dataset.items;
}

/** One block per row; blank cells are left out to save tokens. */
export function renderRows(items: DataItem[], columns: string[]): string {
  return items
    .map((item) => {
      const lines = [`### Row ${item.id}`];
      for (const column of columns) {
        const value = (item.raw[column] ?? '').trim();
        if (value) lines.push(`${column}: ${value.replace(/\s*\n\s*/g, ' / ')}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

export function describeData(items: DataItem[], columns: string[], view: ViewContext, scope: RowScope): string {
  const lines = [
    `Data file: ${view.fileName}`,
    `Rows included: ${items.length}${scope === 'matches' && view.searchTerm ? ` (only rows matching the search "${view.searchTerm}")` : ''}`,
    `Columns included: ${columns.join(', ')}`,
    `The researcher is currently grouping rows by "${view.groupKey}" and color-coding them by "${view.colorKey}".`,
  ];
  return lines.join('\n');
}

export function renderData(items: DataItem[], columns: string[], view: ViewContext, scope: RowScope): string {
  return `${describeData(items, columns, view, scope)}\n\n<data>\n${renderRows(items, columns)}\n</data>`;
}

/** Rough token estimate (≈4 characters per token for English text). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `~${tokens} tokens`;
  if (tokens < 1_000_000) return `~${Math.round(tokens / 1000)}k tokens`;
  return `~${(tokens / 1_000_000).toFixed(1)}M tokens`;
}

/** Adds (or replaces) columns, keeping row ids and every existing value. */
export function withColumns(dataset: Dataset, added: Record<string, Map<number, string>>): Dataset {
  const names = Object.keys(added);
  const columns = [...dataset.columns.filter((c) => !names.includes(c)), ...names];
  const rows = dataset.items.map((item) => {
    const row: Record<string, string> = Object.create(null);
    for (const column of dataset.columns) row[column] = item.raw[column];
    for (const name of names) row[name] = added[name].get(item.id) ?? '';
    return row;
  });
  const next = buildDataset(dataset.name, rows, columns);
  // Keep the original file row numbers (rows are never dropped, so ids line up)
  next.items.forEach((item, i) => (item.id = dataset.items[i].id));
  return next;
}

export function groupValues(items: DataItem[], key: string): string[] {
  return [...new Set(items.map((item) => displayLabel(item.raw[key])))];
}
