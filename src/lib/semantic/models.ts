/**
 * The sentence-embedding models "Find by meaning" can use. Each is downloaded from Hugging Face
 * the first time it is used (never before the user agrees) and kept in the browser's cache
 * storage. Nothing about the user's data goes anywhere: the model runs in the browser.
 */

export type ModelId = 'bge-small' | 'e5-multilingual';

/** How the model runs: on the graphics card (fast, larger file) or in WebAssembly (smaller file) */
export type Variant = 'fp16' | 'q8';

export interface EmbeddingModel {
  id: ModelId;
  /** The Hugging Face repository holding the ONNX files */
  repo: string;
  label: string;
  languages: string;
  /** How the token vectors become one vector per text */
  pooling: 'cls' | 'mean';
  /** Put in front of a search; the models were trained with these */
  queryPrefix: string;
  /** Put in front of each piece of the data */
  passagePrefix: string;
  /** Download sizes in MB: the model file for each variant, plus the tokenizer and configuration */
  size: Record<Variant, number> & { extra: number };
  /** A sensible "at least this similar" cut-off: each model's scores sit in their own range */
  minScore: number;
}

export const MODELS: Record<ModelId, EmbeddingModel> = {
  'bge-small': {
    id: 'bge-small',
    repo: 'Xenova/bge-small-en-v1.5',
    label: 'bge-small',
    languages: 'English',
    pooling: 'cls',
    queryPrefix: 'Represent this sentence for searching relevant passages: ',
    passagePrefix: '',
    size: { fp16: 67, q8: 34, extra: 1 },
    minScore: 0.65,
  },
  'e5-multilingual': {
    id: 'e5-multilingual',
    repo: 'Xenova/multilingual-e5-small',
    label: 'multilingual-e5-small',
    languages: 'about 100 languages',
    pooling: 'mean',
    queryPrefix: 'query: ',
    passagePrefix: 'passage: ',
    size: { fp16: 235, q8: 118, extra: 23 },
    minScore: 0.83,
  },
};

export const DEFAULT_MODEL: ModelId = 'bge-small';

export function isModelId(value: unknown): value is ModelId {
  return typeof value === 'string' && value in MODELS;
}

/** Download size in MB for a model as it would run here */
export function downloadSize(model: EmbeddingModel, variant: Variant): number {
  return model.size[variant] + model.size.extra;
}

/** The address the library downloads (and caches) the model file from */
export function modelFileUrl(model: EmbeddingModel, variant: Variant): string {
  return `https://huggingface.co/${model.repo}/resolve/main/onnx/model${variant === 'fp16' ? '_fp16' : '_quantized'}.onnx`;
}

/** The library's cache (Cache storage) where downloaded model files are kept */
export const CACHE_NAME = 'transformers-cache';

export interface Download {
  model: EmbeddingModel;
  variant: Variant;
}

/** Which model files this browser has already downloaded */
export async function cachedDownloads(): Promise<Download[]> {
  const found: Download[] = [];
  try {
    if (!(await caches.has(CACHE_NAME))) return found;
    const cache = await caches.open(CACHE_NAME);
    for (const model of Object.values(MODELS))
      for (const variant of ['fp16', 'q8'] as const) if (await cache.match(modelFileUrl(model, variant))) found.push({ model, variant });
  } catch {
    // Cache storage unavailable (some private windows): nothing is kept, so nothing is listed
  }
  return found;
}

export async function isCached(model: EmbeddingModel, variant: Variant): Promise<boolean> {
  try {
    if (!(await caches.has(CACHE_NAME))) return false;
    return (await (await caches.open(CACHE_NAME)).match(modelFileUrl(model, variant))) !== undefined;
  } catch {
    return false;
  }
}

/** Removes every downloaded model file from this browser. */
export async function removeDownloads(): Promise<void> {
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    // ignore
  }
}
