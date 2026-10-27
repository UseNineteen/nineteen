import { Engine, type Probe } from './engine';
import { downloadSize, isCached, MODELS, type EmbeddingModel, type ModelId, type Variant } from './models';
import { closestByPassage, distinctTexts, dot, meanVector, topScores, type Passage, type Scored } from './passages';
import { EMBED_ID } from '../persist';

/**
 * "Find by meaning": the state behind the search box's meaning mode and "Find similar".
 * The model runs in a worker (see engine.ts); this class keeps the vectors of every passage
 * embedded so far, scores a search against them, and reports what it is doing for the toolbar.
 * It has no effects of its own: MeaningBar.svelte drives it from the view's state, so it can
 * also be constructed where there is no component (tests).
 */

export type Status = 'off' | 'asking' | 'loading' | 'indexing' | 'ready' | 'error';

export interface MeaningMatch {
  /** 1 is the closest; 0 is the data item "Find similar" started from */
  rank: number;
  score: number;
  /** The passage that made the match, and the field it is in */
  passage: string;
  column: string;
}

export interface MeaningResults {
  /** Identifies the search these results answer (see Viz.meaningKey) */
  key: string;
  /** Closest first */
  matches: Map<number, MeaningMatch>;
}

/** Passages are embedded this many at a time, so progress shows and a change can interrupt */
const CHUNK = 64;

/**
 * Whether this page can find by meaning: it needs the worker file served next to the app. A
 * saved HTML file sits on its own (and is usually opened from disk), so it has the text search only.
 */
export function canFindByMeaning(): boolean {
  if (typeof document === 'undefined' || typeof Worker === 'undefined') return false;
  return location.protocol !== 'file:' && !document.getElementById(EMBED_ID);
}

export class SemanticSearch {
  status = $state<Status>('off');
  /** How far the current stage (downloading or reading the data) has come, 0–1 */
  progress = $state<number | null>(null);
  error = $state<string | null>(null);
  /** A search is being embedded */
  finding = $state(false);
  /** The model has loaded and can embed */
  loaded = $state(false);
  /** The model in use, or being made ready, and how it runs here */
  model = $state.raw<EmbeddingModel | null>(null);
  variant = $state<Variant | null>(null);
  results = $state.raw<MeaningResults | null>(null);
  /** Counts up each time the data has been read, so results are tied to the data they came from */
  indexVersion = $state(0);

  /** The download the model needs here, in MB (0 while unknown) */
  downloadMB = $derived(this.model && this.variant ? downloadSize(this.model, this.variant) : 0);

  #engine: Engine | null = null;
  #probe: Probe | null = null;
  #starting: Promise<void> | null = null;
  /** Models the user agreed to download in this page session */
  #consented = new Set<ModelId>();
  /** Vector of every passage text embedded so far, for the loaded model */
  #vectors = new Map<string, Float32Array>();
  #dims = 0;
  #passages: Passage[] = [];
  #passagesByItem = new Map<number, Passage[]>();
  /** One vector per data item (the mean of its passages), for "Find similar" */
  #itemVectors = new Map<number, Float32Array>();
  #indexJob = 0;
  #indexing: Promise<void> = Promise.resolve();
  #findJob = 0;

  // ---------- The model ----------

  /** Meaning mode turned on, or another model chosen: gets the model ready, asking first when it must be downloaded. */
  async activate(modelId: ModelId): Promise<void> {
    if (this.#starting) await this.#starting;
    if (this.#engine && this.model?.id === modelId) {
      if (this.status === 'off') this.status = this.loaded ? 'ready' : 'asking';
      return;
    }
    this.#starting = this.#start(modelId).finally(() => (this.#starting = null));
    return this.#starting;
  }

  /** Meaning mode turned off: stops any work in progress; the loaded model is kept for next time. */
  deactivate(): void {
    this.#indexJob++;
    this.#findJob++;
    this.finding = false;
    this.results = null;
    if (this.status !== 'error') this.status = 'off';
  }

  /** The user agreed to the download */
  accept(): void {
    if (this.status !== 'asking' || !this.model || !this.variant || !this.#engine) return;
    this.#consented.add(this.model.id);
    this.#load(this.#engine, this.model, this.variant).catch((error) => this.#fail(error));
  }

  async #start(modelId: ModelId): Promise<void> {
    this.#dispose();
    const model = MODELS[modelId];
    this.model = model;
    this.error = null;
    this.status = 'loading';
    const engine = (this.#engine = new Engine());
    try {
      this.#probe ??= await engine.probe();
      // Half precision on the graphics card where it is available; otherwise the smaller quantized file in WebAssembly
      const variant: Variant = this.#probe.webgpu && this.#probe.fp16 ? 'fp16' : 'q8';
      this.variant = variant;
      if (!this.#consented.has(modelId) && !(await isCached(model, variant))) {
        this.status = 'asking';
        return;
      }
      await this.#load(engine, model, variant);
    } catch (error) {
      this.#fail(error);
    }
  }

  async #load(engine: Engine, model: EmbeddingModel, variant: Variant): Promise<void> {
    this.status = 'loading';
    this.progress = null;
    const onprogress = (loaded: number, total: number) => (this.progress = total ? loaded / total : null);
    try {
      const device = variant === 'fp16' ? 'webgpu' : 'wasm';
      await engine.load({ model: model.repo, device, dtype: variant, pooling: model.pooling }, onprogress);
    } catch (error) {
      if (variant !== 'fp16') throw error;
      // The graphics card refused: WebAssembly instead (a smaller file than the one agreed to)
      this.variant = 'q8';
      this.progress = null;
      await engine.load({ model: model.repo, device: 'wasm', dtype: 'q8', pooling: model.pooling }, onprogress);
    }
    this.progress = null;
    this.loaded = true;
    this.status = 'ready';
  }

  #dispose(): void {
    this.#engine?.terminate();
    this.#engine = null;
    this.#indexJob++;
    this.#findJob++;
    this.loaded = false;
    this.finding = false;
    this.results = null;
    this.progress = null;
    this.#vectors = new Map();
    this.#itemVectors = new Map();
    this.#passagesByItem = new Map();
  }

