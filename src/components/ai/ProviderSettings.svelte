<script lang="ts">
  import { PROVIDERS } from '../../lib/ai/providers';
  import { aiSettings } from '../../lib/ai/settings.svelte';

  const provider = $derived(PROVIDERS[aiSettings.provider]);
</script>

<!-- The AI connection: provider, key, model. Lives in Settings; the key is checked as soon as it is entered. -->
<div class="ai-settings">
  <div class="ai-field">
    <span class="ai-label">AI provider</span>
    <div class="ai-segmented" role="radiogroup" aria-label="AI provider">
      {#each Object.values(PROVIDERS) as p (p.id)}
        <button
          type="button"
          role="radio"
          aria-checked={aiSettings.provider === p.id}
          class:active={aiSettings.provider === p.id}
          onclick={() => aiSettings.setProvider(p.id)}>{p.label} <small>({p.company})</small></button
        >
      {/each}
    </div>
  </div>

  <label class="ai-field">
    <span class="ai-label">{provider.company} API key</span>
    <input
      type="password"
      autocomplete="off"
      spellcheck="false"
      placeholder="{provider.keyPrefix}…"
      bind:value={aiSettings.keys[aiSettings.provider]}
      oninput={() => aiSettings.scheduleCheck()}
      onchange={() => aiSettings.check()}
    />
  </label>
  <p class="ai-hint">
    <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer">Get a key from {provider.company}</a>. Usage is billed to your {provider.company}
    account. The key is checked as soon as you enter it, by asking {provider.company} for its model list; no data is sent.
  </p>

  <label class="ai-field">
    <span class="ai-label">Model</span>
    <input
      list="ai-models-{aiSettings.provider}"
      autocomplete="off"
      spellcheck="false"
      placeholder={aiSettings.provider === 'openai' ? 'Enter a key to list models' : provider.defaultModel}
      bind:value={aiSettings.models[aiSettings.provider]}
      onchange={() => aiSettings.persist()}
    />
    <datalist id="ai-models-{aiSettings.provider}">
      {#each aiSettings.modelLists[aiSettings.provider] as id (id)}
        <option value={id}></option>
      {/each}
    </datalist>
  </label>

  <div class="ai-row">
    <button type="button" class="btn" disabled={!aiSettings.key || aiSettings.checking} onclick={() => aiSettings.check()}>
      {aiSettings.checking ? 'Checking…' : aiSettings.status ? 'Check again' : 'Check key'}
    </button>
    {#if aiSettings.checking}
      <span class="ai-status" role="status">Checking the key…</span>
    {:else if aiSettings.status}
      <span class="ai-status" class:error={aiSettings.status.error} role="status">{aiSettings.status.text}</span>
    {/if}
  </div>

  <label class="ai-check">
    <input type="checkbox" bind:checked={aiSettings.remember} onchange={() => aiSettings.persist()} />
    <span>Remember key on this device (stored in this browser only)</span>
  </label>
  <p class="ai-hint">
    {#if aiSettings.remember}
      Saved in this browser’s local storage. Anyone using this browser profile can use it.
      <button type="button" class="link-button" onclick={() => aiSettings.forget()}>Forget my keys</button>
    {:else}
      Your key is kept only in this page’s memory and is forgotten when you close the tab.
    {/if}
  </p>
</div>
