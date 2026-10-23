import { PROVIDERS, type ProviderId } from './providers';

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

  get key(): string {
    return this.keys[this.provider].trim();
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
