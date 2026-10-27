<script lang="ts">
  import { untrack } from 'svelte';
  import { passagesOf } from '../lib/semantic/passages';
  import { appSettings } from '../lib/settings.svelte';
  import type { Viz } from '../lib/viz.svelte';

  /**
   * Finding by meaning, under the toolbar: drives the model from the view's state (mode, data,
   * searched fields, the search itself), and shows the one question it has to ask (whether to
   * download the model) and any failure. Progress shows in the search box itself.
   */
  interface Props {
    viz: Viz;
  }

  let { viz }: Props = $props();

  const semantic = $derived(viz.semantic);
  /** A moment after typing stops; "Find similar" has nothing to wait for */
  const TYPING_PAUSE = 250;

  // Meaning mode turned on, or another model chosen in Settings: get the model ready
  $effect(() => {
    if (!viz.meaningOn) {
      untrack(() => semantic.deactivate());
      return;
    }
    const model = appSettings.meaningModel;
    untrack(() => semantic.activate(model));
  });

  // The data and the searched fields decide what is read
  $effect(() => {
    if (!viz.meaningOn || !semantic.loaded) return;
    const passages = passagesOf(viz.dataset.items, viz.searchScope);
    untrack(() => semantic.index(passages));
  });

  // The search itself
  $effect(() => {
    if (!viz.meaningOn || !semantic.loaded) return;
    const key = viz.meaningKey;
    const term = viz.searchTerm.trim();
    const similarTo = viz.similarTo;
    const cut = viz.cut;
    if (similarTo === null && !term) return;
    const query = similarTo !== null ? { itemId: similarTo } : { text: term };
    const timer = setTimeout(() => semantic.find(key, query, cut), similarTo !== null ? 0 : TYPING_PAUSE);
    return () => clearTimeout(timer);
  });

  function notNow() {
    viz.setSearchMode('text');
  }
</script>

{#if viz.meaningOn && semantic.status === 'asking' && semantic.model}
  <div class="search-tag-bar meaning-bar" role="status">
    <span>
      Finding by meaning uses a small language model, <strong>{semantic.model.label}</strong> ({semantic.downloadMB} MB), which your browser downloads
      once from Hugging Face and keeps for next time. Your data stays in your browser.
    </span>
    <button type="button" class="primary" onclick={() => semantic.accept()}>Download and continue</button>
    <button type="button" onclick={notNow}>Not now</button>
    <a href="./privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
  </div>
{:else if viz.meaningOn && semantic.status === 'error'}
  <div class="search-tag-bar meaning-bar meaning-error" role="alert">
    <span>Finding by meaning isn’t working: {semantic.error}</span>
    <button type="button" onclick={() => semantic.activate(appSettings.meaningModel)}>Try again</button>
    <button type="button" onclick={notNow}>Find by text instead</button>
  </div>
{/if}
