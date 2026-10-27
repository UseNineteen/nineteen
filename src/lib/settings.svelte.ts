/**
 * Display settings (the Settings dialog). Like API keys, they live in memory
 * unless the user ticks "Remember settings on this device", which stores them
 * in this browser's localStorage. No cookies.
 */

import type { BoxLimits } from './layout';
import { DEFAULT_MODEL, isModelId, type ModelId } from './semantic/models';

const STORAGE_KEY = 'nineteen:settings';

export const BOX_LIMITS = { min: 2, max: 100 } as const;

export const DEFAULTS = {
  classic: false,
  stretchByDefault: false,
  minWidth: 4,
  maxWidth: 40,
  minHeight: 4,
  maxHeight: 40,
  meaningModel: DEFAULT_MODEL,
} as const;

export interface DisplaySettings extends BoxLimits {
  /** Classic Nineteen: rows split by color at most, without the Columns choice, tagging, finding by meaning or the AI tools */
  classic: boolean;
  stretchByDefault: boolean;
  /** The sentence-embedding model "Find by meaning" uses */
  meaningModel: ModelId;
}

/** Settings remembered before width and height had separate limits */
interface LegacyStored {
  minBox?: number;
  maxBox?: number;
}

export type LimitField = keyof BoxLimits;

function sanitizeBox(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(BOX_LIMITS.max, Math.max(BOX_LIMITS.min, n));
}

class AppSettings implements BoxLimits {
  /** Newly opened files start in "Stretch to fit" (saved from the current view when Settings is saved) */
  stretchByDefault = $state<boolean>(DEFAULTS.stretchByDefault);
  /** Classic Nineteen: rows (split by color at most), no tagging, no AI tools */
  classic = $state<boolean>(DEFAULTS.classic);
  /** Box size limits in screen pixels (apply to fitting and zooming; square boxes respect both) */
  minWidth = $state<number>(DEFAULTS.minWidth);
  maxWidth = $state<number>(DEFAULTS.maxWidth);
  minHeight = $state<number>(DEFAULTS.minHeight);
  maxHeight = $state<number>(DEFAULTS.maxHeight);
  meaningModel = $state<ModelId>(DEFAULTS.meaningModel);
  remember = $state(false);

  constructor() {
    try {
      const text = localStorage.getItem(STORAGE_KEY);
      if (!text) return;
      const stored = JSON.parse(text) as Partial<DisplaySettings> & LegacyStored;
      this.stretchByDefault = stored.stretchByDefault === true;
      this.classic = stored.classic === true;
      // Older saved settings had one smallest/largest size for both sides
      this.minWidth = sanitizeBox(stored.minWidth ?? stored.minBox, DEFAULTS.minWidth);
      this.maxWidth = sanitizeBox(stored.maxWidth ?? stored.maxBox, DEFAULTS.maxWidth);
      this.minHeight = sanitizeBox(stored.minHeight ?? stored.minBox, DEFAULTS.minHeight);
      this.maxHeight = sanitizeBox(stored.maxHeight ?? stored.maxBox, DEFAULTS.maxHeight);
      this.normalize('minWidth');
      this.normalize('minHeight');
      this.meaningModel = isModelId(stored.meaningModel) ? stored.meaningModel : DEFAULTS.meaningModel;
      this.remember = true;
    } catch {
      // Storage unavailable: settings live in memory only
    }
  }

  /** Keeps a dimension's limits valid (whole pixels, in range, smallest ≤ largest). */
  normalize(changed: LimitField): void {
    this.minWidth = sanitizeBox(this.minWidth, DEFAULTS.minWidth);
    this.maxWidth = sanitizeBox(this.maxWidth, DEFAULTS.maxWidth);
    this.minHeight = sanitizeBox(this.minHeight, DEFAULTS.minHeight);
    this.maxHeight = sanitizeBox(this.maxHeight, DEFAULTS.maxHeight);
    if (this.minWidth > this.maxWidth) {
      if (changed === 'minWidth') this.maxWidth = this.minWidth;
      else this.minWidth = this.maxWidth;
    }
    if (this.minHeight > this.maxHeight) {
      if (changed === 'minHeight') this.maxHeight = this.minHeight;
      else this.minHeight = this.maxHeight;
    }
  }

  snapshot(): DisplaySettings & { remember: boolean } {
    return {
      classic: this.classic,
      stretchByDefault: this.stretchByDefault,
      minWidth: this.minWidth,
      maxWidth: this.maxWidth,
      minHeight: this.minHeight,
      maxHeight: this.maxHeight,
      meaningModel: this.meaningModel,
      remember: this.remember,
    };
  }

  restore(saved: DisplaySettings & { remember: boolean }): void {
    this.classic = saved.classic;
    this.stretchByDefault = saved.stretchByDefault;
    this.minWidth = saved.minWidth;
    this.maxWidth = saved.maxWidth;
    this.minHeight = saved.minHeight;
    this.maxHeight = saved.maxHeight;
    this.meaningModel = saved.meaningModel;
    this.remember = saved.remember;
  }

  /** Settings back to their defaults (the "remember" choice is left as is). */
  resetDisplay(): void {
    this.classic = DEFAULTS.classic;
    this.stretchByDefault = DEFAULTS.stretchByDefault;
    this.minWidth = DEFAULTS.minWidth;
    this.maxWidth = DEFAULTS.maxWidth;
    this.minHeight = DEFAULTS.minHeight;
    this.maxHeight = DEFAULTS.maxHeight;
    this.meaningModel = DEFAULTS.meaningModel;
  }

  /** Writes to localStorage when "remember" is on, and removes any saved copy when it is off. */
  persist(): void {
    try {
      if (this.remember) {
        const { remember: _remember, ...stored } = this.snapshot();
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
