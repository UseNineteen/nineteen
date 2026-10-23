import Anthropic from '@anthropic-ai/sdk';

/**
 * Bring-your-own-key AI providers. Requests go straight from the browser to
 * the provider with the user's own key; Nineteen has no server in between.
 */

export type ProviderId = 'anthropic' | 'openai';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskRequest {
  model: string;
  /** Instructions (stable across the conversation) */
  system: string;
  /** The shared data (stable across the conversation, so it can be cached) */
  data: string;
  messages: ChatMessage[];
  signal: AbortSignal;
  onText: (delta: string) => void;
}

export interface JsonRequest {
  model: string;
  system: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  signal: AbortSignal;
}

export interface Provider {
  id: ProviderId;
  label: string;
  company: string;
  keyUrl: string;
  keyPrefix: string;
  defaultModel: string;
  privacyUrl: string;
  listModels(key: string): Promise<string[]>;
  ask(key: string, request: AskRequest): Promise<string>;
  json<T>(key: string, request: JsonRequest): Promise<T>;
}

export class AIError extends Error {
  constructor(
    message: string,
    readonly aborted = false,
  ) {
    super(message);
  }
}

const STOPPED = 'Stopped.';

// ---------------------------------------------------------------------------
// Anthropic (Claude), via the official SDK
// ---------------------------------------------------------------------------

