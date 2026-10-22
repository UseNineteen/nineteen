import { compareValues, parseValue, type Parsed } from './values';

/** A row of the data file, keyed by column name. Null-prototype to keep user column names inert. */
export type Row = Record<string, string>;

export interface DataItem {
  /** 1-based file row number (excluding the header), shown as "File row N" */
  id: number;
  raw: Row;
  parsed: Record<string, Parsed>;
}

export interface Dataset {
  name: string;
  columns: string[];
  items: DataItem[];
}

export interface Group {
  label: string;
  value: Parsed;
  items: DataItem[];
  count: number;
}

export const BLANK_LABEL = '(blank)';

export function displayLabel(label: string): string {
  return label.trim() === '' ? BLANK_LABEL : label;
}

function cleanRow(row: Record<string, unknown>, columns: string[]): Row {
  const clean: Row = Object.create(null);
  for (const column of columns) {
    const value = row[column];
    clean[column] = value === undefined || value === null ? '' : String(value);
  }
  return clean;
}

/** Builds the dataset from parsed rows; columns are the union of keys in first-seen order. */
export function buildDataset(name: string, rows: Record<string, unknown>[], columns?: string[]): Dataset {
  let cols = columns;
  if (!cols) {
    const seen = new Set<string>();
    for (const row of rows) for (const key of Object.keys(row)) seen.add(key);
    cols = [...seen];
  }
  const items = rows
    .map((row) => cleanRow(row, cols!))
    .filter((row) => cols!.some((c) => row[c].trim() !== ''))
    .map((raw, index) => {
      const parsed: Record<string, Parsed> = Object.create(null);
      for (const column of cols!) parsed[column] = parseValue(raw[column]);
      return { id: index + 1, raw, parsed };
    });
  return { name, columns: cols, items };
}

export function datasetDetails(dataset: Dataset): string {
  return `${dataset.columns.length} columns, ${dataset.items.length} rows`;
}

/** Sort comparator for items: group value, then color value, then file order. */
export function itemComparator(groupKey: string, colorKey: string) {
  return (a: DataItem, b: DataItem): number =>
    compareValues(a.parsed[groupKey], b.parsed[groupKey]) ||
    compareValues(a.parsed[colorKey], b.parsed[colorKey]) ||
    a.id - b.id;
}

/**
 * Groups items by the raw text in `key` (optionally sub-grouped by `filter`),
 * preserving first-seen order of the (already sorted) input.
 */
export function rollup(items: DataItem[], key: string, filter?: string): Group[] {
  const groups = new Map<string, DataItem[]>();
  for (const item of items) {
    let label = item.raw[key];
    if (filter) label = `${label}\u0000${item.raw[filter]}`;
    let list = groups.get(label);
    if (!list) groups.set(label, (list = []));
    list.push(item);
  }
  return [...groups].map(([label, list]) => {
    const sorted = [...list].sort((a, b) => compareValues(a.parsed[key], b.parsed[key]) || a.id - b.id);
    return { label: filter ? label.split('\u0000')[0] : label, value: list[0].parsed[key], items: sorted, count: list.length };
  });
}
