<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import type { FitMode } from '../lib/persist';
  import { cachedDownloads, downloadSize, MODELS, removeDownloads, type Download } from '../lib/semantic/models';
  import { BOX_LIMITS, DEFAULTS, appSettings } from '../lib/settings.svelte';
  import type { Viz } from '../lib/viz.svelte';

  interface Props {
    viz: Viz;
    open: boolean;
    onclose: () => void;
  }

  let { viz, open, onclose }: Props = $props();

  /** Values when the dialog opened; restored when it is dismissed without saving */
  let saved = appSettings.snapshot();
  /**
   * The view when the dialog opened: fit and zoom ("Stretch to fit" here is the same switch as the
   * button), and the grouping, which Classic Nineteen changes as soon as it is ticked
   */
  let savedView: { fit: FitMode; zoom: number; rowKey: string | null; columnKey: string | null; colorKey: string; automatic: boolean } = {
    fit: 'none',
    zoom: 1,
    rowKey: null,
    columnKey: null,
    colorKey: '',
    automatic: true,
  };

  /** Model files this browser has downloaded for "Find by meaning" (looked up each time the dialog opens) */
  let downloads = $state<Download[]>([]);
  let removed = $state(false);

  async function removeModels() {
    await removeDownloads();
    downloads = [];
    removed = true;
  }

  // Taken once per opening (untracked, or live edits would overwrite what Cancel restores)
  $effect(() => {
    if (!open) return;
    removed = false;
    cachedDownloads().then((list) => (downloads = list));
    untrack(() => {
      saved = appSettings.snapshot();
      savedView = {
        fit: viz.fit,
        zoom: viz.zoom,
        rowKey: viz.rowKey,
        columnKey: viz.columnKey,
        colorKey: viz.colorKey,
        automatic: viz.automatic,
      };
    });
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
    // Classic may have folded the columns away: put the grouping back (Classic is already off again if it was)
    viz.rowKey = savedView.rowKey;
    viz.columnKey = savedView.columnKey;
    viz.colorKey = savedView.colorKey;
    viz.automatic = savedView.automatic;
    onclose();
  }

  function resetToDefaults() {
    appSettings.resetDisplay();
    viz.setStretch(false);
  }
</script>

<Modal {open} id="settings" labelledby="settings-title" onclose={cancel}>
  <header class="title-bar">
    <strong class="title" id="settings-title">Settings</strong>
    <button type="button" class="close" aria-label="Close without saving" onclick={cancel}>&times;</button>
  </header>

  <div class="settings-body">
    <fieldset>
      <legend>Features</legend>
      <label class="settings-check">
        <input type="checkbox" bind:checked={appSettings.classic} />
        <span>
          <strong>Classic Nineteen</strong>
          <small>
            Rows, split by color and a legend, as in the original. Hides the Columns choice under “Grouped by”, tagging, finding by meaning
            and the AI tools.
          </small>
        </span>
      </label>
    </fieldset>

    <fieldset>
      <legend>Box size</legend>

      <label class="settings-check">
        <input type="checkbox" checked={viz.fit === 'stretch'} onchange={(e) => viz.setStretch(e.currentTarget.checked)} />
        <span>
          <strong>Stretch to fit</strong>
          <small>
            Reshape boxes into rectangles so the visualization fills the window. Same as the Stretch to fit button (bottom right): turning
            on one turns on the other.
          </small>
        </span>
      </label>

      <table class="settings-limits">
        <caption class="sr-only">Box size limits in pixels</caption>
        <thead>
          <tr>
            <td></td>
            <th scope="col">Smallest</th>
            <th scope="col">Largest</th>
          </tr>
        </thead>
        <tbody>
          {#each [{ label: 'Width', min: 'minWidth', max: 'maxWidth' }, { label: 'Height', min: 'minHeight', max: 'maxHeight' }] as const as dim (dim.label)}
            <tr>
              <th scope="row">{dim.label}</th>
              {#each [dim.min, dim.max] as const as field (field)}
                <td>
                  <input
                    type="number"
                    min={BOX_LIMITS.min}
                    max={BOX_LIMITS.max}
                    step="1"
                    aria-label="{field.startsWith('min') ? 'Smallest' : 'Largest'} box {dim.label.toLowerCase()}"
                    bind:value={appSettings[field]}
                    onchange={() => appSettings.normalize(field)}
                  />
                  <span class="unit">px</span>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="settings-hint">
        Limits box sizes when fitting and zooming. Stretch to fit uses the width and height limits separately; square boxes stay within
        both. Defaults: {DEFAULTS.minWidth}–{DEFAULTS.maxWidth} px (boxes are 18 px at actual size).
      </p>
    </fieldset>

    {#if !appSettings.classic}
      <fieldset>
        <legend>Find by meaning</legend>
        <p class="settings-hint">Which language model judges meaning:</p>
        {#each Object.values(MODELS) as model (model.id)}
          <label class="settings-check">
            <input type="radio" name="meaning-model" value={model.id} bind:group={appSettings.meaningModel} />
            <span>
              <strong>{model.label}</strong>
              <small>
                {model.languages[0].toUpperCase() + model.languages.slice(1)}. Download size: {downloadSize(model, 'fp16')} MB, or {downloadSize(
                  model,
                  'q8',
                )} MB for the slower non-GPU version.
              </small>
            </span>
          </label>
        {/each}
        <p class="settings-hint">
          The model you choose is downloaded from Hugging Face the first time you find by meaning, after asking you, and kept by your
          browser. It reads your data on your own computer; nothing is sent anywhere.
        </p>
        <p class="settings-hint">
          {#if downloads.length}
            Downloaded: {downloads.map((d) => `${d.model.label} (${downloadSize(d.model, d.variant)} MB)`).join(', ')}.
            <button type="button" class="link-button" onclick={removeModels}>Remove</button>
          {:else if removed}
            Removed. A model in use keeps working until you reload the page.
          {:else}
            No model downloaded yet.
          {/if}
        </p>
      </fieldset>
    {/if}

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
</Modal>
