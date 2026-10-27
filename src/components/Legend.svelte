<script lang="ts">
  import { LABEL_FONT } from '../lib/band-labels';
  import { GEOMETRY, LEGEND, legendWidth } from '../lib/layout';
  import { ListReorder } from '../lib/reorder.svelte';
  import type { Viz } from '../lib/viz.svelte';
  import { onMount } from 'svelte';

  /** The reorder grip's extra width beside the swatch (see the legend's grip rules in app.css) */
  const GRIP = 4;

  interface Props {
    viz: Viz;
  }

  let { viz }: Props = $props();

  const showCounts = $derived(viz.counts && !viz.split);
  /**
   * Line the first entry up with the first data row: the collapse toggle sits directly above the
   * list (level with the band labels in split view), and the list starts below it and the first
   * entry's gap, so the space to the first row goes above the toggle
   */
  const LIST_START = LEGEND.toggle + 2 * LEGEND.toggleMargin + LEGEND.entryGapTop;
  const offset = $derived(Math.max(0, viz.firstRowTop - LIST_START));
  const reorderable = $derived(!viz.legendCollapsed && viz.layout.legend.length > 1);

  /** Re-measured once the web font has loaded (asking for it starts the load): the fallback font has different widths */
  let fontsReady = $state(0);
  onMount(() => {
    document.fonts?.load(`400 ${GEOMETRY.font}px ${LABEL_FONT}`).then(() => fontsReady++);
  });
  const measureCtx = document.createElement('canvas').getContext('2d');
  /** As wide as the longest entry: swatch, grip when reorderable, label and count */
  const width = $derived.by(() => {
    void fontsReady;
    if (!measureCtx) return legendWidth(LEGEND.maxWidth);
    measureCtx.font = `400 ${GEOMETRY.font}px ${LABEL_FONT}`;
    const grip = reorderable ? GRIP : 0;
    const widest = Math.max(
      0,
      ...viz.layout.legend.map((entry) => {
        const label = measureCtx.measureText(viz.label(entry.label, viz.colorKey)).width;
        const count = showCounts ? LEGEND.countGap + measureCtx.measureText(String(entry.count)).width : 0;
        return LEGEND.swatch + LEGEND.swatchGap + grip + label + count;
      }),
    );
    return legendWidth(widest);
  });

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
  style:--legend-width="{width}px"
  style:--legend-padding="{LEGEND.padding}px"
  style:--legend-swatch="{LEGEND.swatch}px"
  style:--legend-swatch-gap="{LEGEND.swatchGap}px"
  style:--legend-count-gap="{LEGEND.countGap}px"
  style:--legend-toggle="{LEGEND.toggle}px"
  style:--legend-toggle-margin="{LEGEND.toggleMargin}px"
  style:--legend-entry-line="{LEGEND.entryLine}px"
  style:--legend-entry-gap-top="{LEGEND.entryGapTop}px"
  style:--legend-entry-gap-bottom="{LEGEND.entryGapBottom}px"
>
  <button
    id="legend-toggle"
    class:legend-collapsed={viz.legendCollapsed}
    aria-label={viz.legendCollapsed ? 'Show legend' : 'Hide legend'}
    aria-expanded={!viz.legendCollapsed}
    title={viz.legendCollapsed ? 'Show legend' : 'Hide legend'}
    style:margin-top="{offset + LEGEND.toggleMargin}px"
    onclick={() => (viz.legendCollapsed = !viz.legendCollapsed)}
  ></button>
  <ul
    bind:this={listEl}
    class="legend-items"
    class:dimmed={viz.hoveredColor !== null}
    class:reorderable
    class:dragging={reorder.active}
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
