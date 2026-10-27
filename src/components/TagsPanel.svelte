<script lang="ts">
  import { tick } from 'svelte';
  import { normalizeTag, splitTags } from '../lib/data';
  import { dataItems } from '../lib/text';
  import { PointerDrag } from '../lib/drag';
  import { tagKey } from '../lib/tags';
  import { download } from '../lib/download';
  import { formatTagList, parseTagList, TAG_LIST_FORMATS, type TagListFormat, type TagListItem } from '../lib/tag-list';
  import type { Viz } from '../lib/viz.svelte';

  /**
   * Manage tags: every tag in the tags column with its count and description, plus the tag
   * list's tags no data item carries yet. Rename (click the name), describe (click the line
   * under it), combine (drag one tag onto another, or "Combine into…"), delete, or copy a tag
   * into its own True/False data field. The tag list can be exported and imported. Every
   * change to the data can be undone until the next one.
   */
  type TagInfo = TagListItem;
  interface Props {
    viz: Viz;
    onclose: () => void;
    /** Opens List display options for the tags column */
    ondisplayoptions: (column: string) => void;
  }

  let { viz, onclose, ondisplayoptions }: Props = $props();

  const NEW_TAGS = '';

  let filter = $state('');
  let sortBy = $state<'count' | 'name'>('count');
  /** One tag at a time is being renamed, or has its actions open */
  let renaming = $state<string | null>(null);
  let renameDraft = $state('');
  let menuFor = $state<string | null>(null);
  /** A change that needs confirming first */
  let pending = $state<
    | { kind: 'combine'; from: TagInfo; into: TagInfo }
    | { kind: 'delete'; tag: TagInfo }
    | { kind: 'column'; tag: TagInfo; name: string; keep: boolean }
    | { kind: 'pick-combine'; from: TagInfo; into: string }
    | null
  >(null);
  /** What the last change did, shown with Undo */
  // Raw, so `undo` stays the very object Viz holds and can be compared with it
  let message = $state.raw<{ text: string; undo: Viz['tagUndo'] } | null>(null);
  /** Shows what a change did, with an Undo that belongs to that change */
  function report(text: string) {
    message = { text, undo: viz.tagUndo };
  }

  const column = $derived(viz.tagEditColumn);
  const separator = $derived(viz.separatorOf(column));
  /** Tags in the data and in the tag list, with counts and descriptions */
  const catalog = $derived(viz.tagEntries);
  const shown = $derived.by(() => {
    const needle = filter.trim().toLowerCase();
    const list = needle ? catalog.filter((t) => t.key.includes(needle) || t.description.toLowerCase().includes(needle)) : [...catalog];
    if (sortBy === 'name') list.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }));
    return list;
  });
  /** The tag column can be any column; "Tags" is offered even before it exists */
  const columnChoices = $derived(
    viz.dataset.columns.some((c) => /^tags$/i.test(c)) ? viz.dataset.columns : [...viz.dataset.columns, NEW_TAGS],
  );

  function chooseColumn(value: string) {
    if (value === NEW_TAGS) viz.resetTagsColumn();
    else viz.setTagsColumn(value);
    reset();
  }

  function reset() {
    renaming = null;
    describing = null;
    menuFor = null;
    pending = null;
  }

  // ---------- Descriptions ----------

  /** The tag whose description is being edited */
  let describing = $state<string | null>(null);
  let descriptionDraft = $state('');

  async function startDescribe(tag: TagInfo) {
    reset();
    describing = tag.key;
    descriptionDraft = tag.description;
    await tick();
    const field = document.getElementById(`tag-describe-${tag.key}`) as HTMLTextAreaElement | null;
    field?.focus();
  }

  function finishDescribe(tag: TagInfo) {
    if (describing !== tag.key) return;
    describing = null;
    const next = descriptionDraft.trim();
    if (next !== tag.description) viz.describeTag(tag.label, next);
  }

  // ---------- The tag list: export and import ----------

  let fileInput = $state<HTMLInputElement>();
  let importError = $state<string | null>(null);

  function exportList(format: TagListFormat) {
    const spec = TAG_LIST_FORMATS.find((f) => f.id === format)!;
    const rows = [...catalog]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((t) => ({ tag: t.label, description: t.description, count: t.count }));
    const stem = viz.dataset.name.replace(/\.[^.]+$/, '') || 'nineteen';
    download(new Blob([formatTagList(rows, format)], { type: spec.type }), `${stem}-tags.${spec.extension}`);
  }

  async function importList() {
    const file = fileInput?.files?.[0];
    if (fileInput) fileInput.value = '';
    if (!file) return;
    importError = null;
    try {
      const entries = parseTagList(file.name, await file.text());
      if (!entries.length) throw new Error('No tags were found in the file.');
      const { added, described } = viz.importTagList(entries);
      reset();
      const parts = [added ? `added ${added === 1 ? '1 tag' : `${added} tags`}` : '', described ? `described ${described}` : ''].filter(
        Boolean,
      );
      if (parts.length) report(`Imported the tag list: ${parts.join(', ')}.`);
      else importError = `Every tag in “${file.name}” was already in the list.`;
    } catch (error) {
      importError = `“${file.name}” could not be read as a tag list. ${(error as Error).message}`;
    }
  }

  /** How many data items have `a`, and how many of those also have `b` */
  function overlap(a: string, b: string): { from: number; both: number } {
    let from = 0;
    let both = 0;
    for (const item of viz.dataset.items) {
      const keys = splitTags(item.raw[column], separator).map(tagKey);
      if (!keys.includes(a)) continue;
      from++;
      if (keys.includes(b)) both++;
    }
    return { from, both };
  }

  // ---------- Rename ----------

  async function startRename(tag: TagInfo) {
    reset();
    renaming = tag.key;
    renameDraft = tag.label;
    await tick();
    const input = document.getElementById(`tag-rename-${tag.key}`) as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }

  function finishRename(tag: TagInfo) {
    const next = normalizeTag(renameDraft);
    renaming = null;
    if (!next || next === tag.label) return;
    const existing = catalog.find((t) => t.key === tagKey(next) && t.key !== tag.key);
    // Renaming onto another tag is really a combine: confirm it with the numbers
    if (existing) pending = { kind: 'combine', from: tag, into: existing };
    else {
      viz.renameTag(tag.label, next);
      report(`Renamed “${tag.label}” to “${next}”.`);
    }
  }

  // ---------- Combine ----------

  function combine(from: TagInfo, into: TagInfo) {
    viz.combineTags(from.label, into.label);
    pending = null;
    report(`Combined “${from.label}” into “${into.label}”.`);
  }

  // Drag one tag onto another
  let listEl = $state<HTMLElement>();
  let dragging = $state<string | null>(null);
  let dropOn = $state<string | null>(null);
  /** Set when a drag ends, so the click that follows doesn't start a rename */
  let justDragged = false;
  const drag = new PointerDrag<string>({
    onstart: ({ pressed }) => (dragging = pressed),
    onmove: ({ event }) => {
      const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-tag-key]');
      const key = row?.dataset.tagKey ?? null;
      dropOn = key && key !== dragging ? key : null;
    },
    onend: (_move, dragged) => {
      if (dragged) {
        justDragged = true;
        setTimeout(() => (justDragged = false));
        const from = catalog.find((t) => t.key === dragging);
        const into = catalog.find((t) => t.key === dropOn);
        if (from && into) {
          reset();
          pending = { kind: 'combine', from, into };
        }
      }
      dragging = dropOn = null;
    },
  });

  function pointerdown(tag: TagInfo, event: PointerEvent) {
    if (renaming) return;
    // The name can be dragged too (a click without moving still renames)
    if ((event.target as HTMLElement).closest('.tags-more, .tags-menu, .tags-description, input, select, textarea')) return;
    drag.press(tag.key, event);
  }

  // ---------- Delete, column ----------

  function confirmDelete(tag: TagInfo) {
    const changed = viz.deleteTag(tag.label);
    pending = null;
    report(changed ? `Deleted “${tag.label}” from ${dataItems(changed)}.` : `Removed “${tag.label}” from the tag list.`);
  }

  function makeColumn(tag: TagInfo, name: string, keep: boolean) {
    const created = viz.tagToColumn(tag.label, name, keep);
    pending = null;
    const yes = tag.count;
    const counts = `${yes} True, ${viz.dataset.items.length - yes} False`;
    report(keep ? `Added data field “${created}”: ${counts}.` : `Converted “${tag.label}” into data field “${created}”: ${counts}.`);
  }

  function undo() {
    viz.undoTags();
    message = null;
  }

  function act(action: 'rename' | 'combine' | 'column' | 'delete', tag: TagInfo) {
    menuFor = null;
    if (action === 'rename') return startRename(tag);
    reset();
    if (action === 'combine') pending = { kind: 'pick-combine', from: tag, into: catalog.find((t) => t.key !== tag.key)?.key ?? '' };
    if (action === 'delete') pending = { kind: 'delete', tag };
    if (action === 'column') pending = { kind: 'column', tag, name: viz.freeColumnName(tag.label), keep: false };
  }
