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

function isBlankRow(row: unknown[] | undefined): boolean {
  return !row || row.every((value) => String(value ?? '').trim() === '');
}

/**
 * Turns a grid into records with unique, non-empty column names. The header is the first row
 * with anything in it; every row after it becomes a record, blank ones included, so that
 * `rowNumbers` (parallel to `rows`) are the rows' numbers in the file. `firstRow` is the
 * file row number of `matrix[0]` (a sheet's used range may not start at row 1).
 */
export function recordsFromMatrix(
  matrix: unknown[][],
  firstRow = 1,
): { columns: string[]; rows: Record<string, string>[]; rowNumbers: number[] } {
  let headerIndex = 0;
  while (headerIndex < matrix.length && isBlankRow(matrix[headerIndex])) headerIndex++;
  const header = matrix[headerIndex] ?? [];
  const body = matrix.slice(headerIndex + 1);
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
  const rowNumbers = body.map((_, i) => firstRow + headerIndex + 1 + i);
  return { columns: keep.map((k) => k.name), rows, rowNumbers };
}

/** A file as a grid, with the file row number of its first row. */
interface Grid {
  matrix: unknown[][];
  firstRow: number;
}

function readWorkbook(bytes: Uint8Array): Grid {
  const workbook = XLSX.read(bytes, { type: 'array', dense: true });
  // As before, only the first worksheet is used
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet?.['!ref']) return { matrix: [], firstRow: 1 };
  // raw: false keeps cells as they are displayed in Excel (e.g. dates as "2/1/10");
  // blankrows: true keeps every row in place, so indexes map onto the sheet's row numbers
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '', blankrows: true });
  return { matrix, firstRow: XLSX.utils.decode_range(sheet['!ref']).s.r + 1 };
}

function readDelimited(bytes: Uint8Array): Grid {
  // Empty lines are kept (and dropped later) so that each record's index is its line in the file
  const result = Papa.parse<string[]>(decodeText(bytes), { skipEmptyLines: false });
  return { matrix: result.data, firstRow: 1 };
}

export function parseBytes(name: string, bytes: Uint8Array): Dataset {
  const { matrix, firstRow } = detectFormat(bytes) === 'csv' ? readDelimited(bytes) : readWorkbook(bytes);
  const { columns, rows, rowNumbers } = recordsFromMatrix(matrix, firstRow);
  const dataset = buildDataset(name, rows, columns, rowNumbers);
  if (columns.length === 0 || dataset.items.length === 0) {
    throw new Error('No data found. The first row should hold column names, and each row after it becomes one item.');
  }
  return dataset;
}
