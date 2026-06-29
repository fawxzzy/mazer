import { describe, expect, test } from 'vitest';
import { LEGACY_DEFAULTS, MAIN_MENU_BUTTONS, linearColorToHex } from '../../src/legacy-runtime/legacyDefaults';
import { createLegacyMaze } from '../../src/legacy-runtime/legacyMaze';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('legacy reset lane', () => {
  test('restores the legacy front-door button set', () => {
    expect(MAIN_MENU_BUTTONS).toEqual(['Exit', 'Start', 'Options']);
  });

  test('preserves legacy default settings', () => {
    expect(LEGACY_DEFAULTS.scale).toBe(50);
    expect(LEGACY_DEFAULTS.camScale).toBe(0);
    expect(linearColorToHex(LEGACY_DEFAULTS.pathColor)).toBe('#797978');
    expect(linearColorToHex(LEGACY_DEFAULTS.wallColor)).toBe('#4a4a4a');
  });

  test('builds a solvable legacy maze snapshot', () => {
    const maze = createLegacyMaze(50, 0x5a17f00d);

    expect(maze.size).toBeGreaterThanOrEqual(25);
    expect(maze.solutionPath.length).toBeGreaterThan(2);
    expect(maze.start).not.toEqual(maze.goal);

    const firstStep = maze.solutionPath[0];
    const lastStep = maze.solutionPath.at(-1);

    expect(firstStep).toEqual(maze.start);
    expect(lastStep).toEqual(maze.goal);
  });

  test('keeps the active-play HUD minimal and legacy-shaped', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const timerText = `Time ${elapsed}`;');
    expect(menuSceneSource).toContain('Phaser.Math.Angle.Between');
    expect(menuSceneSource).not.toContain('WASD or arrows to move   P to pause');
  });

  test('cleans up localhost service workers before booting Phaser', () => {
    const bootSource = readFileSync(resolve(process.cwd(), 'src/boot/main.ts'), 'utf8');

    expect(bootSource).toContain("const LOCALHOST_SW_RESET_KEY = 'mazer:localhost-sw-reset:v1';");
    expect(bootSource).toContain("['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)");
    expect(bootSource).toContain('navigator.serviceWorker.getRegistrations()');
    expect(bootSource).toContain("cacheKey.includes('mazer')");
    expect(bootSource).toContain('window.location.reload();');
  });
});
