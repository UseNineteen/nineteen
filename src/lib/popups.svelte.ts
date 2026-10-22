/**
 * Viewer popups, ported from the original popup view:
 * hovering a block shows its row; clicking the block pins ("floats") the
 * popup so it stays open and can be dragged, resized and stacked with others.
 * Clicking the block again un-pins it.
 */

export const POPUP = { width: 340, height: 450, hideDelay: 50 } as const;

export interface PopupState {
  key: number;
  itemId: number;
  left: number;
  top: number;
  right: boolean;
  bottom: boolean;
  floating: boolean;
  z: number;
}

export class Popups {
  list = $state<PopupState[]>([]);
  #next = 1;
  #z = 1;
  #timers = new Map<number, ReturnType<typeof setTimeout>>();

  find(itemId: number): PopupState | undefined {
    return this.list.find((p) => p.itemId === itemId);
  }

  isFloating(itemId: number): boolean {
    return this.find(itemId)?.floating ?? false;
  }

  show(itemId: number, anchor: DOMRect): void {
    const existing = this.find(itemId);
    if (existing) {
      this.cancelHide(existing.key);
      return;
    }
    const x = anchor.left;
    const right = x + POPUP.width > window.innerWidth && x - POPUP.width > 0;
    const bottom = anchor.bottom + POPUP.height > window.innerHeight && anchor.top - POPUP.height > 0;
    // The arrow sits 30px in from the popup's edge, pointing at the block's center
    const center = anchor.left + anchor.width / 2;
    this.list.push({
      key: this.#next++,
      itemId,
      left: right ? center + 30 - POPUP.width : center - 30,
      top: bottom ? anchor.top - 5 - POPUP.height : anchor.bottom + 5,
      right,
      bottom,
      floating: false,
      z: ++this.#z,
    });
  }

  /** Hide a non-pinned popup shortly, unless the pointer moves into it first. */
  scheduleHide(itemId: number): void {
    const popup = this.find(itemId);
    if (!popup || popup.floating) return;
    this.cancelHide(popup.key);
    this.#timers.set(
      popup.key,
      setTimeout(() => this.close(popup.key), POPUP.hideDelay),
    );
  }

  cancelHide(key: number): void {
    clearTimeout(this.#timers.get(key));
    this.#timers.delete(key);
  }

  toggleFloating(itemId: number): void {
    const popup = this.find(itemId);
    if (!popup) return;
    popup.floating = !popup.floating;
    this.cancelHide(popup.key);
    this.bringToFront(popup.key);
  }

  bringToFront(key: number): void {
    const popup = this.list.find((p) => p.key === key);
    if (popup) popup.z = ++this.#z;
  }

  move(key: number, dx: number, dy: number): void {
    const popup = this.list.find((p) => p.key === key);
    if (!popup) return;
    popup.left += dx;
    popup.top += dy;
  }

  close(key: number): void {
    this.cancelHide(key);
    this.list = this.list.filter((p) => p.key !== key);
  }

  clear(): void {
    for (const key of this.#timers.keys()) this.cancelHide(key);
    this.list = [];
  }
}
