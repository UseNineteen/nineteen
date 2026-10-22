<script lang="ts">
  import { onDestroy } from 'svelte';
  import ColumnPicker from './ColumnPicker.svelte';
  import Dropdown from './Dropdown.svelte';
  import Legend from './Legend.svelte';
  import Popup from './Popup.svelte';
  import Viewer, { type ToolbarDropdown } from './Viewer.svelte';
  import { datasetDetails } from '../lib/data';
  import { serialize } from '../lib/persist';
  import { Popups } from '../lib/popups.svelte';
  import { addTerm } from '../lib/search';
  import { renderSnapshot } from '../lib/snapshot';
  import { canSaveStandalone, standaloneHtml } from '../lib/standalone';
  import type { Viz } from '../lib/viz.svelte';

  interface Props {
    viz: Viz;
    onrestart: () => void;
  }

  let { viz, onrestart }: Props = $props();

  type DropdownName = ToolbarDropdown | 'group' | 'color' | 'save';

  const popups = new Popups();
  const itemsById = $derived(new Map(viz.dataset.items.map((item) => [item.id, item])));

  let open = $state<{ name: DropdownName; anchor: HTMLElement } | null>(null);

  function toggle(name: DropdownName, anchor: HTMLElement) {
    open = open?.name === name ? null : { name, anchor };
    if (open?.name === 'save') prepareSave();
  }

  function close() {
    open = null;
  }

  // ---------- Save ----------

  const stem = $derived(viz.dataset.name.replace(/\.[^.]+$/, '') || 'nineteen');
  let htmlUrl = $state<string | null>(null);
  let pngUrl = $state<string | null>(null);
  let htmlStatus = $state('Save an interactive version of this view');
  let pngStatus = $state('Save a static image of this view');

  function revoke() {
    if (htmlUrl) URL.revokeObjectURL(htmlUrl);
    if (pngUrl) URL.revokeObjectURL(pngUrl);
    htmlUrl = pngUrl = null;
  }

  async function prepareSave() {
    revoke();
    if (canSaveStandalone()) {
      const html = standaloneHtml(serialize(viz.dataset, viz.toViewState()));
      htmlUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      htmlStatus = 'Save an interactive version of this view';
    } else {
      htmlStatus = 'Available in the built app (npm run build)';
    }
    pngStatus = 'Generating image...';
    try {
      const blob = await renderSnapshot(viz);
      if (open?.name !== 'save') return;
      pngUrl = URL.createObjectURL(blob);
      pngStatus = 'Save a static image of this view';
    } catch {
      pngStatus = 'The image could not be created';
    }
  }

  onDestroy(() => {
    revoke();
    popups.clear();
  });

  function restart(event: MouseEvent) {
    event.preventDefault();
    onrestart();
  }
</script>

<div id="visualize">
  <header id="title-bar">
    <div class="title-left">
      <small class="text-muted">{viz.dataset.name} &mdash; {datasetDetails(viz.dataset)}</small>
      <ul class="keys">
        <li class="viewer-key">
          Grouped by
          <button
            class="key"
            aria-haspopup="dialog"
            aria-expanded={open?.name === 'group'}
            onclick={(e) => toggle('group', e.currentTarget)}>{viz.groupKey}</button
          >
        </li>
        <li class="legend-key">
          color-coded by
          <button
            class="key"
            aria-haspopup="dialog"
            aria-expanded={open?.name === 'color'}
            onclick={(e) => toggle('color', e.currentTarget)}>{viz.colorKey}</button
          >
        </li>
      </ul>
    </div>

    <div class="title-right">
      <a href="./" id="brand" onclick={restart}>nineteen</a>
      <button id="save" aria-haspopup="dialog" aria-expanded={open?.name === 'save'} onclick={(e) => toggle('save', e.currentTarget)}
        >Save</button
      >
    </div>
  </header>

  <figure id="visualization">
    <Legend {viz} />
    <div id="viewer">
      <Viewer {viz} {popups} open={open?.name ?? null} ontoggle={toggle} />
    </div>
  </figure>

  {#if open?.name === 'group'}
    <Dropdown anchor={open.anchor} label="Group by" onclose={close}>
      {#snippet header()}Group by:{/snippet}
      <section>
        {#each viz.dataset.columns as column (column)}
          <label>
            <input
              type="radio"
              name="group-by"
              checked={viz.groupKey === column}
              onchange={() => {
                viz.setGroupKey(column);
                close();
              }}
            />
            <span>{column}</span>
          </label>
        {/each}
      </section>
    </Dropdown>
  {:else if open?.name === 'color'}
    <Dropdown anchor={open.anchor} label="Color by" onclose={close}>
      {#snippet header()}Color by:{/snippet}
      <section>
        <label>
          <input
            type="radio"
            name="color-by"
            checked={viz.automatic}
            onchange={() => {
              viz.setColorKey(null);
              close();
            }}
          />
          <span>Automatic</span>
        </label>
        <hr />
        {#each viz.dataset.columns as column (column)}
          <label>
            <input
              type="radio"
              name="color-by"
              checked={!viz.automatic && viz.colorKey === column}
              onchange={() => {
                viz.setColorKey(column);
                close();
              }}
            />
            <span>{column}</span>
          </label>
        {/each}
      </section>
    </Dropdown>
  {:else if open?.name === 'save'}
    <Dropdown anchor={open.anchor} align="right" className="dropdown-save" label="Save" onclose={close}>
      <a class="save-html" href={htmlUrl} download="{stem}-nineteen.html" onclick={close}>
        <strong>Download HTML file</strong><br />
        <span class="description">{htmlStatus}</span>
      </a>
      <a class="save-png" href={pngUrl} download="nineteen-snapshot.png" onclick={close}>
        <strong>Download PNG image</strong><br />
        <span class="description">{pngStatus}</span>
      </a>
    </Dropdown>
  {:else if open?.name === 'terms'}
    <Dropdown anchor={open.anchor} offset={-35} label="High-frequency words" onclose={close}>
      {#snippet header()}High-frequency Words{/snippet}
      <section>
        {#each viz.terms as term (term.term)}
          <button
            type="button"
            class="term"
            onclick={(e) => {
              viz.searchTerm = addTerm(viz.searchTerm, term.term, e.shiftKey);
              close();
            }}
          >
            <span class="name">{term.term}</span>
            <span class="count text-muted">{term.frequency}</span>
          </button>
        {:else}
          <em class="message text-muted">No terms found. May need to select some columns to search within?</em>
        {/each}
        {#if viz.terms.length}
          <span class="term-hint">Shift-click to require both words (AND)</span>
        {/if}
      </section>
    </Dropdown>
  {:else if open?.name === 'searchIn'}
    <ColumnPicker
      anchor={open.anchor}
      title="Find within:"
      columns={viz.dataset.columns}
      selected={viz.searchScope}
      onchange={(selected) => (viz.searchScope = selected)}
      onclose={close}
    />
  {:else if open?.name === 'viewerColumns'}
    <ColumnPicker
      anchor={open.anchor}
      title="Show in Viewer:"
      columns={viz.dataset.columns}
      selected={viz.viewerColumns}
      onchange={(selected) => (viz.viewerColumns = selected)}
      onclose={close}
    />
  {/if}

  <div id="popups">
    {#each popups.list as popup (popup.key)}
      {@const item = itemsById.get(popup.itemId)}
      {#if item}
        <Popup {popup} {popups} {item} {viz} />
      {/if}
    {/each}
  </div>
</div>
