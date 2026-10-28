import { compareValues } from './values';
import { itemComparator, rollup, type DataItem, type Group } from './data';

/** Block geometry in unzoomed pixels (the original's 13px base font). */
export const GEOMETRY = {
  font: 13,
  size: 18,
  gutter: 3,
  row: 26,
  /** Empty box columns between one band and the next */
  bandGap: 1.5,
} as const;

/**
 * Legend geometry in px, shared with the stylesheet: the legend sets these as CSS custom
 * properties (--legend-*), and uses them to line its entries up with the rows.
 */
export const LEGEND = {
  /** The collapse toggle, and its top and bottom margin */
  toggle: 20,
  toggleMargin: 5,
  /** Each entry's line height, and the gaps above and below it */
  entryLine: 14,
  entryGapTop: 6,
  entryGapBottom: 8,
  /** An entry: the swatch, its gap to the label, the gap before a count, and the legend's side padding */
  swatch: 14,
  swatchGap: 10,
  countGap: 5,
  padding: 10,
  /** Extra room after the longest entry, before the row labels */
  paddingRight: 14,
  /** The legend is as wide as its longest entry, within these */
  minWidth: 132,
  maxWidth: 280,
} as const;

/**
 * Legend width for its entries, from the widest one (swatch, gap and text, measured by the
 * caller in the legend's font) plus the padding on each side, kept within the min and max.
 */
export function legendWidth(widestEntry: number): number {
  return Math.round(Math.min(LEGEND.maxWidth, Math.max(LEGEND.minWidth, widestEntry + LEGEND.padding + LEGEND.paddingRight)));
}

/** Vertical distance from one legend entry to the next */
export const LEGEND_PITCH = LEGEND.entryLine + LEGEND.entryGapTop + LEGEND.entryGapBottom;

/** 'custom': a dragged order of values (rows, or legend entries); values it doesn't mention follow, A–Z */
export type SortBy = 'value' | 'count' | 'custom';

/** What the count labels show: nothing, counts, or each count as a share of its row or of its column */
export type CountsMode = 'none' | 'count' | 'row' | 'column';

/** A count as a whole percentage of a base: "<1%" below one, "0%" for none */
export function percent(count: number, base: number): string {
  if (!base || count === 0) return '0%';
  const value = (100 * count) / base;
  return value < 1 ? '<1%' : `${Math.round(value)}%`;
}
export type SortDirection = 'ascending' | 'descending';

export interface LayoutOptions {
  /** Rows: one per value of this column; null shows no rows (the boxes wrap into a grid inside each column band) */
  rowKey: string | null;
  /** Column bands: one per value of this column; null for rows only. At least one of the two is set. */
  columnKey: string | null;
  colorKey: string;
  /** Column % needs column bands: without them it shows counts */
  counts: CountsMode;
  sortBy: SortBy;
  sortDirection: SortDirection;
  /** Extra height for the band header row when its labels are turned (scale-1 px) */
  headerExtra?: number;
  /** Custom order of the color column's values (dragged in the legend) */
  legendOrder?: string[];
  /** Custom order of the row column's values, used when sorting rows by value */
  rowOrder?: string[];
  /** Custom order of the column column's values (bands follow it) */
  columnOrder?: string[];
  /**
   * Extra label space after each band (scale-1 px, by band position), so a few narrow bands can
   * be widened just enough for their value labels to wrap
   */
  bandPads?: number[];
}

export interface Point {
  x: number;
  cx: number;
  y: number;
}

export interface CountLabel extends Point {
  key: string;
  text: string;
}

/** The column value shown above each band, with the band's total when counts are on. */
export interface BandHeader extends Point {
  key: string;
  label: string;
  total: string | null;
  /** Extra label space given to this band (part of `cwidth`) */
  pad: number;
  /** Band width, in the same two parts as a Point */
  width: number;
  cwidth: number;
  /** The band's boxes across (its width without the gap after it) */
  boxes: number;
}

