import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import type { LegacyMazeGenerationProfile, LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import {
  MAZE_CYCLE_TELEMETRY_STORAGE_KEY,
  createMazeCycleTelemetryReceipt,
  readMazeCycleTelemetryHistory,
  recordMazeCycleTelemetryReceipt,
  resolveMazeCycleHazardReceiptFields
} from '../../src/legacy-runtime/mazeCycleTelemetry';
import { createRemoteCycleReceiptPayload } from '../../src/legacy-runtime/legacyRemoteProgression';

// Slice H3: the hazard stamp (hazardScheduleVersion, hazardDigest, exposureStage) rides in the receipt
// only with the hazard layer on. Client-only: no server column or RPC parameter reads it.

class MemoryStorage {
  public values = new Map<string, string>();
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
}

const corridorProfile: LegacyMazeGenerationProfile = {
  borderFeederTargetPerSide: 0,
  checkpointCountMultiplier: 0.42,
  checkpointCountOverride: 1,
  maxDeadEndCount: 0,
  minCheckpoints: 1,
  requiredOppositeBorderConnections: { horizontal: false, vertical: false },
  routeQualityReinforcementMultiplier: 0,
  shortcutCountMultiplier: 0,
  straightnessBias: 0.88
};

const baseInput = (maze: LegacyMazeSnapshot) => ({
  averageFrameMs: 16,
  completedAt: '2026-11-15T12:00:00.000Z',
  completionTimeMs: 9_000,
  controlMode: 'arrows' as const,
  maze,
  playerPath: maze.solutionPath,
  resetUsed: false,
  surface: 'play' as const
});

const STAMP = { hazardScheduleVersion: 1, hazardDigest: 'fnv1a:0badc0de', exposureStage: 0 };

describe('maze cycle receipt hazard stamp (slice H3)', () => {
  test('layer off: no hazard key on the local receipt or the remote payload', () => {
    const maze = createLegacyRuntimeMazeForMode('play', 29, 7, corridorProfile);
    for (const hazard of [undefined, null]) {
      const receipt = createMazeCycleTelemetryReceipt({ ...baseInput(maze), hazard });
      expect(Object.keys(receipt).filter((key) => /hazard|exposure/i.test(key))).toEqual([]);
      expect(Object.keys(createRemoteCycleReceiptPayload(receipt)).filter((key) => /hazard|exposure/i.test(key))).toEqual([]);
    }
  });

  test('layer on: the stamp is on the receipt, survives storage normalisation, and reaches the remote jsonb', () => {
    const maze = createLegacyRuntimeMazeForMode('play', 29, 7, corridorProfile);
    const receipt = createMazeCycleTelemetryReceipt({ ...baseInput(maze), hazard: STAMP });
    expect(receipt).toMatchObject(STAMP);
    const storage = new MemoryStorage();
    recordMazeCycleTelemetryReceipt(storage, { ...baseInput(maze), hazard: STAMP });
    expect(storage.values.has(MAZE_CYCLE_TELEMETRY_STORAGE_KEY)).toBe(true);
    const stored = readMazeCycleTelemetryHistory(storage).receipts.at(-1);
    expect(stored).toMatchObject(STAMP);
    expect(createRemoteCycleReceiptPayload(receipt)).toMatchObject(STAMP);
  });

  test('a malformed stamp is dropped whole, never half-kept', () => {
    expect(resolveMazeCycleHazardReceiptFields(STAMP)).toEqual(STAMP);
    for (const bad of [
      { ...STAMP, hazardScheduleVersion: 0 },
      { ...STAMP, hazardScheduleVersion: 1.5 },
      { ...STAMP, hazardDigest: '' },
      { ...STAMP, hazardDigest: 'x'.repeat(129) },
      { ...STAMP, exposureStage: -1 },
      { hazardDigest: STAMP.hazardDigest },
      'stamp',
      null
    ]) {
      expect(resolveMazeCycleHazardReceiptFields(bad)).toEqual({});
    }
  });
});
