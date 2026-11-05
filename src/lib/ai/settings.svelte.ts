import { PROVIDERS, preferredOpenAIModel, type ProviderId } from './providers';

/**
 * AI provider settings. API keys are kept in memory only, unless the user
 * ticks "Remember on this device", which stores them in this browser's
 * localStorage (never in a cookie, never sent anywhere but the provider).
 */

const STORAGE_KEY = 'nineteen:ai';

interface Stored {
  provider: ProviderId;
  keys: Record<ProviderId, string>;
  models: Record<ProviderId, string>;
}

class AISettings {
  provider = $state<ProviderId>('anthropic');
  keys = $state<Record<ProviderId, string>>({ anthropic: '', openai: '' });
  models = $state<Record<ProviderId, string>>({ anthropic: PROVIDERS.anthropic.defaultModel, openai: '' });
  remember = $state(false);
  /** The user has agreed (this page session) that data will be sent to the provider */
  consented = $state<Record<ProviderId, boolean>>({ anthropic: false, openai: false });

  constructor() {
    try {
      const text = localStorage.getItem(STORAGE_KEY);
      if (!text) return;
      const stored = JSON.parse(text) as Stored;
      this.provider = stored.provider === 'openai' ? 'openai' : 'anthropic';
      this.keys = { anthropic: String(stored.keys?.anthropic ?? ''), openai: String(stored.keys?.openai ?? '') };
      this.models = {
        anthropic: String(stored.models?.anthropic || PROVIDERS.anthropic.defaultModel),
        openai: String(stored.models?.openai ?? ''),
      };
      this.remember = true;
    } catch {
      // Storage unavailable: settings live in memory only
    }
  }

  /** Models the provider listed for the key (filled by a check) */
  modelLists = $state<Record<ProviderId, string[]>>({ anthropic: [], openai: [] });
  /** The last check's outcome for the current provider */
  status = $state<{ text: string; error: boolean } | null>(null);
  checking = $state(false);
  #checkTimer: ReturnType<typeof setTimeout> | null = null;
  #checkRun = 0;

  get key(): string {
    return this.keys[this.provider].trim();
  }

  setProvider(id: ProviderId): void {
    this.provider = id;
    this.status = null;
    this.persist();
    if (this.key) this.check();
  }

  /** A check a moment after the key was typed or pasted, so it is validated as soon as it is entered */
  scheduleCheck(): void {
    if (this.#checkTimer) clearTimeout(this.#checkTimer);
    this.status = null;
    this.#checkTimer = setTimeout(() => this.check(), 700);
  }

  /** Asks the provider for its model list with the key: a connection test that sends no data */
  async check(): Promise<void> {
    if (this.#checkTimer) clearTimeout(this.#checkTimer);
    this.#checkTimer = null;
    if (!this.key) {
      this.status = null;
      return;
    }
    const run = ++this.#checkRun;
    const id = this.provider;
    const provider = PROVIDERS[id];
    this.checking = true;
    this.status = null;
    try {
      const list = await provider.listModels(this.key);
      if (run !== this.#checkRun) return;
      this.modelLists[id] = list;
      const model = this.models[id].trim();
      if (!model) {
        this.models[id] =
          id === 'openai' ? preferredOpenAIModel(list) : list.includes(provider.defaultModel) ? provider.defaultModel : (list[0] ?? '');
        this.status = { text: 'Key works.', error: false };
      } else if (!list.includes(model)) {
        // A typed model is kept: aliases such as "claude-opus-5-5" work for requests without appearing in the list
        this.status = {
          text: `Key works. “${model}” isn’t in ${provider.company}’s model list; it stays in case it’s an alias.`,
          error: false,
        };
      } else {
        this.status = { text: 'Key works.', error: false };
      }
      this.persist();
    } catch (error) {
      if (run !== this.#checkRun) return;
      this.status = { text: (error as Error).message, error: true };
    } finally {
      if (run === this.#checkRun) this.checking = false;
    }
  }

  get model(): string {
    return this.models[this.provider].trim();
  }

  get ready(): boolean {
    return this.key.length > 0 && this.model.length > 0;
  }

  /** Call after any change; writes to localStorage only when "remember" is on. */
  persist(): void {
    try {
      if (this.remember) {
        const stored: Stored = { provider: this.provider, keys: this.keys, models: this.models };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }

  forget(): void {
    this.keys = { anthropic: '', openai: '' };
    this.remember = false;
    this.persist();
  }
}

export const aiSettings = new AISettings();
