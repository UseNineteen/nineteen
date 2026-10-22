/**
 * Loading files from a link, entirely in the browser.
 *
 * The original app fell back to downloading through its server when a host
 * didn't allow cross-origin requests. There is no server any more, so share
 * links from common hosts are rewritten to their direct-download form, and
 * hosts that block browser access get a clear explanation instead.
 */

export interface HostedSource {
  url: string;
  name: string;
}

export class HostedFileError extends Error {}

function basename(url: URL): string {
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
  return last || 'hosted-file';
}

export function resolveHostedUrl(input: string): HostedSource {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new HostedFileError('That doesn’t look like a web address. Paste a full link starting with https://');
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:') {
    throw new HostedFileError('Only https:// links can be loaded.');
  }

  const host = url.hostname.toLowerCase();

  // Dropbox share links → direct content host (which allows browser access)
  if (host === 'www.dropbox.com' || host === 'dropbox.com') {
    url.hostname = 'dl.dropboxusercontent.com';
    url.searchParams.delete('dl');
    return { url: url.toString(), name: basename(url) };
  }

  // Google Sheets → CSV export of the linked tab
  const sheet = /^\/spreadsheets\/d\/([^/]+)/.exec(url.pathname);
  if (host === 'docs.google.com' && sheet) {
    const gid = url.searchParams.get('gid') ?? /gid=(\d+)/.exec(url.hash)?.[1];
    const exportUrl = new URL(`https://docs.google.com/spreadsheets/d/${sheet[1]}/export`);
    exportUrl.searchParams.set('format', 'csv');
    if (gid) exportUrl.searchParams.set('gid', gid);
    return { url: exportUrl.toString(), name: 'Google Sheet.csv' };
  }

  // Google Drive file links → direct download
  const driveFile = /^\/file\/d\/([^/]+)/.exec(url.pathname)?.[1] ?? (url.pathname === '/open' ? url.searchParams.get('id') : null);
  if (host === 'drive.google.com' && driveFile) {
    return { url: `https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveFile)}&export=download`, name: 'Google Drive file' };
  }

  // GitHub file pages → raw file
  const blob = /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(url.pathname);
  if (host === 'github.com' && blob) {
    const raw = new URL(`https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}`);
    return { url: raw.toString(), name: basename(raw) };
  }

  return { url: url.toString(), name: basename(url) };
}

export async function fetchHosted(
  source: HostedSource,
  onProgress?: (fraction: number | null) => void,
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(source.url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new HostedFileError(
      'That site doesn’t let browsers load its files directly, so Nineteen can’t read it without ' +
        'sending it through a server. Download the file and use “Choose a file” instead. ' +
        'Your data stays on your computer that way.',
    );
  }
  if (!response.ok) {
    throw new HostedFileError(`The file couldn’t be downloaded (the server responded ${response.status}). Check that the link is public.`);
  }
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('text/html')) {
    throw new HostedFileError(
      'That link opened a web page rather than a file. Make sure it’s a direct, publicly shared link to a .csv or .xlsx file.',
    );
  }

  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(total ? received / total : null);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
