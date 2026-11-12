import { describe, expect, it } from 'vitest';
import { TrailPerfectPathCache } from '../../src/render/trailPerfectPathCache';

const pt = (x: number, y: number) => ({ x, y });

describe('trail shortest-route memo (MAZER-PERF-002)', () => {
  it('computes once for any number of redraws of an unchanged maze, trail and player', () => {
    const cache = new TrailPerfectPathCache();
    const maze = {};
    const trail = [pt(0, 0), pt(1, 0), pt(2, 0)];
    const player = pt(2, 0);
    let computes = 0;
    const compute = () => { computes += 1; return [pt(0, 0), pt(1, 0), pt(2, 0)]; };
    const first = cache.resolve(maze, trail, player, compute);
    for (let frame = 0; frame < 1000; frame += 1) {
      expect(cache.resolve(maze, trail, player, compute)).toBe(first);
    }
    expect(computes).toBe(1);
    expect(cache.computeCount).toBe(1);
    expect(cache.revision).toBe(1);
  });

  it('recomputes when the player steps (new trail array and player object), and bumps the revision each time', () => {
    const cache = new TrailPerfectPathCache();
    const maze = {};
    let trail = [pt(0, 0)];
    let player = pt(0, 0);
    let computes = 0;
    const compute = () => { computes += 1; return [pt(player.x, player.y)]; };
    for (let step = 1; step <= 50; step += 1) {
      trail = [...trail, pt(step, 0)];
      player = pt(step, 0);
      // Ten redraws per step cost one computation, not ten.
      for (let redraw = 0; redraw < 10; redraw += 1) {
        cache.resolve(maze, trail, player, compute);
      }
    }
    expect(computes).toBe(50);
    expect(cache.revision).toBe(50);
  });

  it('recomputes for a different maze even when the trail and player are identical objects', () => {
    const cache = new TrailPerfectPathCache();
    const trail = [pt(0, 0), pt(1, 0)];
    const player = pt(1, 0);
    let computes = 0;
    const compute = () => { computes += 1; return [pt(0, 0), pt(1, 0)]; };
    cache.resolve({}, trail, player, compute);
    cache.resolve({}, trail, player, compute);
    expect(computes).toBe(2);
  });

  it('notices an in-place change to the player tile or the trail length (defence in depth)', () => {
    const cache = new TrailPerfectPathCache();
    const maze = {};
    const trail = [pt(0, 0), pt(1, 0)];
    const player = pt(1, 0);
    let computes = 0;
    const compute = () => { computes += 1; return [pt(player.x, player.y)]; };
    cache.resolve(maze, trail, player, compute);
    player.x = 2;
    cache.resolve(maze, trail, player, compute);
    trail.push(pt(2, 0));
    cache.resolve(maze, trail, player, compute);
    expect(computes).toBe(3);
  });

  it('invalidate() forces the next resolve to recompute', () => {
    const cache = new TrailPerfectPathCache();
    const maze = {};
    const trail = [pt(0, 0)];
    const player = pt(0, 0);
    let computes = 0;
    const compute = () => { computes += 1; return [pt(0, 0)]; };
    cache.resolve(maze, trail, player, compute);
    cache.invalidate();
    cache.resolve(maze, trail, player, compute);
    expect(computes).toBe(2);
  });
});
