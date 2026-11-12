/**
 * Memo for the trail's shortest route (MAZER-PERF-002).
 *
 * The drawn trail is the shortest path over the visited tiles from the trail's origin to the player's tile
 * (MenuScene.resolveLegacyPlayPerfectPathTrail). It was recomputed from scratch on every dynamic redraw: a fresh
 * boolean grid of the whole maze (25x51 on a phone, 45x27 on desktop), marking every trail point, then a breadth-first
 * search. The inputs only change when the player steps or the maze is replaced, and the scene replaces `trail` and
 * `player` with new objects each time (advanceLegacyPlayStep never mutates them), so identity is a sound cache key.
 *
 * `revision` increases on every recompute, so a caller can tell "same route as last time" without comparing points.
 * `computeCount` is the work counter the tests pin: N redraws of an unchanged route compute once.
 */
import type { LegacyPoint } from '../legacy-runtime/legacyMaze';

export class TrailPerfectPathCache {
  private maze: object | null = null;
  private trail: readonly LegacyPoint[] | null = null;
  private trailLength = -1;
  private player: LegacyPoint | null = null;
  private playerX = Number.NaN;
  private playerY = Number.NaN;
  private path: LegacyPoint[] | null = null;
  revision = 0;
  computeCount = 0;

  /** The cached route for these inputs, computing it with `compute` only when an input changed. */
  resolve(
    maze: object,
    trail: readonly LegacyPoint[],
    player: LegacyPoint,
    compute: () => LegacyPoint[]
  ): LegacyPoint[] {
    if (
      this.path !== null
      && this.maze === maze
      && this.trail === trail
      && this.trailLength === trail.length
      && this.player === player
      && this.playerX === player.x
      && this.playerY === player.y
    ) {
      return this.path;
    }
    this.path = compute();
    this.maze = maze;
    this.trail = trail;
    this.trailLength = trail.length;
    this.player = player;
    this.playerX = player.x;
    this.playerY = player.y;
    this.revision += 1;
    this.computeCount += 1;
    return this.path;
  }

  /** Forget the cached route (the next resolve recomputes). */
  invalidate(): void {
    this.path = null;
    this.maze = null;
    this.trail = null;
    this.player = null;
  }
}
