import { colorScale, type Swatch } from './colors';
import { computeLayout, zoomBounds, type SortBy, type SortDirection } from './layout';
import { displayLabel, NO_TAGS_LABEL, type Dataset, type DataItem, type ListSeparator } from './data';
import { DEFAULT_CLOSEST, type FitMode, type SearchMode, type ViewState } from './persist';
import { canFindByMeaning, SemanticSearch, type MeaningMatch } from './semantic/search.svelte';
import { groupingItems, tagCatalog, type TagInfo } from './tags';
import { search } from './search';
import { topTerms } from './terms';
import { appSettings } from './settings.svelte';
import * as tagEdits from './tag-edits';

export const ZOOM = { step: 0.1 } as const;

/** Zoom range allowed by the box size limits in Settings. */
export function zoomRange(): { min: number; max: number } {
  return zoomBounds(appSettings);
}

const FALLBACK: Swatch = { fill: '#cccccc', stroke: '#cccccc' };

/** Everything about the current visualization view, ported from the original Visualize + Search models. */
export class Viz {
  /** Replaced (not mutated) when AI auto-coding adds a column */
  dataset = $state.raw<Dataset>(null!);

  /** Rows: one per value of this column; null for column bands only */
  rowKey = $state<string | null>('');
  /** Column bands: one per value of this column; null for rows only. At least one of the two is set. */
  columnKey = $state<string | null>(null);
  colorKey = $state('');
  /** When true the color column follows the grouping ("Automatic") */
  automatic = $state(true);
  counts = $state(false);
  zoom = $state(1);
  /** Fitting stays on (through resizes and regrouping) until the user zooms by hand */
  fit = $state<FitMode>('none');
  /** The scale currently on screen (kept up to date by the viewer), so leaving a fit keeps the same size */
  displayScale = 1;
  zooming = $state(false);
  sortBy = $state<SortBy>('value');
  sortDirection = $state<SortDirection>('ascending');
  /** Each sort button remembers its own direction, as in the original toolbar */
  buttonDirections = $state<Record<'value' | 'count', SortDirection>>({ value: 'ascending', count: 'descending' });
  /** What the A–Z button last showed (A–Z, Z–A or custom), so switching back from count restores it */
  #valueSort: 'value' | 'custom' = 'value';
  viewerColumns = $state<string[]>([]);
  searchTerm = $state('');
  searchScope = $state<string[]>([]);
  /** Find by text (words and phrases as typed) or by meaning (sentences that mean something similar) */
  searchMode = $state<SearchMode>('text');
  /** "Find similar": the data item whose closest items are shown, in place of a typed search */
  similarTo = $state<number | null>(null);
  /** How many of the closest data items a meaning search shows (exact text matches come on top) */
  closest = $state(DEFAULT_CLOSEST);
  /** The model and vectors behind finding by meaning; it does nothing until meaning mode is used */
  semantic = new SemanticSearch();
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
  /** Extra label width for a few too-narrow bands (scale-1 px, by band position; set by the viewer) */
  bandPads = $state.raw<number[]>([]);
  /** Top of the first data row, measured by the viewer, so the legend can line up with it */
  firstRowTop = $state(0);
  /** Columns whose cells hold lists of values (tags are one kind) */
  tagColumns = $state<string[]>([]);
  /** Per list column: how its cells are split into values (default: commas or semicolons) */
  listSeparators = $state<Record<string, ListSeparator>>({});
  /** The column chosen for tags; null means a column named "Tags" (created on first use) */
  tagsColumnChoice = $state<string | null>(null);
  /** The last bulk tag change (Tag matches, Manage tags), until something else changes the tags */
  tagUndo = $state.raw<{ label: string; restore: () => void } | null>(null);
  /** Per tag column: tags (lower-case) left out of grouping and coloring */
  tagIgnored = $state<Record<string, string[]>>({});
  /** Per column: the value order dragged in the legend (colors, split bands, and A–Z rows follow it) */
  valueOrders = $state<Record<string, string[]>>({});

