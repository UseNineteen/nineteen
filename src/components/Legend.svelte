<script lang="ts">
  import { LEGEND } from '../lib/layout';
  import { ListReorder } from '../lib/reorder.svelte';
  import type { Viz } from '../lib/viz.svelte';

  interface Props {
    viz: Viz;
    /** Opens the "Color by" menu under the given element */
    oncolormenu: (anchor: HTMLElement) => void;
    colorMenuOpen: boolean;
  }

  let { viz, oncolormenu, colorMenuOpen }: Props = $props();

  const showCounts = $derived(viz.counts && !viz.split);
  /** Line the first entry up with the first data row: the list starts below the collapse toggle and the first entry's gap */
  const LIST_START = LEGEND.toggle + 2 * LEGEND.toggleMargin + LEGEND.entryGapTop;
  const offset = $derived(Math.max(0, viz.firstRowTop - LIST_START));

  /**
   * The color column's name, just above the first entry. When there's no room there
   * (no split header row), it shares the top line with the collapse toggle instead.
   */
  const aboveList = $derived(viz.firstRowTop - LEGEND.title - 4);
  const titleBesideToggle = $derived(aboveList < 30);
  /** Beside the toggle it lines up with it (the toggle's margin from the top) */
  const titleTop = $derived(titleBesideToggle ? LEGEND.toggleMargin : aboveList);
  const reorderable = $derived(!viz.legendCollapsed && viz.layout.legend.length > 1);

  let listEl = $state<HTMLElement>();
  const reorder = new ListReorder({
    container: () => listEl,
    entries: () => listEl?.querySelectorAll<HTMLElement>('.legend-item') ?? [],
    length: () => viz.layout.legend.length,
    enabled: () => reorderable,
    onmove: (from, to) => viz.moveLegendEntry(from, to),
  });

  function keydown(index: number, event: KeyboardEvent) {
    const to = reorder.keydown(index, event);
    // Keep focus on the moved entry
    if (to !== null) requestAnimationFrame(() => listEl?.querySelectorAll<HTMLElement>('.legend-item')[to]?.focus());
  }
</script>

<div
  id="legend"
  class:legend-collapsed={viz.legendCollapsed}
  style:--legend-toggle="{LEGEND.toggle}px"
  style:--legend-toggle-margin="{LEGEND.toggleMargin}px"
  style:--legend-entry-line="{LEGEND.entryLine}px"
  style:--legend-entry-gap-top="{LEGEND.entryGapTop}px"
  style:--legend-entry-gap-bottom="{LEGEND.entryGapBottom}px"
  style:--legend-title="{LEGEND.title}px"
>
  <button
    id="legend-toggle"
    class:legend-collapsed={viz.legendCollapsed}
    aria-label={viz.legendCollapsed ? 'Show legend' : 'Hide legend'}
    aria-expanded={!viz.legendCollapsed}
    title={viz.legendCollapsed ? 'Show legend' : 'Hide legend'}
    onclick={() => (viz.legendCollapsed = !viz.legendCollapsed)}
  ></button>
  {#if !viz.legendCollapsed}
    <button
      type="button"
      class="legend-title dropdown-arrow"
      class:beside-toggle={titleBesideToggle}
      style:top="{titleTop}px"
      title="Color-coded by “{viz.colorKey}”. Click to change."
      aria-haspopup="dialog"
      aria-expanded={colorMenuOpen}
      onclick={(e) => oncolormenu(e.currentTarget)}>{viz.colorKey}</button
    >
  {/if}
  <ul
    bind:this={listEl}
    class="legend-items"
    class:dimmed={viz.hoveredColor !== null}
    class:reorderable
    class:dragging={reorder.active}
    style:padding-top="{offset}px"
    aria-label="Legend: {viz.colorKey}. Drag entries, or press Alt and the arrow keys, to reorder them and their colors."
    onpointermove={(e) => reorder.pointermove(e)}
    onpointerup={(e) => reorder.pointerup(e)}
    onpointercancel={(e) => reorder.pointerup(e)}
  >
    {#each viz.layout.legend as entry, i (entry.label)}
      {@const swatch = viz.colors.get(entry.label)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (entries are reorderable with Alt+arrows, announced via aria-roledescription) -->
      <li
        aria-roledescription="reorderable legend entry"
        class="legend-item"
        class:highlighted={viz.hoveredColor === entry.label}
        class:being-dragged={reorder.from === i}
        class:drop-before={reorder.dropBefore(i)}
        class:drop-after={reorder.dropAfter(i)}
        title={reorderable ? `${viz.label(entry.label, viz.colorKey)} (drag to reorder)` : viz.label(entry.label, viz.colorKey)}
        tabindex={reorderable ? 0 : -1}
        style:--drag-dy={reorder.from === i ? `${reorder.dy}px` : null}
        onpointerdown={(e) => reorder.pointerdown(i, e)}
        onkeydown={(e) => keydown(i, e)}
      >
        <span class="swatch" style:background-color={swatch?.fill} style:border-color={swatch?.stroke}></span>
        <span class="grip" aria-hidden="true"></span>
        <span class="label">{viz.label(entry.label, viz.colorKey)}</span>
        {#if showCounts}
          <span class="count">{entry.count}</span>
        {/if}
      </li>
    {/each}
  </ul>
  {#if viz.hasCustomOrder && !viz.legendCollapsed}
    <button type="button" class="legend-reset" onclick={() => viz.resetLegendOrder()}>Reset order</button>
  {/if}
</div>
