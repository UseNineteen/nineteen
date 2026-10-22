import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { buildDataset, type Dataset } from './data';

export type Format = 'xlsx' | 'xls' | 'csv';

export const ACCEPT = '.csv,.tsv,.txt,.xls,.xlsx';

/** Identifies the file by its contents (not its name), so links without extensions still work. */
export function detectFormat(bytes: Uint8Array): Format {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'xlsx';
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'xls';
  return 'csv';
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Not valid UTF-8: most likely a CSV saved by older Excel on Windows/Mac
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Turns a grid (header row + data rows) into records with unique, non-empty column names. */
export function recordsFromMatrix(matrix: unknown[][]): { columns: string[]; rows: Record<string, string>[] } {
  const [header = [], ...body] = matrix;
  const width = body.reduce((max, r) => Math.max(max, r.length), header.length);
  const used = new Set<string>();
  const names: string[] = [];
  for (let i = 0; i < width; i++) {
    let name = String(header[i] ?? '').trim() || `Column ${i + 1}`;
    if (used.has(name)) {
      let n = 2;
      while (used.has(`${name} (${n})`)) n++;
      name = `${name} (${n})`;
    }
    used.add(name);
    names.push(name);
  }
  // Drop unnamed columns that hold no data at all (e.g. stray formatting in Excel)
  const keep = names
    .map((name, i) => ({ name, i }))
    .filter(({ i }) => String(header[i] ?? '').trim() !== '' || body.some((r) => String(r[i] ?? '').trim() !== ''));
  const rows = body.map((r) => {
    const row: Record<string, string> = Object.create(null);
    for (const { name, i } of keep) row[name] = r[i] === undefined || r[i] === null ? '' : String(r[i]);
    return row;
  });
  return { columns: keep.map((k) => k.name), rows };
}

function readWorkbook(bytes: Uint8Array): unknown[][] {
  const workbook = XLSX.read(bytes, { type: 'array', dense: true });
  // As before, only the first worksheet is used
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  // raw: false keeps cells as they are displayed in Excel (e.g. dates as "2/1/10")
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '', blankrows: false });
}

function readDelimited(bytes: Uint8Array): unknown[][] {
  const result = Papa.parse<string[]>(decodeText(bytes), { skipEmptyLines: 'greedy' });
  return result.data;
}

export function parseBytes(name: string, bytes: Uint8Array): Dataset {
  const matrix = detectFormat(bytes) === 'csv' ? readDelimited(bytes) : readWorkbook(bytes);
  const { columns, rows } = recordsFromMatrix(matrix);
  if (columns.length === 0 || rows.length === 0) {
    throw new Error('No data found. The first row should hold column names, and each row after it becomes one item.');
  }
  return buildDataset(name, rows, columns);
}
