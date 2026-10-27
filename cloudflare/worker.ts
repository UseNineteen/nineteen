/**
 * The Cloudflare Worker behind usenineteen.com. Nineteen is a static site: Cloudflare serves the
 * committed build in dist/ as static assets, and this Worker only runs for paths that have none.
 * It exists for one reason: Cloudflare allows static files of up to 25 MiB, and the ONNX runtime's
 * largest file (the WebAssembly behind "Find by meaning") is bigger. The build writes such a file
 * as parts beside it and describes them in ort/split.json (see vite.config.ts); this Worker joins
 * the parts again, so the browser sees the whole file at its usual address.
 */

interface Env {
  /** The static assets in dist/ (a path without one gets index.html, the app's own routing) */
  ASSETS: { fetch(request: Request): Promise<Response> };
}

interface Context {
  waitUntil(task: Promise<unknown>): void;
}

/** ort/split.json: each split file's size, ETag and part sizes, in order */
type SplitFiles = Record<string, { size: number; etag: string; parts: number[] }>;

const SPLIT_DIR = '/ort/';
const MANIFEST = `${SPLIT_DIR}split.json`;
const TYPES: Record<string, string> = { wasm: 'application/wasm', mjs: 'text/javascript' };
/** Browsers ask the server each time and get a quick 304 (as Cloudflare answers for the other files) */
const CACHE_CONTROL = 'public, max-age=0, must-revalidate';
/** A joined file stays at Cloudflare's edge under a key that includes its ETag, so a new build never reuses an old copy */
const EDGE_CACHE_CONTROL = 'public, s-maxage=2592000';

let manifest: Promise<SplitFiles> | undefined;

export default {
  async fetch(request: Request, env: Env, ctx: Context): Promise<Response> {
    const url = new URL(request.url);
    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith(SPLIT_DIR)) {
      const name = url.pathname.slice(SPLIT_DIR.length);
      const split = (await splitFiles(env, url.origin))[name];
      if (split) return joined(request, env, ctx, url, name, split);
    }
    return env.ASSETS.fetch(request);
  },
};

/** The manifest, read once per Worker instance (a new build starts new instances) */
function splitFiles(env: Env, origin: string): Promise<SplitFiles> {
  manifest ??= env.ASSETS.fetch(new Request(origin + MANIFEST))
    .then(async (response) => {
      if (!response.ok || !/json/.test(response.headers.get('content-type') ?? '')) return {};
      return (await response.json()) as SplitFiles;
    })
    .catch(() => {
      manifest = undefined;
      return {};
    });
  return manifest;
}

async function joined(request: Request, env: Env, ctx: Context, url: URL, name: string, split: SplitFiles[string]): Promise<Response> {
  if (request.headers.get('if-none-match') === split.etag) {
    return new Response(null, { status: 304, headers: { etag: split.etag, 'cache-control': CACHE_CONTROL } });
  }
  const headers = new Headers({
    'content-type': TYPES[name.replace(/^.*\./, '')] ?? 'application/octet-stream',
    'content-length': String(split.size),
    etag: split.etag,
    'cache-control': CACHE_CONTROL,
  });
  if (request.method === 'HEAD') return new Response(null, { headers });

  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`${url.origin}${url.pathname}?etag=${encodeURIComponent(split.etag)}`);
  const cached = await cache.match(key);
  if (cached) return new Response(cached.body, { headers });

  const parts = await Promise.all(split.parts.map((_, i) => env.ASSETS.fetch(new Request(`${url.origin}${url.pathname}.part${i + 1}`))));
  // A missing part comes back as the app's page (the not-found handling), not as an error
  if (parts.some((part) => !part.ok || !part.body || /text\/html/.test(part.headers.get('content-type') ?? ''))) {
    return new Response(`${name} is incomplete on the server.`, { status: 500 });
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  ctx.waitUntil(join(parts, writable));
  const [body, copy] = readable.tee();
  const edgeHeaders = new Headers(headers);
  edgeHeaders.set('cache-control', EDGE_CACHE_CONTROL);
  ctx.waitUntil(cache.put(key, new Response(copy, { headers: edgeHeaders })));
  return new Response(body, { headers });
}

/** Streams the parts, in order, into one body */
async function join(parts: Response[], writable: WritableStream<Uint8Array>): Promise<void> {
  try {
    for (const part of parts) await part.body!.pipeTo(writable, { preventClose: true });
    await writable.close();
  } catch (error) {
    await writable.abort(error);
  }
}
