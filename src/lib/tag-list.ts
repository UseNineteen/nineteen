import Papa from 'papaparse';
import { normalizeTag } from './data';
import { tagKey, type TagInfo } from './tags';

/**
 * The tag list (a codebook): the tags a study uses, each with an optional description, kept
 * with the view. It can hold tags no data item carries yet, so a researcher can prepare the
 * tagging options before coding, and it can be exported and imported as CSV, JSON or text.
 * Tags keep their spelling but are matched without regard to case.
 */

export interface TagEntry {
  tag: string;
  description: string;
}

/** A tag as Manage tags shows it: the catalog's count (0 while no data item carries it) and its description */
export interface TagListItem extends TagInfo {
  description: string;
}

/** A row of an exported list: the entry plus how many data items carry the tag */
export interface TagRow extends TagEntry {
  count: number;
}

export type TagListFormat = 'csv' | 'json' | 'text';

export const TAG_LIST_FORMATS: { id: TagListFormat; label: string; extension: string; type: string }[] = [
  { id: 'csv', label: 'CSV', extension: 'csv', type: 'text/csv' },
  { id: 'json', label: 'JSON', extension: 'json', type: 'application/json' },
  { id: 'text', label: 'Text', extension: 'txt', type: 'text/plain' },
];

/** What a file may call its columns: the first of these found names the tag, the description */
const TAG_HEADERS = ['tag', 'tags', 'name', 'code', 'label'];
const DESCRIPTION_HEADERS = ['description', 'definition', 'meaning', 'notes', 'note', 'memo'];

function cleanEntry(tag: unknown, description: unknown): TagEntry | null {
  const name = normalizeTag(String(tag ?? ''));
  if (!name) return null;
  return { tag: name, description: String(description ?? '').trim() };
}

/** Entries without duplicates (ignoring case), first spelling kept, a later description filling an empty one */
export function dedupeEntries(entries: TagEntry[]): TagEntry[] {
  const byKey = new Map<string, TagEntry>();
  for (const entry of entries) {
    const key = tagKey(entry.tag);
    const current = byKey.get(key);
    if (!current) byKey.set(key, { ...entry });
    else if (!current.description && entry.description) current.description = entry.description;
  }
  return [...byKey.values()];
}

// ---------- Writing ----------

export function formatTagList(rows: TagRow[], format: TagListFormat): string {
  if (format === 'json') return JSON.stringify({ nineteen: 'tag list', tags: rows }, null, 2) + '\n';
  if (format === 'csv') {
    // UTF-8 with a byte-order mark, so Excel opens accented characters correctly
    return '\ufeff' + Papa.unparse({ fields: ['tag', 'description', 'count'], data: rows.map((r) => [r.tag, r.description, r.count]) });
  }
  // One tag per line, its description after a tab when it has one
  return rows.map((r) => (r.description ? `${r.tag}\t${r.description}` : r.tag)).join('\n') + '\n';
}

// ---------- Reading ----------

function fromJson(value: unknown): TagEntry[] | null {
  const list = Array.isArray(value) ? value : value && typeof value === 'object' ? (value as { tags?: unknown }).tags : undefined;
  if (!Array.isArray(list)) return null;
  const entries: TagEntry[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      const entry = cleanEntry(item, '');
      if (entry) entries.push(entry);
    } else if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const tag = TAG_HEADERS.map((h) => record[h]).find((v) => v !== undefined);
      const description = DESCRIPTION_HEADERS.map((h) => record[h]).find((v) => v !== undefined);
      const entry = cleanEntry(tag, description);
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

/** A CSV with a header row naming a tag column (and maybe a description), or without one: tag, description */
function fromCsv(text: string): TagEntry[] {
  const parsed = Papa.parse<string[]>(text.replace(/^\ufeff/, ''), { skipEmptyLines: true });
  const rows = parsed.data.filter((row) => row.some((cell) => cell.trim() !== ''));
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const tagAt = header.findIndex((h) => TAG_HEADERS.includes(h));
  const descriptionAt = header.findIndex((h) => DESCRIPTION_HEADERS.includes(h));
  const body = tagAt >= 0 ? rows.slice(1) : rows;
  const t = tagAt >= 0 ? tagAt : 0;
  const d = tagAt >= 0 ? descriptionAt : 1;
  return body.map((row) => cleanEntry(row[t], d >= 0 ? row[d] : '')).filter((e): e is TagEntry => e !== null);
}

/** One tag per line, with an optional description after a tab */
function fromText(text: string): TagEntry[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const [tag, ...rest] = line.split('\t');
      return cleanEntry(tag, rest.join('\t'));
    })
    .filter((e): e is TagEntry => e !== null);
}

