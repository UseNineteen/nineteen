import { buildDataset, type Dataset } from './data';
import type { SortBy, SortDirection } from './layout';

/**
 * Data persistence, all on the user's own device:
 * - sessionStorage keeps the open file across a page reload (cleared when the tab closes),
 *   exactly as the original app did. No cookies are used.
 * - Saved HTML files carry their data in an inert JSON <script> block.
 */

export interface ViewState {
  groupKey: string;
  colorKey: string;
  automatic: boolean;
  counts: boolean;
  split: boolean;
  zoom: number;
  sortBy: SortBy;
  sortDirection: SortDirection;
  viewerColumns: string[];
  searchTerm: string;
  searchScope: string[];
  legendCollapsed: boolean;
}

export interface SavedFile {
  version: 2;
  name: string;
  columns: string[];
  rows: string[][];
  view?: ViewState;
}

const SESSION_KEY = 'nineteen:datafile';
export const EMBED_ID = 'nineteen-data';

export function serialize(dataset: Dataset, view?: ViewState): SavedFile {
  return {
    version: 2,
    name: dataset.name,
    columns: dataset.columns,
    rows: dataset.items.map((item) => dataset.columns.map((c) => item.raw[c])),
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
  return { dataset: buildDataset(String(saved.name), rows, columns), view: saved.view };
}

export function saveSession(dataset: Dataset): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(serialize(dataset)));
  } catch {
    // Storage full or unavailable (private mode): the app still works, it just won't survive a reload
    clearSession();
  }
}

export function loadSession(): Dataset | null {
  try {
    const text = sessionStorage.getItem(SESSION_KEY);
    return text ? deserialize(JSON.parse(text)).dataset : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
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
