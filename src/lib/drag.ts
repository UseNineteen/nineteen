/**
 * Pointer dragging, shared by the legend, the row labels and the tags list. A press becomes a
 * drag once the pointer has moved a few pixels (so plain clicks still click); the container
 * then captures the pointer so the drag goes on when it leaves the list, and release or
 * cancel ends it. The component wires the three events and decides what a drag means.
 */

export interface DragMove<T> {
  /** What was pressed (an index, a key…) */
  pressed: T;
  event: PointerEvent;
  /** Movement since the press, in px */
  dx: number;
  dy: number;
}

export interface DragHandlers<T> {
  /** The press has moved far enough to count as a drag */
  onstart?: (move: DragMove<T>) => void;
  onmove: (move: DragMove<T>) => void;
  /** The pointer was released or cancelled; `dragged` is false for a plain click */
  onend: (move: DragMove<T>, dragged: boolean) => void;
}

/** Pixels of movement before a press counts as a drag */
const THRESHOLD = 4;

interface Pressed<T> {
  data: T;
  x: number;
  y: number;
  id: number;
}

export class PointerDrag<T> {
  #handlers: DragHandlers<T>;
  #pressed: Pressed<T> | null = null;
  #dragging = false;

  constructor(handlers: DragHandlers<T>) {
    this.#handlers = handlers;
  }

  /** Whether a drag (not just a press) is under way */
  get active(): boolean {
    return this.#dragging;
  }

  /** Call from the item's pointerdown; only the primary button starts a drag. */
  press(data: T, event: PointerEvent): void {
    if (event.button !== 0) return;
    this.#pressed = { data, x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  /** Call from the container's pointermove. */
  move(container: HTMLElement | undefined, event: PointerEvent): void {
    const pressed = this.#pressed;
    if (!pressed || event.pointerId !== pressed.id) return;
    const move = this.#move(pressed, event);
    if (!this.#dragging) {
      if (Math.hypot(move.dx, move.dy) < THRESHOLD) return;
      this.#dragging = true;
      try {
        container?.setPointerCapture(event.pointerId);
      } catch {
        // The pointer is already gone; the drag still works while it stays over the container
      }
      this.#handlers.onstart?.(move);
    }
    this.#handlers.onmove(move);
  }

  /** Call from the container's pointerup and pointercancel. */
  release(event: PointerEvent): void {
    const pressed = this.#pressed;
    if (!pressed || event.pointerId !== pressed.id) return;
    const dragged = this.#dragging;
    this.#pressed = null;
    this.#dragging = false;
    this.#handlers.onend(this.#move(pressed, event), dragged);
  }

  #move(pressed: Pressed<T>, event: PointerEvent): DragMove<T> {
    return { pressed: pressed.data, event, dx: event.clientX - pressed.x, dy: event.clientY - pressed.y };
  }
}

/** The gap (0…n) between vertically stacked elements that is closest to `clientY`. */
export function gapAt(elements: Iterable<HTMLElement>, clientY: number): number {
  const list = [...elements];
  const index = list.findIndex((el) => {
    const r = el.getBoundingClientRect();
    return clientY < r.top + r.height / 2;
  });
  return index === -1 ? list.length : index;
}
