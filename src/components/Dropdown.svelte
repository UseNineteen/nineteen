<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** The button that opened this dropdown (clicks on it are left to its own toggle handler) */
    anchor: HTMLElement;
    align?: 'left' | 'right';
    /** Horizontal offset from the anchor's aligned edge */
    offset?: number;
    className?: string;
    label: string;
    onclose: () => void;
    header?: Snippet;
    children: Snippet;
  }

  let { anchor, align = 'left', offset = 0, className = '', label, onclose, header, children }: Props = $props();

  let element: HTMLElement;
  /** Where the anchor is; measured again on resize (a writable derived: assignments override it until the anchor changes) */
  let rect = $derived(anchor.getBoundingClientRect());

  const left = $derived((align === 'right' ? rect.right : rect.left) + offset);

  function reposition() {
    rect = anchor.getBoundingClientRect();
  }

  function outside(event: PointerEvent) {
    const target = event.target as Node;
    if (!element.contains(target) && !anchor.contains(target)) onclose();
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      // Closing unmounts this dropdown, and with it the `anchor` prop, so keep the element first
      const opener = anchor;
      onclose();
      opener.focus();
    }
  }
</script>

<svelte:window onpointerdown={outside} onresize={reposition} onkeydown={keydown} />

<div
  bind:this={element}
  class="dropdown {className}"
  class:dropdown-right={align === 'right'}
  style:left="{left}px"
  style:top="{rect.bottom}px"
  role="dialog"
  aria-label={label}
>
  {#if header}
    <header>{@render header()}</header>
  {/if}
  {@render children()}
</div>
