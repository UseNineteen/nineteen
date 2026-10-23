import { colorScale, type Swatch } from './colors';
import { computeLayout, type SortBy, type SortDirection } from './layout';
import type { Dataset, DataItem } from './data';
import type { ViewState } from './persist';
import { search } from './search';
import { topTerms } from './terms';

export const ZOOM = { min: 0.1, max: 5, step: 0.1 } as const;

const FALLBACK: Swatch = { fill: '#cccccc', stroke: '#cccccc' };

/** Everything about the current visualization view, ported from the original Visualize + Search models. */
export class Viz {
  /** Replaced (not mutated) when AI auto-coding adds a column */
  dataset = $state.raw<Dataset>(null!);

  groupKey = $state('');
  colorKey = $state('');
  /** When true the color column follows the group column ("Automatic") */
  automatic = $state(true);
  counts = $state(false);
  split = $state(false);
  zoom = $state(1);
  zooming = $state(false);
  sortBy = $state<SortBy>('value');
  sortDirection = $state<SortDirection>('ascending');
  /** Each sort button remembers its own direction, as in the original toolbar */
  buttonDirections = $state<Record<SortBy, SortDirection>>({ value: 'ascending', count: 'descending' });
  viewerColumns = $state<string[]>([]);
  searchTerm = $state('');
  searchScope = $state<string[]>([]);
  legendCollapsed = $state(false);
  /** Color label of the hovered block, used to highlight its legend entry */
  hoveredColor = $state<string | null>(null);
  /** Rows cited by an AI answer; when set, every other row is grayed out */
  aiHighlight = $state.raw<Set<number> | null>(null);

  layout = $derived.by(() =>
    computeLayout(this.dataset.items, {
      groupKey: this.groupKey,
      colorKey: this.colorKey,
      split: this.split,
      counts: this.counts,
      sortBy: this.sortBy,
      sortDirection: this.sortDirection,
    }),
  );
  colors = $derived.by(() => colorScale(this.layout.legend.map((g) => g.label)));
  matches = $derived.by(() => search(this.dataset.items, this.searchTerm, this.searchScope));
  /** High-frequency words; only computed when the word list is opened */
  terms = $derived.by(() => topTerms(this.dataset.items, this.searchScope));

  #zoomTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(dataset: Dataset, view?: ViewState) {
    this.dataset = dataset;
    const columns = dataset.columns;
    const has = (c: string | undefined): c is string => !!c && columns.includes(c);
    this.groupKey = has(view?.groupKey) ? view.groupKey : columns[0];
    this.automatic = view?.automatic ?? true;
    this.colorKey = !this.automatic && has(view?.colorKey) ? view.colorKey : this.groupKey;
    this.counts = view?.counts ?? false;
    this.split = !this.automatic && (view?.split ?? false);
    this.zoom = view?.zoom ?? 1;
    this.sortBy = view?.sortBy ?? 'value';
    this.sortDirection = view?.sortDirection ?? 'ascending';
    this.buttonDirections[this.sortBy] = this.sortDirection;
    this.viewerColumns = view?.viewerColumns?.filter(has) ?? [...columns];
    this.searchTerm = view?.searchTerm ?? '';
    this.searchScope = view?.searchScope?.filter(has) ?? [...columns];
    this.legendCollapsed = view?.legendCollapsed ?? false;
  }

  setGroupKey(key: string): void {
    this.groupKey = key;
    if (this.automatic) this.colorKey = key;
  }

  /** `null` selects "Automatic" (color follows grouping, which also turns off split view). */
  setColorKey(key: string | null): void {
    if (key === null) {
      this.automatic = true;
      this.colorKey = this.groupKey;
      this.split = false;
    } else {
      this.automatic = false;
      this.colorKey = key;
    }
  }

  /** Sorting buttons: clicking the active one reverses it; clicking the other switches to it. */
  sort(by: SortBy): void {
    if (this.sortBy === by) {
      const direction = this.sortDirection === 'ascending' ? 'descending' : 'ascending';
      this.buttonDirections[by] = direction;
      this.sortDirection = direction;
    } else {
      this.sortBy = by;
      this.sortDirection = this.buttonDirections[by];
    }
  }

  setZoom(zoom: number): void {
    const next = Math.round(Math.min(ZOOM.max, Math.max(ZOOM.min, zoom)) * 1000) / 1000;
    if (next === this.zoom) return;
    // Suppress the block movement animation while the scale changes
    this.zooming = true;
    this.zoom = next;
    clearTimeout(this.#zoomTimer);
    this.#zoomTimer = setTimeout(() => (this.zooming = false), 150);
  }

  zoomIn(): void {
    this.setZoom(this.zoom + ZOOM.step);
  }

  zoomOut(): void {
    this.setZoom(this.zoom - ZOOM.step);
  }

  colorOf(item: DataItem): Swatch {
    return this.colors.get(item.raw[this.colorKey]) ?? FALLBACK;
  }

  isFiltered(item: DataItem): boolean {
    if (this.aiHighlight) return !this.aiHighlight.has(item.id);
    return this.matches !== null && !this.matches.has(item.id);
  }

  /**
   * Swaps in a dataset with added AI columns and colors the view by `colorKey`.
   * New columns are shown in the viewer and included in search.
   */
  replaceDataset(dataset: Dataset, colorKey: string): void {
    const added = dataset.columns.filter((c) => !this.dataset.columns.includes(c));
    this.dataset = dataset;
    this.viewerColumns = dataset.columns.filter((c) => this.viewerColumns.includes(c) || added.includes(c));
    this.searchScope = dataset.columns.filter((c) => this.searchScope.includes(c) || added.includes(c));
    this.setColorKey(colorKey);
  }

  isMatch(item: DataItem): boolean {
    return this.matches?.has(item.id) ?? false;
  }

  /** Text for the "within …" search scope button */
  get scopeText(): string {
    const n = this.searchScope.length;
    if (n === this.dataset.columns.length) return 'all fields';
    if (n === 1) return 'one field';
    if (n > 1) return 'some fields';
    return 'no fields';
  }

  toViewState(): ViewState {
    return {
      groupKey: this.groupKey,
      colorKey: this.colorKey,
      automatic: this.automatic,
      counts: this.counts,
      split: this.split,
      zoom: this.zoom,
      sortBy: this.sortBy,
      sortDirection: this.sortDirection,
      viewerColumns: [...this.viewerColumns],
      searchTerm: this.searchTerm,
      searchScope: [...this.searchScope],
      legendCollapsed: this.legendCollapsed,
    };
  }
}
