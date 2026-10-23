<script lang="ts">
  import type { FitMode } from '../lib/persist';
  import { BOX_LIMITS, DEFAULTS, appSettings } from '../lib/settings.svelte';
  import type { Viz } from '../lib/viz.svelte';

  interface Props {
    viz: Viz;
    open: boolean;
    onclose: () => void;
  }

  let { viz, open, onclose }: Props = $props();

  let dialog: HTMLDialogElement;
  /** Values when the dialog opened; restored when it is dismissed without saving */
  let saved = appSettings.snapshot();
  /** The view's fit and zoom when the dialog opened, since "Stretch to fit" here is the same switch as the button */
  let savedView: { fit: FitMode; zoom: number } = { fit: 'none', zoom: 1 };
  let pressedOnBackdrop = false;

  $effect(() => {
    if (open && !dialog.open) {
      saved = appSettings.snapshot();
      savedView = { fit: viz.fit, zoom: viz.zoom };
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  /** Changes preview live; Save keeps them. */
  function save() {
    // Remembered settings open future files the same way
    appSettings.stretchByDefault = viz.fit === 'stretch';
    appSettings.persist();
    onclose();
  }

  /** Clicking outside, Esc and × all discard the changes. */
  function cancel() {
    appSettings.restore(saved);
    viz.fit = savedView.fit;
    viz.zoom = savedView.zoom;
    onclose();
  }

  function resetToDefaults() {
    appSettings.resetDisplay();
    viz.setStretch(false);
  }

  function isBackdrop(event: MouseEvent): boolean {
    if (event.target !== dialog) return false;
    const r = dialog.getBoundingClientRect();
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  }
</script>

<dialog
  id="settings"
  class="nineteen-dialog"
  bind:this={dialog}
  aria-labelledby="settings-title"
  oncancel={(e) => {
    e.preventDefault();
    cancel();
  }}
  onclose={() => {
    // Only reached if the browser closed the dialog itself (it can ignore preventDefault on repeated Esc)
    if (open) cancel();
  }}
  onpointerdown={(e) => (pressedOnBackdrop = isBackdrop(e))}
  onclick={(e) => {
    // Both press and release outside, so a text selection dragged out of the dialog doesn't close it
    if (pressedOnBackdrop && isBackdrop(e)) cancel();
    pressedOnBackdrop = false;
  }}
>
  <header class="title-bar">
    <strong class="title" id="settings-title">Settings</strong>
    <button type="button" class="close" aria-label="Close without saving" onclick={cancel}>&times;</button>
  </header>

  <div class="settings-body">
    <fieldset>
      <legend>Box size</legend>

      <label class="settings-check">
        <input type="checkbox" checked={viz.fit === 'stretch'} onchange={(e) => viz.setStretch(e.currentTarget.checked)} />
        <span>
          <strong>Stretch to fit</strong>
          <small>
            Reshape boxes into rectangles so the visualization fills the window. Same as the Stretch to fit button
            (bottom right): turning on one turns on the other.
          </small>
        </span>
      </label>

      <div class="settings-sizes">
        <label>
          <span>Smallest box</span>
          <input
            type="number"
            min={BOX_LIMITS.min}
            max={BOX_LIMITS.max}
            step="1"
            bind:value={appSettings.minBox}
            onchange={() => appSettings.normalize('min')}
          />
          <span class="unit">px</span>
        </label>
        <label>
          <span>Largest box</span>
          <input
            type="number"
            min={BOX_LIMITS.min}
            max={BOX_LIMITS.max}
            step="1"
            bind:value={appSettings.maxBox}
            onchange={() => appSettings.normalize('max')}
          />
          <span class="unit">px</span>
        </label>
      </div>
      <p class="settings-hint">
        Limits how small or large boxes get when fitting and zooming. Defaults: {DEFAULTS.minBox}–{DEFAULTS.maxBox} px (boxes
        are 18 px at actual size).
      </p>
    </fieldset>

    <label class="settings-check settings-remember">
      <input type="checkbox" bind:checked={appSettings.remember} />
      <span>
        <strong>Remember settings on this device</strong>
        <small>Stored in this browser only. Otherwise settings reset when you reload or close the page.</small>
      </span>
    </label>
  </div>

  <footer class="settings-footer">
    <button type="button" class="btn" onclick={resetToDefaults}>Reset to defaults</button>
    <span class="settings-spacer"></span>
    <button type="button" class="btn" onclick={cancel}>Cancel</button>
    <button type="button" class="btn btn-primary" onclick={save}>Save</button>
  </footer>
</dialog>
