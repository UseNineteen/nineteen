import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
        `script-src ${hashes.join(' ')}`,
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

export default defineConfig({
  plugins: [svelte(), viteSingleFile({ removeViteModuleLoader: true }), contentSecurityPolicy()],
  build: {
    target: 'es2022',
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
