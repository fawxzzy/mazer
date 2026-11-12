import { describe, expect, test } from 'vitest';
import { buildContinuousTrailPath } from '../../src/render/navigationCoreTrail';
import { resolvePlayerMarkerCenter } from '../../src/render/playerMarker';
import { buildDeviceSnappedTrailPath, createDeviceSnappedTrailProjector } from '../../src/render/trailDeviceSnap';

/**
 * MAZER-VIS-025: the trail's cells and live head go through the player marker's own device-snapped centres, so the head
 * is exactly on the marker's centre (before, the linear projection could be up to half a device pixel away).
 */
const TILES = [7.04, 14.72, 18, 25.44];
const DPRS = [1, 2, 2.625, 2.75, 3];

describe('trail device snap', () => {
  test('a head at the marker cell is at the marker centre exactly, resting or mid-glide', () => {
    for (const tile of TILES) {
      for (const dpr of DPRS) {
        const project = createDeviceSnappedTrailProjector(tile, dpr, 12, 8);
        for (const p of [{ x: 0, y: 0 }, { x: 3, y: 7 }, { x: 11, y: 20 }, { x: 4.37, y: 9 }, { x: 5, y: 9.62 }]) {
          const marker = resolvePlayerMarkerCenter(p.x, p.y, tile, dpr, 12, 8);
          const head = project(p);
          expect(head.x).toBe(marker.x);
          expect(head.y).toBe(marker.y);
        }
      }
    }
  });

  test('the old linear projection was off the marker by up to half a device pixel (what the card fixed)', () => {
    let worst = 0;
    for (const tile of TILES) {
      for (const dpr of DPRS) {
        for (let cell = 0; cell < 40; cell += 1) {
          const linear = 12 + ((cell + 0.5) * tile);
          const marker = resolvePlayerMarkerCenter(cell, 0, tile, dpr, 12, 0);
          worst = Math.max(worst, Math.abs(linear - marker.x) * dpr);
        }
      }
    }
    expect(worst).toBeGreaterThan(0.25);
    expect(worst).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  test('buildDeviceSnappedTrailPath ends on the marker centres (untrimmed) and equals the linear path when snapping is a no-op', () => {
    const tile = 14.72;
    const dpr = 2.625;
    const geometry = buildDeviceSnappedTrailPath({
      gridPath: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
      originX: 4, originY: 6, tileSize: tile, devicePixelRatio: dpr, cornerRadiusRatio: 0.3, playerTrimRatio: 0
    });
    const first = geometry.vertices[0]!;
    const last = geometry.vertices[geometry.vertices.length - 1]!;
    const marker = resolvePlayerMarkerCenter(3, 1, tile, dpr, 4, 6);
    expect(first.x).toBe(resolvePlayerMarkerCenter(1, 1, tile, dpr, 4, 6).x);
    expect(last.x).toBe(marker.x);
    expect(last.y).toBe(marker.y);
    // tile 16, dpr 1: every centre is already whole, so snapped and linear paths coincide
    const a = buildDeviceSnappedTrailPath({
      gridPath: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
      originX: 3, originY: 5, tileSize: 16, devicePixelRatio: 1, cornerRadiusRatio: 0.3, playerTrimRatio: 0.3
    });
    const b = buildContinuousTrailPath({
      gridPath: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
      originX: 3, originY: 5, tileSize: 16, cornerRadiusRatio: 0.3, playerTrimRatio: 0.3
    });
    expect(a.vertices).toEqual(b.vertices);
  });
});
