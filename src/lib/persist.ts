import { buildDataset, type Dataset, type ListSeparator } from './data';
import type { SortBy, SortDirection } from './layout';
import type { TagEntry } from './tag-list';

/**
 * Data persistence, all on the user's own device:
 * - sessionStorage keeps the open file, and the view of it, across a page reload (cleared when
 *   the tab closes). The two are stored separately: the file is written when it is opened or
 *   its data changes, the much smaller view on every change to it. No cookies are used.
 * - Saved HTML files carry their data and view in an inert JSON <script> block.
 */

/** 'square': Best fit, 'stretch': Stretch to fit (boxes may become rectangles) */
export type FitMode = 'none' | 'square' | 'stretch';

/** Find by text (the search grammar) or by meaning (a sentence-embedding model) */
export type SearchMode = 'text' | 'meaning';
/** How many of the closest data items a meaning search shows, unless the user changes it */
export const DEFAULT_CLOSEST = 20;
/** Which data items a meaning search shows: the closest so many, or every one above a similarity score */
export type MeaningCut = 'closest' | 'score';

export interface ViewState {
  /**
   * Rows and column bands, each a column or null for none (at least one is set). Views saved
   * before these existed have only `groupKey` (the rows) and `split` (bands by the color column),
   * which are still written for them.
   */
  rowKey?: string | null;
  columnKey?: string | null;
  groupKey: string;
  colorKey: string;
  automatic: boolean;
  counts: boolean;
  split: boolean;
  zoom: number;
  /** Optional so files saved before fit modes existed still open */
  fit?: FitMode;
  sortBy: SortBy;
  sortDirection: SortDirection;
  viewerColumns: string[];
  searchTerm: string;
  searchScope: string[];
  /** Absent in views saved before finding by meaning existed: by text */
  searchMode?: SearchMode;
  /** "Find similar": the data item searched from, in place of the term */
  similarTo?: number | null;
  meaningCut?: MeaningCut;
  closest?: number;
  /** The similarity score cut-off; absent or null: the model's own default */
  minScore?: number | null;
  legendCollapsed: boolean;
  /** Columns treated as comma-separated tags */
  tagColumns?: string[];
  /** Per list column, how its cells are split (absent: commas or semicolons) */
  listSeparators?: Record<string, ListSeparator>;
  /** The column the viewer's tag field and Manage tags write to (absent: a column named "Tags") */
  tagsColumn?: string;
  /** Per tag column, tags (lower-case) left out of grouping */
  tagIgnored?: Record<string, string[]>;
  /** Per column, the value order dragged in the legend */
  valueOrders?: Record<string, string[]>;
  /** The tag list: the study's tags with descriptions, including ones no data item carries yet */
  tagList?: TagEntry[];
}

export interface SavedFile {
  version: 2;
  name: string;
  columns: string[];
  rows: string[][];
  /** Each row's number in the original file (parallel to `rows`); files saved before this was kept count 1, 2, 3… */
  ids?: number[];
  view?: ViewState;
}

const SESSION_KEY = 'nineteen:datafile';
const VIEW_KEY = 'nineteen:view';
export const EMBED_ID = 'nineteen-data';

export function serialize(dataset: Dataset, view?: ViewState): SavedFile {
  return {
    version: 2,
    name: dataset.name,
    columns: dataset.columns,
    rows: dataset.items.map((item) => dataset.columns.map((c) => item.raw[c])),
    ids: dataset.items.map((item) => item.id),
    view,
  };
}

export function deserialize(saved: SavedFile): { dataset: Dataset; view?: ViewState } {
  if (saved?.version !== 2 || !Array.isArray(saved.columns) || !Array.isArray(saved.rows)) {
    throw new Error('Unrecognized saved data');
  }
  const columns = saved.columns.map(String);
  const rows = saved.rows.map((values) => {
    const row: Record<string, string> = Object.create(null);
    columns.forEach((c, i) => (row[c] = String(values[i] ?? '')));
    return row;
  });
  const ids = saved.ids;
  const validIds = Array.isArray(ids) && ids.length === rows.length && ids.every((id) => Number.isInteger(id) && id > 0);
  return { dataset: buildDataset(String(saved.name), rows, columns, validIds ? ids : undefined), view: saved.view };
}

export function saveSession(dataset: Dataset): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(serialize(dataset)));
  } catch {
    // Storage full or unavailable (private mode): the app still works, it just won't survive a reload
    clearSession();
  }
}

/** Remembers how the open file is being viewed, so a reload brings the same view back. */
export function saveView(view: ViewState): void {
  try {
    sessionStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    // ignore: the file itself may still be restored, with a default view
  }
}

export function loadSession(): { dataset: Dataset; view?: ViewState } | null {
  let dataset: Dataset;
  try {
    const text = sessionStorage.getItem(SESSION_KEY);
    if (!text) return null;
    dataset = deserialize(JSON.parse(text)).dataset;
  } catch {
    return null;
  }
  // A view that can't be read is no reason to lose the file
  let view: ViewState | undefined;
  try {
    const text = sessionStorage.getItem(VIEW_KEY);
    if (text) view = JSON.parse(text);
  } catch {
    view = undefined;
  }
  return { dataset, view };
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(VIEW_KEY);
  } catch {
    // ignore
  }
}

/** Data embedded in a saved standalone HTML file, if this page is one. */
export function readEmbedded(): { dataset: Dataset; view?: ViewState } | null {
  const el = document.getElementById(EMBED_ID);
  if (!el?.textContent) return null;
  try {
    return deserialize(JSON.parse(el.textContent));
  } catch {
    return null;
  }
}

/** JSON that is safe to place inside a <script> element. */
export function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(new RegExp('\\u2028', 'g'), '\\u2028')
    .replace(new RegExp('\\u2029', 'g'), '\\u2029');
}
