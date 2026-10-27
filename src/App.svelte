<script lang="ts">
  import Import from './components/Import.svelte';
  import Privacy from './components/Privacy.svelte';
  import Progress from './components/Progress.svelte';
  import Visualize from './components/Visualize.svelte';
  import type { Dataset } from './lib/data';
  import { fetchHosted, resolveHostedUrl } from './lib/hosted';
  import { parseBytes } from './lib/parse';
  import { loadSession, readEmbedded, saveSession, type ViewState } from './lib/persist';
  import { Viz } from './lib/viz.svelte';

  type Page = 'import' | 'visualize' | 'privacy';

  interface Loading {
    message: string;
    progress: number | null;
    error?: string;
  }

  /**
   * Page addresses. On the web each page has its own path under the app's directory ("/visualize",
   * "/privacy"), so the host's cookieless visit counts can tell the front page from the
   * visualization. The bundled example shows as "/example", so trying it out can be told from
   * opening a file. Nothing about the file is ever in the address. A saved HTML file is opened
   * from disk, where the path can't change, so it keeps hash addresses ("#/visualize").
   */
  const PAGES: Page[] = ['visualize', 'privacy'];
  const useHash = location.protocol === 'file:';
  /** The directory the app is served from ("/" or "/nineteen/"), whichever page the address names */
  const base = location.pathname.replace(/(visualize|example|privacy|index\.html)$/, '').replace(/\/?$/, '/');
  /** Whether the open file is the bundled example (kept across a reload by its address) */
  let sample = !useHash && location.pathname.slice(base.length) === 'example';

  function addressOf(next: Page): string {
    const name = next === 'visualize' && sample ? 'example' : next;
    if (useHash) return next === 'import' ? location.pathname + location.search : `#/${name}`;
    return next === 'import' ? base : base + name;
  }

  let page = $state<Page>('import');
  let viz = $state<Viz | null>(null);
  let loading = $state<Loading | null>(null);
  let loadId = 0;

  function show(dataset: Dataset, view?: ViewState) {
    viz = new Viz(dataset, view);
  }

  function pageFromAddress(): Page {
    const name = useHash ? location.hash.replace(/^#\//, '') : location.pathname.slice(base.length);
    if (name === 'example') return 'visualize';
    return PAGES.find((p) => p === name) ?? 'import';
  }

  function go(next: Page) {
    const current = useHash ? location.hash : location.pathname;
    const wanted = useHash && next === 'import' ? '' : addressOf(next);
    if (current !== wanted) history.pushState(null, '', addressOf(next));
    page = next;
    window.scrollTo(0, 0);
  }

  function syncFromAddress() {
    // Links from before pages had paths ("#/visualize") still open the right page
    const legacy = !useHash && /^#\/(visualize|privacy)$/.exec(location.hash);
    if (legacy) history.replaceState(null, '', addressOf(legacy[1] as Page));
    const next = pageFromAddress();
    if (next === 'visualize' && !viz) {
      const session = loadSession();
      if (session) show(session.dataset, session.view);
    }
    page = next === 'visualize' && !viz ? 'import' : next;
  }

  // Startup: a saved standalone file opens straight into its view
  const embedded = readEmbedded();
  if (embedded) {
    show(embedded.dataset, embedded.view);
    page = 'visualize';
  } else {
    syncFromAddress();
  }

  function fail(id: number, error: unknown) {
    if (id !== loadId) return;
    const message = error instanceof Error ? error.message : String(error);
    loading = { message: '', progress: null, error: message };
  }

  async function finish(id: number, name: string, bytes: Uint8Array, isSample = false) {
    if (id !== loadId) return;
    loading = { message: 'Parsing...', progress: null };
    // Let the progress window paint before the (synchronous) parse
    await new Promise((resolve) => setTimeout(resolve, 30));
    if (id !== loadId) return;
    const dataset = parseBytes(name, bytes);
    loading = { message: 'Parsing...', progress: 1 };
    saveSession(dataset);
    show(dataset);
    loading = null;
    sample = isSample;
    go('visualize');
  }

  function readLocal(file: File) {
    const id = ++loadId;
    loading = { message: 'Reading...', progress: 0 };
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (id === loadId && event.lengthComputable) loading = { message: 'Reading...', progress: event.loaded / event.total };
    };
    reader.onerror = () => fail(id, new Error('The file could not be read.'));
    reader.onload = () => finish(id, file.name, new Uint8Array(reader.result as ArrayBuffer)).catch((e) => fail(id, e));
    reader.readAsArrayBuffer(file);
  }

  async function readHosted(input: string) {
    const id = ++loadId;
    loading = { message: 'Downloading...', progress: null };
    try {
      const source = resolveHostedUrl(input);
      const bytes = await fetchHosted(source, (progress) => {
        if (id === loadId) loading = { message: 'Downloading...', progress };
      });
      await finish(id, source.name, bytes);
    } catch (error) {
      fail(id, error);
    }
  }

  async function readSample(href: string) {
    const id = ++loadId;
    loading = { message: 'Downloading...', progress: null };
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error('The example file could not be loaded.');
      await finish(id, href.slice(href.lastIndexOf('/') + 1), new Uint8Array(await response.arrayBuffer()), true);
    } catch (error) {
      fail(id, error);
    }
  }

  function cancel() {
    loadId++;
    loading = null;
  }
</script>

<svelte:window onpopstate={syncFromAddress} />

{#if page === 'visualize' && viz}
  {#key viz}
    <Visualize {viz} onrestart={() => go('import')} />
  {/key}
{:else if page === 'privacy'}
  <Privacy onback={() => go('import')} />
{:else}
  <Import onfile={readLocal} onurl={readHosted} onsample={readSample} onprivacy={() => go('privacy')} />
{/if}

{#if loading}
  <Progress {...loading} oncancel={cancel} />
{/if}
