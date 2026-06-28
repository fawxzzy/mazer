import { describe, expect, test } from 'vitest';
import { LEGACY_DEFAULTS, MAIN_MENU_BUTTONS, linearColorToHex } from '../../src/legacy-runtime/legacyDefaults';
import { createLegacyMaze } from '../../src/legacy-runtime/legacyMaze';

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
});