  tagSet = $derived.by(() => new Set(this.tagColumns.filter((c) => this.dataset.columns.includes(c))));
  /** Tags in each tag column, most used first */
  /** List columns with how each one is split, for search */
  listColumns = $derived.by(() => new Map([...this.tagSet].map((c) => [c, this.separatorOf(c)])));
  tagCatalogs = $derived.by(() => new Map([...this.tagSet].map((c) => [c, tagCatalog(this.dataset.items, c, this.separatorOf(c))])));
  /** Items as the layout sees them: tag columns used for grouping/coloring hold the row's tag combination */
  layoutItems = $derived.by(() =>
    groupingItems(
      this.dataset.items,
      [...new Set([this.rowKey, this.columnKey, this.colorKey])]
        .filter((c): c is string => c !== null && this.tagSet.has(c))
        .map((c) => ({
          column: c,
          catalog: this.tagCatalogs.get(c) ?? [],
          ignored: new Set(this.tagIgnored[c] ?? []),
          separator: this.separatorOf(c),
        })),
    ),
  );
  #layoutById = $derived.by(() => new Map(this.layoutItems.map((item) => [item.id, item])));

  layout = $derived.by(() =>
    computeLayout(this.layoutItems, {
      rowKey: this.rowKey,
      columnKey: this.columnKey,
      colorKey: this.colorKey,
      counts: this.counts,
      sortBy: this.sortBy,
      sortDirection: this.sortDirection,
      headerExtra: this.headerExtra,
      bandPads: this.bandPads,
      legendOrder: this.valueOrders[this.colorKey],
      rowOrder: this.rowKey !== null ? this.valueOrders[this.rowKey] : undefined,
      columnOrder: this.columnKey !== null ? this.valueOrders[this.columnKey] : undefined,
    }),
  );
  colors = $derived.by(() => colorScale(this.layout.legend.map((g) => g.label)));
  /** Meaning mode, where this page can offer it (not in a saved file, and not in Classic Nineteen) */
  meaningOn = $derived(this.searchMode === 'meaning' && canFindByMeaning() && !appSettings.classic);
  /** Identifies the current meaning search, so results from an earlier one are never shown for it */
  meaningKey = $derived.by(() => {
    const query = this.similarTo !== null ? `item:${this.similarTo}` : `text:${this.searchTerm.trim()}`;
    return `${query}|${this.closest}|${this.semantic.indexVersion}`;
  });
  /**
   * What the text search looks for. By meaning, the search is a sentence, not a list of words, so
   * its exact matches are the data items containing it as a phrase (not everything with "the" in it).
   */
  textTerm = $derived.by(() => {
    const term = this.searchTerm.trim();
    if (!this.meaningOn || !term) return this.searchTerm;
    return /^".*"$/.test(term) ? term : `"${term}"`;
  });
  /** Matching ids, or null when nothing is searched. By meaning: the closest items plus any exact text matches. */
  matches = $derived.by(() => {
    const exact = search(this.dataset.items, this.textTerm, this.searchScope, this.listColumns);
    if (!this.meaningOn) return exact;
    if (this.similarTo === null && !this.searchTerm.trim()) return null;
    const ids = new Set(exact ?? []);
    const results = this.semantic.results;
    if (results && results.key === this.meaningKey) for (const id of results.matches.keys()) ids.add(id);
    return ids;
  });
  /** High-frequency words; only computed when the word list is opened */
  terms = $derived.by(() => topTerms(this.dataset.items, this.searchScope));

