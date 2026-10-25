/**
 * Cell value interpretation, ported from the original DataItem#parse.
 *
 * Every cell is kept as its original text for display, and also converted to
 * a "parsed" value used only for sorting: dates/times become timestamps,
 * numbers become numbers, numbered strings ("1. Hockey") become their number,
 * and everything else stays a string.
 */

export type Parsed = number | string;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[\sT](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,4}))?)?Z?)?$/;
const US = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?)?$/i;
const TIME = /^(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?$/i;
const NUMBERED = /^(\d+)[.:)]\s/;

function hour24(hour: number, meridiem: string | undefined): number {
  if (!meridiem) return hour;
  const pm = meridiem[0].toLowerCase() === 'p';
  return (hour % 12) + (pm ? 12 : 0);
}

function makeDate(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0): number | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const date = new Date(y, mo - 1, d, h, mi, s, ms);
  // Reject rollovers such as 2/31
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date.getTime();
}

/** Two-digit years follow moment.js: 69-99 → 1900s, 00-68 → 2000s. */
function fullYear(text: string): number {
  const year = parseInt(text, 10);
  if (text.length === 4) return year;
  return year > 68 ? 1900 + year : 2000 + year;
}

const ABBREVIATIONS: Record<string, string> = { tues: 'tuesday', thur: 'thursday', thurs: 'thursday', sept: 'september' };

/** Matches full names, 3-letter abbreviations ("Mon", "Jan."), and a few common 4-letter forms. */
function nameIndex(names: string[], value: string): number {
  const lower = value.toLowerCase().replace(/\.$/, '');
  const full = ABBREVIATIONS[lower] ?? lower;
  return names.findIndex((name) => name === full || (full.length === 3 && name.startsWith(full)));
}

/** Returns a sortable timestamp (or ordinal) if the text is a date/time, else null. */
export function parseDate(text: string): number | null {
  let m = ISO.exec(text);
  if (m) {
    return makeDate(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), +(m[7] ?? 0));
  }
  m = US.exec(text);
  if (m) {
    const h = m[4] === undefined ? 0 : hour24(+m[4], m[6]);
    return makeDate(fullYear(m[3]), +m[1], +m[2], h, +(m[5] ?? 0));
  }
  m = TIME.exec(text);
  if (m) {
    const h = hour24(+m[1], m[3]);
    if (h > 23 || +m[2] > 59) return null;
    return (h * 60 + +m[2]) * 60000;
  }
  const weekday = nameIndex(WEEKDAYS, text);
  if (weekday !== -1) return weekday;
  const month = nameIndex(MONTHS, text);
  if (month !== -1) return month;
  return null;
}

export function parseNumber(text: string): number | null {
  const stripped = text.replace(/,/g, '').trim();
  if (stripped === '') return null;
  const num = Number(stripped);
  return Number.isFinite(num) ? num : null;
}

export function parseValue(text: string): Parsed {
  const trimmed = text.trim();
  if (trimmed === '') return text;
  const date = parseDate(trimmed);
  if (date !== null) return date;
  const num = parseNumber(trimmed);
  if (num !== null) return num;
  if (NUMBERED.test(trimmed)) return parseFloat(trimmed);
  return text;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Orders parsed values: numbers (incl. dates) first in numeric order, then
 * strings in natural, case-insensitive order. Blank values sort last.
 */
export function compareValues(a: Parsed, b: Parsed): number {
  const aBlank = a === '';
  const bBlank = b === '';
  if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1;
  const aNum = typeof a === 'number';
  const bNum = typeof b === 'number';
  if (aNum && bNum) return a - b;
  if (aNum !== bNum) return aNum ? -1 : 1;
  return collator.compare(a as string, b as string) || (a < b ? -1 : a > b ? 1 : 0);
}