  #fail(error: unknown): void {
    this.error = error instanceof Error ? error.message : String(error);
    this.status = 'error';
    this.progress = null;
    this.finding = false;
  }

  // ---------- The data ----------

  /** Embeds the passages that haven't been yet (the same text is embedded once), then builds each item's vector. */
  index(passages: Passage[]): Promise<void> {
    const job = ++this.#indexJob;
    this.#passages = passages;
    const run = async () => {
      const engine = this.#engine;
      const model = this.model;
      if (!engine || !model || !this.loaded) return;
      const missing = distinctTexts(passages).filter((text) => !this.#vectors.has(text));
      if (missing.length) {
        this.status = 'indexing';
        this.progress = 0;
      }
      for (let i = 0; i < missing.length; i += CHUNK) {
        if (job !== this.#indexJob) return;
        const chunk = missing.slice(i, i + CHUNK);
        const { vectors, dims } = await engine.embed(chunk.map((text) => model.passagePrefix + text));
        if (job !== this.#indexJob) return;
        this.#dims = dims;
        chunk.forEach((text, k) => this.#vectors.set(text, vectors.subarray(k * dims, (k + 1) * dims)));
        this.progress = Math.min(i + CHUNK, missing.length) / missing.length;
      }
      const byItem = new Map<number, Passage[]>();
      for (const passage of passages) {
        const list = byItem.get(passage.itemId);
        if (list) list.push(passage);
        else byItem.set(passage.itemId, [passage]);
      }
      const itemVectors = new Map<number, Float32Array>();
      for (const [id, list] of byItem) {
        const vectors = list.map((p) => this.#vectors.get(p.text)).filter((v): v is Float32Array => v !== undefined);
        if (vectors.length) itemVectors.set(id, meanVector(vectors, this.#dims));
      }
      this.#passagesByItem = byItem;
      this.#itemVectors = itemVectors;
      this.progress = null;
      this.status = 'ready';
      this.indexVersion++;
    };
    this.#indexing = run().catch((error) => this.#fail(error));
    return this.#indexing;
  }

  // ---------- Searching ----------

  /** The `limit` data items closest to a text, or to another data item, as `results` (tagged with `key`). */
  async find(key: string, query: { text: string } | { itemId: number }, limit: number): Promise<void> {
    const job = ++this.#findJob;
    this.finding = true;
    try {
      await this.#indexing;
      const engine = this.#engine;
      const model = this.model;
      if (!engine || !model || this.status !== 'ready' || job !== this.#findJob) return;
      let scored: Scored[];
      if ('text' in query) {
        const { vectors } = await engine.embed([model.queryPrefix + query.text]);
        if (job !== this.#findJob) return;
        scored = closestByPassage(this.#passages, vectors, (text) => this.#vectors.get(text), limit);
      } else {
        scored = this.#similar(query.itemId, limit);
      }
      const matches = new Map<number, MeaningMatch>();
      if ('itemId' in query) matches.set(query.itemId, { rank: 0, score: 1, passage: '', column: '' });
      scored.forEach((s, i) => matches.set(s.itemId, { rank: i + 1, score: s.score, passage: s.passage, column: s.column }));
      this.results = { key, matches };
    } catch (error) {
      this.#fail(error);
    } finally {
      if (job === this.#findJob) this.finding = false;
    }
  }

  /** Items by the similarity of their whole text to one item's, each explained by its passage closest to that item */
  #similar(itemId: number, limit: number): Scored[] {
    const anchor = this.#itemVectors.get(itemId);
    if (!anchor) return [];
    const scored: Scored[] = [];
    for (const [id, vector] of this.#itemVectors) {
      if (id !== itemId) scored.push({ itemId: id, score: dot(anchor, vector), passage: '', column: '' });
    }
    const top = topScores(scored, limit);
    for (const entry of top) {
      let best = -Infinity;
      for (const passage of this.#passagesByItem.get(entry.itemId) ?? []) {
        const vector = this.#vectors.get(passage.text);
        const score = vector ? dot(anchor, vector) : -Infinity;
        if (score > best) {
          best = score;
          entry.passage = passage.text;
          entry.column = passage.column;
        }
      }
    }
    return top;
  }
}
