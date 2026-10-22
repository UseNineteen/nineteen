<script lang="ts">
  import type { DataItem } from '../lib/data';
  import { segments, type Piece } from '../lib/linkify';
  import type { PopupState, Popups } from '../lib/popups.svelte';
  import { highlightRanges } from '../lib/search';
  import type { Viz } from '../lib/viz.svelte';

  interface Props {
    popup: PopupState;
    popups: Popups;
    item: DataItem;
    viz: Viz;
  }

  let { popup, popups, item, viz }: Props = $props();

  const highlight = $derived(viz.isMatch(item));

  let dragging: { x: number; y: number } | null = null;

  function dragStart(event: PointerEvent) {
    popups.bringToFront(popup.key);
    if (!popup.floating || (event.target as HTMLElement).closest('button')) return;
    dragging = { x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function dragMove(event: PointerEvent) {
    if (!dragging) return;
    popups.move(popup.key, event.clientX - dragging.x, event.clientY - dragging.y);
    dragging = { x: event.clientX, y: event.clientY };
  }

  function dragEnd() {
    dragging = null;
  }
</script>

<!-- prettier-ignore -->
{#snippet pieces(list: Piece[])}{#each list as piece, j (j)}{#if piece.mark}<mark>{piece.text}</mark>{:else}{piece.text}{/if}{/each}{/snippet}

<article
  class="popup"
  class:floating={popup.floating}
  class:popup-right={popup.right}
  class:popup-bottom={popup.bottom}
  style:left="{popup.left}px"
  style:top="{popup.top}px"
  style:z-index={popup.z}
  style:background-color={viz.colorOf(item).fill}
  aria-label="File row {item.id}"
  onpointerenter={() => popups.cancelHide(popup.key)}
  onpointerleave={() => popups.scheduleHide(item.id)}
>
  <!-- svelte-ignore a11y_no_static_element_interactions (pointer drag handle for pinned popups) -->
  <header onpointerdown={dragStart} onpointermove={dragMove} onpointerup={dragEnd} onpointercancel={dragEnd}>
    <strong>File row {item.id}</strong>
    <button class="close" aria-label="Close" onclick={() => popups.close(popup.key)}>&times;</button>
  </header>
  <section>
    {#each viz.viewerColumns as column (column)}
      {@const text = item.raw[column] ?? ''}
      <p>
        <strong>{column}</strong><br />
        <!-- prettier-ignore -->
        <span class="value">{#each segments(text, highlight ? highlightRanges(text, viz.searchTerm) : []) as segment, i (i)}{#if segment.kind === 'image'}<img src={segment.src} alt={segment.alt} referrerpolicy="no-referrer" loading="lazy" />{:else if segment.kind === 'link'}<a href={segment.href} target="_blank" rel="noopener noreferrer">{@render pieces(segment.pieces)}</a>{:else}{@render pieces(segment.pieces)}{/if}{/each}</span>
      </p>
    {:else}
      <p class="empty">Please select some columns</p>
    {/each}
  </section>
</article>
