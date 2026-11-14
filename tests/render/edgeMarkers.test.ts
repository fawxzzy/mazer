import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuPathTitleOrbitPose } from '../../src/legacy-runtime/legacyMenuTitle';
import {
  EDGE_MARKER_IDLE_ALPHA_MAX,
  EDGE_MARKER_IDLE_ALPHA_MIN,
  EDGE_MARKER_IDLE_PERIOD_MS,
  EDGE_MARKER_FLASH_MS,
  EDGE_MARKER_HALF_HEIGHT,
  EDGE_MARKER_MAX_EXTENT_PX,
  EDGE_MARKER_CORNER_CLEARANCE_PX,
  EDGE_MARKER_TIP_PAINT_PX,
  resolveEdgeCornerInset,
  resolveEdgeMarkerPaintedPolygon,
  EDGE_MIDPOINT_STATION_ID,
  EDGE_STATION_COUNT,
  drawEdgeMarker,
  drawEdgeMarkers,
  drawEdgeBeams,
  anchorStationToOuterTip,
  resolveEdgeInnerTip,
  resolveEdgeRingScales,
  resolveEdgeMarkerIdleAlpha,
  resolveEdgeStationNormalExtent,
  resolveEdgeRingFills,
  resolveEdgeMarkerStates,
  resolveEdgeMarkerVertices,
  resolveEdgeStationPosition,
  resolveEdgeStations,
  resolveOrbitingEdgeStation,
  resolveOrbitingEdgeStations,
  resolveEdgeBeamProgress,
  resolveEdgeBeams,
  resolveWrapEndStationIds,
  resolveWrapFlashStationIds,
  type EdgeGraphics
} from '../../src/render/edgeMarkers';
import { PLAYER_COLOR, resolveTrailPaletteBorderColor, sampleIridescentTrail } from '../../src/render/trailPalette';
import { boardMaterial } from '../../src/render/boardTileStyle';
import { cyberArcadeMaterial } from '../../src/render/cyberArcadeMaterial';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';
import {
  INTRO_BEAM_PULSE_MS,
  INTRO_BEAM_RETRACT_MS,
  INTRO_BEAM_STAGGER_MS,
  INTRO_BUILD_START_MS,
  OUTRO_HANDOFF_MS,
  OUTRO_LASER_MS,
  INTRO_RING_CHARGE_MS,
  OUTRO_RING_ORBIT_START_MS,
  INTRO_LASER_MS,
  OUTRO_TILES_START_MS,
  RING_ENERGY_FADE_MS,
  resolveIntro,
  resolveIntroDeconstruct,
  resolveIntroLaserEndMs,
  resolveIntroLaserStartMs,
  resolveIntroRevealEndMs,
  resolveOutroRemoveMs,
  resolveOutroTotalMs
} from '../../src/render/introTimeline';
import { resolveTeleportAnchorPoses } from '../../src/render/teleportAnchorPose';
import {
  EDGE_BEAM_COUNT,
  EDGE_BEAM_FLIGHT_MS,
  EDGE_BEAM_PULSE_MS,
  EDGE_BEAM_RETRACT_MS,
  EDGE_DIAMOND_REST_SCALE,
  resolveEdgeDiamondScale,
  resolveBeamHead,
  resolveBeamTimes,
  resolveDiamondDrainFromOutgoing,
  resolveDiamondFillFromIncoming
} from '../../src/render/edgeBeamTimeline';
import { BEAM_BLOOM_LAYERS, BEAM_BLOOM_OUTER_PX, BEAM_BODY_LAYERS, BEAM_HOT_MIX, BEAM_STREAM_MAX_DASHES, snapToDevice, snapWidthToDevice } from '../../src/render/edgeBeamArt';
import { MOTION_REDUCED_MS } from '../../src/render/motionScale';
import { mixPaletteRgb } from '../../src/render/trailPalette';

const HOT = mixPaletteRgb(PLAYER_COLOR, cyberArcadeMaterial.rail.white, BEAM_HOT_MIX);

/** True when `point` lies on an edge of the closed polygon (within a hair). */
const isOnPolygonEdge = (vertices: ReadonlyArray<{ x: number; y: number }>, point: { x: number; y: number }): boolean => (
  vertices.some((a, index) => {
    const b = vertices[(index + 1) % vertices.length] as { x: number; y: number };
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const cross = Math.abs(((b.x - a.x) * (point.y - a.y)) - ((b.y - a.y) * (point.x - a.x))) / length;
    const along = (((point.x - a.x) * (b.x - a.x)) + ((point.y - a.y) * (b.y - a.y))) / (length * length);
    return cross < 1e-6 && along >= -1e-9 && along <= 1 + 1e-9;
  })
);

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 720 },
  { width: 499, height: 958 }
] as const;

const MIRROR_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 1280, height: 720 }
] as const;

