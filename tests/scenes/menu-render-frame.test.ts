import { describe, expect, test, vi } from 'vitest';
import {
  resolveLegacyDynamicMarkerInset,
  resolveLegacyDynamicTrailStrokeWidth,
  resolveLegacyEndpointMarkerRenderMetrics,
  resolveLegacyBleedOffPaths,
  resolveLegacyMenuBorderDockDirections,
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
  test('caps active Phaser rendering to mobile-friendly 60 FPS', () => {
    const phaserConfigSource = readFileSync(resolve(process.cwd(), 'src/boot/phaserConfig.ts'), 'utf8');
    const canvasResolutionSource = readFileSync(resolve(process.cwd(), 'src/boot/canvasResolution.ts'), 'utf8');
    const baseCssSource = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

    expect(phaserConfigSource).toContain('type: Phaser.CANVAS');
    expect(canvasResolutionSource).toContain('export const MAZER_CANVAS_RESOLUTION_MAX = 2;');
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

  test('keeps the Options overlay player guide simple and player-facing', () => {
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

    expect(menuSceneSource).toContain('const guideEndY = this.createLegacyOptionsInfoSection(rowY, panel);');
    expect(menuSceneSource).toContain('const guideEndY = this.createLegacyOptionsInfoSection(\n      panel.top + (stacked ? 110 : 120) + (hasOverlayMessage ? 22 : 0),');
    expect(menuSceneSource).toContain("addText('PLAYER GUIDE'");
    expect(buildOptionsSource.indexOf('const guideEndY = this.createLegacyOptionsInfoSection(rowY, panel);')).toBeLessThan(
      buildOptionsSource.indexOf('this.createFeatureControlRows(viewport.top, panel')
    );
    expect(buildPauseSource.indexOf('const guideEndY = this.createLegacyOptionsInfoSection(')).toBeLessThan(
      buildPauseSource.indexOf('this.createFeatureControlRows(viewport.top, panel, {')
    );
    expect(guideSource).toContain("drawLegendRow(0, 'compass', 'Compass'");
    expect(guideSource).toContain("drawLegendRow(1, 'start', 'Start'");
    expect(guideSource).toContain("drawLegendRow(2, 'end', 'End'");
    expect(guideSource).toContain("'Player: green beacon + trail.'");
    expect(guideSource).toContain("'Score: run quality; Runs: clears.'");
    expect(guideSource).not.toContain('activeTargetComplexity');
    expect(guideSource).not.toContain('measuredMazeComplexity');
    expect(guideSource).not.toContain('drawChip(');
    expect(menuSceneSource).toContain('private drawLegacyCompassGlyph(');
    expect(menuSceneSource).toContain('drawLegacyOptionsGuideGlyph');
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
      size: 3,
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
      size: 3,
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
      size: 3,
      grid: [
        [false, false, false],
        [true, false, false],
        [false, false, false]
      ]
    };

    expect(resolveLegacyMenuBorderDockDirections(oneSidedMaze, { x: 0, y: 1 })).toEqual([]);

    const maze = {
      size: 3,
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
      size: 5,
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

  test('keeps folded-corner border cells capped so the corner facets stay clean', () => {
    const maze = {
      size: 3,
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
      boardSize: 100,
      cornerGuardSize: 18,
      materialTileSize: 30,
      mazeLeft: 6,
      mazeTop: 6,
      mazeSize: 88,
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
      boardSize: 100,
      cornerGuardSize: 18,
      materialTileSize: 6,
      mazeLeft: 5,
      mazeTop: 5,
      mazeSize: 90
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
      boardSize: 100,
      cornerGuardSize: 18,
      continuationLength: 4,
      materialTileSize: 6,
      mazeLeft: 15,
      mazeTop: 25,
      mazeSize: 90,
      tileRect: { left: 99, top: 50, width: 6, height: 6 }
    });

    expect(areas).toEqual([{ left: 105, top: 50, right: 114, bottom: 56 }]);
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

  test('keeps rounded 4px mobile tiles corridor-shaped instead of full-block filled', () => {
    const maze = {
      size: 3,
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
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_GLOW = 0xc8fff4;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_IRIS = 0x9cff7d;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_PRISM = 0x72e0bf;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_HOTSPOT = 0xffffff;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_ALPHA = 0.48;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_SIZE_RATIO = 0.066;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_SHIMMER_MS = 1280;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_CORNER_FACET_FRAME_MS = 33;');
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
    expect(legacyMenuRenderSource).toContain('const LEGACY_MENU_TRENCH_EDGE_INSET_RATIO = 0.14;');
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
    expect(menuSceneSource).toContain('this.fillLegacyPathConnectorSeams(');
    expect(menuSceneSource).toContain('private fillLegacyPathConnectorSeams(');
    expect(menuSceneSource).toContain('pathSource.grid[point.y + deltaY]?.[point.x + deltaX] === true');
    expect(menuSceneSource).toContain('const LEGACY_PATH_CONNECTOR_SEAM_PAD_RATIO = 0.16;');
    expect(menuSceneSource).toContain('const LEGACY_PATH_CONNECTOR_SEAM_EDGE_ALPHA_RATIO = 0.72;');
    expect(menuSceneSource).toContain('const LEGACY_PATH_CONNECTOR_SEAM_CORE_ALPHA_RATIO = 0.94;');
    expect(menuSceneSource).toContain('const seamCoreAlpha = Math.min(options.coreAlpha, options.coreAlpha * LEGACY_PATH_CONNECTOR_SEAM_CORE_ALPHA_RATIO);');
    expect(menuSceneSource).toContain('Math.round(originX + (point.x * tileSize))');
    expect(menuSceneSource).toContain('Math.floor((frame.leftInset / materialTileSize) * tileRect.width)');
    expect(menuSceneSource).toContain('Math.ceil(((frame.leftInset + frame.width) / materialTileSize) * tileRect.width)');
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
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.lineStyle(2, LEGACY_BOARD_SIGIL_CORNER_FACET_IRIS, baseAlpha * 0.78);');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.lineStyle(1, LEGACY_BOARD_SIGIL_CORNER_FACET_HOTSPOT, glintAlpha * 0.62);');
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
    expect(menuSceneSource).toContain('drawCue: false');
    expect(menuSceneSource).toContain('const dynamicTrailPathSource = this.maze;');
    expect(menuSceneSource).toContain('this.backdropDirty = true;');
    expect(menuSceneSource).toContain('pathVisualStyle: this.pathVisualStyle');
    expect(menuSceneSource).toContain('textLabels: this.resolveVisualTextLabels()');
    expect(menuSceneSource).toContain('buttons: this.uiButtons');
    expect(menuSceneSource).toContain('text: button.text');
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
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_FRAME_MS = 33;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS = 6;');
    expect(menuSceneSource).toContain('private drawLegacyMenuPathTitle(time: number): void');
    expect(menuSceneSource).not.toContain('if (visibleCells.length <= 0) {\n      return;\n    }');
    expect(menuSceneSource).toContain('this.drawLegacyMenuPathTitleSigilRails(visibleCells, titleLayout, time, titlePresentation.titleAlpha);');
    expect(menuSceneSource).toContain('this.drawLegacyMenuPathTitleOrbitSigils(titleLayout, time, titlePresentation.titleAlpha);');
    expect(menuSceneSource).toContain("type LegacyMenuPathTitleSweepMode = 'build' | 'deconstruct' | 'idle';");
    expect(menuSceneSource).toContain('interface LegacyMenuPathTitleSweepState');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleSweepState(');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleVisibleSweepEdge(');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleVisibleSweepState(');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleAnimationDirection(time: number):');
    expect(menuSceneSource).toContain('return phase <= 0.5 ? phase * 2 : (1 - phase) * 2;');
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
    expect(menuSceneSource).toContain('if (this.isLegacyMenuHandoffAnimationActive(time)) {');
    expect(menuSceneSource).toContain('private isLegacyMenuHandoffAnimationActive(time: number): boolean');
    expect(menuSceneSource).toContain('private drawBoardPaths(time: number): void {');
    expect(menuSceneSource).toContain('this.drawLegacyPathMaterialTile(');
    expect(menuSceneSource).toContain('coreAlpha: isMenuMode ? 0.92 : 0.96,');
    expect(menuSceneSource).toContain(': LEGACY_PLAY_PATH_CORE;');
    expect(menuSceneSource).toContain(': LEGACY_PLAY_WALL_FILL;');
    expect(menuSceneSource).toContain('const boardFill = LEGACY_PLAY_BOARD_FILL;');
    expect(menuSceneSource).toContain('const boardEdge = LEGACY_PLAY_BOARD_EDGE;');
    expect(menuSceneSource).not.toContain('this.boardStaticGraphics.fillStyle(walkable ? pathGlow : wallColor');
  });

  test('keeps active play HUD focused on compass controls while the level badge owns the timer', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_TIMER_TEXT =');
    expect(menuSceneSource).toContain('const LEGACY_CYBER_PANEL_STROKE = 0x72e0bf;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_ARROW = 0xff263f;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_ARROW_TAIL = 0xecfff5;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_ARROW_SHADOW = 0x06080a;');
    expect(menuSceneSource).toContain('this.drawLegacyCyberPanel(this.hudGraphics, {');
    expect(menuSceneSource).not.toContain('timerShadow.setAlpha(0.7);');
    expect(menuSceneSource).not.toContain('hudFrame.timerBounds.centerX + 1');
    expect(menuSceneSource).toContain('this.drawLegacyPlayCompass(hudFrame, {');
    expect(menuSceneSource).toContain("showPane: touchControlLayout.controlMode !== 'stick'");
    expect(menuSceneSource).toContain('if (options.showPane) {');
    expect(menuSceneSource).toContain('this.hudGraphics.fillTriangle(');
    expect(menuSceneSource).toContain('this.drawLegacyPlayTouchButton(controls.pause, true, false);');
    expect(menuSceneSource).not.toContain('this.drawLegacyPlayTouchButton(controls.restart_attempt, true, false);');
    expect(menuSceneSource).not.toContain('this.hudGraphics.strokeRect(');
  });

  test('keeps menu dynamic trail overlays in the legacy corridor frame instead of full square cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).not.toContain('const LEGACY_MENU_DYNAMIC_TRAIL_EDGE =');
    expect(menuSceneSource).not.toContain('const LEGACY_MENU_DYNAMIC_TRAIL_CORE_RATIO =');
    expect(menuSceneSource).not.toContain('const LEGACY_MENU_DYNAMIC_TRAIL_EDGE_RATIO =');
    expect(menuSceneSource).toContain('const progressionPalette = this.resolveActiveLegacyProgressionPalette();');
    expect(menuSceneSource).toContain('this.drawLegacyProgressionBadge(mazeRenderFrame, progressionPalette);');
    expect(menuSceneSource).toContain('this.drawLegacyMenuCompass(mazeRenderFrame, progressionPalette, time);');
    expect(menuSceneSource).toContain("const isLifecycleSpinActive = this.menuStaticDrawLifecyclePhase === 'building'");
    expect(menuSceneSource).toContain("|| this.menuStaticDrawLifecyclePhase === 'deconstructing';");
    expect(menuSceneSource).toContain('const angle = isLifecycleSpinActive');
    expect(menuSceneSource).toContain('? (time / 130) % (Math.PI * 2)');
    expect(menuSceneSource).toContain('const notchBounds = this.resolveLegacyBoardTopCenterNotchBounds(boardLeft, boardTop, boardSize);');
    expect(menuSceneSource).toContain('topCenterNotch: this.resolveLegacyBoardTopCenterNotchBounds(boardLeft, boardTop, boardSize)');
    expect(menuSceneSource).toContain('notchBounds.width * 0.56');
    expect(menuSceneSource).toContain('notchBounds.height * 0.68');
    expect(menuSceneSource).toContain('mazeRenderFrame.tileSize * 2.15');
    expect(menuSceneSource).toContain('const centerY = Math.round(notchBounds.top + (notchBounds.height * 0.43));');
    expect(menuSceneSource).toContain('this.menuCompassBounds = createVisualRect(centerX - (size / 2), centerY - (size / 2), size, size);');
    expect(menuSceneSource).toContain('const wing = Math.max(3, size * 0.26);');
    expect(menuSceneSource).toContain('const tailLength = Math.max(4, size * 0.34);');
    expect(menuSceneSource).toContain('const hubRadius = Math.max(2, size * 0.16);');
    expect(menuSceneSource).toContain('private drawLegacyCompassGlyph(');
    expect(menuSceneSource).not.toContain('this.boardDynamicGraphics.strokeCircle(centerX, centerY, radius);');
    expect(menuSceneSource).toContain('progressionBadge: {');
    expect(menuSceneSource).toContain('menuCompass: {');
    expect(menuSceneSource).toContain('this.progressionBadgeTextFits = textBounds.left >= badgeBounds.left + 4');
    expect(menuSceneSource).toContain('mazeRenderFrame.boardSize + (mazeRenderFrame.safeInset * 2)');
    expect(menuSceneSource).toContain('this.layout.width - 18');
    expect(menuSceneSource).toContain("const horizontalPadding = this.mode === 'menu'");
    expect(menuSceneSource).toContain('clampInteger(Math.round(mazeRenderFrame.tileSize * 2.85), 22, 30)');
    expect(menuSceneSource).toContain('clampInteger(Math.round(mazeRenderFrame.tileSize * 3.3), 24, 34);');
    expect(menuSceneSource).toContain('this.fitLegacyUiTextToWidth(');
    expect(menuSceneSource).toContain('const verticalPadding = clampInteger(Math.round(mazeRenderFrame.tileSize * 1.35), 9, 14);');
    expect(menuSceneSource).toContain("const width = this.mode === 'menu' || !portraitPlay");
    expect(menuSceneSource).toContain('const portraitPauseBounds = portraitPlay');
    expect(menuSceneSource).toContain('portraitPauseBounds.left - 8 - (this.layout.width / 2)');
    expect(menuSceneSource).toContain('? Math.round(this.layout.width / 2)');
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
    expect(menuSceneSource).toContain('const notchBounds = this.resolveLegacyBoardTopCenterNotchBounds(boardLeft, boardTop, boardSize);');
    expect(menuSceneSource).toContain('const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(');
    expect(menuSceneSource).toContain('const mazeTileSize = mazeRenderFrame.tileSize;');
    expect(menuSceneSource).toContain('this.fillLegacyMenuDynamicPathTile(');
    expect(menuSceneSource).toContain('pathSource: Pick<LegacyMazeSnapshot, \'grid\' | \'size\'>,');
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
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.lineTo(centerX + playerMetrics.coreRadius, centerY);');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.fillPath();');
    expect(menuSceneSource).toContain('this.isLegacyMenuPointVisibleInStaticDraw(this.player)');
  });

  test('keeps active play dynamic overlays in the corridor frame instead of square cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).not.toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_EDGE =');
    expect(menuSceneSource).not.toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_CORE_RATIO =');
    expect(menuSceneSource).not.toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_EDGE_RATIO =');
    expect(menuSceneSource).toContain('resolveLegacyIridescentTrailColor(');
    expect(menuSceneSource).toContain('resolveLegacyIridescentPulseColor(');
    expect(menuSceneSource).toContain('resolveLegacyIridescentPlayerCoreColor()');
    expect(menuSceneSource).toContain('resolveLegacyIridescentPlayerHaloColor(time, palette.playerHaloColor)');
    expect(menuSceneSource).toContain('resolveLegacyIridescentPlayerAccentColor(time, playerCoreColor)');
    expect(menuSceneSource).toContain('palette.trailPulseColor');
    expect(menuSceneSource).toContain('palette.trailPulseEdgeColor');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS = 2600;');
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
    expect(menuSceneSource).toContain('if (this.settings.toggleTrailPulse) {');
    expect(menuSceneSource).toContain('this.drawLegacyPlayDynamicTrailPulse(');
    expect(menuSceneSource).toContain('resolvedBoardLeft,');
    expect(menuSceneSource).toContain('mazeRenderFrame.boardSize,');
    expect(menuSceneSource).toContain("const active = this.settings.toggleTrailPulse && this.overlay === 'none' && this.trail.length > 1;");
    expect(menuSceneSource).toContain('this.legacyPlayTrailPulseNextFrameAtMs = time + LEGACY_PLAY_TRAIL_PULSE_FRAME_INTERVAL_MS;');
    expect(menuSceneSource).toContain('const pulseDistanceFromPlayer = phase * maxPulseIndex;');
    expect(menuSceneSource).toContain('const pulseCenterIndex = (trail.length - 1) - pulseDistanceFromPlayer;');
    expect(menuSceneSource).not.toContain('private resolveLegacyPointPathSource(');
    expect(menuSceneSource).toContain("this.fillPlayDynamicMarkerTile(this.maze.start, mazeLeft, mazeTop, mazeTileSize, 0.9, 'start');");
    expect(menuSceneSource).toContain("this.fillPlayDynamicMarkerTile(this.maze.goal, mazeLeft, mazeTop, mazeTileSize, 0.95, 'goal');");
    expect(menuSceneSource).toContain('const LEGACY_PLAY_START_MARKER_CORE = 0xfff05a;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_START_MARKER_EDGE = 0xffc629;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_GOAL_MARKER_CORE = 0xff263f;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_GOAL_MARKER_EDGE = 0xd81b2a;');
    expect(menuSceneSource).toContain('markerStyle: {');
    expect(menuSceneSource).toContain('playerCoreColor: resolveLegacyIridescentPlayerCoreColor()');
    expect(menuSceneSource).toContain('playerHaloColor: progressionPalette.playerHaloColor');
    expect(menuSceneSource).toContain('startCoreColor: LEGACY_PLAY_START_MARKER_CORE');
    expect(menuSceneSource).toContain('startEdgeColor: LEGACY_PLAY_START_MARKER_EDGE');
    expect(menuSceneSource).toContain('trailPulseColor: progressionPalette.trailPulseColor');
    expect(menuSceneSource).toContain('trailPulseEdgeColor: progressionPalette.trailPulseEdgeColor');
    expect(menuSceneSource).toContain('trailShineEnabled: this.settings.toggleTrailPulse');
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
    expect(menuSceneSource).toContain('trailPulseEnabled: this.settings.toggleTrailPulse');
    expect(menuSceneSource).toContain('playerCoreRadius: playerMarkerMetrics.coreRadius');
    expect(menuSceneSource).toContain('playerBeaconColor: LEGACY_PLAY_PLAYER_BEACON_COLOR');
    expect(menuSceneSource).toContain('playerBeaconPeriodMs: LEGACY_PLAY_PLAYER_BEACON_PERIOD_MS');
    expect(menuSceneSource).toContain('playerHaloRadius: playerMarkerMetrics.haloRadius');
    expect(menuSceneSource).toContain('resolveLegacyEndpointMarkerRenderMetrics(tileSize);');
    expect(menuSceneSource).toContain('private drawLegacyEndpointMarker(');
    expect(menuSceneSource).toContain('graphics.lineTo(centerX + markerMetrics.outerRadius, centerY);');
    expect(menuSceneSource).toContain('this.fillLegacyPlayerMarkerTile(renderedPlayerPoint');
    expect(menuSceneSource).toContain("&& this.menuStaticDrawLifecyclePhase !== 'building'");
    expect(menuSceneSource).toContain('this.fillLegacyPlayerMarkerTile(renderedPlayerPoint, mazeLeft, mazeTop, mazeTileSize, playerAlpha, true, progressionPalette, time);');
    expect(menuSceneSource).toContain('this.armLegacyPlayerVisualMotion(previousPlayer, nextStep.player, this.time.now, LEGACY_PLAY_PLAYER_VISUAL_MOVE_MS);');
    expect(menuSceneSource).toContain('renderScreenX: mazeRenderFrame.boardLeft + ((renderedPlayerPoint.x + 0.5) * mazeRenderFrame.tileSize)');
    expect(menuSceneSource).toContain('visualMotionActive: this.hasLegacyPlayerVisualMotionPendingFrame(time)');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO = 0.46;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO = 0.72;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_BEACON_COLOR = 0x36ff7d;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_BEACON_ACCENT = 0xb6ffd0;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_BEACON_PERIOD_MS = 1150;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_AI_BEACON_ALPHA_RATIO = 0.74;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_AI_BEACON_RADIUS_RATIO = 0.16;');
    expect(menuSceneSource).toContain('const beaconPhase = (Math.sin((time / LEGACY_PLAY_PLAYER_BEACON_PERIOD_MS) * Math.PI * 2) + 1) / 2;');
    expect(menuSceneSource).toContain('? tileSize * (0.18 + (beaconPhase * 0.1))');
    expect(menuSceneSource).toContain(': tileSize * (LEGACY_MENU_AI_BEACON_RADIUS_RATIO + (beaconPhase * 0.08));');
    expect(menuSceneSource).toContain(': Math.min(0.5, alpha * LEGACY_MENU_AI_BEACON_ALPHA_RATIO * (0.34 + (beaconPhase * 0.22)));');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.strokeCircle(centerX, centerY, beaconRadius);');
    expect(menuSceneSource).toContain('resolveLegacyPlayerLocatorRenderMetrics(');
    expect(menuSceneSource).toContain('drawLocatorTick(centerX - locatorMetrics.outerRadius, centerY, centerX - locatorMetrics.innerRadius, centerY);');
    expect(menuSceneSource).toContain('const playerScreenX = mazeRenderFrame.boardLeft + ((renderedPlayerPoint.x + 0.5) * mazeRenderFrame.tileSize);');
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
    expect(menuSceneSource).toContain("scale: this.resolveLegacyProgressionScaleForMode('menu')");
    expect(menuSceneSource).toContain('scale: this.resolveLegacyProgressionScaleForMode(mode)');
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
    expect(menuSceneSource).toContain('private resolveLegacyPlayStickIntentMoveCandidates(): HumanMovementActionKind[] | null');
    expect(menuSceneSource).toContain('const pullVector = this.playTouchStickPull;');
    expect(menuSceneSource).toContain('const absoluteX = Math.abs(pullVector.normalizedX);');
    expect(menuSceneSource).toContain('const absoluteY = Math.abs(pullVector.normalizedY);');
    expect(menuSceneSource).toContain('resolveLegacyNavigationTarget(this.maze, this.player, axis.deltaX, axis.deltaY) !== null');
    expect(menuSceneSource).toContain('right.magnitude - left.magnitude');
    expect(menuSceneSource).toContain('pullVector.movementCandidates;');
    expect(menuSceneSource).toContain('const candidates = this.resolveLegacyPlayStickIntentMoveCandidates()');
    expect(menuSceneSource).toContain('if (this.playTouchStickPointerId !== null) {');
    expect(menuSceneSource).toContain('private drawLegacyPlayTouchStick(');
    expect(menuSceneSource).toContain('private setLegacyPlayHeldTouchMoveCandidates(');
    expect(menuSceneSource).toContain('const wasHeld = this.playMoveFlags[direction];');
    expect(menuSceneSource).toContain('const sameControlIndex = this.playHeldTouchMoves.findIndex((move) => move.control === control);');
    expect(menuSceneSource).toContain('if (this.playHeldTouchMoves.length >= LEGACY_PLAY_HELD_TOUCH_MOVE_LIMIT) {');
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
    expect(menuSceneSource).toContain('this.hudTouchControlBounds = this.drawLegacyPlayTouchControls(touchControlLayout);');
    expect(menuSceneSource).toContain("showPane: touchControlLayout.controlMode !== 'stick'");
    expect(menuSceneSource).toContain('this.hudBounds = touchCompassBounds');
    expect(menuSceneSource).toContain(': mergeVisualRects(this.hudTimerBounds, this.hudArrowBounds);');
    expect(menuSceneSource).toContain('touchControls');
    expect(menuSceneSource).toContain('LEGACY_CYBER_PANEL_FILL');
    expect(menuSceneSource).toContain('this.drawLegacyCyberPanel(this.hudGraphics, {');
    expect(menuSceneSource).toContain("this.drawLegacyPlayTouchLabel(controls.pause, 'PAUSE');");
    expect(menuSceneSource).not.toContain("this.drawLegacyPlayTouchLabel(controls.restart_attempt, 'RESET');");
    expect(menuSceneSource).not.toContain("this.drawLegacyPlayTouchLabel(controls.toggle_thoughts, 'TRAIL');");
    expect(menuSceneSource).toContain("this.hudGraphics.moveTo(cx, cy + stem);");
    expect(menuSceneSource).toContain("this.hudGraphics.lineTo(cx, cy - size);");
    expect(menuSceneSource).toContain('installLegacyPlayTouchControlFallback');
    expect(menuSceneSource).toContain("event.pointerType === 'touch'");
    expect(menuSceneSource).toContain('event.target === this.game.canvas');
    expect(menuSceneSource).toContain('event.stopImmediatePropagation()');
    expect(menuSceneSource).toContain("case 'pause':");
    expect(menuSceneSource).toContain("case 'restart_attempt':");
    expect(menuSceneSource).toContain("const resetAction = (): void => this.applyLegacyPauseCommand('reset-player');");
    expect(menuSceneSource).toContain("'Reset', resetAction");
    expect(menuSceneSource).toContain('private readonly playDirectionalIntent = new LegacyDirectionalIntentResolver();');
    expect(menuSceneSource).toContain('private requestLegacyPlayDirectionalIntent(controls: readonly HumanMovementActionKind[]): void');
    expect(menuSceneSource).toContain('this.playDirectionalIntent.step(this.maze, this.player);');
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
    expect(menuSceneSource).toContain('status: MazerRenderResolutionStatus');
    expect(menuSceneSource).toContain('applyMazerCanvasBackingResolution,');
    expect(menuSceneSource).toContain('resolveMazerCanvasBackingResolution,');
    expect(menuSceneSource).toContain("summarizeMazerRenderResolution,");
    expect(menuSceneSource).toContain("type MazerRenderResolutionDiagnostics,");
    expect(menuSceneSource).toContain("type MazerRenderResolutionStatus");
    expect(menuSceneSource).toContain('const renderResolutionDiagnostics = summarizeMazerRenderResolution({');
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
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('toggleCameraFollow', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailFade', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('toggleTrailPulse', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('toggleAnimatedBackdrop', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('darkMode', this.settings)");
    expect(menuSceneSource).toContain("checked: resolveLegacyOverlayToggleSwitchIsOn('controlMode', this.settings)");
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
    expect(menuSceneSource).toContain('this.progressionBadgeText = this.applyLegacyUiTextCrispness(this.add.text');
    expect(menuSceneSource).toContain('this.applyLegacyUiTextCrispness(text);');
    expect(textCrispnessSource).toContain('const devicePixelRatio = readDevicePixelRatio();');
    expect(textCrispnessSource).not.toContain('navigator.webdriver');
    expect(textCrispnessSource).not.toContain('HeadlessChrome');
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
    expect(menuSceneSource).toContain('const LEGACY_MENU_ACTION_GREEN = \'#36ff7d\';');
    expect(menuSceneSource).toContain('const buttonTextColor = isPrimaryFrontDoorButton');
    expect(menuSceneSource).toContain('? LEGACY_MENU_ACTION_GREEN');
    expect(menuSceneSource).toContain('resolveLegacyAuthenticatedMenuButtonStack');
    expect(menuSceneSource).toContain('const authenticatedMenuButtonStack = resolveLegacyAuthenticatedMenuButtonStack(this.layout);');
    expect(menuSceneSource).toContain('authenticatedMenuButtonStack.startButtonY');
    expect(menuSceneSource).toContain('authenticatedMenuButtonStack.optionsButtonY');
    expect(menuSceneSource).toContain('authenticatedMenuButtonStack.optionsButtonHeight');
    expect(menuSceneSource).toContain('const background = this.add.rectangle(x, y, width, height, 0x000000, 0.001);');
    expect(menuSceneSource).toContain('bounds: createVisualRect(x - (width / 2), y - (height / 2), width, height)');
    expect(menuSceneSource).toContain('text,');
    expect(menuSceneSource).toContain('? Math.max(frontDoorChrome?.hoverAlpha ?? 0.68, 0.68)');
  });

  test('keeps account login/logout inside the shared player-facing overlay system', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
    const authSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyAuth.ts'), 'utf8');
    const playerMessageSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyPlayerMessage.ts'), 'utf8');
    const overlayRoutingSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyOverlayRouting.ts'), 'utf8');

    expect(overlayRoutingSource).toContain("export type LegacyOverlayKind = 'none' | 'options' | 'pause' | 'auth' | 'confirm-progression-reset';");
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
    expect(menuSceneSource).toContain("const isAuthenticated = this.authSnapshot.status === 'authenticated';");
    expect(menuSceneSource).toContain("'Login',\n              () => this.openOverlay('auth')");
    expect(menuSceneSource).toContain('this.layout.centerButtonX,');
    expect(menuSceneSource).toContain('this.layout.centerButtonY,');
    expect(menuSceneSource).not.toContain('const accountActionLabel =');
    expect(menuSceneSource).toContain('private createLegacyOptionsAccountActionRow(panel: OverlayPanelFrame): void');
    expect(menuSceneSource).toContain('this.createLegacyOptionsAccountActionRow(panel);');
    expect(menuSceneSource).toContain("const label = this.authSnapshot.status === 'authenticated' ? 'Log out' : 'Account';");
    expect(authSource).toContain('LEGACY_AUTH_MESSAGE_COPY.authUnavailable');
    expect(playerMessageSource).toContain('Account login needs Supabase env vars before it can be enabled.');
    expect(playerMessageSource).toContain('export interface LegacyQueuedPlayerMessage');
    expect(playerMessageSource).toContain('export const enqueueLegacyPlayerMessage =');
    expect(playerMessageSource).toContain('export const expireLegacyPlayerMessageQueue =');
    expect(menuSceneSource).toContain('private latestAuthMessage: LegacyPlayerMessage | null = null;');
    expect(menuSceneSource).toContain('private resolveLegacyCurrentAuthMessage(): LegacyPlayerMessage | null');
    expect(menuSceneSource).toContain('latestAuthMessage: this.latestAuthMessage');
    expect(menuSceneSource).toContain('resolveLegacyAuthFeedbackMessage');
    expect(menuSceneSource).toContain('resolveLegacyAuthValidationMessage');
    expect(menuSceneSource).toContain('private playerMessageQueue: LegacyQueuedPlayerMessage[] = [];');
    expect(menuSceneSource).toContain('private pushLegacyPlayerMessage(message: LegacyPlayerMessage | null): void');
    expect(menuSceneSource).toContain('private markLegacyPlayerMessagesDirty(): void');
    expect(menuSceneSource).toContain('enqueueLegacyPlayerMessage(');
    expect(menuSceneSource).toContain('expireLegacyPlayerMessageQueue(this.playerMessageQueue, time)');
    expect(menuSceneSource).toContain('private createOverlayPlayerMessageStack(');
    expect(menuSceneSource).toContain('this.createOverlayPlayerMessageStack(visibleMessages');
    expect(menuSceneSource).toContain('private createOverlayPlayerMessageCard(');
    expect(menuSceneSource).toContain('private drawLegacyPlayPlayerMessageStack(hudFrame: LegacyPlayHudFrame): void');
    expect(menuSceneSource).toContain('this.drawLegacyPlayPlayerMessageStack(hudFrame);');
    expect(menuSceneSource).toContain('this.drawLegacyCyberPanel(this.hudGraphics, {');
    expect(menuSceneSource).toContain("label.setData('hud', true);");
    expect(menuSceneSource).toContain('private latestAuthFeedbackMessageExpiresAtMs = Number.NEGATIVE_INFINITY;');
    expect(menuSceneSource).toContain('private latestOverlayMessageExpiresAtMs = Number.NEGATIVE_INFINITY;');
    expect(menuSceneSource).toContain('private expireLegacyPlayerMessages(time: number): void');
    expect(menuSceneSource).toContain('this.expireLegacyPlayerMessages(time);');
    expect(menuSceneSource).toContain('this.setLatestOverlayMessage(resolveLegacyOverlayToggleMessage(');
    expect(menuSceneSource).toContain('this.setLatestOverlayMessage(resolveLegacyOverlayMovementSpeedMessage(');
    expect(menuSceneSource).toContain('this.armLegacyAuthFeedbackMessage();');
    expect(menuSceneSource).toContain('this.pushLegacyPlayerMessage(result.playerMessage);');
    expect(menuSceneSource).toContain('visibleMessages: this.resolveVisibleLegacyPlayerMessages()');
    expect(menuSceneSource).not.toContain('private createOverlayPlayerMessageText');
    expect(menuSceneSource).not.toContain('private createAuthFeedbackText');
    expect(menuSceneSource).not.toContain('private createAuthMessageText');
    expect(menuSceneSource).not.toContain('Guest mode is active. Account login needs Supabase env vars.');
    expect(menuSceneSource).toContain('this.seedSignedInProgressionFromGuest(previousProgressionState, snapshot);');
    expect(menuSceneSource).toContain('this.resolveLegacyProgressionStorageKey()');
  });

  test('keeps level display text green regardless of progression color tier', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('this.progressionBadgeText');
    expect(menuSceneSource).toContain('.setColor(LEGACY_MENU_ACTION_GREEN)');
    expect(menuSceneSource).not.toContain('.setColor(palette.badgeColor)');
  });

  test('surfaces rank-only public progression inside a maze-width badge', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('private formatLegacyElapsedLabel(elapsedMs: number): string');
    expect(menuSceneSource).toContain('private resolveLegacyMenuAiElapsedMs(): number');
    expect(menuSceneSource).toContain('private resolveLegacyPlayElapsedMs(): number');
    expect(menuSceneSource).toContain('private resolveLegacyProgressionBadgeText(_palette: LegacyProgressionPalette): string');
    expect(menuSceneSource).toContain('const text = this.resolveLegacyProgressionBadgeText(palette);');
    expect(menuSceneSource).toContain("const rankLine = `AI Rank: ${aiTrack.rank}`;");
    expect(menuSceneSource).toContain("return `${timerLabel}  ${rankLine}`;");
    expect(menuSceneSource).toContain("const timerLine = this.formatLegacyElapsedLabel(this.resolveLegacyPlayElapsedMs());");
    expect(menuSceneSource).toContain("const rankLine = `Rank: ${playerTrack.rank}`;");
    expect(menuSceneSource).toContain("return `${timerLine}  ${rankLine}`;");
    expect(menuSceneSource).toContain("`${this.mode === 'play' ? 'Rank' : 'AI Rank'}: public progression tier.`");
    expect(menuSceneSource).toContain('This resets your rank progress, score, runs, and maze level');
    expect(menuSceneSource).not.toContain('Skill Lvl');
    expect(menuSceneSource).not.toContain('Player Skill');
    expect(menuSceneSource).not.toContain('const complexityLabel =');
    expect(menuSceneSource).not.toContain('const signalLabel =');
    expect(menuSceneSource).not.toContain('Sig:');
    expect(menuSceneSource).not.toContain('return palette.label;');
    expect(menuSceneSource).not.toContain('private formatLegacyProgressionRunCount');
    expect(menuSceneSource).not.toContain('private resolveLegacyCurrentMazeLevel');
  });

  test('places the played-game level badge in the top HUD lane without overlapping the maze', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain("const centerY = this.mode === 'play'");
    expect(menuSceneSource).toContain('? this.resolveLegacyPlayProgressionBadgeCenterY(mazeRenderFrame, height)');
    expect(menuSceneSource).toContain(': this.resolveLegacyMenuProgressionBadgeCenterY(mazeRenderFrame, height);');
    expect(menuSceneSource).toContain('private resolveLegacyPlayProgressionBadgeCenterY(');
    expect(menuSceneSource).toContain('const maximumCenter = mazeRenderFrame.boardTop - 4 - (height / 2);');
    expect(menuSceneSource).toContain('const mazeGap = clampInteger(Math.round(mazeRenderFrame.tileSize * 2.4), 16, 28);');
    expect(menuSceneSource).toContain('const minimumTop = this.layout.height > this.layout.width ? 8 : 10;');
    expect(menuSceneSource).toContain('const maximumTopBeforeMaze = mazeRenderFrame.boardTop - mazeGap - height;');
    expect(menuSceneSource).toContain('return Math.round(top + (height / 2));');
    expect(menuSceneSource).toContain('private resolveLegacyMenuProgressionBadgeCenterY(');
    expect(menuSceneSource).toContain('return Math.round(this.layout.lanes.rank.top + (height / 2));');
  });

  test('consumes shared UI standards for buttons, titles, guides, and toggles', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain("from '../legacy-runtime/legacyUiStandards';");
    expect(menuSceneSource).toContain("resolveLegacyUiLabelCenterY(y, buttonFontSize, 'button')");
    expect(menuSceneSource).toContain("resolveLegacyUiLabelCenterY(y, fontSize, 'overlay-title')");
    expect(menuSceneSource).toContain('resolveLegacyToggleRowLayout(input.width, input.height, hasDescription)');
  });

  test('keeps the options and pause player guide readable while explaining visible badge fields', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const guideLayout = resolveLegacyOptionsGuideLayout(panel.width);');
    expect(menuSceneSource).toContain('const guideEndY = this.createLegacyOptionsInfoSection(rowY, panel);');
    expect(menuSceneSource).toContain('const guideTitleFontSize = guideLayout.titleFontSize;');
    expect(menuSceneSource).toContain('const guideRowFontSize = guideLayout.rowFontSize;');
    expect(menuSceneSource).toContain('const guideRowMinFontSize = guideLayout.rowMinFontSize;');
    expect(menuSceneSource).toContain('this.overlayGraphics.lineBetween(cardLeft + inset, titleRuleY, cardLeft + cardWidth - inset, titleRuleY);');
    expect(menuSceneSource).toContain("addText('PLAYER GUIDE', panel.centerX, titleY, cardWidth - (inset * 2), '#9dffd5', guideTitleFontSize, 0.5, 1, guideRowMinFontSize);");
    expect(menuSceneSource).toContain("drawLegendRow(0, 'compass', 'Compass', 'points to End', '#b7f2ff');");
    expect(menuSceneSource).toContain("'Player: green beacon + trail.'");
    expect(menuSceneSource).not.toContain("'AI marker + trail'");
    expect(menuSceneSource).toContain("`${this.mode === 'play' ? 'Rank' : 'AI Rank'}: public progression tier.`");
    expect(menuSceneSource).toContain("'Score: run quality; Runs: clears.'");
    expect(menuSceneSource).toContain("'Maze Lvl: challenge tier.'");
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
    expect(menuSceneSource).toContain('openOptionsOverlay: (): LegacyQaOverlayResult => this.handleLegacyQaOpenOptionsOverlay()');
    expect(menuSceneSource).toContain('openPauseOverlay: (): LegacyQaOverlayResult => this.handleLegacyQaOpenPauseOverlay()');
    expect(menuSceneSource).toContain('startPlayMode: (): LegacyQaOverlayResult => this.handleLegacyQaStartPlayMode()');
    expect(menuSceneSource).toContain('private handleLegacyQaOpenOptionsOverlay(): LegacyQaOverlayResult');
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
    expect(menuSceneSource).toContain('playerTrack.completedCycles * 9176');
    expect(menuSceneSource).toContain('playerTrack.level * 313');
    expect(menuSceneSource).toContain('playerTrack.paceScore * 37');
    expect(menuSceneSource).toContain("const seedOverride = mode === 'play'");
    expect(menuSceneSource).toContain('seedOverride');
    expect(menuSceneSource).toContain('seedOverride: this.createFreshLegacyPlayGenerationSeed()');
    expect(menuSceneSource).toContain('private resolveLegacyTargetComplexityForMode(mode: RuntimeMode): number');
    expect(menuSceneSource).toContain('targetComplexity: this.resolveLegacyTargetComplexityForMode(mode)');
    expect(menuSceneSource).toContain("targetComplexity: this.resolveLegacyTargetComplexityForMode('play')");
    expect(menuSceneSource).toContain("targetComplexity: this.resolveLegacyTargetComplexityForMode('menu')");
    expect(menuSceneSource).toContain("scale: this.resolveLegacyProgressionScaleForMode('play')");
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
    expect(menuSceneSource).toContain('const LEGACY_MENU_AI_MEMORY_OPTION_CORE = 0x2de8ff;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_AI_MEMORY_TARGET_CORE = 0xffd36a;');
    expect(menuSceneSource).toContain('private resolveLegacyMenuAiThoughtStyle(');
    expect(menuSceneSource).toContain('coreColor: LEGACY_MENU_AI_MEMORY_TARGET_CORE');
    expect(menuSceneSource).toContain('edgeColor: LEGACY_MENU_AI_MEMORY_TARGET_EDGE');
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
    expect(menuSceneSource).toContain("placeholder ? x - (width / 2) + 22 : Math.min(x + (width / 2) - 18, label.x + (label.displayWidth / 2) + 6)");
    expect(menuSceneSource).toContain("ease: 'Sine.easeInOut'");
    expect(menuSceneSource).toContain('this.syncLegacyAuthNativeInputValue();');
    expect(menuSceneSource).toContain('this.destroyLegacyAuthNativeInput();');
    expect(menuSceneSource).toContain("const secondaryModeLabel = this.authForm.mode === 'signup' ? 'Use Login' : 'Create Account';");
    expect(menuSceneSource).not.toContain('Guest mode is active. Sign in to keep account progress separate.');
  });

  test('keeps pause overflow behind a mobile scroll facade and icon-only overlay back control', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('resolveLegacyOverlayScrollMetrics');
    expect(menuSceneSource).toContain('private drawLegacyOverlayScrollFacade(metrics: LegacyOverlayScrollMetrics, forceVisible = false): void');
    expect(menuSceneSource).toContain('private createOverlayBackChevronButton(panel: OverlayPanelFrame, onClick: () => void): UiButton');
    expect(menuSceneSource).toContain('this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.applyLegacyPauseCommand(\'resume\')));');
    expect(menuSceneSource).toContain('this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.handleBackAction()));');
    expect(menuSceneSource).toContain("if (kind === 'pause' && this.mode === 'play')");
    expect(menuSceneSource).toContain('const timerBottom = timerFrame.timerBounds.top + timerFrame.timerBounds.height;');
    expect(menuSceneSource).toContain('top = Math.max(timerBottom + (compact ? 10 : 14), 58);');
    expect(menuSceneSource).toContain('rightGutter: LEGACY_OVERLAY_SCROLL_RIGHT_GUTTER');
    expect(menuSceneSource).toContain('this.drawLegacyOverlayScrollFacade(scrollMetrics, true);');
    expect(menuSceneSource).toContain('this.overlayScrollThumbBounds = this.legacyOverlayScrollRectToVisualRect(metrics.thumb);');
    expect(menuSceneSource).toContain('const thumbAlpha = metrics.enabled ? 0.92 : 0.58;');
    expect(menuSceneSource).toContain('if (!showAdvancedOptions) {');
    expect(menuSceneSource).toContain('const viewportTop = guideEndY + (compact ? 8 : 10);');
    expect(menuSceneSource).toContain('const contentHeight = this.resolveFeatureControlRowsContentHeight(panel, {');
    expect(menuSceneSource).toContain('this.input.on(\'wheel\'');
    expect(menuSceneSource).toContain('private handleOverlayScrollPointerDown(pointer: Phaser.Input.Pointer): boolean');
    expect(menuSceneSource).toContain('private handleOverlayScrollPointerMove(pointer: Phaser.Input.Pointer): boolean');
    expect(menuSceneSource).toContain('private resolveLegacyRoundedRectRadius(width: number, height: number, requestedRadius?: number): number');
    expect(menuSceneSource).toContain('fillScrollPill(track.left - 3, track.top - 2, track.width + 6, track.height + 4');
    expect(menuSceneSource).toContain('centerY - (height / 2) >= viewport.top + 2');
    expect(menuSceneSource).toContain('centerY + (height / 2) <= viewport.bottom - 2');
    expect(menuSceneSource).toContain('private fitLegacyUiTextToWidth<T extends Phaser.GameObjects.Text>');
    expect(menuSceneSource).toContain('const showStateLabel = uiLayout.showStateLabel;');
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
