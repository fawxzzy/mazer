import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuPathTitleOrbitPose } from '../../src/legacy-runtime/legacyMenuTitle';
import {
  EDGE_MARKER_IDLE_ALPHA_MAX,
  EDGE_MARKER_IDLE_ALPHA_MIN,
  EDGE_MARKER_IDLE_PERIOD_MS,
  EDGE_MARKER_FLASH_MS,
  EDGE_MARKER_MAX_EXTENT_PX,
  EDGE_MARKER_MIN_INSET_PX,
  EDGE_MIDPOINT_STATION_ID,
  EDGE_STATION_COUNT,
  drawEdgeMarkers,
  drawEdgeBeams,
  resolveEdgeMarkerIdleAlpha,
  resolveEdgeMarkerInsets,
  resolveEdgeMarkerStates,
  resolveEdgeMarkerVertices,
  resolveEdgeStationPosition,
  resolveEdgeStations,
  resolveEdgeBeamProgress,
  resolveEdgeBeams,
  resolveEdgeMarkerBounds,
  resolveHeaderControlRects,
  resolveWrapEndStationIds,
  resolveWrapFlashStationIds,
  EDGE_MARKER_CONTROL_CLEARANCE_PX,
  type EdgeGraphics,
  type EdgeRect
} from '../../src/render/edgeMarkers';
import { cyberArcadeMaterial } from '../../src/render/cyberArcadeMaterial';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';
import { INTRO_BEAM_STAGGER_MS, INTRO_LASER_MS } from '../../src/render/introTimeline';
import { resolveTeleportAnchorPoses } from '../../src/render/teleportAnchorPose';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 720 },
  { width: 499, height: 958 }
] as const;

const SAFE_AREAS = [
  undefined,
  { top: 47, right: 0, bottom: 34, left: 0 },
  { top: 24, right: 24, bottom: 24, left: 24 }
] as const;

