<script lang="ts">
  import type { Viz } from '../lib/viz.svelte';

  interface Props {
    viz: Viz;
    /** The tag column being configured; null when closed */
    column: string | null;
    onclose: () => void;
  }

  let { viz, column, onclose }: Props = $props();

  let dialog: HTMLDialogElement;
  let pressedOnBackdrop = false;

  const catalog = $derived(column ? viz.catalog(column) : []);
  const ignored = $derived(new Set(column ? (viz.tagIgnored[column] ?? []) : []));

  $effect(() => {
    if (column && !dialog.open) dialog.showModal();
    else if (!column && dialog.open) dialog.close();
  });

  function setIncluded(key: string, included: boolean) {
    if (!column) return;
    const next = new Set(ignored);
    if (included) next.delete(key);
    else next.add(key);
    viz.setIgnoredTags(column, [...next]);
  }

  /** Group by this tag alone: ignore every other tag */
  function only(key: string) {
    if (column)
      viz.setIgnoredTags(
        column,
        catalog.map((t) => t.key).filter((k) => k !== key),
      );
  }

  function includeAll() {
    if (column) viz.setIgnoredTags(column, []);
  }

  function isBackdrop(event: MouseEvent): boolean {
    if (event.target !== dialog) return false;
    const r = dialog.getBoundingClientRect();
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  }
</script>

<dialog
  id="tag-options"
  class="nineteen-dialog"
  bind:this={dialog}
  aria-labelledby="tag-options-title"
  oncancel={(e) => {
    e.preventDefault();
    onclose();
  }}
  onclose={() => {
    if (column) onclose();
  }}
  onpointerdown={(e) => (pressedOnBackdrop = isBackdrop(e))}
  onclick={(e) => {
    if (pressedOnBackdrop && isBackdrop(e)) onclose();
    pressedOnBackdrop = false;
  }}
>
  <header class="title-bar">
    <strong class="title" id="tag-options-title">List display options: {column}</strong>
    <button type="button" class="close" aria-label="Close" onclick={onclose}>&times;</button>
  </header>

  <div class="settings-body">
    <p class="settings-hint">
      Data items are grouped and colored by their combination of values. Untick a value to leave it out of the combinations; data items keep
      it, and it still shows in the viewer and in search.
    </p>
    {#if catalog.length}
      <ul class="tag-options">
        {#each catalog as tag (tag.key)}
          <li>
            <label class="settings-check">
              <input type="checkbox" checked={!ignored.has(tag.key)} onchange={(e) => setIncluded(tag.key, e.currentTarget.checked)} />
              <span class="tag-option-name">{tag.label}</span>
              <span class="tag-option-count">{tag.count} {tag.count === 1 ? 'data item' : 'data items'}</span>
            </label>
            <button type="button" class="ai-link tag-only" onclick={() => only(tag.key)} title="Leave out every other value"
              >Only this</button
            >
          </li>
        {/each}
      </ul>
    {:else}
      <p class="settings-hint">No values yet.</p>
    {/if}
  </div>

  <footer class="settings-footer">
    <button type="button" class="btn" disabled={ignored.size === 0} onclick={includeAll}>Include all</button>
    <span class="settings-spacer"></span>
    <button type="button" class="btn btn-primary" onclick={onclose}>Done</button>
  </footer>
</dialog>
