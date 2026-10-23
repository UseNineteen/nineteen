<script module lang="ts">
  export type ToolbarDropdown = 'terms' | 'searchIn' | 'viewerColumns';
</script>

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { displayLabel, type DataItem } from '../lib/data';
  import { boxScale, GEOMETRY } from '../lib/layout';
  import type { Popups } from '../lib/popups.svelte';
  import { appSettings } from '../lib/settings.svelte';
  import { ZOOM, zoomRange, type Viz } from '../lib/viz.svelte';

  interface Props {
    viz: Viz;
    popups: Popups;
    open: string | null;
    ontoggle: (name: ToolbarDropdown, anchor: HTMLElement) => void;
  }

  let { viz, popups, open, ontoggle }: Props = $props();

  /** Vertical sizes use em (they follow the row font size); horizontal sizes use px (they follow scale.x). */
  const em = (px: number) => `${px / GEOMETRY.font}em`;
  const px = (n: number) => `${n}px`;

  let measureEl: HTMLElement;
  let viewWidth = $state(0);
  let viewHeight = $state(0);
  /** Label column width at scale 1 */
  let labelWidth = $state(0);
  let animate = $state(false);
  let resizing = $state(false);
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;

  const layout = $derived(viz.layout);
  const fitMode = $derived(viz.fit);
  const range = $derived(zoomRange());
  const sizing = $derived({
    minBox: appSettings.minBox,
    maxBox: appSettings.maxBox,
    zoom: viz.zoom,
    // Leave room for a vertical scrollbar
    viewWidth: viewWidth - 4,
    viewHeight,
    labelWidth,
    rowWidth: layout.rowWidth,
    countWidth: layout.countWidth,
    rows: layout.rowCount,
  });
  /** Horizontal / vertical scale relative to the original 18px boxes */
  const scale = $derived(boxScale({ ...sizing, fit: fitMode !== 'none', square: fitMode !== 'stretch' }));
  const fontSize = $derived(px(scale.y * GEOMETRY.font));

  $effect(() => {
    viz.displayScale = scale.y;
  });
  const edge = $derived(Math.min(scale.x, scale.y));
  /** Screen x for a layout position: box space follows box width, count space follows text size */
  const sx = (x: number, cx: number) => px(x * scale.x + cx * scale.y);

  // Boxes animate when regrouping, but not while they are being resized
  let lastScale = { x: 1, y: 1 };
  $effect.pre(() => {
    const { x, y } = scale;
    if (x === lastScale.x && y === lastScale.y) return;
    lastScale = { x, y };
    resizing = true;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => (resizing = false), 150);
  });

  // Label column width at scale 1 decides where the blocks start. It is measured on a hidden copy
  // at the base font size, so it never depends on the current scale (which itself depends on it).
  $effect(() => {
    void layout.groups;
    tick().then(() => {
      // +2px: small fonts render slightly wider than a straight scale-down predicts
      if (measureEl) labelWidth = measureEl.offsetWidth + 2;
    });
  });

  onMount(() => {
    // Animate block moves only after the initial placement
    requestAnimationFrame(() => requestAnimationFrame(() => (animate = true)));
  });

  function enter(item: DataItem, event: PointerEvent) {
    viz.hoveredColor = item.raw[viz.colorKey];
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

<div class="viewer-wrapper">
  <form id="tool-bar" onsubmit={(e) => e.preventDefault()} aria-label="Visualization tools">
    <button
      type="button"
      class="block-sort sort-value"
      class:sort-active={viz.sortBy === 'value'}
      class:sort-reverse={viz.buttonDirections.value === 'descending'}
      title="Sort rows alphabetically"
      aria-label="Sort rows alphabetically ({viz.buttonDirections.value})"
      aria-pressed={viz.sortBy === 'value'}
      onclick={() => viz.sort('value')}
    ></button>
    <button
      type="button"
      class="block-sort sort-count"
      class:sort-active={viz.sortBy === 'count'}
      class:sort-reverse={viz.buttonDirections.count === 'descending'}
      title="Sort rows by number of items"
      aria-label="Sort rows by number of items ({viz.buttonDirections.count})"
      aria-pressed={viz.sortBy === 'count'}
      onclick={() => viz.sort('count')}
    ></button>
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
      <input
        type="search"
        id="search-field"
        placeholder="Find"
        aria-label="Find"
        autocomplete="off"
        spellcheck="false"
        bind:value={viz.searchTerm}
        onkeydown={(e) => e.key === 'Enter' && e.preventDefault()}
      />
    </div>
    <button type="button" id="search-in" class="dropdown-arrow" aria-expanded={open === 'searchIn'} onclick={toggle('searchIn')}>
      within <strong>{viz.scopeText}</strong>
    </button>
    <button
      type="button"
      id="toggle-view"
      class={viz.split ? 'view-stack' : 'view-split'}
      disabled={viz.automatic}
      title={viz.automatic ? 'Choose a “color-coded by” column to split rows by color' : undefined}
      onclick={() => (viz.split = !viz.split)}>{viz.split ? 'Stack' : 'Split'}</button
    >
    <button type="button" id="toggle-counts" aria-pressed={viz.counts} onclick={() => (viz.counts = !viz.counts)}>
      <span class="count-icon">#</span> <span class="count-label">{viz.counts ? 'Hide' : 'Show'} counts</span>
    </button>
    <button
      type="button"
      id="viewer-columns"
      class="dropdown-arrow"
      aria-expanded={open === 'viewerColumns'}
      onclick={toggle('viewerColumns')}>Show in viewer</button
    >
  </form>

  {#if viz.aiHighlight}
    <div class="ai-highlight-bar" role="status">
      Highlighting {viz.aiHighlight.size} {viz.aiHighlight.size === 1 ? 'row' : 'rows'} cited by AI
      <button type="button" onclick={() => (viz.aiHighlight = null)}>Clear</button>
    </div>
  {/if}

  <div class="visualizer" bind:clientWidth={viewWidth} bind:clientHeight={viewHeight}>
    <div class="labels labels-measure" bind:this={measureEl} aria-hidden="true">
      {#if layout.rowOffset}<div class="label-item label-header">{viz.colorKey}</div>{/if}
      {#each layout.groups as group (group.label)}
        <div class="label-item">{displayLabel(group.label)}</div>
      {/each}
    </div>
    <div class="labels" style:font-size={fontSize} style:width={px(labelWidth * scale.y)} aria-hidden="true">
      {#if layout.rowOffset}<div class="label-item label-header" title={viz.colorKey}>{viz.colorKey}</div>{/if}
      {#each layout.groups as group (group.label)}
        <div class="label-item" title={displayLabel(group.label)}>{displayLabel(group.label)}</div>
      {/each}
    </div>

    <div class="blocks">
      <div
        class="block-items"
        class:animate
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
            style:transform="translate({sx(p.x, p.cx)}, {em(p.y)})"
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
          <div class="block-item block-item-label" style:transform="translate({sx(count.x, count.cx)}, {em(count.y)})">{count.text}</div>
        {/each}
        {#each layout.headers as header (header.key)}
          {@const swatch = viz.colors.get(header.key)}
          <div
            class="band-header"
            style:transform="translate({sx(header.x, header.cx)}, {em(header.y)})"
            style:width={sx(header.width, header.cwidth)}
            title={header.total ? `${displayLabel(header.label)}: ${header.total} in total` : displayLabel(header.label)}
          >
            <span class="band-swatch" style:background-color={swatch?.fill} style:border-color={swatch?.stroke}></span><span class="band-text"
              >{displayLabel(header.label)}</span
            >{#if header.total}<span class="band-total" title="{header.total} in total">{header.total}</span>{/if}
          </div>
        {/each}
      </div>
      <div class="rows">
        <div class="row-items" style:font-size={fontSize} style:padding-left={px(labelWidth * scale.y)}>
          {#if layout.rowOffset}<div class="row row-header" style:width={sx(layout.rowWidth, layout.countWidth)}></div>{/if}
          {#each layout.groups as group (group.label)}
            <div class="row" style:width={sx(layout.rowWidth, layout.countWidth)}></div>
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
      title={fitMode === 'stretch' ? 'Stretch to Fit (on: boxes reshape to fill the window)' : 'Stretch to Fit (boxes may become rectangles)'}
      aria-label="Stretch to fit"
      aria-pressed={fitMode === 'stretch'}
      onclick={() => viz.setStretch(fitMode !== 'stretch')}
    ></button>
    <button class="zoom-in" title="Zoom In" aria-label="Zoom in" disabled={scale.y >= range.max} onclick={() => zoomBy(ZOOM.step)}></button>
    <button class="zoom-out" title="Zoom Out" aria-label="Zoom out" disabled={scale.y <= range.min} onclick={() => zoomBy(-ZOOM.step)}></button>
  </div>
</div>
