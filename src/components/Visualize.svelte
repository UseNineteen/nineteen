<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import ColumnPicker from './ColumnPicker.svelte';
  import Dropdown from './Dropdown.svelte';
  import Legend from './Legend.svelte';
  import Popup from './Popup.svelte';
  import Viewer, { type ToolbarDropdown } from './Viewer.svelte';
  import AIPanel from './ai/AIPanel.svelte';
  import SettingsDialog from './SettingsDialog.svelte';
  import TagOptions from './TagOptions.svelte';
  import TagsPanel from './TagsPanel.svelte';
  import { datasetDetails, LIST_SEPARATORS, type ListSeparator } from '../lib/data';
  import { saveView, serialize } from '../lib/persist';
  import { Popups } from '../lib/popups.svelte';
  import { addTerm } from '../lib/search';
  import { appSettings } from '../lib/settings.svelte';
  import { toCsv, toXlsx } from '../lib/export-data';
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

  // Every change to the view is remembered for this tab, so a reload comes back to the same view
  // (the data itself is saved by whatever changes it). toViewState reads all of the view's state.
  $effect(() => saveView(viz.toViewState()));

  let open = $state<{ name: DropdownName; anchor: HTMLElement } | null>(null);
  /** In the Group by menu, the column chosen last: the list and tag options below the lists apply to it */
  let groupTouched = $state<string | null>(null);
  const classic = $derived(appSettings.classic);

  // Classic Nineteen: rows (split by color at most), and no tag or AI tools; leaving it brings back what it folded away
  $effect(() => {
    if (!appSettings.classic) {
      untrack(() => viz.leaveClassic());
      return;
    }
    viz.applyClassic();
    aiOpen = false;
    tagsOpen = false;
  });
  let aiOpen = $state(false);
  let settingsOpen = $state(false);
  /** Column whose List display options dialog is open */
  let tagOptionsFor = $state<string | null>(null);
  // Both panels are mounted on first open, then kept (hidden) so a conversation, an Undo message
  // or a half-finished rename survives closing or switching panels
  let aiMounted = $state(false);
  let tagsMounted = $state(false);

  let tagsOpen = $state(false);

  // The AI panel and Manage tags share the space under the toolbar: one at a time
  function toggleAI() {
    aiOpen = !aiOpen;
    aiMounted = true;
    if (aiOpen) tagsOpen = false;
    close();
  }

  function toggleTags() {
    tagsOpen = !tagsOpen;
    tagsMounted = true;
    if (tagsOpen) aiOpen = false;
    close();
  }

  function toggle(name: DropdownName, anchor: HTMLElement) {
    if (name === 'group') groupTouched = null;
    open = open?.name === name ? null : { name, anchor };
  }

  function close() {
    open = null;
  }

  // ---------- Save ----------

  // Each file is built when its entry is clicked, not when the menu opens: building all four up
  // front stalled the menu on large files and left object URLs around to revoke.
  const stem = $derived(viz.dataset.name.replace(/\.[^.]+$/, '') || 'nineteen');
  /** Only the built single-file app can copy itself (fixed for the page's lifetime) */
  const standalone = canSaveStandalone();
  const PNG_READY = 'Save a static image of this view';
  let pngStatus = $state(PNG_READY);
  let rendering = $state(false);

  /** Hands a file to the browser as a download; the object URL lives only as long as the click needs it */
  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveHtml() {
    const html = standaloneHtml(serialize(viz.dataset, viz.toViewState()));
    download(new Blob([html], { type: 'text/html' }), `${stem}-nineteen.html`);
    close();
  }

  // The data itself, including any columns added in Nineteen
  function saveXlsx() {
    const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    download(new Blob([toXlsx(viz.dataset) as BlobPart], { type }), `${stem}-nineteen.xlsx`);
    close();
  }

  function saveCsv() {
    download(new Blob([toCsv(viz.dataset)], { type: 'text/csv' }), `${stem}-nineteen.csv`);
    close();
  }

  async function savePng() {
    if (rendering) return;
    rendering = true;
    pngStatus = 'Generating image…';
    try {
      const blob = await renderSnapshot(viz);
      download(blob, 'nineteen-snapshot.png');
      pngStatus = PNG_READY;
      close();
    } catch {
      pngStatus = 'The image could not be created';
    } finally {
      rendering = false;
    }
  }

  onDestroy(() => popups.clear());

  function restart(event: MouseEvent) {
    event.preventDefault();
    onrestart();
  }
