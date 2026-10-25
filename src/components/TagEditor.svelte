<script lang="ts">
  import { splitTags, type ListSeparator } from '../lib/data';
  import { tagKey } from '../lib/tags';

  interface Props {
    tags: string[];
    /** Existing tags offered while typing */
    suggestions?: string[];
    editable?: boolean;
    onchange?: (tags: string[]) => void;
    /** Clicking a tag (to search for it) */
    onpick?: (tag: string) => void;
    id: string;
    /** How the column's cells are split; typing that separator finishes a tag */
    separator?: ListSeparator;
  }

  let { tags, suggestions = [], editable = false, onchange, onpick, id, separator = 'auto' }: Props = $props();

  /** Keys that finish a tag (new lines can't be typed into the field, so Enter does it) */
  const FINISH_KEYS: Record<ListSeparator, string[]> = { auto: [',', ';'], comma: [','], semicolon: [';'], newline: [] };
  const FINISH: Record<ListSeparator, RegExp | null> = { auto: /[,;]/, comma: /,/, semicolon: /;/, newline: null };

  let draft = $state('');

  const available = $derived(suggestions.filter((s) => !tags.some((t) => tagKey(t) === tagKey(s))));

  /** Reuse the existing spelling of a tag when one matches, so "Price" and "price" stay one tag */
  function canonical(tag: string): string {
    return suggestions.find((s) => tagKey(s) === tagKey(tag)) ?? tag;
  }

  function add(text: string) {
    // A typed tag is one value: only the column's own separator splits it
    const added = (separator === 'newline' ? [text.trim()] : splitTags(text, separator)).filter(Boolean).map(canonical);
    draft = '';
    if (!added.length) return;
    onchange?.([...tags, ...added.filter((a) => !tags.some((t) => tagKey(t) === tagKey(a)))]);
  }

  function remove(tag: string) {
    onchange?.(tags.filter((t) => t !== tag));
  }

  /** Typing or pasting the separator finishes the tags before it (pasting "gift, price" adds both) */
  function input(event: Event & { currentTarget: HTMLInputElement }) {
    draft = event.currentTarget.value;
    const finish = FINISH[separator];
    if (!finish || !finish.test(draft)) return;
    const parts = draft.split(finish);
    const rest = parts.pop() ?? '';
    for (const part of parts) add(part);
    draft = rest.trimStart();
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || FINISH_KEYS[separator].includes(event.key)) {
      event.preventDefault();
      add(draft);
    } else if (event.key === 'Backspace' && draft === '' && tags.length) {
      remove(tags[tags.length - 1]);
    }
  }
</script>

<div class="tag-editor" class:editable>
  <ul class="tag-list" aria-label="Tags">
    {#each tags as tag (tag)}
      <li class="tag-chip">
        <button type="button" class="tag-name" title="Find rows tagged “{tag}”" onclick={() => onpick?.(tag)}>{tag}</button>
        {#if editable}
          <button type="button" class="tag-remove" aria-label="Remove tag {tag}" onclick={() => remove(tag)}>&times;</button>
        {/if}
      </li>
    {/each}
    {#if editable}
      <li class="tag-input">
        <input
          type="text"
          bind:value={draft}
          list="{id}-suggestions"
          placeholder={tags.length ? 'Add tag' : 'Add a tag…'}
          aria-label="Add a tag"
          autocomplete="off"
          spellcheck="false"
          onkeydown={keydown}
          oninput={input}
          onblur={() => add(draft)}
        />
        <datalist id="{id}-suggestions">
          {#each available as suggestion (suggestion)}
            <option value={suggestion}></option>
          {/each}
        </datalist>
      </li>
    {/if}
  </ul>
</div>
