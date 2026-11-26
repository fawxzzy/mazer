/**
 * The drawn play trail is the path the player actually walked (src/legacy-runtime/legacyWalkedTrail.ts, owner
 * 2026-11-25): it unwrites only when the player steps back onto the tile the trail came from, never on a revisit alone,
 * and a loop or a self-crossing keeps both passes. The scene draws it from its own move history (`this.trail`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveLegacyWalkedTrail } from '../../src/legacy-runtime/legacyWalkedTrail';
import { advanceLegacyPlayStep, LEGACY_PLAY_TRAIL_FADE_TAIL } from '../../src/legacy-runtime/legacyPlayStep';
import type { LegacyPoint } from '../../src/legacy-runtime/legacyMaze';

/** Points from "x,y x,y ..." for readable cases. */
const pts = (text: string): LegacyPoint[] => text.trim().split(/\s+/).map((pair) => {
  const [x, y] = pair.split(',').map(Number);
  return { x: x!, y: y! };
});
const str = (points: readonly LegacyPoint[]): string => points.map((p) => `${p.x},${p.y}`).join(' ');
const walked = (history: string): string => {
  const h = pts(history);
  return str(resolveLegacyWalkedTrail(h, h[h.length - 1]!));
};

describe('walked trail: write and unwrite', () => {
  test('a straight walk is drawn as walked', () => {
    expect(walked('0,0 1,0 2,0 3,0')).toBe('0,0 1,0 2,0 3,0');
  });

  test('stepping back onto the previous tile unwrites the last tile, one tile per step, down to the origin', () => {
    expect(walked('0,0 1,0 2,0 3,0 2,0')).toBe('0,0 1,0 2,0');
    expect(walked('0,0 1,0 2,0 3,0 2,0 1,0')).toBe('0,0 1,0');
    expect(walked('0,0 1,0 2,0 3,0 2,0 1,0 0,0')).toBe('0,0');
  });

  test('a dead end walked in and back out leaves nothing behind; walking on writes again', () => {
    // Corridor east, a dead-end branch south (1,1)-(1,2), back out, then on east.
    expect(walked('0,0 1,0 1,1 1,2 1,1 1,0 2,0 3,0')).toBe('0,0 1,0 2,0 3,0');
  });

  test('a repeated tile (no move) changes nothing', () => {
    expect(walked('0,0 1,0 1,0 2,0 2,0')).toBe('0,0 1,0 2,0');
  });

  test('with no history the trail is the player tile', () => {
    expect(str(resolveLegacyWalkedTrail([], { x: 4, y: 5 }))).toBe('4,5');
  });

  test('inputs are not changed and new points are returned', () => {
    const history = pts('0,0 1,0 2,0 1,0');
    const before = str(history);
    const out = resolveLegacyWalkedTrail(history, history[3]!);
    expect(str(history)).toBe(before);
    expect(out[0]).not.toBe(history[0]);
  });
});

describe('walked trail: loops and self-crossing (the shortest route used to jump here)', () => {
  // A 2x2 loop: (0,0) (1,0) (1,1) (0,1).
  test('walking round a loop back onto its first tile keeps the whole loop (a revisit is not an unwrite)', () => {
    expect(walked('0,0 1,0 1,1 0,1 0,0')).toBe('0,0 1,0 1,1 0,1 0,0');
  });

  test('going on round the loop a second time keeps writing over the first pass', () => {
    expect(walked('0,0 1,0 1,1 0,1 0,0 1,0 1,1')).toBe('0,0 1,0 1,1 0,1 0,0 1,0 1,1');
  });

  test('backing out of a closed loop unwrites the second pass tile by tile, then the loop, in walk order', () => {
    const lap = '0,0 1,0 1,1 0,1 0,0';
    expect(walked(`${lap} 0,1`)).toBe('0,0 1,0 1,1 0,1');
    expect(walked(`${lap} 0,1 1,1`)).toBe('0,0 1,0 1,1');
    expect(walked(`${lap} 0,1 1,1 1,0 0,0`)).toBe('0,0');
  });

  test('crossing your own trail (a plus-shaped junction walked twice) keeps both passes', () => {
    // North-south through (1,1), round the block, then west-east through (1,1).
    const history = '1,0 1,1 1,2 2,2 2,1 1,1 0,1';
    expect(walked(history)).toBe('1,0 1,1 1,2 2,2 2,1 1,1 0,1');
  });

  test('stepping back along the CURRENT direction only: at a crossing, the older pass is not unwritten', () => {
    // After crossing (1,1) a second time heading west, stepping back east onto (1,1) unwrites only the newest tile.
    expect(walked('1,0 1,1 1,2 2,2 2,1 1,1 0,1 1,1')).toBe('1,0 1,1 1,2 2,2 2,1 1,1');
    // ... and stepping from (1,1) north onto (1,0), which the older pass came from, is a new step: it writes.
    expect(walked('1,0 1,1 1,2 2,2 2,1 1,1 1,0')).toBe('1,0 1,1 1,2 2,2 2,1 1,1 1,0');
  });

  test('the shortest-route rule this replaces would have cut the loop; the walked trail does not', () => {
    // Round a 3x2 loop the long way: the shortest visited route from (0,0) to (0,1) is one step, the walk is five.
    expect(walked('0,0 1,0 2,0 2,1 1,1 0,1')).toBe('0,0 1,0 2,0 2,1 1,1 0,1');
  });
});