export interface Layout {
  /** Items in display order */
  items: DataItem[];
  /** Rows (unique values of the row column), in display order; empty without a row column */
  groups: Group[];
  /** Column bands (unique values of the column column), in display order; empty without one */
  bands: Group[];
  /** Legend entries (unique values of the color column), sorted by value */
  legend: Group[];
  positions: Map<number, Point>;
  counts: CountLabel[];
  /** Value labels (and totals) in a header row above the bands */
  headers: BandHeader[];
  /** Rows before the first group (1 when there is a header row) */
  rowOffset: number;
  /** All rows, including the header row and, without a row column, the rows the grid wraps onto */
  rowCount: number;
  /** Rows of boxes (the striped rows): the groups, or the rows the grid wraps onto */
  stripes: number;
  /** Extra height of the header row (turned labels), included in the group rows' y */
  headerExtra: number;
  /** Row width in box space, and in count-label space (count slots plus any band widening) */
  rowWidth: number;
  countWidth: number;
  /** The part of `countWidth` that is band widening */
  padWidth: number;
}

export function columnX(index: number): number {
  return index * (GEOMETRY.size + GEOMETRY.gutter) + GEOMETRY.gutter;
}

/** Block y for a 1-based row index (kept identical to the original's arithmetic). */
export function rowY(index: number): number {
  const { row, size, gutter } = GEOMETRY;
  const offset = (row - size) / gutter / 2 + (row - size - gutter);
  return index * row - size - offset;
}

export function rowTop(index: number): number {
  return (index - 1) * GEOMETRY.row;
}

/** Space for a count label at scale 1: left margin, digits (~8px each at 13px), and breathing room. */
export function countSlot(digits: number): number {
  return 9 + Math.max(1, digits) * 8;
}

/**
 * Sorts groups by count, by value (the values' natural order), or in a custom order
 * (values the order doesn't mention follow, in their natural order).
 */
export function sortGroups(groups: Group[], sortBy: SortBy, direction: SortDirection, order?: string[]): Group[] {
  // A custom order is shown as given
  const sign = direction === 'ascending' || sortBy === 'custom' ? 1 : -1;
  const rank = sortBy === 'custom' && order?.length ? new Map(order.map((label, i) => [label, i])) : null;
  const byValue = (a: Group, b: Group) => {
    if (rank) {
      const ra = rank.get(a.label) ?? Infinity;
      const rb = rank.get(b.label) ?? Infinity;
      if (ra !== rb) return ra === Infinity ? 1 : rb === Infinity ? -1 : ra - rb;
    }
    return compareValues(a.value, b.value);
  };
  return [...groups].sort((a, b) => sign * (sortBy === 'count' ? a.count - b.count : byValue(a, b)));
}

/** Without a row column, boxes wrap into a grid this many boxes wide in the largest band (its square root) */
export function gridWidth(largestBand: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(largestBand)));
}