</script>

{#snippet tagControls(column: string)}
  {@const isList = viz.isTagColumn(column)}
  {@const isTags = isList && viz.tagEditColumn === column}
  <hr />
  <label title="Split each cell into separate values, like “gift, price”; data items are grouped by their combination of values">
    <input type="checkbox" checked={isList} onchange={(e) => viz.setTagColumn(column, e.currentTarget.checked)} />
    <span>“{column}” holds lists of values</span>
  </label>
  <label
    class:disabled={isTags && !viz.tagsColumnChoice}
    title={isTags && !viz.tagsColumnChoice
      ? 'Tags are stored in a field named “Tags” unless you choose another one'
      : 'The viewer’s tag box, “Tag these…” and Manage tags write to this field'}
  >
    <input
      type="checkbox"
      checked={isTags}
      disabled={isTags && !viz.tagsColumnChoice}
      onchange={(e) => (e.currentTarget.checked ? viz.setTagsColumn(column) : viz.resetTagsColumn())}
    />
    <span>Use “{column}” for tags</span>
  </label>
  {#if isList}
    <div class="dropdown-field">
      <span>Split values on</span>
      <select
        value={viz.separatorOf(column)}
        aria-label="Split “{column}” values on"
        onchange={(e) => viz.setListSeparator(column, e.currentTarget.value as ListSeparator)}
      >
        {#each LIST_SEPARATORS as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>
    <button
      type="button"
      class="dropdown-action"
      onclick={() => {
        close();
        tagOptionsFor = column;
      }}>List display options…</button
    >
  {/if}
{/snippet}

<div id="visualize">
  <header id="title-bar">
    <div class="title-left">
      <small class="text-muted">{viz.dataset.name} &mdash; {datasetDetails(viz.dataset)}</small>
      <ul class="keys">
        <li class="viewer-key">
          Grouped by
          {#if viz.rowKey !== null}
            <button
              class="key"
              aria-haspopup="dialog"
              aria-expanded={open?.name === 'group'}
              title="Rows: {viz.rowKey}"
              onclick={(e) => toggle('group', e.currentTarget)}>{viz.rowKey}</button
            >
          {/if}
          {#if viz.rowKey !== null && viz.columnKey !== null}and{/if}
          {#if viz.columnKey !== null}
            <button
              class="key"
              aria-haspopup="dialog"
              aria-expanded={open?.name === 'group'}
              title="Columns: {viz.columnKey}"
              onclick={(e) => toggle('group', e.currentTarget)}>{viz.columnKey}</button
            >
          {/if}
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
      <button
        id="settings-toggle"
        aria-haspopup="dialog"
        aria-expanded={settingsOpen}
        onclick={() => {
          close();
          settingsOpen = true;
        }}>Settings</button
      >
    </div>
  </header>

  <figure id="visualization">
    <Legend {viz} />
    <div id="viewer">
      <Viewer
        {viz}
        {popups}
        open={open?.name ?? null}
        ontoggle={toggle}
        {aiOpen}
        ontoggleai={toggleAI}
        {tagsOpen}
        ontoggletags={toggleTags}
      >
        {#snippet side()}
          {#if tagsMounted}
            <div class="side-dock" hidden={!tagsOpen}>
              <TagsPanel {viz} onclose={() => (tagsOpen = false)} ondisplayoptions={(column) => (tagOptionsFor = column)} />
            </div>
          {/if}
          {#if aiMounted}
            <div class="side-dock" hidden={!aiOpen}>
              <AIPanel {viz} {popups} onclose={() => (aiOpen = false)} />
            </div>
          {/if}
        {/snippet}
      </Viewer>
    </div>
  </figure>

  {#if open?.name === 'group'}
    <Dropdown anchor={open.anchor} label="Group by" onclose={close}>
      {#snippet header()}Group by:{/snippet}
      <section>
        {#if !classic}
          <h4>Rows</h4>
          <label
            class:disabled={viz.columnKey === null}
            title={viz.columnKey === null ? 'Choose columns first' : 'No rows: each column collects its data items in a grid'}
          >
            <input
              type="radio"
              name="group-rows"
              checked={viz.rowKey === null}
              disabled={viz.columnKey === null}
              onchange={() => viz.setRowKey(null)}
            />
            <span>None</span>
          </label>
        {/if}
        {#each viz.dataset.columns as column (column)}
          <label>
            <input
              type="radio"
              name="group-rows"
              checked={viz.rowKey === column}
              onchange={() => {
                viz.setRowKey(column);
                groupTouched = column;
                if (classic) close();
              }}
            />
            <span>{column}</span>
          </label>
        {/each}
        {#if !classic}
          <hr />
          <h4>Columns</h4>
          <label class:disabled={viz.rowKey === null} title={viz.rowKey === null ? 'Choose rows first' : 'No columns: one row per value'}>
            <input
              type="radio"
              name="group-columns"
              checked={viz.columnKey === null}
              disabled={viz.rowKey === null}
              onchange={() => viz.setColumnKey(null)}
            />
            <span>None</span>
          </label>
          {#each viz.dataset.columns as column (column)}
            <label>
              <input
                type="radio"
                name="group-columns"
                checked={viz.columnKey === column}
                onchange={() => {
                  viz.setColumnKey(column);
                  groupTouched = column;
                }}
              />
              <span>{column}</span>
            </label>
          {/each}
          {@render tagControls(groupTouched !== null && viz.dataset.columns.includes(groupTouched) ? groupTouched : viz.groupKey)}
        {/if}
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
        {#if !viz.automatic && !classic}{@render tagControls(viz.colorKey)}{/if}
      </section>
    </Dropdown>
  {:else if open?.name === 'save'}
    <Dropdown anchor={open.anchor} align="right" className="dropdown-save" label="Save" onclose={close}>
      <button type="button" class="save-html" disabled={!standalone} onclick={saveHtml}>
        <strong>Download HTML file</strong><br />
        <span class="description"
          >{standalone ? 'Save an interactive version of this view' : 'Available in the built app (npm run build)'}</span
        >
      </button>
      <button type="button" class="save-png" disabled={rendering} aria-busy={rendering} onclick={savePng}>
        <strong>Download PNG image</strong><br />
        <span class="description">{pngStatus}</span>
      </button>
      <button type="button" class="save-xlsx" onclick={saveXlsx}>
        <strong>Download spreadsheet (.xlsx)</strong><br />
        <span class="description">All data items and fields, including fields added in Nineteen</span>
      </button>
      <button type="button" class="save-csv" onclick={saveCsv}>
        <strong>Download CSV</strong><br />
        <span class="description">The same data as plain text</span>
      </button>
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
          <em class="message text-muted">No terms found. May need to select some fields to search within?</em>
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

  <TagOptions {viz} column={tagOptionsFor} onclose={() => (tagOptionsFor = null)} />
  <SettingsDialog {viz} open={settingsOpen} onclose={() => (settingsOpen = false)} />

  <div id="popups">
    {#each popups.list as popup (popup.key)}
      {@const item = itemsById.get(popup.itemId)}
      {#if item}
        <Popup {popup} {popups} {item} {viz} />
      {/if}
    {/each}
  </div>
</div>
