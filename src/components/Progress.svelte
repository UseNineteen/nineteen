<script lang="ts">
  interface Props {
    message: string;
    progress: number | null;
    error?: string;
    oncancel: () => void;
  }

  let { message, progress, error, oncancel }: Props = $props();

  const pct = $derived(progress === null ? '' : `${Math.round(progress * 100)}%`);
</script>

<div id="progress" class:error role="dialog" aria-modal="true" aria-labelledby="progress-title">
  <div class="progress-window">
    <header class="title-bar">
      <strong class="title" id="progress-title">{error ? 'Couldn’t load that file' : 'Loading data'}</strong>
      <button class="close" aria-label="Cancel" onclick={oncancel}>&times;</button>
    </header>

    <section class="content">
      {#if error}
        <p class="error-message" role="alert">{error}</p>
      {:else}
        <div class="status" aria-live="polite">
          <span class="message">{message}</span>
          <span class="pct">{pct}</span>
        </div>
        <div
          class="progress-bar"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={progress === null ? undefined : Math.round(progress * 100)}
        >
          <div class="progress-bar-fill" style:width={pct}></div>
        </div>
      {/if}
    </section>
  </div>
</div>
