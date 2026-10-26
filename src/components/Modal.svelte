<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * A modal <dialog> that opens and closes with the `open` prop. Esc, a click on the backdrop
   * (press and release both outside, so a text selection dragged out doesn't close it) and the
   * browser closing the dialog itself all call `onclose`; the parent decides what that means.
   */
  interface Props {
    open: boolean;
    id: string;
    /** id of the element that titles the dialog */
    labelledby: string;
    onclose: () => void;
    children: Snippet;
  }

  let { open, id, labelledby, onclose, children }: Props = $props();

  let dialog: HTMLDialogElement;
  let pressedOnBackdrop = false;

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  function isBackdrop(event: MouseEvent): boolean {
    if (event.target !== dialog) return false;
    const r = dialog.getBoundingClientRect();
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  }
</script>

<dialog
  {id}
  class="nineteen-dialog"
  bind:this={dialog}
  aria-labelledby={labelledby}
  oncancel={(e) => {
    e.preventDefault();
    onclose();
  }}
  onclose={() => {
    // Only reached if the browser closed the dialog itself (it can ignore preventDefault on repeated Esc)
    if (open) onclose();
  }}
  onpointerdown={(e) => (pressedOnBackdrop = isBackdrop(e))}
  onclick={(e) => {
    if (pressedOnBackdrop && isBackdrop(e)) onclose();
    pressedOnBackdrop = false;
  }}
>
  {@render children()}
</dialog>
