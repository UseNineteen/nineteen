<script lang="ts">
  import { parseAnswer, type Inline } from '../../lib/ai/answer';

  interface Props {
    text: string;
    oncite: (rows: number[]) => void;
  }

  let { text, oncite }: Props = $props();

  const blocks = $derived(parseAnswer(text));
</script>

{#snippet parts(list: Inline[])}{#each list as part, i (i)}{#if part.kind === 'cite'}<button
        type="button"
        class="ai-cite"
        title="Show {part.rows.length === 1 ? 'this row' : `these ${part.rows.length} rows`} in the visualization"
        onclick={() => oncite(part.rows)}>{part.label}</button
      >{:else if part.bold}<strong>{part.text}</strong>{:else if part.italic}<em>{part.text}</em>{:else}{part.text}{/if}{/each}{/snippet}

<div class="ai-answer">
  {#each blocks as block, i (i)}
    {#if block.kind === 'heading'}
      <h4>{@render parts(block.parts)}</h4>
    {:else if block.kind === 'paragraph'}
      <p>{@render parts(block.parts)}</p>
    {:else if block.ordered}
      <ol>
        {#each block.items as item, j (j)}<li>{@render parts(item)}</li>{/each}
      </ol>
    {:else}
      <ul>
        {#each block.items as item, j (j)}<li>{@render parts(item)}</li>{/each}
      </ul>
    {/if}
  {/each}
</div>
