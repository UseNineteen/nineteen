<script lang="ts">
  import TagEditor from './TagEditor.svelte';
  import { splitTags, type DataItem } from '../lib/data';
  import { segments, type Piece } from '../lib/linkify';
  import type { PopupState, Popups } from '../lib/popups.svelte';
  import { highlightRanges, mergeRanges } from '../lib/search';
  import { canFindByMeaning } from '../lib/semantic/search.svelte';
  import { appSettings } from '../lib/settings.svelte';
  import type { Viz } from '../lib/viz.svelte';

  interface Props {
    popup: PopupState;
    popups: Popups;
    item: DataItem;
    viz: Viz;
  }

  let { popup, popups, item, viz }: Props = $props();

  const highlight = $derived(viz.isMatch(item));
  const tagColumn = $derived(viz.tagEditColumn);
  const tags = $derived(splitTags(item.raw[tagColumn], viz.separatorOf(tagColumn)));
  /** Classic Nineteen: no tag editing, so the tags column is listed like any other */
  const classic = $derived(appSettings.classic);
  const listed = $derived(viz.viewerColumns.filter((c) => classic || c !== tagColumn));
  /** How this data item matched a meaning search, if it did: its rank and the sentence that matched */
  const meaning = $derived(viz.meaningMatch(item));
  /** Or it is a text hit of a meaning search: it contains the phrase */
  const textHit = $derived(!meaning && viz.meaningOn && highlight && viz.phrase !== '');
  const canMeaning = $derived(canFindByMeaning() && !classic);

  /** Text to mark in a field: the search terms, and the sentence a meaning search matched */
  function marked(column: string, text: string): [number, number][] {
    const ranges = highlight ? highlightRanges(text, viz.textTerm, viz.meaningOn) : [];
    if (meaning?.passage && meaning.column === column) {
      const at = text.indexOf(meaning.passage);
      if (at >= 0) ranges.push([at, at + meaning.passage.length]);
    }
    return mergeRanges(ranges);
  }

  /** Clicking a tag finds every row carrying it */
  function findTag(column: string, tag: string) {
    viz.searchTerm = /\s/.test(tag) ? `"${tag}"` : tag;
    viz.searchScope = [column];
  }

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
    {#if popup.floating && canMeaning && viz.similarTo !== item.id}
      <button class="find-similar" title="Show the data items closest in meaning to this one" onclick={() => viz.findSimilar(item.id)}
        >Find similar</button
      >
    {/if}
    <button class="close" aria-label="Close" onclick={() => popups.close(popup.key)}>&times;</button>
  </header>
  <section>
    {#if textHit}
      <p class="popup-meaning"><strong>Contains “{viz.phrase}”</strong></p>
    {:else if meaning}
      <p class="popup-meaning">
        {#if meaning.rank === 0}
          <strong>Finding data items similar to this one</strong>
        {:else}
          <strong>#{meaning.rank} closest {viz.similarTo !== null ? `to file row ${viz.similarTo}` : 'in meaning'}</strong>
          <span class="popup-meaning-score">· similarity {meaning.score.toFixed(2)}</span>
          {#if meaning.passage}<span class="popup-meaning-why">by “{meaning.passage}” in {meaning.column}</span>{/if}
        {/if}
      </p>
    {/if}
    {#if !classic && (popup.floating || tags.length)}
      <div class="popup-tags popup-tags-pinned">
        <strong>{tagColumn}</strong>
        <TagEditor
          id="tags-{popup.key}"
          {tags}
          editable={popup.floating}
          suggestions={viz.tagEntries.map((t) => ({ label: t.label, description: t.description }))}
          separator={viz.separatorOf(tagColumn)}
          onchange={(next) => viz.setTags(item.id, next)}
          onpick={(tag) => findTag(tagColumn, tag)}
        />
      </div>
    {/if}
    {#each listed as column (column)}
      {@const text = item.raw[column] ?? ''}
      {#if viz.isTagColumn(column) && !classic}
        <div class="popup-tags">
          <strong>{column}</strong>
          <TagEditor
            id="tags-{popup.key}-{column}"
            tags={splitTags(text, viz.separatorOf(column))}
            onpick={(tag) => findTag(column, tag)}
          />
        </div>
      {:else}
        <p>
          <strong>{column}</strong><br />
          <!-- prettier-ignore -->
          <span class="value">{#each segments(text, marked(column, text)) as segment, i (i)}{#if segment.kind === 'image'}<img src={segment.src} alt={segment.alt} referrerpolicy="no-referrer" loading="lazy" />{:else if segment.kind === 'link'}<a href={segment.href} target="_blank" rel="noopener noreferrer">{@render pieces(segment.pieces)}</a>{:else}{@render pieces(segment.pieces)}{/if}{/each}</span>
        </p>
      {/if}
    {:else}
      {#if !popup.floating && !tags.length}<p class="empty">Please select some fields</p>{/if}
    {/each}
  </section>
</article>
