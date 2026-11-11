import { describe, expect, test } from 'vitest';
import { resolveTrailGridPathWithHead } from '../../src/render/trailHeadPath';

const p = (x: number, y: number) => ({ x, y });

describe('trail head path: forward steps replace the arrival tile, backward steps keep it', () => {
  test('forward: the head replaces the new end tile', () => {
    // Walked (0,0) -> (1,0) -> (1,1); now gliding from (1,0) to (1,1).
    const path = resolveTrailGridPathWithHead([p(0, 0), p(1, 0), p(1, 1)], p(1, 0), { x: 1, y: 0.4 });
    expect(path).toEqual([p(0, 0), p(1, 0), { x: 1, y: 0.4 }]);
  });

  test('backward round a corner: the corner tile stays in the path and the head follows it (no corner cut)', () => {
    // Walked (0,0) -> (1,0) -> (1,1) -> (1,2) and stepped back to (1,1): the visited path is [(0,0),(1,0),(1,1)],
    // the head is still between (1,2) and (1,1).
    const path = resolveTrailGridPathWithHead([p(0, 0), p(1, 0), p(1, 1)], p(1, 2), { x: 1, y: 1.7 });
    expect(path).toEqual([p(0, 0), p(1, 0), p(1, 1), { x: 1, y: 1.7 }]);
  });

  test('backward into the start: the start stays and the head trails off it', () => {
    const path = resolveTrailGridPathWithHead([p(5, 5)], p(5, 6), { x: 5, y: 5.6 });
    expect(path).toEqual([p(5, 5), { x: 5, y: 5.6 }]);
  });

  test('first step out of the start is forward, whichever direction it takes', () => {
    const path = resolveTrailGridPathWithHead([p(5, 5), p(6, 5)], p(5, 5), { x: 5.3, y: 5 });
    expect(path).toEqual([p(5, 5), { x: 5.3, y: 5 }]);
  });

  test('a fresh level (no previous tile) draws start plus head, as before', () => {
    expect(resolveTrailGridPathWithHead([p(2, 2)], null, p(2, 2))).toEqual([p(2, 2), p(2, 2)]);
  });

  test('a different direction after returning to the start is forward again', () => {
    // Back at the start after an excursion east; now the player heads south: path [(5,5),(5,6)], came from (5,5).
    const path = resolveTrailGridPathWithHead([p(5, 5), p(5, 6)], p(5, 5), { x: 5, y: 5.5 });
    expect(path).toEqual([p(5, 5), { x: 5, y: 5.5 }]);
  });

  test('does not mutate its inputs', () => {
    const input = [p(0, 0), p(1, 0)];
    const snapshot = JSON.stringify(input);
    resolveTrailGridPathWithHead(input, p(2, 0), p(1.5, 0));
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
