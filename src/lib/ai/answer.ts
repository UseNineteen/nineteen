/**
 * Turns a model's answer (light Markdown with [Row N] citations) into blocks
 * of inline parts. Components render these as elements, so model output is
 * never interpreted as HTML.
 */

export type Inline =
  | { kind: 'text'; text: string; bold?: boolean; italic?: boolean }
  | { kind: 'cite'; rows: number[]; label: string };

export type Block =
  | { kind: 'heading'; parts: Inline[] }
  | { kind: 'paragraph'; parts: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] };

// [Row 12], [Rows 3, 7], [Row 12, Row 40], [Rows 4-6]
const CITATION = /\[(?:rows?|file rows?)\s*[\d][^\]]*\]/gi;

export function citedRows(text: string): number[] {
  const rows = new Set<number>();
  for (const match of text.matchAll(CITATION)) {
    for (const range of match[0].matchAll(/(\d+)\s*(?:[-–]\s*(\d+))?/g)) {
      const start = Number(range[1]);
      const end = range[2] ? Number(range[2]) : start;
      for (let n = start; n <= Math.min(end, start + 500); n++) rows.add(n);
    }
  }
  return [...rows].sort((a, b) => a - b);
}

/**
 * **bold** and *italic*. An italic run starts after a non-word character (or the start), opens and
 * closes on non-space text, and isn't followed by a word character, so "2*3*4" stays plain.
 * Written without lookbehind: a regex that one browser can't parse would stop the whole bundle
 * from loading, not just this function.
 */
const EMPHASIS = /\*\*(.+?)\*\*|(^|[^*\w])\*([^\s*](?:.*?\S)?)\*(?![*\w])/g;

function emphasis(text: string): Inline[] {
  const parts: Inline[] = [];
  let cursor = 0;
  for (const m of text.matchAll(EMPHASIS)) {
    // The character before an italic run is part of the match but stays plain text
    const start = m.index + (m[2]?.length ?? 0);
    if (start > cursor) parts.push({ kind: 'text', text: text.slice(cursor, start) });
    if (m[1] !== undefined) parts.push({ kind: 'text', text: m[1], bold: true });
    else parts.push({ kind: 'text', text: m[3], italic: true });
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) parts.push({ kind: 'text', text: text.slice(cursor) });
  return parts;
}

export function inline(text: string): Inline[] {
  const parts: Inline[] = [];
  let cursor = 0;
  for (const m of text.matchAll(CITATION)) {
    if (m.index > cursor) parts.push(...emphasis(text.slice(cursor, m.index)));
    const rows = citedRows(m[0]);
    parts.push({ kind: 'cite', rows, label: m[0].slice(1, -1) });
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) parts.push(...emphasis(text.slice(cursor)));
  return parts;
}

export function parseAnswer(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', parts: inline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: 'list', ...list });
    list = null;
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = /^(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(line);
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (!line) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', parts: inline(heading[1].replace(/\*\*/g, '')) });
    } else if (bullet) {
      flushParagraph();
      const ordered = bullet[1] !== undefined;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(inline(bullet[2]));
    } else if (list && /^\s{2,}/.test(raw)) {
      // Continuation of the previous list item
      const items = (list as { items: Inline[][] }).items;
      items[items.length - 1].push({ kind: 'text', text: ' ' }, ...inline(line));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
