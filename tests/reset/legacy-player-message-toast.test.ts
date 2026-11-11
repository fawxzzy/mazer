import { describe, expect, test } from 'vitest';
import {
  LEGACY_PLAYER_MESSAGE_COLORS,
  createLegacyPlayerMessage,
  enqueueLegacyPlayerMessage,
  type LegacyPlayerMessageTone,
  type LegacyQueuedPlayerMessage
} from '../../src/legacy-runtime/legacyPlayerMessage';
import {
  resolveLegacyPlayerMessageToastAlpha,
  resolveLegacyPlayerMessageToastFrame,
  resolveLegacyPlayerMessageToastMaxWidth
} from '../../src/legacy-runtime/legacyPlayerMessageToast';

const TONES: LegacyPlayerMessageTone[] = ['error', 'info', 'success', 'warning'];

const queueOf = (tones: LegacyPlayerMessageTone[], nowMs = 0): LegacyQueuedPlayerMessage[] => {
  let queue: LegacyQueuedPlayerMessage[] = [];
  tones.forEach((tone, index) => {
    queue = enqueueLegacyPlayerMessage(
      queue,
      createLegacyPlayerMessage({ copy: `${tone} copy`, id: `m.${tone}`, source: 'system', tone }),
      nowMs,
      index + 1
    );
  });
  return queue;
};

describe('player message toast frame', () => {
  test('renders one row per queued message with its tone colour, for all four tones', () => {
    const frame = resolveLegacyPlayerMessageToastFrame(queueOf(['error', 'info', 'success']), 1000, 390);
    expect(frame.rows.map((row) => row.tone)).toEqual(['success', 'info', 'error']);
    for (const tone of TONES) {
      const single = resolveLegacyPlayerMessageToastFrame(queueOf([tone]), 1000, 390);
      expect(single.rows).toHaveLength(1);
      expect(single.rows[0]?.color).toBe(LEGACY_PLAYER_MESSAGE_COLORS[tone]);
      expect(single.rows[0]?.copy).toBe(`${tone} copy`);
    }
  });

  test('fades in, holds, fades out and drops expired rows', () => {
    const [entry] = queueOf(['warning'], 0);
    expect(entry).toBeDefined();
    const at = (ms: number): number => resolveLegacyPlayerMessageToastAlpha(entry!, ms);
    expect(at(0)).toBe(0);
    expect(at(80)).toBeCloseTo(0.5, 5);
    expect(at(1000)).toBe(1);
    expect(at(entry!.expiresAtMs - 160)).toBeCloseTo(0.5, 5);
    expect(at(entry!.expiresAtMs)).toBe(0);
    expect(resolveLegacyPlayerMessageToastFrame([entry!], entry!.expiresAtMs, 390).rows).toEqual([]);
  });

  test('empty queue draws nothing and width clamps to the viewport', () => {
    expect(resolveLegacyPlayerMessageToastFrame([], 0, 390).rows).toEqual([]);
    expect(resolveLegacyPlayerMessageToastMaxWidth(390)).toBe(358);
    expect(resolveLegacyPlayerMessageToastMaxWidth(1280)).toBe(420);
    expect(resolveLegacyPlayerMessageToastMaxWidth(50)).toBe(120);
  });
});
