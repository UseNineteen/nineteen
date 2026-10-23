<script lang="ts">
  import { ACCEPT } from '../lib/parse';

  interface Props {
    onfile: (file: File) => void;
    onurl: (url: string) => void;
    onsample: (href: string) => void;
    onprivacy: () => void;
  }

  let { onfile, onurl, onsample, onprivacy }: Props = $props();

  const HELP_URL = 'https://github.com/UseNineteen/nineteen/blob/main/README.md';
  const GITHUB_URL = 'https://github.com/UseNineteen/nineteen';
  const SAMPLE_URL = './shopping_decision_diary.xlsx';
  const WHATS_NEW_URL = './whats-new.html';
  /** The "What's new" link only shows on the GitHub Pages preview (and local builds), not the main site */
  const isPreview = /(\.github\.io|^localhost|^127\.0\.0\.1)$/.test(location.hostname);

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
      {#if isPreview}
        <li><a href={WHATS_NEW_URL} target="_blank" rel="noopener noreferrer">What's new</a></li>
      {/if}
    </ul>
    <p class="privacy-note">
      Everything happens in your browser. No cookies, no tracking, no uploads. Data goes to an AI service only if you
      choose to send it there.
    </p>
  </footer>
</div>
