import { compareValues } from './values';
import { itemComparator, rollup, type DataItem, type Group } from './data';

/** Block geometry in unzoomed pixels (the original's 13px base font). */
export const GEOMETRY = {
  font: 13,
  size: 18,
  gutter: 3,
  row: 26,
} as const;

/** 'custom': a dragged order of values (rows, or legend entries); values it doesn't mention follow, A–Z */
export type SortBy = 'value' | 'count' | 'custom';
export type SortDirection = 'ascending' | 'descending';

export interface LayoutOptions {
  groupKey: string;
  colorKey: string;
  split: boolean;
  counts: boolean;
  sortBy: SortBy;
  sortDirection: SortDirection;
  /** Extra height for the split header row when its labels are turned (scale-1 px) */
  headerExtra?: number;
  /** Custom order of the color column's values (dragged in the legend) */
  legendOrder?: string[];
  /** Custom order of the group column's values, used when sorting rows by value */
  groupOrder?: string[];
  /**
   * Split view: extra label space after each band (scale-1 px, by legend position), so a few
   * narrow bands can be widened just enough for their value labels to wrap
   */
  bandPads?: number[];
}

/**
 * A position at scale 1. Horizontal space is in two parts that scale differently:
 * `x` is box space (scales with box width) and `cx` is count-label space
 * (scales with text size, i.e. box height), so counts never get squeezed
 * when boxes are stretched into narrow rectangles.
 */
export interface Point {
  x: number;
  cx: number;
  y: number;
}

export interface CountLabel extends Point {
  key: string;
  text: string;
}

/** Split view: the color value shown above each band, with the band's total when counts are on. */
export interface BandHeader extends Point {
  key: string;
  label: string;
  total: string | null;
  /** Extra label space given to this band (part of `cwidth`) */
  pad: number;
  /** Band width, in the same two parts as a Point */
  width: number;
  cwidth: number;
}

export interface Layout {
  /** Items in display order */
  items: DataItem[];
  /** Rows (unique values of the group column), in display order */
  groups: Group[];
  /** Legend entries (unique values of the color column), sorted by value */
  legend: Group[];
  positions: Map<number, Point>;
  counts: CountLabel[];
  /** Split view: value labels (and totals) in a header row above the bands */
  headers: BandHeader[];
  /** Rows before the first group (1 when there is a header row) */
  rowOffset: number;
  /** All rows, including the header row */
  rowCount: number;
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

export function computeLayout(all: DataItem[], options: LayoutOptions): Layout {
  const { groupKey, colorKey, split, counts } = options;
  const items = [...all].sort(itemComparator(groupKey, colorKey));
  const groups = sortGroups(rollup(items, groupKey), options.sortBy, options.sortDirection, options.groupOrder);
  const legend = sortGroups(rollup(items, colorKey), 'custom', 'ascending', options.legendOrder);

  const rowOffset = split ? 1 : 0;
  const headerExtra = split ? (options.headerExtra ?? 0) : 0;
  /** y for a group row: below the header row, which may be taller than a normal row */
  const groupY = (index: number) => rowY(index) + headerExtra;
  const rowIndex = new Map(groups.map((g, i) => [g.label, i + 1 + rowOffset]));
  const legendIndex = new Map(legend.map((g, i) => [g.label, i]));

  // Split mode: each color gets a band as wide as its largest group, one empty column, and a count slot
  const bandWidths = legend.map((entry) => {
    const perGroup = new Map<string, number>();
    for (const item of entry.items) perGroup.set(item.raw[groupKey], (perGroup.get(item.raw[groupKey]) ?? 0) + 1);
    return Math.max(...perGroup.values());
  });
  const bandOffsets: number[] = [];
  bandWidths.reduce((sum, width, i) => ((bandOffsets[i] = sum), sum + width + 1), 0);
  const totalSplitColumns = bandWidths.reduce((a, b) => a + b, 0) + legend.length;

  // Count labels get a slot wide enough for their longest number
  const largest = split ? Math.max(0, ...bandWidths) : Math.max(0, ...groups.map((g) => g.count));
  const slot = counts ? countSlot(String(largest).length) : 0;
  // Label-space offset of each band: count slots and any widening of earlier bands
  const pads = split ? legend.map((_, i) => Math.max(0, options.bandPads?.[i] ?? 0)) : [];
  const textBefore: number[] = [];
  pads.reduce((sum, pad, i) => ((textBefore[i] = sum), sum + slot + pad), 0);

  const positions = new Map<number, Point>();
  const seen = new Map<string, number>();
  for (const item of items) {
    const group = item.raw[groupKey];
    const band = legendIndex.get(item.raw[colorKey])!;
    const key = split ? `${band}\u0000${group}` : group;
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    positions.set(
      item.id,
      split
        ? { x: columnX(index + bandOffsets[band]), cx: textBefore[band], y: groupY(rowIndex.get(group)!) }
        : { x: columnX(index), cx: 0, y: groupY(rowIndex.get(group)!) },
    );
  }

  const countLabels: CountLabel[] = [];
  if (counts) {
    if (split) {
      for (const pair of rollup(items, colorKey, groupKey)) {
        const group = pair.items[0].raw[groupKey];
        const band = legendIndex.get(pair.label)!;
        countLabels.push({
          key: `${pair.label}\u0000${group}`,
          text: String(pair.count),
          x: columnX(bandOffsets[band] + pair.count),
          cx: textBefore[band],
          y: groupY(rowIndex.get(group)!),
        });
      }
    } else {
      for (const group of groups) {
        countLabels.push({
          key: group.label,
          text: String(group.count),
          x: columnX(group.count),
          cx: 0,
          y: groupY(rowIndex.get(group.label)!),
        });
      }
    }
  }

  const headers: BandHeader[] = split
    ? legend.map((entry, band) => ({
        key: entry.label,
        label: entry.label,
        total: counts ? String(entry.count) : null,
        x: columnX(bandOffsets[band]),
        cx: textBefore[band],
        y: rowY(1),
        width: (bandWidths[band] + 1) * (GEOMETRY.size + GEOMETRY.gutter) - GEOMETRY.gutter,
        cwidth: slot + pads[band],
        pad: pads[band],
      }))
    : [];

  const maxCount = Math.max(0, ...groups.map((g) => g.count));
  const columns = split ? totalSplitColumns : maxCount;

  return {
    items,
    groups,
    legend,
    positions,
    counts: countLabels,
    headers,
    rowOffset,
    rowCount: groups.length + rowOffset,
    headerExtra,
    rowWidth: columnX(columns) + 3 * GEOMETRY.size,
    countWidth: split ? legend.length * slot + pads.reduce((a, b) => a + b, 0) : slot,
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
