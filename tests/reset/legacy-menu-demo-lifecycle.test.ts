import { describe, expect, test } from 'vitest';
import { createLegacyMenuMaze, createLegacyMaze } from '../../src/legacy-runtime/legacyMaze';
import {
  advanceLegacyMenuDemoFrame,
  createLegacyMenuDemoBootstrap,
  isFixedLegacyMenuSnapshot
} from '../../src/legacy-runtime/legacyMenuDemoLifecycle';

describe('legacy menu demo lifecycle', () => {
  test('treats the fixed front-door maze as the snapshot bootstrap path', () => {
    const menuMaze = createLegacyMenuMaze(3749);
    const bootstrap = createLegacyMenuDemoBootstrap(menuMaze, true, 16);

    expect(isFixedLegacyMenuSnapshot(menuMaze)).toBe(true);
    expect(bootstrap.config.behavior.enableRunnerMistakes).toBe(true);
    expect(bootstrap.state.phase).toBe('explore');
    expect(bootstrap.state.cue).not.toBe('spawn');
    expect(bootstrap.state.cue).not.toBe('reset');
    expect(bootstrap.state.cue).not.toBe('goal');
    expect(bootstrap.state.currentIndex).not.toBe(bootstrap.episode.raster.startIndex);
    expect(bootstrap.state.pathCursor).toBeGreaterThanOrEqual(8);
    expect(bootstrap.trail.length).toBeGreaterThan(0);
    expect(bootstrap.trail.length).toBeLessThanOrEqual(16);
  });

  test('keeps generated mazes on the generic demo config path', () => {
    const playMaze = createLegacyMaze(50, 3749);
    const bootstrap = createLegacyMenuDemoBootstrap(playMaze, false, 16);

    expect(isFixedLegacyMenuSnapshot(playMaze)).toBe(false);
    expect(bootstrap.config.behavior.enableRunnerMistakes).toBe(true);
    expect(bootstrap.player).toEqual(bootstrap.trail.at(-1));
    expect(bootstrap.state.currentIndex).toBeGreaterThanOrEqual(bootstrap.episode.raster.startIndex);
  });

  test('advances the menu demo frame through the shared trail/player projection', () => {
    const menuMaze = createLegacyMenuMaze(3749);
    const bootstrap = createLegacyMenuDemoBootstrap(menuMaze, true, 16);
    const nextFrame = advanceLegacyMenuDemoFrame(
      bootstrap.episode,
      bootstrap.state,
      bootstrap.config,
      true,
      16
    );

    expect(nextFrame.delayMs).toBeGreaterThan(0);
    expect(nextFrame.state.currentIndex).not.toBe(bootstrap.state.currentIndex);
    expect(nextFrame.trail.length).toBeGreaterThan(0);
    expect(nextFrame.trail.length).toBeLessThanOrEqual(16);
  });

  test('lets the fixed front-door snapshot surface legacy recovery cues instead of a solver-only attract path', () => {
    const menuMaze = createLegacyMenuMaze(3749);
    const bootstrap = createLegacyMenuDemoBootstrap(menuMaze, false, 16);
    let state = bootstrap.state;
    const seenCues = new Set<string>([state.cue]);

    for (let step = 0; step < 512; step += 1) {
      const nextFrame = advanceLegacyMenuDemoFrame(
        bootstrap.episode,
        state,
        bootstrap.config,
        false,
        16
      );
      state = nextFrame.state;
      seenCues.add(state.cue);
      if (seenCues.has('dead-end') && seenCues.has('backtrack') && seenCues.has('reacquire')) {
        break;
      }
    }

    expect(seenCues.has('dead-end')).toBe(true);
    expect(seenCues.has('backtrack')).toBe(true);
    expect(seenCues.has('reacquire')).toBe(true);
  });
});
