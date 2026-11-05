import { describe, expect, it } from 'vitest';
import { PROVIDERS } from '../src/lib/ai/providers';
import { aiSettings } from '../src/lib/ai/settings.svelte';

describe('AI connection check', () => {
  it('validates a key by listing models, and fills in a model', async () => {
    const original = PROVIDERS.anthropic.listModels;
    PROVIDERS.anthropic.listModels = async () => ['claude-opus-5-5', 'claude-sonnet-5-5'];
    try {
      aiSettings.provider = 'anthropic';
      aiSettings.keys.anthropic = 'test-key';
      aiSettings.models.anthropic = '';
      await aiSettings.check();
      expect(aiSettings.status).toEqual({ text: 'Key works.', error: false });
      expect(aiSettings.models.anthropic).toBe(PROVIDERS.anthropic.defaultModel);
      expect(aiSettings.modelLists.anthropic).toHaveLength(2);
      expect(aiSettings.ready).toBe(true);
    } finally {
      PROVIDERS.anthropic.listModels = original;
      aiSettings.forget();
    }
  });

  it('reports a rejected key', async () => {
    const original = PROVIDERS.anthropic.listModels;
    PROVIDERS.anthropic.listModels = async () => {
      throw new Error('Invalid API key');
    };
    try {
      aiSettings.keys.anthropic = 'bad';
      await aiSettings.check();
      expect(aiSettings.status).toEqual({ text: 'Invalid API key', error: true });
      expect(aiSettings.checking).toBe(false);
    } finally {
      PROVIDERS.anthropic.listModels = original;
      aiSettings.forget();
    }
  });

  it('does nothing without a key', async () => {
    aiSettings.keys.anthropic = '';
    aiSettings.status = { text: 'stale', error: false };
    await aiSettings.check();
    expect(aiSettings.status).toBeNull();
  });
});
