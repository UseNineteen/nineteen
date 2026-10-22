<script lang="ts">
  /** Checkbox list with "Select All / Deselect All", used by "Find within" and "Show in Viewer". */
  import Dropdown from './Dropdown.svelte';

  interface Props {
    anchor: HTMLElement;
    title: string;
    columns: string[];
    selected: string[];
    onchange: (selected: string[]) => void;
    onclose: () => void;
  }

  let { anchor, title, columns, selected, onchange, onclose }: Props = $props();

  function toggle(column: string, checked: boolean) {
    const set = new Set(selected);
    if (checked) set.add(column);
    else set.delete(column);
    // Keep file column order
    onchange(columns.filter((c) => set.has(c)));
  }
</script>

<Dropdown {anchor} align="right" label={title} {onclose}>
  {#snippet header()}
    <span>{title}</span>
    <div class="controls">
      <button type="button" onclick={() => onchange([...columns])}>Select All</button> /
      <button type="button" onclick={() => onchange([])}>Deselect All</button>
    </div>
  {/snippet}
  <section>
    {#each columns as column (column)}
      <label>
        <input
          type="checkbox"
          checked={selected.includes(column)}
          onchange={(e) => toggle(column, e.currentTarget.checked)}
        />
        <span>{column}</span>
      </label>
    {/each}
  </section>
</Dropdown>
