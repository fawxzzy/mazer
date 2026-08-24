import { describe, expect, test, vi } from 'vitest';
import {
  resolveLegacyDynamicMarkerInset,
  resolveLegacyDynamicTrailStrokeWidth,
  resolveLegacyEndpointMarkerRenderMetrics,
  resolveLegacyBleedOffDockVisualEligibility,
  resolveLegacyBleedOffPaths,
  resolveLegacyMenuBorderDockDirections,
  resolveLegacyMenuBorderDockFacetRect,
  resolveLegacyMenuBorderDockRenderAreas,
  resolveLegacyMenuPathRenderFrame,
  resolveLegacyMenuPathRenderFrames,
  resolveLegacyMenuPathRenderSegments,
  resolveLegacyPlayerLocatorRenderMetrics,
  resolveLegacyPlayerMarkerRenderMetrics
} from '../../src/legacy-runtime/legacyMenuRender';
import {
  resolveLegacyMenuPathTitleOrbitGeometry,
  resolveLegacyMenuPathTitleOrbitPoint
} from '../../src/legacy-runtime/legacyMenuTitle';
import { resolveLegacyNavigationTarget } from '../../src/legacy-runtime/legacyMaze';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const normalizeSourceLineEndings = (source: string): string => source.replace(/\r\n?/g, '\n');

const readPngDimensions = (path: string): { height: number; width: number } => {
  const bytes = readFileSync(resolve(process.cwd(), path));
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
};

vi.mock('phaser', () => ({
  default: {
    CANVAS: 'CANVAS',
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
      Linear: (from: number, to: number, t: number) => from + ((to - from) * t)
    },
    Scale: {
      CENTER_BOTH: 'CENTER_BOTH',
      RESIZE: 'RESIZE'
    },
    Scene: class {}
  }
}));

