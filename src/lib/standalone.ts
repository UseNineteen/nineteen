import { EMBED_ID, scriptSafeJson, type SavedFile } from './persist';

/**
 * "Download HTML file": the whole app is built as a single self-contained
 * HTML page, so a saved copy is simply this page's own markup with the data
 * embedded. Nothing is sent anywhere; the file works offline.
 */

const KEEP = new Set(['META', 'TITLE', 'STYLE', 'SCRIPT', 'LINK', 'NOSCRIPT', 'MAIN']);

let pristine: string | null = null;

/** Must run before the app renders, so the captured markup is the untouched page. */
export function capturePristineHtml(): void {
  const root = document.documentElement.cloneNode(true) as HTMLElement;
  root.querySelector(`#${EMBED_ID}`)?.remove();
  // Drop anything injected by browser extensions
  for (const parent of [root.querySelector('head'), root.querySelector('body')]) {
    for (const child of [...(parent?.children ?? [])]) {
      if (!KEEP.has(child.tagName)) child.remove();
      // The app's own code is inline; an external script is the host's analytics, which saved files must not carry
      else if (child.tagName === 'SCRIPT' && child.hasAttribute('src')) child.remove();
    }
  }
  root.querySelector('main')?.replaceChildren();
  root.removeAttribute('style');
  root.removeAttribute('class');
  pristine = '<!doctype html>\n' + root.outerHTML;
}

/** Whether a standalone copy can be produced (only in the built single-file app, not the dev server). */
export function canSaveStandalone(): boolean {
  return pristine !== null && !import.meta.env.DEV;
}

export function standaloneHtml(saved: SavedFile): string {
  if (!pristine) throw new Error('Page markup was not captured');
  const data = `<script type="application/json" id="${EMBED_ID}">${scriptSafeJson(saved)}</script>`;
  // The inlined app code itself contains the text "</body>", so insert before the real (last) one
  const end = pristine.lastIndexOf('</body>');
  return `${pristine.slice(0, end)}${data}\n${pristine.slice(end)}`;
}
