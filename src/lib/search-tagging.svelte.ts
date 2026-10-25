import { tagKey } from './tags';
import type { Viz } from './viz.svelte';

/**
 * Tagging search matches: shared by the match count in the search box ("Tag these…") and
 * the row under the toolbar that shows the tag form and, briefly, what was done.
 */
export class SearchTagging {
  /** Set by the constructor; declared first so the derived values below can use it */
  viz = $state.raw<Viz>(null!);
  tagging = $state(false);
  draft = $state('');
  /**
   * The last bulk change made here. It is reported only until anything else happens: another
   * change to the data, a change to the view, a new search, or the user dismissing it.
   * Raw, so `undo` and `dataset` stay the very objects Viz holds and can be compared with them.
   */
  done = $state.raw<{
    tag: string;
    count: number;
    removed: boolean;
    term: string;
    undo: Viz['tagUndo'];
    dataset: Viz['dataset'];
    view: string;
  } | null>(null);

  total = $derived(this.viz.dataset.items.length);
  count = $derived(this.viz.matches?.size ?? 0);
  catalog = $derived(this.viz.catalog(this.viz.tagEditColumn));
  /** The search is a single existing tag ("price" or "\"price\""), so its matches can lose it */
  searchedTag = $derived.by(() => {
    const key = tagKey(this.viz.searchTerm.replace(/^"(.*)"$/, '$1'));
    return this.catalog.find((t) => t.key === key) ?? null;
  });
  /** What the view looks like: grouping, coloring and layout choices */
  view = $derived(
    [
      this.viz.groupKey,
      this.viz.colorKey,
      this.viz.split,
      this.viz.counts,
      this.viz.sortBy,
      this.viz.sortDirection,
      this.viz.fit,
      JSON.stringify(this.viz.tagIgnored),
    ].join('|'),
  );
  /** The report, while nothing else has happened since */
  current = $derived.by(() => {
    const done = this.done;
    const live = done && done.term === this.viz.searchTerm && done.dataset === this.viz.dataset && done.view === this.view;
    return live ? done : null;
  });
  undoable = $derived(this.current !== null && this.current.undo !== null && this.viz.tagUndo === this.current.undo);

  constructor(viz: Viz) {
    this.viz = viz;
  }

  start(): void {
    this.tagging = true;
    this.draft = this.searchedTag?.label ?? '';
  }

  cancel(): void {
    this.tagging = false;
  }

  apply(): void {
    const tag = this.draft.trim();
    if (!tag || !this.viz.matches) return;
    const label = this.catalog.find((t) => t.key === tagKey(tag))?.label ?? tag;
    this.#record(label, this.viz.tagItems(this.viz.matches, tag), false);
    this.tagging = false;
    this.draft = '';
  }

  removeSearched(): void {
    const tag = this.searchedTag;
    if (!tag || !this.viz.matches) return;
    this.#record(tag.label, this.viz.untagItems(this.viz.matches, tag.label), true);
    this.tagging = false;
  }

  undo(): void {
    this.viz.undoTags();
    this.done = null;
  }

  dismiss(): void {
    this.done = null;
  }

  colorByTag(tag: string): void {
    this.viz.colorByTag(tag);
  }

  /** Once something else has happened the report is gone for good (it won't return if that is undone) */
  tidy(): void {
    if (this.done && !this.current) this.done = null;
    if (this.count === 0) this.tagging = false;
  }

  #record(tag: string, changed: number, removed: boolean): void {
    this.done = {
      tag,
      count: changed,
      removed,
      term: this.viz.searchTerm,
      undo: changed ? this.viz.tagUndo : null,
      dataset: this.viz.dataset,
      view: this.view,
    };
  }
}
