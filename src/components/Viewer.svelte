<script module lang="ts">
  export type ToolbarDropdown = 'terms' | 'searchMode' | 'searchIn' | 'counts' | 'viewerColumns';
</script>

<script lang="ts">
  import { onMount, tick, untrack, type Snippet } from 'svelte';
  import { displayLabel, type DataItem } from '../lib/data';
  import { boxScale, GEOMETRY, type CountsMode } from '../lib/layout';
  import { BAND, decideBandLabels, HEADER_FONT_MAX, HEADER_ROW, LABEL_FONT, ONE_LINE, type MeasureLabel } from '../lib/band-labels';
  import type { Popups } from '../lib/popups.svelte';
  import { appSettings } from '../lib/settings.svelte';
  import { ZOOM, zoomRange, type Viz } from '../lib/viz.svelte';
  import MeaningBar from './MeaningBar.svelte';
  import SearchTagBar from './SearchTagBar.svelte';
  import { SearchTagging } from '../lib/search-tagging.svelte';
  import { canFindByMeaning } from '../lib/semantic/search.svelte';
  import { ListReorder } from '../lib/reorder.svelte';
  import { dataItems } from '../lib/text';

  interface Props {
    viz: Viz;
    popups: Popups;
    open: string | null;
    ontoggle: (name: ToolbarDropdown, anchor: HTMLElement) => void;
    /** "Analyze with AI": lives in the toolbar with the other ways of working with the data */
    aiOpen: boolean;
    ontoggleai: () => void;
    /** "Manage tags": next to "Analyze with AI" (always shown, so tagging is easy to discover) */
    tagsOpen: boolean;
    ontoggletags: () => void;
    /** Shown to the right of the visualization, directly under the toolbar (the AI panel) */
    side?: Snippet;
  }

  let { viz, popups, open, ontoggle, aiOpen, ontoggleai, tagsOpen, ontoggletags, side }: Props = $props();

  /** Tagging search matches: the count and "Tag these…" in the search box, the form and report under the toolbar */
  const st = $derived(new SearchTagging(viz));
  /** Width of the match count inside the search box, so typed text stops short of it */
  let countWidth = $state(0);
  /** Finding by meaning is offered where the page can do it (not in a saved file), outside Classic Nineteen */
  const canMeaning = $derived(canFindByMeaning() && !appSettings.classic);
  const semantic = $derived(viz.semantic);
  const percent = (fraction: number | null) => (fraction === null ? '' : ` ${Math.round(fraction * 100)}%`);
  /** What finding by meaning is doing, shown in place of the match count until there is one */
  const meaningStatus = $derived.by(() => {
    if (!viz.meaningOn) return null;
    switch (semantic.status) {
      case 'asking':
        return 'Download needed';
      case 'loading':
        return `Loading model${percent(semantic.progress)}`;
      case 'indexing':
        return `Reading data${percent(semantic.progress)}`;
      case 'error':
        return 'Not working';
      default:
        return semantic.finding ? 'Finding…' : null;
    }
  });

  /**
   * Vertical sizes use em (they follow the row font size); horizontal sizes use px (they follow
   * scale.x). Box positions use px for both: a transitioned transform must not depend on the
   * font size, which transitions too, or each frame of the one restarts the other.
   */
  const em = (px: number) => `${px / GEOMETRY.font}em`;
  const px = (n: number) => `${n}px`;

  let measureEl: HTMLElement;
  let wrapperEl: HTMLElement;
  let visualizerEl: HTMLElement;
  let rowItemsEl: HTMLElement;
  let viewWidth = $state(0);
  let viewHeight = $state(0);
  /** Label column width at scale 1 */
  let labelWidth = $state(0);
  let animate = $state(false);
  /**
   * Above this many data items the boxes move without gliding: a transition on every box puts
   * each one on its own compositor layer, which stalls large files for seconds after any change
   * (measured: 20,000 boxes made "Show counts" take 6 s animated and 0.2 s without)
   */
  const ANIMATED_ITEMS_MAX = 3000;
  const animated = $derived(animate && viz.dataset.items.length <= ANIMATED_ITEMS_MAX);
  let resizing = $state(false);
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;

  const layout = $derived(viz.layout);
  /** What the sort buttons order: the rows, or the column bands when there are no rows */
  const sorted = $derived(viz.rowKey !== null ? 'rows' : 'columns');
  /** Band labels start with a swatch when the bands are the color column's values */
  const bandSwatches = $derived(viz.columnKey === viz.colorKey);
  const classic = $derived(appSettings.classic);
  const COUNTS_LABELS: Record<CountsMode, string> = { none: 'Show counts', count: 'Counts', row: 'Row %', column: 'Column %' };
  const countsLabel = $derived(COUNTS_LABELS[viz.countsShown]);

  // ---------- Reordering rows by dragging their labels ----------

  let labelsEl = $state<HTMLElement>();
  const rowOrder = new ListReorder({
    container: () => labelsEl,
    entries: () => labelsEl?.querySelectorAll<HTMLElement>('.row-label') ?? [],
    length: () => layout.groups.length,
    enabled: () => true,
    onmove: (from, to) => viz.moveRow(from, to),
  });

  function rowKeydown(index: number, event: KeyboardEvent) {
    const to = rowOrder.keydown(index, event);
    // Keep focus on the moved row
    if (to !== null) tick().then(() => labelsEl?.querySelectorAll<HTMLElement>('.row-label')[to]?.focus());
  }

  /** The dragged row's group, and its data items (the whole row follows the pointer) */
  const draggedLabel = $derived(rowOrder.from !== null ? (layout.groups[rowOrder.from]?.label ?? null) : null);
  const draggedIds = $derived(new Set(rowOrder.from !== null ? (layout.groups[rowOrder.from]?.items.map((i) => i.id) ?? []) : []));
  const dragOffset = $derived(rowOrder.active ? `0 ${rowOrder.dy}px` : null);
  /** A count label belongs to a row: keyed by the group, or "band\0group" in split view */
  const inDraggedRow = (key: string) => draggedLabel !== null && (key === draggedLabel || key.endsWith(`\u0000${draggedLabel}`));
  const fitMode = $derived(viz.fit);
  const range = $derived(zoomRange());
  const sizing = $derived({
    minWidth: appSettings.minWidth,
    maxWidth: appSettings.maxWidth,
    minHeight: appSettings.minHeight,
    maxHeight: appSettings.maxHeight,
    zoom: viz.zoom,
    // Leave room for a vertical scrollbar
    viewWidth: viewWidth - 4,
    viewHeight,
    labelWidth,
    rowWidth: layout.rowWidth,
    countWidth: layout.countWidth,
    rows: layout.rowCount,
    extraHeight: layout.headerExtra,
  });
  /** Horizontal / vertical scale relative to the original 18px boxes */
  const scale = $derived(boxScale({ ...sizing, fit: fitMode !== 'none', square: fitMode !== 'stretch' }));
  const fontSize = $derived(px(scale.y * GEOMETRY.font));
  /** Band labels: the row font, capped; their row stays the height the box size gives it */
  const headerScale = $derived(Math.min(scale.y, HEADER_FONT_MAX / GEOMETRY.font));
  const headerFontSize = $derived(px(headerScale * GEOMETRY.font));
  /** Vertical sizes that follow the box size, in px (positions, and elements whose own font is capped) */
  const rem = (n: number) => px(n * scale.y);

  $effect(() => {
    viz.displayScale = scale.y;
  });
  const edge = $derived(Math.min(scale.x, scale.y));
  /** Screen x for a layout position: box space follows box width, count space follows text size */
  const sx = (x: number, cx: number) => px(x * scale.x + cx * scale.y);

  // Boxes animate when the layout changes (regrouping, tagging, a fit that rescales them), but
  // not while the window or pane is being resized, where they should follow the edge directly
  let lastView = { width: 0, height: 0 };
  $effect.pre(() => {
    const width = viewWidth;
    const height = viewHeight;
    if (width === lastView.width && height === lastView.height) return;
    lastView = { width, height };
    resizing = true;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => (resizing = false), 150);
  });

  // Label column width at scale 1 decides where the blocks start. It is measured on a hidden copy
  // at the base font size, so it never depends on the current scale (which itself depends on it).
  // Measured again once the web font has loaded, since the fallback font has different widths.
  $effect(() => {
    void layout.groups;
    void fontsReady;
    tick().then(() => {
      // +2px: small fonts render slightly wider than a straight scale-down predicts
      if (measureEl) labelWidth = measureEl.offsetWidth + 2;
    });
  });

  // ---------- Split-view value labels: one line, wrapped, or turned ----------

  const measureCtx = document.createElement('canvas').getContext('2d');
  /** Text width at scale 1 in the label font; the canvas is the only way to measure without rendering */
  const measureLabel: MeasureLabel = (text, weight) => {
    measureCtx!.font = `${weight} ${GEOMETRY.font}px ${LABEL_FONT}`;
    return measureCtx!.measureText(text).width;
  };
  let fontsReady = $state(0);

  /**
   * How wide boxes are relative to their height on screen (1 unless stretched). Band widths
   * follow box width but label text follows box height, so stretched-narrow boxes leave less
   * room for labels. Measured as fitting would set it without the label row's extra height,
   * so it never depends on the label mode it helps decide (no feedback loop with fitting).
   */
  const boxAspect = $derived.by(() => {
    // Without the label row's extra height and without any band widening, which this helps decide
    const base = boxScale({
      ...sizing,
      countWidth: layout.countWidth - layout.padWidth,
      extraHeight: 0,
      fit: fitMode !== 'none',
      square: fitMode !== 'stretch',
    });
    // Against the capped label font: text stays small while boxes grow, so more of it fits
    return base.y > 0 ? base.x / Math.min(base.y, HEADER_FONT_MAX / GEOMETRY.font) : 1;
  });

  /** One line, wrapped, or turned, with any band widening; measured again once the web font has loaded */
  const headerMode = $derived.by(() => {
    void fontsReady;
    if (!measureCtx) return ONE_LINE;
    return decideBandLabels(
      layout.headers,
      (header) => viz.label(header.label, viz.columnKey ?? viz.colorKey),
      boxAspect,
      measureLabel,
      bandSwatches,
    );
  });

  $effect(() => {
    viz.headerMode = headerMode.mode;
    viz.headerLines = headerMode.lines;
    viz.headerExtra = headerMode.extra;
    // Only replace the array when it changes, so the layout isn't rebuilt for nothing
    const pads = headerMode.pads;
    const current = untrack(() => viz.bandPads);
    if (pads.length !== current.length || pads.some((p, i) => p !== current[i])) viz.bandPads = pads;
  });

  // Where the first data row starts (below the toolbar and any split label row), ignoring scrolling,
  // so the legend's first entry can line up with it
  $effect(() => {
    void layout;
    void scale.x;
    void scale.y;
    void headerMode.extra;
    void viz.aiHighlight;
    // The rows under the toolbar (tagging, the meaning download question) come and go
    void st.current;
    void st.tagging;
    void semantic.status;
    tick().then(() => {
      const first = rowItemsEl?.querySelector('.row:not(.row-header)');
      if (!first || !wrapperEl) return;
      const top = first.getBoundingClientRect().top - wrapperEl.getBoundingClientRect().top + (visualizerEl?.scrollTop ?? 0);
      viz.firstRowTop = Math.round(top);
    });
  });

  onMount(() => {
    document.fonts?.ready.then(() => fontsReady++);
    // Animate block moves only after the initial placement
    requestAnimationFrame(() => requestAnimationFrame(() => (animate = true)));
  });

  function enter(item: DataItem, event: PointerEvent) {
    viz.hoveredColor = viz.colorValue(item);
    if (event.pointerType === 'touch') return;
    popups.show(item.id, (event.currentTarget as HTMLElement).getBoundingClientRect());
  }

  function leave(item: DataItem) {
    viz.hoveredColor = null;
    popups.scheduleHide(item.id);
  }

  function click(item: DataItem, event: MouseEvent) {
    if (!popups.find(item.id)) popups.show(item.id, (event.currentTarget as HTMLElement).getBoundingClientRect());
    popups.toggleFloating(item.id);
  }

  function keydown(item: DataItem, event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      if (!popups.find(item.id)) popups.show(item.id, rect);
      popups.toggleFloating(item.id);
    }
  }

  /** Clicking an active fit button keeps the current size and returns to manual zoom. */
  function toggleBestFit() {
    if (fitMode === 'square') viz.setZoom(scale.y);
    else viz.fit = 'square';
  }

  /** Manual zoom continues from whatever size is showing, including a fitted one. */
  function zoomBy(step: number) {
    viz.setZoom(scale.y + step);
  }

  function toggle(name: ToolbarDropdown) {
    return (event: MouseEvent) => ontoggle(name, event.currentTarget as HTMLElement);
  }
