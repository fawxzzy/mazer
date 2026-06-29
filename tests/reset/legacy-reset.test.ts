import { describe, expect, test } from 'vitest';
import { LEGACY_DEFAULTS, MAIN_MENU_BUTTONS, linearColorToHex } from '../../src/legacy-runtime/legacyDefaults';
import { createLegacyMaze, createLegacyMenuMaze } from '../../src/legacy-runtime/legacyMaze';
import {
  createLegacyDemoWalkerEpisode,
  createLegacyMenuDemoWalkerConfig,
  LEGACY_MENU_SNAPSHOT_CADENCE,
  createLegacyMenuSnapshotDemoWalkerConfig,
  LEGACY_MENU_SNAPSHOT_PREROLL_STEPS,
  resolveLegacyPointFromDemoIndex,
  resolveLegacyTrailFromDemoSteps
} from '../../src/legacy-runtime/legacyDemoWalker';
import { collectDemoWalkerTelemetry, createDemoWalkerState } from '../../src/domain/ai';
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

  test('uses a fixed legacy-shaped menu maze snapshot for the front door', () => {
    const menuMaze = createLegacyMenuMaze(3749);

    expect(menuMaze.size).toBe(25);
    expect(menuMaze.start).toEqual({ x: 3, y: 4 });
    expect(menuMaze.goal).toEqual({ x: 22, y: 22 });
    expect(menuMaze.solutionPath[0]).toEqual(menuMaze.start);
    expect(menuMaze.solutionPath.at(-1)).toEqual(menuMaze.goal);
    expect(menuMaze.grid[13]?.[22]).toBe(true);
    expect(menuMaze.grid[21]?.[20]).toBe(true);
    expect(menuMaze.grid[11]?.[12]).toBe(true);
    expect(menuMaze.grid[19]?.[13]).toBe(true);
    expect(menuMaze.grid[20]?.[23]).toBe(true);
    expect(menuMaze.grid[3]?.[19]).toBe(true);
    expect(menuMaze.grid[9]?.[4]).toBe(true);
    expect(menuMaze.grid[14]?.[17]).toBe(true);
    expect(menuMaze.grid[20]?.[12]).toBe(true);
    expect(menuMaze.grid[19]?.[22]).toBe(true);
    expect(menuMaze.grid[4]?.[18]).toBe(true);
    expect(menuMaze.grid[16]?.[6]).toBe(true);
    expect(menuMaze.grid[22]?.[18]).toBe(true);
    expect(menuMaze.grid[11]?.[21]).toBe(true);
    expect(menuMaze.grid[4]?.[7]).toBe(true);
    expect(menuMaze.grid[8]?.[5]).toBe(true);
    expect(menuMaze.grid[7]?.[19]).toBe(true);
    expect(menuMaze.grid[11]?.[17]).toBe(true);
    expect(menuMaze.grid[11]?.[14]).toBe(true);
    expect(menuMaze.grid[12]?.[11]).toBe(true);
    expect(menuMaze.grid[13]?.[18]).toBe(true);
    expect(menuMaze.grid[8]?.[13]).toBe(true);
    expect(menuMaze.grid[8]?.[15]).toBe(true);
    expect(menuMaze.grid[13]?.[4]).toBe(true);
    expect(menuMaze.grid[15]?.[8]).toBe(true);
    expect(menuMaze.grid[12]?.[13]).toBe(true);
    expect(menuMaze.grid[21]?.[15]).toBe(true);
    expect(menuMaze.grid[8]?.[10]).toBe(true);
    expect(menuMaze.grid[10]?.[8]).toBe(true);
    expect(menuMaze.grid[6]?.[17]).toBe(true);
    expect(menuMaze.grid[7]?.[9]).toBe(true);
    expect(menuMaze.grid[11]?.[13]).toBe(true);
    expect(menuMaze.grid[6]?.[24]).toBe(true);
    expect(menuMaze.grid[12]?.[24]).toBe(true);
    expect(menuMaze.grid[16]?.[23]).toBe(true);
    expect(menuMaze.grid[11]?.[22]).toBe(true);
  });

  test('adapts legacy maze snapshots into the recovered menu demo walker lane', () => {
    const maze = createLegacyMaze(50, 3749);
    const episode = createLegacyDemoWalkerEpisode(maze);
    const config = createLegacyMenuDemoWalkerConfig(maze.seed);
    const state = createDemoWalkerState(episode, config);
    const telemetry = collectDemoWalkerTelemetry(episode, config);

    expect(episode.raster.startIndex).toBe((maze.start.y * maze.size) + maze.start.x);
    expect(episode.raster.endIndex).toBe((maze.goal.y * maze.size) + maze.goal.x);
    expect(Array.from(episode.raster.pathIndices).at(0)).toBe(episode.raster.startIndex);
    expect(Array.from(episode.raster.pathIndices).at(-1)).toBe(episode.raster.endIndex);
    expect(config.behavior.enableRunnerMistakes).toBe(true);
    expect(telemetry.backtrackCount).toBeGreaterThan(0);
    expect(resolveLegacyPointFromDemoIndex(state.currentIndex, episode.raster.width)).toEqual(maze.start);
    expect(resolveLegacyTrailFromDemoSteps(state.trailSteps, episode.raster.width)).toEqual([maze.start]);
  });

  test('uses a deterministic deep-preroll config for the fixed legacy menu snapshot', () => {
    const snapshotConfig = createLegacyMenuSnapshotDemoWalkerConfig(3749);
    const genericConfig = createLegacyMenuDemoWalkerConfig(3749);

    expect(snapshotConfig.behavior.enableRunnerMistakes).toBe(false);
    expect(snapshotConfig.behavior.prerollSteps).toBeGreaterThanOrEqual(LEGACY_MENU_SNAPSHOT_PREROLL_STEPS);
    expect(snapshotConfig.cadence.exploreStepMs).toBe(LEGACY_MENU_SNAPSHOT_CADENCE.exploreStepMs);
    expect(snapshotConfig.cadence.backtrackStepMs).toBe(LEGACY_MENU_SNAPSHOT_CADENCE.backtrackStepMs);
    expect(snapshotConfig.cadence.goalHoldMs).toBe(LEGACY_MENU_SNAPSHOT_CADENCE.goalHoldMs);
    expect(snapshotConfig.cadence.resetHoldMs).toBe(LEGACY_MENU_SNAPSHOT_CADENCE.resetHoldMs);
    expect(genericConfig.behavior.enableRunnerMistakes).toBe(true);
    expect(genericConfig.cadence.exploreStepMs).not.toBe(snapshotConfig.cadence.exploreStepMs);
  });

  test('keeps the active-play HUD minimal and legacy-shaped', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const timerText = `Time ${elapsed}`;');
    expect(menuSceneSource).toContain('Phaser.Math.Angle.Between');
    expect(menuSceneSource).not.toContain('WASD or arrows to move   P to pause');
    expect(menuSceneSource).toContain('this.hudGraphics.fillRect(18, 18, 156, 34);');
    expect(menuSceneSource).not.toContain('fillRoundedRect(20, 18, 184, 44, 8)');
    expect(menuSceneSource).toContain('createLegacyDemoWalkerEpisode(this.maze)');
    expect(menuSceneSource).toContain('createLegacyMenuDemoWalkerConfig(this.maze.seed)');
    expect(menuSceneSource).toContain('createLegacyMenuSnapshotDemoWalkerConfig(this.maze.seed)');
    expect(menuSceneSource).toContain('advanceDemoWalker(this.menuDemoEpisode, this.menuDemoState, this.menuDemoConfig)');
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
