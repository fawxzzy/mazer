/**
 * MAZER-PERF-009: the FIRST maze of a session (boot straight into play, `?previewLevel=N`, the
 * Play Mazer shortcut, the launch right after the signed-out hand-off returns) is built in the
 * Web Worker too, so no frame is blocked by generating it.
 *
 * PERF-008 moved level-start and goal-reset generation off the main thread by building the next
 * maze while the menu idles. A boot straight into play has no idle time: the scene created the
 * play maze synchronously in its first update frame (100 to 900 ms at 4x CPU). This module is
 * the small state machine for the alternative:
 *
 *   1. the scene starts the play-start build in the worker as early as the inputs are known
 *      (MenuScene.create, after progression and settings are loaded, in parallel with the menu
 *      placeholder and the first frames) and only when the sign-in gate is not locked: the
 *      signed-out hand-off already ran before Phaser existed, so a launch that is about to
 *      redirect never reaches the scene and never starts a worker;
 *   2. the direct-to-play start waits for the worker result while the shared app loader cover
 *      stays up (the loader only shows after 150 ms, so a quick build is never visible), then
 *      starts play, which takes the parked maze;
 *   3. correctness never depends on the worker: no Worker, `?mazeWorker=off`, a worker error, a
 *      cancelled build or a stall longer than LEGACY_BOOT_PLAY_MAZE_STALL_MS all end the wait and
 *      the start runs exactly the old synchronous path. A parked maze whose inputs changed in the
 *      meantime (the account's progression arrived late) is discarded by the existing job key
 *      check in `LegacyMazePrefetchSlot.take`, never used.
 *
 * Pure: no Phaser, no DOM, no clock of its own.
 */
import type { LegacyMazeBackgroundBuildStatus } from './legacyMazeGenerationJob';

/**
 * A worker that has produced nothing after this long is treated as stalled and the start falls
 * back to the synchronous build. Generous on purpose: cancelling a slow-but-working worker to
 * start over synchronously would cost more than waiting for it.
 */
export const LEGACY_BOOT_PLAY_MAZE_STALL_MS = 6000;

export interface LegacyBootPlayMazeHoldHost {
  /** True when a worker can be had at all (false: no Worker, `?mazeWorker=off`, construction error). */
  readonly available: boolean;
  /** Parks the play-start build; false when it could not be started. */
  start(): boolean;
  /** Status of the parked build, null when nothing is parked (taken, cleared or never started). */
  status(): LegacyMazeBackgroundBuildStatus | null;
}

export type LegacyBootPlayMazeHoldPhase = 'idle' | 'building' | 'released';

export class LegacyBootPlayMazeHold {
  private phaseValue: LegacyBootPlayMazeHoldPhase = 'idle';
  // Stamped by the first holds() call (the update clock), never by begin() (create runs on the scene clock).
  private waitStartedAtMs: number | null = null;

  public get phase(): LegacyBootPlayMazeHoldPhase {
    return this.phaseValue;
  }

  /** True while the direct-to-play start is being held for the worker. */
  public get waiting(): boolean {
    return this.phaseValue === 'building';
  }

  /**
   * Starts the parked build now (MenuScene.create). Idempotent; the stall clock starts at the first holds(). Returns false when no build is
   * running, in which case the start simply takes the synchronous path.
   */
  public begin(host: LegacyBootPlayMazeHoldHost): boolean {
    if (this.phaseValue !== 'idle') {
      return this.phaseValue === 'building';
    }
    if (!host.available || !host.start()) {
      this.phaseValue = 'released';
      return false;
    }
    this.phaseValue = 'building';
    return true;
  }

  /**
   * One frame of the direct-to-play start. True while play must NOT start yet. A hold that was
   * never begun begins here (the direct-to-play start whose inputs only became known after create).
   */
  public holds(nowMs: number, host: LegacyBootPlayMazeHoldHost): boolean {
    if (this.phaseValue === 'idle') {
      this.begin(host);
    }
    if (this.phaseValue !== 'building') {
      return false;
    }
    this.waitStartedAtMs ??= nowMs;
    const status = host.status();
    if (status === 'pending') {
      if (nowMs - this.waitStartedAtMs >= LEGACY_BOOT_PLAY_MAZE_STALL_MS) {
        this.phaseValue = 'released';
        return false;
      }
      return true;
    }
    // 'ready': take it now. 'failed' / 'cancelled' / nothing parked: the synchronous path.
    this.phaseValue = 'released';
    return false;
  }

  /** Ends the hold without starting anything (play already started another way, or the hold is moot). */
  public release(): void {
    this.phaseValue = 'released';
  }

  /** Re-arms a later boot-style start (a new sign-in after a sign-out within one session). */
  public reset(): void {
    this.phaseValue = 'idle';
    this.waitStartedAtMs = null;
  }
}

/**
 * Whether the scene may start the early build at create time: a direct-to-play boot, the sign-in
 * gate not locked (a locked gate is a first-time signed-out visitor: the Welcome screen, no play
 * start, no reason to generate). The hand-off redirect for signed-out launches runs before Phaser
 * exists, so by the time a scene is asking, a redirecting launch is already gone.
 */
export const shouldStartLegacyBootPlayMazeEarly = (input: {
  authGateLocked: boolean;
  passwordRecoveryActive: boolean;
  pendingBootPlayStart: boolean;
}): boolean => (
  input.pendingBootPlayStart && !input.authGateLocked && !input.passwordRecoveryActive
);

/**
 * The first maze is only built in the worker when it is worth it. A straight corridor (level 1, the tutorial band)
 * costs 5 ms at 1x and about 25 to 35 ms at 4x on the main thread, while the worker path costs a worker start-up plus
 * one or two frames of waiting (measured: 0.8 to 2 s later at 4x), so a corridor start stays synchronous. Every other
 * level costs 165 to 960 ms at 4x on the main thread (levels 3 to 70), which is what the worker removes.
 */
export const isLegacyBootPlayMazeCheapToBuildInline = (profile: { readonly layout?: string | undefined } | null | undefined): boolean => (
  profile?.layout === 'corridor'
);