/**
 * Reads a tag list from a file's text, by its name's extension or, failing that, its content.
 * Throws when the file can't be read as a list.
 */
export function parseTagList(fileName: string, text: string): TagEntry[] {
  const extension = fileName.replace(/^.*\./, '').toLowerCase();
  const trimmed = text.trim();
  if (extension === 'json' || /^[[{]/.test(trimmed)) {
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      throw new Error('The file is not valid JSON.');
    }
    const entries = fromJson(value);
    if (!entries) throw new Error('The JSON holds no list of tags.');
    return dedupeEntries(entries);
  }
  if (extension === 'csv' || extension === 'tsv' || (trimmed.includes(',') && trimmed.includes('\n'))) {
    return dedupeEntries(fromCsv(extension === 'tsv' ? text.replace(/\t/g, ',') : text));
  }
  return dedupeEntries(fromText(text));
}

// ---------- Merging ----------

export interface MergeResult {
  list: TagEntry[];
  /** Tags not in the list before */
  added: number;
  /** Tags that were there and gained a description */
  described: number;
}

/**
 * Adds imported entries to the list: new tags are appended (their spelling kept), known tags
 * (ignoring case) keep their spelling and gain the imported description where they had none.
 */
export function mergeTagList(current: TagEntry[], imported: TagEntry[]): MergeResult {
  const list = current.map((e) => ({ ...e }));
  const byKey = new Map(list.map((e) => [tagKey(e.tag), e]));
  let added = 0;
  let described = 0;
  for (const entry of dedupeEntries(imported)) {
    const existing = byKey.get(tagKey(entry.tag));
    if (!existing) {
      const copy = { ...entry };
      list.push(copy);
      byKey.set(tagKey(entry.tag), copy);
      added++;
    } else if (!existing.description && entry.description) {
      existing.description = entry.description;
      described++;
    }
  }
  return { list, added, described };
}

/** The list with a tag added (unchanged when the list has it already, ignoring case) */
export function withTag(list: TagEntry[], tag: string): TagEntry[] {
  const name = normalizeTag(tag);
  if (!name || list.some((e) => tagKey(e.tag) === tagKey(name))) return list;
  return [...list, { tag: name, description: '' }];
}

/** The list with one entry's description set (the entry is added when the list didn't have it) */
export function withDescription(list: TagEntry[], tag: string, description: string): TagEntry[] {
  const key = tagKey(tag);
  const text = description.trim();
  if (list.some((e) => tagKey(e.tag) === key)) return list.map((e) => (tagKey(e.tag) === key ? { ...e, description: text } : e));
  return [...list, { tag: normalizeTag(tag), description: text }];
}

/** The list after tags were renamed, combined or deleted (`renames`: old key → new label, or null when removed) */
export function followTagRenames(list: TagEntry[], renames: ReadonlyMap<string, string | null>): TagEntry[] {
  const next: TagEntry[] = [];
  const byKey = new Map<string, TagEntry>();
  for (const entry of list) {
    const key = tagKey(entry.tag);
    const target = renames.has(key) ? renames.get(key)! : entry.tag;
    if (target === null) continue;
    const targetKey = tagKey(target);
    const existing = byKey.get(targetKey);
    if (existing) {
      // Combined into another tag: that one keeps its description, or takes this one's
      if (!existing.description) existing.description = entry.description;
      continue;
    }
    const moved = { tag: renames.has(key) ? target : entry.tag, description: entry.description };
    byKey.set(targetKey, moved);
    next.push(moved);
  }
  return next;
}