  #zoomTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(dataset: Dataset, view?: ViewState) {
    this.dataset = dataset;
    const columns = dataset.columns;
    const has = (c: string | null | undefined): c is string => !!c && columns.includes(c);
    const legacyRows = has(view?.groupKey) ? view.groupKey : columns[0];
    if (view && 'columnKey' in view) {
      // Saved with rows, columns or both
      this.rowKey = has(view.rowKey) ? view.rowKey : null;
      this.columnKey = has(view.columnKey) ? view.columnKey : null;
      if (this.rowKey === null && this.columnKey === null) this.rowKey = legacyRows;
    } else {
      this.rowKey = legacyRows;
    }
    this.automatic = view?.automatic ?? true;
    this.colorKey = !this.automatic && has(view?.colorKey) ? view.colorKey : this.groupKey;
    // Saved before columns were their own choice: "split" meant columns by the color column
    if (view && !('columnKey' in view) && !this.automatic && view.split) this.columnKey = this.colorKey;
    this.counts = view?.counts ?? false;
    this.zoom = view?.zoom ?? 1;
    this.fit = view?.fit ?? (appSettings.stretchByDefault ? 'stretch' : 'none');
    this.sortBy = view?.sortBy ?? 'value';
    this.sortDirection = view?.sortDirection ?? 'ascending';
    if (this.sortBy !== 'custom') this.buttonDirections[this.sortBy] = this.sortDirection;
    else this.#valueSort = 'custom';
    this.viewerColumns = view?.viewerColumns?.filter(has) ?? [...columns];
    this.searchTerm = view?.searchTerm ?? '';
    this.searchScope = view?.searchScope?.filter(has) ?? [...columns];
    this.searchMode = view?.searchMode === 'meaning' ? 'meaning' : 'text';
    this.similarTo = this.searchMode === 'meaning' && dataset.items.some((item) => item.id === view?.similarTo) ? view!.similarTo! : null;
    this.closest = Number.isInteger(view?.closest) && view!.closest! > 0 ? view!.closest! : DEFAULT_CLOSEST;
    this.legendCollapsed = view?.legendCollapsed ?? false;
    this.tagColumns = view?.tagColumns?.filter(has) ?? columns.filter((c) => /^tags$/i.test(c));
    this.listSeparators = view?.listSeparators ?? {};
    this.tagsColumnChoice = has(view?.tagsColumn) ? view.tagsColumn : null;
    this.tagIgnored = view?.tagIgnored ?? {};
    this.valueOrders = view?.valueOrders ?? {};
  }

  // ---------- Rows, columns and color ----------

  /** The main grouping: the row column, or the column column when there are no rows */
  get groupKey(): string {
    return this.rowKey ?? this.columnKey ?? this.dataset.columns[0];
  }

  /** Whether the boxes are split into column bands */
  get split(): boolean {
    return this.columnKey !== null;
  }

  /** Rows by a column, or `null` for column bands only (ignored while there are no bands). */
  setRowKey(key: string | null): void {
    if (key === null && this.columnKey === null) return;
    this.rowKey = key;
    this.#followGrouping();
  }

  /** The column column last shown, so Stack and Split can take the bands away and bring them back */
  #lastColumnKey: string | null = null;

  /** Column bands by a column, or `null` for rows only (ignored while there are no rows). */
  setColumnKey(key: string | null): void {
    if (key === null && this.rowKey === null) return;
    if (key !== null) this.#lastColumnKey = key;
    else if (this.columnKey !== null) this.#lastColumnKey = this.columnKey;
    this.columnKey = key;
    this.#followGrouping();
  }

  /** "Stack" takes the column bands away; "Split" brings the last ones back, or bands by the color column. */
  setSplit(on: boolean): void {
    this.setColumnKey(on ? (this.#lastColumnKey ?? this.colorKey) : null);
  }

  /** Whether the Split/Stack button has anything to do: rows to split, and a column to split them by */
  get canSplit(): boolean {
    if (this.rowKey === null) return false;
    return this.columnKey !== null || this.#lastColumnKey !== null || this.colorKey !== this.rowKey;
  }

  /** What Split would split the rows by */
  get splitColumn(): string {
    return this.#lastColumnKey ?? this.colorKey;
  }

  #followGrouping(): void {
    if (this.automatic) this.colorKey = this.groupKey;
  }

  /** The grouping Classic Nineteen folded away, and what it left, so leaving Classic can put it back */
  #foldedByClassic: { rowKey: string | null; columnKey: string | null; left: { rowKey: string | null; columnKey: string | null } } | null =
    null;

  /** Classic Nineteen: rows, split by the color column at most. */
  applyClassic(): void {
    const before = { rowKey: this.rowKey, columnKey: this.columnKey };
    if (this.rowKey === null) {
      this.rowKey = this.columnKey;
      this.columnKey = null;
    } else if (this.columnKey !== null && this.columnKey !== this.colorKey) {
      this.columnKey = null;
    }
    this.#followGrouping();
    if (before.rowKey !== this.rowKey || before.columnKey !== this.columnKey) {
      this.#foldedByClassic = { ...before, left: { rowKey: this.rowKey, columnKey: this.columnKey } };
    }
  }

  /** Leaving Classic: the grouping it folded away comes back, unless the grouping was changed meanwhile. */
  leaveClassic(): void {
    const folded = this.#foldedByClassic;
    this.#foldedByClassic = null;
    if (!folded || folded.left.rowKey !== this.rowKey || folded.left.columnKey !== this.columnKey) return;
    this.rowKey = folded.rowKey;
    this.columnKey = folded.columnKey;
    this.#followGrouping();
  }

  // ---------- Legend order ----------

  /** Moves a legend entry to a new position; colors are reassigned in the new order. */
  moveLegendEntry(from: number, to: number): void {
    const labels = this.layout.legend.map((g) => g.label);
    if (from === to || from < 0 || to < 0 || from >= labels.length || to >= labels.length) return;
    const [moved] = labels.splice(from, 1);
    labels.splice(to, 0, moved);
    this.valueOrders = { ...this.valueOrders, [this.colorKey]: labels };
    // Rows grouped by the same field show the new order too
    if (this.colorKey === this.groupKey) this.#useRowOrder();
  }

  // ---------- Row order ----------

  /** Whether the grouping field has a custom (dragged) order */
  get hasRowOrder(): boolean {
    return (this.valueOrders[this.groupKey]?.length ?? 0) > 0;
  }

  /** The A–Z button's state: custom only while the grouping field actually has a custom order */
  get valueSortShown(): 'ascending' | 'descending' | 'custom' {
    if (this.sortBy === 'custom' && this.hasRowOrder) return 'custom';
    if (this.sortBy === 'custom') return 'ascending';
    return this.buttonDirections.value;
  }

  /** Moves a row (by position) and shows rows in that custom order; it is kept for this field. */
  moveRow(from: number, to: number): void {
    const labels = this.layout.groups.map((g) => g.label);
    if (from === to || from < 0 || to < 0 || from >= labels.length || to >= labels.length) return;
    const [moved] = labels.splice(from, 1);
    labels.splice(to, 0, moved);
    this.valueOrders = { ...this.valueOrders, [this.groupKey]: labels };
    this.#useRowOrder();
  }

  #useRowOrder(): void {
    this.sortBy = 'custom';
    this.sortDirection = 'ascending';
    this.#valueSort = 'custom';
  }

  get hasCustomOrder(): boolean {
    return (this.valueOrders[this.colorKey]?.length ?? 0) > 0;
  }

  resetLegendOrder(): void {
    const { [this.colorKey]: _removed, ...rest } = this.valueOrders;
    this.valueOrders = rest;
  }

  /** Forgets the grouping field's custom row order and goes back to A–Z. */
  resetRowOrder(): void {
    const { [this.groupKey]: _removed, ...rest } = this.valueOrders;
    this.valueOrders = rest;
    if (this.sortBy === 'custom') this.sort('value');
  }

  // ---------- Lists and tags ----------

  /** The column the viewer's tag field, "Tag matches" and Manage tags write to (created on first use) */
  get tagEditColumn(): string {
    const choice = this.tagsColumnChoice;
    if (choice && this.dataset.columns.includes(choice)) return choice;
    return this.dataset.columns.find((c) => /^tags$/i.test(c)) ?? 'Tags';
  }

  /** Whether the tags column exists yet (it is created by the first tag) */
  get hasTags(): boolean {
    return this.dataset.columns.includes(this.tagEditColumn);
  }

  /** Whether a column's cells hold lists of values */
  isTagColumn(column: string): boolean {
    return this.tagSet.has(column);
  }

  setTagColumn(column: string, on: boolean): void {
    const others = this.tagColumns.filter((c) => c !== column);
    this.tagColumns = on ? [...others, column] : others;
    // A column that no longer holds lists can't hold the tags either
    if (!on && this.tagsColumnChoice === column) this.tagsColumnChoice = null;
  }

  /** Makes a column the dataset's tags column (it then also holds lists). */
  setTagsColumn(column: string): void {
    this.tagsColumnChoice = column;
    this.setTagColumn(column, true);
    this.tagUndo = null;
  }

  /** Goes back to storing tags in a column named "Tags". */
  resetTagsColumn(): void {
    this.tagsColumnChoice = null;
    this.tagUndo = null;
  }

  separatorOf(column: string): ListSeparator {
    return this.listSeparators[column] ?? 'auto';
  }

  setListSeparator(column: string, separator: ListSeparator): void {
    this.listSeparators = { ...this.listSeparators, [column]: separator };
  }

  /** List display options: values (lower-case) to leave out of grouping and coloring for a column */
  setIgnoredTags(column: string, keys: string[]): void {
    this.tagIgnored = { ...this.tagIgnored, [column]: keys };
  }

  catalog(column: string): TagInfo[] {
    return this.tagCatalogs.get(column) ?? [];
  }

  /** A column name not used yet: `name`, or `name (2)`, `name (3)`, … */
  freeColumnName(name: string): string {
    let candidate = name;
    for (let n = 2; this.dataset.columns.includes(candidate); n++) candidate = `${name} (${n})`;
    return candidate;
  }

  // ---------- Tag editing (the work is in tag-edits.ts; these keep the view's API in one place) ----------

  /** Writes a row's tags (sorted, de-duplicated). */
  setTags(itemId: number, tags: string[]): void {
    tagEdits.setTags(this, itemId, tags);
  }

  undoTags(): void {
    this.tagUndo?.restore();
  }

  /** Adds a tag to the given data items (those that don't have it already); returns how many changed. */
  tagItems(ids: ReadonlySet<number>, tag: string): number {
    return tagEdits.tagItems(this, ids, tag);
  }

  /** Removes a tag from the given data items; returns how many changed. */
  untagItems(ids: ReadonlySet<number>, tag: string): number {
    return tagEdits.untagItems(this, ids, tag);
  }

  /** Renames a tag everywhere; renaming onto another existing tag combines the two. */
  renameTag(from: string, to: string): number {
    return tagEdits.renameTag(this, from, to);
  }

  /** Combines one tag into another: every item tagged `from` is tagged `into` instead. */
  combineTags(from: string, into: string): number {
    return tagEdits.combineTags(this, from, into);
  }

  /** Removes a tag from every data item. */
  deleteTag(tag: string): number {
    return tagEdits.deleteTag(this, tag);
  }

  /** Colors the view by one tag: data items with it versus everything else. */
  colorByTag(tag: string): void {
    tagEdits.colorByTag(this, tag);
  }

  /** Converts a tag into a True/False data field (removing the tag unless `keepTag`); returns the field's name. */
  tagToColumn(tag: string, name: string, keepTag = false): string {
    return tagEdits.tagToColumn(this, tag, name, keepTag);
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

  /** `null` selects "Automatic" (color follows the grouping). */
  setColorKey(key: string | null): void {
    if (key === null) {
      this.automatic = true;
      this.colorKey = this.groupKey;
    } else {
      this.automatic = false;
      this.colorKey = key;
    }
  }

  /**
   * Sorting buttons. The count button reverses when clicked again. The A–Z button cycles
   * A–Z → Z–A → custom (★, once the grouping field has a custom order) → A–Z. Switching
   * between the two buttons restores each one's last state.
   */
  sort(by: 'value' | 'count'): void {
    if (by === 'count') {
      if (this.sortBy === 'count') this.buttonDirections.count = this.sortDirection === 'ascending' ? 'descending' : 'ascending';
      this.sortBy = 'count';
      this.sortDirection = this.buttonDirections.count;
      return;
    }
    if (this.sortBy === 'count') {
      // Back to whatever the A–Z button showed before
      if (this.#valueSort === 'custom' && this.hasRowOrder) return this.#useRowOrder();
      this.sortBy = 'value';
      this.sortDirection = this.buttonDirections.value;
      return;
    }
    const shown = this.valueSortShown;
    if (shown === 'ascending') this.#setValueSort('descending');
    else if (shown === 'descending' && this.hasRowOrder) this.#useRowOrder();
    else this.#setValueSort('ascending');
  }

  #setValueSort(direction: SortDirection): void {
    this.sortBy = 'value';
    this.sortDirection = direction;
    this.buttonDirections.value = direction;
    this.#valueSort = 'value';
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
    this.tagUndo = null;
    const added = dataset.columns.filter((c) => !this.dataset.columns.includes(c));
    this.dataset = dataset;
    this.viewerColumns = dataset.columns.filter((c) => this.viewerColumns.includes(c) || added.includes(c));
    this.searchScope = dataset.columns.filter((c) => this.searchScope.includes(c) || added.includes(c));
    this.setColorKey(colorKey);
  }

  isMatch(item: DataItem): boolean {
    return this.matches?.has(item.id) ?? false;
  }

  // ---------- Finding by meaning ----------

  setSearchMode(mode: SearchMode): void {
    this.searchMode = mode;
    if (mode === 'text') this.similarTo = null;
  }

  /** Shows the data items closest in meaning to one data item. */
  findSimilar(itemId: number): void {
    this.searchMode = 'meaning';
    this.searchTerm = '';
    this.similarTo = itemId;
  }

  /** Back to the typed search (still by meaning). */
  clearSimilar(): void {
    this.similarTo = null;
  }

  /** How a data item matched the current meaning search, if it did */
  meaningMatch(item: DataItem): MeaningMatch | null {
    if (!this.meaningOn) return null;
    const results = this.semantic.results;
    return results && results.key === this.meaningKey ? (results.matches.get(item.id) ?? null) : null;
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
      rowKey: this.rowKey,
      columnKey: this.columnKey,
      // For files opened by earlier versions, which know one grouping and a split by color
      groupKey: this.groupKey,
      split: this.split,
      colorKey: this.colorKey,
      automatic: this.automatic,
      counts: this.counts,
      zoom: this.zoom,
      fit: this.fit,
      sortBy: this.sortBy,
      sortDirection: this.sortDirection,
      viewerColumns: [...this.viewerColumns],
      searchTerm: this.searchTerm,
      searchScope: [...this.searchScope],
      searchMode: this.searchMode,
      similarTo: this.similarTo,
      closest: this.closest,
      legendCollapsed: this.legendCollapsed,
      tagColumns: [...this.tagColumns],
      listSeparators: { ...this.listSeparators },
      tagsColumn: this.tagsColumnChoice ?? undefined,
      tagIgnored: { ...this.tagIgnored },
      valueOrders: { ...this.valueOrders },
    };
  }
}
