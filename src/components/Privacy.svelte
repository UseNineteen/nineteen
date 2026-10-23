<script lang="ts">
  interface Props {
    onback: () => void;
  }

  let { onback }: Props = $props();
</script>

<article id="privacy">
  <a
    class="back"
    href="./"
    onclick={(e) => {
      e.preventDefault();
      onback();
    }}>&larr; nineteen</a
  >

  <h1>Privacy</h1>
  <p>
    Nineteen was built for confidential research data. Your research is your research. Everything Nineteen does
    happens inside your web browser, on your own computer.
  </p>

  <h2>Your data never leaves your computer</h2>
  <p>
    Files you open are read and visualized by your browser. They are never uploaded to Nineteen. There is no Nineteen
    server that processes data. The one exception is the optional AI features described below. Data goes to an AI
    provider only when you explicitly send it there.
  </p>

  <h2>No cookies, no tracking</h2>
  <p>
    Nineteen sets no cookies and uses no analytics, advertising, or other tracking. Because nothing beyond what
    is strictly necessary is stored on your device, there is no consent banner.
  </p>

  <h2>What is stored on your device</h2>
  <p>
    While a file is open, a copy of its contents is kept in your browser’s <em>session storage</em> so the
    visualization survives a page reload. Only this browser tab can read it, and your browser deletes it when
    you close the tab. Nothing is sent anywhere.
  </p>

  <h2>Hosted files</h2>
  <p>
    If you paste a link to a hosted file, your browser downloads it directly from the site you linked to (for
    example Dropbox or Google). That site sees the request the way it would for any download. Nineteen doesn’t
    send any referrer information. Some sites don’t allow browsers to load files this way. In that case, download
    the file and open it with “Choose a file”.
  </p>

  <h2>Links and images inside your data</h2>
  <p>
    If a cell in your data contains a link to an image, the viewer shows that image, which means your browser
    loads it from the site where it is hosted.
  </p>

  <h2>Analyzing with AI (optional)</h2>
  <p>
    “Analyze with AI” offers two ways to work with AI services. Neither runs unless you use it.
  </p>
  <ul>
    <li>
      <strong>Copy prompt</strong> builds a prompt containing your data, for you to paste into an AI assistant
      yourself. Nineteen sends nothing. Where the data goes is up to you.
    </li>
    <li>
      <strong>Ask</strong> and <strong>Auto-code</strong> use your own API key from Anthropic (Claude) or OpenAI
      (ChatGPT). When you use them, your browser sends the rows and columns you chose under “Data to share” directly to
      that company. It never passes through a Nineteen server. The first time in each session, Nineteen asks you to
      confirm before sending anything. That provider’s terms and privacy policy apply to data you send it.
    </li>
  </ul>
  <p>
    Your API key is kept only in the page’s memory, unless you choose “Remember key on this device”. In that case it
    is stored in this browser’s local storage until you choose “Forget my keys”. It is only ever sent to the provider
    it belongs to.
  </p>

  <h2>Saved files</h2>
  <p>
    “Download HTML file” and “Download PNG image” are created inside your browser and saved straight to your
    computer. A saved HTML file contains your data, so share it only with people who should see that data.
  </p>

  <h2>Questions</h2>
  <p>
    Nineteen is open source, so you can check all of this in the
    <a href="https://github.com/UseNineteen/nineteen" target="_blank" rel="noopener noreferrer">code on GitHub</a>.
  </p>
</article>
