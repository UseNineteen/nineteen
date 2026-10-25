import { compareValues, parseValue, type Parsed } from './values';

/** A row of the data file, keyed by column name. Null-prototype to keep user column names inert. */
export type Row = Record<string, string>;

export interface DataItem {
  /**
   * The row's number in the original file, as a spreadsheet program shows it (the header is
   * row 1 and blank rows count), shown as "File row N" and cited by AI answers as "Row N".
   * Unique, but not consecutive.
   */
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

/**
 * Builds the dataset from parsed rows, leaving out rows with nothing in them. Columns default
 * to the union of keys in first-seen order; `rowNumbers` (parallel to `rows`) are the rows'
 * numbers in the file, defaulting to 1, 2, 3… when the rows didn't come from a file.
 */
export function buildDataset(name: string, rows: Record<string, unknown>[], columns?: string[], rowNumbers?: number[]): Dataset {
  let cols = columns;
  if (!cols) {
    const seen = new Set<string>();
    for (const row of rows) for (const key of Object.keys(row)) seen.add(key);
    cols = [...seen];
  }
  const items = rows
    .map((row, index) => ({ id: rowNumbers?.[index] ?? index + 1, raw: cleanRow(row, cols) }))
    .filter(({ raw }) => cols.some((c) => raw[c].trim() !== ''))
    .map(({ id, raw }) => {
      const parsed: Record<string, Parsed> = Object.create(null);
      for (const column of cols) parsed[column] = parseValue(raw[column]);
      return { id, raw, parsed };
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

// ---------------------------------------------------------------------------
// Tags: comma-separated values in one cell ("gift, price")
// ---------------------------------------------------------------------------

export const NO_TAGS_LABEL = '(no tags)';

const tagCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/**
 * How a list column's cells are split into values. "auto" (commas or semicolons) is the
 * default; values that themselves contain commas, like "Younger Women, No Kids", need
 * a different separator.
 */
export type ListSeparator = 'auto' | 'comma' | 'semicolon' | 'newline';

export const LIST_SEPARATORS: { value: ListSeparator; label: string }[] = [
  { value: 'auto', label: 'Commas or semicolons' },
  { value: 'comma', label: 'Commas' },
  { value: 'semicolon', label: 'Semicolons' },
  { value: 'newline', label: 'New lines' },
];

const SPLIT: Record<ListSeparator, RegExp> = { auto: /[,;]/, comma: /,/, semicolon: /;/, newline: /\r?\n/ };
const JOIN: Record<ListSeparator, string> = { auto: ', ', comma: ', ', semicolon: '; ', newline: '\n' };

/** Trimmed, single-spaced values without duplicates (ignoring case), in their original order. */
function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of values) {
    const tag = value.trim().replace(/\s+/g, ' ');
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    kept.push(tag);
  }
  return kept;
}

/** Splits a cell into tags (on commas or semicolons, unless another separator is given), trimmed, without duplicates (ignoring case). */
export function splitTags(value: string | undefined, separator: ListSeparator = 'auto'): string[] {
  return unique((value ?? '').split(SPLIT[separator]));
}

/** Tags in alphabetical order, so the same set always looks (and groups) the same. */
export function sortTags(tags: string[]): string[] {
  return [...tags].sort(tagCollator.compare);
}

export function joinTags(tags: string[], separator: ListSeparator = 'auto'): string {
  return sortTags(unique(tags.flatMap((tag) => tag.split(SPLIT[separator])))).join(JOIN[separator]);
}

/** Returns a copy of the dataset with one cell changed, adding the column if it doesn't exist yet. */
export function withCell(dataset: Dataset, id: number, column: string, value: string): Dataset {
  const isNew = !dataset.columns.includes(column);
  const columns = isNew ? [...dataset.columns, column] : dataset.columns;
  const items = dataset.items.map((item) => {
    if (item.id !== id && !isNew) return item;
    const raw: Row = Object.assign(Object.create(null), item.raw);
    const parsed: Record<string, Parsed> = Object.assign(Object.create(null), item.parsed);
    raw[column] = item.id === id ? value : (raw[column] ?? '');
    parsed[column] = parseValue(raw[column]);
    return { id: item.id, raw, parsed };
  });
  return { name: dataset.name, columns, items };
}

/** Returns a copy of the dataset with every cell of one column recomputed, adding the column if it doesn't exist yet. */
export function withColumn(dataset: Dataset, column: string, value: (item: DataItem) => string): Dataset {
  const isNew = !dataset.columns.includes(column);
  const columns = isNew ? [...dataset.columns, column] : dataset.columns;
  const items = dataset.items.map((item) => {
    const next = value(item);
    if (!isNew && next === (item.raw[column] ?? '')) return item;
    const raw: Row = Object.assign(Object.create(null), item.raw);
    const parsed: Record<string, Parsed> = Object.assign(Object.create(null), item.parsed);
    raw[column] = next;
    parsed[column] = parseValue(next);
    return { id: item.id, raw, parsed };
  });
  return { name: dataset.name, columns, items };
}
