import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type { Dataset } from './data';

/**
 * "Download spreadsheet / CSV": the current dataset, including any columns
 * added in Nineteen (such as AI auto-coding), written in the browser.
 */

const PLAIN_NUMBER = /^-?(?:\d+|\d*\.\d+)$/;

/** Header row + data rows. Plain numbers become real numbers so Excel doesn't flag them as text. */
export function tableOf(dataset: Dataset): (string | number)[][] {
  return [
    dataset.columns,
    ...dataset.items.map((item) =>
      dataset.columns.map((column) => {
        const value = item.raw[column] ?? '';
        const trimmed = value.trim();
        return PLAIN_NUMBER.test(trimmed) && !/^0\d/.test(trimmed) ? Number(trimmed) : value;
      }),
    ),
  ];
}

/** Excel sheet names: at most 31 characters, none of : \ / ? * [ ] */
export function sheetName(fileName: string): string {
  const stem = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[:\\/?*[\]]/g, ' ')
    .trim();
  return (stem || 'Data').slice(0, 31);
}

export function toXlsx(dataset: Dataset): Uint8Array {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(tableOf(dataset)), sheetName(dataset.name));
  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true }));
}

/** UTF-8 with a byte-order mark, so Excel opens accented characters correctly. */
export function toCsv(dataset: Dataset): string {
  return '﻿' + Papa.unparse(tableOf(dataset));
}
