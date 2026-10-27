<script lang="ts">
  import { ACCEPT } from '../lib/parse';

  interface Props {
    onfile: (file: File) => void;
    onurl: (url: string) => void;
    onsample: (href: string) => void;
    onprivacy: () => void;
  }

  let { onfile, onurl, onsample, onprivacy }: Props = $props();

  const GITHUB_URL = 'https://github.com/UseNineteen/nineteen';
  /**
   * The guide is README.md, which the build renders as readme.html next to the app. A saved HTML
   * file sits on its own on disk, so it links to the live copy; the dev server has no built copy.
   */
  const HELP_URL = import.meta.env.DEV
    ? `${GITHUB_URL}/blob/main/README.md`
    : location.protocol === 'file:'
      ? 'https://usenineteen.com/readme.html'
      : './readme.html';
  const SAMPLE_URL = './shopping_decision_diary_extended.xlsx';
  const WHATS_NEW_URL = './whats-new.html';
  /** When this release came out; the "New" badge shows until NEW_UNTIL so it never looks stale */
  const RELEASED = 'Oct 2026';
  const NEW_UNTIL = new Date('2027-02-01');
  const showNewBadge = new Date() < NEW_UNTIL;

  let fileInput: HTMLInputElement;
  let url = $state('');

  function chooseFile(event: Event) {
    event.preventDefault();
    fileInput.click();
  }

  function fileChosen() {
    const file = fileInput.files?.[0];
    if (file) onfile(file);
    fileInput.value = '';
  }

  function submitUrl(event: SubmitEvent) {
    event.preventDefault();
    if (url.trim()) onurl(url);
  }

  function sample(event: MouseEvent) {
    // Plain clicks open the example; modified clicks still download the file
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onsample(SAMPLE_URL);
  }
</script>

<div id="import">
  <header>
    <h1>nineteen</h1>
    <h2>Visually explore your data</h2>
  </header>

  <div class="forms">
    <div class="container">
      <form id="upload" onsubmit={(e) => e.preventDefault()}>
        <h4>Use a local file</h4>
        <p>Most secure option. Files never leave your computer.</p>
        <button class="btn btn-primary choose-file" onclick={chooseFile}>Choose a file</button>
        <input bind:this={fileInput} type="file" accept={ACCEPT} onchange={fileChosen} aria-label="Data file" />
      </form>

      <form id="download" onsubmit={submitUrl}>
        <h4>Use a hosted file</h4>
        <p>Use any publicly accessible file on Google Drive, Dropbox, or elsewhere.</p>
        <div class="input-group">
          <input
            type="url"
            bind:value={url}
            placeholder="Paste a link to a .csv or .xlsx file"
            aria-label="Link to a .csv or .xlsx file"
            autocomplete="off"
            spellcheck="false"
          />
          <button type="submit">Go</button>
        </div>
      </form>
    </div>
  </div>

  <footer class="container">
    <ul>
      <li><a href={HELP_URL} target="_blank" rel="noopener noreferrer">How to use</a></li>
      <li><a href={SAMPLE_URL} download onclick={sample}>Try an example</a></li>
      <li><a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a></li>
      <li>
        <a
          href="#/privacy"
          onclick={(e) => {
            e.preventDefault();
            onprivacy();
          }}>Privacy</a
        >
      </li>
      <li>
        <a class="whats-new-link" href={WHATS_NEW_URL}
          >What's new in Ver. {__APP_VERSION__}?{#if showNewBadge}<span class="new-badge">New · {RELEASED}</span>{/if}</a
        >
      </li>
    </ul>
    <p class="privacy-note">
      Everything happens in your browser. No cookies, no uploads, just anonymous visit counts. Data goes to an AI service only if you choose
      to send it there.
    </p>
  </footer>
</div>