describe('edge marker stations', () => {
  test.each(VIEWPORTS)('all 8 kites rest fully inside a $width x $height viewport with the PAINTED outer tip touching the screen edge', (viewport) => {
    const stations = resolveEdgeStations(viewport);
    expect(stations).toHaveLength(EDGE_STATION_COUNT);
    for (const station of stations) {
      const painted = resolveEdgeMarkerPaintedPolygon(station);
      const bounds = {
        left: Math.min(...painted.map((vertex) => vertex.x)),
        right: Math.max(...painted.map((vertex) => vertex.x)),
        top: Math.min(...painted.map((vertex) => vertex.y)),
        bottom: Math.max(...painted.map((vertex) => vertex.y))
      };
      // Nothing clipped at rest (outline plus the stroke's miter join)...
      expect(bounds.left).toBeGreaterThanOrEqual(-1e-9);
      expect(bounds.top).toBeGreaterThanOrEqual(-1e-9);
      expect(bounds.right).toBeLessThanOrEqual(viewport.width + 1e-9);
      expect(bounds.bottom).toBeLessThanOrEqual(viewport.height + 1e-9);
      // ...and the outer tip touches the screen edge the station sits on (0 px gap, not past it).
      const gaps = {
        top: bounds.top,
        bottom: viewport.height - bounds.bottom,
        left: bounds.left,
        right: viewport.width - bounds.right
      };
      expect(gaps[station.side], `station ${station.id} gap to ${station.side}`).toBeCloseTo(0, 9);
      // Any orientation stays within the max extent of the centre.
      for (let degrees = 0; degrees < 360; degrees += 15) {
        for (const vertex of resolveEdgeMarkerPaintedPolygon({ ...station, inwardAngle: (degrees * Math.PI) / 180 })) {
          expect(Math.hypot(vertex.x - station.x, vertex.y - station.y)).toBeLessThanOrEqual(EDGE_MARKER_MAX_EXTENT_PX + 1e-9);
        }
      }
    }
    // A 1 px stroke joins with a miter: the tip paints 0.5 / sin(atan(7 / 12)) = ~0.99 px beyond its vertex.
    expect(EDGE_MARKER_TIP_PAINT_PX).toBeCloseTo(0.5 / Math.sin(Math.atan2(7, 12)), 9);
    expect(EDGE_MARKER_MAX_EXTENT_PX).toBeCloseTo(10 + EDGE_MARKER_TIP_PAINT_PX, 9);
    // Midpoint kites paint ~10.99 px from the centre toward their edge; 45 degree corner kites ~7.77 px.
    expect(resolveEdgeStationNormalExtent(1)).toBeCloseTo(10 + EDGE_MARKER_TIP_PAINT_PX, 9);
    expect(resolveEdgeStationNormalExtent(3)).toBeCloseTo(10 + EDGE_MARKER_TIP_PAINT_PX, 9);
    expect(resolveEdgeStationNormalExtent(0)).toBeCloseTo((10 + EDGE_MARKER_TIP_PAINT_PX) * Math.SQRT1_2, 9);
  });

  test('the painted polygon is the stroke\'s outer boundary: half a stroke outside every edge, miter at the vertices', () => {
    const station = { x: 100, y: 100, inwardAngle: Math.PI / 2 };
    const vertices = resolveEdgeMarkerVertices(station);
    const painted = resolveEdgeMarkerPaintedPolygon(station);
    expect(painted).toHaveLength(4);
    painted.forEach((point, index) => {
      const vertex = vertices[index] as { x: number; y: number };
      // every painted corner is outside its vertex by the miter length of that corner
      expect(Math.hypot(point.x - vertex.x, point.y - vertex.y)).toBeGreaterThan(0.5);
      expect(Math.hypot(point.x - vertex.x, point.y - vertex.y)).toBeLessThan(1.05);
    });
    // distance from a painted edge to the outline edge is half a stroke
    const distance = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number => (
      Math.abs(((b.x - a.x) * (a.y - c.y)) - ((a.x - c.x) * (b.y - a.y))) / Math.hypot(b.x - a.x, b.y - a.y)
    );
    for (let index = 0; index < 4; index += 1) {
      const a = vertices[index] as { x: number; y: number };
      const b = vertices[(index + 1) % 4] as { x: number; y: number };
      expect(distance(a, b, painted[index] as { x: number; y: number })).toBeCloseTo(0.5, 9);
      expect(distance(a, b, painted[(index + 1) % 4] as { x: number; y: number })).toBeCloseTo(0.5, 9);
    }
  });

  test.each(VIEWPORTS)('corner diamonds clear a rounded display corner of $width x $height: every painted point lies inside a rounded rectangle of the clearance radius', (viewport) => {
    const radius = EDGE_MARKER_CORNER_CLEARANCE_PX;
    const inside = (point: { x: number; y: number }): boolean => {
      const cx = point.x < radius ? radius : point.x > viewport.width - radius ? viewport.width - radius : point.x;
      const cy = point.y < radius ? radius : point.y > viewport.height - radius ? viewport.height - radius : point.y;
      return Math.hypot(point.x - cx, point.y - cy) <= radius + 1e-9;
    };
    for (const station of resolveEdgeStations(viewport)) {
      for (const point of resolveEdgeMarkerPaintedPolygon(station)) {
        expect(inside(point), `station ${station.id} point ${point.x.toFixed(2)},${point.y.toFixed(2)}`).toBe(true);
      }
    }
    // The corner station sits exactly the clearance from the screen corner (painted), along its edge.
    const corner = resolveEdgeStations(viewport)[0] as { x: number; y: number; inwardAngle: number };
    expect(Math.min(...resolveEdgeMarkerPaintedPolygon(corner).map((point) => point.x))).toBeCloseTo(radius, 9);
    expect(corner.x).toBeCloseTo(resolveEdgeCornerInset(), 9);
  });

  test('fixed positions: top row is inset / w/2 / w-inset (the corner diamonds clear a rounded corner) and the layout depends on the viewport size and the resolution ONLY', () => {
    const inset = resolveEdgeCornerInset();
    expect(inset).toBeCloseTo(EDGE_MARKER_CORNER_CLEARANCE_PX + ((10 + EDGE_MARKER_TIP_PAINT_PX) * Math.SQRT1_2), 9);
    const stations = resolveEdgeStations({ width: 390, height: 844 });
    expect(stations[0]?.x).toBeCloseTo(inset, 9);
    expect(stations[1]?.x).toBeCloseTo(195, 9);
    expect(stations[2]?.x).toBeCloseTo(390 - inset, 9);
    const extent = 10 + EDGE_MARKER_TIP_PAINT_PX;
    expect(stations[1]?.y).toBeCloseTo(extent, 9);
    expect(stations[5]?.y).toBeCloseTo(844 - extent, 9);
    expect(stations[3]?.x).toBeCloseTo(390 - extent, 9);
    expect(stations[7]?.x).toBeCloseTo(extent, 9);
    expect(stations[3]?.y).toBeCloseTo(422, 9);
    expect(stations[7]?.y).toBeCloseTo(422, 9);
    expect(resolveEdgeStations.length).toBe(1);
    const wide = resolveEdgeStations({ width: 1280, height: 720 });
    expect(wide[0]?.x).toBeCloseTo(inset, 9);
    expect(wide[1]?.x).toBeCloseTo(640, 9);
    expect(wide[2]?.x).toBeCloseTo(1280 - inset, 9);
    // The painted canvas ends at round(css * resolution) / resolution: at 2.63 (the 2.625 resolution rounded to hundredths) 390 css px
    // is a 1026 px backing store, i.e. 390.1141 px of world: the right midpoint's painted tip touches THAT edge.
    const dpr = resolveEdgeStations({ width: 390, height: 844 }, 2.63);
    expect((dpr[3] as { x: number }).x + extent).toBeCloseTo(1026 / 2.63, 9);
    expect((dpr[5] as { y: number }).y + extent).toBeCloseTo(2220 / 2.63, 9);
  });

  test.each(MIRROR_VIEWPORTS)('layout is mirror-symmetric at $width x $height in the menu AND play layouts (bottom row is the reference)', (viewport) => {
    for (const surface of ['menu', 'play'] as const) {
      // The scene feeds the stations only width/height, so the layout surface cannot move them.
      const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, surface, { menuActionMode: 'authenticated' });
      const stations = resolveEdgeStations({ width: layout.width, height: layout.height });
      const at = (id: number) => stations[id] as { x: number; y: number };
      // Vertical mirror: top row (0,1,2) <-> bottom row (6,5,4) share x and mirror y.
      for (const [topId, bottomId] of [[0, 6], [1, 5], [2, 4]] as const) {
        expect(at(topId).x, `x ${topId}/${bottomId}`).toBeCloseTo(at(bottomId).x, 9);
        expect(at(topId).y + at(bottomId).y, `y ${topId}/${bottomId}`).toBeCloseTo(layout.height, 9);
      }
      // Horizontal mirror: left (7) <-> right (3) share y and mirror x; both exactly mid-height.
      expect(at(7).y).toBeCloseTo(at(3).y, 9);
      expect(at(7).y).toBeCloseTo(layout.height / 2, 9);
      expect(at(7).x + at(3).x).toBeCloseTo(layout.width, 9);
      // The left and right corner columns mirror each other too.
      for (const [leftId, rightId] of [[0, 2], [6, 4]] as const) {
        expect(at(leftId).x + at(rightId).x).toBeCloseTo(layout.width, 9);
        expect(at(leftId).y).toBeCloseTo(at(rightId).y, 9);
      }
      // Top and bottom midpoints are exactly centred.
      expect(at(1).x).toBeCloseTo(layout.width / 2, 9);
      expect(at(5).x).toBeCloseTo(layout.width / 2, 9);
    }
  });

  test('the scene feeds the stations the viewport ONLY: no safe area, no header-control avoidance', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const start = source.indexOf('private resolveLegacyEdgeStations()');
    const body = source.slice(start, source.indexOf('\n  }', start));
    // The viewport size plus the canvas resolution (which only decides where the backing store ends): MAZER-VIS-043.
    expect(body).toContain('return resolveEdgeStations({ width: this.layout.width, height: this.layout.height }, resolveMazerCanvasResolution());');
    expect(body).not.toContain('safeArea');
    expect(body).not.toContain('resolveHeaderControlRects');
    const markers = readFileSync(resolve(process.cwd(), 'src/render/edgeMarkers.ts'), 'utf8');
    expect(markers).not.toContain('clearStationOfControls');
    expect(markers).not.toContain('resolveHeaderControlRects');
    expect(markers).not.toContain('safeArea');
  });


  test('kite is ~14 x 20 px', () => {
    const [tip, side, tail, otherSide] = resolveEdgeMarkerVertices({ x: 100, y: 100, inwardAngle: Math.PI / 2 });
    expect(Math.abs((tip?.y ?? 0) - (tail?.y ?? 0))).toBeCloseTo(20, 9);
    expect(Math.abs((side?.x ?? 0) - (otherSide?.x ?? 0))).toBeCloseTo(14, 9);
  });

  test('keeps the same 8 stations, ids and order the sigils/teleport anchors use', () => {
    for (const { width, height } of VIEWPORTS) {
      // teleportAnchorPose with the same inset: identical anchor positions per id.
      for (const inset of [2, 12, 22.627]) {
        const poses = resolveTeleportAnchorPoses({ width, height }, { x: width / 2, y: height / 2 }, 32, inset);
        poses.forEach((pose) => {
          const position = resolveEdgeStationPosition(pose.id, inset, width - inset, inset, height - inset);
          expect(position.x).toBeCloseTo(pose.anchorX, 9);
          expect(position.y).toBeCloseTo(pose.anchorY, 9);
        });
      }
      // The original settled sigil poses (inset 2): same perimeter points.
      const geometry = {
        bottom: height - 2,
        centerX: width / 2,
        centerY: height / 2,
        crownBottom: height - 2,
        crownHalf: 0,
        crownTop: 2,
        left: 2,
        right: width - 2,
        top: 2
      };
      for (let id = 0; id < 8; id += 1) {
        const sigil = resolveLegacyMenuPathTitleOrbitPose(geometry, id / 8);
        const position = resolveEdgeStationPosition(id as 0, 2, width - 2, 2, height - 2);
        expect(position.x).toBeCloseTo(sigil.x, 9);
        expect(position.y).toBeCloseTo(sigil.y, 9);
      }
    }
    const stations = resolveEdgeStations({ width: 390, height: 844 });
    expect(stations.map((station) => station.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // even ids are the corners, odd ids the edge midpoints
    expect(stations.map((station) => station.isCorner)).toEqual([true, false, true, false, true, false, true, false]);
  });

  test('every kite points inward (along the edge normal; diagonally at corners)', () => {
    for (const { width, height } of VIEWPORTS) {
      for (const station of resolveEdgeStations({ width, height })) {
        const towardCentre = { x: (width / 2) - station.x, y: (height / 2) - station.y };
        const dot = (Math.cos(station.inwardAngle) * towardCentre.x) + (Math.sin(station.inwardAngle) * towardCentre.y);
        expect(dot).toBeGreaterThan(0);
        if (!station.isCorner) {
          const normal = { top: [0, 1], right: [-1, 0], bottom: [0, -1], left: [1, 0] }[station.side];
          expect(Math.cos(station.inwardAngle)).toBeCloseTo(normal[0] ?? 0, 9);
          expect(Math.sin(station.inwardAngle)).toBeCloseTo(normal[1] ?? 0, 9);
        }
      }
    }
  });

});

describe('edge marker animation budget', () => {
  test('idle is one slow breathing alpha in [0.45, 0.6] with a 3.6 s period and no per-marker variation', () => {
    expect(EDGE_MARKER_IDLE_PERIOD_MS).toBe(3600);
    for (let ms = 0; ms <= 3 * EDGE_MARKER_IDLE_PERIOD_MS; ms += 25) {
      const alpha = resolveEdgeMarkerIdleAlpha(ms, false);
      expect(alpha).toBeGreaterThanOrEqual(EDGE_MARKER_IDLE_ALPHA_MIN - 1e-12);
      expect(alpha).toBeLessThanOrEqual(EDGE_MARKER_IDLE_ALPHA_MAX + 1e-12);
      expect(resolveEdgeMarkerIdleAlpha(ms + EDGE_MARKER_IDLE_PERIOD_MS, false)).toBeCloseTo(alpha, 9);
      const states = resolveEdgeMarkerStates({ reducedMotion: false, timeMs: ms });
      expect(new Set(states.map((state) => state.alpha)).size).toBe(1);
      expect(states.every((state) => !state.energized && state.flash === 0)).toBe(true);
    }
  });

  test('reduced motion: nothing moves, lights up or flashes (the border colour is the one thing that keeps shifting)', () => {
    const energized = new Set<number>([1, 3]);
    const flash = { ids: [1, 3], startedAtMs: 0 };
    const withoutColour = (states: ReturnType<typeof resolveEdgeMarkerStates>) => (
      states.map(({ borderColor: _borderColor, ...rest }) => rest)
    );
    const reference = withoutColour(resolveEdgeMarkerStates({ energizedIds: energized, flash, reducedMotion: true, timeMs: 0 }));
    for (let ms = 0; ms <= 8000; ms += 137) {
      const states = resolveEdgeMarkerStates({ energizedIds: energized, flash, reducedMotion: true, timeMs: ms });
      expect(withoutColour(states)).toEqual(reference);
      expect(states.every((state) => !state.energized && state.flash === 0)).toBe(true);
    }
  });

  test('energized markers use a stronger alpha; hidden ids are skipped by the renderer', () => {
    const states = resolveEdgeMarkerStates({
      energizedIds: new Set([7]),
      hiddenIds: new Set([3]),
      reducedMotion: false,
      timeMs: 500
    });
    expect(states[7]).toMatchObject({ energized: true });
    expect(states[7]?.alpha).toBeGreaterThan(EDGE_MARKER_IDLE_ALPHA_MAX);
    expect(states[3]?.hidden).toBe(true);
    const recorder = makeRecorder();
    drawEdgeMarkers(recorder, resolveEdgeStations({ width: 390, height: 844 }), states);
    // 7 visible markers: each strokes exactly one outline.
    expect(recorder.calls.filter((call) => call === 'strokePath')).toHaveLength(7);
  });
});

