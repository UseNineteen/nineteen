<script module lang="ts">
  export type ToolbarDropdown = 'terms' | 'searchIn' | 'viewerColumns';
</script>

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { displayLabel, type DataItem } from '../lib/data';
  import { GEOMETRY } from '../lib/layout';
  import type { Popups } from '../lib/popups.svelte';
  import { ZOOM, type Viz } from '../lib/viz.svelte';

  interface Props {
    viz: Viz;
    popups: Popups;
    open: string | null;
    ontoggle: (name: ToolbarDropdown, anchor: HTMLElement) => void;
  }

  let { viz, popups, open, ontoggle }: Props = $props();

  const em = (px: number) => `${px / GEOMETRY.font}em`;

  let labelsEl: HTMLElement;
  let width = $state(0);
  let height = $state(0);
  let labelWidth = $state(0);
  let animate = $state(false);

  const layout = $derived(viz.layout);
  const fontSize = $derived(`${viz.zoom * GEOMETRY.font}px`);
  const zoomFit = $derived.by(() => {
    const total = labelWidth + layout.rowWidth;
    if (!width || !height || !total) return 1;
    const fit = Math.min(width / total, height / (layout.groups.length * 28));
    return Math.round(Math.min(ZOOM.max, Math.max(ZOOM.min, fit)) * 1000) / 1000;
  });

  // Label column width (in unzoomed px) decides where the blocks start
  $effect(() => {
    void layout.groups;
    void viz.zoom;
    tick().then(() => {
      if (labelsEl) labelWidth = labelsEl.offsetWidth / viz.zoom;
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

  function toggle(name: ToolbarDropdown) {
    return (event: MouseEvent) => ontoggle(name, event.currentTarget as HTMLElement);
  }
</script>

<div class="viewer-wrapper" bind:clientWidth={width} bind:clientHeight={height}>
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

  <div class="visualizer">
    <div class="labels" bind:this={labelsEl} style:font-size={fontSize} aria-hidden="true">
      {#each layout.groups as group (group.label)}
        <div class="label-item" title={displayLabel(group.label)}>{displayLabel(group.label)}</div>
      {/each}
    </div>

    <div class="blocks">
      <div
        class="block-items"
        class:animate
        class:zooming={viz.zooming}
        style:font-size={fontSize}
        style:padding-left={em(labelWidth)}
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
            style:transform="translate({em(p.x)}, {em(p.y)})"
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
          <div class="block-item block-item-label" style:transform="translate({em(count.x)}, {em(count.y)})">{count.text}</div>
        {/each}
      </div>
      <div class="rows">
        <div class="row-items" style:font-size={fontSize} style:padding-left={em(labelWidth)}>
          {#each layout.groups as group (group.label)}
            <div class="row" style:width={em(layout.rowWidth)}></div>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <div id="zoom-controls">
    <button class="zoom-reset" title="Actual Size" aria-label="Actual size" disabled={viz.zoom === 1} onclick={() => viz.setZoom(1)}></button>
    <button class="zoom-fit" title="Best Fit" aria-label="Best fit" disabled={viz.zoom === zoomFit} onclick={() => viz.setZoom(zoomFit)}></button>
    <button class="zoom-in" title="Zoom In" aria-label="Zoom in" disabled={viz.zoom >= ZOOM.max} onclick={() => viz.zoomIn()}></button>
    <button class="zoom-out" title="Zoom Out" aria-label="Zoom out" disabled={viz.zoom <= ZOOM.min} onclick={() => viz.zoomOut()}></button>
  </div>
</div>
