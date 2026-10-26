<script lang="ts">
  import { tick } from 'svelte';
  import type { SearchTagging } from '../lib/search-tagging.svelte';
  import { dataItems } from '../lib/text';

  /**
   * Under the toolbar, only while it's needed: the form for tagging every search match
   * (or removing the searched tag from them), then briefly what was done, with Undo.
   */
  interface Props {
    st: SearchTagging;
  }

  let { st }: Props = $props();

  let input = $state<HTMLInputElement>();

  $effect(() => st.tidy());

  // Opening the form puts the cursor in it
  $effect(() => {
    if (!st.tagging) return;
    tick().then(() => {
      input?.focus();
      input?.select();
    });
  });
</script>

{#if st.current || st.tagging}
  <div class="search-tag-bar" role="status">
    {#if st.current}
      {@const done = st.current}
      <span>
        {#if done.count === 0}
          All matches {done.removed ? 'were already without' : 'already had'} “{done.tag}”.
        {:else if done.removed}
          Removed “{done.tag}” from {dataItems(done.count)}.
        {:else}
          Tagged {dataItems(done.count)} with “{done.tag}”.
        {/if}
      </span>
      {#if st.undoable}<button type="button" onclick={() => st.undo()}>Undo</button>{/if}
      {#if !done.removed && done.count > 0}
        <button type="button" onclick={() => st.colorByTag(done.tag)}>Color by this tag</button>
      {/if}
      <button type="button" class="dismiss" aria-label="Dismiss" title="Dismiss" onclick={() => st.dismiss()}>&times;</button>
    {:else}
      <form
        class="search-tag-form"
        onsubmit={(e) => {
          e.preventDefault();
          st.apply();
        }}
      >
        <label for="search-tag-input">Tag {dataItems(st.count)} with</label>
        <input
          id="search-tag-input"
          bind:this={input}
          bind:value={st.draft}
          list="search-tag-suggestions"
          placeholder="tag"
          autocomplete="off"
          spellcheck="false"
          onkeydown={(e) => e.key === 'Escape' && st.cancel()}
        />
        <datalist id="search-tag-suggestions">
          {#each st.catalog as tag (tag.key)}<option value={tag.label}></option>{/each}
        </datalist>
        <button type="submit" class="primary" disabled={!st.draft.trim()}>Add tag</button>
        {#if st.searchedTag}
          <span class="search-tag-or">or</span>
          <button type="button" onclick={() => st.removeSearched()}>Remove “{st.searchedTag.label}” from these</button>
        {/if}
        <button type="button" class="dismiss" aria-label="Cancel" title="Cancel" onclick={() => st.cancel()}>&times;</button>
      </form>
    {/if}
  </div>
{/if}
