import { colorScale, type Swatch } from './colors';
import { computeLayout, zoomBounds, type SortBy, type SortDirection } from './layout';
import { displayLabel, joinTags, NO_TAGS_LABEL, withCell, type Dataset, type DataItem } from './data';
import { saveSession, type FitMode, type ViewState } from './persist';
import { groupingItems, tagCatalog, type TagInfo } from './tags';
import { search } from './search';
import { topTerms } from './terms';
import { appSettings } from './settings.svelte';

export const ZOOM = { step: 0.1 } as const;

/** Zoom range allowed by the box size limits in Settings. */
export function zoomRange(): { min: number; max: number } {
  return zoomBounds(appSettings.minBox, appSettings.maxBox);
}

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
  /** Fitting stays on (through resizes and regrouping) until the user zooms by hand */
  fit = $state<FitMode>('none');
  /** The scale currently on screen (kept up to date by the viewer), so leaving a fit keeps the same size */
  displayScale = 1;
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
  /**
   * Split view labels: on one line, wrapped onto up to 3 lines, or turned 90° when columns are
   * too narrow even for that (set by the viewer, which measures the text)
   */
  headerMode = $state<'line' | 'wrap' | 'turn'>('line');
  headerLines = $state(1);
  /** Extra height of the label row, at scale 1 */
  headerExtra = $state(0);
  /** Columns holding comma-separated tags */
  tagColumns = $state<string[]>([]);
  /** Per tag column: tags (lower-case) left out of grouping and coloring */
  tagIgnored = $state<Record<string, string[]>>({});

  tagSet = $derived.by(() => new Set(this.tagColumns.filter((c) => this.dataset.columns.includes(c))));
  /** Tags in each tag column, most used first */
  tagCatalogs = $derived.by(() => new Map([...this.tagSet].map((c) => [c, tagCatalog(this.dataset.items, c)])));
  /** Items as the layout sees them: tag columns used for grouping/coloring hold the row's tag combination */
  layoutItems = $derived.by(() =>
    groupingItems(
      this.dataset.items,
      [...new Set([this.groupKey, this.colorKey])]
        .filter((c) => this.tagSet.has(c))
        .map((c) => ({ column: c, catalog: this.tagCatalogs.get(c) ?? [], ignored: new Set(this.tagIgnored[c] ?? []) })),
    ),
  );
  #layoutById = $derived.by(() => new Map(this.layoutItems.map((item) => [item.id, item])));

  layout = $derived.by(() =>
    computeLayout(this.layoutItems, {
      groupKey: this.groupKey,
      colorKey: this.colorKey,
      split: this.split,
      counts: this.counts,
      sortBy: this.sortBy,
      sortDirection: this.sortDirection,
      headerExtra: this.headerExtra,
    }),
  );
  colors = $derived.by(() => colorScale(this.layout.legend.map((g) => g.label)));
  matches = $derived.by(() => search(this.dataset.items, this.searchTerm, this.searchScope, this.tagSet));
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
    this.fit = view?.fit ?? (appSettings.stretchByDefault ? 'stretch' : 'none');
    this.sortBy = view?.sortBy ?? 'value';
    this.sortDirection = view?.sortDirection ?? 'ascending';
    this.buttonDirections[this.sortBy] = this.sortDirection;
    this.viewerColumns = view?.viewerColumns?.filter(has) ?? [...columns];
    this.searchTerm = view?.searchTerm ?? '';
    this.searchScope = view?.searchScope?.filter(has) ?? [...columns];
    this.legendCollapsed = view?.legendCollapsed ?? false;
    this.tagColumns = view?.tagColumns?.filter(has) ?? columns.filter((c) => /^tags$/i.test(c));
    this.tagIgnored = view?.tagIgnored ?? {};
  }

  // ---------- Tags ----------

  /** The column the viewer's tag editor writes to (created on first use) */
  get tagEditColumn(): string {
    return this.dataset.columns.find((c) => /^tags$/i.test(c)) ?? 'Tags';
  }

  isTagColumn(column: string): boolean {
    return this.tagSet.has(column);
  }

  setTagColumn(column: string, on: boolean): void {
    const others = this.tagColumns.filter((c) => c !== column);
    this.tagColumns = on ? [...others, column] : others;
  }

  /** Tag options: tags (lower-case) to leave out of grouping and coloring for a column */
  setIgnoredTags(column: string, keys: string[]): void {
    this.tagIgnored = { ...this.tagIgnored, [column]: keys };
  }

  catalog(column: string): TagInfo[] {
    return this.tagCatalogs.get(column) ?? [];
  }

  /** Writes a row's tags (sorted, de-duplicated) and keeps the open file in session storage up to date. */
  setTags(itemId: number, tags: string[]): void {
    const column = this.tagEditColumn;
    const isNew = !this.dataset.columns.includes(column);
    this.dataset = withCell(this.dataset, itemId, column, joinTags(tags));
    if (isNew) {
      this.searchScope = [...this.searchScope, column];
      this.viewerColumns = [...this.viewerColumns, column];
    }
    if (!this.tagColumns.includes(column)) this.tagColumns = [...this.tagColumns, column];
    saveSession(this.dataset);
  }

  /** Display text for a group or legend value of `column` */
  label(value: string, column: string): string {
    if (value.trim() === '' && this.tagSet.has(column)) return NO_TAGS_LABEL;
    return displayLabel(value);
  }

  /** The value this item is colored by (its tag combination, for a tag column) */
  colorValue(item: DataItem): string {
    return (this.#layoutById.get(item.id) ?? item).raw[this.colorKey];
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
    const { min, max } = zoomRange();
    const next = Math.round(Math.min(max, Math.max(min, zoom)) * 1000) / 1000;
    const wasFitting = this.fit !== 'none';
    this.fit = 'none';
    if (next === this.zoom && !wasFitting) return;
    // Suppress the block movement animation while the scale changes
    this.zooming = true;
    this.zoom = next;
    clearTimeout(this.#zoomTimer);
    this.#zoomTimer = setTimeout(() => (this.zooming = false), 150);
  }

  /**
   * "Stretch to fit": the bottom-right button and the Settings checkbox both call this.
   * Turning it off keeps the boxes at their current (square) size.
   */
  setStretch(on: boolean): void {
    if (on) this.fit = 'stretch';
    else if (this.fit === 'stretch') this.setZoom(this.displayScale);
  }

  colorOf(item: DataItem): Swatch {
    return this.colors.get(this.colorValue(item)) ?? FALLBACK;
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
      fit: this.fit,
      sortBy: this.sortBy,
      sortDirection: this.sortDirection,
      viewerColumns: [...this.viewerColumns],
      searchTerm: this.searchTerm,
      searchScope: [...this.searchScope],
      legendCollapsed: this.legendCollapsed,
      tagColumns: [...this.tagColumns],
      tagIgnored: { ...this.tagIgnored },
    };
  }
}
