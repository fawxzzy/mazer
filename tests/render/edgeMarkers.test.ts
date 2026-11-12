import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuPathTitleOrbitPose } from '../../src/legacy-runtime/legacyMenuTitle';
import {
  EDGE_MARKER_IDLE_ALPHA_MAX,
  EDGE_RING_BUILD_LIT,
  EDGE_MARKER_IDLE_ALPHA_MIN,
  EDGE_MARKER_IDLE_PERIOD_MS,
  EDGE_MARKER_FLASH_MS,
  EDGE_MARKER_MAX_EXTENT_PX,
  EDGE_MARKER_MIN_INSET_PX,
  EDGE_MIDPOINT_STATION_ID,
  EDGE_STATION_COUNT,
  drawEdgeMarker,
  drawEdgeMarkers,
  drawEdgeBeams,
  resolveEdgeMarkerIdleAlpha,
  resolveEdgeStationNormalExtent,
  resolveEdgeRingEnergies,
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
  INTRO_BEAM_STAGGER_MS,
  INTRO_BUILD_START_MS,
  INTRO_LASER_MS,
  OUTRO_TILES_START_MS,
  RING_ENERGY_FADE_MS,
  resolveIntro,
  resolveIntroDeconstruct,
  resolveIntroLaserEndMs,
  resolveIntroLaserStartMs,
  resolveIntroRevealEndMs,
  resolveOutroTotalMs
} from '../../src/render/introTimeline';
import { resolveTeleportAnchorPoses } from '../../src/render/teleportAnchorPose';

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
  test.each(VIEWPORTS)('all 8 kites rest fully inside a $width x $height viewport with the outer tip flush to its edge', (viewport) => {
    const stations = resolveEdgeStations(viewport);
    expect(stations).toHaveLength(EDGE_STATION_COUNT);
    for (const station of stations) {
      const vertices = resolveEdgeMarkerVertices(station);
      // Nothing clipped at rest (outline vertex +/- half a stroke)...
      for (const vertex of vertices) {
        expect(vertex.x - 0.5).toBeGreaterThanOrEqual(-1e-9);
        expect(vertex.y - 0.5).toBeGreaterThanOrEqual(-1e-9);
        expect(vertex.x + 0.5).toBeLessThanOrEqual(viewport.width + 1e-9);
        expect(vertex.y + 0.5).toBeLessThanOrEqual(viewport.height + 1e-9);
      }
      // ...and the outer tip touches the screen edge the station sits on (0 px gap).
      const gaps = {
        top: Math.min(...vertices.map((vertex) => vertex.y)) - 0.5,
        bottom: viewport.height - (Math.max(...vertices.map((vertex) => vertex.y)) + 0.5),
        left: Math.min(...vertices.map((vertex) => vertex.x)) - 0.5,
        right: viewport.width - (Math.max(...vertices.map((vertex) => vertex.x)) + 0.5)
      };
      expect(gaps[station.side], `station ${station.id} gap to ${station.side}`).toBeCloseTo(0, 9);
      // Any orientation stays within the max extent of the centre.
      for (let degrees = 0; degrees < 360; degrees += 15) {
        for (const vertex of resolveEdgeMarkerVertices({ ...station, inwardAngle: (degrees * Math.PI) / 180 }, 1)) {
          expect(Math.hypot(vertex.x - station.x, vertex.y - station.y)).toBeLessThanOrEqual(EDGE_MARKER_MAX_EXTENT_PX + 1e-9);
        }
      }
    }
    expect(EDGE_MARKER_MAX_EXTENT_PX).toBeLessThanOrEqual(EDGE_MARKER_MIN_INSET_PX);
    // Midpoint kites reach 10.5 px from the centre toward their edge; 45 degree corner kites ~7.57 px.
    expect(resolveEdgeStationNormalExtent(1)).toBeCloseTo(10.5, 9);
    expect(resolveEdgeStationNormalExtent(3)).toBeCloseTo(10.5, 9);
    expect(resolveEdgeStationNormalExtent(0)).toBeCloseTo((10 * Math.SQRT1_2) + 0.5, 9);
  });

  test('fixed positions: top row is 12 / w/2 / w-12 and the layout depends on the viewport size ONLY', () => {
    const stations = resolveEdgeStations({ width: 390, height: 844 });
    expect([stations[0]?.x, stations[1]?.x, stations[2]?.x]).toEqual([12, 195, 378]);
    expect(stations[1]?.y).toBeCloseTo(10.5, 9);
    expect(stations[5]?.y).toBeCloseTo(844 - 10.5, 9);
    expect(stations[3]?.x).toBeCloseTo(390 - 10.5, 9);
    expect(stations[7]?.x).toBeCloseTo(10.5, 9);
    expect(stations[3]?.y).toBeCloseTo(422, 9);
    expect(stations[7]?.y).toBeCloseTo(422, 9);
    expect(resolveEdgeStations.length).toBe(1);
    const wide = resolveEdgeStations({ width: 1280, height: 720 });
    expect([wide[0]?.x, wide[1]?.x, wide[2]?.x]).toEqual([12, 640, 1268]);
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
    expect(body).toContain('return resolveEdgeStations({ width: this.layout.width, height: this.layout.height });');
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
    // everything that shoots out of the player is the player colour (one token, trailPalette.PLAYER_COLOR)
    expect(recorder.lineColors).toEqual(Array.from({ length: 8 }, () => [PLAYER_COLOR, PLAYER_COLOR]).flat());
    expect(recorder.fillColors.every((color) => color === PLAYER_COLOR)).toBe(true);
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

describe('scene wiring of the ring lifecycle', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
  const section = (from: string, to: string): string => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

  test('the ring keeps its intro clock after the build settles so the fade-out and the last clearing redraw play', () => {
    const helper = section('private resolveLegacyEdgeRingIntroState(', 'private resolveLegacyOutroState(');
    expect(helper).toContain("this.menuStaticDrawLifecyclePhase !== 'building' && this.menuStaticDrawLifecyclePhase !== 'settled'");
    const ring = section('private resolveLegacyEdgeRing(', 'private drawLegacyEdgeMarkers(');
    expect(ring).toContain('this.resolveLegacyEdgeRingIntroState(time)');
    expect(ring).toContain('outro.ringEnergy');
    expect(ring).toContain('intro.ringEnergy');
    // Reduced motion and overlays: no lifecycle at all.
    expect(ring).toContain('this.prefersLegacyReducedMotion() || this.overlay !== \'none\'');
  });

  test('markers redraw every frame while the lifecycle is active and once more after it ends', () => {
    const lasers = section('private drawLegacyEdgeLasers(', 'private resolveLegacyEdgeRing(');
    expect(lasers).toContain('if (firing || this.edgeBeamWasFiring || ringActive || this.edgeRingActive) {');
    expect(lasers).toContain('this.edgeRingActive = ringActive;');
    // The dirty-flag gate keeps drawDynamicBoard running for the same condition.
    expect(source).toContain('      || this.edgeRingActive\n    ) {\n      this.boardDynamicDirty = true;');
  });
});

describe('ring lighting and spin over the intro / outro timelines (per frame)', () => {
  const TILES = 300;
  const FULL = { reducedMotion: false, tileCount: TILES } as const;
  const energiesAt = (direction: 'inward' | 'outward', ms: number): ReadonlyArray<number> => {
    if (direction === 'inward') {
      const intro = resolveIntro(ms, FULL);
      return resolveEdgeRingEnergies(intro.done ? null : { direction, laserProgress: intro.laserProgress, ringEnergy: intro.ringEnergy });
    }
    const outro = resolveIntroDeconstruct(ms, FULL);
    return resolveEdgeRingEnergies(outro.done ? null : { direction, laserProgress: outro.laserProgress, ringEnergy: outro.ringEnergy });
  };
  const litCount = (energies: ReadonlyArray<number>): number => energies.filter((energy) => energy > 0).length;
  const fullyLit = (energies: ReadonlyArray<number>): number => energies.filter((energy) => energy === 1).length;

  test('arrival: ALL 8 diamonds are lit from the start of the build and brighten as THEIR beam fires (after the build), then fade together', () => {
    const buildEnd = resolveIntroRevealEndMs(TILES);
    const laserStart = resolveIntroLaserStartMs(TILES);
    const laserEnd = resolveIntroLaserEndMs(TILES);
    expect(laserStart).toBe(buildEnd);
    // Lit from the very first frame, at the build level, for the whole build (the ring is orbiting): never dark, never full.
    for (let ms = 0; ms <= buildEnd; ms += 1) {
      const energies = energiesAt('inward', ms);
      expect(litCount(energies), `t=${ms}`).toBe(8);
      expect(energies.every((energy) => energy === EDGE_RING_BUILD_LIT), `t=${ms}`).toBe(true);
    }
    // Each diamond brightens only when its own beam leaves, all the way to full by its landing; never dims in between.
    for (let index = 0; index < 8; index += 1) {
      let previous = EDGE_RING_BUILD_LIT;
      for (let ms = buildEnd; ms <= laserEnd; ms += 1) {
        const energy = energiesAt('inward', ms)[index] as number;
        expect(energy, `diamond ${index} t=${ms}`).toBeGreaterThanOrEqual(previous - 1e-12);
        previous = energy;
      }
      expect(previous, `diamond ${index}`).toBe(1);
    }
    expect(energiesAt('inward', Math.ceil(buildEnd) + 1)[0]).toBeGreaterThan(EDGE_RING_BUILD_LIT);
    expect(fullyLit(energiesAt('inward', Math.ceil(laserEnd)))).toBe(8);
    // Then the ring fades out together, monotonically, to exactly 0 and stays 0 through done.
    let previous = 8;
    for (let ms = laserEnd; ms <= laserEnd + RING_ENERGY_FADE_MS; ms += 1) {
      const total = energiesAt('inward', ms).reduce((sum, energy) => sum + energy, 0);
      expect(total).toBeLessThanOrEqual(previous + 1e-9);
      previous = total;
    }
    expect(previous).toBe(0);
    for (let ms = laserEnd + RING_ENERGY_FADE_MS; ms <= laserEnd + 3000; ms += 1) {
      expect(litCount(energiesAt('inward', ms)), `t=${ms}`).toBe(0);
    }
  });

  test('departure: a diamond lights as the player beam REACHES it; all 8 lit when the beams land and held until the end fade', () => {
    const total = resolveOutroTotalMs(TILES);
    expect(litCount(energiesAt('outward', 0))).toBe(0);
    for (let index = 0; index < 8; index += 1) {
      let landedAt = Number.POSITIVE_INFINITY;
      let litAt = Number.POSITIVE_INFINITY;
      for (let ms = 0; ms <= 600; ms += 1) {
        const outro = resolveIntroDeconstruct(ms, FULL);
        if (landedAt === Number.POSITIVE_INFINITY && resolveEdgeBeamProgress(outro.laserProgress, index) >= 1) {
          landedAt = ms;
        }
        if (litAt === Number.POSITIVE_INFINITY && energiesAt('outward', ms)[index] === 1) {
          litAt = ms;
        }
      }
      // Fully lit exactly when its beam arrives; not lit while the beam is still well short of it.
      expect(litAt, `diamond ${index}`).toBe(landedAt);
      expect(energiesAt('outward', Math.max(0, landedAt - 120))[index]).toBeLessThan(1);
    }
    // By the time all outbound beams have landed (400 ms) all 8 are lit, and stay lit until the last 150 ms.
    for (let ms = 400; ms <= total - RING_ENERGY_FADE_MS; ms += 1) {
      expect(fullyLit(energiesAt('outward', ms)), `t=${ms}`).toBe(8);
    }
    // Fade out together and end unlit (no stale lit frame after the outro).
    expect(litCount(energiesAt('outward', total))).toBe(0);
    for (let ms = total; ms <= total + 2000; ms += 25) {
      expect(litCount(energiesAt('outward', ms))).toBe(0);
    }
  });

  test('no lifecycle (rest) and reduced motion are completely unlit and unspun', () => {
    expect(resolveEdgeRingEnergies(null)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    const states = resolveEdgeMarkerStates({
      reducedMotion: true,
      ringEnergies: [1, 1, 1, 1, 1, 1, 1, 1],
      spinRad: 3,
      timeMs: 0
    });
    expect(states.every((state) => !state.energized && state.energy === 0 && state.spinRad === 0)).toBe(true);
    for (let ms = 0; ms <= 4000; ms += 50) {
      const intro = resolveIntro(ms, { reducedMotion: true, tileCount: TILES });
      const outro = resolveIntroDeconstruct(ms, { reducedMotion: true, tileCount: TILES });
      expect([intro.ringSpinRad, intro.ringEnergy, outro.ringSpinRad, outro.ringEnergy]).toEqual([0, 0, 0, 0]);
    }
  });

  test('the markers draw all 8 player-coloured cores while the ring is lit and none at rest; the border is the live trail colour either way', () => {
    const stations = resolveEdgeStations({ width: 390, height: 844 });
    const lit = resolveEdgeMarkerStates({
      reducedMotion: false,
      ringEnergies: resolveEdgeRingEnergies({ direction: 'inward', laserProgress: 1, ringEnergy: 1 }),
      timeMs: 0
    });
    const litRecorder = makeRecorder();
    drawEdgeMarkers(litRecorder, stations, lit);
    expect(litRecorder.calls.filter((call) => call === 'fillPath')).toHaveLength(8);
    expect(litRecorder.fillColors).toEqual(Array.from({ length: 8 }, () => PLAYER_COLOR));
    // the border never goes mint when lit: it is the trail palette's colour at the trail head (here no trail: distance 0, t 0)
    const border = resolveTrailPaletteBorderColor(0, 0, false);
    expect(litRecorder.lineColors).toEqual(Array.from({ length: 8 }, () => border));
    const rest = resolveEdgeMarkerStates({ reducedMotion: false, ringEnergies: resolveEdgeRingEnergies(null), timeMs: 0 });
    const restRecorder = makeRecorder();
    drawEdgeMarkers(restRecorder, stations, rest);
    expect(restRecorder.calls.filter((call) => call === 'fillPath')).toHaveLength(0);
    expect(restRecorder.lineColors).toEqual(Array.from({ length: 8 }, () => border));
  });

  test('orbit phase: parked while the beams fly, then one full lap (build clockwise, deconstruct counter-clockwise), exactly 0 at both ends', () => {
    const introEnd = resolveIntroRevealEndMs(TILES);
    const outroEnd = resolveOutroTotalMs(TILES);
    const cases = [
      { label: 'intro', startMs: INTRO_BUILD_START_MS, end: introEnd, sign: 1, phaseAt: (ms: number) => resolveIntro(ms, FULL).ringSpinRad },
      { label: 'outro', startMs: OUTRO_TILES_START_MS, end: outroEnd, sign: -1, phaseAt: (ms: number) => resolveIntroDeconstruct(ms, FULL).ringSpinRad }
    ];
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

  test.each(ORBIT_VIEWPORTS)('no kite vertex (plus half a stroke) ever leaves the viewport at any phase at $width x $height; top/bottom travel is flush', (viewport) => {
    let flushSamples = 0;
    for (let index = 0; index <= 2400; index += 1) {
      const phase = (index / 2400) * Math.PI * 2;
      for (const station of resolveOrbitingEdgeStations(viewport, phase)) {
        const vertices = resolveEdgeMarkerVertices(station);
        const minX = Math.min(...vertices.map((vertex) => vertex.x)) - 0.5;
        const maxX = Math.max(...vertices.map((vertex) => vertex.x)) + 0.5;
        const minY = Math.min(...vertices.map((vertex) => vertex.y)) - 0.5;
        const maxY = Math.max(...vertices.map((vertex) => vertex.y)) + 0.5;
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
  }, 30_000);

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
  }, 30_000);

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
      expect(inward.beams[index]?.from).toEqual({ x: station.x, y: station.y });
      expect(outward.beams[index]?.to).toEqual({ x: station.x, y: station.y });
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
        if (outro.laserProgress < 1) {
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

  test('the player colour is one token: the player marker, the diamonds core and the beams all read PLAYER_COLOR', () => {
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