describe('edge marker stations', () => {
  test.each(VIEWPORTS)('all 8 kites are fully inside a $width x $height viewport (with and without safe-area insets)', (viewport) => {
    for (const safeArea of SAFE_AREAS) {
      const stations = resolveEdgeStations(viewport, safeArea);
      expect(stations).toHaveLength(EDGE_STATION_COUNT);
      const insets = resolveEdgeMarkerInsets(safeArea);
      for (const station of stations) {
        // Centre inset >= max(12, safeArea + 12) on every edge it touches.
        expect(station.x).toBeGreaterThanOrEqual(insets.left - 1e-9);
        expect(station.x).toBeLessThanOrEqual(viewport.width - insets.right + 1e-9);
        expect(station.y).toBeGreaterThanOrEqual(insets.top - 1e-9);
        expect(station.y).toBeLessThanOrEqual(viewport.height - insets.bottom + 1e-9);
        expect(insets.left).toBeGreaterThanOrEqual(Math.max(12, (safeArea?.left ?? 0) + 12));
        expect(insets.top).toBeGreaterThanOrEqual(Math.max(12, (safeArea?.top ?? 0) + 12));
        // Every outline vertex plus half a stroke stays inside the viewport,
        // at the real rotation AND at every other rotation (worst case).
        for (const vertex of resolveEdgeMarkerVertices(station)) {
          expect(vertex.x - 0.5).toBeGreaterThanOrEqual(0);
          expect(vertex.y - 0.5).toBeGreaterThanOrEqual(0);
          expect(vertex.x + 0.5).toBeLessThanOrEqual(viewport.width);
          expect(vertex.y + 0.5).toBeLessThanOrEqual(viewport.height);
        }
        for (let degrees = 0; degrees < 360; degrees += 15) {
          const rotated = resolveEdgeMarkerVertices({ ...station, inwardAngle: (degrees * Math.PI) / 180 });
          for (const vertex of rotated) {
            expect(Math.hypot(vertex.x - station.x, vertex.y - station.y)).toBeLessThanOrEqual(EDGE_MARKER_MAX_EXTENT_PX);
          }
        }
      }
    }
    expect(EDGE_MARKER_MAX_EXTENT_PX).toBeLessThanOrEqual(EDGE_MARKER_MIN_INSET_PX);
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
    expect(stations[0]).toMatchObject({ x: 12, y: 12 });
    expect(stations[1]?.x).toBeCloseTo(195, 9);
    expect(stations[3]).toMatchObject({ x: 378 });
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

  test('reduced motion: nothing animates, lights up or flashes', () => {
    const energized = new Set<number>([1, 3]);
    const flash = { ids: [1, 3], startedAtMs: 0 };
    const reference = resolveEdgeMarkerStates({ energizedIds: energized, flash, reducedMotion: true, timeMs: 0 });
    for (let ms = 0; ms <= 8000; ms += 137) {
      const states = resolveEdgeMarkerStates({ energizedIds: energized, flash, reducedMotion: true, timeMs: ms });
      expect(states).toEqual(reference);
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

describe('header controls and depth', () => {
  const overlaps = (a: EdgeRect, b: EdgeRect, gap: number): boolean => (
    a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap
  );
  const layoutFor = (width: number, height: number, surface: 'menu' | 'play') => (
    resolveLegacyMenuLayout(width, height, 50, 49, 49, surface, { menuActionMode: 'authenticated' })
  );

  test.each([
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 1280, height: 720 }
  ])('no diamond overlaps a header control (+8 px clearance) at $width x $height', (viewport) => {
    for (const surface of ['menu', 'play'] as const) {
      const controls = resolveHeaderControlRects(layoutFor(viewport.width, viewport.height, surface));
      expect(controls).toHaveLength(3);
      const stations = resolveEdgeStations(viewport, undefined, controls);
      expect(stations.map((station) => station.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      for (const station of stations) {
        const bounds = resolveEdgeMarkerBounds(station);
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.top).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(viewport.width);
        expect(bounds.bottom).toBeLessThanOrEqual(viewport.height);
        for (const control of controls) {
          expect(
            overlaps(bounds, control, EDGE_MARKER_CONTROL_CLEARANCE_PX),
            `station ${station.id} vs control ${JSON.stringify(control)}`
          ).toBe(false);
        }
      }
      // Only the two top corners ever move (along the edge); every other station keeps its base position.
      const base = resolveEdgeStations(viewport);
      base.forEach((station, index) => {
        if (station.id !== 0 && station.id !== 2) {
          expect(stations[index]).toEqual(station);
        } else {
          expect(stations[index]?.y).toBe(station.y);
        }
      });
    }
  });

  test('at 390x844 the un-nudged top corners DO collide (the nudge is load-bearing)', () => {
    const controls = resolveHeaderControlRects(layoutFor(390, 844, 'menu'));
    const base = resolveEdgeStations({ width: 390, height: 844 });
    const colliding = [0, 2].filter((id) => controls.some((control) => overlaps(resolveEdgeMarkerBounds(base[id] as EdgeStationLike), control, 0)));
    expect(colliding).toEqual([0, 2]);
  });

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
  }, 30000);

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

  test('arrival: beams run diamond -> spawn tile; departure: player -> diamond (the mirror)', () => {
    const inward = resolveEdgeBeams({ direction: 'inward', focus, laserProgress: 0.5, spawnPop: 0, stations });
    const outward = resolveEdgeBeams({ direction: 'outward', focus, laserProgress: 0.5, spawnPop: 0, stations });
    stations.forEach((station, index) => {
      expect(inward.beams[index]?.from).toEqual({ x: station.x, y: station.y });
      expect(inward.beams[index]?.to).toEqual(focus);
      expect(outward.beams[index]?.from).toEqual(focus);
      expect(outward.beams[index]?.to).toEqual({ x: station.x, y: station.y });
    });
  });

  test('a diamond brightens only while its beam fires', () => {
    const before = resolveEdgeBeams({ direction: 'inward', focus, laserProgress: 0, spawnPop: 0, stations });
    const landed = resolveEdgeBeams({ direction: 'inward', focus, laserProgress: 1, spawnPop: 0, stations });
    expect(before.firingIds.size).toBe(0);
    expect(landed.firingIds.size).toBe(0);
    const states = resolveEdgeMarkerStates({ energizedIds: new Set([2]), reducedMotion: false, timeMs: 0 });
    expect(states[2]?.alpha).toBeGreaterThan(states[1]?.alpha ?? 1);
  });

  test('inward beams end in a 6-sparkle poof around the spawn tile, only after all beams landed', () => {
    expect(resolveEdgeBeams({ direction: 'inward', focus, laserProgress: 0.9, spawnPop: 0.5, stations }).sparkles).toHaveLength(0);
    const poof = resolveEdgeBeams({ direction: 'inward', focus, laserProgress: 1, spawnPop: 0.5, stations });
    expect(poof.sparkles).toHaveLength(6);
    for (const sparkle of poof.sparkles) {
      expect(Math.hypot(sparkle.x - focus.x, sparkle.y - focus.y)).toBeCloseTo(9, 6);
    }
    expect(resolveEdgeBeams({ direction: 'inward', focus, laserProgress: 1, spawnPop: 1, stations }).sparkles).toHaveLength(0);
    expect(resolveEdgeBeams({ direction: 'outward', focus, laserProgress: 1, spawnPop: 0.5, stations }).sparkles).toHaveLength(0);
  });

  test('each beam draws a 3 px glow + a 1 px core + a head dot, in palette tokens', () => {
    const recorder = makeRecorder();
    drawEdgeBeams(recorder, { direction: 'inward', focus, laserProgress: 0.5, spawnPop: 0, stations });
    expect(recorder.lineWidths).toEqual(Array.from({ length: 8 }, () => [3, 1]).flat());
    expect(recorder.lineColors).toEqual(Array.from({ length: 8 }, () => [cyberArcadeMaterial.signal.player, cyberArcadeMaterial.rail.mint]).flat());
    expect(recorder.circles).toHaveLength(8);
    expect(recorder.lineBetweenCount).toBe(16);
  });

  test('nothing draws before launch or after landing', () => {
    const recorder = makeRecorder();
    drawEdgeBeams(recorder, { direction: 'outward', focus, laserProgress: 0, spawnPop: 0, stations });
    drawEdgeBeams(recorder, { direction: 'outward', focus, laserProgress: 1, spawnPop: 0, stations });
    expect(recorder.lineBetweenCount).toBe(0);
  });
});

interface Recorder extends EdgeGraphics {
  calls: string[];
  lineWidths: number[];
  lineColors: number[];
  circles: Array<{ x: number; y: number; radius: number }>;
  lineBetweenCount: number;
}

function makeRecorder(): Recorder {
  const recorder: Recorder = {
    calls: [],
    lineWidths: [],
    lineColors: [],
    circles: [],
    lineBetweenCount: 0,
    fillStyle() { recorder.calls.push('fillStyle'); },
    lineStyle(width: number, color: number) { recorder.calls.push('lineStyle'); recorder.lineWidths.push(width); recorder.lineColors.push(color); },
    beginPath() { recorder.calls.push('beginPath'); },
    moveTo() { recorder.calls.push('moveTo'); },
    lineTo() { recorder.calls.push('lineTo'); },
    closePath() { recorder.calls.push('closePath'); },
    fillPath() { recorder.calls.push('fillPath'); },
    strokePath() { recorder.calls.push('strokePath'); },
    fillCircle(x: number, y: number, radius: number) { recorder.calls.push('fillCircle'); recorder.circles.push({ x, y, radius }); },
    lineBetween() { recorder.calls.push('lineBetween'); recorder.lineBetweenCount += 1; }
  };
  return recorder;
}