describe('wrap flash', () => {
  const maze = { width: 9, height: 9 };

  test('a wrapped step flashes the exit edge and the paired destination edge once (~120 ms)', () => {
    expect(resolveWrapFlashStationIds({ x: 0, y: 4 }, { x: 8, y: 4 }, maze)).toEqual({
      sourceId: EDGE_MIDPOINT_STATION_ID.left,
      destinationId: EDGE_MIDPOINT_STATION_ID.right
    });
    expect(resolveWrapFlashStationIds({ x: 8, y: 4 }, { x: 0, y: 4 }, maze)).toEqual({
      sourceId: EDGE_MIDPOINT_STATION_ID.right,
      destinationId: EDGE_MIDPOINT_STATION_ID.left
    });
    expect(resolveWrapFlashStationIds({ x: 4, y: 0 }, { x: 4, y: 8 }, maze)).toEqual({
      sourceId: EDGE_MIDPOINT_STATION_ID.top,
      destinationId: EDGE_MIDPOINT_STATION_ID.bottom
    });
    expect(resolveWrapFlashStationIds({ x: 4, y: 8 }, { x: 4, y: 0 }, maze)).toEqual({
      sourceId: EDGE_MIDPOINT_STATION_ID.bottom,
      destinationId: EDGE_MIDPOINT_STATION_ID.top
    });
  });

  test('ordinary steps never flash', () => {
    expect(resolveWrapFlashStationIds({ x: 3, y: 4 }, { x: 4, y: 4 }, maze)).toBeNull();
    expect(resolveWrapFlashStationIds({ x: 0, y: 4 }, { x: 0, y: 5 }, maze)).toBeNull();
    expect(resolveWrapFlashStationIds({ x: 2, y: 2 }, { x: 2, y: 2 }, maze)).toBeNull();
  });

  test('the flash is one-shot: bright at the trigger, gone after ~120 ms, never repeats', () => {
    const flash = { ids: [EDGE_MIDPOINT_STATION_ID.left, EDGE_MIDPOINT_STATION_ID.right], startedAtMs: 1000 };
    const at = (ms: number) => resolveEdgeMarkerStates({ flash, reducedMotion: false, timeMs: ms });
    expect(at(1000)[7]?.flash).toBe(1);
    expect(at(1000)[3]?.flash).toBe(1);
    expect(at(1000)[1]?.flash).toBe(0);
    expect(at(1000 + (EDGE_MARKER_FLASH_MS / 2))[7]?.flash).toBeCloseTo(0.5, 9);
    expect(at(1000 + EDGE_MARKER_FLASH_MS)[7]?.flash).toBe(0);
    expect(at(1000 + 5000)[7]?.flash).toBe(0);
    expect(at(999)[7]?.flash).toBe(0);
  });

  test('wrap ends light up on the edges that own docks', () => {
    const ends = resolveWrapEndStationIds(['0,4', '8,4', '4,0'], maze);
    expect([...ends].sort()).toEqual([EDGE_MIDPOINT_STATION_ID.left, EDGE_MIDPOINT_STATION_ID.right, EDGE_MIDPOINT_STATION_ID.top].sort());
    expect(resolveWrapEndStationIds([], maze).size).toBe(0);
  });
});

describe('depth (diamonds sit behind all UI)', () => {
  test('diamonds render BELOW the title, header icons, board and every UI element but above the backdrop', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const listStart = source.indexOf('this.boardZoomContainer.add([');
    const list = source.slice(listStart, source.indexOf(']);', listStart));
    const order = (name: string): number => list.indexOf(`this.${name}`);
    // First child of the container = lowest depth.
    expect(order('edgeMarkerGraphics')).toBeGreaterThanOrEqual(0);
    for (const above of ['boardStaticGraphics', 'boardPathGraphics', 'boardDynamicGraphics', 'headerSettingsIconImage', 'headerLeaderboardIconImage', 'titleGraphics']) {
      expect(order('edgeMarkerGraphics')).toBeLessThan(order(above));
    }
    // Above the starfield backdrop (created before the container) and below the
    // top-level HUD / overlay / level-announcer layers created after it.
    const created = (name: string): number => source.indexOf(`this.${name} = this.add.`);
    expect(created('backdropGraphics')).toBeLessThan(created('edgeMarkerGraphics'));
    expect(created('edgeMarkerGraphics')).toBeLessThan(created('hudGraphics'));
    expect(created('edgeMarkerGraphics')).toBeLessThan(created('overlayGraphics'));
    expect(created('edgeMarkerGraphics')).toBeLessThan(created('levelAnnouncerNumberGraphics'));
    // The markers draw ONLY into that low-depth graphics, never into titleGraphics.
    const drawMarkers = source.slice(source.indexOf('private drawLegacyEdgeMarkers('), source.indexOf('private resolveLegacyWrapEndStationIds('));
    expect(drawMarkers).toContain('this.edgeMarkerGraphics');
    expect(drawMarkers).not.toContain('this.titleGraphics');
  });
});

type EdgeStationLike = { x: number; y: number };

describe('one diamond system: no old diamond art anywhere in the scene', () => {
  const OLD_ART = [
    'MAZER_VFX_DIAMOND',
    'MAZER_VFX_TELEPORT_BEAM',
    'edge-diamond',
    'teleport-beam-iridescent',
    'mazerVfxEdgeDiamond',
    'mazerVfxTeleportBeam',
    'titleOrbitDiamondImages',
    'playerTransferBeamStripImages',
    'playerTransferBeamTargetCapImages',
    'gameplayTransferConduitCanvas',
    'drawLegacyMenuPathTitleDiamond',
    'drawLegacyMenuPathTitleOrbitSigils',
    'drawLegacyPlayerSpawnBurst',
    'renderGameplayTransferPresentation'
  ];

  test('MenuScene references no old diamond texture key, PNG path or sprite pool', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    for (const needle of OLD_ART) {
      expect(source, needle).not.toContain(needle);
    }
    // No image/sprite is ever created from a diamond/beam texture.
    expect(source).not.toMatch(/this\.add\.image\([^)]*(Diamond|DIAMOND|BEAM|Beam)/);
  });

  test('no src file (including the Wave 4D-B teleport modules) names the old diamond art', () => {
    // BootScene no longer preloads the PNGs (retired) and the two Wave 4D-B teleport
    // modules' comments now describe the procedural 8-diamond ring, so the former
    // allow-list is empty: any src file naming old diamond art fails.
    const root = process.cwd().replace(/\\/g, '/');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = `${dir}/${entry}`;
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry)) {
          files.push(full.replace(`${root}/`, ''));
        }
      }
    };
    walk(`${root}/src`);
    const offenders = files.filter((file) => {
      const text = readFileSync(`${root}/${file}`, 'utf8');
      return OLD_ART.some((needle) => text.includes(needle));
    });
    expect(offenders).toEqual([]);
  }, 120_000);

  test('BootScene preloads none of the retired diamond/beam art and the PNGs are gone', () => {
    const boot = readFileSync(resolve(process.cwd(), 'src/scenes/BootScene.ts'), 'utf8');
    for (const needle of OLD_ART) {
      expect(boot, needle).not.toContain(needle);
    }
    expect(boot).not.toContain('assets/vfx/diamonds');
    expect(existsSync(resolve(process.cwd(), 'public/assets/vfx/diamonds'))).toBe(false);
  });
});

