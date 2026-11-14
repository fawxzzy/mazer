/**
 * The thin Phaser side of uiEntrance.ts (MAZER-MOTION-011). Overlays are rebuilt wholesale from state, so the driver
 * never owns objects: each frame it is handed the live ones, applies the entrance (alpha and a vertical offset) as a
 * pure function of elapsed time, and on the last frame puts every object back EXACTLY at rest. A rebuild mid-entrance
 * simply hands over new objects and the same elapsed time, so nothing restarts.
 *
 * Offsets are applied as deltas (y += new - previous) and the alpha baseline is re-read whenever another writer changed
 * it, so this composes with code that moves or fades the same object. Graphics sit at y 0 and draw in absolute
 * coordinates: they are the panel and enter with row 0.
 */
import {
  assignUiEntranceRows,
  resolveUiEntrancePlan,
  resolveUiEntranceRowFrame,
  resolveUiEntranceTotalMs,
  type UiEntrancePlan
} from './uiEntrance';

export interface UiEntranceTarget {
  alpha: number;
  y: number;
  type?: string;
}

interface Applied {
  baseAlpha: number;
  alpha: number;
  dy: number;
}

export class UiEntranceDriver {
  private plan: UiEntrancePlan | null = null;
  private startedAtMs = 0;
  private readonly applied = new WeakMap<UiEntranceTarget, Applied>();
  private lastTargets: UiEntranceTarget[] = [];

  get active(): boolean {
    return this.plan !== null;
  }

  begin(nowMs: number, reducedMotion: boolean): void {
    this.settle(this.lastTargets);
    this.plan = resolveUiEntrancePlan(reducedMotion);
    this.startedAtMs = nowMs;
    this.lastTargets = [];
  }

  cancel(): void {
    this.settle(this.lastTargets);
    this.plan = null;
    this.lastTargets = [];
  }

  update(nowMs: number, targets: readonly UiEntranceTarget[]): void {
    const plan = this.plan;
    if (!plan) {
      return;
    }
    const live = [...new Set(targets)];
    this.lastTargets = live;
    const movable = live.filter((target) => target.type !== 'Graphics');
    const { rows, rowCount } = assignUiEntranceRows(
      movable.map((target) => target.y - (this.applied.get(target)?.dy ?? 0))
    );
    const elapsed = nowMs - this.startedAtMs;
    const panel = resolveUiEntranceRowFrame(plan, 0, rowCount, elapsed);
    for (const target of live) {
      if (target.type === 'Graphics') {
        this.apply(target, panel.alpha, panel.offsetY);
      }
    }
    movable.forEach((target, i) => {
      const frame = resolveUiEntranceRowFrame(plan, rows[i], rowCount, elapsed);
      this.apply(target, frame.alpha, frame.offsetY);
    });
    if (elapsed >= resolveUiEntranceTotalMs(plan, rowCount)) {
      this.settle(live);
      this.plan = null;
      this.lastTargets = [];
    }
  }

  private apply(target: UiEntranceTarget, alpha: number, offsetY: number): void {
    const state = this.applied.get(target);
    const baseAlpha = state && target.alpha === state.alpha ? state.baseAlpha : target.alpha;
    const previousDy = state?.dy ?? 0;
    target.alpha = baseAlpha * alpha;
    target.y += offsetY - previousDy;
    this.applied.set(target, { baseAlpha, alpha: target.alpha, dy: offsetY });
  }

  private settle(targets: readonly UiEntranceTarget[]): void {
    for (const target of targets) {
      const state = this.applied.get(target);
      if (!state) {
        continue;
      }
      if (target.alpha === state.alpha) {
        target.alpha = state.baseAlpha;
      }
      target.y -= state.dy;
      this.applied.delete(target);
    }
  }
}
