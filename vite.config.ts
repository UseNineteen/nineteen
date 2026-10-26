import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { createHash } from 'node:crypto';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { marked } from 'marked';
import pkg from './package.json' with { type: 'json' };

const CSP_PLACEHOLDER = '__NINETEEN_CSP__';

/**
 * Fills in the Content-Security-Policy meta tag once the single-file bundle
 * is written. Inline scripts are allowed by hash only, so nothing other than
 * the code we shipped can execute, and the page cannot load third-party code.
 * In dev mode the tag is dropped (Vite's HMR client needs eval and websockets).
 */
function contentSecurityPolicy(): Plugin {
  let outDir = 'dist';
  return {
    name: 'nineteen-csp',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (ctx.server) return html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
        return html;
      },
    },
    closeBundle() {
      const file = resolve(outDir, 'index.html');
      let html: string;
      try {
        html = readFileSync(file, 'utf8');
      } catch {
        return;
      }
      const hashes: string[] = [];
      for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (/type="application\/json"/.test(match[1])) continue;
        hashes.push(`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
      }
      const policy = [
        "default-src 'none'",
        // Plus Cloudflare Web Analytics (cookieless visit counts), which Cloudflare injects on usenineteen.com
        `script-src ${hashes.join(' ')} https://static.cloudflareinsights.com`,
        "style-src 'unsafe-inline'",
        'font-src data:',
        // Images can appear inside data (autolinked image URLs in the viewer)
        "img-src 'self' data: blob: https:",
        // Hosted files are fetched directly by the browser from the user's URL
        "connect-src 'self' https:",
        "base-uri 'none'",
        "form-action 'none'",
        "object-src 'none'",
      ].join('; ');
      writeFileSync(file, html.replace(CSP_PLACEHOLDER, policy));
    },
  };
}

const README_STYLE = `
body { margin: 0; background: #fff; color: #1f2328; font: 16px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
main { box-sizing: border-box; max-width: 980px; margin: 0 auto; padding: 32px 16px 64px; }
h1, h2 { border-bottom: 1px solid #d1d9e0; padding-bottom: 0.3em; }
h1 { font-size: 2em; } h2 { font-size: 1.5em; } h3 { font-size: 1.25em; }
h1, h2, h3 { margin: 24px 0 16px; font-weight: 600; line-height: 1.25; }
img { max-width: 100%; border: 1px solid #d1d9e0; }
a { color: #0969da; }
code { background: #eff1f3; border-radius: 6px; padding: 0.2em 0.4em; font-size: 85%; }
pre { background: #f6f8fa; border-radius: 6px; padding: 16px; overflow: auto; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; display: block; overflow: auto; }
td, th { border: 1px solid #d1d9e0; padding: 6px 13px; }
ul { padding-left: 2em; } li + li { margin-top: 0.25em; }
`;

/**
 * Adds the guide pages to the build so they are served next to the app:
 * readme.html (README.md rendered, with its screenshots) and whats-new.html.
 * The example spreadsheet already comes from public/.
 */
function guidePages(): Plugin {
  let root = '.';
  let outDir = 'dist';
  return {
    name: 'nineteen-guide-pages',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const markdown = readFileSync(resolve(root, 'README.md'), 'utf8')
        // In the repository the example lives in public/; on the site it sits next to the app
        .replaceAll('(public/shopping_decision_diary.xlsx?raw=true)', '(shopping_decision_diary.xlsx)');
      const body = marked.parse(markdown, { async: false });
      writeFileSync(
        resolve(outDir, 'readme.html'),
        `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
          `<title>Nineteen: How to use</title>\n<style>${README_STYLE}</style>\n</head>\n<body>\n<main>\n${body}</main>\n</body>\n</html>\n`,
      );
      // In the repository its images sit beside it in docs/; on the site it is served from the root
      const whatsNew = readFileSync(resolve(root, 'docs/whats-new.html'), 'utf8').replaceAll('src="screenshots/', 'src="docs/screenshots/');
      writeFileSync(resolve(outDir, 'whats-new.html'), whatsNew);
      cpSync(resolve(root, 'docs/screenshots'), resolve(outDir, 'docs/screenshots'), { recursive: true });
    },
  };
}

export default defineConfig({
  // The app shows its version (package.json is the only place it is set)
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [svelte(), viteSingleFile({ removeViteModuleLoader: true }), contentSecurityPolicy(), guidePages()],
  build: {
    target: 'es2022',
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