export function computeLayout(all: DataItem[], options: LayoutOptions): Layout {
  const { rowKey, columnKey, colorKey } = options;
  const split = columnKey !== null;
  const counts: CountsMode = options.counts === 'column' && !split ? 'count' : options.counts;
  const showCounts = counts !== 'none';
  const keys = [rowKey, columnKey, colorKey].filter((k): k is string => k !== null);
  const items = [...all].sort(itemComparator(...keys));
  const groups = rowKey ? sortGroups(rollup(items, rowKey), options.sortBy, options.sortDirection, options.rowOrder) : [];
  const legend = sortGroups(rollup(items, colorKey), 'custom', 'ascending', options.legendOrder);
  // Bands keep their values' (or dragged) order; without rows, the sort buttons order them instead
  const bands = split
    ? rowKey
      ? sortGroups(rollup(items, columnKey), 'custom', 'ascending', options.columnOrder)
      : sortGroups(rollup(items, columnKey), options.sortBy, options.sortDirection, options.columnOrder)
    : [];

  const rowOffset = split ? 1 : 0;
  const headerExtra = split ? (options.headerExtra ?? 0) : 0;
  /** y for a row: below the header row, which may be taller than a normal row */
  const groupY = (index: number) => rowY(index) + headerExtra;
  const rowIndex = new Map(groups.map((g, i) => [g.label, i + 1 + rowOffset]));
  const bandIndex = new Map(bands.map((g, i) => [g.label, i]));

  // Each band is as wide as its largest cell, plus one empty column and a count slot. Without
  // rows, a band's boxes wrap into a grid: as wide as the largest band's square root, so the
  // columns of every band line up, and no wider than the band needs.
  const grid = rowKey ? 0 : gridWidth(Math.max(0, ...bands.map((b) => b.count)));
  const bandWidths = bands.map((band) => {
    if (!rowKey) return Math.min(grid, band.count);
    const perGroup = new Map<string, number>();
    for (const item of band.items) perGroup.set(item.raw[rowKey], (perGroup.get(item.raw[rowKey]) ?? 0) + 1);
    return Math.max(...perGroup.values());
  });
  const gridRows = rowKey ? 0 : Math.max(0, ...bands.map((b) => Math.ceil(b.count / grid)));
  const bandOffsets: number[] = [];
  bandWidths.reduce((sum, width, i) => ((bandOffsets[i] = sum), sum + width + GEOMETRY.bandGap), 0);
  const totalSplitColumns = bandWidths.reduce((a, b) => a + b, 0) + bands.length * GEOMETRY.bandGap;

  // Count labels get a slot wide enough for their longest number (without rows, the band totals say it all)
  const largest = split ? Math.max(0, ...bandWidths) : Math.max(0, ...groups.map((g) => g.count));
  const slot = showCounts && rowKey ? countSlot(counts === 'count' ? String(largest).length : '100%'.length) : 0;
  // Label-space offset of each band: count slots and any widening of earlier bands
  const pads = split ? bands.map((_, i) => Math.max(0, options.bandPads?.[i] ?? 0)) : [];
  const textBefore: number[] = [];
  pads.reduce((sum, pad, i) => ((textBefore[i] = sum), sum + slot + pad), 0);

  const positions = new Map<number, Point>();
  const seen = new Map<string, number>();
  for (const item of items) {
    const row = rowKey ? item.raw[rowKey] : '';
    const band = split ? bandIndex.get(item.raw[columnKey])! : 0;
    const key = `${band}\u0000${row}`;
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    let point: Point;
    if (!split) point = { x: columnX(index), cx: 0, y: groupY(rowIndex.get(row)!) };
    else if (rowKey) point = { x: columnX(index + bandOffsets[band]), cx: textBefore[band], y: groupY(rowIndex.get(row)!) };
    else {
      point = {
        x: columnX(bandOffsets[band] + (index % grid)),
        cx: textBefore[band],
        y: groupY(1 + rowOffset + Math.floor(index / grid)),
      };
    }
    positions.set(item.id, point);
  }

  const countLabels: CountLabel[] = [];
  if (showCounts && rowKey) {
    const groupCount = new Map(groups.map((g) => [g.label, g.count]));
    if (split) {
      for (const pair of rollup(items, columnKey, rowKey)) {
        const row = pair.items[0].raw[rowKey];
        const band = bandIndex.get(pair.label)!;
        countLabels.push({
          key: `${pair.label}\u0000${row}`,
          text:
            counts === 'row'
              ? percent(pair.count, groupCount.get(row) ?? 0)
              : counts === 'column'
                ? percent(pair.count, bands[band].count)
                : String(pair.count),
          x: columnX(bandOffsets[band] + pair.count),
          cx: textBefore[band],
          y: groupY(rowIndex.get(row)!),
        });
      }
    } else {
      for (const group of groups) {
        countLabels.push({
          key: group.label,
          // Without columns, "row %" is each row's share of all data items
          text: counts === 'row' ? percent(group.count, items.length) : String(group.count),
          x: columnX(group.count),
          cx: 0,
          y: groupY(rowIndex.get(group.label)!),
        });
      }
    }
  }

  const headers: BandHeader[] = bands.map((band, i) => ({
    key: band.label,
    label: band.label,
    total: showCounts ? String(band.count) : null,
    x: columnX(bandOffsets[i]),
    cx: textBefore[i],
    y: rowY(1),
    width: (bandWidths[i] + 1) * (GEOMETRY.size + GEOMETRY.gutter) - GEOMETRY.gutter,
    cwidth: slot + pads[i],
    pad: pads[i],
    boxes: bandWidths[i],
  }));

  const maxCount = Math.max(0, ...groups.map((g) => g.count));
  const columns = split ? totalSplitColumns : maxCount;
  const stripes = rowKey ? groups.length : gridRows;

  return {
    items,
    groups,
    bands,
    legend,
    positions,
    counts: countLabels,
    headers,
    rowOffset,
    rowCount: stripes + rowOffset,
    stripes,
    headerExtra,
    rowWidth: columnX(columns) + 3 * GEOMETRY.size,
    countWidth: split ? bands.length * slot + pads.reduce((a, b) => a + b, 0) : slot,
    padWidth: pads.reduce((a, b) => a + b, 0),
  };
}

