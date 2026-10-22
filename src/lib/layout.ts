import { compareValues } from './values';
import { itemComparator, rollup, type DataItem, type Group } from './data';

/** Block geometry in unzoomed pixels (the original's 13px base font). */
export const GEOMETRY = {
  font: 13,
  size: 18,
  gutter: 3,
  row: 26,
} as const;

export type SortBy = 'value' | 'count';
export type SortDirection = 'ascending' | 'descending';

export interface LayoutOptions {
  groupKey: string;
  colorKey: string;
  split: boolean;
  counts: boolean;
  sortBy: SortBy;
  sortDirection: SortDirection;
}

export interface Point {
  x: number;
  y: number;
}

export interface CountLabel extends Point {
  key: string;
  text: string;
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
  /** Top of each row, keyed by group label */
  rowTops: Map<string, number>;
  rowWidth: number;
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

export function sortGroups(groups: Group[], sortBy: SortBy, direction: SortDirection): Group[] {
  const sign = direction === 'ascending' ? 1 : -1;
  return [...groups].sort((a, b) =>
    sign * (sortBy === 'count' ? a.count - b.count : compareValues(a.value, b.value)),
  );
}

export function computeLayout(all: DataItem[], options: LayoutOptions): Layout {
  const { groupKey, colorKey, split, counts } = options;
  const items = [...all].sort(itemComparator(groupKey, colorKey));
  const groups = sortGroups(rollup(items, groupKey), options.sortBy, options.sortDirection);
  const legend = sortGroups(rollup(items, colorKey), 'value', 'ascending');

  const rowIndex = new Map(groups.map((g, i) => [g.label, i + 1]));
  const legendIndex = new Map(legend.map((g, i) => [g.label, i]));
  const extra = counts ? 1 : 0;

  // Split mode: each color gets a band as wide as its largest group (+1 slot for its count)
  const bandWidths = legend.map((entry) => {
    const perGroup = new Map<string, number>();
    for (const item of entry.items) perGroup.set(item.raw[groupKey], (perGroup.get(item.raw[groupKey]) ?? 0) + 1);
    return Math.max(...perGroup.values()) + extra;
  });
  const bandOffsets: number[] = [];
  bandWidths.reduce((sum, width, i) => ((bandOffsets[i] = sum + i), sum + width), 0);
  const totalSplitColumns = bandWidths.reduce((a, b) => a + b, 0) + legend.length;

  const positions = new Map<number, Point>();
  const seen = new Map<string, number>();
  for (const item of items) {
    const group = item.raw[groupKey];
    const color = item.raw[colorKey];
    const slot = split ? `${legendIndex.get(color)}\u0000${group}` : group;
    const index = seen.get(slot) ?? 0;
    seen.set(slot, index + 1);
    const column = split ? index + bandOffsets[legendIndex.get(color)!] : index;
    positions.set(item.id, { x: columnX(column), y: rowY(rowIndex.get(group)!) });
  }

  const countLabels: CountLabel[] = [];
  if (counts) {
    if (split) {
      for (const pair of rollup(items, colorKey, groupKey)) {
        const group = pair.items[0].raw[groupKey];
        const column = bandOffsets[legendIndex.get(pair.label)!] + pair.count;
        countLabels.push({ key: `${pair.label}\u0000${group}`, text: String(pair.count), x: columnX(column), y: rowY(rowIndex.get(group)!) });
      }
    } else {
      for (const group of groups) {
        countLabels.push({ key: group.label, text: String(group.count), x: columnX(group.count), y: rowY(rowIndex.get(group.label)!) });
      }
    }
  }

  const maxCount = Math.max(0, ...groups.map((g) => g.count));
  const columns = split ? totalSplitColumns : maxCount;
  const rowTops = new Map(groups.map((g, i) => [g.label, rowTop(i + 1)]));

  return {
    items,
    groups,
    legend,
    positions,
    counts: countLabels,
    rowTops,
    rowWidth: columnX(columns) + 3 * GEOMETRY.size,
  };
}
