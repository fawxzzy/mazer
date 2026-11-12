import { describe, expect, test } from 'vitest';
import { resolvePlayerMarkerCenter } from '../../src/render/playerMarker';
import { WALL_BUMP_DURATION_MS, resolveWallBumpNudge } from '../../src/render/playerMotionTiming';
import { buildDeviceSnappedTrailPath, type DeviceSnappedTrailPathOptions } from '../../src/render/trailDeviceSnap';

/**
 * MAZER-VIS-029: during a wall bump the marker is drawn nudged by `resolveWallBumpNudge`; the trail head follows the
 * same nudge so the two never separate. At rest (zero or no offset) the path is exactly what it was.
 */
const TILES = [7.04, 14.72, 25.44];
const DPRS = [1, 2, 2.625, 3];
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
// a corridor that turns, ending at (3, 2), plus a path with a step back
const PATH = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }];

const options = (tileSize: number, dpr: number, extra: Partial<DeviceSnappedTrailPathOptions> = {}): DeviceSnappedTrailPathOptions => ({
  gridPath: PATH, originX: 12, originY: 8, tileSize, devicePixelRatio: dpr, cornerRadiusRatio: 0.3, playerTrimRatio: 0, ...extra
});

describe('trail head follows the wall-bump nudge', () => {
  test('a zero, null or absent offset leaves the geometry exactly unchanged', () => {
    for (const tile of TILES) {
      for (const dpr of DPRS) {
        const base = buildDeviceSnappedTrailPath(options(tile, dpr));
        expect(buildDeviceSnappedTrailPath(options(tile, dpr, { headOffset: { x: 0, y: 0 } }))).toEqual(base);
        expect(buildDeviceSnappedTrailPath(options(tile, dpr, { headOffset: null }))).toEqual(base);
      }
    }
  });

  test('at every phase of every bump the untrimmed head is on the nudged marker centre', () => {
    for (const tile of TILES) {
      for (const dpr of DPRS) {
        for (const [dx, dy] of DIRECTIONS) {
          for (let t = 0; t < WALL_BUMP_DURATION_MS; t += 5) {
            const nudge = resolveWallBumpNudge(t, dx, dy, false);
            const geometry = buildDeviceSnappedTrailPath(options(tile, dpr, { headOffset: nudge }));
            const head = geometry.vertices[geometry.vertices.length - 1]!;
            // the marker is drawn from the board origin plus the nudge (MenuScene.fillLegacyPlayerMarkerTile)
            const marker = resolvePlayerMarkerCenter(3, 2, tile, dpr, 12 + nudge.x, 8 + nudge.y);
            expect(head.x).toBeCloseTo(marker.x, 9);
            expect(head.y).toBeCloseTo(marker.y, 9);
          }
        }
      }
    }
  });

  test('only the head moves: the tail of the trail stays on its tiles', () => {
    const tile = 25.44;
    const dpr = 2;
    const base = buildDeviceSnappedTrailPath(options(tile, dpr));
    const nudged = buildDeviceSnappedTrailPath(options(tile, dpr, { headOffset: { x: 0, y: 2 } }));
    expect(nudged.vertices[0]).toEqual(base.vertices[0]);
    const head = nudged.vertices[nudged.vertices.length - 1]!;
    const baseHead = base.vertices[base.vertices.length - 1]!;
    expect(head.x).toBe(baseHead.x);
    expect(head.y - baseHead.y).toBeCloseTo(2, 9);
  });

  test('with the player trim the trail end stays within the marker block during the bump (no sliver beside it)', () => {
    for (const tile of TILES) {
      for (const dpr of DPRS) {
        for (const [dx, dy] of DIRECTIONS) {
          for (let t = 0; t < WALL_BUMP_DURATION_MS; t += 5) {
            const nudge = resolveWallBumpNudge(t, dx, dy, false);
            const geometry = buildDeviceSnappedTrailPath(options(tile, dpr, { headOffset: nudge, playerTrimRatio: 0.3 }));
            const end = geometry.vertices[geometry.vertices.length - 1]!;
            const marker = resolvePlayerMarkerCenter(3, 2, tile, dpr, 12 + nudge.x, 8 + nudge.y);
            // the player block is 0.6 of the tile across: the trimmed end is inside it (up to the trim, 0.3 tile)
            expect(Math.hypot(end.x - marker.x, end.y - marker.y)).toBeLessThanOrEqual((tile * 0.3) + 1e-6);
          }
        }
      }
    }
  });

  test('reduced motion: the nudge is zero, so the head offset collapses to the resting path', () => {
    for (const [dx, dy] of DIRECTIONS) {
      for (let t = 0; t < WALL_BUMP_DURATION_MS; t += 10) {
        const nudge = resolveWallBumpNudge(t, dx, dy, true);
        expect(nudge).toEqual({ x: 0, y: 0 });
        expect(buildDeviceSnappedTrailPath(options(14.72, 2, { headOffset: nudge })))
          .toEqual(buildDeviceSnappedTrailPath(options(14.72, 2)));
      }
    }
  });

  test('a lone head point (single-tile path) moves with the nudge too', () => {
    const geometry = buildDeviceSnappedTrailPath(options(14.72, 2, {
      gridPath: [{ x: 1, y: 1 }, { x: 2, y: 1 }], headOffset: { x: 2, y: 0 }
    }));
    const marker = resolvePlayerMarkerCenter(2, 1, 14.72, 2, 14, 8);
    const head = geometry.vertices[geometry.vertices.length - 1]!;
    expect(head.x).toBeCloseTo(marker.x, 9);
    expect(head.y).toBeCloseTo(marker.y, 9);
  });
});