// ---------------------------------------------------------------------------
// Box scaling (Settings → Box size)
// ---------------------------------------------------------------------------

/** Horizontal and vertical scale relative to the original 18px boxes. */
export interface Scale {
  x: number;
  y: number;
}

/** Box size limits in screen pixels, separately for width and height */
export interface BoxLimits {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

export interface ScaleInput extends BoxLimits {
  /** Fit everything inside the visible area */
  fit: boolean;
  /** Boxes stay square (otherwise width and height scale separately) */
  square: boolean;
  /** Manual zoom, used when not fitting */
  zoom: number;
  viewWidth: number;
  viewHeight: number;
  /** Label column width at scale 1 */
  labelWidth: number;
  /** Row width at scale 1 in box space, and in count-label space (from computeLayout) */
  rowWidth: number;
  countWidth: number;
  rows: number;
  /** Extra content height at scale 1 (a taller header row) */
  extraHeight?: number;
}

interface Range {
  min: number;
  max: number;
}

function range(min: number, max: number): Range {
  const lo = Math.max(1, min) / GEOMETRY.size;
  return { min: lo, max: Math.max(lo, max / GEOMETRY.size) };
}

/** Allowed scales for box width and box height. */
export function axisBounds(limits: BoxLimits): { x: Range; y: Range } {
  return { x: range(limits.minWidth, limits.maxWidth), y: range(limits.minHeight, limits.maxHeight) };
}

/** The zoom range for square boxes: both sides must respect both the width and height limits. */
export function zoomBounds(limits: BoxLimits): Range {
  const { x, y } = axisBounds(limits);
  const min = Math.max(x.min, y.min);
  return { min, max: Math.max(min, Math.min(x.max, y.max)) };
}

/** Height needed for all rows at scale 1, including the bottom margin. */
export function contentHeight(rows: number): number {
  return rows * GEOMETRY.row + 20;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const clampTo = (r: Range, n: number) => round(Math.min(r.max, Math.max(r.min, n)));

export function boxScale(input: ScaleInput): Scale {
  const square = zoomBounds(input);
  const canFit = input.fit && input.viewWidth > 0 && input.viewHeight > 0 && input.rows > 0 && input.rowWidth > 0;
  if (!canFit) {
    const z = clampTo(square, input.zoom);
    return { x: z, y: z };
  }
  const vertical = input.viewHeight / (contentHeight(input.rows) + (input.extraHeight ?? 0));
  if (input.square) {
    const s = clampTo(square, Math.min(vertical, input.viewWidth / (input.labelWidth + input.countWidth + input.rowWidth)));
    return { x: s, y: s };
  }
  // Rectangles: rows use the height; boxes get whatever width the labels and counts (which follow the text size) leave
  const { x: xRange, y: yRange } = axisBounds(input);
  const textWidth = input.labelWidth + input.countWidth;
  let y = clampTo(yRange, vertical);
  let x = (input.viewWidth - textWidth * y) / input.rowWidth;
  if (x < xRange.min && textWidth > 0) {
    // Boxes would get too narrow: shrink the height (and with it the label and count text) so the width still fits
    x = xRange.min;
    y = clampTo(yRange, Math.min(y, (input.viewWidth - input.rowWidth * x) / textWidth));
  }
  return { x: clampTo(xRange, x), y };
}
