/**
 * Display settings (the Settings dialog). Like API keys, they live in memory
 * unless the user ticks "Remember settings on this device", which stores them
 * in this browser's localStorage. No cookies.
 */

const STORAGE_KEY = 'nineteen:settings';

export const BOX_LIMITS = { min: 2, max: 100 } as const;

export const DEFAULTS = {
  stretchByDefault: false,
  labelAngle: 45 as LabelAngle,
  minBox: 4,
  maxBox: 40,
} as const;

/** How split-view value labels turn when their columns get too narrow */
export type LabelAngle = 45 | 90;

export interface DisplaySettings {
  stretchByDefault: boolean;
  labelAngle: LabelAngle;
  minBox: number;
  maxBox: number;
}

function sanitizeBox(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(BOX_LIMITS.max, Math.max(BOX_LIMITS.min, n));
}

class AppSettings {
  /** Newly opened files start in "Stretch to fit" (saved from the current view when Settings is saved) */
  stretchByDefault = $state<boolean>(DEFAULTS.stretchByDefault);
  labelAngle = $state<LabelAngle>(DEFAULTS.labelAngle);
  /** Smallest / largest box side in screen pixels (applies to fitting and zooming) */
  minBox = $state<number>(DEFAULTS.minBox);
  maxBox = $state<number>(DEFAULTS.maxBox);
  remember = $state(false);

  constructor() {
    try {
      const text = localStorage.getItem(STORAGE_KEY);
      if (!text) return;
      const stored = JSON.parse(text) as Partial<DisplaySettings>;
      this.stretchByDefault = stored.stretchByDefault === true;
      this.labelAngle = stored.labelAngle === 90 ? 90 : 45;
      this.minBox = sanitizeBox(stored.minBox, DEFAULTS.minBox);
      this.maxBox = Math.max(this.minBox, sanitizeBox(stored.maxBox, DEFAULTS.maxBox));
      this.remember = true;
    } catch {
      // Storage unavailable: settings live in memory only
    }
  }

  /** Keeps the box limits valid (whole pixels, in range, smallest ≤ largest). */
  normalize(changed: 'min' | 'max'): void {
    this.minBox = sanitizeBox(this.minBox, DEFAULTS.minBox);
    this.maxBox = sanitizeBox(this.maxBox, DEFAULTS.maxBox);
    if (this.minBox > this.maxBox) {
      if (changed === 'min') this.maxBox = this.minBox;
      else this.minBox = this.maxBox;
    }
  }

  snapshot(): DisplaySettings & { remember: boolean } {
    return { stretchByDefault: this.stretchByDefault, labelAngle: this.labelAngle, minBox: this.minBox, maxBox: this.maxBox, remember: this.remember };
  }

  restore(saved: DisplaySettings & { remember: boolean }): void {
    this.stretchByDefault = saved.stretchByDefault;
    this.labelAngle = saved.labelAngle;
    this.minBox = saved.minBox;
    this.maxBox = saved.maxBox;
    this.remember = saved.remember;
  }

  /** Display values back to their defaults (the "remember" choice is left as is). */
  resetDisplay(): void {
    this.stretchByDefault = DEFAULTS.stretchByDefault;
    this.labelAngle = DEFAULTS.labelAngle;
    this.minBox = DEFAULTS.minBox;
    this.maxBox = DEFAULTS.maxBox;
  }

  /** Writes to localStorage when "remember" is on, and removes any saved copy when it is off. */
  persist(): void {
    try {
      if (this.remember) {
        const stored: DisplaySettings = { stretchByDefault: this.stretchByDefault, labelAngle: this.labelAngle, minBox: this.minBox, maxBox: this.maxBox };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }
}

export const appSettings = new AppSettings();
