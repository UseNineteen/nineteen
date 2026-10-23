<script lang="ts">
  import { tick, untrack } from 'svelte';
  import Answer from './Answer.svelte';
  import ProviderSettings from './ProviderSettings.svelte';
  import {
    acceptCodings,
    batches,
    categoriesSchema,
    codingPrompt,
    codingSchema,
    CODING_SYSTEM,
    formatCategories,
    parseCategories,
    suggestPrompt,
    UNCODED,
    type Category,
    type Coding,
  } from '../../lib/ai/autocode';
  import { citedRows } from '../../lib/ai/answer';
  import {
    estimateTokens,
    formatTokens,
    renderData,
    renderRows,
    selectItems,
    withColumns,
    type RowScope,
  } from '../../lib/ai/context';
  import { clipboardPrompt, SYSTEM_PROMPT, TEMPLATES } from '../../lib/ai/prompts';
  import { AIError, PROVIDERS, type ChatMessage } from '../../lib/ai/providers';
  import { aiSettings } from '../../lib/ai/settings.svelte';
  import { saveSession } from '../../lib/persist';
  import type { Popups } from '../../lib/popups.svelte';
  import type { Viz } from '../../lib/viz.svelte';

  interface Props {
    viz: Viz;
    popups: Popups;
    onclose: () => void;
  }

  let { viz, popups, onclose }: Props = $props();

  type Tab = 'copy' | 'ask' | 'code';
  let tab = $state<Tab>('copy');

  // ---------- Data to share ----------

  let rowScope = $state<RowScope>('all');
  // Start by sharing every column; the snapshot is taken once, then kept in sync below
  let columns = $state<string[]>(untrack(() => [...viz.dataset.columns]));
  let knownColumns = untrack(() => [...viz.dataset.columns]);

  // Include columns added later (e.g. by auto-coding)
  $effect(() => {
    const added = viz.dataset.columns.filter((c) => !knownColumns.includes(c));
    if (added.length) {
      knownColumns = [...viz.dataset.columns];
      columns = viz.dataset.columns.filter((c) => columns.includes(c) || added.includes(c));
    }
  });

  const hasSearch = $derived(viz.matches !== null);
  const scope = $derived<RowScope>(rowScope === 'matches' && hasSearch ? 'matches' : 'all');
  const items = $derived(selectItems(viz.dataset, scope, viz.matches));
  const view = $derived({
    fileName: viz.dataset.name,
    groupKey: viz.groupKey,
    colorKey: viz.colorKey,
    searchTerm: viz.searchTerm,
  });
  const data = $derived(renderData(items, columns, view, scope));
  const tokens = $derived(estimateTokens(data));
  const provider = $derived(PROVIDERS[aiSettings.provider]);

  function toggleColumn(column: string, on: boolean) {
    const set = new Set(columns);
    if (on) set.add(column);
    else set.delete(column);
    columns = viz.dataset.columns.filter((c) => set.has(c));
  }

  // ---------- Consent (once per provider per page session) ----------

  let pending = $state<(() => void) | null>(null);

  function withConsent(action: () => void) {
    if (aiSettings.consented[aiSettings.provider]) action();
    else pending = action;
  }

  function accept() {
    aiSettings.consented[aiSettings.provider] = true;
    const action = pending;
    pending = null;
    action?.();
  }

  // ---------- Copy prompt (nothing leaves the browser) ----------

  let templateId = $state('themes');
  let extra = $state('');
  let copied = $state(false);

  const template = $derived(TEMPLATES.find((t) => t.id === templateId)!);
  const instructions = $derived([template.build(view), extra.trim()].filter(Boolean).join('\n\n'));
  const fullPrompt = $derived(clipboardPrompt(instructions || 'Answer my questions about this data.', data));
  const preview = $derived(fullPrompt.length > 6000 ? `${fullPrompt.slice(0, 6000)}\n\n… (${fullPrompt.length - 6000} more characters)` : fullPrompt);

  let downloadUrl = $state<string | null>(null);
  $effect(() => {
    const url = URL.createObjectURL(new Blob([fullPrompt], { type: 'text/markdown' }));
    downloadUrl = url;
    return () => URL.revokeObjectURL(url);
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullPrompt);
      copied = true;
      setTimeout(() => (copied = false), 2500);
    } catch {
      copied = false;
      alert('Your browser blocked clipboard access. Use “Download as file” instead.');
    }
  }

  // ---------- Ask ----------

  interface Turn extends ChatMessage {
    error?: boolean;
  }

  let turns = $state<Turn[]>([]);
  let question = $state('');
  let streaming = $state('');
  let asking = $state(false);
  let controller: AbortController | null = null;
  let conversationEl = $state<HTMLElement>();

  async function scrollDown() {
    await tick();
    conversationEl?.scrollTo({ top: conversationEl.scrollHeight });
  }

  function ask(text: string) {
    const content = text.trim();
    if (!content || asking || !aiSettings.ready) return;
    withConsent(() => runAsk(content));
  }

  async function runAsk(content: string) {
    turns.push({ role: 'user', content });
    question = '';
    asking = true;
    streaming = '';
    controller = new AbortController();
    const history: ChatMessage[] = turns.filter((t) => !t.error).map(({ role, content }) => ({ role, content }));
    scrollDown();
    try {
      const answer = await provider.ask(aiSettings.key, {
        model: aiSettings.model,
        system: SYSTEM_PROMPT,
        data,
        messages: history,
        signal: controller.signal,
        onText: (delta) => {
          streaming += delta;
          scrollDown();
        },
      });
      turns.push({ role: 'assistant', content: answer });
    } catch (error) {
      const message = error instanceof AIError ? error.message : String(error);
      // Drop the unanswered question from the history so the conversation stays valid
      const last = turns.pop();
      turns.push({ role: 'assistant', content: message, error: true });
      if (last && (error as AIError).aborted) question = last.content;
    } finally {
      asking = false;
      streaming = '';
      controller = null;
      scrollDown();
    }
  }

  function clearConversation() {
    controller?.abort();
    turns = [];
    viz.aiHighlight = null;
  }

  async function cite(rows: number[]) {
    const valid = rows.filter((id) => viz.dataset.items.some((item) => item.id === id));
    if (!valid.length) return;
    viz.aiHighlight = new Set(valid);
    if (valid.length !== 1) return;
    // Open (and pin) the viewer for a single cited row
    const el = document.querySelector<HTMLElement>(`[data-item-id="${valid[0]}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (!popups.find(valid[0])) popups.show(valid[0], el.getBoundingClientRect());
    if (!popups.isFloating(valid[0])) popups.toggleFloating(valid[0]);
  }

  // ---------- Auto-code ----------

  let goal = $state('');
  let categoryText = $state('');
  let columnName = $state('AI theme');
  let includeReasons = $state(true);
  let coding = $state<{ done: number; total: number; label: string } | null>(null);
  let codeError = $state('');
  let codeResult = $state<{ column: string; counts: [string, number][]; coded: number; total: number; partial: boolean } | null>(null);

  const categories = $derived(parseCategories(categoryText));
  const codeColumns = $derived(columns.filter((c) => c !== columnName.trim() && c !== `${columnName.trim()} (reason)`));

  function suggest() {
    if (!aiSettings.ready || coding) return;
    withConsent(runSuggest);
  }

  async function runSuggest() {
    codeError = '';
    coding = { done: 0, total: 1, label: 'Reading the data…' };
    controller = new AbortController();
    try {
      // Very large files: suggest from an even sample of rows
      const maxChars = 600_000;
      let sample = items;
      const full = renderRows(items, codeColumns);
      if (full.length > maxChars) {
        const step = Math.ceil(full.length / maxChars);
        sample = items.filter((_, i) => i % step === 0);
      }
      const result = await provider.json<{ categories: Category[] }>(aiSettings.key, {
        model: aiSettings.model,
        system: SYSTEM_PROMPT,
        prompt: `${suggestPrompt(goal)}\n\n${renderData(sample, codeColumns, view, scope)}`,
        schemaName: 'coding_scheme',
        schema: categoriesSchema as unknown as Record<string, unknown>,
        signal: controller.signal,
      });
      categoryText = formatCategories(result.categories ?? []);
    } catch (error) {
      if (!(error as AIError).aborted) codeError = (error as Error).message;
    } finally {
      coding = null;
      controller = null;
    }
  }

  function runCoding() {
    if (!aiSettings.ready || coding || !categories.length || !columnName.trim()) return;
    withConsent(code);
  }

  async function code() {
    const name = columnName.trim();
    const names = categories.map((c) => c.name);
    const groups = batches(items, codeColumns);
    const results = new Map<number, Coding>();
    codeError = '';
    codeResult = null;
    coding = { done: 0, total: groups.length, label: 'Coding rows…' };
    controller = new AbortController();
    let partial = false;

    const request = async (rows: string[]) => {
      const sent = new Set(rows.map((r) => Number(/^### Row (\d+)/.exec(r)?.[1])));
      const response = await provider.json<{ results: Coding[] }>(aiSettings.key, {
        model: aiSettings.model,
        system: CODING_SYSTEM,
        prompt: codingPrompt(categories, goal, rows.join('\n\n')),
        schemaName: 'coding_results',
        schema: codingSchema(names),
        signal: controller!.signal,
      });
      for (const r of acceptCodings(response.results ?? [], sent, names)) results.set(r.row, r);
      return [...sent].filter((id) => !results.has(id));
    };

    try {
      for (const [i, rows] of groups.entries()) {
        const missing = await request(rows);
        // One retry for any rows the model skipped
        if (missing.length) await request(rows.filter((r) => missing.includes(Number(/^### Row (\d+)/.exec(r)?.[1]))));
        coding = { done: i + 1, total: groups.length, label: 'Coding rows…' };
      }
    } catch (error) {
      partial = true;
      if (!(error as AIError).aborted) codeError = (error as Error).message;
    } finally {
      coding = null;
      controller = null;
    }

    if (results.size === 0) return;
    const values = new Map([...results].map(([row, r]) => [row, r.category]));
    const added: Record<string, Map<number, string>> = { [name]: values };
    if (includeReasons) added[`${name} (reason)`] = new Map([...results].map(([row, r]) => [row, r.reason]));
    viz.replaceDataset(withColumns(viz.dataset, added), name);
    saveSession(viz.dataset);

    const counts = new Map<string, number>();
    for (const value of values.values()) counts.set(value, (counts.get(value) ?? 0) + 1);
    codeResult = {
      column: name,
      counts: [...counts].sort((a, b) => b[1] - a[1]),
      coded: results.size,
      total: items.length,
      partial,
    };
  }

  function stop() {
    controller?.abort();
  }

  const busy = $derived(asking || coding !== null);
</script>

<aside id="ai-panel" aria-label="Analyze with AI">
  <header class="ai-header">
    <strong>Analyze with AI</strong>
    <button type="button" class="ai-close" aria-label="Close AI panel" onclick={onclose}>&times;</button>
  </header>

  <nav class="ai-tabs" aria-label="AI tools">
    <button type="button" class:active={tab === 'copy'} aria-pressed={tab === 'copy'} onclick={() => (tab = 'copy')}>Copy prompt</button>
    <button type="button" class:active={tab === 'ask'} aria-pressed={tab === 'ask'} onclick={() => (tab = 'ask')}>Ask</button>
    <button type="button" class:active={tab === 'code'} aria-pressed={tab === 'code'} onclick={() => (tab = 'code')}>Auto-code</button>
  </nav>

  <div class="ai-body">
    <section class="ai-section ai-share">
      <h3>Data to share</h3>
      <div class="ai-segmented" role="radiogroup" aria-label="Rows to share">
        <button type="button" role="radio" aria-checked={scope === 'all'} class:active={scope === 'all'} onclick={() => (rowScope = 'all')}
          >All rows ({viz.dataset.items.length})</button
        >
        <button
          type="button"
          role="radio"
          aria-checked={scope === 'matches'}
          class:active={scope === 'matches'}
          disabled={!hasSearch}
          title={hasSearch ? undefined : 'Search for something first'}
          onclick={() => (rowScope = 'matches')}>Search matches ({viz.matches?.size ?? 0})</button
        >
      </div>
      <details class="ai-columns">
        <summary>{columns.length} of {viz.dataset.columns.length} columns</summary>
        <p class="ai-hint">Untick columns you don’t want to share, such as names or other personal details.</p>
        {#each viz.dataset.columns as column (column)}
          <label class="ai-check">
            <input type="checkbox" checked={columns.includes(column)} onchange={(e) => toggleColumn(column, e.currentTarget.checked)} />
            <span>{column}</span>
          </label>
        {/each}
      </details>
      <p class="ai-hint">{items.length} rows × {columns.length} columns · {formatTokens(tokens)}</p>
    </section>

    {#if tab === 'copy'}
      <section class="ai-section">
        <p class="ai-lead">
          Build a prompt with your data and paste it into Claude, ChatGPT, or any AI assistant you already use.
          <strong>Nineteen doesn’t send anything.</strong>
        </p>
        <label class="ai-field">
          <span class="ai-label">What should the AI do?</span>
          <select bind:value={templateId}>
            {#each TEMPLATES as t (t.id)}
              <option value={t.id}>{t.label}</option>
            {/each}
          </select>
        </label>
        <p class="ai-hint">{template.hint}</p>
        <label class="ai-field">
          <span class="ai-label">{templateId === 'custom' ? 'Your question or instructions' : 'Anything to add? (optional)'}</span>
          <textarea rows="3" bind:value={extra} placeholder="e.g. Focus on reasons people didn’t buy"></textarea>
        </label>
        <div class="ai-row">
          <button type="button" class="btn btn-primary" onclick={copy}>{copied ? 'Copied!' : 'Copy to clipboard'}</button>
          <a class="btn" href={downloadUrl} download="{viz.dataset.name.replace(/\.[^.]+$/, '')}-ai-prompt.md">Download as file</a>
        </div>
        <p class="ai-hint">
          Then open
          <a href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">Claude</a> or
          <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPT</a> and paste it in. Check your
          organization’s rules before pasting confidential data into an AI service.
        </p>
        <details class="ai-preview">
          <summary>Preview prompt</summary>
          <pre>{preview}</pre>
        </details>
      </section>
    {:else}
      <section class="ai-section">
        <details class="ai-provider" open={!aiSettings.ready}>
          <summary>
            {#if aiSettings.ready}
              Using {provider.label} · <code>{aiSettings.model}</code>
            {:else}
              Connect your {provider.company} account
            {/if}
          </summary>
          <ProviderSettings />
        </details>
        {#if !aiSettings.ready}
          <p class="ai-hint">
            Use your own API key from Anthropic or OpenAI. Your browser sends requests straight to the provider. They
            never go through a Nineteen server.
          </p>
        {/if}
      </section>

      {#if tab === 'ask'}
        <section class="ai-section ai-ask">
          {#if turns.length === 0 && !asking}
            <p class="ai-hint">Ask a question about the shared data, or start with:</p>
            <div class="ai-chips">
              {#each TEMPLATES.filter((t) => t.id !== 'custom') as t (t.id)}
                <button type="button" class="ai-chip" disabled={!aiSettings.ready} onclick={() => ask(t.build(view))}>{t.label}</button>
              {/each}
            </div>
          {/if}

          <div class="ai-conversation" bind:this={conversationEl} aria-live="polite">
            {#each turns as turn, i (i)}
              {#if turn.role === 'user'}
                <div class="ai-question">{turn.content}</div>
              {:else if turn.error}
                <p class="ai-error" role="alert">{turn.content}</p>
              {:else}
                {@const rows = citedRows(turn.content)}
                <Answer text={turn.content} oncite={cite} />
                <div class="ai-answer-tools">
                  {#if rows.length > 1}
                    <button type="button" class="ai-link" onclick={() => cite(rows)}>Highlight all {rows.length} cited rows</button>
                  {/if}
                  <button type="button" class="ai-link" onclick={() => navigator.clipboard.writeText(turn.content)}>Copy answer</button>
                </div>
              {/if}
            {/each}
            {#if asking}
              {#if streaming}
                <Answer text={streaming} oncite={cite} />
              {:else}
                <p class="ai-hint ai-thinking">Thinking…</p>
              {/if}
            {/if}
          </div>

          <form
            class="ai-compose"
            onsubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <textarea
              rows="3"
              bind:value={question}
              placeholder={aiSettings.ready ? 'Ask about your data…' : 'Add an API key above to ask questions'}
              disabled={!aiSettings.ready}
              aria-label="Question"
              onkeydown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask(question);
                }
              }}
            ></textarea>
            <div class="ai-row">
              {#if asking}
                <button type="button" class="btn" onclick={stop}>Stop</button>
              {:else}
                <button type="submit" class="btn btn-primary" disabled={!aiSettings.ready || !question.trim()}>Send</button>
              {/if}
              {#if turns.length}
                <button type="button" class="ai-link" onclick={clearConversation}>New conversation</button>
              {/if}
            </div>
            <p class="ai-hint">
              Each question sends the shared data ({formatTokens(tokens)}) to {provider.company}. Answers can be wrong, so check
              them against the cited rows.
            </p>
          </form>
        </section>
      {:else}
        <section class="ai-section ai-code">
          <p class="ai-lead">
            Have the AI assign every row to a category. The result is added as a new column you can group or color by.
          </p>
          <label class="ai-field">
            <span class="ai-label">What are you coding for? (optional)</span>
            <input type="text" bind:value={goal} placeholder="e.g. Why people did or didn’t buy" />
          </label>
          <label class="ai-field">
            <span class="ai-label">Categories (one per line, optionally “Name: definition”)</span>
            <textarea rows="6" bind:value={categoryText} placeholder={'Price: cost was the deciding factor\nQuality\nConvenience'}></textarea>
          </label>
          <div class="ai-row">
            <button type="button" class="btn" disabled={!aiSettings.ready || busy} onclick={suggest}>Suggest categories</button>
            <span class="ai-hint">{categories.length} categories + “{UNCODED}”</span>
          </div>
          <label class="ai-field">
            <span class="ai-label">New column name</span>
            <input type="text" bind:value={columnName} />
          </label>
          <label class="ai-check">
            <input type="checkbox" bind:checked={includeReasons} />
            <span>Also add a column with the AI’s reason for each row</span>
          </label>
          <div class="ai-row">
            {#if coding}
              <button type="button" class="btn" onclick={stop}>Stop</button>
            {:else}
              <button
                type="button"
                class="btn btn-primary"
                disabled={!aiSettings.ready || !categories.length || !columnName.trim() || busy}
                onclick={runCoding}>Code {items.length} rows</button
              >
            {/if}
          </div>
          {#if coding}
            <div class="ai-progress" role="status">
              <span>{coding.label} {coding.total > 1 ? `${coding.done} of ${coding.total} batches` : ''}</span>
              <div class="progress-bar"><div class="progress-bar-fill" style:width="{(coding.done / coding.total) * 100}%"></div></div>
            </div>
          {/if}
          {#if codeError}
            <p class="ai-error" role="alert">{codeError}</p>
          {/if}
          {#if codeResult}
            <div class="ai-result" role="status">
              <p>
                <strong>Added “{codeResult.column}”</strong>: {codeResult.coded} of {codeResult.total} rows coded{codeResult.partial
                  ? ' (stopped early)'
                  : ''}. The view is now color-coded by it.
              </p>
              <ul>
                {#each codeResult.counts as [name, count] (name)}
                  <li><span>{name}</span> <span class="text-muted">{count}</span></li>
                {/each}
              </ul>
              <p class="ai-hint">AI coding can be wrong. Hover over items to check the reason given for each row.</p>
            </div>
          {/if}
          <p class="ai-hint">
            Sends the shared columns of every row ({formatTokens(tokens)} in total, split into batches) to {provider.company}.
          </p>
        </section>
      {/if}
    {/if}
  </div>

  {#if pending}
    <div class="ai-consent" role="alertdialog" aria-modal="true" aria-labelledby="ai-consent-title">
      <div class="ai-consent-box">
        <h3 id="ai-consent-title">Send your data to {provider.company}?</h3>
        <p>
          Until now, everything in Nineteen has stayed in your browser. This action sends the shared data
          (<strong>{items.length} rows × {columns.length} columns</strong>, {formatTokens(tokens)}) to {provider.company} using
          your API key, and {provider.company}’s
          <a href={provider.privacyUrl} target="_blank" rel="noopener noreferrer">terms and privacy policy</a> apply to it.
        </p>
        <p>Only continue if you’re allowed to share this data with {provider.company}. Untick sensitive columns first if needed.</p>
        <div class="ai-row">
          <button type="button" class="btn btn-primary" onclick={accept}>Send to {provider.company}</button>
          <button type="button" class="btn" onclick={() => (pending = null)}>Cancel</button>
        </div>
        <p class="ai-hint">You won’t be asked again for {provider.company} until you reload the page.</p>
      </div>
    </div>
  {/if}
</aside>