describe('resolveLegacyMenuPathRenderFrame', () => {
  test('guards deferred completion callbacks against an intervening account switch', () => {
    const menuSceneSource = normalizeSourceLineEndings(
      readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8')
    );
    const completionFlow = menuSceneSource.slice(
      menuSceneSource.indexOf('const completionAuthSnapshot = { ...this.authSnapshot };'),
      menuSceneSource.indexOf("if (surface === 'menu-demo')")
    );

    expect(completionFlow).toContain('const completionAuthSequence = this.authAccountHydrationSequence;');
    expect(completionFlow).toContain('const completionProgressionStorage = this.resolveLegacyProgressionStorage();');
    expect(completionFlow.match(/isLegacyRemoteCompletionContextCurrent\(/g)).toHaveLength(2);
    expect(completionFlow).toContain('completionAuthSnapshot,\n            completionAuthSequence,\n            this.authSnapshot,');
    expect(completionFlow).toContain('this.authAccountHydrationSequence');
    expect(completionFlow).toContain('writeLegacyProgressionState(\n              completionProgressionStorage,');

    const resetSyncFlow = menuSceneSource.slice(
      menuSceneSource.indexOf("private syncLegacyRemoteProgressionState(mode: 'replace'): void"),
      menuSceneSource.indexOf('private publishLegacyRemoteSyncResult')
    );
    expect(resetSyncFlow).toContain('const syncAuthSnapshot = { ...this.authSnapshot };');
    expect(resetSyncFlow).toContain('const syncAuthSequence = this.authAccountHydrationSequence;');
    expect(resetSyncFlow).toContain('const syncProgressionStorage = this.resolveLegacyProgressionStorage();');
    expect(resetSyncFlow.match(/isLegacyRemoteCompletionContextCurrent\(/g)).toHaveLength(2);
    expect(resetSyncFlow).toContain('writeLegacyProgressionState(\n            syncProgressionStorage,');
  });

  test('keeps semantic source assertions identical across LF and CRLF checkouts', () => {
    const semanticSource = 'first line\nsecond line\n';

    expect(normalizeSourceLineEndings(semanticSource)).toBe(semanticSource);
    expect(normalizeSourceLineEndings(semanticSource.replaceAll('\n', '\r\n'))).toBe(semanticSource);
    expect(normalizeSourceLineEndings('first line\r\nchanged line\r\n')).not.toBe(semanticSource);
  });

  test('caps active Phaser rendering to mobile-friendly 60 FPS', () => {
    const phaserConfigSource = readFileSync(resolve(process.cwd(), 'src/boot/phaserConfig.ts'), 'utf8');
    const canvasResolutionSource = readFileSync(resolve(process.cwd(), 'src/boot/canvasResolution.ts'), 'utf8');
    const baseCssSource = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

    expect(phaserConfigSource).toContain('type: Phaser.CANVAS');
    expect(canvasResolutionSource).toContain('export const MAZER_CANVAS_RESOLUTION_MAX = 3;');
    expect(canvasResolutionSource).toContain('export const resolveMazerCanvasResolution =');
    expect(canvasResolutionSource).toContain('export const resolveMazerCanvasBackingResolution =');
    expect(canvasResolutionSource).toContain('export const applyMazerCanvasBackingResolution =');
    expect(phaserConfigSource).not.toContain('resolution: resolveMazerCanvasResolution()');
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

  test('keeps the Settings and Pause overlays compact, player-facing, and grouped by purpose', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
    const buildOptionsSource = menuSceneSource.slice(
      menuSceneSource.indexOf('private buildOptionsOverlay(): void {'),
      menuSceneSource.indexOf('private createLegacyOptionsInfoSection(')
    );
    const guideSource = menuSceneSource.slice(
      menuSceneSource.indexOf('private createLegacyOptionsInfoSection('),
      menuSceneSource.indexOf('private createLegacyOptionsAccountActionRow(')
    );
    const buildPauseSource = menuSceneSource.slice(
      menuSceneSource.indexOf('private buildPauseOverlay(): void {'),
      menuSceneSource.indexOf('private createFeatureControlRows(')
    );

    expect(menuSceneSource).toContain('const contentFlow = resolveLegacyOverlayContentFlowLayout({');
    expect(menuSceneSource).toContain('this.createLegacyOptionsInfoSection(contentFlow.guideTop, panel, {');
    expect(menuSceneSource).toContain("'GUIDE',");
    expect(buildOptionsSource.indexOf('this.createLegacyOptionsInfoSection(contentFlow.guideTop, panel, {')).toBeLessThan(
      buildOptionsSource.indexOf('this.createFeatureControlRows(contentFlow.controlsTop, panel')
    );
    expect(buildPauseSource.indexOf('this.createLegacyOptionsInfoSection(contentFlow.guideTop, panel, {')).toBeLessThan(
      buildPauseSource.indexOf('this.createFeatureControlRows(contentFlow.controlsTop, panel, {')
    );
    expect(guideSource).toContain("drawLegendRow(legendRowIndex, 'start', 'Start'");
    expect(guideSource).toContain("drawLegendRow(legendRowIndex, 'end', 'Exit'");
    expect(guideSource).not.toContain('includeCompassRow');
    expect(guideSource).toContain("'begin at gold'");
    expect(guideSource).toContain("'finish at red'");
    expect(guideSource).not.toContain("'Player • green trail'");
    expect(guideSource).not.toContain("'Score • run quality'");
    expect(guideSource).not.toContain('activeTargetComplexity');
    expect(guideSource).not.toContain('measuredMazeComplexity');
    expect(guideSource).not.toContain('drawChip(');
    expect(menuSceneSource).not.toContain('drawLegacyCompassGlyph');
    expect(menuSceneSource).toContain('drawLegacyOptionsGuideGlyph');
    expect(menuSceneSource).toContain("addSectionHeading('Controls'");
    expect(menuSceneSource).toContain("addSectionHeading('Display'");
    expect(menuSceneSource).toContain("label: 'Animated Background'");
    expect(menuSceneSource).not.toContain("label: 'High Contrast'");
  });

  test('aligns title orbit diamonds through the fixed top and bottom crown diamonds', () => {
    const geometry = resolveLegacyMenuPathTitleOrbitGeometry(120, 40, 260, 70, 10);
    const topCenter = resolveLegacyMenuPathTitleOrbitPoint(geometry, 0.125);
    const bottomCenter = resolveLegacyMenuPathTitleOrbitPoint(geometry, 0.625);

    expect(topCenter).toEqual({ x: geometry.centerX, y: geometry.crownTop });
    expect(bottomCenter).toEqual({ x: geometry.centerX, y: geometry.crownBottom });
    expect(geometry.top).toBe(geometry.crownTop);
    expect(geometry.bottom).toBe(geometry.crownBottom);
  });

  test('bridges connected neighbors to tile edges for legacy trench continuity', () => {
    const maze = {
      width: 3,
      height: 3,
      grid: [
        [false, false, false],
        [true, true, true],
        [false, false, false]
      ]
    };

    expect(resolveLegacyMenuPathRenderFrame(maze, { x: 1, y: 1 }, 20)).toEqual({
      leftInset: 0,
      topInset: 2,
      width: 20,
      height: 16
    });
  });

  test('keeps closed-edge insets where the path does not continue', () => {
    const maze = {
      width: 3,
      height: 3,
      grid: [
        [false, false, false],
        [false, true, false],
        [false, true, false]
      ]
    };

    expect(resolveLegacyMenuPathRenderFrame(maze, { x: 1, y: 1 }, 20)).toEqual({
      leftInset: 2,
      topInset: 2,
      width: 16,
      height: 18
    });
  });

  test('docks non-corner border paths into the board border instead of capping them', () => {
    const oneSidedMaze = {
      width: 3,
      height: 3,
      grid: [
        [false, false, false],
        [true, false, false],
        [false, false, false]
      ]
    };

    expect(resolveLegacyMenuBorderDockDirections(oneSidedMaze, { x: 0, y: 1 })).toEqual([]);

    const maze = {
      width: 3,
      height: 3,
      grid: [
        [false, false, false],
        [true, true, true],
        [false, false, false]
      ]
    };

    expect(resolveLegacyMenuBorderDockDirections(maze, { x: 0, y: 1 })).toEqual(['left']);
    expect(resolveLegacyMenuBorderDockDirections(maze, { x: 2, y: 1 })).toEqual(['right']);
    expect(resolveLegacyMenuPathRenderFrame(maze, { x: 0, y: 1 }, 20)).toEqual({
      leftInset: 0,
      topInset: 2,
      width: 20,
      height: 16
    });
    expect(resolveLegacyMenuPathRenderFrames(maze, { x: 0, y: 1 }, 20)).toEqual({
      edge: {
        leftInset: 0,
        topInset: 2,
        width: 20,
        height: 16
      },
      core: {
        leftInset: 0,
        topInset: 3,
        width: 20,
        height: 14
      }
    });
    expect(resolveLegacyMenuPathRenderSegments(maze, { x: 0, y: 1 }, 20).edge).toContainEqual({
      leftInset: 0,
      topInset: 2,
      width: 18,
      height: 16
    });
  });

  test('classifies only orthogonal legal opposite-edge paths as bleed-off continuations', () => {
    const maze = {
      width: 5,
      height: 5,
      grid: [
        [false, false, true, false, false],
        [false, false, true, false, false],
        [true, true, true, true, true],
        [false, false, true, false, false],
        [false, false, true, false, false]
      ]
    };

    expect(resolveLegacyBleedOffPaths(maze, { x: 0, y: 2 })).toEqual([
      { source: { x: 0, y: 2 }, destination: { x: 4, y: 2 }, direction: 'left' }
    ]);
    expect(resolveLegacyNavigationTarget(maze, { x: 0, y: 2 }, -1, 0)).toEqual({ x: 4, y: 2 });
    expect(resolveLegacyBleedOffPaths(maze, { x: 2, y: 0 })).toEqual([
      { source: { x: 2, y: 0 }, destination: { x: 2, y: 4 }, direction: 'top' }
    ]);
    expect(resolveLegacyNavigationTarget(maze, { x: 2, y: 0 }, 0, -1)).toEqual({ x: 2, y: 4 });
    expect(resolveLegacyBleedOffPaths(maze, { x: 0, y: 0 })).toEqual([]);
  });

  test('renders every legal bleed-off opening even when several share one side or sit adjacently', () => {
    const maze = {
      width: 7,
      height: 7,
      grid: Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => (
        ((x === 0 || x === 6) && [1, 2, 4].includes(y))
        || ((y === 0 || y === 6) && [1, 3, 4].includes(x))
      )))
    };

    expect([...resolveLegacyBleedOffDockVisualEligibility(maze)].sort()).toEqual([
      '0,1', '0,2', '0,4',
      '1,0', '1,6',
      '3,0', '3,6',
      '4,0', '4,6',
      '6,1', '6,2', '6,4'
    ]);
  });

  test('keeps folded-corner border cells capped so the corner facets stay clean', () => {
    const maze = {
      width: 3,
      height: 3,
      grid: [
        [true, false, false],
        [false, false, false],
        [false, false, false]
      ]
    };

    expect(resolveLegacyMenuBorderDockDirections(maze, { x: 0, y: 0 })).toEqual([]);
    expect(resolveLegacyMenuPathRenderFrame(maze, { x: 0, y: 0 }, 20)).toEqual({
      leftInset: 2,
      topInset: 2,
      width: 16,
      height: 16
    });
  });

  test('splits top edge border docks around the top-center notch reserve', () => {
    const areas = resolveLegacyMenuBorderDockRenderAreas('top', {
      leftInset: 0,
      topInset: 0,
      width: 30,
      height: 30
    }, {
      boardLeft: 0,
      boardTop: 0,
      boardWidth: 100,
      boardHeight: 100,
      cornerGuardSize: 18,
      materialTileSize: 30,
      mazeLeft: 6,
      mazeTop: 6,
      mazeWidth: 88,
      mazeHeight: 88,
      tileRect: {
        left: 35,
        top: 6,
        width: 30,
        height: 30
      },
      topCenterNotch: {
        bottom: 12,
        left: 42,
        right: 58,
        top: -3
      }
    });

    expect(areas.length).toBe(2);
    expect(areas.every((area) => area.right <= 42 || area.left >= 58)).toBe(true);
  });
  test('extends border docks into the board edge frame and rails near folded corners', () => {
    const commonOptions = {
      boardLeft: 0,
      boardTop: 0,
      boardWidth: 100,
      boardHeight: 100,
      cornerGuardSize: 18,
      materialTileSize: 6,
      mazeLeft: 5,
      mazeTop: 5,
      mazeWidth: 90,
      mazeHeight: 90
    };
    const leftFrame = {
      leftInset: 0,
      topInset: 1,
      width: 5,
      height: 4
    };

    expect(resolveLegacyMenuBorderDockRenderAreas('left', leftFrame, {
      ...commonOptions,
      tileRect: {
        left: 5,
        top: 40,
        width: 6,
        height: 6
      }
    })).toEqual([
      {
        left: -1,
        top: 41,
        right: 5,
        bottom: 45
      }
    ]);

    expect(resolveLegacyMenuBorderDockRenderAreas('left', leftFrame, {
      ...commonOptions,
      tileRect: {
        left: 5,
        top: 6,
        width: 6,
        height: 6
      }
    })).toEqual([
      {
        left: -1,
        top: 7,
        right: 5,
        bottom: 11
      },
      {
        left: -1,
        top: 7,
        right: 5,
        bottom: 18
      }
    ]);

    expect(resolveLegacyMenuBorderDockRenderAreas('top', {
      leftInset: 1,
      topInset: 0,
      width: 4,
      height: 5
    }, {
      ...commonOptions,
      tileRect: {
        left: 6,
        top: 5,
        width: 6,
        height: 6
      }
    })).toEqual([
      {
        left: 7,
        top: -1,
        right: 11,
        bottom: 5
      },
      {
        left: 7,
        top: -1,
        right: 18,
        bottom: 5
      }
    ]);
  });

  test('extends approved bleed-off continuations beyond the visible board frame', () => {
    const areas = resolveLegacyMenuBorderDockRenderAreas('right', {
      leftInset: 0,
      topInset: 0,
      width: 6,
      height: 6
    }, {
      boardLeft: 10,
      boardTop: 20,
      boardWidth: 100,
      boardHeight: 100,
      cornerGuardSize: 18,
      continuationLength: 4,
      materialTileSize: 6,
      mazeLeft: 15,
      mazeTop: 25,
      mazeWidth: 90,
      mazeHeight: 90,
      tileRect: { left: 99, top: 50, width: 6, height: 6 }
    });

    expect(areas).toEqual([{ left: 105, top: 50, right: 114, bottom: 56 }]);
  });

  test('anchors a bottom bleed-off continuation to the rendered tile edge at rounded board sizes', () => {
    const areas = resolveLegacyMenuBorderDockRenderAreas('bottom', {
      leftInset: 0,
      topInset: 0,
      width: 6,
      height: 6
    }, {
      boardLeft: 10,
      boardTop: 20,
      boardWidth: 100,
      boardHeight: 100,
      cornerGuardSize: 18,
      continuationLength: 4,
      materialTileSize: 6,
      // The aggregate maze bottom is 116, while the final pixel row for this
      // 5px bottom tile ends at 115. Starting from mazeBottom creates the
      // one-pixel gap reported in play mode.
      mazeLeft: 15,
      mazeTop: 25,
      mazeWidth: 90,
      mazeHeight: 91,
      tileRect: { left: 50, top: 110, width: 6, height: 5 }
    });

    expect(areas).toEqual([{ left: 50, top: 115, right: 56, bottom: 124 }]);
  });

  test('anchors every rendered dock facet to the exact rounded terminal-tile band', () => {
    const frame = { leftInset: 1, topInset: 1, width: 4, height: 4 };
    const options = {
      boardLeft: 10,
      boardTop: 20,
      boardWidth: 100,
      boardHeight: 100,
      continuationLength: 4,
      materialTileSize: 6,
      // Fractional source geometry reproduces the rounding split that let a
      // flat dock and its visible 3D facet begin on different pixel rows.
      tileRect: { left: 49.5, top: 109.5, width: 6.25, height: 5.25 }
    };

    expect(resolveLegacyMenuBorderDockFacetRect('left', frame, options)).toEqual({
      height: 3,
      left: 6,
      top: 110.5,
      width: 44.5
    });
    expect(resolveLegacyMenuBorderDockFacetRect('right', frame, options)).toEqual({
      height: 3,
      left: 54.5,
      top: 110.5,
      width: 59.5
    });
    expect(resolveLegacyMenuBorderDockFacetRect('top', frame, options)).toEqual({
      height: 94.5,
      left: 50.5,
      top: 16,
      width: 4
    });
    expect(resolveLegacyMenuBorderDockFacetRect('bottom', frame, options)).toEqual({
      height: 10.5,
      left: 50.5,
      top: 113.5,
      width: 4
    });
  });

  test('bridges the light core across connected neighbors for a less checkerboarded slab read', () => {
    const maze = {
      width: 3,
      height: 3,
      grid: [
        [false, false, false],
        [true, true, true],
        [false, false, false]
      ]
    };

    expect(resolveLegacyMenuPathRenderFrames(maze, { x: 1, y: 1 }, 20)).toEqual({
      edge: {
        leftInset: 0,
        topInset: 2,
        width: 20,
        height: 16
      },
      core: {
        leftInset: 0,
        topInset: 3,
        width: 20,
        height: 14
      }
    });
  });

  test('preserves four-way joins as solid connected intersections', () => {
    const maze = {
      width: 3,
      height: 3,
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
      width: 3,
      height: 3,
      grid: [
        [false, true, false],
        [true, true, true],
        [false, true, false]
      ]
    };

    const segments = resolveLegacyMenuPathRenderSegments(maze, { x: 1, y: 1 }, 20);

    expect(segments.edge).toEqual([
      { leftInset: 2, topInset: 2, width: 16, height: 16 },
      { leftInset: 0, topInset: 2, width: 18, height: 16 },
      { leftInset: 2, topInset: 2, width: 18, height: 16 },
      { leftInset: 2, topInset: 0, width: 16, height: 18 },
      { leftInset: 2, topInset: 2, width: 16, height: 18 }
    ]);
    expect(segments.core).toEqual([
      { leftInset: 3, topInset: 3, width: 14, height: 14 },
      { leftInset: 0, topInset: 3, width: 17, height: 14 },
      { leftInset: 3, topInset: 3, width: 17, height: 14 },
      { leftInset: 3, topInset: 0, width: 14, height: 17 },
      { leftInset: 3, topInset: 3, width: 14, height: 17 }
    ]);
  });

  test('keeps phone-sized tiles separated instead of merging adjacent cells into blocks', () => {
    const maze = {
      width: 3,
      height: 3,
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

  test('keeps rounded 4px mobile tiles corridor-shaped instead of full-block filled', () => {
    const maze = {
      width: 3,
      height: 3,
      grid: [
        [false, true, false],
        [true, true, true],
        [false, true, false]
      ]
    };

    const segments = resolveLegacyMenuPathRenderSegments(maze, { x: 1, y: 1 }, 4);

    expect(segments.edge[0]).toEqual({ leftInset: 1, topInset: 1, width: 2, height: 2 });
    expect(segments.core[0]).toEqual({ leftInset: 1, topInset: 1, width: 2, height: 2 });
    expect(segments.edge[0]?.width).toBeLessThan(4);
    expect(segments.edge[0]?.height).toBeLessThan(4);
  });

  test('keeps the menu board in the clean 2d maze-material lane', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const legacyMenuRenderSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMenuRender.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_BOARD_GRID_ALPHA = 0;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PANEL_SHADOW_ALPHA = 0;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_CORE = mixLegacyIridescentColor(cyberArcadeMaterial.path.core, 0x000000, LEGACY_PATH_CORE_EYE_COMFORT_DIM_AMOUNT);');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE = cyberArcadeMaterial.path.edge;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE_ALPHA = 0.58;');
    expect(menuSceneSource).not.toContain('LEGACY_MENU_PATH_RELIEF_SHADOW');
    expect(menuSceneSource).not.toContain('LEGACY_MENU_PATH_RELIEF_OFFSET_RATIO');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_BORDER_PRIMARY = cyberArcadeMaterial.rail.mint;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_BORDER_SECONDARY = cyberArcadeMaterial.rail.cyan;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_BACKGROUND_ALPHA = 0.12;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_SIZE_RATIO = 0.066;');
    expect(menuSceneSource).not.toContain('LEGACY_BOARD_SIGIL_CORNER_FACET_SHIMMER_MS');
    expect(menuSceneSource).not.toContain('LEGACY_BOARD_SIGIL_CORNER_FACET_FRAME_MS');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_MAZE_SAFE_INSET_RATIO = 0.018;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_MAZE_SAFE_INSET_MIN = 4;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_MAZE_SAFE_INSET_MAX = 7;');
    expect(menuSceneSource).toContain('if (isMenuMode && LEGACY_BOARD_GRID_ALPHA > 0) {');
    expect(menuSceneSource).toContain('Keep the board top-down: no pseudo bevel/highlight pass over the maze.');
    // Play mode no longer gets a slab backdrop/edge frame/glass tint either
    // -- that was the border-and-translucent-background box around the
    // whole maze that menu had already dropped; both surfaces now read as
    // tiles floating directly on the scene.
    expect(menuSceneSource).not.toContain('fillLegacyBoardEdgeFrame');
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_BOARD_FILL');
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_BOARD_EDGE');
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_BOARD_GLASS_ALPHA');
    expect(menuSceneSource).toContain('private resolveLegacyMazeRenderFrame(');
    expect(menuSceneSource).toContain('const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(boardLeft, boardTop, boardWidth, boardHeight);');
    expect(menuSceneSource).toContain('const mazeLeft = mazeRenderFrame.boardLeft;');
    expect(menuSceneSource).toContain('const mazeTop = mazeRenderFrame.boardTop;');
    expect(menuSceneSource).not.toContain('this.boardStaticGraphics.fillRect(boardLeft - 1, boardTop - 1, boardSize + 2, boardSize + 2);');
    expect(legacyMenuRenderSource).toContain('const LEGACY_MENU_TRENCH_EDGE_INSET_RATIO = 0.14;');
    expect(legacyMenuRenderSource).toContain('const LEGACY_MENU_TRENCH_CORE_INSET_RATIO = 0.08;');
    expect(legacyMenuRenderSource).toContain('const resolveLegacyMenuTrenchInset = (tileSize: number, ratio: number): number => {');
    expect(menuSceneSource).toContain('const drawPathPoint = (point: LegacyPoint): void => {');
    expect(menuSceneSource).toContain('private drawLegacyPathMaterialTile(');
    expect(menuSceneSource).toContain('private resolveLegacyPixelTileRect(');
    expect(menuSceneSource).toContain('const tileRect = this.resolveLegacyPixelTileRect(mazeLeft, mazeTop, tileSize, { x, y });');
    expect(menuSceneSource).toContain('const tileRect = this.resolveLegacyPixelTileRect(originX, originY, tileSize, point);');
    expect(menuSceneSource).toContain('graphics.fillStyle(options.coreColor, options.coreAlpha);');
    expect(menuSceneSource).toContain('graphics.fillRect(fillLeft, fillTop, fillRight - fillLeft, fillBottom - fillTop);');
    expect(menuSceneSource).toContain('private drawLegacyPathTileFacet(');
    expect(menuSceneSource).toContain('const facetRect = resolveLegacyMenuBorderDockFacetRect(direction, frame, {');
    expect(menuSceneSource).not.toContain('const top = mazeBottom;');
    expect(menuSceneSource).not.toContain('this.fillLegacyPathConnectorSeams(');
    expect(menuSceneSource).not.toContain('private fillLegacyPathConnectorSeams(');
    expect(menuSceneSource).toContain('const LEGACY_PATH_CONNECTOR_SEAM_PAD_RATIO = 0.16;');
    expect(menuSceneSource).toContain('const LEGACY_PATH_CONNECTOR_SEAM_EDGE_ALPHA_RATIO = 0.72;');
    expect(menuSceneSource).toContain('const LEGACY_PATH_CONNECTOR_SEAM_CORE_ALPHA_RATIO = 0.94;');
    expect(menuSceneSource).toContain('Math.round(originX + (point.x * tileSize))');
    expect(menuSceneSource).toContain('for (let index = 0; index < Math.min(tileLimit, this.menuStaticDrawTileOrder.length); index += 1)');
    expect(menuSceneSource).toContain('isMenuMode ? pathGlow : LEGACY_PLAY_PATH_EDGE');
    expect(menuSceneSource).toContain('renderBounds: mazeRenderBounds');
    expect(menuSceneSource).toContain('renderSafeInset: mazeRenderFrame.safeInset');
    expect(menuSceneSource).toContain('this.boardStaticGraphics.fillStyle(LEGACY_PLAY_WALL_FILL, LEGACY_PLAY_WALL_GLASS_ALPHA);');
    expect(menuSceneSource).not.toContain('drawLegacyBoardSigilBorder');
    expect(menuSceneSource).not.toContain('drawLegacyBoardCornerFacetShimmer');
    expect(menuSceneSource).not.toContain('hasLegacyBoardCornerShimmerPendingFrame');
    expect(menuSceneSource).not.toContain('resolveLegacyBoardCornerFacetAlpha');
    expect(menuSceneSource).toContain('cornerFacet: {');
    expect(menuSceneSource).toContain('animated: false');
    expect(menuSceneSource).toContain('shimmerPeriodMs: 0');
    expect(menuSceneSource).toContain('visible: false');
    expect(menuSceneSource).toContain('private drawLegacyPlayerTransferEnergy(');
    expect(menuSceneSource).toContain('this.drawLegacyPlayerTransferEnergy(');
    expect(menuSceneSource).toContain('resolveLegacyPlayerTransferVisualState({');
    expect(menuSceneSource).toContain('this.playerTransferEnergyDeliveryStartedAtMs = time;');
    expect(menuSceneSource).toContain('playerTransfer: LegacyPlayerTransferVisualState;');
    expect(menuSceneSource).toContain('playerTransfer,');
    expect(menuSceneSource).toContain('this.isLegacyMenuDeconstructHandoffActive(time)');
    expect(menuSceneSource).toContain('this.isLegacyMenuDeconstructVisualHandoffReady()');
    expect(menuSceneSource).toContain('handoffEndsAtMs: this.menuStaticDeconstructZeroHoldStartedAtMs === null');
    expect(menuSceneSource).toContain('zeroHoldStartedAtMs: this.menuStaticDeconstructZeroHoldStartedAtMs === null');
    expect(menuSceneSource).toContain('titleVisiblePieces');
    expect(menuSceneSource).toContain('titleFullyDeconstructed');
    expect(menuSceneSource).toContain('LEGACY_PLAYER_SPAWN_BEAM_COLOR');
    expect(menuSceneSource).toContain('private drawLegacyBackdropSigils(width: number, height: number, time: number): void');
    expect(menuSceneSource).toContain('resolveLegacyMenuBackdropGlassShards(');
    expect(menuSceneSource).toContain('resolveLegacyMenuBackdropDriftRunes(');
    expect(menuSceneSource).toContain('glassShards: LEGACY_MENU_GLASS_SHARD_COUNT');
    expect(menuSceneSource).toContain('driftRunes: LEGACY_MENU_DRIFT_RUNE_COUNT');
    expect(menuSceneSource).toContain('drawLegacyBackdropShard(');
    expect(menuSceneSource).toContain('drawLegacyBackdropRune(');
    expect(menuSceneSource).not.toContain('this.backdropGraphics.fillCircle');
    expect(legacyMenuRenderSource).toContain('resolveLegacyMenuPathStrokeSegments');
    expect(menuSceneSource).toContain('skip it entirely in menu mode. Play mode\'s gameplay');
  });

  test('restores a restrained animated backdrop without a full-screen perimeter frame', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const backdropSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMenuBackdrop.ts'), 'utf8');

    expect(backdropSource).toContain('fieldColor: cyberArcadeMaterial.substrate.field');
    expect(backdropSource).toContain('fieldColor: cyberArcadeMaterial.substrate.fieldRaised');
    expect(menuSceneSource).not.toContain('legacyPrecisionArcadeDecorationsEnabled');
    expect(menuSceneSource).not.toContain('this.backdropGraphics.strokeRoundedRect(inset, inset, width - (inset * 2), height - (inset * 2), 12);');
    expect(menuSceneSource).toContain('this.stars = createLegacyMenuBackdropStars().slice(0, LEGACY_MENU_STAR_COUNT);');
    expect(menuSceneSource).toContain('const backdropMotionEnabled = this.settings.toggleAnimatedBackdrop && !this.prefersLegacyReducedMotion();');
    expect(backdropSource).toContain('LEGACY_MENU_BACKDROP_SHARD_COUNT');
    expect(backdropSource).toContain('LEGACY_MENU_GLASS_SHARD_COUNT');
    expect(backdropSource).toContain('LEGACY_MENU_DRIFT_RUNE_COUNT');
    expect(backdropSource).toContain("LEGACY_MENU_BACKDROP_STAR_MOTION = 'radial-warp'");
    expect(backdropSource).toContain("LEGACY_MENU_BACKDROP_MOTION_PROFILE = 'visible-parallax-warp'");
    expect(backdropSource).toContain('resolveLegacyMenuBackdropWarpVector');
    expect(backdropSource).toContain('resetLegacyMenuBackdropStarNearWarpOrigin');
    expect(menuSceneSource).toContain('starMotion: LEGACY_MENU_BACKDROP_STAR_MOTION');
    expect(backdropSource).toContain('resolveLegacyMenuBackdropGlassShards');
    expect(backdropSource).toContain('resolveLegacyMenuBackdropDriftRunes');
    expect(menuSceneSource).toContain('this.drawLegacyBackdropSigils(width, height, animationTime);');
    expect(menuSceneSource).toContain('this.backdropGraphics.fillStyle(shard.color, shard.alpha * 0.038);');
    expect(backdropSource).toContain('const roundBackdropNumber = (value: number): number => Math.round(value * 1000) / 1000;');
    expect(backdropSource).toContain('const localPhase = phase * (0.34 + (index * 0.034)) + (index * 1.73);');
    expect(backdropSource).toContain('const driftX = Math.sin(localPhase) * LEGACY_MENU_BACKDROP_GLASS_DRIFT_X_RATIO;');
    expect(backdropSource).toContain('const driftY = Math.cos(localPhase * 0.76) * LEGACY_MENU_BACKDROP_GLASS_DRIFT_Y_RATIO;');
    expect(backdropSource).toContain('LEGACY_MENU_BACKDROP_GLASS_DRIFT_X_RATIO = 0.038');
    expect(backdropSource).toContain('LEGACY_MENU_BACKDROP_GLASS_DRIFT_Y_RATIO = 0.024');
    expect(backdropSource).toContain('LEGACY_MENU_BACKDROP_RUNE_CYCLE_MS = 9000');
    expect(backdropSource).toContain('const tailMagnitude = 0.68 + Math.min(0.28, distanceFromCenter * 0.42);');
    expect(menuSceneSource).toContain('Math.round(pixelX + (step.x * index))');
    expect(menuSceneSource).toContain('const upperRailStart = this.rotateBackdropPoint(shard, -halfLength * 0.86, -halfThickness * 0.58);');
    expect(menuSceneSource).toContain('const upperRailBreakEnd = this.rotateBackdropPoint(shard, halfLength * 0.1, -halfThickness * 0.58);');
    expect(menuSceneSource).toContain('const leadingCutStart = this.rotateBackdropPoint(shard, halfLength * 0.54, -halfThickness - taper);');
    expect(menuSceneSource).toContain('const notchStart = this.rotateBackdropPoint(shard, halfLength * 0.02, -halfThickness * 1.05);');
    expect(menuSceneSource).toContain('const tickStart = this.rotateBackdropPoint(rune, rune.size * 0.16, -rune.size * 0.72);');
    expect(menuSceneSource).toContain('sigils: 4');
  });

  test('keeps active play maze rendering on connected corridors instead of square debug cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const normalizedMenuSceneSource = normalizeSourceLineEndings(menuSceneSource);
    const menuTitleDrawSource = normalizedMenuSceneSource.slice(
      normalizedMenuSceneSource.indexOf('private drawLegacyMenuPathTitle(time: number): void'),
      normalizedMenuSceneSource.indexOf('private resolveLegacyMazeRenderFrame(')
    );

    expect(menuSceneSource).toContain('const LEGACY_PLAY_PATH_CORE = mixLegacyIridescentColor(cyberArcadeMaterial.path.core, 0x000000, LEGACY_PATH_CORE_EYE_COMFORT_DIM_AMOUNT);');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PATH_EDGE = cyberArcadeMaterial.path.edge;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PATH_EDGE_ALPHA = 0.58;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_WALL_FILL = cyberArcadeMaterial.substrate.field;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_WALL_GLASS_ALPHA = 0.18;');
    expect(menuSceneSource).toContain("private pathVisualStyle: LegacyPathVisualStyle = 'corridor';");
    expect(menuSceneSource).toContain('this.pathVisualStyle = resolveLegacyPathVisualStyle(runtimeSearch);');
    expect(menuSceneSource).toContain('drawCue: false');
    expect(menuSceneSource).toContain('const dynamicTrailPathSource = this.maze;');
    expect(menuSceneSource).toContain('this.backdropDirty = true;');
    expect(menuSceneSource).toContain('pathVisualStyle: this.pathVisualStyle');
    expect(menuSceneSource).toContain('textLabels: this.resolveVisualTextLabels()');
    expect(menuSceneSource).toContain('buttons: this.uiButtons');
    expect(menuSceneSource).toContain('text: button.text');
    expect(menuSceneSource).toContain('this.uiTexts.push(label, stateLabel);');
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_PATH_RELIEF_SHADOW');
    expect(menuSceneSource).toContain('isMenuMode ? pathGlow : LEGACY_PLAY_PATH_EDGE');
    expect(menuSceneSource).toContain('private boardPathGraphics!: Phaser.GameObjects.Graphics;');
    expect(menuSceneSource).toContain('private boardPathDirty = true;');
    expect(menuSceneSource).toContain('this.boardPathGraphics = this.add.graphics();');
    expect(menuSceneSource).toContain('private drawLegacyPathMaterialTile(');
    expect(menuSceneSource).toContain('private titleGraphics!: Phaser.GameObjects.Graphics;');
    expect(menuSceneSource).toContain('this.titleGraphics = this.add.graphics();');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_PRISM = cyberArcadeMaterial.rail.cyan;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_GEM = cyberArcadeMaterial.signal.playerAccent;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_FACET_WARM = cyberArcadeMaterial.signal.warning;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_SWEEP_MS = 2600;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_SWEEP_OVERSCAN_COLUMNS = 3;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_GEM_PULSE_MS = 3400;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_ORBIT_MS = 9600;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_FRAME_MS = 33;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS = 8;');
    expect(menuSceneSource).toContain('private drawLegacyMenuPathTitle(time: number): void');
    expect(menuSceneSource).toContain('return resolveLegacyMenuTitleFontSize(this.layout.titleReserveHeight);');
    expect(menuTitleDrawSource).not.toMatch(/if \(visibleCells\.length <= 0\) \{\n\s*return;\n\s*\}/);
    expect(menuSceneSource).not.toContain('drawLegacyMenuPathTitleSigilRails');
    expect(menuSceneSource).toContain('this.drawLegacyMenuPathTitleOrbitSigils(titleLayout, time, titlePresentation.titleAlpha);');
    expect(menuSceneSource).toContain("type LegacyMenuPathTitleSweepMode = 'build' | 'deconstruct' | 'idle';");
    expect(menuSceneSource).toContain('interface LegacyMenuPathTitleSweepState');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleSweepState(');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleVisibleSweepEdge(');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleVisibleSweepState(');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleAnimationDirection(time: number):');
    expect(menuSceneSource).toContain('return phase <= 0.5 ? phase * 2 : (1 - phase) * 2;');
    expect(menuSceneSource).toContain('const rightmostVisibleColumn = visibleCells.reduce(');
    expect(menuSceneSource).not.toContain('drawLegacyMenuPathTitleSigilRails');
    expect(menuSceneSource).toContain("this.menuStaticDrawLifecyclePhase === 'building'");
    expect(menuSceneSource).toContain("this.menuStaticDrawLifecyclePhase === 'deconstructing'");
    expect(menuSceneSource).toContain('this.settleLegacyMenuStaticDrawStageIfComplete(time);');
    expect(menuSceneSource).toContain('rowsVisible: this.menuStaticDrawRowsVisible');
    expect(menuSceneSource).toContain('tilesVisible: this.menuStaticDrawTilesVisible');
    expect(menuSceneSource).toContain("const syncedToLifecycle = mode !== 'idle';");
    expect(menuSceneSource).toContain('private drawLegacyMenuPathTitlePrismSweep(');
    expect(menuSceneSource).toContain('private drawLegacyMenuPathTitleGemFacets(');
    expect(menuSceneSource).toContain('private drawLegacyMenuPathTitleOrbitSigils(');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleOrbitPhase(time: number): number');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleOrbitSettlePhase(time: number): number');
    expect(menuSceneSource).toContain('const orbit = (orbitPhase + (index / LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS)) % 1;');
    expect(menuSceneSource).not.toContain('phase * 0.62');
    expect(menuSceneSource).toContain('private drawLegacyMenuPathTitleDiamond(');
    expect(menuSceneSource).not.toContain('private drawLegacyMenuPathTitleSigilRails(');
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
    expect(menuSceneSource).toContain('if (this.isLegacyMenuHandoffAnimationActive(time)) {');
    expect(menuSceneSource).toContain('private isLegacyMenuHandoffAnimationActive(time: number): boolean');
    expect(menuSceneSource).toContain('private drawBoardPaths(time: number): void {');
    expect(menuSceneSource).toContain('this.drawLegacyPathMaterialTile(');
    expect(menuSceneSource).toContain('coreAlpha: isMenuMode ? 0.92 : 0.96,');
    expect(menuSceneSource).toContain(': LEGACY_PLAY_PATH_CORE;');
    expect(menuSceneSource).not.toContain('this.boardStaticGraphics.fillStyle(walkable ? pathGlow : wallColor');
  });

  test('keeps active play HUD minimal, with the level glyph staying separate', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_TIMER_PANE =');
    expect(menuSceneSource).toContain('const LEGACY_CYBER_PANEL_STROKE = cyberArcadeMaterial.rail.mint;');
    expect(menuSceneSource).not.toContain('timerShadow.setAlpha(0.7);');
    expect(menuSceneSource).not.toContain('hudFrame.timerBounds.centerX + 1');
    // The compass idea was removed from the app entirely.
    expect(menuSceneSource).not.toContain('drawLegacyCompassGlyph');
    expect(menuSceneSource).not.toContain('private drawLegacyPlayCompass(');
    expect(menuSceneSource).toContain('this.drawLegacySettingsCogControl(this.hudGraphics, controls.pause, false, time);');
    expect(menuSceneSource).not.toContain('this.drawLegacyPlayTouchButton(');
    expect(menuSceneSource).not.toContain('this.hudGraphics.strokeRect(');
    // Player-facing toast/message cards were removed from the game entirely
    // -- no message box should ever appear on screen, in the play HUD or
    // in any overlay.
    expect(menuSceneSource).not.toContain('private drawLegacyPlayPlayerMessageStack(');
    expect(menuSceneSource).not.toContain('this.drawLegacyPlayPlayerMessageStack(hudFrame);');
  });

  test('keeps menu dynamic trail overlays in the legacy corridor frame instead of full square cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).not.toContain('const LEGACY_MENU_DYNAMIC_TRAIL_EDGE =');
    expect(menuSceneSource).not.toContain('const LEGACY_MENU_DYNAMIC_TRAIL_CORE_RATIO =');
    expect(menuSceneSource).not.toContain('const LEGACY_MENU_DYNAMIC_TRAIL_EDGE_RATIO =');
    expect(menuSceneSource).toContain('const progressionPalette = this.resolveActiveLegacyProgressionPalette();');
    expect(menuSceneSource).toContain('this.drawLegacyProgressionBadge();');
    // The compass idea (title-screen board-notch AND play-mode HUD AND the
    // Guide legend icon) was removed from the app entirely.
    expect(menuSceneSource).not.toContain('private drawLegacyMenuCompass(');
    expect(menuSceneSource).not.toContain('this.drawLegacyMenuCompass(');
    expect(menuSceneSource).not.toContain('menuCompassBounds');
    expect(menuSceneSource).not.toContain('menuCompass: {');
    expect(menuSceneSource).not.toContain('drawLegacyCompassGlyph');
    expect(menuSceneSource).toContain('topCenterNotch: this.resolveLegacyBoardTopCenterNotchBounds(boardLeft, boardTop, boardWidth)');
    expect(menuSceneSource).not.toContain('this.boardDynamicGraphics.strokeCircle(centerX, centerY, radius);');
    expect(menuSceneSource).toContain('progressionBadge: {');
    expect(menuSceneSource).toContain('this.clearLegacyPlayerProgressionBadge();');
    expect(menuSceneSource).toContain("if (this.mode === 'menu') {");
    // The old persistent top-left level badge (drawLegacyProgressionGlyph)
    // is retired in favor of drawLegacyLevelAnnouncer's centered,
    // between-mazes announcement -- shared by both surfaces since both
    // drive the same menuStaticDrawLifecyclePhase transition.
    expect(menuSceneSource).not.toContain('private drawLegacyProgressionGlyph(');
    expect(menuSceneSource).toContain('private drawLegacyLevelAnnouncer(time: number): void');
    expect(menuSceneSource).toContain('private resolveLegacyLevelAnnouncerVisualState(time: number): { alpha: number; scale: number }');
    expect(menuSceneSource).toContain('this.drawLegacyLevelAnnouncer(time);');
    // The front door no longer shows the demo AI's own level badge (it read
    // as "your level" even though it tracks an independent, invisible AI
    // progression, not anything the player has done) -- the drawing method
    // is gone; the underlying bounds fields/diagnostics key remain (always
    // null now) since other diagnostics code still references them.
    expect(menuSceneSource).not.toContain('private drawLegacyMenuAiProgressionBadge(');
    expect(menuSceneSource).toContain("this.levelAnnouncerLabelText = this.applyLegacyUiTextCrispness(this.add.text(0, 0, 'LEVEL',");
    expect(menuSceneSource).toContain('menuAiProgressionBadge: {');
    expect(menuSceneSource).toContain("placement: 'leading'");
    expect(menuSceneSource).toContain("placement: 'trailing'");
    // No panel/border chrome function at all any more -- both the level
    // badge and the play settings cog are bare, matching the menu surface's
    // own settings cog exactly (zero chrome, not lighter chrome).
    expect(menuSceneSource).not.toContain('private drawLegacyHeaderControlChrome(');
    expect(menuSceneSource).toContain('private menuSettingsCogActive = false;');
    expect(menuSceneSource).toContain('this.menuSettingsCogActive = active;');
    expect(menuSceneSource).toContain('this.boardDynamicDirty = true;');
    expect(menuSceneSource).toContain('this.prefersLegacyReducedMotion()');
    expect(menuSceneSource).not.toContain('resolveLegacyRunStatusPanelLayout');
    expect(menuSceneSource).not.toContain('resolveLegacyProgressionBadgeText');
    expect(menuSceneSource).not.toContain('portraitMenuBadgeTextOffset');
    expect(menuSceneSource).toContain('const visibleTrail = trail.filter((point) => this.isLegacyMenuPointVisibleInStaticDraw(point));');
    expect(menuSceneSource).toContain('trail.filter((point) => this.isLegacyMenuPointVisibleInStaticDraw(point))');
    expect(menuSceneSource).toContain('const dynamicTrailPathSource = this.maze;');
    expect(menuSceneSource).toContain('const shouldFadeTrailByAge = this.mode === \'play\' || this.settings.toggleTrailFade;');
    expect(menuSceneSource).toContain('this.drawLegacyDynamicTrailBorderDock(');
    expect(menuSceneSource).toContain('private drawLegacyDynamicTrailBorderDock(');
    expect(menuSceneSource).toContain('this.drawLegacyPathBorderDock(');
    expect(menuSceneSource).toContain(': 0.94;');
    expect(menuSceneSource).toContain('this.trail = resolveLegacyMenuDemoTrail(');
    expect(menuSceneSource).toContain('const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(');
    expect(menuSceneSource).toContain('const mazeTileSize = mazeRenderFrame.tileSize;');
    expect(menuSceneSource).toContain('this.fillLegacyMenuDynamicPathTile(');
    expect(menuSceneSource).toContain('pathSource: Pick<LegacyMazeSnapshot, \'grid\' | \'width\' | \'height\'>,');
    expect(menuSceneSource).toContain('LEGACY_MENU_PATH_EDGE,');
    expect(menuSceneSource).toContain('LEGACY_MENU_PATH_EDGE_ALPHA,');
    expect(menuSceneSource).toContain('const renderedPlayerPoint = this.resolveLegacyRenderedPlayerPoint(time);');
    expect(menuSceneSource).toContain('this.fillLegacyPlayerMarkerTile(renderedPlayerPoint, mazeLeft, mazeTop, mazeTileSize');
    expect(menuSceneSource).toContain('private armLegacyPlayerVisualMotion(');
    expect(menuSceneSource).toContain('isLegacyWrappedStepTransition,');
    expect(menuSceneSource).toContain('private isLegacyPlayerVisualWrapMove(from: LegacyPoint, to: LegacyPoint): boolean');
    expect(menuSceneSource).toContain('if (this.isLegacyPlayerVisualWrapMove(from, to)) {');
    expect(menuSceneSource).toContain('return isLegacyWrappedStepTransition(from, to);');
    expect(menuSceneSource).toContain('private hasLegacyPlayerVisualMotionPendingFrame(time: number): boolean');
    expect(menuSceneSource).toContain('const centerX = originX + ((point.x + 0.5) * tileSize);');
    expect(menuSceneSource).toContain('resolveLegacyPlayerMarkerRenderMetrics(');
    // The player is a square filling LEGACY_PLAYER_MARKER_SQUARE_FILL_RATIO
    // of the tile, not the old diamond.
    expect(menuSceneSource).toContain('const LEGACY_PLAYER_MARKER_SQUARE_FILL_RATIO = 0.85;');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.fillRect(');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.strokeRect(');
    expect(menuSceneSource).toContain('this.isLegacyMenuPointVisibleInStaticDraw(this.player)');
  });

  test('keeps active play dynamic overlays in the corridor frame instead of square cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).not.toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_EDGE =');
    expect(menuSceneSource).not.toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_CORE_RATIO =');
    expect(menuSceneSource).not.toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_EDGE_RATIO =');
    expect(menuSceneSource).toContain('resolveLegacyIridescentTrailColor(');
    expect(menuSceneSource).toContain('resolveLegacyIridescentPulseColor(');
    expect(menuSceneSource).toContain('resolveLegacyIridescentPlayerCoreColor(time)');
    expect(menuSceneSource).toContain('resolveLegacyIridescentPlayerHaloColor(time, palette.playerHaloColor)');
    expect(menuSceneSource).toContain('resolveLegacyIridescentPlayerAccentColor(time, playerCoreColor)');
    expect(menuSceneSource).toContain('palette.trailPulseColor');
    expect(menuSceneSource).toContain('palette.trailPulseEdgeColor');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS = LEGACY_TRAIL_SHINE_ONE_WAY_PERIOD_MS;');
    expect(menuSceneSource).toContain('const pulseCenterIndex = useOneWaySweep');
    expect(menuSceneSource).toContain('resolveLegacyTrailPulseSweepMotion({');
    expect(menuSceneSource).toContain('trailShineDirection: trailShineMotion.direction');
    expect(menuSceneSource).toContain('trailShineCyclePeriodMs: trailShineMotion.cyclePeriodMs');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_WINDOW = 3.6;');
    expect(menuSceneSource).toContain('const falloff = smoothstep(1 - (distance / LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_WINDOW));');
    expect(menuSceneSource).not.toContain('drawLegacyDynamicTrailShine');
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_DYNAMIC_TRAIL_SHINE');
    expect(menuSceneSource).toContain('this.fillLegacyPlayDynamicPathTile(');
    expect(menuSceneSource).toContain('LEGACY_PLAY_PATH_EDGE,');
    expect(menuSceneSource).toContain('LEGACY_PLAY_PATH_EDGE_ALPHA,');
    expect(menuSceneSource).toContain('this.hasLegacyPlayTrailPulsePendingFrame(time)');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_TRAIL_PULSE_FRAME_INTERVAL_MS = 33;');
    expect(menuSceneSource).toContain('private legacyPlayTrailPulseNextFrameAtMs = 0;');
    expect(menuSceneSource).toContain('if (this.isLegacyTrailShineVisible()) {');
    expect(menuSceneSource).toContain('this.drawLegacyPlayDynamicTrailPulse(');
    expect(menuSceneSource).toContain('resolvedBoardLeft,');
    expect(menuSceneSource).toContain('mazeRenderFrame.boardWidth,');
    expect(menuSceneSource).toContain('mazeRenderFrame.boardHeight,');
    expect(menuSceneSource).toContain("const active = this.isLegacyTrailShineVisible() && this.overlay === 'none' && this.trail.length > 1;");
    expect(menuSceneSource).toContain('this.legacyPlayTrailPulseNextFrameAtMs = time + LEGACY_PLAY_TRAIL_PULSE_FRAME_INTERVAL_MS;');
    expect(menuSceneSource).toContain('this.resolveLegacyPlayPerfectPathTrail()');
    expect(menuSceneSource).toContain('oneWayPeriodMs: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS');
    expect(menuSceneSource).not.toContain('private resolveLegacyPointPathSource(');
    expect(menuSceneSource).toContain("this.fillPlayDynamicMarkerTile(this.maze.start, mazeLeft, mazeTop, mazeTileSize, 0.9 * markerDeconstructAlpha, 'start');");
    expect(menuSceneSource).toContain("this.fillPlayDynamicMarkerTile(this.maze.goal, mazeLeft, mazeTop, mazeTileSize, 0.95 * markerDeconstructAlpha, 'goal', time);");
    expect(menuSceneSource).toContain('const LEGACY_PLAY_START_MARKER_CORE = cyberArcadeMaterial.signal.start;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_START_MARKER_EDGE = cyberArcadeMaterial.signal.startEdge;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_GOAL_MARKER_CORE = cyberArcadeMaterial.signal.goal;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_GOAL_MARKER_EDGE = cyberArcadeMaterial.signal.goalEdge;');
    expect(menuSceneSource).toContain('markerStyle: {');
    expect(menuSceneSource).toContain('playerCoreColor: resolveLegacyIridescentPlayerCoreColor(time)');
    expect(menuSceneSource).toContain('playerHaloColor: progressionPalette.playerHaloColor');
    expect(menuSceneSource).toContain('startCoreColor: LEGACY_PLAY_START_MARKER_CORE');
    expect(menuSceneSource).toContain('startEdgeColor: LEGACY_PLAY_START_MARKER_EDGE');
    expect(menuSceneSource).toContain('trailPulseColor: progressionPalette.trailPulseColor');
    expect(menuSceneSource).toContain('trailPulseEdgeColor: progressionPalette.trailPulseEdgeColor');
    expect(menuSceneSource).toContain('trailShineEnabled: this.isLegacyTrailShineVisible()');
    expect(menuSceneSource).toContain('trailShineColor: progressionPalette.trailPulseColor');
    expect(menuSceneSource).toContain('trailShineEdgeColor: progressionPalette.trailPulseEdgeColor');
    expect(menuSceneSource).toContain('iridescentMaterial: this.resolveLegacyIridescentMaterialDiagnostics(time, progressionPalette)');
    expect(menuSceneSource).toContain('private resolveLegacyIridescentMaterialDiagnostics(');
    expect(menuSceneSource).toContain('minPathColorDistance: LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE');
    expect(menuSceneSource).toContain('playerHaloShiftColor: resolveLegacyIridescentPlayerHaloColor(time, palette.playerHaloColor)');
    expect(menuSceneSource).toContain('pulseHeadColor: resolveLegacyIridescentPulseColor(trailHeadIndex, trailLength, time, palette.trailPulseColor)');
    expect(menuSceneSource).toContain('shineHeadColor: resolveLegacyIridescentPulseColor(trailHeadIndex, trailLength, time, palette.trailPulseColor)');
    expect(menuSceneSource).toContain('trailHeadColor: resolveLegacyIridescentTrailColor(trailHeadIndex, trailLength, time, palette.trailColor)');
    expect(menuSceneSource).toContain('trailPulsePeriodMs: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS');
    expect(menuSceneSource).toContain('trailPulseEnabled: this.isLegacyTrailShineVisible()');
    expect(menuSceneSource).toContain('return this.legacyReducedMotionEnabled;');
    expect(menuSceneSource).toContain('private isLegacyTrailShineVisible(): boolean');
    expect(menuSceneSource).toContain('playerCoreRadius: playerMarkerMetrics.coreRadius');
    expect(menuSceneSource).toContain('playerBeaconColor: LEGACY_PLAY_PLAYER_BEACON_COLOR');
    expect(menuSceneSource).toContain('playerBeaconPeriodMs: LEGACY_PLAY_PLAYER_BEACON_PERIOD_MS');
    expect(menuSceneSource).toContain('playerHaloRadius: playerMarkerMetrics.haloRadius');
    expect(menuSceneSource).toContain('private drawLegacyEndpointGlow(');
    expect(menuSceneSource).toContain('this.fillLegacyPlayerMarkerTile(renderedPlayerPoint');
    expect(menuSceneSource).toContain('const markersBuiltIn = this.menuStaticDrawLifecyclePhase !== \'building\';');
    expect(menuSceneSource).toContain('this.fillLegacyPlayerMarkerTile(renderedPlayerPoint, mazeLeft, mazeTop, mazeTileSize, playerAlpha, true, progressionPalette, time);');
    expect(menuSceneSource).toContain('this.armLegacyPlayerVisualMotion(previousPlayer, nextStep.player, this.time.now, this.resolveLegacyPlayerVisualMoveDurationMs());');
    expect(menuSceneSource).toContain('renderScreenX: mazeRenderFrame.boardLeft + ((renderedPlayerPoint.x + 0.5) * mazeRenderFrame.tileSize)');
    expect(menuSceneSource).toContain('visualMotionActive: this.hasLegacyPlayerVisualMotionPendingFrame(time)');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO = 0.46;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO = 0.72;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_BEACON_COLOR = cyberArcadeMaterial.signal.player;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_BEACON_ACCENT = cyberArcadeMaterial.signal.playerAccent;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_BEACON_PERIOD_MS = 1150;');
    expect(menuSceneSource).toContain('const stretchAmount = Math.sin(progress * Math.PI) * 0.18;');
    expect(menuSceneSource).toContain('const horizontalMove = Math.abs(dx) >= Math.abs(dy);');
    expect(menuSceneSource).not.toContain('this.boardDynamicGraphics.strokeCircle(centerX, centerY, beaconRadius);');
    expect(menuSceneSource).toContain('resolveLegacyPlayerLocatorRenderMetrics(');
    expect(menuSceneSource).toContain('drawLocatorTick(centerX - locatorMetrics.outerRadius, centerY, centerX - locatorMetrics.innerRadius, centerY);');
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
    const phonePlayPlayer = resolveLegacyPlayerMarkerRenderMetrics(7, 0.46, 0.72, 0.46, 0.72);
    expect(phonePlayPlayer.coreRadius).toBeCloseTo(3.22, 3);
    expect(phonePlayPlayer.haloRadius).toBeCloseTo(5.04, 3);
    expect(phonePlayPlayer.strokeWidth).toBe(1);
    const tinyLocator = resolveLegacyPlayerLocatorRenderMetrics(3.265, tinyPlayer.haloRadius, tinyPlayer.strokeWidth);
    expect(tinyLocator.innerRadius).toBeCloseTo(0.752, 3);
    expect(tinyLocator.outerRadius).toBeCloseTo(1.567, 3);
    expect(tinyLocator.strokeWidth).toBe(1);
    const tinyEndpoint = resolveLegacyEndpointMarkerRenderMetrics(3.265);
    expect(tinyEndpoint.coreRadius).toBeCloseTo(1, 3);
    expect(tinyEndpoint.outerRadius).toBeCloseTo(1.567, 3);
    expect(tinyEndpoint.strokeWidth).toBe(1);
  });

  test('keeps menu generation routed through the progression scale cap', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('private resolveLegacyProgressionScaleForMode(mode: RuntimeMode): number');
    expect(menuSceneSource).toContain("surface: mode === 'play' ? 'play' : 'menu-demo'");
    expect(menuSceneSource).toContain("this.resolveLegacyProgressionScaleForMode('menu')");
    expect(menuSceneSource).toContain('this.resolveLegacyProgressionScaleForMode(mode)');
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
    expect(menuSceneSource).toContain("|| this.overlay !== 'none'");
    expect(menuSceneSource).toContain("// The fixed play controls must not intercept an overlay action.");
    expect(menuSceneSource).toContain('private handleOverlayBackChevronPointerDown(pointer: Phaser.Input.Pointer): boolean');
    expect(menuSceneSource).toContain('this.overlayBackChevronAction();');
    expect(menuSceneSource).toContain('private drawLegacyPlayTouchControls(');
    expect(menuSceneSource).toContain('private resolveLegacyPlayActiveTouchControls()');
    expect(menuSceneSource).toContain('activeControls: this.resolveLegacyPlayActiveTouchControls()');
    // Play movement no longer has a fixed-position on-screen widget of any
    // kind (arrows or otherwise) -- every touch starts a floating stick
    // centered on wherever it landed instead, so the board can be
    // full-bleed. resolveTouchArrowMovementKindAtPoint, the fixed dpad
    // button drawing, and the controlMode arrows/stick branching are gone.
    expect(menuSceneSource).not.toContain('resolveTouchArrowMovementKindAtPoint');
    expect(menuSceneSource).not.toContain('this.drawLegacyPlayTouchButton(');
    expect(menuSceneSource).not.toContain("touchControlLayout.controlMode === 'arrows'");
    expect(menuSceneSource).toContain('private legacyPlayTouchControlPointerUpHandler: ((event: PointerEvent) => void) | null = null;');
    expect(menuSceneSource).toContain('target.addEventListener(\'pointerup\', this.legacyPlayTouchControlPointerUpHandler as EventListener');
    expect(menuSceneSource).toContain('target.addEventListener(\'pointercancel\', this.legacyPlayTouchControlPointerUpHandler as EventListener');
    expect(menuSceneSource).toContain('this.handleLegacyPlayTouchControlClientPoint(event.clientX, event.clientY, event.pointerId)');
    expect(menuSceneSource).toContain('this.handleLegacyPlayTouchControlClientMove(event.clientX, event.clientY, event.pointerId)');
    expect(menuSceneSource).toContain('this.releaseLegacyPlayTouchPointer(event.pointerId)');
    expect(menuSceneSource).toContain('this.playTouchArrowPointerId === normalizedPointerId');
    // Every touch starts a floating stick, centered on the touch point
    // itself -- see playFloatingStickOrigin and
    // resolveLegacyPlayFloatingStickGeometry -- instead of dispatching an
    // immediate pull vector against a fixed layout stick at touch-down.
    expect(menuSceneSource).toContain('this.playFloatingStickOrigin = { x, y };');
    expect(menuSceneSource).toContain('private resolveLegacyPlayFloatingStickGeometry(');
    expect(menuSceneSource).toContain('this.setLegacyPlayHeldTouchMoveCandidates(pullVector.movementCandidates');
    expect(menuSceneSource).toContain('movementCandidates: [...this.playTouchStickPull.movementCandidates]');
    expect(menuSceneSource).toContain('angleRadians: this.playTouchStickPull.angleRadians');
    expect(menuSceneSource).toContain('allowBeyondOuter: true');
    expect(menuSceneSource).toContain('this.playDirectionalIntent.requestAnalog(');
    expect(menuSceneSource).toContain('private resolveLegacyInputPointerPoint(pointer: Phaser.Input.Pointer)');
    expect(menuSceneSource).toContain('return this.resolveLegacyPlayTouchClientPoint(touch.clientX, touch.clientY);');
    expect(menuSceneSource).toContain('keepWhenBlocked: true');
    expect(menuSceneSource).not.toContain('allowBeyondFrame: true');
    expect(menuSceneSource).not.toContain('centerFallback: existingMovement');
    expect(menuSceneSource).toContain('const candidates = resolveHumanMovementPriorityCandidates(');
    expect(menuSceneSource).toContain('this.requestLegacyPlayDirectionalIntent(candidates);');
    expect(menuSceneSource).toContain('this.scheduleLegacyPlayHeldTouchRepeat(this.resolveLegacyPlayHeldTouchDelay(\'repeat\'));');
    expect(menuSceneSource).toContain('if (this.playTouchArrowPointerId !== null || this.playTouchStickPointerId !== null) {');
    expect(menuSceneSource).toContain('private drawLegacyPlayTouchStick(');
    expect(menuSceneSource).toContain('const knobRadius = stick.knobRadius;');
    expect(menuSceneSource).toContain('const travel = stick.travelRadius;');
    // Stripped down to just the knob -- no stationary outer ring, spokes,
    // hub, deadzone ring, or glow halo, per feedback that the "huge green
    // circle" wasn't wanted, only the small knob that tracks the touch.
    expect(menuSceneSource).not.toContain('private drawLegacyPlayFloatingStickGlow(');
    expect(menuSceneSource).not.toContain('this.hudGraphics.fillCircle(centerX, centerY, outerRadius);');
    expect(menuSceneSource).toContain('deadzoneRadius: touchControlLayout.stick.deadzoneRadius');
    expect(menuSceneSource).toContain('knobRadius: touchControlLayout.stick.knobRadius');
    expect(menuSceneSource).toContain('travelRadius: touchControlLayout.stick.travelRadius');
    expect(menuSceneSource).toContain('private setLegacyPlayHeldTouchMoveCandidates(');
    expect(menuSceneSource).toContain('const wasHeld = this.playMoveFlags[direction];');
    // beginLegacyPlayHeldTouchMove -- the discrete-button-press path only
    // the fixed arrows widget used -- is gone along with the widget itself;
    // setLegacyPlayHeldTouchMoveCandidates (the floating stick's own path)
    // still guards the same held-move limit, just via a slot-count subtraction.
    expect(menuSceneSource).not.toContain('private beginLegacyPlayHeldTouchMove(');
    expect(menuSceneSource).toContain('const availableCandidateSlots = Math.max(0, LEGACY_PLAY_HELD_TOUCH_MOVE_LIMIT - remainingMoves.length);');
    expect(menuSceneSource).toContain('private resolveLegacyPlayHeldTouchDelay(kind:');
    expect(menuSceneSource).toContain('private resolveLegacyPlayMovementSpeedProfile()');
    expect(menuSceneSource).toContain('completedCycles: playerTrack.completedCycles');
    expect(menuSceneSource).toContain('effectiveMovementSpeed: movementSpeedProfile.effectiveSpeed');
    expect(menuSceneSource).toContain('formulaVersion: movementSpeedProfile.formulaVersion');
    expect(menuSceneSource).toContain("this.resolveLegacyPlayHeldTouchDelay(hadActiveMove ? 'turn' : 'initial')");
    expect(menuSceneSource).toContain("this.resolveLegacyPlayHeldTouchDelay('repeat')");
    expect(menuSceneSource).toContain('repeatInitialDelayMs: movementSpeedProfile.initialDelayMs');
    expect(menuSceneSource).toContain('repeatIntervalMs: movementSpeedProfile.repeatIntervalMs');
    expect(menuSceneSource).toContain('stickRepeatIntervalMaxMs: LEGACY_PLAY_STICK_REPEAT_INTERVAL_MAX_MS');
    expect(menuSceneSource).toContain('turnDelayMs: movementSpeedProfile.turnDelayMs');
    expect(menuSceneSource).toContain('Math.min(profile.repeatIntervalMs, LEGACY_PLAY_STICK_REPEAT_INTERVAL_MAX_MS)');
    expect(menuSceneSource).toContain('this.hudTouchControlBounds = this.drawLegacyPlayTouchControls(time, touchControlLayout);');
    // The compass idea was removed from the app entirely -- the timer takes
    // the centered top HUD slot it used to share space beside.
    expect(menuSceneSource).not.toContain('drawLegacyCompassGlyph');
    expect(menuSceneSource).toContain('this.hudBounds = this.hudTimerBounds;');
    expect(menuSceneSource).toContain('touchControls');
    expect(menuSceneSource).toContain('LEGACY_CYBER_PANEL_FILL');
    expect(menuSceneSource).not.toContain('drawLegacyPlayTouchLabel');
    expect(menuSceneSource).not.toContain("this.drawLegacyPlayTouchLabel(controls.restart_attempt, 'RESET');");
    expect(menuSceneSource).not.toContain("this.drawLegacyPlayTouchLabel(controls.toggle_thoughts, 'TRAIL');");
    // The fixed dpad's directional arrow glyphs (drawLegacyPlayTouchArrow)
    // are gone along with the rest of the fixed-widget drawing.
    expect(menuSceneSource).not.toContain('private drawLegacyPlayTouchArrow(');
    expect(menuSceneSource).toContain('installLegacyPlayTouchControlFallback');
    expect(menuSceneSource).toContain("event.pointerType === 'touch'");
    expect(menuSceneSource).toContain('event.target === this.game.canvas');
    expect(menuSceneSource).toContain('event.stopImmediatePropagation()');
    expect(menuSceneSource).toContain("case 'pause':");
    // Reset (reset-player) was removed from the game entirely; Menu no
    // longer lives in a bottom action bar at all -- it's a home icon
    // sharing the header row with the back chevron instead (see
    // createLegacyOverlayHomeButton). Account is not an entry point from
    // Pause at all.
    expect(menuSceneSource).not.toContain("const resetAction = (): void => this.applyLegacyPauseCommand('reset-player');");
    expect(menuSceneSource).toContain("this.createLegacyOverlayHomeButton(panel, () => this.applyLegacyPauseCommand('return-menu'), panel.centerX)");
    expect(menuSceneSource).toContain('private readonly playDirectionalIntent = new LegacyDirectionalIntentResolver();');
    expect(menuSceneSource).toContain('private requestLegacyPlayDirectionalIntent(controls: readonly HumanMovementActionKind[]): void');
    expect(menuSceneSource).toContain('this.playDirectionalIntent.step(this.maze, this.player, {');
    expect(menuSceneSource).toContain('assistedLaneShiftEnabled: true');
    expect(menuSceneSource).toContain('private tryMovePlayerFromInput(');
    expect(menuSceneSource).toContain('const directions = resolveLegacyCardinalDirectionsFromVector(deltaX, deltaY);');
    expect(menuSceneSource).toContain('return this.performLegacyPlayDirectionalIntentStep();');
    expect(menuSceneSource).toContain('const accepted = this.tryMovePlayerFromInput(vector.deltaX, vector.deltaY, { releaseAfterStep: true });');
    expect(menuSceneSource).toContain('private legacyWorldTurnHost = this.createLegacyWorldTurnHost();');
    expect(menuSceneSource).toContain("'player-movement': (): WorldTurnPhaseResult => this.applyLegacyWorldTurnPlayerMovement()");
    expect(menuSceneSource).toContain('this.legacyWorldTurnHost.setState(this.resolveLegacyWorldTurnHostState());');
    expect(menuSceneSource).toContain('receipt = this.legacyWorldTurnHost.advance({');
    expect(menuSceneSource).toContain("return 'stopped';");
    expect(menuSceneSource).toContain("return 'paused';");
    expect(menuSceneSource).toContain('registeredPhases: [...worldTurnDiagnostics.registeredPhases]');
    expect(menuSceneSource).toContain('timedModeEnabled: worldTurnDiagnostics.timedModeEnabled');
    expect(menuSceneSource).toContain('worldTurn: {');
  });

  test('keeps static and dynamic board layers on the same board offset', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const { boardLeft: layoutBoardLeft, boardTop: layoutBoardTop, boardWidth, boardHeight } = this.layout;');
    expect(menuSceneSource).toContain('const boardOffset = this.resolveBoardOffset();');
    expect(menuSceneSource).toContain('const boardLeft = layoutBoardLeft + boardOffset.x;');
    expect(menuSceneSource).toContain('const boardTop = layoutBoardTop + boardOffset.y;');
    expect(menuSceneSource).toContain('const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(boardLeft, boardTop, boardWidth, boardHeight);');
    expect(menuSceneSource).toContain('this.layout.boardLeft + boardOffset.x');
    expect(menuSceneSource).toContain('this.layout.boardTop + boardOffset.y');
    expect(menuSceneSource).not.toContain('toggleCameraFollow');
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
    expect(menuSceneSource).toContain('status: MazerRenderResolutionStatus');
    expect(menuSceneSource).toContain('applyMazerCanvasBackingResolution,');
    expect(menuSceneSource).toContain('resolveMazerCanvasBackingResolution,');
    expect(menuSceneSource).toContain("summarizeMazerRenderResolution,");
    expect(menuSceneSource).toContain("type MazerRenderResolutionDiagnostics,");
    expect(menuSceneSource).toContain("type MazerRenderResolutionStatus");
    expect(menuSceneSource).toContain('const renderResolutionDiagnostics = summarizeMazerRenderResolution({');
    // refreshLayout() must force Phaser's own Scale Manager back in sync
    // with our authoritative width/height BEFORE mutating the canvas here --
    // otherwise a stale automatic resize from Phaser's own observer can
    // leave pointer transforms (which read Phaser's canvasBounds/displayScale,
    // never the backing-store pixel count this sets) offset from what's
    // actually drawn. See the back-chevron hit-box investigation.
    expect(menuSceneSource).toContain('if (this.scale.width !== width || this.scale.height !== height) {');
    expect(menuSceneSource).toContain('syncMazerGameToViewport(this.game, viewportGeometry);');
    expect(menuSceneSource).toContain('const backingResolution = resolveMazerCanvasBackingResolution({');
    expect(menuSceneSource).toContain('applyMazerCanvasBackingResolution({');
    expect(menuSceneSource).toContain('canvas: this.game.canvas');
    expect(menuSceneSource).toContain("context: canvasRenderer.gameContext ?? this.game.canvas.getContext('2d')");
    expect(menuSceneSource).toContain('renderResolution: renderResolutionDiagnostics');
    expect(menuSceneSource).toContain('renderSurface: {');
    expect(menuSceneSource).toContain('...renderResolutionDiagnostics');
    expect(menuSceneSource).toContain('pathMaterial: {');
    expect(menuSceneSource).toContain('connectorSeamsEnabled: true');
    expect(menuSceneSource).toContain('seamCoreAlphaRatio: LEGACY_PATH_CONNECTOR_SEAM_CORE_ALPHA_RATIO');
    expect(menuSceneSource).toContain('seamEdgeAlphaRatio: LEGACY_PATH_CONNECTOR_SEAM_EDGE_ALPHA_RATIO');
    expect(menuSceneSource).toContain('seamPadRatio: LEGACY_PATH_CONNECTOR_SEAM_PAD_RATIO');
  });

  test('draws game-toggle switch positions from the canonical toggle resolver', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const toggleFieldSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyOverlayToggleFields.ts'), 'utf8');

    expect(toggleFieldSource).toContain('export const resolveLegacyOverlayToggleSwitchIsOn = (');
    expect(toggleFieldSource).toContain("case 'controlMode':");
    expect(toggleFieldSource).toContain("return settings.controlMode === 'stick';");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailFade', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailPulse', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('toggleAnimatedBackdrop', this.settings)");
    // Play touch movement only has one control scheme now (the floating
    // stick), so the settings list no longer surfaces a meaningless
    // arrows-vs-stick row for it -- the underlying resolver keeps the
    // 'controlMode' case (asserted above) for the settings field itself,
    // just unrendered.
    expect(menuSceneSource).not.toContain("label: 'Control Style'");
    expect(menuSceneSource).toContain("switchIsOn: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailPulse', this.settings)");
  });

  test('applies capped high-DPI text resolution to menu and overlay UI text', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const textCrispnessSource = readFileSync(resolve(process.cwd(), 'src/render/textCrispness.ts'), 'utf8');

    expect(menuSceneSource).toContain("import { applyTextResolution, resolveHudTextResolution } from '../render/textCrispness';");
    expect(menuSceneSource).toContain('private resolveLegacyUiTextResolution(): number');
    expect(menuSceneSource).toContain('return resolveHudTextResolution({ width, height });');
    expect(menuSceneSource).toContain('private applyLegacyUiTextCrispness<T extends Phaser.GameObjects.Text>(text: T): T');
    expect(menuSceneSource).toContain('return applyTextResolution(text, this.resolveLegacyUiTextResolution());');
    expect(menuSceneSource).toContain('this.footerText = this.applyLegacyUiTextCrispness(this.add.text');
    expect(menuSceneSource).toContain('this.levelAnnouncerNumberText = this.applyLegacyUiTextCrispness(this.add.text');
    expect(menuSceneSource).toContain('this.applyLegacyUiTextCrispness(text);');
    expect(menuSceneSource).toContain('textTextureResolution: this.resolveLegacyUiTextResolution()');
    expect(menuSceneSource).toContain("textTransformOwner: 'game-canvas-only'");
    expect(textCrispnessSource).toContain("import { MAZER_CANVAS_RESOLUTION_MIN } from '../boot/canvasResolution';");
    expect(textCrispnessSource).toContain('return MAZER_CANVAS_RESOLUTION_MIN;');
    expect(textCrispnessSource).not.toContain('resolutionCap');
    expect(textCrispnessSource).not.toContain('navigator.webdriver');
    expect(textCrispnessSource).not.toContain('HeadlessChrome');
  });

  test('publishes a compact walkable maze snapshot for live play QA', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const runtimeDiagnosticsSource = readFileSync(resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'), 'utf8');

    expect(runtimeDiagnosticsSource).toContain("encoding: 'walkable-rows-v1';");
    expect(runtimeDiagnosticsSource).toContain('walkableRows: string[];');
    expect(runtimeDiagnosticsSource).toContain('progressionCompletedCycles: string;');
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
    expect(tuningSource).toContain('full: 16,');
    expect(tuningSource).toContain('throttled: 250,');
  });

  test('caches OS reduced motion and settles only visual state when it changes', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const preferenceSource = menuSceneSource.slice(
      menuSceneSource.indexOf('private installLegacyReducedMotionPreference(): void'),
      menuSceneSource.indexOf('private isLegacyTrailShineVisible(): boolean')
    );

    expect(menuSceneSource).toContain('private legacyReducedMotionEnabled = false;');
    expect(menuSceneSource).toContain('private legacyReducedMotionMediaQuery: MediaQueryList | null = null;');
    expect(menuSceneSource).toContain('this.installLegacyReducedMotionPreference();');
    expect(menuSceneSource).toContain('this.detachLegacyReducedMotionPreference();');
    expect(preferenceSource).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
    expect(preferenceSource).toContain("mediaQuery.addEventListener('change', this.legacyReducedMotionMediaQueryListener)");
    expect(preferenceSource).toContain("mediaQuery.removeEventListener('change', listener)");
    expect(preferenceSource).toContain('this.syncLegacyPlayerVisualMotionTo(this.playerVisualMotion.to);');
    expect(preferenceSource).toContain('this.backdropDirty = true;');
    expect(preferenceSource).toContain('this.boardDynamicDirty = true;');
    expect(preferenceSource).toContain('this.hudDirty = true;');
    expect(preferenceSource).toContain('return this.legacyReducedMotionEnabled;');
    expect(preferenceSource).not.toContain('tryMovePlayerFromInput');
    expect(preferenceSource).not.toContain('legacyWorldTurnHost');
  });

  test('keeps front-door buttons and header controls on their shared chrome paths', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');

    expect(menuSceneSource).toContain('const panel = this.add.graphics();');
    expect(menuSceneSource).toContain('this.drawLegacyCyberPanel(panel, {');
    expect(menuSceneSource).toContain('frontDoorChrome?.hoverFillColor ?? cyberArcadeMaterial.substrate.panelActive');
    expect(menuSceneSource).toContain('frontDoorChrome?.fillColor ?? LEGACY_CYBER_PANEL_FILL');
    expect(menuSceneSource).toContain('stroke: frontDoorChrome?.strokeColor');
    expect(menuSceneSource).toContain('const buttonTextColor = isPrimaryFrontDoorButton');
    expect(menuSceneSource).toContain('? MENU_TEXT_COLOR');
    expect(menuSceneSource).toContain('private createLegacyMenuSettingsCogButton(onClick: () => void): UiButton');
    expect(menuSceneSource).toContain("semanticAction: 'Settings'");
    expect(menuSceneSource).toContain("text: 'Settings'");
    expect(menuSceneSource).toContain('const LEGACY_PLAY_TOUCH_COG_HUB = cyberArcadeMaterial.substrate.field;');
    expect(menuSceneSource).not.toContain('fillStyle(0x05070a');
    expect(menuSceneSource).toContain('private drawLegacySettingsCogControl(');
    // No panel/border chrome behind the play cog at all, and now the same
    // color/size/blink pulse as the menu surface's own settings cog too --
    // not just "no box" but the actual same icon.
    expect(menuSceneSource).toMatch(/drawLegacySettingsCogControl\([\s\S]*?this\.drawLegacySettingsCog\(\s*graphics,\s*visualRect,\s*active,\s*0\.34 \* blinkScale,/);
    expect(menuSceneSource).toContain('private drawLegacyMenuSettingsCog(time: number): void');
    expect(menuSceneSource).toContain('this.drawLegacyMenuSettingsCog(time);');
    // The menu cog's blink is drawn inside drawBoardPaths, gated by
    // boardPathDirty -- update() must re-arm that flag every menu-mode
    // frame the same way it already does for play mode's cog (hudDirty)
    // and LVL badge (boardDynamicDirty), or the blink freezes between
    // whatever else happens to touch boardPathDirty and jumps on the next
    // unrelated redraw instead of pulsing smoothly.
    expect(menuSceneSource).toContain("if (this.mode === 'menu' && this.overlay === 'none' && !this.prefersLegacyReducedMotion()) {\n      this.boardPathDirty = true;\n    }");
    expect(menuSceneSource).toContain('cyberArcadeMaterial.signal.player,\n      cyberArcadeMaterial.rail.mint,\n      blinkAlpha\n    );');
    expect(menuSceneSource).toContain('this.drawLegacySettingsCogControl(this.hudGraphics, controls.pause, false, time);');
    expect(menuSceneSource).toContain("placement: 'trailing'");
    expect(menuSceneSource).not.toContain('drawLegacyPlayTouchPauseIcon');
    expect(menuSceneSource).toContain('const background = this.add.rectangle(\n      pauseRect.centerX,');
    expect(menuSceneSource).toContain('bounds: createVisualRect(pauseRect.left, pauseRect.top, pauseRect.width, pauseRect.height)');
    expect(menuSceneSource).toContain('text,');
    expect(menuSceneSource).toContain('? Math.max(frontDoorChrome?.hoverAlpha ?? 0.68, 0.68)');
  });

  test('keeps settings semantic while the compact active-track level baseline stays free of board decorations', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).not.toContain("this.createOverlayTitle('Settings'");
    expect(menuSceneSource).not.toContain("this.createOverlayTitle('Paused'");
    expect(menuSceneSource).toContain("semanticAction: 'Settings'");
    expect(menuSceneSource).toContain("text: 'Settings'");
    expect(menuSceneSource).not.toContain('legacyPrecisionArcadeDecorationsEnabled');
    expect(menuSceneSource).toContain('const trackId = this.resolveActiveLegacyProgressionTrackId();');
    expect(menuSceneSource).toContain('this.progressionState.tracks[trackId]');
    expect(menuSceneSource).not.toContain('createLegacyRoomActivationPreviewCue(');
  });

  test('keeps account login/logout inside the shared player-facing overlay system', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
    const authSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyAuth.ts'), 'utf8');
    const playerMessageSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyPlayerMessage.ts'), 'utf8');
    const overlayRoutingSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyOverlayRouting.ts'), 'utf8');

    expect(overlayRoutingSource).toContain("export type LegacyOverlayKind = 'none' | 'options' | 'pause' | 'auth' | 'confirm-progression-reset' | 'leaderboard';");
    expect(authSource).toContain('createClient(config.url, config.anonKey');
    expect(authSource).toContain('autoRefreshToken: true');
    expect(authSource).toContain('persistSession: true');
    expect(authSource).toContain('detectSessionInUrl: true');
    expect(authSource).toContain('createLegacyAuthScopedStorage');
    expect(menuSceneSource).toContain('LEGACY_GAME_TOGGLE_STORAGE_KEY');
    expect(menuSceneSource).toContain('this.loadPersistedLegacyGameToggleSettings();');
    expect(menuSceneSource).toContain('this.authSnapshot');
    expect(menuSceneSource).toContain('private resolveLegacyRuntimeAuthFixtureSnapshot(): LegacyAuthSessionSnapshot | null');
    expect(menuSceneSource).toContain("runtimeDiagnostics !== '1' && runtimeDiagnostics !== 'true'");
    expect(menuSceneSource).toContain("searchParams.get('authFixture')?.trim().toLowerCase() !== 'authenticated'");
    expect(menuSceneSource).toContain("userId: 'runtime-diagnostics-auth-fixture'");
    expect(menuSceneSource).toContain('const runtimeAuthFixtureSnapshot = this.resolveLegacyRuntimeAuthFixtureSnapshot();');
    expect(menuSceneSource).toContain('if (runtimeAuthFixtureSnapshot) {');
    expect(menuSceneSource).toContain("this.openOverlay('auth')");
    expect(menuSceneSource).toContain('private buildAuthOverlay(): void');
    expect(menuSceneSource).toContain('resolveLegacyAuthPresentation({');
    expect(menuSceneSource).toContain("fieldId === 'password'");
    expect(menuSceneSource).toContain('private createLegacyAuthPasswordVisibilityButton(');
    expect(menuSceneSource).toContain("this.authPasswordVisible ? 'text' : 'password'");
    expect(menuSceneSource).toContain('this.createLegacyAuthActionButton(');
    expect(menuSceneSource).toContain('presentation.primaryActionLabel');
    expect(menuSceneSource).toContain('presentation.recoveryActionLabel');
    expect(menuSceneSource).toContain('this.createLegacyBottomActionBar(\n      panel,\n      stacked,');
    expect(menuSceneSource).not.toContain("text: 'Play as guest',");
    expect(menuSceneSource).not.toContain('onClick: () => this.handleLegacyGuestPlay()');
    expect(menuSceneSource).toContain("? ['username', 'email', 'password']");
    expect(menuSceneSource).not.toContain("'displayName',\n        this.authForm.displayName");
    expect(menuSceneSource).toContain('? signUpLegacyAuth(this.authForm.email, this.authForm.password, this.authForm.username)');
    expect(menuSceneSource).toContain("if (this.overlay === 'auth') {");
    expect(menuSceneSource.indexOf("if (this.overlay === 'auth') {")).toBeLessThan(menuSceneSource.indexOf('this.updateStars(time, delta);'));
    expect(menuSceneSource).toContain('private createAuthFooterLink(');
    expect(menuSceneSource).toContain('private async handleLegacyAuthSubmit(): Promise<void>');
    expect(menuSceneSource).toContain('private async handleLegacyAuthSignOut(): Promise<void>');
    expect(menuSceneSource).toContain('interface LegacyAuthActionDiagnostics');
    expect(menuSceneSource).toContain('private latestAuthActionDiagnostics: LegacyAuthActionDiagnostics | null = null;');
    expect(menuSceneSource).toContain('private recordLegacyAuthActionDiagnostics(');
    expect(menuSceneSource).toContain("stage: 'started'");
    expect(menuSceneSource).toContain("stage: 'blocked'");
    expect(menuSceneSource).toContain("stage: 'submitting'");
    expect(menuSceneSource).toContain("stage: 'result'");
    expect(menuSceneSource).toContain("stage: 'exception'");
    expect(menuSceneSource).toContain('authAction: this.latestAuthActionDiagnostics');
    expect(menuSceneSource).toContain('const shouldReturnToMainMenuAfterLogin = this.authForm.mode === \'login\'');
    expect(menuSceneSource).toContain('private closeLegacyAuthOverlayToMainMenu(): void');
    expect(menuSceneSource).toContain('const playAccessAllowed = this.hasLegacyPlayAccess();');
    expect(menuSceneSource).toContain('if (!playAccessAllowed) {');
    expect(menuSceneSource).toContain('startLabel,\n              () => this.startPlayMode()');
    expect(menuSceneSource).toContain("menuActionMode: this.authSnapshot.status === 'authenticated' ? 'authenticated' : 'guest'");
    expect(menuSceneSource).toContain("const previousMenuActionMode = this.authSnapshot.status === 'authenticated' ? 'authenticated' : 'guest';");
    expect(menuSceneSource).toContain("const menuActionMode = snapshot.status === 'authenticated' ? 'authenticated' : 'guest';");
    expect(menuSceneSource).toContain('previousMenuActionMode !== menuActionMode');
    expect(menuSceneSource).toContain('this.refreshLayout();');
    expect(menuSceneSource).toContain("'Login',\n              () => this.openOverlay('auth')");
    expect(menuSceneSource).toContain('this.layout.centerButtonX,');
    expect(menuSceneSource).toContain('this.layout.centerButtonY,');
    expect(menuSceneSource).not.toContain('const accountActionLabel =');
    // The Options overlay's Account action is the username label in the
    // header row now (next to the back chevron), not a bottom action bar
    // button -- there's no "go to main menu" equivalent here since you're
    // already at the main menu, so the bottom of the panel is simply empty.
    expect(menuSceneSource).not.toContain('private createLegacyOptionsAccountActionRow(');
    expect(menuSceneSource).toContain(
      "this.uiButtons.push(this.createLegacyOverlayUsernameButton(panel, () => this.openOverlay('auth'), panel.centerX));"
    );
    expect(authSource).toContain('LEGACY_AUTH_MESSAGE_COPY.authUnavailable');
    expect(playerMessageSource).toContain('Account access is unavailable right now. You can still play as a guest.');
    expect(playerMessageSource).toContain('export interface LegacyQueuedPlayerMessage');
    expect(playerMessageSource).toContain('export const enqueueLegacyPlayerMessage =');
    expect(playerMessageSource).toContain('export const expireLegacyPlayerMessageQueue =');
    expect(menuSceneSource).toContain('private latestAuthMessage: LegacyPlayerMessage | null = null;');
    expect(menuSceneSource).toContain('private resolveLegacyCurrentAuthMessage(): LegacyPlayerMessage | null');
    expect(menuSceneSource).toContain('latestAuthMessage: this.latestAuthMessage');
    expect(menuSceneSource).toContain('resolveLegacyAuthFeedbackMessage');
    expect(menuSceneSource).toContain('resolveLegacyAuthValidationMessage');
    // The on-screen message/toast system was removed entirely -- no message
    // box of any kind is ever drawn to the player, in an overlay or the play
    // HUD. The queue/diagnostics plumbing underneath stays internal-only
    // (still exercised by QA diagnostics), but nothing renders it.
    expect(menuSceneSource).toContain('private playerMessageQueue: LegacyQueuedPlayerMessage[] = [];');
    expect(menuSceneSource).toContain('private pushLegacyPlayerMessage(message: LegacyPlayerMessage | null): void');
    expect(menuSceneSource).toContain('private markLegacyPlayerMessagesDirty(): void');
    expect(menuSceneSource).toContain('enqueueLegacyPlayerMessage(');
    expect(menuSceneSource).toContain('expireLegacyPlayerMessageQueue(this.playerMessageQueue, time)');
    expect(menuSceneSource).not.toContain('private createOverlayPlayerMessageStack(');
    expect(menuSceneSource).not.toContain('this.createOverlayPlayerMessageStack(visibleMessages');
    expect(menuSceneSource).not.toContain('private createOverlayPlayerMessageCard(');
    expect(menuSceneSource).not.toContain('private drawLegacyPlayPlayerMessageStack(hudFrame: LegacyPlayHudFrame): void');
    expect(menuSceneSource).not.toContain('this.drawLegacyPlayPlayerMessageStack(hudFrame);');
    expect(menuSceneSource).toContain('private latestAuthFeedbackMessageExpiresAtMs = Number.NEGATIVE_INFINITY;');
    expect(menuSceneSource).toContain('private latestOverlayMessageExpiresAtMs = Number.NEGATIVE_INFINITY;');
    expect(menuSceneSource).toContain('private expireLegacyPlayerMessages(time: number): void');
    expect(menuSceneSource).toContain('this.expireLegacyPlayerMessages(time);');
    expect(menuSceneSource).not.toContain('resolveLegacyOverlayFieldCommitMessage');
    expect(menuSceneSource).not.toContain('resolveLegacyOverlayToggleMessage');
    expect(menuSceneSource).not.toContain('resolveLegacyOverlayMovementSpeedMessage');
    expect(menuSceneSource).toContain('this.armLegacyAuthFeedbackMessage();');
    expect(menuSceneSource).toContain('this.latestRemoteSyncResult = result;');
    expect(menuSceneSource).not.toContain('this.pushLegacyPlayerMessage(result.playerMessage);');
    expect(menuSceneSource).toContain('visibleMessages: this.resolveVisibleLegacyPlayerMessages()');
    expect(menuSceneSource).not.toContain('private createOverlayPlayerMessageText');
    expect(menuSceneSource).not.toContain('private createAuthFeedbackText');
    expect(menuSceneSource).not.toContain('private createAuthMessageText');
    expect(menuSceneSource).not.toContain('Guest mode is active. Account login needs Supabase env vars.');
    expect(menuSceneSource).toContain('void this.hydrateLegacyAccountDataAfterAuth(snapshot, hydrationSequence);');
    expect(menuSceneSource).toContain('private async hydrateLegacyAccountDataAfterAuth(');
    expect(menuSceneSource).not.toContain('seedSignedInProgressionFromGuest');
    expect(menuSceneSource).toContain('this.resolveLegacyProgressionStorageKey()');
  });

  test('records the Fitness account-surface reuse contract without coupling Phaser to Fitness React components', () => {
    const authReuseContract = readFileSync(
      resolve(process.cwd(), 'docs/ops/MAZER-FITNESS-AUTH-SURFACE-REUSE-2026-08-16.md'),
      'utf8'
    );

    expect(authReuseContract).toContain('fawxzzy-fitness/src/components/ui/LabeledEditorField.tsx');
    expect(authReuseContract).toContain('fawxzzy-fitness/src/components/ui/PasswordInput.tsx');
    expect(authReuseContract).toContain('The auth overlay is fully opaque');
    expect(authReuseContract).toContain('Native password input width reserves a touch target');
    expect(authReuseContract).toContain('Settings always opens the Account surface for both guest and signed-in players.');
    expect(authReuseContract).toContain('It does not update, insert, upsert, or otherwise mutate the provider.');
    expect(authReuseContract).toContain('The main menu renders the independent menu-AI level only.');
    expect(authReuseContract).toContain('No shared React component import into Phaser.');
  });

  test('adopts the opaque Fitness-derived auth visual family without changing Mazer auth semantics', () => {
    const menuSceneSource = normalizeSourceLineEndings(
      readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8')
    );
    const authSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyAuth.ts'), 'utf8');

    expect(normalizeSourceLineEndings(menuSceneSource)).toBe(menuSceneSource);
    expect(normalizeSourceLineEndings(menuSceneSource.replaceAll('\n', '\r\n'))).toBe(menuSceneSource);

    expect(menuSceneSource).toContain('const LEGACY_AUTH_UI_FONT_FAMILY');
    expect(menuSceneSource).toContain("this.overlay === 'auth' ? 0x031f20 : 0x02040a");
    expect(menuSceneSource).toContain("&& this.overlay === 'none';");
    expect(menuSceneSource).toContain('border.lineStyle(1, borderColor, borderAlpha);');
    expect(menuSceneSource).toContain('new Phaser.Curves.CubicBezier(');
    expect(menuSceneSource).toContain("fontFamily: unifiedAuthPrimary ? LEGACY_AUTH_UI_FONT_FAMILY : LEGACY_UI_FONT_FAMILY");
    expect(menuSceneSource).toContain("const barHeight = this.overlay === 'auth' ? 56");
    expect(menuSceneSource).not.toContain('EMAIL OR USERNAME');
    expect(menuSceneSource).toContain('this.levelAnnouncerNumberText.setVisible(false);');
    expect(menuSceneSource).toContain("this.authSnapshot.status !== 'authenticated'");
    expect(menuSceneSource).toContain("&& rememberedIdentity?.displayName");
    expect(menuSceneSource).toContain('private authInvalidFields: ReadonlySet<LegacyAuthFieldId> = new Set();');
    expect(menuSceneSource).toContain('this.authInvalidFields = new Set(resolveLegacyAuthInvalidFields(this.authForm));');
    expect(menuSceneSource).toContain("? 0xff7d7d");
    expect(menuSceneSource).toContain('resolveLegacyAuthBottomFeedbackLabel(this.authSnapshot.error, this.authSnapshot.info)');
    expect(menuSceneSource).toContain('const LEGACY_AUTH_BOTTOM_FEEDBACK_DURATION_MS = 5000;');
    expect(menuSceneSource).toContain('const separatorCenterY = footerY + 2;');
    expect(menuSceneSource).not.toContain('this.createAuthAccountSummaryCard(`Signed in as ${accountLabel}`');
    expect(menuSceneSource).toContain("this.createAccountReadOnlyField(");
    const readOnlyFieldSource = menuSceneSource.slice(
      menuSceneSource.indexOf('private createAccountReadOnlyField('),
      menuSceneSource.indexOf('private createAccountUsernameNativeInput(')
    );
    const clearUiSource = menuSceneSource.slice(
      menuSceneSource.indexOf('private clearUi(): void'),
      menuSceneSource.indexOf('private async loadLeaderboardPage(')
    );
    expect(readOnlyFieldSource).toContain('this.uiGraphics.push(border);');
    expect(clearUiSource).toContain('for (const graphic of this.uiGraphics) {');
    expect(clearUiSource).toContain('graphic.destroy();');
    expect(clearUiSource).toContain('this.uiGraphics = [];');
    expect(menuSceneSource).toContain("panel.top + panel.height - 104,\n      'Reset progress'");
    expect(menuSceneSource).toContain("text: 'Sign out', tone: 'danger'");
    expect(menuSceneSource).not.toContain("text: 'Log out'");
    expect(menuSceneSource).not.toContain("return 'Username saved.';");
    expect(authSource).toContain('signInWithPassword({');
    expect(authSource).not.toContain("reason: 'Enter a valid username.'");
  });

  test('keeps both the player level and the independent menu-demo AI level off the front door as persistent chrome', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain("return resolveLegacyProgressionTrackIdForSurface(this.mode === 'play' ? 'play' : 'menu-demo');");
    expect(menuSceneSource).toContain("if (this.overlay !== 'none') {");
    expect(menuSceneSource).toContain('private clearLegacyPlayerProgressionBadge(): void');
    // Neither the player's own level nor the menu-demo AI's independent
    // level (which used to read as "your level" even though it tracked
    // something the player never did) sits as permanent corner chrome any
    // more -- both surfaces instead get the same centered, between-mazes
    // announcement (drawLegacyLevelAnnouncer), gated on the shared
    // menuStaticDrawLifecyclePhase transition, not on mode.
    expect(menuSceneSource).toContain("if (this.mode === 'menu') {");
    expect(menuSceneSource).not.toContain('this.drawLegacyMenuAiProgressionBadge();');
    expect(menuSceneSource).toContain('this.clearLegacyMenuAiProgressionBadge();');
    expect(menuSceneSource).toContain('private drawLegacyLevelAnnouncer(time: number): void');
    expect(menuSceneSource).toContain(".setText(String(track.level))");
    expect(menuSceneSource).not.toContain('.setText(String(aiTrack.level))');
    expect(menuSceneSource).not.toContain('publishLegacyPlayerProgressionCompletion');
    expect(menuSceneSource).not.toContain('resolveLegacyPlayerProgressionOutcomeReason');
    expect(menuSceneSource).not.toContain('progression.player.cycle.');
    expect(menuSceneSource).not.toContain('No unlock.');
  });

  test('centers the level announcer on screen and scales board content with a dedicated zoom container', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const centerX = this.layout.width / 2;');
    expect(menuSceneSource).toContain('const centerY = this.layout.height / 2;');
    expect(menuSceneSource).toContain('private boardZoomContainer!: Phaser.GameObjects.Container;');
    expect(menuSceneSource).toContain('private resolveLegacyBoardZoomTargetScale(): number');
    expect(menuSceneSource).toContain('private updateLegacyBoardZoom(time: number): void');
    // The zoom container only ever holds board CONTENT (tiles/path/trail/
    // title lettering) -- HUD, header icons, overlays, and the announcer
    // itself are never added to it, so they stay fixed regardless of zoom.
    expect(menuSceneSource).toContain('this.boardZoomContainer.add([');
    expect(menuSceneSource).toContain('this.boardZoomContainer.setScale(scale);');
    expect(menuSceneSource).toContain('this.boardZoomContainer.setPosition(centerX * (1 - scale), centerY * (1 - scale));');
  });

  test('consumes shared UI standards for buttons, titles, guides, and toggles', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain("from '../legacy-runtime/legacyUiStandards';");
    expect(menuSceneSource).toContain("resolveLegacyUiLabelCenterY(y, buttonFontSize, options.labelRole ?? 'button')");
    expect(menuSceneSource).toContain("resolveLegacyUiLabelCenterY(y, fontSize, 'overlay-title')");
    expect(menuSceneSource).toContain('resolveLegacyToggleRowLayout(input.width, input.height, hasDescription, input.compact)');
  });

  test('keeps the options and pause player guide readable while explaining visible badge fields', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const guideLayout = resolveLegacyOptionsGuideLayout(panel.width, 5);');
    expect(menuSceneSource).toContain('const contentFlow = resolveLegacyOverlayContentFlowLayout({');
    expect(menuSceneSource).toContain('const guideTitleFontSize = guideLayout.titleFontSize;');
    expect(menuSceneSource).toContain('const guideRowFontSize = guideLayout.rowFontSize;');
    expect(menuSceneSource).toContain('const guideRowMinFontSize = guideLayout.rowMinFontSize;');
    expect(menuSceneSource).toContain('guideGraphics.lineBetween(cardLeft + inset, titleRuleY + 3, cardLeft + cardWidth - inset, titleRuleY + 3);');
    expect(menuSceneSource).toContain("'GUIDE',");
    expect(menuSceneSource).toContain("drawLegendRow(legendRowIndex, 'start', 'Start', 'begin at gold', cyberArcadeMaterial.signal.start);");
    expect(menuSceneSource.replace(/\r\n/g, '\n')).toContain("'GUIDE',\n      detailLeft,\n      titleY,");
    expect(menuSceneSource).toContain('const glyphX = detailLeft + badgeRadius;');
    expect(menuSceneSource).toContain('const labelX = detailLeft + (badgeRadius * 2) + badgeToTextGap;');
    expect(menuSceneSource).not.toContain('const contentLeft = detailLeft + Math.max(0, (detailWidth - titleBlockWidth) / 2);');
    expect(menuSceneSource).not.toContain("'Player • green trail'");
    expect(menuSceneSource).not.toContain("'AI marker + trail'");
    expect(menuSceneSource).not.toContain("`${this.mode === 'play' ? 'Rank' : 'AI Rank'} • public tier`");
    expect(menuSceneSource).not.toContain("'Score • run quality'");
    expect(menuSceneSource).not.toContain("'Maze • difficulty'");
    expect(menuSceneSource).not.toContain('the current procedural challenge tier');
  });

  test('exposes wrapped edge player snaps in runtime diagnostics', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const diagnosticsSource = readFileSync(resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'), 'utf8');

    expect(menuSceneSource).toContain("type LegacyPlayerVisualMotionSnapReason = 'wrapped-step' | null;");
    expect(menuSceneSource).toContain('private lastPlayerVisualMotionSnapReason: LegacyPlayerVisualMotionSnapReason = null;');
    expect(menuSceneSource).toContain("this.syncLegacyPlayerVisualMotionTo(to, 'wrapped-step');");
    expect(menuSceneSource).toContain('visualMotionSnapReason: this.lastPlayerVisualMotionSnapReason');
    expect(diagnosticsSource).toContain("visualMotionSnapReason?: 'wrapped-step' | null;");
  });

  test('publishes explicit play lifecycle diagnostics for runtime and visual proof', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const diagnosticsSource = readFileSync(resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'), 'utf8');
    const lifecycleSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyPlayLifecycle.ts'), 'utf8');
    const qaScriptSource = readFileSync(resolve(process.cwd(), 'scripts/analysis/live-play-qa.mjs'), 'utf8');

    expect(lifecycleSource).toContain("export type LegacyPlayLifecyclePhase =");
    expect(lifecycleSource).toContain("'goal-hold'");
    expect(lifecycleSource).toContain("export const resolveLegacyPlayLifecycleSnapshot =");
    expect(menuSceneSource).toContain('private resolveLegacyPlayLifecycleDiagnostics(time: number): LegacyPlayLifecycleSnapshot');
    expect(menuSceneSource).toContain('private runtimeDiagnosticsPlayLifecycleSignature: string | null = null;');
    expect(menuSceneSource).toContain('private visualDiagnosticsPlayLifecycleSignature: string | null = null;');
    expect(menuSceneSource).toContain('private resolveLegacyPlayLifecycleDiagnosticsSignature(time: number): string');
    expect(menuSceneSource).toContain('const lifecycleChanged = playLifecycleSignature !== this.runtimeDiagnosticsPlayLifecycleSignature;');
    expect(menuSceneSource).toContain('const lifecycleChanged = playLifecycleSignature !== this.visualDiagnosticsPlayLifecycleSignature;');
    expect(menuSceneSource).toContain('&& !lifecycleChanged');
    expect(menuSceneSource).toContain('this.armLegacyMenuStaticDeconstructStage(time);');
    expect(menuSceneSource).toContain('this.publishVisualDiagnostics(time, true);');
    expect(menuSceneSource).toContain('this.publishRuntimeDiagnostics(time, true);');
    expect(menuSceneSource).toContain('const playLifecycle = this.resolveLegacyPlayLifecycleDiagnostics(time);');
    expect(menuSceneSource).toContain('lifecycle: playLifecycle');
    expect(menuSceneSource).toContain('playLifecycle,');
    expect(diagnosticsSource).toContain('lifecycle?: {');
    expect(diagnosticsSource).toContain("phase: 'idle' | 'building' | 'ready' | 'playing' | 'goal-hold' | 'deconstructing' | 'handoff';");
    expect(qaScriptSource).toContain('const runtimeLifecycle = runtime?.play?.lifecycle ?? null;');
    expect(qaScriptSource).toContain('explicitLifecyclePhase: lifecycle?.phase ?? null');
  });

  test('keeps live-play QA movement on a runtime-diagnostics-only bridge', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const qaScriptSource = readFileSync(resolve(process.cwd(), 'scripts/analysis/live-play-qa.mjs'), 'utf8');

    expect(menuSceneSource).toContain('interface LegacyQaDiagnosticsApi');
    expect(menuSceneSource).toContain('private installLegacyQaDiagnosticsSurface(): void');
    expect(menuSceneSource).toContain('if (!this.runtimeDiagnosticsConfig.enabled || typeof window === \'undefined\')');
    expect(menuSceneSource).toContain('window.__MAZER_QA__ = {');
    expect(menuSceneSource).toContain('movePlayPlayer: (move: string): LegacyQaMoveResult => this.handleLegacyQaPlayMove(move)');
    expect(menuSceneSource).toContain('openSettingsOverlay: (): LegacyQaOverlayResult => this.handleLegacyQaOpenSettingsOverlay()');
    expect(menuSceneSource).toContain('openPauseOverlay: (): LegacyQaOverlayResult => this.handleLegacyQaOpenPauseOverlay()');
    expect(menuSceneSource).toContain('startPlayMode: (): LegacyQaOverlayResult => this.handleLegacyQaStartPlayMode()');
    expect(menuSceneSource).toContain('private handleLegacyQaOpenSettingsOverlay(): LegacyQaOverlayResult');
    expect(menuSceneSource).toContain('private handleLegacyQaOpenPauseOverlay(): LegacyQaOverlayResult');
    expect(menuSceneSource).toContain('private handleLegacyQaStartPlayMode(): LegacyQaOverlayResult');
    expect(menuSceneSource).toContain("this.openOverlay('options');");
    expect(menuSceneSource).toContain('this.rebuildUi();');
    expect(menuSceneSource).toContain('this.publishVisualDiagnostics(this.time.now, true);');
    expect(menuSceneSource).toContain('this.publishRuntimeDiagnostics(this.time.now, true);');
    expect(menuSceneSource).toContain('private detachLegacyQaDiagnosticsSurface(): void');
    expect(menuSceneSource).toContain('delete window.__MAZER_QA__;');
    expect(menuSceneSource).toContain('const accepted = this.tryMovePlayerFromInput(vector.deltaX, vector.deltaY, { releaseAfterStep: true });');
    expect(qaScriptSource).toContain("const DEFAULT_INPUT_METHOD = 'qa';");
    expect(qaScriptSource).toContain('const api = window.__MAZER_QA__;');
    expect(qaScriptSource).toContain('api.movePlayPlayer(actionKind)');
  });

  test('keeps player play mazes fresh and progression-scaled across start and goal reset', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const generationLifecycleSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyGenerationLifecycle.ts'), 'utf8');

    expect(menuSceneSource).toContain('private createFreshLegacyPlayGenerationSeed(): number');
    expect(menuSceneSource).toContain('const playerTrack = this.progressionState.tracks.player;');
    expect(menuSceneSource).toContain('playerTrack.targetComplexity * 1009');
    expect(menuSceneSource).toContain('resolveLegacyProgressionOrdinalSeedComponent(playerTrack.completedCycles, 1_000_003)');
    expect(menuSceneSource).toContain('resolveLegacyProgressionOrdinalSeedComponent(playerTrack.level, 1_000_033)');
    expect(menuSceneSource).toContain('playerTrack.paceScore * 37');
    expect(menuSceneSource).toContain("const seedOverride = mode === 'play'");
    expect(menuSceneSource).toContain('seedOverride');
    expect(menuSceneSource).toContain('seedOverride: this.createFreshLegacyPlayGenerationSeed()');
    expect(menuSceneSource).toContain('private resolveLegacyTargetComplexityForMode(mode: RuntimeMode): number');
    expect(menuSceneSource).toContain('targetComplexity: this.resolveLegacyTargetComplexityForMode(mode)');
    expect(menuSceneSource).toContain("targetComplexity: this.resolveLegacyTargetComplexityForMode('play')");
    expect(menuSceneSource).toContain("targetComplexity: this.resolveLegacyTargetComplexityForMode('menu')");
    expect(menuSceneSource).toContain("this.resolveLegacyProgressionScaleForMode('play')");
    expect(menuSceneSource).toContain("seedSource: this.mode === 'play' || !this.explicitRuntimeMazeSeed ? 'runtime-random' : 'query'");
    expect(generationLifecycleSource).toContain('seedOverride?: number;');
    expect(generationLifecycleSource).toContain('targetComplexity?: number;');
    expect(generationLifecycleSource).toContain('selectLegacyRuntimeMazeForMode');
    expect(generationLifecycleSource).toContain('selection: review');
    expect(generationLifecycleSource).toContain('normalizeLegacyRuntimeSeed(seedOverride, currentSeed)');
  });

  test('renders menu AI memory options and retarget destinations as visible thinking overlays', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const diagnosticsSource = readFileSync(resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'), 'utf8');
    const aiSource = readFileSync(resolve(process.cwd(), 'src/domain/ai/demoWalker.ts'), 'utf8');

    expect(aiSource).toContain('export interface DemoWalkerMemoryFrame');
    expect(aiSource).toContain('thoughtState: DemoWalkerThoughtState;');
    expect(aiSource).toContain('choiceClass: DemoWalkerChoiceClass | null;');
    expect(aiSource).toContain('confidence: number;');
    expect(aiSource).toContain('aiMemory: DemoWalkerMemoryFrame;');
    expect(aiSource).toContain('memoryFrames: readonly DemoWalkerMemoryFrame[];');
    expect(aiSource).toContain('optionIndices: resolveMemoryOptionIndices()');
    expect(menuSceneSource).toContain('const LEGACY_MENU_AI_MEMORY_OPTION_CORE = cyberArcadeMaterial.signal.memory;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_AI_MEMORY_TARGET_EDGE = cyberArcadeMaterial.signal.warningEdge;');
    expect(menuSceneSource).toContain('private drawLegacyTileEdgeOutline(');
    expect(menuSceneSource).toContain('LEGACY_MENU_AI_MEMORY_TARGET_EDGE,');
    expect(menuSceneSource).toContain('private resolveLegacyMenuAiMemoryPoints()');
    expect(menuSceneSource).toContain('const endIndex = this.menuDemoEpisode.raster.endIndex;');
    expect(menuSceneSource).toContain('targetIndex === null || targetIndex === endIndex');
    expect(menuSceneSource).toContain('private drawLegacyMenuAiMemoryOverlay(');
    expect(menuSceneSource).toContain('this.drawLegacyMenuAiMemoryOverlay(');
    expect(menuSceneSource).toContain('aiMemory: {');
    expect(menuSceneSource).toContain('choiceClass: menuAiMemory.choiceClass');
    expect(menuSceneSource).toContain('confidence: menuAiMemory.confidence');
    expect(menuSceneSource).toContain('optionCount: menuAiMemory.optionPoints.length');
    expect(menuSceneSource).toContain('targetPoint: menuAiMemory.targetPoint ? copyPoint(menuAiMemory.targetPoint) : null');
    expect(menuSceneSource).toContain('thoughtState: menuAiMemory.thoughtState');
    expect(diagnosticsSource).toContain('aiMemory?: {');
    expect(diagnosticsSource).toContain('choiceClass: string | null;');
    expect(diagnosticsSource).toContain('confidence: number;');
    expect(diagnosticsSource).toContain('optionPoints: Array<{ x: number; y: number }>;');
    expect(diagnosticsSource).toContain('targetPoint: { x: number; y: number } | null;');
    expect(diagnosticsSource).toContain('thoughtState: string;');
  });

  test('keeps account form entry backed by native browser inputs for mobile and automation', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('private authNativeInput: HTMLInputElement | null = null;');
    expect(menuSceneSource).toContain('input.setAttribute(\'data-mazer-auth-input\', fieldId);');
    expect(menuSceneSource).toContain('document.body.appendChild(input);');
    expect(menuSceneSource).toContain('window.setTimeout(() => input.focus({ preventScroll: true }), 0);');
    expect(menuSceneSource).toContain('input.addEventListener(\'input\', this.authNativeInputHandler);');
    expect(menuSceneSource).toContain('input.addEventListener(\'keydown\', this.authNativeKeyDownHandler);');
    expect(menuSceneSource).toContain('this.add.rectangle(');
    expect(menuSceneSource).toContain('const contentRightInset = hasPasswordToggle ? 54 : 16;');
    expect(menuSceneSource).toContain('this.createLegacyAuthPasswordVisibilityButton(');
    expect(menuSceneSource).toContain('const passwordToggleReserve = fieldId === \'password\'');
    expect(menuSceneSource).toContain("this.authPasswordVisible ? 'text' : 'password'");
    expect(menuSceneSource).toContain("ease: 'Sine.easeInOut'");
    expect(menuSceneSource).toContain('this.syncLegacyAuthNativeInputValue();');
    expect(menuSceneSource).toContain('this.destroyLegacyAuthNativeInput();');
    expect(menuSceneSource).toContain('presentation.alternateActionLabel,');
    expect(menuSceneSource).not.toContain('Guest mode is active. Sign in to keep account progress separate.');
  });

  test('keeps full-height overlay content behind one mobile scroll facade and icon-only back control', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const overlayPanelStart = menuSceneSource.indexOf('  private drawOverlayPanel(): void {');
    const overlayPanelEnd = menuSceneSource.indexOf('  private resolveOverlayPanelFrame(', overlayPanelStart);
    const overlayPanelSource = menuSceneSource.slice(overlayPanelStart, overlayPanelEnd);

    expect(overlayPanelStart).toBeGreaterThanOrEqual(0);
    expect(overlayPanelEnd).toBeGreaterThan(overlayPanelStart);
    expect(overlayPanelSource).toContain("this.overlayGraphics.fillStyle(this.overlay === 'auth' ? 0x031f20 : 0x02040a, this.overlay === 'auth' ? 1 : 0.82);");
    expect(overlayPanelSource).toContain('this.overlayGraphics.fillRect(0, 0, this.layout.width, this.layout.height);');
    expect(overlayPanelSource).not.toContain('drawLegacyCyberPanel');
    expect(menuSceneSource).toContain('resolveLegacyOverlayScrollMetrics');
    expect(menuSceneSource).toContain('private drawLegacyOverlayScrollFacade(metrics: LegacyOverlayScrollMetrics, forceVisible = false): void');
    expect(menuSceneSource).toContain('private createOverlayBackChevronButton(panel: OverlayPanelFrame, onClick: () => void): UiButton');
    expect(menuSceneSource).toContain('this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.applyLegacyPauseCommand(\'resume\')));');
    expect(menuSceneSource).toContain('this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.handleBackAction()));');
    expect(normalizeSourceLineEndings(menuSceneSource)).toContain('return resolveLegacyOverlayPanelLayout(\n      this.layout.width,\n      this.layout.height,\n      readMazerViewportGeometry().safeArea\n    );');
    expect(menuSceneSource).toContain('const shell = resolveLegacyOverlayShellLayout({');
    expect(menuSceneSource).not.toContain("if (kind === 'pause' && this.mode === 'play')");
    expect(menuSceneSource).toContain('rightGutter: LEGACY_OVERLAY_SCROLL_RIGHT_GUTTER');
    expect(menuSceneSource).toContain('this.drawLegacyOverlayScrollFacade(scrollMetrics);');
    expect(menuSceneSource).toContain('private resolveLegacyOverlayScrollRenderViewport(metrics: LegacyOverlayScrollMetrics): VisualRect');
    expect(menuSceneSource).toContain('const renderViewport = this.resolveLegacyOverlayScrollRenderViewport(scrollMetrics);');
    expect(menuSceneSource).toContain('const maskGraphics = this.make.graphics({ x: 0, y: 0 }, false);');
    expect(menuSceneSource).toContain('label.setMask(this.overlayGuideMask);');
    expect(menuSceneSource).toContain('cardTop < viewport.bottom - 2 && cardTop + cardHeight > viewport.top + 2');
    expect(menuSceneSource).toContain('resolveLegacyOverlayScrollRenderRect(metrics.viewport)');
    expect(menuSceneSource).toContain('legacyOverlayScrollRectIntersectsViewport(bounds, viewport)');
    expect(menuSceneSource).toContain('const viewportTop = shell.contentTop;');
    expect(menuSceneSource).toContain('cardTop < viewport.bottom - 2 && cardTop + cardHeight > viewport.top + 2');
    expect(menuSceneSource).not.toContain('this.drawLegacyOverlayScrollFacade(scrollMetrics, true);');
    expect(menuSceneSource).toContain('this.overlayScrollTrackBounds = metrics.enabled');
    expect(menuSceneSource).toContain('this.overlayScrollThumbBounds = metrics.enabled');
    expect(menuSceneSource).toContain('const thumbAlpha = metrics.enabled ? 0.92 : 0.58;');
    expect(menuSceneSource).toContain('const drawScrollEdgeCue = (y: number, alpha: number): void => {');
    expect(menuSceneSource).toContain('drawScrollEdgeCue(viewport.top + viewport.height - 2, metrics.bottomFadeAlpha);');
    expect(menuSceneSource).not.toContain('graphics.fillRect(viewport.left, viewport.top, viewport.width, fadeHeight);');
    expect(menuSceneSource).not.toContain('viewport.top + viewport.height - fadeHeight');
    expect(menuSceneSource).toContain('if (!showAdvancedOptions) {');
    expect(menuSceneSource).toContain('const viewportTop = rowY + (compact ? 4 : 6);');
    expect(menuSceneSource).toContain('const controlContentHeight = this.resolveFeatureControlRowsContentHeight(panel, {');
    expect(menuSceneSource).toContain('contentHeight: contentFlow.contentHeight');
    expect(menuSceneSource).toContain('this.input.on(\'wheel\'');
    expect(menuSceneSource).toContain('private handleOverlayScrollPointerDown(pointer: Phaser.Input.Pointer): boolean');
    expect(menuSceneSource).toContain('private handleOverlayScrollPointerMove(pointer: Phaser.Input.Pointer): boolean');
    expect(menuSceneSource).toContain('private overlayScrollGestureLockPointerId: number | null = null;');
    expect(menuSceneSource).toContain('private overlayMovementSpeedSliderBounds: VisualRect | null = null;');
    expect(menuSceneSource).toContain('this.overlayScrollGestureLockPointerId = this.normalizeLegacyPlayTouchPointerId(pointer.id) ?? -1;');
    expect(menuSceneSource).toContain('|| this.overlayScrollGestureLockPointerId !== null');
    expect(menuSceneSource).toContain('private resolveLegacyRoundedRectRadius(width: number, height: number, requestedRadius?: number): number');
    expect(menuSceneSource).toContain('fillScrollPill(track.left - 3, track.top - 2, track.width + 6, track.height + 4');
    expect(menuSceneSource).toContain('centerY - (height / 2) >= viewport.top + 2');
    expect(menuSceneSource).toContain('centerY + (height / 2) <= viewport.bottom - 2');
    expect(menuSceneSource).toContain('private fitLegacyUiTextToWidth<T extends Phaser.GameObjects.Text>');
    expect(menuSceneSource).toContain('const buttonHorizontalInset = Math.max(10, Math.min(18, Math.round(width * 0.08)));');
    expect(menuSceneSource).not.toContain('drawLegacyPlayTouchLabel');
    expect(menuSceneSource).toContain('labelFontSize: Number.isFinite(Number.parseFloat(String(button.label.style.fontSize)))');
    expect(menuSceneSource).not.toContain('topActionHeight:');
    expect(menuSceneSource).toContain('const showStateLabel = uiLayout.showStateLabel;');
    expect(menuSceneSource).toContain('const stateLabelRight = trackLeft - trackGap;');
    expect(menuSceneSource).toContain('const labelMaxWidth = Math.max(54, labelRight - labelX);');
    expect(menuSceneSource).toContain('const visibleLabelText = showStateLabel || !displayStateText');
    expect(menuSceneSource).toContain('`${input.label}: ${displayStateText}`');
    expect(menuSceneSource).toContain('setAlpha(showStateLabel ? 1 : 0)');
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

    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_CORE = mixLegacyIridescentColor(cyberArcadeMaterial.path.core, 0x000000, LEGACY_PATH_CORE_EYE_COMFORT_DIM_AMOUNT);');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE = cyberArcadeMaterial.path.edge;');
    expect(menuSceneSource).toContain('LEGACY_MENU_PATH_EDGE,');
    expect(menuSceneSource).toContain('LEGACY_MENU_PATH_EDGE_ALPHA,');
    expect(menuSceneSource).toContain('this.drawLegacyPathMaterialTile(');
    expect(menuSceneSource).not.toContain('this.fillMenuDynamicMarkerTile(this.maze.start');
    expect(menuSceneSource).not.toContain('this.fillMenuDynamicMarkerTile(this.maze.goal');
    expect(menuSceneSource).toContain('const trailColor = resolveLegacyIridescentTrailColor(');
    expect(menuSceneSource).not.toContain('? progressionPalette.trailPulseEdgeColor');
  });

  test('wires the generated Mazer app icon into browser and PWA surfaces', () => {
    const indexSource = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'public/manifest.webmanifest'), 'utf8')) as {
      icons: Array<{ src: string; sizes: string; purpose?: string; type: string }>;
    };

    expect(indexSource).toContain('<link rel="icon" href="/icons/mazer-app-icon.ico" sizes="any" />');
    expect(indexSource).toContain('<link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png" />');
    expect(indexSource).toContain('<link rel="icon" href="/icons/icon-512.png" sizes="512x512" type="image/png" />');
    expect(indexSource).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />');
    expect(indexSource).not.toContain('href="/icons/mazer-emblem.svg"');
    expect(readFileSync(resolve(process.cwd(), 'scripts/windows/Prepare-MazerShortcut.ps1'), 'utf8')).toContain(
      "public\\icons\\mazer-app-icon.ico"
    );
    expect(readFileSync(resolve(process.cwd(), 'docs/mobile-plan.md'), 'utf8')).toContain(
      'data/atlas/brand/mazer/mazer-app-icon-2026-07-09-source.png'
    );
    expect(readPngDimensions('public/icons/mazer-app-icon.png')).toEqual({ width: 1024, height: 1024 });
    expect(readPngDimensions('public/icons/icon-512.png')).toEqual({ width: 512, height: 512 });
    expect(readPngDimensions('public/icons/icon-512-maskable.png')).toEqual({ width: 512, height: 512 });
    expect(readPngDimensions('public/icons/icon-192.png')).toEqual({ width: 192, height: 192 });
    expect(readPngDimensions('public/icons/icon-192-maskable.png')).toEqual({ width: 192, height: 192 });
    expect(readPngDimensions('public/icons/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
    expect(readFileSync(resolve(process.cwd(), 'public/icons/mazer-app-icon.ico')).byteLength).toBeGreaterThan(10_000);
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/icon-192-maskable.png',
      '/icons/icon-512-maskable.png',
      '/icons/mazer-app-icon.png'
    ]);
    expect(manifest.icons.filter((icon) => icon.purpose === 'maskable')).toHaveLength(2);
  });
});
