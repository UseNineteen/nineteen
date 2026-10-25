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

  const HASH: Record<Page, string> = { import: '', visualize: '#/visualize', privacy: '#/privacy' };

  let page = $state<Page>('import');
  let viz = $state<Viz | null>(null);
  let loading = $state<Loading | null>(null);
  let loadId = 0;

  function show(dataset: Dataset, view?: ViewState) {
    viz = new Viz(dataset, view);
  }

  function pageFromHash(): Page {
    if (location.hash === HASH.privacy) return 'privacy';
    if (location.hash === HASH.visualize) return 'visualize';
    return 'import';
  }

  function go(next: Page) {
    if (location.hash !== HASH[next]) {
      history.pushState(null, '', HASH[next] || location.pathname + location.search);
    }
    page = next;
    window.scrollTo(0, 0);
  }

  function syncFromHash() {
    const next = pageFromHash();
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
    syncFromHash();
  }

  function fail(id: number, error: unknown) {
    if (id !== loadId) return;
    const message = error instanceof Error ? error.message : String(error);
    loading = { message: '', progress: null, error: message };
  }

  async function finish(id: number, name: string, bytes: Uint8Array) {
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
      await finish(id, 'shopping_decision_diary.xlsx', new Uint8Array(await response.arrayBuffer()));
    } catch (error) {
      fail(id, error);
    }
  }

  function cancel() {
    loadId++;
    loading = null;
  }
</script>

<svelte:window onpopstate={syncFromHash} />

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
