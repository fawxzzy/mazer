import { describe, expect, test } from 'vitest';
import {
  resolveLegacyMenuPathRenderFrame,
  resolveLegacyMenuPathRenderFrames
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
        topInset: 7,
        width: 20,
        height: 6
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

  test('keeps the menu board in the heavier legacy trench-material lane', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const legacyMenuRenderSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMenuRender.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_BOARD_GRID_ALPHA = 0.005;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_CORE = 0x85808d;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE = 0x38323c;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_WALL_FILL = 0x18131d;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_WALL_GRID = 0x0f0b12;');
    expect(menuSceneSource).toContain('? 0x1f1a24');
    expect(legacyMenuRenderSource).toContain('const LEGACY_MENU_TRENCH_EDGE_INSET_RATIO = 0.2;');
    expect(legacyMenuRenderSource).toContain('const LEGACY_MENU_TRENCH_CORE_INSET_RATIO = 0.16;');
    expect(menuSceneSource).toContain('resolveLegacyMenuPathRenderFrames(this.maze, { x, y }, tileSize);');
    expect(menuSceneSource).toContain('this.boardStaticGraphics.fillStyle(LEGACY_MENU_WALL_GRID, 0.006);');
  });

  test('keeps menu dynamic trail overlays in the legacy corridor frame instead of full square cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_MENU_DYNAMIC_TRAIL_EDGE = 0x0a6f82;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_DYNAMIC_MARKER_INSET_RATIO = 0.24;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_DYNAMIC_TRAIL_CORE_RATIO = 0.34;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_DYNAMIC_TRAIL_EDGE_RATIO = 0.52;');
    expect(menuSceneSource).toContain("const menuTrailKeys = this.mode === 'menu'");
    expect(menuSceneSource).toContain('this.fillLegacyMenuDynamicPathTile(');
    expect(menuSceneSource).toContain('const connectedLeft = trailKeys.has(`${point.x - 1},${point.y}`);');
    expect(menuSceneSource).toContain('this.fillMenuDynamicMarkerTile(this.player, 0xf2f4f8');
  });
});
