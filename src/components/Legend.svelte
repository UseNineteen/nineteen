<script lang="ts">
  import type { Viz } from '../lib/viz.svelte';

  interface Props {
    viz: Viz;
    /** Opens the "Color by" menu under the given element */
    oncolormenu: (anchor: HTMLElement) => void;
    colorMenuOpen: boolean;
  }

  let { viz, oncolormenu, colorMenuOpen }: Props = $props();

  const showCounts = $derived(viz.counts && !viz.split);
  /**
   * Line the first entry up with the first data row. The list starts below the collapse
   * toggle (20px + 5px margins) and each entry has a 6px top margin.
   */
  const LIST_START = 36;
  const offset = $derived(Math.max(0, viz.firstRowTop - LIST_START));

  /**
   * The color column's name, just above the first entry. When there's no room there
   * (no split header row), it shares the top line with the collapse toggle instead.
   */
  const TITLE_HEIGHT = 20;
  const aboveList = $derived(viz.firstRowTop - TITLE_HEIGHT - 4);
  const titleBesideToggle = $derived(aboveList < 30);
  /** Beside the toggle it lines up with it (5px from the top, like the toggle's margin) */
  const titleTop = $derived(titleBesideToggle ? 5 : aboveList);
  const reorderable = $derived(!viz.legendCollapsed && viz.layout.legend.length > 1);

  let listEl: HTMLElement;
  /** Index of the entry being dragged, and where it would land */
  let dragging = $state<number | null>(null);
  let dropAt = $state<number | null>(null);
  let pressed: { index: number; y: number; id: number } | null = null;

  /** The gap (0…n) closest to the pointer */
  function gapAt(clientY: number): number {
    const items = [...listEl.querySelectorAll<HTMLElement>('.legend-item')];
    const index = items.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return clientY < r.top + r.height / 2;
    });
    return index === -1 ? items.length : index;
  }

  function pointerdown(index: number, event: PointerEvent) {
    if (!reorderable || event.button !== 0) return;
    pressed = { index, y: event.clientY, id: event.pointerId };
  }

  function pointermove(event: PointerEvent) {
    if (!pressed || event.pointerId !== pressed.id) return;
    // A few pixels of movement before it counts as a drag
    if (dragging === null && Math.abs(event.clientY - pressed.y) < 4) return;
    if (dragging === null) {
      dragging = pressed.index;
      listEl.setPointerCapture(event.pointerId);
    }
    dropAt = gapAt(event.clientY);
  }

  function pointerup() {
    if (dragging !== null && dropAt !== null) {
      // Dropping into a gap after the dragged entry shifts by one once it is removed
      viz.moveLegendEntry(dragging, dropAt > dragging ? dropAt - 1 : dropAt);
    }
    pressed = null;
    dragging = dropAt = null;
  }

  function keydown(index: number, event: KeyboardEvent) {
    if (!reorderable || !event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const to = index + (event.key === 'ArrowUp' ? -1 : 1);
    viz.moveLegendEntry(index, to);
    // Keep focus on the moved entry
    requestAnimationFrame(() => listEl.querySelectorAll<HTMLElement>('.legend-item')[Math.max(0, Math.min(to, viz.layout.legend.length - 1))]?.focus());
  }
</script>

<div id="legend" class:legend-collapsed={viz.legendCollapsed}>
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
    class:dragging={dragging !== null}
    style:padding-top="{offset}px"
    aria-label="Legend: {viz.colorKey}. Drag entries, or press Alt and the arrow keys, to reorder them and their colors."
    onpointermove={pointermove}
    onpointerup={pointerup}
    onpointercancel={pointerup}
  >
    {#each viz.layout.legend as entry, i (entry.label)}
      {@const swatch = viz.colors.get(entry.label)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (entries are reorderable with Alt+arrows, announced via aria-roledescription) -->
      <li
        aria-roledescription="reorderable legend entry"
        class="legend-item"
        class:highlighted={viz.hoveredColor === entry.label}
        class:being-dragged={dragging === i}
        class:drop-before={dragging !== null && dropAt === i && dropAt !== dragging && dropAt !== dragging + 1}
        class:drop-after={dragging !== null && dropAt === viz.layout.legend.length && i === viz.layout.legend.length - 1 && dragging !== i}
        title={reorderable ? `${viz.label(entry.label, viz.colorKey)} (drag to reorder)` : viz.label(entry.label, viz.colorKey)}
        tabindex={reorderable ? 0 : -1}
        onpointerdown={(e) => pointerdown(i, e)}
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
