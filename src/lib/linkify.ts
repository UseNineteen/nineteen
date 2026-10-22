/**
 * Splits cell text into plain text, links, and inline images, with search
 * highlights applied. Components render these segments as elements, so cell
 * contents are never interpreted as HTML.
 */

export interface Piece {
  text: string;
  mark: boolean;
}

export type Segment =
  | { kind: 'text'; pieces: Piece[] }
  | { kind: 'link'; href: string; pieces: Piece[] }
  | { kind: 'image'; src: string; alt: string };

const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}]|\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gi;
const IMAGE = /\.(?:png|jpe?g|gif|webp|svg|avif)(?:[?#].*)?$/i;

function piecesFor(text: string, start: number, ranges: [number, number][]): Piece[] {
  const end = start + text.length;
  const pieces: Piece[] = [];
  let cursor = start;
  for (const [from, to] of ranges) {
    if (to <= cursor || from >= end) continue;
    const a = Math.max(from, cursor);
    const b = Math.min(to, end);
    if (a > cursor) pieces.push({ text: text.slice(cursor - start, a - start), mark: false });
    pieces.push({ text: text.slice(a - start, b - start), mark: true });
    cursor = b;
  }
  if (cursor < end) pieces.push({ text: text.slice(cursor - start), mark: false });
  return pieces;
}

export function segments(text: string, highlights: [number, number][] = []): Segment[] {
  const result: Segment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(LINK)) {
    const start = match.index;
    if (start > cursor) result.push({ kind: 'text', pieces: piecesFor(text.slice(cursor, start), cursor, highlights) });
    const value = match[0];
    const isEmail = !/^(?:https?:\/\/|www\.)/i.test(value);
    const href = isEmail ? `mailto:${value}` : /^www\./i.test(value) ? `https://${value}` : value;
    if (!isEmail && IMAGE.test(value)) {
      result.push({ kind: 'image', src: href, alt: value });
    } else {
      result.push({ kind: 'link', href, pieces: piecesFor(value, start, highlights) });
    }
    cursor = start + value.length;
  }
  if (cursor < text.length) result.push({ kind: 'text', pieces: piecesFor(text.slice(cursor), cursor, highlights) });
  return result;
}
