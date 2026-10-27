import type { Device, WorkerRequest, WorkerResponse } from './worker';
// Vite builds the worker as its own file next to the app and gives its address
import workerHref from './worker?worker&url';

/**
 * The embedding worker as promises: one request at a time, in order. Created only when
 * "Find by meaning" is first used, so the model code never loads otherwise.
 */

export interface Probe {
  webgpu: boolean;
  fp16: boolean;
}

export interface LoadOptions {
  model: string;
  device: Device;
  dtype: 'fp16' | 'q8';
  pooling: 'cls' | 'mean';
}

/** Download progress: bytes so far and in total, over every file of the model */
export type DownloadProgress = (loaded: number, total: number) => void;

export class Engine {
  #worker: Worker;
  #queue: Promise<unknown> = Promise.resolve();
  #dead: Error | null = null;

  constructor() {
    this.#worker = new Worker(new URL(workerHref, document.baseURI), { type: 'module' });
  }

  /** Whether WebGPU (and half-precision on it) is available to the worker */
  probe(): Promise<Probe> {
    return this.#call({ type: 'probe' }, 'probed').then((r) => ({ webgpu: r.webgpu, fp16: r.fp16 }));
  }

  load(options: LoadOptions, onprogress?: DownloadProgress): Promise<void> {
    const ortBase = new URL('ort/', document.baseURI).href;
    const files = new Map<string, { loaded: number; total: number }>();
    return this.#call({ type: 'load', ...options, ortBase }, 'loaded', (p) => {
      if (p.status !== 'progress' || !p.file || !p.total) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      onprogress?.(loaded, total);
    }).then(() => undefined);
  }

  /** One vector per text, all in one array (`dims` numbers each) */
  embed(texts: string[]): Promise<{ vectors: Float32Array; dims: number }> {
    return this.#call({ type: 'embed', texts }, 'embedded').then((r) => ({ vectors: r.vectors, dims: r.dims }));
  }

  terminate(): void {
    this.#dead = new Error('The model was stopped');
    this.#worker.terminate();
  }

  #call<T extends WorkerResponse['type']>(
    request: WorkerRequest,
    done: T,
    onprogress?: (p: Extract<WorkerResponse, { type: 'progress' }>) => void,
  ): Promise<Extract<WorkerResponse, { type: T }>> {
    const run = () =>
      new Promise<Extract<WorkerResponse, { type: T }>>((resolve, reject) => {
        if (this.#dead) return reject(this.#dead);
        const finish = (fn: () => void) => {
          this.#worker.onmessage = null;
          this.#worker.onerror = null;
          fn();
        };
        this.#worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const response = event.data;
          if (response.type === 'progress') onprogress?.(response);
          else if (response.type === 'error') finish(() => reject(new Error(response.message)));
          else if (response.type === done) finish(() => resolve(response as Extract<WorkerResponse, { type: T }>));
        };
        this.#worker.onerror = (event: Event) =>
          finish(() => reject(new Error(event instanceof ErrorEvent && event.message ? event.message : 'The model could not be started')));
        this.#worker.postMessage(request);
      });
    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => undefined);
    return next;
  }
}
