<script lang="ts">
  import { PROVIDERS, preferredOpenAIModel, type ProviderId } from '../../lib/ai/providers';
  import { aiSettings } from '../../lib/ai/settings.svelte';

  let models = $state<Record<ProviderId, string[]>>({ anthropic: [], openai: [] });
  let status = $state<{ text: string; error: boolean } | null>(null);
  let checking = $state(false);

  const provider = $derived(PROVIDERS[aiSettings.provider]);

  async function check() {
    if (!aiSettings.key) return;
    checking = true;
    status = null;
    const id = aiSettings.provider;
    try {
      const list = await provider.listModels(aiSettings.key);
      models[id] = list;
      const model = aiSettings.models[id].trim();
      if (!model) {
        aiSettings.models[id] =
          id === 'openai' ? preferredOpenAIModel(list) : list.includes(provider.defaultModel) ? provider.defaultModel : (list[0] ?? '');
        status = { text: 'Key works.', error: false };
      } else if (!list.includes(model)) {
        // A typed model is kept: aliases such as "claude-opus-5-5" work for requests without appearing in the list
        status = { text: `Key works. “${model}” isn’t in ${provider.company}’s model list; it stays in case it’s an alias.`, error: false };
      } else {
        status = { text: 'Key works.', error: false };
      }
      aiSettings.persist();
    } catch (error) {
      status = { text: (error as Error).message, error: true };
    } finally {
      checking = false;
    }
  }

  function changeProvider(id: ProviderId) {
    aiSettings.provider = id;
    status = null;
    aiSettings.persist();
  }
</script>

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
          onclick={() => changeProvider(p.id)}>{p.label} <small>({p.company})</small></button
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
      onchange={check}
    />
  </label>
  <p class="ai-hint">
    <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer">Get a key from {provider.company}</a>. Usage is billed to your {provider.company}
    account.
  </p>

  <label class="ai-field">
    <span class="ai-label">Model</span>
    <input
      list="ai-models-{aiSettings.provider}"
      autocomplete="off"
      spellcheck="false"
      placeholder={aiSettings.provider === 'openai' ? 'Check your key to list models' : provider.defaultModel}
      bind:value={aiSettings.models[aiSettings.provider]}
      onchange={() => aiSettings.persist()}
    />
    <datalist id="ai-models-{aiSettings.provider}">
      {#each models[aiSettings.provider] as id (id)}
        <option value={id}></option>
      {/each}
    </datalist>
  </label>

  <div class="ai-row">
    <button type="button" class="btn" disabled={!aiSettings.key || checking} onclick={check}>
      {checking ? 'Checking…' : 'Check key & list models'}
    </button>
    {#if status}
      <span class="ai-status" class:error={status.error} role="status">{status.text}</span>
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