</script>

<div
  class="viewer-wrapper"
  bind:this={wrapperEl}
  style:--band-gap={BAND.gap}
  style:--band-swatch={BAND.swatch}
  style:--band-total-margin={BAND.totalMargin}
  style:--band-line-height={BAND.lineHeight}
>
  <form id="tool-bar" onsubmit={(e) => e.preventDefault()} aria-label="Visualization tools">
    <button
      type="button"
      class="block-sort sort-value"
      class:sort-active={viz.sortBy !== 'count'}
      class:sort-horizontal={sorted === 'columns'}
      class:sort-reverse={viz.valueSortShown === 'descending'}
      class:sort-custom={viz.valueSortShown === 'custom'}
      title={viz.valueSortShown === 'custom'
        ? `${sorted === 'rows' ? 'Rows' : 'Columns'} in your custom order (click for A–Z)`
        : viz.hasRowOrder
          ? `Sort ${sorted} ${viz.valueSortShown === 'ascending' ? 'A–Z (click for Z–A)' : 'Z–A (click for your custom order)'}`
          : sorted === 'rows'
            ? 'Sort rows alphabetically. Drag a row label to put rows in your own order.'
            : 'Sort columns alphabetically'}
      aria-label="Sort {sorted}: {viz.valueSortShown === 'custom'
        ? 'custom order'
        : viz.valueSortShown === 'ascending'
          ? 'A to Z'
          : 'Z to A'}"
      aria-pressed={viz.sortBy !== 'count'}
      onclick={() => viz.sort('value')}
    ></button>
    <button
      type="button"
      class="block-sort sort-count"
      class:sort-active={viz.sortBy === 'count'}
      class:sort-horizontal={sorted === 'columns'}
      class:sort-reverse={viz.buttonDirections.count === 'descending'}
      title="Sort {sorted} by number of items"
      aria-label="Sort {sorted} by number of items ({viz.buttonDirections.count})"
      aria-pressed={viz.sortBy === 'count'}
      onclick={() => viz.sort('count')}
    ></button>
    <!-- The find group: the word list, the field and its two settings, boxed together -->
    <div id="find" class:meaning={viz.meaningOn} role="group" aria-label="Find">
      <button
        type="button"
        id="search-icon"
        class="dropdown-arrow"
        title="High-frequency words"
        aria-label="High-frequency words"
        aria-expanded={open === 'terms'}
        onclick={toggle('terms')}
      ></button>
      <div id="search">
        {#if viz.meaningOn && viz.similarTo !== null}
          <!-- "Find similar": the data item takes the place of a typed search -->
          <div class="search-similar" style:--count-width={viz.matches || meaningStatus ? `${countWidth}px` : null}>
            <span>Similar to file row {viz.similarTo}</span>
            <button
              type="button"
              aria-label="Stop finding similar data items"
              title="Back to a typed search"
              onclick={() => viz.clearSimilar()}>&times;</button
            >
          </div>
        {:else}
          <input
            type="search"
            id="search-field"
            placeholder={viz.meaningOn ? 'Find similar meanings' : 'Find matching text'}
            aria-label={viz.meaningOn ? 'Find similar meanings' : 'Find matching text'}
            autocomplete="off"
            spellcheck="false"
            bind:value={viz.searchTerm}
            style:--count-width={viz.matches || meaningStatus ? `${countWidth}px` : null}
            onkeydown={(e) => e.key === 'Enter' && e.preventDefault()}
          />
        {/if}
        <!-- Only while the text actually searches (spaces alone, or a dangling AND, don't), or meaning mode is getting ready -->
        {#if meaningStatus}
          <span class="search-count" bind:clientWidth={countWidth}>
            <span class="search-count-text search-status">{meaningStatus}</span>
          </span>
        {:else if viz.matches}
          <span class="search-count" bind:clientWidth={countWidth}>
            <span class="search-count-text">{st.count} of {st.total}</span>
            {#if st.count > 0 && !st.tagging && !classic}
              <button
                type="button"
                aria-label="Tag these {st.count} matches"
                title="Add a tag to all {st.count} of {st.total} matches"
                onclick={() => st.start()}><span class="search-count-label">Tag these…</span></button
              >
            {/if}
          </span>
        {/if}
      </div>
      {#if canMeaning}
        <button
          type="button"
          id="search-mode"
          class="dropdown-arrow"
          aria-expanded={open === 'searchMode'}
          title={viz.meaningOn
            ? 'Finding by meaning: data items with a sentence that means something similar, plus any containing the exact phrase'
            : 'Finding by text: words and phrases as typed'}
          onclick={toggle('searchMode')}
        >
          <span class="tool-word">by</span> <strong>{viz.meaningOn ? 'meaning' : 'text'}</strong>
        </button>
      {/if}
      <button type="button" id="search-in" class="dropdown-arrow" aria-expanded={open === 'searchIn'} onclick={toggle('searchIn')}>
        <span class="tool-word">within</span> <strong>{viz.scopeText}</strong>
      </button>
    </div>
    <button
      type="button"
      id="toggle-view"
      class={viz.split ? 'view-stack' : 'view-split'}
      disabled={!viz.canSplit}
      aria-label={viz.split ? 'Stack' : 'Split'}
      title={viz.rowKey === null
        ? 'Choose rows under “Grouped by” to stack the columns'
        : !viz.canSplit
          ? 'Choose a “color-coded by” field to split rows by color'
          : viz.split
            ? `Stack: take away the “${viz.columnKey}” columns`
            : `Split the rows into columns by “${viz.splitColumn}”`}
      onclick={() => viz.setSplit(!viz.split)}><span class="tool-label">{viz.split ? 'Stack' : 'Split'}</span></button
    >
    <button
      type="button"
      id="toggle-counts"
      class="dropdown-arrow"
      aria-expanded={open === 'counts'}
      aria-label="Counts: {countsLabel}"
      title="Counts, or each count as a share of its row or its column"
      onclick={toggle('counts')}
    >
      <span class="count-icon">#</span> <span class="count-label tool-label">{countsLabel}</span>
    </button>
    <button
      type="button"
      id="viewer-columns"
      class="dropdown-arrow"
      aria-expanded={open === 'viewerColumns'}
      aria-label="Show in viewer"
      title="Show in viewer"
      onclick={toggle('viewerColumns')}><span class="tool-label">Show in viewer</span></button
    >
    {#if !classic}
      <button
        type="button"
        id="tags-toggle"
        class="panel-toggle"
        aria-expanded={tagsOpen}
        aria-controls="tags-panel"
        aria-label="Manage tags"
        title={tagsOpen ? 'Close Manage tags' : 'Manage tags: rename, combine, delete, or convert a tag into a data field'}
        onclick={ontoggletags}><span class="tool-label">Manage tags</span></button
      >
      <button
        type="button"
        id="ai-toggle"
        aria-expanded={aiOpen}
        aria-controls="ai-panel"
        aria-label="Analyze with AI"
        title={aiOpen ? 'Close the AI panel' : 'Analyze with AI: summarize, ask questions about, or auto-code your data'}
        onclick={ontoggleai}><span class="tool-label">Analyze with AI</span></button
      >
    {/if}
  </form>

  <div class="viewer-body">
    <div class="viewer-main">
      <SearchTagBar {st} />
      <MeaningBar {viz} />
      {#if viz.aiHighlight}
        <div class="ai-highlight-bar" role="status">
          Highlighting {dataItems(viz.aiHighlight.size)} cited by AI
          <button type="button" onclick={() => (viz.aiHighlight = null)}>Clear</button>
        </div>
      {/if}

      <div
        class="visualizer"
        class:animate={animated}
        class:zooming={viz.zooming || resizing}
        bind:this={visualizerEl}
        bind:clientWidth={viewWidth}
        bind:clientHeight={viewHeight}
      >
        <div class="labels labels-measure" bind:this={measureEl} aria-hidden="true">
          {#if layout.rowOffset}<div class="label-item label-header" style:height={em(HEADER_ROW + headerMode.extra)}></div>{/if}
          {#each layout.groups as group (group.label)}
            <div class="label-item">{viz.label(group.label, viz.groupKey)}</div>
          {/each}
        </div>
        <div
          class="labels"
          class:row-dragging={rowOrder.active}
          bind:this={labelsEl}
          style:font-size={fontSize}
          style:width={px(labelWidth * scale.y)}
          role="list"
          aria-label="Rows. Drag a row label, or press Alt and the arrow keys, to put rows in your own order."
          onpointermove={(e) => rowOrder.pointermove(e)}
          onpointerup={(e) => rowOrder.pointerup(e)}
          onpointercancel={(e) => rowOrder.pointerup(e)}
        >
          <!-- Empty: the split header row has no row label -->
          {#if layout.rowOffset}<div
              class="label-item label-header"
              aria-hidden="true"
              style:height={em(HEADER_ROW + headerMode.extra)}
            ></div>{/if}
          {#each layout.groups as group, i (group.label)}
            {@const text = viz.label(group.label, viz.groupKey)}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (rows reorder with Alt+arrows) -->
            <div
              class="label-item row-label"
              class:being-dragged={rowOrder.from === i}
              style:translate={rowOrder.from === i ? dragOffset : null}
              class:drop-before={rowOrder.dropBefore(i)}
              class:drop-after={rowOrder.dropAfter(i)}
              role="listitem"
              aria-roledescription="reorderable row"
              tabindex="0"
              title="{text} (drag to reorder)"
              onpointerdown={(e) => rowOrder.pointerdown(i, e)}
              onkeydown={(e) => rowKeydown(i, e)}
            >
              {text}
            </div>
          {/each}
        </div>

        <div class="blocks">
          <div
            class="block-items"
            class:animate={animated}
            class:zooming={viz.zooming || resizing}
            style:font-size={fontSize}
            style:padding-left={px(labelWidth * scale.y)}
            role="group"
            aria-label="{viz.dataset.items.length} items grouped by {viz.groupKey}"
          >
            {#each viz.dataset.items as item (item.id)}
              {@const p = layout.positions.get(item.id)!}
              {@const color = viz.colorOf(item)}
              <div
                class="block-item"
                class:filtered={viz.isFiltered(item)}
                class:floating={popups.isFloating(item.id)}
                class:row-dragged={draggedIds.has(item.id)}
                style:transform="translate({sx(p.x, p.cx)}, {rem(p.y)})"
                style:translate={draggedIds.has(item.id) ? dragOffset : null}
                style:width={px(GEOMETRY.size * scale.x)}
                style:border-width={px(5 * edge)}
                style:border-radius={px(2 * edge)}
                style:background-color={color.fill}
                style:border-color={color.stroke}
                data-item-id={item.id}
                role="button"
                tabindex="-1"
                aria-label="File row {item.id}: {displayLabel(item.raw[viz.groupKey])}"
                onpointerenter={(e) => enter(item, e)}
                onpointerleave={() => leave(item)}
                onclick={(e) => click(item, e)}
                onkeydown={(e) => keydown(item, e)}
              ></div>
            {/each}
            {#each layout.counts as count (count.key)}
              <div
                class="block-item block-item-label"
                class:row-dragged={inDraggedRow(count.key)}
                style:transform="translate({sx(count.x, count.cx)}, {rem(count.y)})"
                style:translate={inDraggedRow(count.key) ? dragOffset : null}
              >
                {count.text}
              </div>
            {/each}
            <!-- Without rows, the bands carry the background the rows normally have -->
            {#if viz.rowKey === null}
              {#each layout.headers as header (header.key)}
                <div
                  class="band-stripe"
                  style:transform="translate({sx(header.x - GEOMETRY.gutter, header.cx)}, {rem(GEOMETRY.row + layout.headerExtra)})"
                  style:width={px((header.boxes * (GEOMETRY.size + GEOMETRY.gutter) + GEOMETRY.gutter) * scale.x)}
                  style:height={rem(layout.stripes * GEOMETRY.row - 6)}
                ></div>
              {/each}
            {/if}
            {#each layout.headers as header (header.key)}
              {@const swatch = bandSwatches ? viz.colors.get(header.key) : undefined}
              {@const text = viz.label(header.label, viz.columnKey ?? viz.colorKey)}
              <div
                class="band-header"
                class:turned={headerMode.mode === 'turn'}
                class:wrapped={headerMode.mode === 'wrap'}
                style:font-size={headerFontSize}
                style:transform="translate({sx(header.x, header.cx)}, {rem(headerMode.mode === 'line' ? header.y : 0)})"
                style:width={sx(header.width, header.cwidth)}
                style:height={rem(headerMode.mode === 'line' ? GEOMETRY.size : HEADER_ROW + headerMode.extra)}
                title={header.total ? `${text}: ${header.total} in total` : text}
              >
                <div class="band-label" style:width={headerMode.mode === 'turn' ? em(headerMode.length) : undefined}>
                  {#if swatch}<span class="band-swatch" style:background-color={swatch.fill} style:border-color={swatch.stroke}
                    ></span>{/if}<span
                    class="band-text"
                    style:-webkit-line-clamp={headerMode.mode === 'wrap' ? headerMode.lines : undefined}
                    >{text}{#if header.total}{' '}<span class="band-total">{header.total}</span>{/if}</span
                  >
                </div>
              </div>
            {/each}
          </div>
          <div class="rows">
            <div class="row-items" bind:this={rowItemsEl} style:font-size={fontSize} style:padding-left={px(labelWidth * scale.y)}>
              {#if layout.rowOffset}<div
                  class="row row-header"
                  style:width={sx(layout.rowWidth, layout.countWidth)}
                  style:height={em(HEADER_ROW + headerMode.extra)}
                ></div>{/if}
              <!-- One stripe per row of boxes: the groups, or the rows a column-only grid wraps onto -->
              {#each { length: layout.stripes } as _, i (layout.groups[i]?.label ?? i)}
                {@const group = layout.groups[i]}
                <div
                  class="row"
                  class:row-plain={viz.rowKey === null}
                  class:row-dragged={group !== undefined && group.label === draggedLabel}
                  style:width={sx(layout.rowWidth, layout.countWidth)}
                  style:translate={group !== undefined && group.label === draggedLabel ? dragOffset : null}
                ></div>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <div id="zoom-controls">
        <button
          class="zoom-reset"
          title="Actual Size"
          aria-label="Actual size"
          disabled={fitMode === 'none' && viz.zoom === 1}
          onclick={() => viz.setZoom(1)}
        ></button>
        <button
          class="zoom-fit"
          class:active={fitMode === 'square'}
          title={fitMode === 'square' ? 'Best Fit (on: keeps fitting until you zoom)' : 'Best Fit'}
          aria-label="Best fit"
          aria-pressed={fitMode === 'square'}
          onclick={toggleBestFit}
        ></button>
        <button
          class="zoom-stretch"
          class:active={fitMode === 'stretch'}
          title={fitMode === 'stretch'
            ? 'Stretch to Fit (on: boxes reshape to fill the window)'
            : 'Stretch to Fit (boxes may become rectangles)'}
          aria-label="Stretch to fit"
          aria-pressed={fitMode === 'stretch'}
          onclick={() => viz.setStretch(fitMode !== 'stretch')}
        ></button>
        <button class="zoom-in" title="Zoom In" aria-label="Zoom in" disabled={scale.y >= range.max} onclick={() => zoomBy(ZOOM.step)}
        ></button>
        <button class="zoom-out" title="Zoom Out" aria-label="Zoom out" disabled={scale.y <= range.min} onclick={() => zoomBy(-ZOOM.step)}
        ></button>
      </div>
    </div>
    {@render side?.()}
  </div>
</div>