/** Current models that accept `effort` and server-side refusal fallbacks. */
const EFFORT_MODELS = /^claude-(opus-(4-[5-9]|5)|sonnet-(4-6|5)|haiku-5|fable-5)/;
const FALLBACK_MODELS = /^claude-(fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/;

function anthropicClient(key: string): Anthropic {
  // The key belongs to the person using this page and is sent only to Anthropic.
  return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

function anthropicOptions(model: string, effort: 'low' | 'medium' | 'high') {
  return {
    ...(EFFORT_MODELS.test(model) ? { output_config: { effort } } : {}),
    ...(FALLBACK_MODELS.test(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  };
}

function anthropicError(error: unknown): AIError {
  if (error instanceof Anthropic.APIUserAbortError) return new AIError(STOPPED, true);
  if (error instanceof Anthropic.AuthenticationError) return new AIError('Anthropic rejected the API key. Check that it is correct and active.');
  if (error instanceof Anthropic.PermissionDeniedError) return new AIError('This API key isn’t allowed to use that model.');
  if (error instanceof Anthropic.NotFoundError) return new AIError('Anthropic doesn’t recognize that model name.');
  if (error instanceof Anthropic.RateLimitError) return new AIError('Anthropic rate limit reached. Wait a moment and try again.');
  if (error instanceof Anthropic.BadRequestError) return new AIError(`Anthropic couldn’t process the request: ${error.message}`);
  if (error instanceof Anthropic.APIConnectionError) return new AIError('Couldn’t reach Anthropic. Check your internet connection.');
  if (error instanceof Anthropic.APIError) return new AIError(`Anthropic error ${error.status ?? ''}: ${error.message}`);
  return error instanceof AIError ? error : new AIError(String((error as Error)?.message ?? error));
}

function checkStop(stop: string | null | undefined): void {
  if (stop === 'refusal') throw new AIError('The model declined this request.');
  if (stop === 'max_tokens') throw new AIError('The response was too long and got cut off. Try sharing fewer rows or columns.');
}

export const anthropic: Provider = {
  id: 'anthropic',
  label: 'Claude',
  company: 'Anthropic',
  keyUrl: 'https://platform.claude.com/settings/keys',
  keyPrefix: 'sk-ant-',
  defaultModel: 'claude-opus-5-5',
  privacyUrl: 'https://www.anthropic.com/legal/privacy',

  async listModels(key) {
    try {
      const ids: string[] = [];
      for await (const model of anthropicClient(key).models.list()) ids.push(model.id);
      return ids;
    } catch (error) {
      throw anthropicError(error);
    }
  },

  async ask(key, { model, system, data, messages, signal, onText }) {
    try {
      const stream = anthropicClient(key).beta.messages.stream(
        {
          model,
          max_tokens: 16000,
          system: [
            { type: 'text', text: system },
            // The data is resent with every question; caching it makes follow-ups faster and cheaper
            { type: 'text', text: data, cache_control: { type: 'ephemeral' } },
          ],
          messages,
          ...anthropicOptions(model, 'medium'),
        },
        { signal },
      );
      stream.on('text', onText);
      const message = await stream.finalMessage();
      checkStop(message.stop_reason);
      return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    } catch (error) {
      throw anthropicError(error);
    }
  },

  async json<T>(key: string, { model, system, prompt, schema, signal }: JsonRequest) {
    try {
      const options = anthropicOptions(model, 'medium');
      const message = await anthropicClient(key).beta.messages.create(
        {
          model,
          max_tokens: 16000,
          system,
          messages: [{ role: 'user', content: prompt }],
          ...options,
          output_config: { ...('output_config' in options ? options.output_config : {}), format: { type: 'json_schema', schema } },
        },
        { signal },
      );
      checkStop(message.stop_reason);
      const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof SyntaxError) throw new AIError('The model returned an unexpected response. Try again.');
      throw anthropicError(error);
    }
  },
};

// ---------------------------------------------------------------------------
// OpenAI (ChatGPT models), via the Chat Completions REST API
// ---------------------------------------------------------------------------

const OPENAI = 'https://api.openai.com/v1';
const OPENAI_EXCLUDE = /(audio|realtime|tts|transcribe|image|search|embedding|moderation|instruct|codex|computer)/;

async function openaiFetch(key: string, path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${OPENAI}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw new AIError(STOPPED, true);
    throw new AIError('Couldn’t reach OpenAI. Check your internet connection.');
  }
  if (response.ok) return response;
  let detail = '';
  try {
    detail = (await response.json())?.error?.message ?? '';
  } catch {
    // ignore
  }
  if (response.status === 401) throw new AIError('OpenAI rejected the API key. Check that it is correct and active.');
  if (response.status === 404) throw new AIError('OpenAI doesn’t recognize that model name, or the key can’t use it.');
  if (response.status === 429) throw new AIError(`OpenAI rate limit or quota reached. ${detail}`.trim());
  throw new AIError(`OpenAI error ${response.status}${detail ? `: ${detail}` : ''}`);
}

/** Prefers the newest general-purpose GPT model. */
export function preferredOpenAIModel(ids: string[]): string {
  const version = (id: string) => parseFloat(/^gpt-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? '0');
  const general = ids.filter((id) => /^gpt-\d+(\.\d+)?$/.test(id) || /^gpt-4o$/.test(id));
  general.sort((a, b) => version(b) - version(a));
  return general[0] ?? ids[0] ?? '';
}

export const openai: Provider = {
  id: 'openai',
  label: 'ChatGPT',
  company: 'OpenAI',
  keyUrl: 'https://platform.openai.com/api-keys',
  keyPrefix: 'sk-',
  defaultModel: '',
  privacyUrl: 'https://openai.com/policies/privacy-policy/',

  async listModels(key) {
    const response = await openaiFetch(key, '/models');
    const body = (await response.json()) as { data?: { id: string }[] };
    return (body.data ?? [])
      .map((m) => m.id)
      .filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !OPENAI_EXCLUDE.test(id))
      .sort();
  },

  async ask(key, { model, system, data, messages, signal, onText }) {
    const response = await openaiFetch(key, '/chat/completions', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        model,
        stream: true,
        messages: [{ role: 'system', content: `${system}\n\n${data}` }, ...messages],
      }),
    });
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    let text = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          const choice = JSON.parse(payload)?.choices?.[0];
          const delta: string = choice?.delta?.content ?? '';
          if (choice?.delta?.refusal) throw new AIError('The model declined this request.');
          if (delta) {
            text += delta;
            onText(delta);
          }
          if (choice?.finish_reason === 'length') throw new AIError('The response was too long and got cut off. Try sharing fewer rows or columns.');
        }
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw new AIError(STOPPED, true);
      throw error instanceof AIError ? error : new AIError('The response from OpenAI was interrupted.');
    }
    return text;
  },

  async json<T>(key: string, { model, system, prompt, schemaName, schema, signal }: JsonRequest) {
    const response = await openaiFetch(key, '/chat/completions', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
      }),
    });
    const body = await response.json();
    const message = body?.choices?.[0]?.message;
    if (message?.refusal) throw new AIError('The model declined this request.');
    if (body?.choices?.[0]?.finish_reason === 'length') throw new AIError('The response was too long and got cut off.');
    try {
      return JSON.parse(message?.content ?? '') as T;
    } catch {
      throw new AIError('The model returned an unexpected response. Try again.');
    }
  },
};

export const PROVIDERS: Record<ProviderId, Provider> = { anthropic, openai };
