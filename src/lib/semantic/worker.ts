/// <reference lib="webworker" />
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

/**
 * Embeds texts with a sentence-embedding model, off the main thread so the app stays responsive.
 * The model is downloaded from Hugging Face on first use and cached by the browser; the ONNX
 * runtime (the code that runs the model) is served from our own origin, next to the app
 * (see vite.config.ts). Nothing about the texts leaves the browser.
 */

export type Device = 'webgpu' | 'wasm';

export type WorkerRequest =
  | { type: 'probe' }
  | { type: 'load'; model: string; device: Device; dtype: 'fp16' | 'q8'; pooling: 'cls' | 'mean'; ortBase: string }
  | { type: 'embed'; texts: string[] };

export type WorkerResponse =
  | { type: 'probed'; webgpu: boolean; fp16: boolean }
  | { type: 'progress'; status: string; file?: string; loaded?: number; total?: number }
  | { type: 'loaded' }
  | { type: 'embedded'; dims: number; vectors: Float32Array }
  | { type: 'error'; message: string };

/** The texts are embedded this many at a time (bigger batches gain little and need more memory) */
const BATCH = 16;

interface Gpu {
  requestAdapter(): Promise<{ features: Set<string> } | null>;
}

let extractor: FeatureExtractionPipeline | null = null;
let pooling: 'cls' | 'mean' = 'cls';

const post = (response: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(response, transfer);

async function probe(): Promise<void> {
  let webgpu = false;
  let fp16 = false;
  try {
    const adapter = await (navigator as unknown as { gpu?: Gpu }).gpu?.requestAdapter();
    webgpu = !!adapter;
    fp16 = !!adapter?.features.has('shader-f16');
  } catch {
    // No WebGPU: WebAssembly it is
  }
  post({ type: 'probed', webgpu, fp16 });
}

async function load(message: Extract<WorkerRequest, { type: 'load' }>): Promise<void> {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.backends.onnx.wasm!.wasmPaths = message.ortBase;
  pooling = message.pooling;
  extractor = await pipeline('feature-extraction', message.model, {
    device: message.device,
    dtype: message.dtype,
    progress_callback: (p: Record<string, unknown>) => {
      const { status, file, loaded, total } = p as { status: string; file?: string; loaded?: number; total?: number };
      post({ type: 'progress', status, file, loaded, total });
    },
  });
  post({ type: 'loaded' });
}

async function embed(texts: string[]): Promise<void> {
  if (!extractor) throw new Error('The model is not loaded');
  let vectors: Float32Array | null = null;
  let dims = 0;
  for (let i = 0; i < texts.length; i += BATCH) {
    const result = await extractor(texts.slice(i, i + BATCH), { pooling, normalize: true });
    dims = result.dims[1];
    if (!vectors) vectors = new Float32Array(texts.length * dims);
    vectors.set(result.data as Float32Array, i * dims);
    result.dispose();
  }
  vectors ??= new Float32Array(0);
  post({ type: 'embedded', dims, vectors }, [vectors.buffer]);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === 'probe') await probe();
    else if (message.type === 'load') await load(message);
    else await embed(message.texts);
  } catch (error) {
    post({ type: 'error', message: String((error as Error)?.message ?? error) });
  }
};
