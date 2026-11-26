/**
 * The drawn play trail is the path the player actually walked (owner, 2026-11-25: "rework it to stay stuck to the path
 * the player took and only unwrite itself if the player travels backwards along the path ... levels with ways to go in a
 * circle over top of ones own path could cause issues").
 *
 * Until this change the drawn trail was the SHORTEST path over the visited tiles from the trail's origin to the player.
 * On a maze with loops that path can jump: walk round a loop and the trail re-routes through the shorter side, wiping
 * tiles you did walk and drawing a line along tiles you walked long ago in another direction.
 *
 * Rule (one step at a time, over the scene's own move history `trail`, which appends one tile per accepted move):
 *   - a step onto the tile the drawn trail came from (the trail's second-last tile) UNWRITES the last tile (pop);
 *   - any other step WRITES the new tile (push), even onto a tile the trail already covers: crossing your own trail or
 *     closing a loop keeps both passes (the overlap is drawn twice, as walked);
 *   - a repeated tile (no move) changes nothing.
 * So only travelling backwards along the trail, tile by tile, unwrites it; visiting a tile again by another way never does.
 *
 * Everything that replaces the move history replaces the drawn trail with it, because this is a pure function of that
 * history: a new level, a reset, a restart, a pause-reset to the player's tile, a resumed run (its saved history), the
 * menu demo's walker (its own history; its dead-end backtracks pop as they would for a player) and preview levels.
 * Trail Fade keeps only the newest LEGACY_PLAY_TRAIL_FADE_TAIL moves of history, so the walked trail is built from those
 * moves alone: stepping back past the oldest kept move writes again instead of unwriting (that tile is gone from history).
 */
import type { LegacyPoint } from './legacyMaze';

const samePoint = (a: LegacyPoint, b: LegacyPoint): boolean => a.x === b.x && a.y === b.y;

/**
 * The walked trail for a move `history` (oldest first) ending at `player`. Never empty: with no history it is the
 * player's own tile. Returns new point objects; the inputs are not changed.
 */
export const resolveLegacyWalkedTrail = (history: readonly LegacyPoint[], player: LegacyPoint): LegacyPoint[] => {
  const walked: LegacyPoint[] = [];
  const step = (point: LegacyPoint): void => {
    const length = walked.length;
    if (length > 0 && samePoint(walked[length - 1]!, point)) {
      return;
    }
    if (length > 1 && samePoint(walked[length - 2]!, point)) {
      walked.pop();
      return;
    }
    walked.push({ x: point.x, y: point.y });
  };
  for (const point of history) {
    step(point);
  }
  // The history's last tile is the player's tile after every accepted move; stepping it once more is a no-op then, and
  // keeps the trail ending on the player if a caller ever moves the player without a history entry.
  step(player);
  return walked;
};
