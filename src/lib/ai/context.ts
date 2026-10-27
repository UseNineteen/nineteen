import { displayLabel, withColumn, type DataItem, type Dataset } from '../data';
import type { TagEntry } from '../tag-list';

/**
 * Packages the user's data for an AI model: which rows, which columns, and a
 * plain-text rendering in which every row keeps its "Row N" number (its row in
 * the original spreadsheet, which the viewer shows as "File row N"), so answers
 * can cite rows and Nineteen can highlight them.
 */

export type RowScope = 'all' | 'matches';

export interface ShareSelection {
  rows: RowScope;
  columns: string[];
}

export interface ViewContext {
  fileName: string;
  /** The main grouping (the rows, or the columns when there are no rows) */
  groupKey: string;
  /** Rows and column bands; absent: rows by `groupKey` */
  rowKey?: string | null;
  columnKey?: string | null;
  colorKey: string;
  searchTerm: string;
  /** The tags column and the described tags of the tag list, so the model knows what the tags mean */
  tags?: { column: string; entries: TagEntry[] };
}

/** "grouping rows by X and columns by Y", as the view is set up */
function describeGrouping(view: ViewContext): string {
  const rows = view.rowKey === undefined ? view.groupKey : view.rowKey;
  const columns = view.columnKey ?? null;
  if (rows && columns) return `grouping rows by "${rows}" and columns by "${columns}"`;
  if (columns) return `grouping columns by "${columns}"`;
  return `grouping rows by "${rows}"`;
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
    `The researcher is currently ${describeGrouping(view)} and color-coding them by "${view.colorKey}".`,
  ];
  const described = view.tags?.entries.filter((e) => e.description) ?? [];
  if (view.tags && described.length && columns.includes(view.tags.column)) {
    lines.push(`Tags in "${view.tags.column}" and what they mean: ${described.map((e) => `${e.tag}: ${e.description}`).join('; ')}`);
  }
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

/**
 * Adds columns (or replaces existing ones in place), keeping every row, its id and its other
 * values. Rows the model didn't code get a blank cell.
 */
export function withColumns(dataset: Dataset, added: Record<string, Map<number, string>>): Dataset {
  return Object.entries(added).reduce((current, [name, values]) => withColumn(current, name, (item) => values.get(item.id) ?? ''), dataset);
}

export function groupValues(items: DataItem[], key: string): string[] {
  return [...new Set(items.map((item) => displayLabel(item.raw[key])))];
}
