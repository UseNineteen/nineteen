<script lang="ts">
  import type { Viz } from '../lib/viz.svelte';

  interface Props {
    viz: Viz;
  }

  let { viz }: Props = $props();

  const showCounts = $derived(viz.counts && !viz.split);
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
  <ul class="legend-items" class:dimmed={viz.hoveredColor !== null} aria-label="Legend: {viz.colorKey}">
    {#each viz.layout.legend as entry (entry.label)}
      {@const swatch = viz.colors.get(entry.label)}
      <li class="legend-item" class:highlighted={viz.hoveredColor === entry.label} title={viz.label(entry.label, viz.colorKey)}>
        <span class="swatch" style:background-color={swatch?.fill} style:border-color={swatch?.stroke}></span>
        <span class="label">{viz.label(entry.label, viz.colorKey)}</span>
        {#if showCounts}
          <span class="count">{entry.count}</span>
        {/if}
      </li>
    {/each}
  </ul>
</div>
