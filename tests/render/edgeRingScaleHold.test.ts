import { describe, expect, test } from 'vitest';
import { EDGE_DIAMOND_FULL_SCALE } from '../../src/render/edgeBeamTimeline';
import { EDGE_RING_HELD_SCALE, resolveHeldEdgeDiamondScale } from '../../src/render/edgeRingScaleHold';

describe('edge ring size hold', () => {
  test('is full size', () => {
    expect(EDGE_RING_HELD_SCALE).toBe(EDGE_DIAMOND_FULL_SCALE);
  });

  test('is constant over every direction, clock, index and charge', () => {
    for (const direction of ['outward', 'inward'] as const) {
      for (const clockMs of [0, 150, 600, 3000, 5000]) {
        for (let index = 0; index < 8; index += 1) {
          for (const charge of [0, 0.5, 1]) {
            expect(resolveHeldEdgeDiamondScale(direction, clockMs, index, 8, charge)).toBe(1);
          }
        }
      }
    }
  });
});
