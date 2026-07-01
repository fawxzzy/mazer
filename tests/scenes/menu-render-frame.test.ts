import { describe, expect, test } from 'vitest';
import {
  resolveLegacyMenuPathRenderFrame,
  resolveLegacyMenuPathRenderFrames,
  resolveLegacyMenuPathRenderSegments
} from '../../src/legacy-runtime/legacyMenuRender';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('resolveLegacyMenuPathRenderFrame', () => {
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
      topInset: 4,
      width: 20,
      height: 12
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
      leftInset: 4,
      topInset: 4,
      width: 12,
      height: 16
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
        topInset: 4,
        width: 20,
        height: 12
      },
      core: {
        leftInset: 0,
        topInset: 5,
        width: 20,
        height: 10
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
      { leftInset: 4, topInset: 4, width: 12, height: 12 },
      { leftInset: 0, topInset: 4, width: 16, height: 12 },
      { leftInset: 4, topInset: 4, width: 16, height: 12 },
      { leftInset: 4, topInset: 0, width: 12, height: 16 },
      { leftInset: 4, topInset: 4, width: 12, height: 16 }
    ]);
    expect(segments.core).toEqual([
      { leftInset: 5, topInset: 5, width: 10, height: 10 },
      { leftInset: 0, topInset: 5, width: 15, height: 10 },
      { leftInset: 5, topInset: 5, width: 15, height: 10 },
      { leftInset: 5, topInset: 0, width: 10, height: 15 },
      { leftInset: 5, topInset: 5, width: 10, height: 15 }
    ]);
  });

  test('keeps the menu board in the heavier legacy trench-material lane', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const legacyMenuRenderSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMenuRender.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_BOARD_GRID_ALPHA = 0.003;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_CORE = 0xaaa4b0;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE = 0x18131d;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE_ALPHA = 0.74;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_RELIEF_SHADOW = 0x07050b;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_RELIEF_SHADOW_ALPHA = 0.34;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_RELIEF_OFFSET_RATIO = 0.13;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_WALL_FILL = 0x3f3a46;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_WALL_GRID = 0x18131d;');
    expect(menuSceneSource).toContain('? 0x1f1a24');
    expect(legacyMenuRenderSource).toContain('const LEGACY_MENU_TRENCH_EDGE_INSET_RATIO = 0.2;');
    expect(legacyMenuRenderSource).toContain('const LEGACY_MENU_TRENCH_CORE_INSET_RATIO = 0.06;');
    expect(menuSceneSource).toContain('resolveLegacyMenuPathRenderSegments(this.maze, { x, y }, tileSize);');
    expect(menuSceneSource).toContain('resolveLegacyMenuPathRenderFrames(this.maze, { x, y }, tileSize);');
    expect(menuSceneSource).toContain('tileX + segment.leftInset + reliefOffset');
    expect(menuSceneSource).toContain('this.boardStaticGraphics.fillStyle(pathGlow, LEGACY_MENU_PATH_EDGE_ALPHA);');
    expect(menuSceneSource).toContain('tileX + frames.core.leftInset');
    expect(legacyMenuRenderSource).toContain('resolveLegacyMenuPathStrokeSegments');
    expect(menuSceneSource).toContain('this.boardStaticGraphics.fillStyle(LEGACY_MENU_WALL_GRID, 0.004);');
  });

  test('keeps menu dynamic trail overlays in the legacy corridor frame instead of full square cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_MENU_DYNAMIC_TRAIL_EDGE = 0x0a6f82;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_DYNAMIC_MARKER_INSET_RATIO = 0.3;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_DYNAMIC_TRAIL_CORE_RATIO = 0.22;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_DYNAMIC_TRAIL_EDGE_RATIO = 0.42;');
    expect(menuSceneSource).toContain("const menuTrailKeys = this.mode === 'menu'");
    expect(menuSceneSource).toContain('this.fillLegacyMenuDynamicPathTile(');
    expect(menuSceneSource).toContain('const connectedLeft = trailKeys.has(`${point.x - 1},${point.y}`);');
    expect(menuSceneSource).toContain('this.fillMenuDynamicMarkerTile(this.player, 0xf2f4f8');
  });

  test('keeps front-door buttons in the legacy dark-pane chrome path', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const fillColor = frontDoorChrome?.fillColor ?? 0xffffff;');
    expect(menuSceneSource).toContain('this.add.rectangle(x, y, width, height, fillColor, baseAlpha);');
    expect(menuSceneSource).toContain('? (frontDoorChrome?.hoverFillColor ?? 0xffffff)');
  });
});
