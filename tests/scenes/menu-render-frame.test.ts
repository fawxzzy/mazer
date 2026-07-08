import { describe, expect, test } from 'vitest';
import {
  resolveLegacyDynamicMarkerInset,
  resolveLegacyDynamicTrailStrokeWidth,
  resolveLegacyEndpointMarkerRenderMetrics,
  resolveLegacyMenuPathRenderFrame,
  resolveLegacyMenuPathRenderFrames,
  resolveLegacyMenuPathRenderSegments,
  resolveLegacyPlayerLocatorRenderMetrics,
  resolveLegacyPlayerMarkerRenderMetrics
} from '../../src/legacy-runtime/legacyMenuRender';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('resolveLegacyMenuPathRenderFrame', () => {
  test('caps active Phaser rendering to mobile-friendly 60 FPS', () => {
    const phaserConfigSource = readFileSync(resolve(process.cwd(), 'src/boot/phaserConfig.ts'), 'utf8');
    const baseCssSource = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

    expect(phaserConfigSource).toContain('type: Phaser.CANVAS');
    expect(phaserConfigSource).toContain('pixelArt: false');
    expect(phaserConfigSource).toContain('antialias: true');
    expect(phaserConfigSource).toContain('roundPixels: true');
    expect(phaserConfigSource).toContain('autoRound: true');
    expect(baseCssSource).toContain('image-rendering: auto;');
    expect(baseCssSource).not.toContain('image-rendering: pixelated;');
    expect(baseCssSource).not.toContain('image-rendering: crisp-edges;');
    expect(phaserConfigSource).toContain('fps: {');
    expect(phaserConfigSource).toContain('target: 60');
    expect(phaserConfigSource).toContain('min: 30');
    expect(phaserConfigSource).not.toContain('forceSetTimeOut: true');
  });

  test('bridges connected neighbors to tile edges for legacy trench continuity', () => {
    const maze = {
      size: 3,
      grid: [
        [false, false, false],
        [true, true, true],
        [false, false, false]
      ]
    };

    expect(resolveLegacyMenuPathRenderFrame(maze, { x: 1, y: 1 }, 20)).toEqual({
      leftInset: 0,
      topInset: 3,
      width: 20,
      height: 14
    });
  });

  test('keeps closed-edge insets where the path does not continue', () => {
    const maze = {
      size: 3,
      grid: [
        [false, false, false],
        [false, true, false],
        [false, true, false]
      ]
    };

    expect(resolveLegacyMenuPathRenderFrame(maze, { x: 1, y: 1 }, 20)).toEqual({
      leftInset: 3,
      topInset: 3,
      width: 14,
      height: 17
    });
  });

  test('bridges the light core across connected neighbors for a less checkerboarded slab read', () => {
    const maze = {
      size: 3,
      grid: [
        [false, false, false],
        [true, true, true],
        [false, false, false]
      ]
    };

    expect(resolveLegacyMenuPathRenderFrames(maze, { x: 1, y: 1 }, 20)).toEqual({
      edge: {
        leftInset: 0,
        topInset: 3,
        width: 20,
        height: 14
      },
      core: {
        leftInset: 0,
        topInset: 4,
        width: 20,
        height: 12
      }
    });
  });

  test('preserves four-way joins as solid connected intersections', () => {
    const maze = {
      size: 3,
      grid: [
        [false, true, false],
        [true, true, true],
        [false, true, false]
      ]
    };

    expect(resolveLegacyMenuPathRenderFrames(maze, { x: 1, y: 1 }, 20)).toEqual({
      edge: {
        leftInset: 0,
        topInset: 0,
        width: 20,
        height: 20
      },
      core: {
        leftInset: 0,
        topInset: 0,
        width: 20,
        height: 20
      }
    });
  });

  test('renders four-way menu joins as corridor segments instead of one filled tile', () => {
    const maze = {
      size: 3,
      grid: [
        [false, true, false],
        [true, true, true],
        [false, true, false]
      ]
    };

    const segments = resolveLegacyMenuPathRenderSegments(maze, { x: 1, y: 1 }, 20);

    expect(segments.edge).toEqual([
      { leftInset: 3, topInset: 3, width: 14, height: 14 },
      { leftInset: 0, topInset: 3, width: 17, height: 14 },
      { leftInset: 3, topInset: 3, width: 17, height: 14 },
      { leftInset: 3, topInset: 0, width: 14, height: 17 },
      { leftInset: 3, topInset: 3, width: 14, height: 17 }
    ]);
    expect(segments.core).toEqual([
      { leftInset: 4, topInset: 4, width: 12, height: 12 },
      { leftInset: 0, topInset: 4, width: 16, height: 12 },
      { leftInset: 4, topInset: 4, width: 16, height: 12 },
      { leftInset: 4, topInset: 0, width: 12, height: 16 },
      { leftInset: 4, topInset: 4, width: 12, height: 16 }
    ]);
  });

  test('keeps phone-sized tiles separated instead of merging adjacent cells into blocks', () => {
    const maze = {
      size: 3,
      grid: [
        [false, true, false],
        [true, true, true],
        [false, true, false]
      ]
    };

    const segments = resolveLegacyMenuPathRenderSegments(maze, { x: 1, y: 1 }, 6);

    expect(segments.edge[0]).toEqual({ leftInset: 1, topInset: 1, width: 4, height: 4 });
    expect(segments.core[0]).toEqual({ leftInset: 2, topInset: 2, width: 2, height: 2 });
  });

  test('keeps the menu board in the clean 2d maze-material lane', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const legacyMenuRenderSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMenuRender.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_BOARD_GRID_ALPHA = 0;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PANEL_SHADOW_ALPHA = 0;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_CORE = 0xe7fff4;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE = 0x0d3c4f;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE_ALPHA = 0.58;');
    expect(menuSceneSource).not.toContain('LEGACY_MENU_PATH_RELIEF_SHADOW');
    expect(menuSceneSource).not.toContain('LEGACY_MENU_PATH_RELIEF_OFFSET_RATIO');
    expect(menuSceneSource).toContain('const LEGACY_MENU_WALL_FILL = 0x07111d;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_WALL_GLASS_ALPHA = 0.18;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_BOARD_GLASS_ALPHA = 0.1;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_BORDER_PRIMARY = 0x72e0bf;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_BORDER_SECONDARY = 0xb7f2ff;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_BACKGROUND_ALPHA = 0.12;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_BASE = 0x10293a;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_GLOW = 0xb7f2ff;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_IRIS = 0x72e0bf;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_PRISM = 0xffd66b;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_HOTSPOT = 0xffffff;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_ALPHA = 0.34;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_SIZE_RATIO = 0.066;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_SHIMMER_MS = 1600;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_FRAME_MS = 50;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_MAZE_SAFE_INSET_RATIO = 0.018;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_MAZE_SAFE_INSET_MIN = 4;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_MAZE_SAFE_INSET_MAX = 7;');
    expect(menuSceneSource).toContain('if (isMenuMode && LEGACY_BOARD_GRID_ALPHA > 0) {');
    expect(menuSceneSource).toContain('Keep the board top-down: no pseudo bevel/highlight pass over the maze.');
    expect(menuSceneSource).toContain('const boardFill = LEGACY_PLAY_BOARD_FILL;');
    expect(menuSceneSource).toContain('this.fillLegacyBoardEdgeFrame(boardLeft, boardTop, boardSize, boardEdge);');
    expect(menuSceneSource).toContain('private fillLegacyBoardEdgeFrame(');
    expect(menuSceneSource).toContain('private resolveLegacyMazeRenderFrame(');
    expect(menuSceneSource).toContain('const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(boardLeft, boardTop, boardSize);');
    expect(menuSceneSource).toContain('const mazeLeft = mazeRenderFrame.boardLeft;');
    expect(menuSceneSource).toContain('const mazeTop = mazeRenderFrame.boardTop;');
    expect(menuSceneSource).not.toContain('this.boardStaticGraphics.fillRect(boardLeft - 1, boardTop - 1, boardSize + 2, boardSize + 2);');
    expect(legacyMenuRenderSource).toContain('const LEGACY_MENU_TRENCH_EDGE_INSET_RATIO = 0.18;');
    expect(legacyMenuRenderSource).toContain('const LEGACY_MENU_TRENCH_CORE_INSET_RATIO = 0.08;');
    expect(legacyMenuRenderSource).toContain('const resolveLegacyMenuTrenchInset = (tileSize: number, ratio: number): number => {');
    expect(menuSceneSource).toContain('const drawPathPoint = (point: LegacyPoint): void => {');
    expect(menuSceneSource).toContain('private drawLegacyPathMaterialTile(');
    expect(menuSceneSource).toContain('private resolveLegacyPixelTileRect(');
    expect(menuSceneSource).toContain('const tileRect = this.resolveLegacyPixelTileRect(mazeLeft, mazeTop, tileSize, { x, y });');
    expect(menuSceneSource).toContain('const tileRect = this.resolveLegacyPixelTileRect(originX, originY, tileSize, point);');
    expect(menuSceneSource).toContain('const materialTileSize = Math.max(1, Math.round(tileSize));');
    expect(menuSceneSource).toContain('resolveLegacyMenuPathRenderSegments(pathSource, point, materialTileSize);');
    expect(menuSceneSource).toContain('resolveLegacyMenuPathRenderFrames(pathSource, point, materialTileSize);');
    expect(menuSceneSource).toContain('Math.round(originX + (point.x * tileSize))');
    expect(menuSceneSource).toContain('Math.round(((frame.leftInset + frame.width) / materialTileSize) * tileRect.width)');
    expect(menuSceneSource).toContain('for (let index = 0; index < Math.min(tileLimit, this.menuStaticDrawTileOrder.length); index += 1)');
    expect(menuSceneSource).toContain('isMenuMode ? pathGlow : LEGACY_PLAY_PATH_EDGE');
    expect(menuSceneSource).toContain('renderBounds: mazeRenderBounds');
    expect(menuSceneSource).toContain('renderSafeInset: mazeRenderFrame.safeInset');
    expect(menuSceneSource).toContain('isMenuMode ? LEGACY_MENU_BOARD_GLASS_ALPHA : LEGACY_PLAY_BOARD_GLASS_ALPHA');
    expect(menuSceneSource).toContain('isMenuMode ? LEGACY_MENU_WALL_GLASS_ALPHA : LEGACY_PLAY_WALL_GLASS_ALPHA');
    expect(menuSceneSource).toContain('this.drawLegacyBoardSigilBorder(boardLeft, boardTop, boardSize);');
    expect(menuSceneSource).toContain('private drawLegacyBoardSigilBorder(boardLeft: number, boardTop: number, boardSize: number): void');
    expect(menuSceneSource).toContain('private drawLegacyBoardCornerFacetShimmer(boardLeft: number, boardTop: number, boardSize: number, time: number): void');
    expect(menuSceneSource).toContain('private hasLegacyBoardCornerShimmerPendingFrame(time: number): boolean');
    expect(menuSceneSource).toContain('this.drawLegacyBoardCornerFacetShimmer(resolvedBoardLeft, resolvedBoardTop, boardSize, time);');
    expect(menuSceneSource).toContain('const corner = Math.max(16, Math.round(boardSize * LEGACY_BOARD_SIGIL_CORNER_FACET_SIZE_RATIO));');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.fillStyle(LEGACY_BOARD_SIGIL_CORNER_FACET_GLOW, baseAlpha * (0.18 + (wave * 0.18)));');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.fillTriangle(originX, originY, edgeX, originY, originX, edgeY);');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.fillStyle(LEGACY_BOARD_SIGIL_CORNER_FACET_PRISM, prismAlpha);');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.lineStyle(1, LEGACY_BOARD_SIGIL_CORNER_FACET_HOTSPOT, glintAlpha * 0.46);');
    expect(menuSceneSource).toContain('cornerFacet: {');
    expect(menuSceneSource).toContain('animated: true');
    expect(menuSceneSource).toContain('shimmerPeriodMs: LEGACY_BOARD_SIGIL_CORNER_FACET_SHIMMER_MS');
    expect(menuSceneSource).toContain('private drawLegacyMenuDeconstructHandoffBurst(');
    expect(menuSceneSource).toContain('this.drawLegacyMenuDeconstructHandoffBurst(');
    expect(menuSceneSource).toContain('this.resolveLegacyMenuBuildPrerollProgress(time)');
    expect(menuSceneSource).toContain('this.isLegacyMenuDeconstructHandoffActive(time)');
    expect(menuSceneSource).toContain('this.isLegacyMenuDeconstructVisualHandoffReady()');
    expect(menuSceneSource).toContain('handoffEndsAtMs: this.menuStaticDeconstructZeroHoldStartedAtMs === null');
    expect(menuSceneSource).toContain('zeroHoldStartedAtMs: this.menuStaticDeconstructZeroHoldStartedAtMs === null');
    expect(menuSceneSource).toContain('titleVisiblePieces');
    expect(menuSceneSource).toContain('titleFullyDeconstructed');
    expect(menuSceneSource).toContain('LEGACY_MENU_DECONSTRUCT_BURST_COLOR');
    expect(menuSceneSource).toContain('private drawLegacyBackdropSigils(width: number, height: number, time: number): void');
    expect(menuSceneSource).toContain('resolveLegacyMenuBackdropGlassShards(');
    expect(menuSceneSource).toContain('resolveLegacyMenuBackdropDriftRunes(');
    expect(menuSceneSource).toContain('glassShards: LEGACY_MENU_GLASS_SHARD_COUNT');
    expect(menuSceneSource).toContain('driftRunes: LEGACY_MENU_DRIFT_RUNE_COUNT');
    expect(menuSceneSource).toContain('drawLegacyBackdropShard(');
    expect(menuSceneSource).toContain('drawLegacyBackdropRune(');
    expect(menuSceneSource).not.toContain('this.backdropGraphics.fillCircle');
    expect(legacyMenuRenderSource).toContain('resolveLegacyMenuPathStrokeSegments');
    expect(menuSceneSource).toContain('Keep wall cells flat and glassy so the backdrop shows through without fake bevel/depth.');
  });

  test('reflects the gothic cyber border motif into the backdrop layer', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const backdropSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMenuBackdrop.ts'), 'utf8');

    expect(backdropSource).toContain('fieldColor: 0x090d19');
    expect(backdropSource).toContain('fieldColor: 0x10172c');
    expect(menuSceneSource).toContain('this.drawLegacyBackdropSigils(width, height, this.time.now);');
    expect(backdropSource).toContain('LEGACY_MENU_BACKDROP_SHARD_COUNT');
    expect(backdropSource).toContain('LEGACY_MENU_GLASS_SHARD_COUNT');
    expect(backdropSource).toContain('LEGACY_MENU_DRIFT_RUNE_COUNT');
    expect(backdropSource).toContain("LEGACY_MENU_BACKDROP_STAR_MOTION = 'radial-warp'");
    expect(backdropSource).toContain('resolveLegacyMenuBackdropWarpVector');
    expect(backdropSource).toContain('resetLegacyMenuBackdropStarNearWarpOrigin');
    expect(menuSceneSource).toContain('starMotion: LEGACY_MENU_BACKDROP_STAR_MOTION');
    expect(backdropSource).toContain('resolveLegacyMenuBackdropGlassShards');
    expect(backdropSource).toContain('resolveLegacyMenuBackdropDriftRunes');
    expect(menuSceneSource).toContain('0.7 + (Math.sin(time / 1800) * 0.3)');
    expect(menuSceneSource).toContain('this.backdropGraphics.fillStyle(shard.color, shard.alpha * 0.038);');
    expect(backdropSource).toContain('const roundBackdropNumber = (value: number): number => Math.round(value * 1000) / 1000;');
    expect(backdropSource).toContain('const localPhase = phase * (0.16 + (index * 0.022)) + (index * 1.73);');
    expect(backdropSource).toContain('const driftX = Math.sin(localPhase) * 0.026;');
    expect(backdropSource).toContain('const driftY = Math.cos(localPhase * 0.74) * 0.017;');
    expect(backdropSource).toContain('const tailMagnitude = 0.68 + Math.min(0.28, distanceFromCenter * 0.42);');
    expect(menuSceneSource).toContain('Math.round(pixelX + (stepX * index))');
    expect(menuSceneSource).toContain('const upperRailStart = this.rotateBackdropPoint(shard, -halfLength * 0.86, -halfThickness * 0.58);');
    expect(menuSceneSource).toContain('const upperRailBreakEnd = this.rotateBackdropPoint(shard, halfLength * 0.1, -halfThickness * 0.58);');
    expect(menuSceneSource).toContain('const leadingCutStart = this.rotateBackdropPoint(shard, halfLength * 0.54, -halfThickness - taper);');
    expect(menuSceneSource).toContain('const notchStart = this.rotateBackdropPoint(shard, halfLength * 0.02, -halfThickness * 1.05);');
    expect(menuSceneSource).toContain('const tickStart = this.rotateBackdropPoint(rune, rune.size * 0.16, -rune.size * 0.72);');
    expect(menuSceneSource).toContain('sigils: 4');
  });

  test('keeps active play maze rendering on connected corridors instead of square debug cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_PLAY_PATH_CORE = 0xe7fff4;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PATH_EDGE = 0x0d3c4f;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PATH_EDGE_ALPHA = 0.58;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_WALL_FILL = 0x07111d;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_WALL_GLASS_ALPHA = 0.18;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_BOARD_GLASS_ALPHA = 0.1;');
    expect(menuSceneSource).toContain("private pathVisualStyle: LegacyPathVisualStyle = 'corridor';");
    expect(menuSceneSource).toContain('this.pathVisualStyle = resolveLegacyPathVisualStyle(runtimeSearch);');
    expect(menuSceneSource).toContain("drawCue: this.pathVisualStyle === 'hybrid'");
    expect(menuSceneSource).toContain('pathVisualStyle: this.pathVisualStyle');
    expect(menuSceneSource).toContain('textLabels: this.resolveVisualTextLabels()');
    expect(menuSceneSource).toContain('this.uiTexts.push(label, stateLabel);');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_BOARD_FILL = 0x08111d;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_BOARD_EDGE = 0x031022;');
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_PATH_RELIEF_SHADOW');
    expect(menuSceneSource).toContain('isMenuMode ? pathGlow : LEGACY_PLAY_PATH_EDGE');
    expect(menuSceneSource).toContain('private boardPathGraphics!: Phaser.GameObjects.Graphics;');
    expect(menuSceneSource).toContain('private boardPathDirty = true;');
    expect(menuSceneSource).toContain('this.boardPathGraphics = this.add.graphics();');
    expect(menuSceneSource).toContain('private drawLegacyPathMaterialTile(');
    expect(menuSceneSource).toContain('private titleGraphics!: Phaser.GameObjects.Graphics;');
    expect(menuSceneSource).toContain('this.titleGraphics = this.add.graphics();');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_PRISM = 0xb7f2ff;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_GEM = 0x8fffe8;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_FACET_WARM = 0xffd36a;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_SWEEP_MS = 2600;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_SWEEP_OVERSCAN_COLUMNS = 3;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_GEM_PULSE_MS = 3400;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_ORBIT_MS = 6200;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_FRAME_MS = 66;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS = 6;');
    expect(menuSceneSource).toContain('private drawLegacyMenuPathTitle(time: number): void');
    expect(menuSceneSource).toContain("type LegacyMenuPathTitleSweepMode = 'build' | 'deconstruct' | 'idle';");
    expect(menuSceneSource).toContain('interface LegacyMenuPathTitleSweepState');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleSweepState(');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleVisibleSweepEdge(');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleVisibleSweepState(');
    expect(menuSceneSource).toContain('const rightmostVisibleColumn = visibleCells.reduce(');
    expect(menuSceneSource).toContain('this.drawLegacyMenuPathTitleSigilRails(visibleCells, titleLayout, time, titlePresentation.titleAlpha);');
    expect(menuSceneSource).toContain("this.menuStaticDrawLifecyclePhase === 'building'");
    expect(menuSceneSource).toContain("this.menuStaticDrawLifecyclePhase === 'deconstructing'");
    expect(menuSceneSource).toContain("const syncedToLifecycle = mode !== 'idle';");
    expect(menuSceneSource).toContain('private drawLegacyMenuPathTitlePrismSweep(');
    expect(menuSceneSource).toContain('private drawLegacyMenuPathTitleGemFacets(');
    expect(menuSceneSource).toContain('private drawLegacyMenuPathTitleOrbitSigils(');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleOrbitPhase(time: number): number');
    expect(menuSceneSource).toContain('const orbitPhase = this.resolveLegacyMenuPathTitleOrbitPhase(time);');
    expect(menuSceneSource).toContain('const orbit = (orbitPhase + (index / LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS)) % 1;');
    expect(menuSceneSource).not.toContain('phase * 0.62');
    expect(menuSceneSource).toContain('private drawLegacyMenuPathTitleDiamond(');
    expect(menuSceneSource).toContain('private drawLegacyMenuPathTitleSigilRails(');
    expect(menuSceneSource).toContain('private hasLegacyMenuTitleAnimationPendingFrame(time: number): boolean');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleProgress(): number');
    expect(menuSceneSource).toContain('const smoothstep = (value: number): number => {');
    expect(menuSceneSource).toContain('const alpha = clamp(smoothstep(1 - (distance / 2.2)) * 0.72 * pulse * alphaScale, 0, 0.78);');
    expect(menuSceneSource).toContain('const shimmer = smoothstep(0.5 + (Math.sin((localPhase * Math.PI * 2) + (cell.order * 0.37)) * 0.5));');
    expect(menuSceneSource).not.toContain('const rotationStep = Math.floor(phase * 8);');
    expect(menuSceneSource).toContain('this.drawLegacyMenuPathTitle(time);');
    expect(menuSceneSource).toContain('resolveLegacyMenuPathTitleLayout(');
    expect(menuSceneSource).toContain('title: this.resolveLegacyMenuPathTitleDiagnostics()');
    expect(menuSceneSource).toContain('const visiblePieces = this.resolveLegacyMenuPathTitleVisiblePieces(pieceCount)');
    expect(menuSceneSource).toContain('facetCellCount: visiblePieces');
    expect(menuSceneSource).toContain('facetPulsePeriodMs: LEGACY_MENU_PATH_TITLE_GEM_PULSE_MS');
    expect(menuSceneSource).toContain('scannerMode: sweepState.mode');
    expect(menuSceneSource).toContain('scannerProgress: Number(sweepState.progress.toFixed(3))');
    expect(menuSceneSource).toContain('scannerSyncedToLifecycle: sweepState.syncedToLifecycle');
    expect(menuSceneSource).toContain('scannerAttachedToVisibleEdge: sweepState.syncedToLifecycle && visibleSweepEdge !== null');
    expect(menuSceneSource).toContain('scannerVisibleEdgeColumn: visibleSweepEdge === null');
    expect(menuSceneSource).toContain('sigilOrbitCount: LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS');
    expect(menuSceneSource).toContain('sigilOrbitPeriodMs: LEGACY_MENU_PATH_TITLE_ORBIT_MS');
    expect(menuSceneSource).toContain('sigilOrbitPhase: Number(this.resolveLegacyMenuPathTitleOrbitPhase(this.time.now).toFixed(3))');
    expect(menuSceneSource).toContain('sweepPeriodMs: LEGACY_MENU_PATH_TITLE_SWEEP_MS');
    expect(menuSceneSource).toContain('animation: {');
    expect(menuSceneSource).toContain('if (this.boardPathDirty) {');
    expect(menuSceneSource).toContain('this.drawBoardPaths(time);');
    expect(menuSceneSource).toContain('else if (this.hasLegacyMenuTitleAnimationPendingFrame(time)) {');
    expect(menuSceneSource).toContain('private drawBoardPaths(time: number): void {');
    expect(menuSceneSource).toContain('this.drawLegacyPathMaterialTile(');
    expect(menuSceneSource).toContain('coreAlpha: isMenuMode ? 0.92 : 0.96,');
    expect(menuSceneSource).toContain(': LEGACY_PLAY_PATH_CORE;');
    expect(menuSceneSource).toContain(': LEGACY_PLAY_WALL_FILL;');
    expect(menuSceneSource).toContain('const boardFill = LEGACY_PLAY_BOARD_FILL;');
    expect(menuSceneSource).toContain('const boardEdge = LEGACY_PLAY_BOARD_EDGE;');
    expect(menuSceneSource).not.toContain('this.boardStaticGraphics.fillStyle(walkable ? pathGlow : wallColor');
  });

  test('keeps active play HUD in a source-shaped timer and arrow widget lane', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_TIMER_PANE_ALPHA = 0.68;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_TIMER_TEXT =');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_TIMER_SHADOW =');
    expect(menuSceneSource).toContain('const LEGACY_CYBER_PANEL_STROKE = 0x72e0bf;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_ARROW = 0xff263f;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_ARROW_TAIL = 0xecfff5;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_ARROW_SHADOW = 0x06080a;');
    expect(menuSceneSource).toContain('this.drawLegacyCyberPanel(this.hudGraphics, {');
    expect(menuSceneSource).toContain("fontSize: '23px',");
    expect(menuSceneSource).toContain('timerShadow.setAlpha(0.7);');
    expect(menuSceneSource).toContain('this.drawLegacyPlayCompass(hudFrame, {');
    expect(menuSceneSource).toContain("showPane: touchControlLayout.controlMode !== 'stick'");
    expect(menuSceneSource).toContain('if (options.showPane) {');
    expect(menuSceneSource).toContain('this.hudGraphics.fillTriangle(');
    expect(menuSceneSource).toContain('this.drawLegacyPlayTouchButton(controls.pause, true, false);');
    expect(menuSceneSource).toContain('this.drawLegacyPlayTouchButton(controls.restart_attempt, true, false);');
    expect(menuSceneSource).not.toContain('this.hudGraphics.strokeRect(');
  });

  test('keeps menu dynamic trail overlays in the legacy corridor frame instead of full square cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).not.toContain('const LEGACY_MENU_DYNAMIC_TRAIL_EDGE =');
    expect(menuSceneSource).not.toContain('const LEGACY_MENU_DYNAMIC_TRAIL_CORE_RATIO =');
    expect(menuSceneSource).not.toContain('const LEGACY_MENU_DYNAMIC_TRAIL_EDGE_RATIO =');
    expect(menuSceneSource).toContain('const LEGACY_PLAYER_MARKER_HALO = 0x00b84a;');
    expect(menuSceneSource).toContain('const LEGACY_PLAYER_MARKER_CORE = 0x36ff7d;');
    expect(menuSceneSource).toContain('const visibleTrail = this.mode === \'menu\'');
    expect(menuSceneSource).toContain('trail.filter((point) => this.isLegacyMenuPointVisibleInStaticDraw(point))');
    expect(menuSceneSource).toContain('const dynamicTrailPathSource = this.resolveLegacyPointPathSource(visibleTrail);');
    expect(menuSceneSource).toContain('const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(');
    expect(menuSceneSource).toContain('const mazeTileSize = mazeRenderFrame.tileSize;');
    expect(menuSceneSource).toContain('this.fillLegacyMenuDynamicPathTile(');
    expect(menuSceneSource).toContain('pathSource: Pick<LegacyMazeSnapshot, \'grid\' | \'size\'>,');
    expect(menuSceneSource).toContain('LEGACY_MENU_PATH_EDGE,');
    expect(menuSceneSource).toContain('LEGACY_MENU_PATH_EDGE_ALPHA,');
    expect(menuSceneSource).toContain('this.fillLegacyPlayerMarkerTile(this.player, mazeLeft, mazeTop, mazeTileSize');
    expect(menuSceneSource).toContain('const centerX = originX + ((point.x + 0.5) * tileSize);');
    expect(menuSceneSource).toContain('resolveLegacyPlayerMarkerRenderMetrics(');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.lineTo(centerX + playerMetrics.coreRadius, centerY);');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.fillPath();');
    expect(menuSceneSource).toContain('this.isLegacyMenuPointVisibleInStaticDraw(this.player)');
  });

  test('keeps active play dynamic overlays in the corridor frame instead of square cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).not.toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_EDGE =');
    expect(menuSceneSource).not.toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_CORE_RATIO =');
    expect(menuSceneSource).not.toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_EDGE_RATIO =');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_COLOR = 0x36ff7d;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_EDGE = 0xecfff5;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS = 2600;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_WINDOW = 3.6;');
    expect(menuSceneSource).toContain('const falloff = smoothstep(1 - (distance / LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_WINDOW));');
    expect(menuSceneSource).toContain('this.fillLegacyPlayDynamicPathTile(');
    expect(menuSceneSource).toContain('LEGACY_PLAY_PATH_EDGE,');
    expect(menuSceneSource).toContain('LEGACY_PLAY_PATH_EDGE_ALPHA,');
    expect(menuSceneSource).toContain('this.hasLegacyPlayTrailPulsePendingFrame(time)');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_TRAIL_PULSE_FRAME_INTERVAL_MS = 50;');
    expect(menuSceneSource).toContain('private legacyPlayTrailPulseNextFrameAtMs = 0;');
    expect(menuSceneSource).toContain('if (this.settings.toggleTrailPulse) {');
    expect(menuSceneSource).toContain('this.drawLegacyPlayDynamicTrailPulse(');
    expect(menuSceneSource).toContain("const active = this.settings.toggleTrailPulse && this.overlay === 'none' && this.trail.length > 1;");
    expect(menuSceneSource).toContain('this.legacyPlayTrailPulseNextFrameAtMs = time + LEGACY_PLAY_TRAIL_PULSE_FRAME_INTERVAL_MS;');
    expect(menuSceneSource).toContain('const pulseDistanceFromPlayer = phase * maxPulseIndex;');
    expect(menuSceneSource).toContain('const pulseCenterIndex = (trail.length - 1) - pulseDistanceFromPlayer;');
    expect(menuSceneSource).toContain('private resolveLegacyPointPathSource(points: readonly LegacyPoint[]): Pick<LegacyMazeSnapshot, \'grid\' | \'size\'>');
    expect(menuSceneSource).toContain("this.fillPlayDynamicMarkerTile(this.maze.start, LEGACY_PLAY_START_MARKER_EDGE, mazeLeft, mazeTop, mazeTileSize, 0.9, 'start');");
    expect(menuSceneSource).toContain("this.fillPlayDynamicMarkerTile(this.maze.goal, 0xd81b2a, mazeLeft, mazeTop, mazeTileSize, 0.95, 'goal');");
    expect(menuSceneSource).toContain('const LEGACY_PLAY_START_MARKER_CORE = 0xfff05a;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_START_MARKER_EDGE = 0xffc629;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_GOAL_MARKER_CORE = 0xff263f;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_GOAL_MARKER_EDGE = 0xd81b2a;');
    expect(menuSceneSource).toContain('markerStyle: {');
    expect(menuSceneSource).toContain('playerCoreColor: LEGACY_PLAYER_MARKER_CORE');
    expect(menuSceneSource).toContain('playerHaloColor: LEGACY_PLAYER_MARKER_HALO');
    expect(menuSceneSource).toContain('startCoreColor: LEGACY_PLAY_START_MARKER_CORE');
    expect(menuSceneSource).toContain('startEdgeColor: LEGACY_PLAY_START_MARKER_EDGE');
    expect(menuSceneSource).toContain('trailPulseColor: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_COLOR');
    expect(menuSceneSource).toContain('trailPulseEdgeColor: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_EDGE');
    expect(menuSceneSource).toContain('trailPulsePeriodMs: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS');
    expect(menuSceneSource).toContain('trailPulseEnabled: this.settings.toggleTrailPulse');
    expect(menuSceneSource).toContain('playerCoreRadius: playerMarkerMetrics.coreRadius');
    expect(menuSceneSource).toContain('playerHaloRadius: playerMarkerMetrics.haloRadius');
    expect(menuSceneSource).toContain('resolveLegacyEndpointMarkerRenderMetrics(tileSize);');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.strokeCircle(centerX, centerY, markerMetrics.outerRadius);');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.lineTo(centerX + markerMetrics.outerRadius, centerY);');
    expect(menuSceneSource).toContain('this.fillLegacyPlayerMarkerTile(this.player');
    expect(menuSceneSource).toContain('this.fillLegacyPlayerMarkerTile(this.player, mazeLeft, mazeTop, mazeTileSize, 1, true);');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO = 0.34;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO = 0.46;');
    expect(menuSceneSource).toContain('resolveLegacyPlayerLocatorRenderMetrics(');
    expect(menuSceneSource).toContain('drawLocatorTick(centerX - locatorMetrics.outerRadius, centerY, centerX - locatorMetrics.innerRadius, centerY);');
    expect(menuSceneSource).toContain('const playerScreenX = mazeRenderFrame.boardLeft + ((this.player.x + 0.5) * mazeRenderFrame.tileSize);');
    expect(menuSceneSource).toContain('const goalScreenX = mazeRenderFrame.boardLeft + ((this.maze.goal.x + 0.5) * mazeRenderFrame.tileSize);');
    expect(menuSceneSource).not.toContain('this.fillTile(this.boardDynamicGraphics, point, trailColor, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, trailAlpha, 1);');
    expect(menuSceneSource).not.toContain('this.fillTile(this.boardDynamicGraphics, this.player, 0xf2f4f8, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 1, 0);');
  });

  test('keeps dynamic overlays readable for ultra-narrow mobile tiles', () => {
    expect(resolveLegacyDynamicTrailStrokeWidth(3.265, 0.62, 3)).toBe(3);
    expect(resolveLegacyDynamicTrailStrokeWidth(3.265, 0.34, 2)).toBe(2);
    expect(resolveLegacyDynamicMarkerInset(3.265, 0.22)).toBe(0);
    const tinyPlayer = resolveLegacyPlayerMarkerRenderMetrics(3.265, 0.34, 0.54);
    expect(tinyPlayer.coreRadius).toBeCloseTo(1.11, 3);
    expect(tinyPlayer.haloRadius).toBeCloseTo(1.502, 3);
    expect(tinyPlayer.strokeWidth).toBe(1);
    const phonePlayer = resolveLegacyPlayerMarkerRenderMetrics(7, 0.34, 0.46);
    expect(phonePlayer.coreRadius).toBeCloseTo(2.38, 3);
    expect(phonePlayer.haloRadius).toBeCloseTo(3.22, 3);
    expect(phonePlayer.strokeWidth).toBe(1);
    const tinyLocator = resolveLegacyPlayerLocatorRenderMetrics(3.265, tinyPlayer.haloRadius, tinyPlayer.strokeWidth);
    expect(tinyLocator.innerRadius).toBeCloseTo(0.752, 3);
    expect(tinyLocator.outerRadius).toBeCloseTo(1.567, 3);
    expect(tinyLocator.strokeWidth).toBe(1);
    const tinyEndpoint = resolveLegacyEndpointMarkerRenderMetrics(3.265);
    expect(tinyEndpoint.coreRadius).toBeCloseTo(1, 3);
    expect(tinyEndpoint.outerRadius).toBeCloseTo(1.567, 3);
    expect(tinyEndpoint.strokeWidth).toBe(1);
  });

  test('keeps larger desktop tiles visibly weighted after responsive overlay sizing', () => {
    expect(resolveLegacyDynamicTrailStrokeWidth(18, 0.62, 3)).toBe(11);
    expect(resolveLegacyDynamicTrailStrokeWidth(18, 0.34, 2)).toBe(6);
    expect(resolveLegacyDynamicMarkerInset(18, 0.22)).toBe(3);
    const desktopPlayer = resolveLegacyPlayerMarkerRenderMetrics(18, 0.34, 0.54);
    expect(desktopPlayer.coreRadius).toBeCloseTo(6.12, 3);
    expect(desktopPlayer.haloRadius).toBeCloseTo(8.28, 3);
    expect(desktopPlayer.strokeWidth).toBe(2);
    const desktopLocator = resolveLegacyPlayerLocatorRenderMetrics(18, desktopPlayer.haloRadius, desktopPlayer.strokeWidth);
    expect(desktopLocator.innerRadius).toBeCloseTo(5.76, 3);
    expect(desktopLocator.outerRadius).toBeCloseTo(8.64, 3);
    expect(desktopLocator.strokeWidth).toBe(2);
    const desktopEndpoint = resolveLegacyEndpointMarkerRenderMetrics(18);
    expect(desktopEndpoint.coreRadius).toBeCloseTo(5.011, 3);
    expect(desktopEndpoint.outerRadius).toBeCloseTo(8.64, 3);
    expect(desktopEndpoint.strokeWidth).toBe(2);
  });

  test('disables board tap and swipe movement so mobile play moves only from explicit controls', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('type LegacyPlayPointerStart');
    expect(menuSceneSource).toContain('private playPointerStart: LegacyPlayPointerStart | null = null;');
    expect(menuSceneSource).toContain("this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => {");
    expect(menuSceneSource).toContain("this.input.on('gameout', () => {");
    expect(menuSceneSource).toContain('this.playPointerStart = null;');
    expect(menuSceneSource).not.toContain('this.playPointerStart = createLegacyPlayPointerStart(pointer);');
    expect(menuSceneSource).toContain('if (!isSameLegacyPlayPointer(this.playPointerStart, pointer)) {');
  });

  test('routes shared mobile touch controls into explicit movement, pause, and reset only', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('resolveTouchControlKindAtPoint');
    expect(menuSceneSource).toContain('resolveTouchControlLayout');
    expect(menuSceneSource).toContain('private resolveLegacyPlayTouchControlLayout()');
    expect(menuSceneSource).toContain('private handleLegacyPlayTouchControl');
    expect(menuSceneSource).toContain('private drawLegacyPlayTouchControls(');
    expect(menuSceneSource).toContain('private resolveLegacyPlayActiveTouchControls()');
    expect(menuSceneSource).toContain('activeControls: this.resolveLegacyPlayActiveTouchControls()');
    expect(menuSceneSource).toContain("this.drawLegacyPlayTouchButton(controls.move_up, false, activeControls.has('move_up'));");
    expect(menuSceneSource).toContain('private legacyPlayTouchControlPointerUpHandler: ((event: PointerEvent) => void) | null = null;');
    expect(menuSceneSource).toContain('target.addEventListener(\'pointerup\', this.legacyPlayTouchControlPointerUpHandler as EventListener');
    expect(menuSceneSource).toContain('target.addEventListener(\'pointercancel\', this.legacyPlayTouchControlPointerUpHandler as EventListener');
    expect(menuSceneSource).toContain('this.handleLegacyPlayTouchControlClientPoint(event.clientX, event.clientY, event.pointerId)');
    expect(menuSceneSource).toContain('this.handleLegacyPlayTouchControlClientMove(event.clientX, event.clientY, event.pointerId)');
    expect(menuSceneSource).toContain('this.releaseLegacyPlayTouchPointer(event.pointerId)');
    expect(menuSceneSource).toContain("controlMode: this.settings.controlMode");
    expect(menuSceneSource).toContain("touchControlLayout.controlMode === 'stick'");
    expect(menuSceneSource).toContain('this.setLegacyPlayHeldTouchMoveCandidates(this.playTouchStickPull.movementCandidates');
    expect(menuSceneSource).toContain('this.setLegacyPlayHeldTouchMoveCandidates(pullVector.movementCandidates');
    expect(menuSceneSource).toContain('movementCandidates: [...this.playTouchStickPull.movementCandidates]');
    expect(menuSceneSource).toContain('intentSegment: this.playTouchStickPull.intentSegment');
    expect(menuSceneSource).toContain('allowBeyondOuter: true');
    expect(menuSceneSource).toContain('previousIntentSegment: this.playTouchStickPull?.intentSegment ?? null');
    expect(menuSceneSource).toContain('keepWhenBlocked: true');
    expect(menuSceneSource).toContain('if (this.playTouchStickPointerId !== null) {');
    expect(menuSceneSource).toContain('private drawLegacyPlayTouchStick(');
    expect(menuSceneSource).toContain('private setLegacyPlayHeldTouchMoveCandidates(');
    expect(menuSceneSource).toContain('const wasHeld = this.playMoveFlags[direction];');
    expect(menuSceneSource).toContain('const sameControlIndex = this.playHeldTouchMoves.findIndex((move) => move.control === control);');
    expect(menuSceneSource).toContain('if (this.playHeldTouchMoves.length >= LEGACY_PLAY_HELD_TOUCH_MOVE_LIMIT) {');
    expect(menuSceneSource).toContain('private resolveLegacyPlayHeldTouchDelay(kind:');
    expect(menuSceneSource).toContain("this.resolveLegacyPlayHeldTouchDelay(hadActiveMove ? 'turn' : 'initial')");
    expect(menuSceneSource).toContain("this.resolveLegacyPlayHeldTouchDelay('repeat')");
    expect(menuSceneSource).toContain('repeatInitialDelayMs: movementSpeedProfile.initialDelayMs');
    expect(menuSceneSource).toContain('repeatIntervalMs: movementSpeedProfile.repeatIntervalMs');
    expect(menuSceneSource).toContain('stickRepeatIntervalMaxMs: LEGACY_PLAY_STICK_REPEAT_INTERVAL_MAX_MS');
    expect(menuSceneSource).toContain('turnDelayMs: movementSpeedProfile.turnDelayMs');
    expect(menuSceneSource).toContain('Math.min(profile.repeatIntervalMs, LEGACY_PLAY_STICK_REPEAT_INTERVAL_MAX_MS)');
    expect(menuSceneSource).toContain('this.hudTouchControlBounds = this.drawLegacyPlayTouchControls(touchControlLayout);');
    expect(menuSceneSource).toContain("showPane: touchControlLayout.controlMode !== 'stick'");
    expect(menuSceneSource).toContain('this.hudBounds = touchCompassBounds');
    expect(menuSceneSource).toContain(': mergeVisualRects(this.hudTimerBounds, this.hudArrowBounds);');
    expect(menuSceneSource).toContain('touchControls');
    expect(menuSceneSource).toContain('LEGACY_CYBER_PANEL_FILL');
    expect(menuSceneSource).toContain('this.drawLegacyCyberPanel(this.hudGraphics, {');
    expect(menuSceneSource).toContain("this.drawLegacyPlayTouchLabel(controls.pause, 'PAUSE');");
    expect(menuSceneSource).toContain("this.drawLegacyPlayTouchLabel(controls.restart_attempt, 'RESET');");
    expect(menuSceneSource).not.toContain("this.drawLegacyPlayTouchLabel(controls.toggle_thoughts, 'TRAIL');");
    expect(menuSceneSource).toContain("this.hudGraphics.moveTo(cx, cy + stem);");
    expect(menuSceneSource).toContain("this.hudGraphics.lineTo(cx, cy - size);");
    expect(menuSceneSource).toContain('installLegacyPlayTouchControlFallback');
    expect(menuSceneSource).toContain("event.pointerType === 'touch'");
    expect(menuSceneSource).toContain('event.target === this.game.canvas');
    expect(menuSceneSource).toContain('event.stopImmediatePropagation()');
    expect(menuSceneSource).toContain("case 'pause':");
    expect(menuSceneSource).toContain("this.applyLegacyPauseCommand('reset-player');");
    expect(menuSceneSource).toContain("case 'move_up':");
    expect(menuSceneSource).toContain('this.tryMovePlayer(0, -1);');
    expect(menuSceneSource).toContain('this.tryMovePlayer(1, 0);');
    expect(menuSceneSource).toContain('this.tryMovePlayer(0, 1);');
    expect(menuSceneSource).toContain('this.tryMovePlayer(-1, 0);');
  });

  test('keeps camera-follow static and dynamic board layers on the same offset', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const toggleFieldSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyOverlayToggleFields.ts'), 'utf8');

    expect(menuSceneSource).toContain('const { boardLeft: layoutBoardLeft, boardTop: layoutBoardTop, boardSize } = this.layout;');
    expect(menuSceneSource).toContain('const boardOffset = this.resolveBoardOffset();');
    expect(menuSceneSource).toContain('const boardLeft = layoutBoardLeft + boardOffset.x;');
    expect(menuSceneSource).toContain('const boardTop = layoutBoardTop + boardOffset.y;');
    expect(menuSceneSource).toContain('const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(boardLeft, boardTop, boardSize);');
    expect(menuSceneSource).toContain('this.layout.boardLeft + boardOffset.x');
    expect(menuSceneSource).toContain('this.layout.boardTop + boardOffset.y');
    expect(menuSceneSource).toContain('if (this.settings.toggleCameraFollow) {');
    expect(menuSceneSource).toContain('this.boardStaticDirty = true;');
    expect(toggleFieldSource).toContain('affectsBoardStatic: true');
  });

  test('uses rendered play board bounds for compact touch-control avoidance', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const boardBounds = this.resolveLegacyPlayBoardBounds();');
    expect(menuSceneSource).toContain('left: boardBounds.left');
    expect(menuSceneSource).toContain('top: boardBounds.top');
    expect(menuSceneSource).toContain('width: boardBounds.right - boardBounds.left');
    expect(menuSceneSource).toContain('height: boardBounds.bottom - boardBounds.top');
    expect(menuSceneSource).not.toContain('avoidRect: {\n        left: this.layout.boardLeft');
  });

  test('publishes visual diagnostics to a maintained-browser DOM fallback', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain("export const MENU_SCENE_VISUAL_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-visual-diagnostics' as const;");
    expect(menuSceneSource).toContain('const diagnostics: MenuSceneVisualDiagnostics = {');
    expect(menuSceneSource).toContain('window[MENU_SCENE_VISUAL_DIAGNOSTICS_KEY] = diagnostics;');
    expect(menuSceneSource).toContain('MENU_SCENE_VISUAL_DIAGNOSTICS_ATTRIBUTE,');
    expect(menuSceneSource).toContain('JSON.stringify(diagnostics)');
    expect(menuSceneSource).toContain('removeAttribute(MENU_SCENE_VISUAL_DIAGNOSTICS_ATTRIBUTE)');
    expect(menuSceneSource).toContain('renderSurface: {');
    expect(menuSceneSource).toContain('canvasPixelWidth');
    expect(menuSceneSource).toContain('renderResolutionTargetRatio');
    expect(menuSceneSource).toContain('renderResolutionDeficit');
    expect(menuSceneSource).toContain('renderResolutionRatio');
    expect(menuSceneSource).toContain('undersampledForDevicePixelRatio');
    expect(menuSceneSource).toContain('const renderResolutionTargetRatio = Math.round(Math.min(devicePixelRatio, 2) * 100) / 100;');
    expect(menuSceneSource).toContain('undersampledForDevicePixelRatio: renderResolutionDeficit > 0.05');
  });

  test('draws game-toggle switch positions from the canonical toggle resolver', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const toggleFieldSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyOverlayToggleFields.ts'), 'utf8');

    expect(toggleFieldSource).toContain('export const resolveLegacyOverlayToggleSwitchIsOn = (');
    expect(toggleFieldSource).toContain("case 'controlMode':");
    expect(toggleFieldSource).toContain("return settings.controlMode === 'stick';");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('toggleCameraFollow', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailFade', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailPulse', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('toggleAnimatedBackdrop', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('darkMode', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('controlMode', this.settings)");
    expect(menuSceneSource).toContain("switchIsOn: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailPulse', this.settings)");
  });

  test('publishes a compact walkable maze snapshot for live play QA', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const runtimeDiagnosticsSource = readFileSync(resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'), 'utf8');

    expect(runtimeDiagnosticsSource).toContain("encoding: 'walkable-rows-v1';");
    expect(runtimeDiagnosticsSource).toContain('walkableRows: string[];');
    expect(menuSceneSource).toContain("encoding: 'walkable-rows-v1'");
    expect(menuSceneSource).toContain("walkableRows: this.maze.grid.map((row) => row.map((walkable) => (walkable ? '1' : '0')).join(''))");
  });

  test('keeps animated backdrop and visual diagnostics off the per-frame hot path', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const tuningSource = readFileSync(resolve(process.cwd(), 'src/config/tuning.ts'), 'utf8');

    expect(menuSceneSource).toContain('this.updateStars(time, delta);');
    expect(menuSceneSource).toContain('private updateStars(time: number, delta: number): void');
    expect(menuSceneSource).toContain('private backdropAccumulatedDeltaMs = 0;');
    expect(menuSceneSource).toContain('this.backdropAccumulatedDeltaMs += Math.max(0, delta);');
    expect(menuSceneSource).toContain('legacyTuning.menu.runtime.ambientUpdateIntervalMs[this.runtimeDiagnosticsPerformanceMode]');
    expect(menuSceneSource).toContain('if (time < this.backdropNextUpdateAtMs) {');
    expect(menuSceneSource).toContain('advanceLegacyMenuBackdropStars(this.stars, elapsedMs, this.settings.darkMode);');
    expect(menuSceneSource).toContain('private publishVisualDiagnostics(time: number, force = false): void');
    expect(menuSceneSource).toContain('time - this.visualDiagnosticsLastPublishedAtMs < legacyTuning.menu.runtime.diagnosticsPublishIntervalMs');
    expect(menuSceneSource).toContain('this.publishVisualDiagnostics(this.time.now, true);');
    expect(menuSceneSource).toContain('private publishInteractionDiagnostics(force = true): void');
    expect(menuSceneSource).toContain('this.publishVisualDiagnostics(now, force);');
    expect(menuSceneSource).toContain('this.publishInteractionDiagnostics(false);');
    expect(menuSceneSource).toContain('private hudDirty = true;');
    expect(menuSceneSource).toContain('this.hudDirty = true;');
    expect(menuSceneSource).toContain('const uiRebuilt = this.uiDirty;');
    expect(menuSceneSource).toContain('this.publishVisualDiagnostics(time, uiRebuilt);');
    expect(tuningSource).toContain('diagnosticsPublishIntervalMs: 1500,');
    expect(tuningSource).toContain('full: 83,');
    expect(tuningSource).toContain('throttled: 250,');
  });

  test('keeps front-door buttons in the shared cyber chrome path', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const panel = this.add.graphics();');
    expect(menuSceneSource).toContain('this.drawLegacyCyberPanel(panel, {');
    expect(menuSceneSource).toContain('fill: active ? 0x123a2d : LEGACY_CYBER_PANEL_FILL');
    expect(menuSceneSource).toContain('const buttonTextColor = frontDoorChrome?.textColor ?? MENU_TEXT_COLOR;');
    expect(menuSceneSource).toContain('const background = this.add.rectangle(x, y, width, height, 0x000000, 0.001);');
    expect(menuSceneSource).toContain('? Math.max(frontDoorChrome?.hoverAlpha ?? 0.68, 0.68)');
  });

  test('keeps pause overflow behind a mobile scroll facade and icon-only overlay back control', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('resolveLegacyOverlayScrollMetrics');
    expect(menuSceneSource).toContain('private drawLegacyOverlayScrollFacade(metrics: LegacyOverlayScrollMetrics): void');
    expect(menuSceneSource).toContain('private createOverlayBackChevronButton(panel: OverlayPanelFrame, onClick: () => void): UiButton');
    expect(menuSceneSource).toContain('this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.applyLegacyPauseCommand(\'resume\')));');
    expect(menuSceneSource).toContain('this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.handleBackAction()));');
    expect(menuSceneSource).toContain('rightGutter: LEGACY_OVERLAY_SCROLL_RIGHT_GUTTER');
    expect(menuSceneSource).toContain('this.input.on(\'wheel\'');
    expect(menuSceneSource).toContain('private handleOverlayScrollPointerDown(pointer: Phaser.Input.Pointer): boolean');
    expect(menuSceneSource).toContain('private handleOverlayScrollPointerMove(pointer: Phaser.Input.Pointer): boolean');
    expect(menuSceneSource).toContain('private resolveLegacyRoundedRectRadius(width: number, height: number, requestedRadius?: number): number');
    expect(menuSceneSource).toContain('fillScrollPill(track.left - 3, track.top - 2, track.width + 6, track.height + 4');
    expect(menuSceneSource).toContain('centerY - (height / 2) >= viewport.top + 2');
    expect(menuSceneSource).toContain('centerY + (height / 2) <= viewport.bottom - 2');
    expect(menuSceneSource).toContain('private fitLegacyUiTextToWidth<T extends Phaser.GameObjects.Text>');
    expect(menuSceneSource).toContain('const showStateLabel = input.width >= 320;');
    expect(menuSceneSource).toContain('const stateLabelRight = trackLeft - trackGap;');
    expect(menuSceneSource).toContain('const labelMaxWidth = Math.max(54, labelRight - labelX);');
    expect(menuSceneSource).toContain('setAlpha(showStateLabel ? 0.92 : 0)');
    expect(menuSceneSource).toContain('setVisible(showStateLabel)');
    expect(menuSceneSource).not.toContain("const tightWidth = input.width < 260;");
    expect(menuSceneSource).not.toContain("tightWidth && input.label !== 'Controls'");
    expect(menuSceneSource).not.toMatch(/fillRoundedRect\([^;]*,\s*999\)/);
    expect(menuSceneSource).toContain('overlayUi: {');
    expect(menuSceneSource).not.toContain('createButton(panel.centerX - 78, firstActionY, 132, 54, \'Back\'');
    expect(menuSceneSource).not.toContain('createButton(panel.centerX, panel.top + panel.height - 58, Math.min(180, panel.width - 96), 54, \'Back\'');
  });

  test('keeps menu maze visuals aligned with the cleaned play maze language', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_CORE = 0xe7fff4;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE = 0x0d3c4f;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_WALL_FILL = 0x07111d;');
    expect(menuSceneSource).toContain('LEGACY_MENU_PATH_EDGE,');
    expect(menuSceneSource).toContain('LEGACY_MENU_PATH_EDGE_ALPHA,');
    expect(menuSceneSource).toContain('this.drawLegacyPathMaterialTile(');
    expect(menuSceneSource).toContain('const boardFill = LEGACY_PLAY_BOARD_FILL;');
    expect(menuSceneSource).toContain('const boardEdge = LEGACY_PLAY_BOARD_EDGE;');
    expect(menuSceneSource).toContain('this.fillLegacyBoardEdgeFrame(boardLeft, boardTop, boardSize, boardEdge);');
    expect(menuSceneSource).not.toContain('this.fillMenuDynamicMarkerTile(this.maze.start');
    expect(menuSceneSource).not.toContain('this.fillMenuDynamicMarkerTile(this.maze.goal');
    expect(menuSceneSource).toContain('const trailColor = this.settings.darkMode ? 0x9cffd2 : 0x66eebf;');
  });
});
