/**
 * Scene-side glue of the soft maze reveal (MAZER-VIS-040), kept out of MenuScene.ts (Wave 5C hot file): the scene
 * owns one `MazeRevealDriver`, calls `update` once per frame next to the lifecycle stage, asks `resolveBoardReveal`
 * for the board layer and `resolveMarkerAlpha` for the start / goal markers. All timing is
 * mazeRevealTimeline.ts; this file only maps the scene's lifecycle fields onto it.
 *
 * Pure apart from the typed-array scratch buffers: no Phaser, DOM or wall-clock dependency.
 */
import { MazeRevealMaskBuilder } from './boardRevealMask';
import type { BoardTileReveal } from './boardTileLayer';
import {
  resolveMarkerRevealAlpha,
  resolveMazeRevealFrame,
  resolveReducedBoardFade,
  type MazeRevealFrame
} from './mazeRevealTimeline';

export type MazeRevealLifecyclePhase = 'idle' | 'building' | 'settled' | 'deconstructing' | string;

export interface MazeRevealClock {
  readonly phase: MazeRevealLifecyclePhase;
  /** When the intro (build) clock started, or null. */
  readonly introStartedAtMs: number | null;
  /** When the deconstruct clock started, or null. */
  readonly deconstructStartedAtMs: number | null;
  readonly time: number;
  readonly tileCount: number;
  readonly reducedMotion: boolean;
}

export const resolveMazeRevealFrameForClock = (clock: MazeRevealClock): MazeRevealFrame | null => {
  if (clock.phase === 'building' && clock.introStartedAtMs !== null) {
    return resolveMazeRevealFrame('build', clock.time - clock.introStartedAtMs, clock.tileCount, clock.reducedMotion);
  }
  if (clock.phase === 'deconstructing' && clock.deconstructStartedAtMs !== null) {
    return resolveMazeRevealFrame('deconstruct', clock.time - clock.deconstructStartedAtMs, clock.tileCount, clock.reducedMotion);
  }
  return null;
};

/**
 * Alpha multiplier for the start / goal markers. Settled or deconstructing: 1 (the deconstruct has its own fade).
 * Building, full motion: 0 until the beams leave, then eased in over the beam flight. Building, reduced motion:
 * 0, as before (the cast appears with the 200 ms crossfade ending).
 */
export const resolveMazeMarkerAlpha = (clock: MazeRevealClock): number => {
  if (clock.phase !== 'building') {
    return 1;
  }
  if (clock.reducedMotion || clock.introStartedAtMs === null) {
    return 0;
  }
  return resolveMarkerRevealAlpha(clock.tileCount, clock.time - clock.introStartedAtMs);
};

/** Reduced motion: the board layer's crossfade alpha (and the lifecycle direction), or null outside the 200 ms. */
export const resolveReducedBoardFadeForClock = (clock: MazeRevealClock): number | null => {
  if (clock.phase === 'building' && clock.introStartedAtMs !== null) {
    return resolveReducedBoardFade('build', clock.time - clock.introStartedAtMs, clock.tileCount, clock.reducedMotion);
  }
  if (clock.phase === 'deconstructing' && clock.deconstructStartedAtMs !== null) {
    return resolveReducedBoardFade('deconstruct', clock.time - clock.deconstructStartedAtMs, clock.tileCount, clock.reducedMotion);
  }
  return null;
};

export class MazeRevealDriver {
  private frame: MazeRevealFrame | null = null;
  private fade: number | null = null;

  /** Alpha of the whole board layer: 1 except during the reduced-motion crossfade. */
  get boardAlpha(): number {
    return this.fade ?? 1;
  }

  /** True while the reduced-motion crossfade shows the full board (the hard tile limit would hide it). */
  get crossfading(): boolean {
    return this.fade !== null;
  }
  private readonly mask = new MazeRevealMaskBuilder();

  get current(): MazeRevealFrame | null {
    return this.frame;
  }

  /**
   * Re-resolves the frame for this instant; true when the scene must redraw the board and its dynamic layer
   * (the soft frame changed, or the markers are mid-fade).
   */
  update(clock: MazeRevealClock): boolean {
    const next = resolveMazeRevealFrameForClock(clock);
    const changed = (next?.key ?? null) !== (this.frame?.key ?? null);
    this.frame = next;
    const nextFade = resolveReducedBoardFadeForClock(clock);
    const fadeChanged = nextFade !== this.fade;
    this.fade = nextFade;
    const markerAlpha = resolveMazeMarkerAlpha(clock);
    return changed || fadeChanged || (clock.phase === 'building' && markerAlpha > 0 && markerAlpha < 1);
  }

  /** The soft reveal for the board layer, or null when the board is not in one (use the hard / all paths). */
  resolveBoardReveal(
    ranks: Int32Array | null,
    owners: Uint8Array | null,
    cols: number,
    rows: number
  ): BoardTileReveal | null {
    const frame = this.frame;
    if (frame === null || ranks === null || ranks.length !== cols * rows) {
      return null;
    }
    return {
      kind: 'soft',
      key: frame.key,
      dockAlpha: frame.dockAlpha,
      fillMask: (alpha) => this.mask.fill(alpha, frame, ranks, owners, cols, rows)
    };
  }
}