describe('walked trail: resets, fade and the scene', () => {
  const grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => true));
  const maze = { grid, start: { x: 0, y: 0 }, goal: { x: 4, y: 4 }, width: 5, height: 5 } as never;

  test('a reset, a restart, a pause-reset, a resume or a new level replaces the history, and the trail follows it', () => {
    expect(walked('3,3')).toBe('3,3'); // history replaced by [player] (pause-reset, new level spawn)
    // A resumed run restores its saved history: same history, same trail as before the save.
    const saved = pts('0,0 1,0 2,0 2,1 1,1 1,0');
    expect(str(resolveLegacyWalkedTrail(saved.map((p) => ({ ...p })), { x: 1, y: 0 })))
      .toBe(str(resolveLegacyWalkedTrail(saved, saved[saved.length - 1]!)));
  });

  /** Real accepted moves through advanceLegacyPlayStep (the scene's own step), from (0,0). */
  const walk = (moves: readonly (readonly [number, number])[], toggleTrailFade = false): { player: LegacyPoint; trail: LegacyPoint[] } => {
    let player: LegacyPoint = { x: 0, y: 0 };
    let trail: LegacyPoint[] = [{ x: 0, y: 0 }];
    for (const [deltaX, deltaY] of moves) {
      const step = advanceLegacyPlayStep({ deltaX, deltaY, maze, player, trail, toggleTrailFade });
      expect(step.moved).toBe(true);
      player = step.player;
      trail = step.trail;
    }
    return { player, trail };
  };

  test('Trail Fade: the trail is built from the kept moves only; stepping back past the oldest kept move writes', () => {
    // Snake over the 5x5 open board for 20 moves, then 1 step back; Trail Fade keeps the newest moves only.
    const route: [number, number][] = [[1, 0], [1, 0], [1, 0], [1, 0], [0, 1], [-1, 0], [-1, 0], [-1, 0], [-1, 0], [0, 1],
      [1, 0], [1, 0], [1, 0], [1, 0], [0, 1], [-1, 0], [-1, 0], [-1, 0], [-1, 0], [0, 1], [0, -1]];
    const { player, trail } = walk(route, true);
    expect(trail.length).toBe(LEGACY_PLAY_TRAIL_FADE_TAIL);
    const out = resolveLegacyWalkedTrail(trail, player);
    expect(out[0]).toEqual(trail[0]);
    expect(out[out.length - 1]).toEqual(player);
    expect(out.length).toBe(LEGACY_PLAY_TRAIL_FADE_TAIL - 2); // the step back unwrote one kept tile
  });

  test('real accepted moves round a loop and one step back: the drawn trail follows the walk', () => {
    const { player, trail } = walk([[1, 0], [0, 1], [-1, 0], [0, -1], [0, 1]]);
    expect(str(resolveLegacyWalkedTrail(trail, player))).toBe('0,0 1,0 1,1 0,1');
  });

  test('the scene draws the walked trail from its own move history', () => {
    const scene = readFileSync(join(__dirname, '..', '..', 'src', 'scenes', 'MenuScene.ts'), 'utf8');
    const start = scene.indexOf('private computeLegacyPlayPerfectPathTrail(): LegacyPoint[] {');
    expect(start).toBeGreaterThan(0);
    const body = scene.slice(start, scene.indexOf('\n  }\n', start));
    expect(body).toContain('return resolveLegacyWalkedTrail(this.trail, this.player);');
    expect(body).not.toContain('resolveLegacyPlayableShortestPath');
  });
});