describe('all-8 beams (arrival and departure)', () => {
  const stations = resolveEdgeStations({ width: 390, height: 844 });
  const focus = { x: 200, y: 400 };

  test('every one of the 8 diamonds fires, staggered by at most 60 ms, all landing together', () => {
    expect(INTRO_BEAM_STAGGER_MS).toBeLessThanOrEqual(60);
    const staggerFraction = INTRO_BEAM_STAGGER_MS / INTRO_LASER_MS;
    const firstLeaves = (index: number): number => {
      for (let step = 0; step <= 1000; step += 1) {
        if (resolveEdgeBeamProgress(step / 1000, index) > 0) {
          return step / 1000;
        }
      }
      return Number.POSITIVE_INFINITY;
    };
    expect(firstLeaves(0)).toBeLessThanOrEqual(0.001);
    expect(firstLeaves(7)).toBeLessThanOrEqual(staggerFraction + 0.002);
    for (let index = 0; index < 8; index += 1) {
      expect(resolveEdgeBeamProgress(0, index)).toBe(0);
      expect(resolveEdgeBeamProgress(1, index)).toBe(1);
      let previous = 0;
      for (let step = 0; step <= 100; step += 1) {
        const value = resolveEdgeBeamProgress(step / 100, index);
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
    }
    const mid = resolveEdgeBeams({ direction: 'inward', focus, laserProgress: 0.5, spawnPop: 0, stations });
    expect(mid.beams).toHaveLength(8);
    expect(mid.beams.every((beam) => beam.firing)).toBe(true);
    expect([...mid.firingIds].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  test('arrival: beams run diamond INNER TIP -> spawn tile; departure: player -> diamond inner tip (the mirror); the tip follows the diamond\'s CURRENT size', () => {
    const inward = resolveEdgeBeams({ direction: 'inward', focus, laserProgress: 0.5, spawnPop: 0, stations });
    const outward = resolveEdgeBeams({ direction: 'outward', focus, laserProgress: 0.5, spawnPop: 0, stations });
    stations.forEach((station, index) => {
      const clock = 200; // laserProgress 0.5 on the master laser clock
      const inScale = resolveEdgeDiamondScale('inward', clock, index);
      const outScale = resolveEdgeDiamondScale('outward', clock, index);
      const inContact = inward.beams[index]?.contact as { x: number; y: number };
      const outContact = outward.beams[index]?.contact as { x: number; y: number };
      // The diamond end of the path is the INNERMOST point of the diamond at its CURRENT size (it grows / shrinks about its OUTER tip,
      // so the inner tip moves), in both directions, not an outline-crossing point and not the centre.
      expect(inContact).toEqual(resolveEdgeInnerTip(station, inScale));
      expect(outContact).toEqual(resolveEdgeInnerTip(station, outScale));
      expect(outScale).toBeLessThan(1); // the departure diamond is still growing 200 ms in: the tip has NOT reached the full-size point yet
      const outer = resolveEdgeMarkerVertices(station, 1)[2] as { x: number; y: number };
      const vertices = resolveEdgeMarkerVertices(anchorStationToOuterTip(station, outScale), outScale);
      expect(vertices[2]?.x).toBeCloseTo(outer.x, 9);
      expect(vertices[2]?.y).toBeCloseTo(outer.y, 9);
      expect(outContact.x).toBeCloseTo((vertices[0] as { x: number }).x, 9);
      expect(outContact.y).toBeCloseTo((vertices[0] as { y: number }).y, 9);
      expect(inward.beams[index]?.from).toEqual(inContact);
      expect(inward.beams[index]?.to).toEqual(focus);
      expect(outward.beams[index]?.from).toEqual(focus);
      expect(outward.beams[index]?.to).toEqual(outContact);
      // At the instant of contact (departure) the diamond is exactly full: the head lands exactly on the full-size inner tip, no jump.
      const times = resolveBeamTimes(index);
      const landed = resolveEdgeBeams({ direction: 'outward', focus, laserProgress: 1, spawnPop: 0, stations, clockMs: times.contactMs }).beams[index] as { to: { x: number; y: number }; tip: { x: number; y: number } };
      const full = resolveEdgeMarkerVertices(station, 1)[0] as { x: number; y: number };
      expect(landed.to.x).toBeCloseTo(full.x, 9);
      expect(landed.to.y).toBeCloseTo(full.y, 9);
      expect(landed.tip.x).toBeCloseTo(full.x, 9);
      expect(landed.tip.y).toBeCloseTo(full.y, 9);
      // One frame earlier the target is already within a hair of it (continuous, not a jump).
      const before = resolveEdgeBeams({ direction: 'outward', focus, laserProgress: 1, spawnPop: 0, stations, clockMs: times.contactMs - 16 }).beams[index] as { to: { x: number; y: number } };
      expect(Math.hypot(before.to.x - full.x, before.to.y - full.y)).toBeLessThan(2);
    });
  });

  test('a pulse is on screen from the instant its head leaves until its tail has arrived, never before or after', () => {
    const before = resolveEdgeBeams({ direction: 'inward', focus, laserProgress: 0, spawnPop: 0, stations, clockMs: -1 });
    expect(before.firingIds.size).toBe(0);
    for (let index = 0; index < 8; index += 1) {
      const times = resolveBeamTimes(index);
      const at = (clockMs: number) => resolveEdgeBeams({ direction: 'outward', focus, laserProgress: 0, spawnPop: 0, stations, clockMs }).beams[index];
      expect(at(times.launchMs - 0.001)?.firing, `${index} before launch`).toBe(false);
      expect(at(times.launchMs + 1)?.firing, `${index} just after launch`).toBe(true);
      expect(at(times.tailArrivesMs - 1)?.firing, `${index} before the tail lands`).toBe(true);
      expect(at(times.tailArrivesMs + 0.001)?.firing, `${index} tail landed`).toBe(false);
    }
    const states = resolveEdgeMarkerStates({ energizedIds: new Set([2]), reducedMotion: false, timeMs: 0 });
    expect(states[2]?.alpha).toBeGreaterThan(states[1]?.alpha ?? 1);
  });

  test('inward beams end in a 6-sparkle poof around the spawn tile, only after all heads landed', () => {
    expect(resolveEdgeBeams({ direction: 'inward', focus, laserProgress: 0.9, spawnPop: 0.5, stations }).sparkles).toHaveLength(0);
    const poof = resolveEdgeBeams({ direction: 'inward', focus, laserProgress: 1, spawnPop: 0.5, stations });
    expect(poof.sparkles).toHaveLength(6);
    for (const sparkle of poof.sparkles) {
      expect(Math.hypot(sparkle.x - focus.x, sparkle.y - focus.y)).toBeCloseTo(9, 6);
    }
    expect(resolveEdgeBeams({ direction: 'inward', focus, laserProgress: 1, spawnPop: 1, stations }).sparkles).toHaveLength(0);
    expect(resolveEdgeBeams({ direction: 'outward', focus, laserProgress: 1, spawnPop: 0.5, stations }).sparkles).toHaveLength(0);
  });

  test('each pulse draws a bloom, a tapered gradient body, a head and a ripple, all in the player colour family (palette tokens only)', () => {
    const recorder = makeRecorder();
    // 150 ms into the laser: every head has left (the latest at 98 ms), every diamond is still draining (the earliest drain ends at 200 ms).
    drawEdgeBeams(recorder, { direction: 'inward', focus, laserProgress: 0, spawnPop: 0, stations, clockMs: 150 });
    // 8 beams x (2 x 3 bloom + 5 body) = 88 lines plus the flowing stream dashes (at most 8 per beam), widths from 1 up to
    // the 9 px bloom, a halo + core head per beam plus the port glow on the diamond end (still attached): 3 circles per beam.
    const base = 8 * (2 * BEAM_BLOOM_LAYERS + BEAM_BODY_LAYERS);
    expect(recorder.lineBetweenCount).toBeGreaterThanOrEqual(base + 8);
    expect(recorder.lineBetweenCount).toBeLessThanOrEqual(base + (8 * BEAM_STREAM_MAX_DASHES));
    expect(Math.max(...recorder.lineWidths)).toBe(BEAM_BLOOM_OUTER_PX);
    expect(Math.min(...recorder.lineWidths)).toBe(1);
    expect(recorder.lineColors.every((color) => color === PLAYER_COLOR || color === HOT)).toBe(true);
    // lineColors has one entry per lineStyle call: 2 bloom widths + one per body layer and the contact ripple ring in the player colour, one hot stream style.
    expect(recorder.lineColors.filter((color) => color === PLAYER_COLOR).length).toBe(8 * (2 + BEAM_BODY_LAYERS + 1));
    expect(recorder.lineColors.filter((color) => color === HOT).length).toBe(8);
    expect(recorder.fillColors.every((color) => color === PLAYER_COLOR || color === HOT)).toBe(true);
    expect(recorder.circles).toHaveLength(24);
  });

  test('crisp on fractional DPR: line ends sit on a device pixel centre and widths are whole device pixels', () => {
    for (const dpr of [1, 2, 2.625, 2.75, 3]) {
      const recorder = makeRecorder();
      drawEdgeBeams(recorder, { direction: 'outward', focus: { x: 195.3, y: 401.7 }, laserProgress: 0, spawnPop: 0, stations, clockMs: 300, devicePixelRatio: dpr });
      expect(recorder.lineBetweenCount).toBeGreaterThan(0);
      for (const width of recorder.lineWidths) {
        const device = width * dpr;
        expect(Math.abs(device - Math.round(device)), `dpr ${dpr} width ${width}`).toBeLessThan(1e-9);
      }
    }
    expect(snapToDevice(10.1, 2.625) * 2.625 % 1).toBeCloseTo(0.5, 9);
    expect(snapWidthToDevice(0.2, 3)).toBeCloseTo(1 / 3, 9);
  });

  test('nothing draws before launch or after the tails have landed', () => {
    const recorder = makeRecorder();
    drawEdgeBeams(recorder, { direction: 'outward', focus, laserProgress: 0, spawnPop: 0, stations, clockMs: 0 });
    const lastGoneMs = Math.max(...Array.from({ length: EDGE_BEAM_COUNT }, (_, index) => resolveBeamTimes(index).tailArrivesMs));
    drawEdgeBeams(recorder, { direction: 'outward', focus, laserProgress: 1, spawnPop: 0, stations, clockMs: lastGoneMs });
    expect(recorder.lineBetweenCount).toBe(0);
  });
});

describe('scene wiring of the ring lifecycle', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
  const section = (from: string, to: string): string => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

  test('the ring keeps its intro clock after the build settles, holds full after the outro until the next intro, and crossfades in reduced motion', () => {
    const helper = section('private resolveLegacyEdgeRingIntroState(', 'private resolveLegacyOutroState(');
    expect(helper).toContain("this.menuStaticDrawLifecyclePhase !== 'building' && this.menuStaticDrawLifecyclePhase !== 'settled'");
    const ring = section('private resolveLegacyEdgeRing(', 'private drawLegacyEdgeMarkers(');
    expect(ring).toContain('this.resolveLegacyEdgeRingIntroState(time)');
    expect(ring).toContain('outro.ringFill');
    expect(ring).toContain('intro.ringFill');
    expect(ring).toContain('clockMs: outro.laserClockMs');
    expect(ring).toContain('clockMs: intro.laserClockMs');
    // Overlays: no lifecycle. Reduced motion keeps it (the diamonds crossfade) instead of dropping it.
    expect(ring).toContain("if (this.overlay !== 'none') {");
    expect(ring).toContain('const crossfade = this.prefersLegacyReducedMotion();');
    // The beams and the ring read one clock each and the same device scale as the board.
    const lasers = section('private drawLegacyEdgeLasers(', 'private resolveLegacyEdgeRing(');
    expect(lasers).toContain('clockMs: outro.laserClockMs');
    expect(lasers).toContain('clockMs: spawnBurst.clockMs');
    expect(lasers).toContain('devicePixelRatio: this.resolveBoardTileBackingScale()');
  });

  test('markers redraw every frame while the lifecycle is active and once more after it ends', () => {
    const lasers = section('private drawLegacyEdgeLasers(', 'private resolveLegacyEdgeRing(');
    expect(lasers).toContain('if (firing || this.edgeBeamWasFiring || ringActive || this.edgeRingActive) {');
    expect(lasers).toContain('this.edgeRingActive = ringActive;');
    // The dirty-flag gate keeps drawDynamicBoard running for the same condition.
    expect(source).toContain('      || this.edgeRingActive\n    ) {\n      this.boardDynamicDirty = true;');
  });
});

describe('ring fill and spin over the intro / outro timelines (per frame)', () => {
  const TILES = 300;
  const FULL = { reducedMotion: false, tileCount: TILES } as const;
  const CYCLE = { ...FULL, digitAlreadyVisible: true } as const;
  const fillsAt = (direction: 'inward' | 'outward', ms: number, options: { digitAlreadyVisible?: boolean } = { digitAlreadyVisible: true }): ReadonlyArray<number> => {
    if (direction === 'inward') {
      const intro = resolveIntro(ms, { ...FULL, ...options });
      return resolveEdgeRingFills(intro.done ? null : { direction, clockMs: intro.laserClockMs, ringFill: intro.ringFill });
    }
    const outro = resolveIntroDeconstruct(ms, FULL);
    return resolveEdgeRingFills({ direction, clockMs: outro.laserClockMs, ringFill: outro.ringFill });
  };
  const fullCount = (fills: ReadonlyArray<number>): number => fills.filter((fill) => fill === 1).length;

  test('departure: each diamond is EMPTY until its beam touches it, fills linearly from that exact instant and is full when the beam is absorbed', () => {
    for (let index = 0; index < 8; index += 1) {
      const times = resolveBeamTimes(index);
      let firstFill = Number.POSITIVE_INFINITY;
      let fullAt = Number.POSITIVE_INFINITY;
      let previous = 0;
      for (let ms = 0; ms <= 800; ms += 1) {
        const outro = resolveIntroDeconstruct(ms, FULL);
        const fill = fillsAt('outward', ms)[index] as number;
        expect(fill, `diamond ${index} t=${ms}`).toBeGreaterThanOrEqual(previous - 1e-12);
        previous = fill;
        if (firstFill === Number.POSITIVE_INFINITY && fill > 0) {
          firstFill = ms;
        }
        if (fullAt === Number.POSITIVE_INFINITY && fill === 1) {
          fullAt = ms;
        }
        // Contact: the head is on the diamond (progress 1) exactly when the fill is allowed to start.
        if (ms < times.contactMs - 1) {
          expect(resolveEdgeBeamProgress(outro.laserProgress, index)).toBeLessThan(1);
          expect(fill, `diamond ${index} before contact t=${ms}`).toBe(0);
        }
      }
      expect(firstFill, `diamond ${index} first fill`).toBe(Math.floor(times.contactMs) + 1);
      expect(fullAt, `diamond ${index} full`).toBe(Math.ceil(times.fillEndMs));
    }
    // The ring is full once every beam is absorbed and stays full through the deconstruct, to the very last frame.
    const total = resolveOutroTotalMs(TILES);
    for (let ms = 600; ms <= total + 1000; ms += 1) {
      expect(fullCount(fillsAt('outward', ms)), `t=${ms}`).toBe(8);
    }
    expect(fillsAt('outward', 0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  test('arrival after a deconstruct: the ring is FULL through the whole build, then each diamond drains from the exact instant its beam leaves and is empty when it has left', () => {
    const buildEnd = resolveIntroRevealEndMs(TILES);
    const laserEnd = resolveIntroLaserEndMs(TILES);
    for (let ms = 0; ms <= buildEnd; ms += 1) {
      expect(fullCount(fillsAt('inward', ms)), `t=${ms}`).toBe(8);
    }
    for (let index = 0; index < 8; index += 1) {
      const times = resolveBeamTimes(index);
      let previous = 1;
      for (let ms = buildEnd; ms <= buildEnd + 800; ms += 1) {
        const fill = fillsAt('inward', ms)[index] as number;
        const clock = ms - buildEnd;
        expect(fill, `diamond ${index} t=${ms}`).toBeLessThanOrEqual(previous + 1e-12);
        previous = fill;
        if (clock <= times.launchMs) {
          expect(fill, `diamond ${index} before release t=${ms}`).toBe(1);
        }
        if (clock >= times.tailLeavesMs) {
          expect(fill, `diamond ${index} after the tail left t=${ms}`).toBe(0);
        }
      }
      expect(fillsAt('inward', buildEnd + Math.ceil(times.launchMs) + 1)[index]).toBeLessThan(1);
    }
    // After the last head lands (the input unlock) the ring is already draining or empty, and it is empty from there + one pulse.
    for (let ms = laserEnd + EDGE_BEAM_PULSE_MS; ms <= laserEnd + 3000; ms += 1) {
      expect(fillsAt('inward', ms).every((fill) => fill === 0), `t=${ms}`).toBe(true);
    }
  });

  test('a cold start (no deconstruct before it) charges the ring over the first build ms, then drains the same way', () => {
    const cold = { digitAlreadyVisible: false };
    expect(fillsAt('inward', 0, cold)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    let previous = 0;
    for (let ms = 100; ms <= 600; ms += 1) {
      const fill = fillsAt('inward', ms, cold)[0] as number;
      expect(fill).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = fill;
    }
    expect(fillsAt('inward', 100 + INTRO_RING_CHARGE_MS, cold)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(fillsAt('inward', resolveIntroLaserEndMs(TILES) + EDGE_BEAM_PULSE_MS, cold)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  test('the seam between a deconstruct and the next build never shows an empty frame: the last outro frame and the first intro frame are both full', () => {
    const outroEnd = resolveOutroTotalMs(TILES);
    expect(fullCount(fillsAt('outward', outroEnd))).toBe(8);
    expect(fullCount(fillsAt('outward', outroEnd + 5000))).toBe(8);
    expect(fullCount(fillsAt('inward', 0))).toBe(8);
  });

  test('the fill and drain times are exactly the beam contact and release instants (same clock as the head)', () => {
    for (let index = 0; index < 8; index += 1) {
      const times = resolveBeamTimes(index);
      // head === 1 at contact, head === 0 until release.
      expect(resolveBeamHead(times.contactMs, index)).toBeCloseTo(1, 9);
      expect(resolveBeamHead(times.launchMs, index)).toBeCloseTo(0, 9);
      // The ring-level fill agrees with the timeline module at every ms.
      for (let ms = 0; ms <= 900; ms += 7) {
        expect(resolveEdgeRingFills({ direction: 'outward', clockMs: ms, ringFill: 0 })[index]).toBe(resolveDiamondFillFromIncoming(ms, index));
        expect(resolveEdgeRingFills({ direction: 'inward', clockMs: ms, ringFill: 1 })[index]).toBeCloseTo(1 - resolveDiamondDrainFromOutgoing(ms, index), 12);
      }
    }
  });

  test('reduced motion: no beam clock and no spin; the whole ring crossfades over the 200 ms crossfade, with the same end states', () => {
    const states = resolveEdgeMarkerStates({
      reducedMotion: true,
      fills: [1, 1, 1, 1, 1, 1, 1, 1],
      fillCrossfade: true,
      spinRad: 3,
      timeMs: 0
    });
    expect(states.every((state) => !state.energized && state.energy === 0 && state.spinRad === 0 && state.fill === 1 && state.fillCrossfade === true)).toBe(true);
    for (let ms = 0; ms <= 4000; ms += 50) {
      const intro = resolveIntro(ms, { reducedMotion: true, tileCount: TILES, digitAlreadyVisible: true });
      const outro = resolveIntroDeconstruct(ms, { reducedMotion: true, tileCount: TILES });
      expect([intro.ringSpinRad, intro.ringEnergy, intro.laserClockMs, outro.ringSpinRad, outro.ringEnergy, outro.laserClockMs]).toEqual([0, 0, -1, 0, 0, -1]);
    }
    // Outro: empty -> full over exactly MOTION_REDUCED_MS.crossfade, monotonic, then stays full. Intro: full -> empty likewise.
    expect(resolveIntroDeconstruct(0, { reducedMotion: true, tileCount: TILES }).ringFill).toBe(0);
    expect(resolveIntroDeconstruct(MOTION_REDUCED_MS.crossfade / 2, { reducedMotion: true, tileCount: TILES }).ringFill).toBeCloseTo(0.5, 12);
    expect(resolveIntroDeconstruct(MOTION_REDUCED_MS.crossfade, { reducedMotion: true, tileCount: TILES }).ringFill).toBe(1);
    expect(resolveIntroDeconstruct(5000, { reducedMotion: true, tileCount: TILES }).ringFill).toBe(1);
    const reducedIntro = { reducedMotion: true, tileCount: TILES, digitAlreadyVisible: true } as const;
    expect(resolveIntro(0, reducedIntro).ringFill).toBe(1);
    expect(resolveIntro(MOTION_REDUCED_MS.crossfade / 2, reducedIntro).ringFill).toBeCloseTo(0.5, 12);
    expect(resolveIntro(MOTION_REDUCED_MS.crossfade, reducedIntro).ringFill).toBe(0);
    expect(resolveIntro(0, { reducedMotion: true, tileCount: TILES }).ringFill).toBe(0);
    // The ring-level fill in crossfade mode is uniform (no per-beam timing).
    expect(resolveEdgeRingFills({ direction: 'outward', clockMs: -1, ringFill: 0.37, crossfade: true })).toEqual(Array.from({ length: 8 }, () => 0.37));
    expect(MOTION_REDUCED_MS.crossfade).toBe(200);
  });

  test('no lifecycle (rest) is completely empty', () => {
    expect(resolveEdgeRingFills(null)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  test('one fill only: lighting cues (wrap end, wrap flash) never add an interior shape; the fill is the only fillPath of a diamond (MAZER-VIS-033)', () => {
    const stations = resolveEdgeStations({ width: 390, height: 844 });
    const cues = { energizedIds: new Set([0, 1, 2, 3, 4, 5, 6, 7]), flash: { ids: [0, 1, 2, 3, 4, 5, 6, 7], startedAtMs: 0 }, reducedMotion: false, timeMs: 10 };
    // Empty diamonds, every cue on: no interior paint at all (the old instant core is gone), only the 8 outlines.
    const empty = makeRecorder();
    drawEdgeMarkers(empty, stations, resolveEdgeMarkerStates(cues));
    expect(empty.calls.filter((call) => call === 'fillPath')).toHaveLength(0);
    expect(empty.calls.filter((call) => call === 'strokePath')).toHaveLength(8);
    // Full diamonds, every cue on: exactly one fill per diamond (never a second, smaller one next to it).
    const full = makeRecorder();
    drawEdgeMarkers(full, stations, resolveEdgeMarkerStates({ ...cues, fills: [1, 1, 1, 1, 1, 1, 1, 1] }));
    expect(full.calls.filter((call) => call === 'fillPath')).toHaveLength(8);
    // The cues still brighten the BORDER (alpha), they just paint no interior.
    const quiet = resolveEdgeMarkerStates({ reducedMotion: false, timeMs: 10 });
    expect(resolveEdgeMarkerStates(cues)[3]!.alpha).toBeGreaterThan(quiet[3]!.alpha);
  });

  test('the old lit core is gone from the source: no half-size kite is traced inside a diamond', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/render/edgeMarkers.ts'), 'utf8');
    expect(source).not.toMatch(/resolveEdgeMarkerVertices([^)]*,s*0.d+)/);
    expect(source).not.toContain('Player-coloured core');
  });

  test('the markers draw an interior fill only while a diamond holds some; the border is the live trail colour either way', () => {
    const stations = resolveEdgeStations({ width: 390, height: 844 });
    const full = resolveEdgeMarkerStates({ reducedMotion: false, fills: resolveEdgeRingFills({ direction: 'inward', clockMs: -1, ringFill: 1 }), timeMs: 0 });
    const fullRecorder = makeRecorder();
    drawEdgeMarkers(fullRecorder, stations, full);
    expect(fullRecorder.calls.filter((call) => call === 'fillPath')).toHaveLength(8);
    expect(fullRecorder.fillColors).toEqual(Array.from({ length: 8 }, () => PLAYER_COLOR));
    const border = resolveTrailPaletteBorderColor(0, 0, false);
    expect(fullRecorder.lineColors).toEqual(Array.from({ length: 8 }, () => border));
    const rest = resolveEdgeMarkerStates({ reducedMotion: false, fills: resolveEdgeRingFills(null), timeMs: 0 });
    const restRecorder = makeRecorder();
    drawEdgeMarkers(restRecorder, stations, rest);
    expect(restRecorder.calls.filter((call) => call === 'fillPath')).toHaveLength(0);
    expect(restRecorder.lineColors).toEqual(Array.from({ length: 8 }, () => border));
  });

  test('orbit start is derived from the master laser clock: the instant the last beam has let go (720 ms at the shipped timings)', () => {
    const times = Array.from({ length: EDGE_BEAM_COUNT }, (_, index) => resolveBeamTimes(index));
    const lastTailArrivesMs = Math.max(...times.map((time) => time.tailArrivesMs));
    expect(OUTRO_RING_ORBIT_START_MS).toBeCloseTo(lastTailArrivesMs, 9);
    expect(OUTRO_RING_ORBIT_START_MS).toBe(OUTRO_LASER_MS + INTRO_BEAM_PULSE_MS + INTRO_BEAM_RETRACT_MS);
    expect(OUTRO_RING_ORBIT_START_MS).toBe(OUTRO_LASER_MS + EDGE_BEAM_PULSE_MS + EDGE_BEAM_RETRACT_MS);
    expect(OUTRO_RING_ORBIT_START_MS).toBe(OUTRO_TILES_START_MS + EDGE_BEAM_PULSE_MS + EDGE_BEAM_RETRACT_MS);
    // 600 ms before MAZER-VIS-038 (the beam let go when the fill ended); the retract after the last fill moves it to 720.
    expect(OUTRO_RING_ORBIT_START_MS).toBe(720);
    expect(resolveIntroDeconstruct(OUTRO_RING_ORBIT_START_MS, FULL).ringSpinRad).toBe(0);
    expect(resolveIntroDeconstruct(OUTRO_RING_ORBIT_START_MS + 1, FULL).ringSpinRad).not.toBe(0);
    // Total outro length does not depend on the orbit start.
    expect(resolveOutroTotalMs(TILES)).toBe(OUTRO_TILES_START_MS + resolveOutroRemoveMs(TILES) + OUTRO_HANDOFF_MS);
  });

  test('orbit phase: parked while the beams fly and are absorbed, then one full lap (build clockwise, deconstruct counter-clockwise), exactly 0 at both ends', () => {
    const introEnd = resolveIntroRevealEndMs(TILES);
    const outroEnd = resolveOutroTotalMs(TILES);
    const cases = [
      { label: 'intro', startMs: INTRO_BUILD_START_MS, end: introEnd, sign: 1, phaseAt: (ms: number) => resolveIntro(ms, FULL).ringSpinRad },
      { label: 'outro', startMs: OUTRO_RING_ORBIT_START_MS, end: outroEnd, sign: -1, phaseAt: (ms: number) => resolveIntroDeconstruct(ms, FULL).ringSpinRad }
    ];
    void CYCLE;
    // Derived from the master laser clock (MAZER-VIS-032), not pinned: see the derivation test below.
    for (const { label, startMs, end, sign, phaseAt } of cases) {
      // Parked (an exact 0 -> the rest layout) for the whole beam flight, so every beam fires from / lands on a rest station.
      for (let ms = 0; ms <= startMs; ms += 1) {
        expect(phaseAt(ms), `${label} t=${ms}`).toBe(0);
      }
      expect(phaseAt(end), label).toBe(0);
      expect(phaseAt(end + 5000), label).toBe(0);
      let previous = 0;
      let peak = 0;
      for (let ms = startMs + 1; ms < end; ms += 1) {
        const phase = sign * phaseAt(ms);
        expect(phase, `${label} t=${ms}`).toBeGreaterThan(previous - 1e-12);
        expect(phase).toBeLessThanOrEqual((Math.PI * 2) + 1e-9);
        previous = phase;
        peak = Math.max(peak, phase);
      }
      // It travels a full lap by the end of the window and lands on a whole number of laps.
      expect(peak).toBeGreaterThan(Math.PI * 2 * 0.99);
      const viewport = { width: 390, height: 844 };
      expect(resolveOrbitingEdgeStations(viewport, phaseAt(end))).toEqual(resolveEdgeStations(viewport));
      // The window is the ~2-3.2 s reveal / ~2.1-3.3 s deconstruct.
      expect(end - startMs).toBeGreaterThanOrEqual(2000);
      expect(end - startMs).toBeLessThanOrEqual(3300);
    }
  });
});

describe('diamond orbit: the ring circulates along the viewport perimeter', () => {
  const ORBIT_VIEWPORTS = [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 1280, height: 720 }
  ] as const;
  const STEP = (Math.PI * 2) / EDGE_STATION_COUNT;

  test.each(ORBIT_VIEWPORTS)('phase 0 is exactly the fixed layout at $width x $height (same ids, same numbers)', (viewport) => {
    expect(resolveOrbitingEdgeStations(viewport, 0)).toEqual(resolveEdgeStations(viewport));
    expect(resolveOrbitingEdgeStations(viewport, Math.PI * 2)).toEqual(resolveEdgeStations(viewport));
    expect(resolveOrbitingEdgeStations(viewport, -Math.PI * 2)).toEqual(resolveEdgeStations(viewport));
  });

  test.each(ORBIT_VIEWPORTS)('after k whole steps diamond i is EXACTLY on rest station i+k at $width x $height', (viewport) => {
    const rest = resolveEdgeStations(viewport);
    for (let k = -9; k <= 9; k += 1) {
      const orbit = resolveOrbitingEdgeStations(viewport, k * STEP);
      orbit.forEach((station, index) => {
        const target = rest[(((index + k) % 8) + 8) % 8] as (typeof rest)[number];
        expect(station.id).toBe(index);
        expect({ ...station, id: target.id }).toEqual(target);
      });
    }
  });

  test('pure: same viewport and phase give the same stations, and a positive phase is clockwise', () => {
    const viewport = { width: 390, height: 844 };
    expect(resolveOrbitingEdgeStations(viewport, 0.7)).toEqual(resolveOrbitingEdgeStations(viewport, 0.7));
    expect(resolveOrbitingEdgeStations.length).toBe(2);
    const rest = resolveEdgeStations(viewport);
    const early = resolveOrbitingEdgeStations(viewport, STEP * 0.25);
    // Top midpoint -> toward the top-right corner; right midpoint -> down; bottom midpoint -> left; left midpoint -> up.
    expect((early[1] as { x: number }).x).toBeGreaterThan((rest[1] as { x: number }).x);
    expect((early[3] as { y: number }).y).toBeGreaterThan((rest[3] as { y: number }).y);
    expect((early[5] as { x: number }).x).toBeLessThan((rest[5] as { x: number }).x);
    expect((early[7] as { y: number }).y).toBeLessThan((rest[7] as { y: number }).y);
    // Negative phase is counter-clockwise (the exact mirror direction).
    const back = resolveOrbitingEdgeStations(viewport, -STEP * 0.25);
    expect((back[1] as { x: number }).x).toBeLessThan((rest[1] as { x: number }).x);
    expect((back[3] as { y: number }).y).toBeLessThan((rest[3] as { y: number }).y);
  });

  test.each(ORBIT_VIEWPORTS)('no painted kite pixel (outline plus miter) ever leaves the viewport at any phase at $width x $height; top/bottom travel is flush', (viewport) => {
    let flushSamples = 0;
    for (let index = 0; index <= 2400; index += 1) {
      const phase = (index / 2400) * Math.PI * 2;
      for (const station of resolveOrbitingEdgeStations(viewport, phase)) {
        const painted = resolveEdgeMarkerPaintedPolygon(station);
        const minX = Math.min(...painted.map((vertex) => vertex.x));
        const maxX = Math.max(...painted.map((vertex) => vertex.x));
        const minY = Math.min(...painted.map((vertex) => vertex.y));
        const maxY = Math.max(...painted.map((vertex) => vertex.y));
        const label = `phase ${phase} id ${station.id}`;
        expect(minX, label).toBeGreaterThanOrEqual(-1e-9);
        expect(minY, label).toBeGreaterThanOrEqual(-1e-9);
        expect(maxX, label).toBeLessThanOrEqual(viewport.width + 1e-9);
        expect(maxY, label).toBeLessThanOrEqual(viewport.height + 1e-9);
        if (station.side === 'top') {
          expect(minY, label).toBeCloseTo(0, 9);
          flushSamples += 1;
        }
        if (station.side === 'bottom') {
          expect(viewport.height - maxY, label).toBeCloseTo(0, 9);
          flushSamples += 1;
        }
      }
    }
    expect(flushSamples).toBeGreaterThan(2000);
  }, 120_000);

  test.each(ORBIT_VIEWPORTS)('the path is continuous (no teleporting, angle swings smoothly through the corners) at $width x $height', (viewport) => {
    const samples = 2000;
    let previous = resolveOrbitingEdgeStations(viewport, 0);
    // Longest rest-to-rest hop of any diamond, in px, divided by the steps it spans: bounds one sample's travel.
    const longest = Math.max(viewport.width, viewport.height);
    for (let index = 1; index <= samples; index += 1) {
      const current = resolveOrbitingEdgeStations(viewport, (index / samples) * Math.PI * 2);
      current.forEach((station, id) => {
        const before = previous[id] as (typeof previous)[number];
        const travelled = Math.hypot(station.x - before.x, station.y - before.y);
        expect(travelled, `id ${id} sample ${index}`).toBeLessThan((longest * 8) / samples);
        // Orientation is unwrapped: it always advances ~ pi/4 per station step, never flips.
        let turn = station.inwardAngle - before.inwardAngle;
        turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
        expect(turn, `id ${id} sample ${index}`).toBeGreaterThan(0);
        expect(turn).toBeLessThan(((Math.PI * 2) / samples) * 2 + 1e-9);
      });
      previous = current;
    }
  }, 120_000);

  test('orientation: diagonal at a corner, the pure edge normal at a side midpoint, next corner diagonal (inward)', () => {
    const viewport = { width: 390, height: 844 };
    const at = (id: number, steps: number) => resolveOrbitingEdgeStation(viewport, id as 0, steps * STEP + 1e-6);
    const angle = (id: number, steps: number): number => at(id, steps).inwardAngle;
    const near = (value: number, expected: number): void => {
      const delta = (((value - expected) % (Math.PI * 2)) + (Math.PI * 3)) % (Math.PI * 2) - Math.PI;
      expect(Math.abs(delta)).toBeLessThan(1e-4);
    };
    near(angle(0, 0), Math.PI / 4);
    near(angle(0, 1), Math.PI / 2);
    near(angle(0, 2), (3 * Math.PI) / 4);
    near(angle(0, 3), Math.PI);
    near(angle(0, 5), -Math.PI / 2);
    near(angle(0, 7), 0);
    // Midway between a corner and a midpoint it is 22.5 degrees off the normal.
    near(resolveOrbitingEdgeStation(viewport, 0, STEP * 0.5).inwardAngle, (3 * Math.PI) / 8);
  });

  test('the diamonds draw ON the orbit: drawEdgeMarkers places each kite at its state phase, rest at phase 0, nothing in reduced motion', () => {
    const viewport = { width: 390, height: 844 };
    const rest = resolveEdgeStations(viewport);
    const firstVertex = (recorder: Recorder, kite: number): { x: number; y: number } => {
      // each outline contributes 1 moveTo + 3 lineTo; the unlit outline is the only polygon drawn
      const point = recorder.points[kite * 4] as { x: number; y: number };
      return point;
    };
    const phase = STEP * 0.6;
    const states = resolveEdgeMarkerStates({ reducedMotion: false, spinRad: phase, timeMs: 0 });
    const moving = makeRecorder();
    drawEdgeMarkers(moving, rest, states);
    const expected = resolveOrbitingEdgeStations(viewport, phase);
    expected.forEach((station, index) => {
      const tip = resolveEdgeMarkerVertices(station)[0] as { x: number; y: number };
      expect(firstVertex(moving, index).x).toBeCloseTo(tip.x, 6);
      expect(firstVertex(moving, index).y).toBeCloseTo(tip.y, 6);
    });
    // Phase 0 draws the rest kites untouched.
    const parked = makeRecorder();
    drawEdgeMarkers(parked, rest, resolveEdgeMarkerStates({ reducedMotion: false, timeMs: 0 }));
    rest.forEach((station, index) => {
      expect(firstVertex(parked, index)).toEqual(resolveEdgeMarkerVertices(station)[0]);
    });
    // Reduced motion: phase forced to 0 -> static.
    const reduced = makeRecorder();
    drawEdgeMarkers(reduced, rest, resolveEdgeMarkerStates({ reducedMotion: true, spinRad: phase, timeMs: 0 }));
    expect(reduced.points).toEqual(parked.points);
  });

  test('beams fire from / to each diamond\'s CURRENT (moving) position, all 8', () => {
    const viewport = { width: 390, height: 844 };
    const stations = resolveOrbitingEdgeStations(viewport, STEP * 2.3);
    const focus = { x: 200, y: 400 };
    const inward = resolveEdgeBeams({ direction: 'inward', focus, laserProgress: 0.5, spawnPop: 0, stations });
    const outward = resolveEdgeBeams({ direction: 'outward', focus, laserProgress: 0.5, spawnPop: 0, stations });
    expect(inward.beams).toHaveLength(8);
    stations.forEach((station, index) => {
      // The diamond end is the inner tip of the moving diamond at its current size (a polygon vertex of that kite).
      const inScale = resolveEdgeDiamondScale('inward', 200, index);
      const outScale = resolveEdgeDiamondScale('outward', 200, index);
      expect(inward.beams[index]?.from).toEqual(resolveEdgeInnerTip(station, inScale));
      expect(outward.beams[index]?.to).toEqual(resolveEdgeInnerTip(station, outScale));
      expect(isOnPolygonEdge(resolveEdgeMarkerVertices(anchorStationToOuterTip(station, inScale), inScale), inward.beams[index]?.from as { x: number; y: number })).toBe(true);
      expect(isOnPolygonEdge(resolveEdgeMarkerVertices(anchorStationToOuterTip(station, outScale), outScale), outward.beams[index]?.to as { x: number; y: number })).toBe(true);
    });
  });

  test('the orbit never overlaps the beam flight (intro: beams only after the orbit ended; outro: orbit only after the beams landed)', () => {
    for (const tileCount of [40, 300, 900]) {
      const options = { reducedMotion: false, tileCount } as const;
      for (let ms = 0; ms < 6000; ms += 1) {
        const intro = resolveIntro(ms, options);
        // Reordered intro: the ring orbits during the BUILD and is parked (exact rest stations) from the build end,
        // so every beam that fires (laserProgress > 0) leaves from a rest station.
        if (intro.laserProgress > 0) {
          expect(intro.ringSpinRad, `intro n=${tileCount} t=${ms}`).toBe(0);
        }
        const outro = resolveIntroDeconstruct(ms, options);
        // The ring holds still while the last beam is still being absorbed (head lands at 400, tail 200 ms later).
        if (ms <= OUTRO_TILES_START_MS + EDGE_BEAM_PULSE_MS) {
          expect(outro.ringSpinRad, `outro n=${tileCount} t=${ms}`).toBe(0);
        }
      }
    }
  });
});

interface Recorder extends EdgeGraphics {
  calls: string[];
  fillColors: number[];
  lineWidths: number[];
  lineColors: number[];
  circles: Array<{ x: number; y: number; radius: number }>;
  lineBetweenCount: number;
  points: Array<{ x: number; y: number }>;
}

function makeRecorder(): Recorder {
  const recorder: Recorder = {
    calls: [],
    fillColors: [],
    lineWidths: [],
    lineColors: [],
    circles: [],
    lineBetweenCount: 0,
    points: [],
    fillStyle(color: number) { recorder.calls.push('fillStyle'); recorder.fillColors.push(color); },
    lineStyle(width: number, color: number) { recorder.calls.push('lineStyle'); recorder.lineWidths.push(width); recorder.lineColors.push(color); },
    beginPath() { recorder.calls.push('beginPath'); },
    moveTo(x: number, y: number) { recorder.calls.push('moveTo'); recorder.points.push({ x, y }); },
    lineTo(x: number, y: number) { recorder.calls.push('lineTo'); recorder.points.push({ x, y }); },
    closePath() { recorder.calls.push('closePath'); },
    fillPath() { recorder.calls.push('fillPath'); },
    strokePath() { recorder.calls.push('strokePath'); },
    fillCircle(x: number, y: number, radius: number) { recorder.calls.push('fillCircle'); recorder.circles.push({ x, y, radius }); },
    lineBetween() { recorder.calls.push('lineBetween'); recorder.lineBetweenCount += 1; }
  };
  return recorder;
}

describe('colour contract: border = live trail colour, inside = player colour (one source, trailPalette.ts)', () => {
  const stations = resolveEdgeStations({ width: 390, height: 844 });

  test('the player colour is one token: the player marker, the diamond fill and the beams all read PLAYER_COLOR', () => {
    expect(PLAYER_COLOR).toBe(cyberArcadeMaterial.signal.player);
    expect(boardMaterial.player).toBe(PLAYER_COLOR);
  });

  test('every diamond border equals the trail colour at the trail head, at every time and head distance (they cannot drift)', () => {
    for (const timeMs of [0, 137, 900, 2500, 8000]) {
      for (const head of [0, 3.5, 12, 40.25]) {
        const states = resolveEdgeMarkerStates({ reducedMotion: false, timeMs, trailHeadDistanceTiles: head });
        const recorder = makeRecorder();
        drawEdgeMarkers(recorder, stations, states);
        const trail = sampleIridescentTrail(head, timeMs, false, { core: 0, glow: 0, wave: 0, sheen: 0 }).core;
        expect(recorder.lineColors, `t ${timeMs} head ${head}`).toEqual(Array.from({ length: 8 }, () => trail));
        expect(trail).toBe(resolveTrailPaletteBorderColor(head, timeMs, false));
      }
    }
  });

  test('the border uses the trail clock when given (the scene passes the trail animation clock, so a paused trail pauses it)', () => {
    const a = resolveEdgeMarkerStates({ reducedMotion: false, timeMs: 5000, trailTimeMs: 100, trailHeadDistanceTiles: 5 });
    expect(a[0]?.borderColor).toBe(resolveTrailPaletteBorderColor(5, 100, false));
  });

  test('the border moves with time (the trail colour shifts), in reduced motion too; only a static trail clock (Trail Shine off) holds it', () => {
    const at = (timeMs: number, extra: { reducedMotion?: boolean; trailAnimated?: boolean; trailTimeMs?: number } = {}) => (
      resolveEdgeMarkerStates({
        reducedMotion: extra.reducedMotion ?? false,
        trailAnimated: extra.trailAnimated,
        ...(extra.trailTimeMs === undefined ? {} : { trailTimeMs: extra.trailTimeMs }),
        timeMs,
        trailHeadDistanceTiles: 6
      })[0]!.borderColor
    );
    expect(at(0)).not.toBe(at(600));
    // MAZER-MOTION-004 (owner rule): reduced motion does NOT freeze colour.
    expect(at(0, { reducedMotion: true })).not.toBe(at(600, { reducedMotion: true }));
    expect(at(600, { reducedMotion: true })).toBe(resolveTrailPaletteBorderColor(6, 600, true));
    // Trail Shine off: the scene feeds a fixed colour time, so the border is the static gradient colour.
    expect(at(0, { trailAnimated: false, trailTimeMs: 0 })).toBe(at(9999, { trailAnimated: false, trailTimeMs: 0 }));
  });

  test('an icon with no explicit border colour (the Guide legend) draws the static trail gradient colour, never a fixed cyan or mint', () => {
    const recorder = makeRecorder();
    drawEdgeMarker(recorder, stations[1]!, { alpha: 0.95, energized: false, energy: 0, flash: 0, hidden: false, id: 1, spinRad: 0 });
    expect(recorder.lineColors).toEqual([resolveTrailPaletteBorderColor(0, 0, true)]);
    expect(recorder.lineColors[0]).not.toBe(cyberArcadeMaterial.rail.cyan);
    expect(recorder.lineColors[0]).not.toBe(cyberArcadeMaterial.rail.mint);
  });

  test('the module has no fixed colour literals and does not import the mint / cyan rail tokens', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/render/edgeMarkers.ts'), 'utf8');
    expect(source).not.toMatch(/rail\.(mint|cyan)/);
    expect(source).not.toMatch(/0x[0-9a-fA-F]{6}/);
    expect(source).toContain("from './trailPalette'");
  });

  test('the scene feeds the diamonds the trail head sample the trail itself recorded (same palette, same clock)', () => {
    const scene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(scene).toContain('this.trailPaletteHead = {');
    expect(scene).toContain('trailHeadDistanceTiles: this.trailPaletteHead.distanceTiles');
    expect(scene).toContain('trailTimeMs: this.trailPaletteHead.timeMs');
    expect(scene).toContain('trailAnimated: this.trailPaletteHead.animated');
  });
});

describe('diamond size (outer-tip anchored) and inner-tip attachment (MAZER-VIS-038, MAZER-VIS-043)', () => {
  const FULL = { reducedMotion: false, tileCount: 300 } as const;

  test('anchorStationToOuterTip scales about the OUTER tip: the outer tip never moves (it stays on the screen edge), the inner tip moves in as the diamond grows, scale 1 is the station itself', () => {
    for (const viewport of VIEWPORTS) {
      for (const station of resolveEdgeStations(viewport)) {
        const fullOuter = resolveEdgeMarkerVertices(station, 1)[2] as { x: number; y: number };
        const fullInner = resolveEdgeInnerTip(station);
        expect(anchorStationToOuterTip(station, 1)).toBe(station);
        expect(resolveEdgeInnerTip(station, 1)).toEqual(fullInner);
        let previousReach = 0;
        for (const scale of [0, 0.2, 0.5, 0.75, 1]) {
          const vertices = resolveEdgeMarkerVertices(anchorStationToOuterTip(station, scale), scale);
          expect(vertices[2]?.x).toBeCloseTo(fullOuter.x, 9);
          expect(vertices[2]?.y).toBeCloseTo(fullOuter.y, 9);
          // vertex 0 IS the inner tip at that size, and resolveEdgeInnerTip reports it
          const inner = resolveEdgeInnerTip(station, scale);
          expect(vertices[0]?.x).toBeCloseTo(inner.x, 9);
          expect(vertices[0]?.y).toBeCloseTo(inner.y, 9);
          const length = Math.hypot((vertices[0] as { x: number }).x - fullOuter.x, (vertices[0] as { y: number }).y - fullOuter.y);
          expect(length).toBeCloseTo(2 * EDGE_MARKER_HALF_HEIGHT * scale, 9);
          expect(length).toBeGreaterThanOrEqual(previousReach - 1e-9);
          previousReach = length;
        }
        // The inner tip at full size is the station's own vertex 0; at 50% it is the station centre (10 px from the outer tip).
        expect(fullInner.x).toBeCloseTo((resolveEdgeMarkerVertices(station, 1)[0] as { x: number }).x, 9);
        expect(resolveEdgeInnerTip(station, 0.5).x).toBeCloseTo(station.x, 9);
        expect(resolveEdgeInnerTip(station, 0.5).y).toBeCloseTo(station.y, 9);
        // Scaling toward the outer tip keeps the whole painted kite inside the full-size kite's footprint toward the edge, so it never leaves the screen.
        for (const scale of [0.5, 0.75]) {
          const painted = resolveEdgeMarkerPaintedPolygon(anchorStationToOuterTip(station, scale), scale);
          for (const point of painted) {
            expect(point.x).toBeGreaterThanOrEqual(-1e-9);
            expect(point.y).toBeGreaterThanOrEqual(-1e-9);
            expect(point.x).toBeLessThanOrEqual(viewport.width + 1e-9);
            expect(point.y).toBeLessThanOrEqual(viewport.height + 1e-9);
          }
        }
      }
    }
  });

  test('beam paths never cross the kite body: from the inner tip, the path to anywhere on the board leaves the kite\'s tip wedge', () => {
    // The kite is a wedge at its tip of half-angle atan(7 / 8) (from the tip to the (2, +-7) shoulders) opening toward the OUTER
    // tip (-axis). A path from the tip leaves it, never running through the body, when it is steeper than that wedge.
    const wedge = Math.atan2(7, EDGE_MARKER_HALF_HEIGHT - 2);
    for (const viewport of VIEWPORTS) {
      const stations = resolveEdgeStations(viewport);
      // Anywhere on the board except the outermost 10 % of the width/height around a diamond (a player standing within ~39 px of the
      // screen edge, on the diamond's axis, is the one documented exception: the beam then runs through the kite to its tip).
      const points = [0.1, 0.5, 0.9].flatMap((fx) => [0.1, 0.5, 0.9].map((fy) => ({ x: viewport.width * fx, y: viewport.height * fy })));
      for (const station of stations) {
        // The path leaves the tip of the CURRENT size; the 50% tip (the centre) is the one nearest the edge, so check both.
        const back = { x: -Math.cos(station.inwardAngle), y: -Math.sin(station.inwardAngle) };
        for (const scale of [1, 0.5]) {
        const tip = resolveEdgeInnerTip(station, scale);
        for (const focus of points) {
          const length = Math.hypot(focus.x - tip.x, focus.y - tip.y);
          const angle = Math.acos(Math.max(-1, Math.min(1, (((focus.x - tip.x) * back.x) + ((focus.y - tip.y) * back.y)) / length)));
          expect(angle, `${viewport.width}x${viewport.height} station ${station.id} focus ${focus.x},${focus.y} scale ${scale}`).toBeGreaterThan(wedge);
        }
        }
      }
    }
  });

  test('resolveEdgeRingScales: 50% at rest and in the reduced-motion crossfade (fixed size, no size animation); grows on departure, holds 100% through the build, shrinks per diamond after the drain', () => {
    expect(resolveEdgeRingScales(null)).toEqual(Array.from({ length: 8 }, () => EDGE_DIAMOND_REST_SCALE));
    // Reduced motion: whatever the clock or the crossfade level, every diamond stays at 50%.
    for (const ringFill of [0, 0.3, 1]) {
      for (const direction of ['outward', 'inward'] as const) {
        expect(resolveEdgeRingScales({ direction, clockMs: 250, ringFill, crossfade: true })).toEqual(Array.from({ length: 8 }, () => EDGE_DIAMOND_REST_SCALE));
      }
    }
    // Full motion departure: from 50% at the goal to 100% at each diamond's own contact.
    expect(resolveEdgeRingScales({ direction: 'outward', clockMs: 0, ringFill: 0 })).toEqual(Array.from({ length: 8 }, () => EDGE_DIAMOND_REST_SCALE));
    for (let index = 0; index < 8; index += 1) {
      const times = resolveBeamTimes(index);
      expect(resolveEdgeRingScales({ direction: 'outward', clockMs: times.contactMs, ringFill: 0 })[index]).toBe(1);
      expect(resolveEdgeRingScales({ direction: 'outward', clockMs: times.contactMs / 2, ringFill: 0 })[index]).toBeCloseTo(0.75, 9);
    }
    // The whole deconstruct after the beams: 100%, to the last frame; the whole build before the beams: 100%.
    const outroEnd = resolveOutroTotalMs(300);
    expect(resolveEdgeRingScales({ direction: 'outward', clockMs: outroEnd, ringFill: 0 })).toEqual(Array.from({ length: 8 }, () => 1));
    for (const ms of [0, 1000, resolveIntroRevealEndMs(300) - 1]) {
      const intro = resolveIntro(ms, { ...FULL, digitAlreadyVisible: true });
      expect(resolveEdgeRingScales({ direction: 'inward', clockMs: intro.laserClockMs, ringFill: intro.ringFill })).toEqual(Array.from({ length: 8 }, () => 1));
    }
    // After the beams left: per diamond, back to 50% once that diamond is empty plus the shrink.
    const doneIntro = resolveIntro(resolveIntroLaserStartMs(300) + 760, { ...FULL, digitAlreadyVisible: true });
    expect(resolveEdgeRingScales({ direction: 'inward', clockMs: doneIntro.laserClockMs, ringFill: doneIntro.ringFill })).toEqual(Array.from({ length: 8 }, () => EDGE_DIAMOND_REST_SCALE));
  });

  test('markers drawn at 50% are anchored on the outer tip, carry the scale in their state, and the default (no scales) stays full size for standalone icons', () => {
    const stations = resolveEdgeStations({ width: 390, height: 844 });
    const half = resolveEdgeMarkerStates({ reducedMotion: false, scales: resolveEdgeRingScales(null), timeMs: 0 });
    expect(half.every((state) => state.scale === EDGE_DIAMOND_REST_SCALE)).toBe(true);
    expect(resolveEdgeMarkerStates({ reducedMotion: false, timeMs: 0 }).every((state) => state.scale === 1)).toBe(true);
    const recorder = makeRecorder();
    drawEdgeMarkers(recorder, stations, half);
    expect(recorder.calls.filter((call) => call === 'strokePath')).toHaveLength(8);
    // The border stroke stays one css px at any size; the fill (when present) is clipped to the smaller kite, one fillPath per diamond.
    expect(recorder.lineWidths).toEqual(Array.from({ length: 8 }, () => 1));
  });

  test('the scene feeds the ring size to the markers (thin MenuScene wiring)', () => {
    const scene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(scene).toContain('scales: resolveEdgeRingScales(this.edgeRing.lifecycle),');
  });

  test('the full-size inner tip is an exact vertex at every orbit phase too (the ring orbits at full size)', () => {
    const viewport = { width: 390, height: 844 };
    for (const phase of [0.3, 1.1, 2.7, 4.4, 5.9]) {
      for (const station of resolveOrbitingEdgeStations(viewport, phase)) {
        const tip = resolveEdgeInnerTip(station);
        const vertices = resolveEdgeMarkerVertices(station, 1);
        expect(vertices[0]?.x).toBeCloseTo(tip.x, 9);
        expect(vertices[0]?.y).toBeCloseTo(tip.y, 9);
      }
    }
  });
});