</script>

<svelte:window
  onpointerdown={(e) => {
    // A tag's actions menu closes on any click outside it
    if (menuFor && !(e.target as HTMLElement).closest('.tags-menu, .tags-more')) menuFor = null;
  }}
  onkeydown={(e) => e.key === 'Escape' && menuFor && (menuFor = null)}
/>

<aside id="tags-panel" aria-label="Manage tags">
  <header class="panel-header">
    <strong>Manage tags</strong>
    <button type="button" class="panel-close" aria-label="Close Manage tags" onclick={onclose}>&times;</button>
  </header>

  <div class="tags-body">
    <label class="tags-column">
      <span>Tags are stored in</span>
      <select value={viz.tagsColumnChoice ?? (viz.hasTags ? column : NEW_TAGS)} onchange={(e) => chooseColumn(e.currentTarget.value)}>
        {#each columnChoices as choice (choice)}
          <option value={choice}>{choice === NEW_TAGS ? 'Tags (a new field)' : choice}</option>
        {/each}
      </select>
    </label>

    {#if message && message.undo && viz.tagUndo === message.undo}
      <div class="tags-message" role="status">
        {message.text} <button type="button" onclick={undo}>Undo</button>
      </div>
    {/if}
    {#if importError}
      <div class="tags-message tags-error" role="alert">
        {importError} <button type="button" onclick={() => (importError = null)}>Dismiss</button>
      </div>
    {/if}

    {#if pending?.kind === 'combine'}
      {@const counts = overlap(pending.from.key, pending.into.key)}
      <div class="tags-confirm" role="alertdialog" aria-label="Combine tags">
        <p>
          Combine <strong>“{pending.from.label}”</strong> into <strong>“{pending.into.label}”</strong>?
          {dataItems(counts.from - counts.both)} gain “{pending.into.label}”{#if counts.both}; {counts.both} already had both{/if}.
        </p>
        <div class="tags-confirm-actions">
          <button type="button" class="btn btn-primary" onclick={() => pending?.kind === 'combine' && combine(pending.from, pending.into)}
            >Combine</button
          >
          <button type="button" class="btn" onclick={() => (pending = null)}>Cancel</button>
        </div>
      </div>
    {:else if pending?.kind === 'pick-combine'}
      <!-- A narrowed copy for the closures below, which can't see the {:else if} test -->
      {@const picking = pending}
      <div class="tags-confirm">
        <label>
          Combine <strong>“{picking.from.label}”</strong> into
          <select bind:value={pending.into}>
            {#each catalog.filter((t) => t.key !== picking.from.key) as tag (tag.key)}
              <option value={tag.key}>{tag.label}</option>
            {/each}
          </select>
        </label>
        <div class="tags-confirm-actions">
          <button
            type="button"
            class="btn btn-primary"
            onclick={() => {
              const into = catalog.find((t) => t.key === picking.into);
              if (into) pending = { kind: 'combine', from: picking.from, into };
            }}>Next</button
          >
          <button type="button" class="btn" onclick={() => (pending = null)}>Cancel</button>
        </div>
      </div>
    {:else if pending?.kind === 'delete'}
      <div class="tags-confirm" role="alertdialog" aria-label="Delete tag">
        <p>
          {#if pending.tag.count}
            Remove <strong>“{pending.tag.label}”</strong> from {dataItems(pending.tag.count)}?
          {:else}
            Remove <strong>“{pending.tag.label}”</strong> from the tag list? No data item carries it.
          {/if}
        </p>
        <div class="tags-confirm-actions">
          <button type="button" class="btn btn-danger" onclick={() => pending?.kind === 'delete' && confirmDelete(pending.tag)}
            >Delete</button
          >
          <button type="button" class="btn" onclick={() => (pending = null)}>Cancel</button>
        </div>
      </div>
    {:else if pending?.kind === 'column'}
      <form
        class="tags-confirm"
        onsubmit={(e) => {
          e.preventDefault();
          if (pending?.kind === 'column') makeColumn(pending.tag, pending.name, pending.keep);
        }}
      >
        <p>
          {pending.keep ? 'Add' : 'Replace the tag with'} a data field that is <strong>True</strong> for the
          {dataItems(pending.tag.count)} tagged “{pending.tag.label}” and <strong>False</strong> for the rest.
        </p>
        <label>Field name <input type="text" bind:value={pending.name} spellcheck="false" /></label>
        <label class="tags-keep">
          <input type="checkbox" bind:checked={pending.keep} />
          Keep the tag too <span class="tags-keep-note">(the field won’t follow later tag changes)</span>
        </label>
        <div class="tags-confirm-actions">
          <button type="submit" class="btn btn-primary" disabled={!pending.name.trim()}
            >{pending.keep ? 'Add data field' : 'Convert'}</button
          >
          <button type="button" class="btn" onclick={() => (pending = null)}>Cancel</button>
        </div>
      </form>
    {/if}

    {#if catalog.length}
      <div class="tags-tools">
        <input type="search" placeholder="Filter tags" aria-label="Filter tags" bind:value={filter} />
        <select aria-label="Sort tags" bind:value={sortBy}>
          <option value="count">Most used</option>
          <option value="name">A–Z</option>
        </select>
      </div>

      <ul
        class="tags-list"
        class:dragging={dragging !== null}
        bind:this={listEl}
        aria-label="Tags. Drag a tag onto another to combine them."
        onpointermove={(e) => drag.move(listEl, e)}
        onpointerup={(e) => drag.release(e)}
        onpointercancel={(e) => drag.release(e)}
      >
        {#each shown as tag (tag.key)}
          <li
            data-tag-key={tag.key}
            class:being-dragged={dragging === tag.key}
            class:drop-target={dropOn === tag.key}
            onpointerdown={(e) => pointerdown(tag, e)}
          >
            <span class="grip" aria-hidden="true"></span>
            {#if renaming === tag.key}
              <input
                id="tag-rename-{tag.key}"
                class="tags-rename"
                bind:value={renameDraft}
                aria-label="New name for {tag.label}"
                spellcheck="false"
                onkeydown={(e) => {
                  if (e.key === 'Enter') finishRename(tag);
                  if (e.key === 'Escape') renaming = null;
                }}
                onblur={() => renaming === tag.key && finishRename(tag)}
              />
            {:else}
              <button type="button" class="tags-name" title="Rename “{tag.label}”" onclick={() => !justDragged && startRename(tag)}
                >{tag.label}</button
              >
            {/if}
            <span
              class="tags-count"
              class:unused={tag.count === 0}
              title={tag.count === 0 ? 'No data item carries this tag yet' : undefined}>{tag.count || 'unused'}</span
            >
            <button
              type="button"
              class="tags-more"
              aria-label="More actions for {tag.label}"
              aria-expanded={menuFor === tag.key}
              onclick={() => (menuFor = menuFor === tag.key ? null : tag.key)}>⋯</button
            >
            {#if menuFor === tag.key}
              <div class="tags-menu" role="menu">
                <button type="button" role="menuitem" onclick={() => act('rename', tag)}>Rename</button>
                <button type="button" role="menuitem" disabled={catalog.length < 2} onclick={() => act('combine', tag)}
                  >Combine into…</button
                >
                <button type="button" role="menuitem" onclick={() => act('column', tag)}>Convert this tag into a data field…</button>
                <button type="button" role="menuitem" onclick={() => viz.colorByTag(tag.label)}>Color by this tag</button>
                <button type="button" role="menuitem" class="danger" onclick={() => act('delete', tag)}>Delete…</button>
              </div>
            {/if}
            {#if describing === tag.key}
              <textarea
                id="tag-describe-{tag.key}"
                class="tags-describe"
                rows="2"
                bind:value={descriptionDraft}
                aria-label="Description of {tag.label}"
                placeholder="What this tag means"
                onkeydown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    finishDescribe(tag);
                  }
                  if (e.key === 'Escape') describing = null;
                }}
                onblur={() => finishDescribe(tag)}
              ></textarea>
            {:else}
              <button
                type="button"
                class="tags-description"
                class:empty={!tag.description}
                title={tag.description ? 'Edit the description' : 'Describe this tag'}
                onclick={() => !justDragged && startDescribe(tag)}>{tag.description || 'Add a description'}</button
              >
            {/if}
          </li>
        {:else}
          <li class="tags-empty">No tags match “{filter}”.</li>
        {/each}
      </ul>
      <p class="tags-hint">Click a name to rename it, or the line under it to describe it. Drag a tag onto another to combine them.</p>
    {:else}
      <p class="tags-hint">
        No tags yet. Tag data items from a pinned viewer (click a box), search and choose <strong>Tag these…</strong>, or import a tag list
        below.
      </p>
    {/if}
  </div>

  <footer class="tags-footer">
    <div class="tags-list-tools">
      <span>Tag list:</span>
      <button type="button" class="link-button" onclick={() => fileInput?.click()}>Import…</button>
      <input
        bind:this={fileInput}
        type="file"
        accept=".csv,.tsv,.json,.txt,text/csv,application/json,text/plain"
        hidden
        onchange={importList}
      />
      {#if catalog.length}
        <span class="tags-export">Export as</span>
        {#each TAG_LIST_FORMATS as format (format.id)}
          <button type="button" class="link-button" onclick={() => exportList(format.id)}>{format.label}</button>
        {/each}
      {/if}
    </div>
    <button type="button" class="link-button" onclick={() => ondisplayoptions(column)}>List display options…</button>
  </footer>
</aside>
