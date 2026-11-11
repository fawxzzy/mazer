/**
 * The grid path the play trail is drawn along, with its live head.
 *
 * The drawn trail is the shortest path over visited tiles from the trail's origin to the player's logical tile
 * (MenuScene.resolveLegacyPlayPerfectPathTrail). While a step glides, the head is drawn at the interpolated point
 * between the tile the player left (`previousTile`) and the tile it arrived on (the path's last point).
 *
 * Two cases, and they are not symmetric (owner, 2026-11-11: "player trail breaks and tweaks when travelling backwards
 * through the trail, back to the start and to a different direction"):
 *
 *  - Forward (previousTile is the path's own predecessor of the arrival tile): the arrival tile is the NEW end of the
 *    trail, so the head replaces it: [..., previous, head].
 *  - Backward (previousTile is NOT the path's predecessor: the player stepped back over its own trail, or came back
 *    into the start): the arrival tile is already inside the trail and the head is still beyond it, on the stretch
 *    being retraced. Replacing the arrival tile with the head skipped that tile, so the line ran from the tile before it
 *    straight to the head: it cut every corner at the arrival tile and snapped back when the glide ended. The tile
 *    must stay in the path and the head is appended after it: [..., tile, head].
 */
import type { LegacyPoint } from '../legacy-runtime/legacyMaze';

const samePoint = (a: LegacyPoint, b: LegacyPoint): boolean => a.x === b.x && a.y === b.y;
const copy = (point: LegacyPoint): LegacyPoint => ({ x: point.x, y: point.y });

export const resolveTrailGridPathWithHead = (
  perfectPath: readonly LegacyPoint[],
  previousTile: LegacyPoint | null,
  head: LegacyPoint
): LegacyPoint[] => {
  if (perfectPath.length === 0) {
    return [copy(head)];
  }
  const arrival = perfectPath[perfectPath.length - 1]!;
  const predecessor = perfectPath.length > 1 ? perfectPath[perfectPath.length - 2]! : null;
  const retracing = previousTile !== null
    && !samePoint(previousTile, arrival)
    && (predecessor === null || !samePoint(previousTile, predecessor));
  if (retracing || perfectPath.length === 1) {
    return [...perfectPath.map(copy), copy(head)];
  }
  return [...perfectPath.slice(0, -1).map(copy), copy(head)];
};
