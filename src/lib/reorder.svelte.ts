import { gapAt, PointerDrag } from './drag';

/**
 * Reordering a vertical list by dragging one entry into a new position (legend entries, row
 * labels) or moving it one step with Alt and the arrow keys. The component renders from
 * `from`, `to` and `dy`, and calls `onmove` with the final positions.
 */
export class ListReorder {
  /** Index of the entry being dragged, and the gap (0…n) it would drop into */
  from = $state<number | null>(null);
  to = $state<number | null>(null);
  /** How far the dragged entry has moved (px), so it can follow the pointer */
  dy = $state(0);

  #options: ReorderOptions;
  #drag: PointerDrag<number>;

  constructor(options: ReorderOptions) {
    this.#options = options;
    this.#drag = new PointerDrag<number>({
      onstart: ({ pressed }) => (this.from = pressed),
      onmove: ({ event, dy }) => {
        this.to = gapAt(options.entries(), event.clientY);
        this.dy = dy;
      },
      onend: () => {
        const { from, to } = this;
        // Dropping into a gap after the dragged entry shifts by one once the entry is removed
        if (from !== null && to !== null) options.onmove(from, to > from ? to - 1 : to);
        this.from = this.to = null;
        this.dy = 0;
      },
    });
  }

  get active(): boolean {
    return this.from !== null;
  }

  /** A drop marker belongs above entry `i`… */
  dropBefore(i: number): boolean {
    return this.from !== null && this.to === i && this.to !== this.from && this.to !== this.from + 1;
  }

  /** …or below the last entry */
  dropAfter(i: number): boolean {
    const length = this.#options.length();
    return this.from !== null && this.to === length && i === length - 1 && this.from !== i;
  }

  pointerdown(index: number, event: PointerEvent): void {
    if (this.#options.enabled() && this.#options.length() > 1) this.#drag.press(index, event);
  }

  pointermove(event: PointerEvent): void {
    this.#drag.move(this.#options.container(), event);
  }

  pointerup(event: PointerEvent): void {
    this.#drag.release(event);
  }

  /** Alt+ArrowUp / Alt+ArrowDown moves the entry one step; returns the index it moved to. */
  keydown(index: number, event: KeyboardEvent): number | null {
    if (!this.#options.enabled() || !event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return null;
    event.preventDefault();
    const to = Math.max(0, Math.min(index + (event.key === 'ArrowUp' ? -1 : 1), this.#options.length() - 1));
    if (to !== index) this.#options.onmove(index, to);
    return to;
  }
}

export interface ReorderOptions {
  /** The list element (captures the pointer during a drag) */
  container: () => HTMLElement | undefined;
  /** The entries, top to bottom, as currently rendered */
  entries: () => Iterable<HTMLElement>;
  length: () => number;
  enabled: () => boolean;
  /** Move the entry at `from` so that it ends up at position `to` */
  onmove: (from: number, to: number) => void;
}
