import { describe, expect, test } from 'vitest';

import {
  LEGACY_PLAYER_TRANSFER_OUTBOUND_MS,
  resolveLegacyPlayerTransferVisualState
} from '../../src/legacy-runtime/legacyPlayerTransfer';

const resolve = (overrides: Partial<Parameters<typeof resolveLegacyPlayerTransferVisualState>[0]> = {}) => (
  resolveLegacyPlayerTransferVisualState({
    armed: true,
    deliveryElapsedMs: null,
    deliveryFlashMs: 240,
    deliveryTravelMs: 260,
    nowMs: 0,
    outboundElapsedMs: 0,
    ...overrides
  })
);

describe('legacy player transfer visual state', () => {
  test('stays completely idle until a real completion arms the transfer', () => {
    expect(resolve({ armed: false })).toEqual({
      active: false,
      deliveryProgress: 0,
      energyAlpha: 0,
      outboundProgress: 0,
      phase: 'idle',
      swirlPhase: 0
    });
  });

  test('moves monotonically from the completed player toward the edge sigils', () => {
    const samples = [0, 90, 180, 270, LEGACY_PLAYER_TRANSFER_OUTBOUND_MS].map((outboundElapsedMs) => (
      resolve({ outboundElapsedMs })
    ));

    expect(samples.slice(0, -1).every((state) => state.phase === 'outbound')).toBe(true);
    expect(samples.at(-1)?.phase).toBe('stored');
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]!.outboundProgress).toBeGreaterThanOrEqual(samples[index - 1]!.outboundProgress);
      expect(samples[index]!.energyAlpha).toBeGreaterThanOrEqual(0);
      expect(samples[index]!.energyAlpha).toBeLessThanOrEqual(1);
    }
  });

  test('holds a bounded green-energy envelope while rebuild is between clocks', () => {
    const state = resolve({ outboundElapsedMs: null, nowMs: 600 });

    expect(state.phase).toBe('stored');
    expect(state.active).toBe(true);
    expect(state.outboundProgress).toBe(1);
    expect(state.energyAlpha).toBeCloseTo(0.9);
    expect(state.swirlPhase).toBe(0.5);
  });

  test('disperses stored energy monotonically while the existing spawn volley travels', () => {
    const samples = [0, 65, 130, 195, 260].map((deliveryElapsedMs) => (
      resolve({ deliveryElapsedMs, outboundElapsedMs: null })
    ));

    expect(samples.every((state) => state.phase === 'delivering')).toBe(true);
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]!.deliveryProgress).toBeGreaterThanOrEqual(samples[index - 1]!.deliveryProgress);
      expect(samples[index]!.energyAlpha).toBeLessThanOrEqual(samples[index - 1]!.energyAlpha);
    }
    expect(samples.at(-1)?.deliveryProgress).toBe(1);
    expect(samples.at(-1)?.energyAlpha).toBe(0);
  });

  test('self-terminates after the existing travel and flash windows without adding delay', () => {
    expect(resolve({ deliveryElapsedMs: 499 }).phase).toBe('delivering');
    expect(resolve({ deliveryElapsedMs: 500 })).toMatchObject({
      active: false,
      deliveryProgress: 1,
      energyAlpha: 0,
      phase: 'complete'
    });
  });

  test('is total for malformed clocks and collapses motion for reduced-motion users', () => {
    const malformed = resolve({
      deliveryElapsedMs: Number.NaN,
      deliveryFlashMs: 0,
      deliveryTravelMs: Number.NaN,
      nowMs: Number.NaN,
      outboundElapsedMs: Number.NEGATIVE_INFINITY
    });
    expect(malformed).toMatchObject({ active: true, phase: 'stored', swirlPhase: 0 });

    const reduced = resolve({
      nowMs: 875,
      outboundElapsedMs: 1,
      reducedMotion: true
    });
    expect(reduced).toMatchObject({
      active: true,
      outboundProgress: 1,
      phase: 'stored',
      swirlPhase: 0
    });
  });
});
