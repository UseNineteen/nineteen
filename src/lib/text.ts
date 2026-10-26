/** "1 data item", "12 data items": how the UI counts rows. */
export function dataItems(n: number): string {
  return `${n} ${n === 1 ? 'data item' : 'data items'}`;
}
