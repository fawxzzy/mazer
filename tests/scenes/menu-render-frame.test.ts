import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuPathRenderFrame } from '../../src/legacy-runtime/legacyMenuRender';
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

  test('keeps the menu board in the heavier legacy trench-material lane', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_BOARD_GRID_ALPHA = 0.008;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_CORE = 0x8c8793;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE = 0x433d48;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_WALL_FILL = 0x1a1520;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_WALL_GRID = 0x110d15;');
    expect(menuSceneSource).toContain('? 0x221d29');
    expect(menuSceneSource).toContain('const innerInset = Math.max(1, Math.floor(tileSize * 0.2));');
    expect(menuSceneSource).toContain('this.boardStaticGraphics.fillStyle(LEGACY_MENU_WALL_GRID, 0.018);');
  });
});
