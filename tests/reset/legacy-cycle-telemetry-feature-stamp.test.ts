import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import type { LegacyMazeGenerationProfile, LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import {
  LEGACY_MAZE_FEATURE_REGISTRY_UNSTAMPED_VERSION,
  LEGACY_MAZE_FEATURE_REGISTRY_VERSION,
  MAZE_CYCLE_TELEMETRY_STORAGE_KEY,
  createMazeCycleTelemetryReceipt,
  readMazeCycleTelemetryHistory,
  recordMazeCycleTelemetryReceipt,
  summarizeMazeCycleTelemetryDiagnostics
} from '../../src/legacy-runtime/mazeCycleTelemetry';
import { resolveLegacyMazeActiveFeatureIds } from '../../src/legacy-runtime/legacyMazeFeatureRegistry';

class MemoryStorage {
  public values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
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

const baseInput = (maze: LegacyMazeSnapshot, surface: 'menu-demo' | 'play' = 'play') => ({
  averageFrameMs: 16,
  completedAt: '2026-11-05T12:00:00.000Z',
  completionTimeMs: 9_000,
  controlMode: 'arrows' as const,
  maze,
  playerPath: maze.solutionPath,
  resetUsed: false,
  surface
});

const recordStoredReceipt = () => {
  const storage = new MemoryStorage();
  const maze = createLegacyRuntimeMazeForMode('play', 29, 7, corridorProfile);
  const history = recordMazeCycleTelemetryReceipt(storage, baseInput(maze));
  return { history, storage };
};

describe('maze cycle telemetry feature-era stamp', () => {
  test('stamps the registry version and the active feature ids of a generated maze', () => {
    const maze = createLegacyRuntimeMazeForMode('play', 29, 7, corridorProfile);
    const receipt = createMazeCycleTelemetryReceipt(baseInput(maze));

    expect(receipt.featureRegistryVersion).toBe(LEGACY_MAZE_FEATURE_REGISTRY_VERSION);
    expect(receipt.activeFeatureIds).toEqual(resolveLegacyMazeActiveFeatureIds(corridorProfile, { mode: 'play' }));
    expect(receipt.activeFeatureIds).toContain('dead-end-cap');
    expect(receipt.activeFeatureIds).not.toContain('shortcut-bridges');
  });

  test('is stable across repeated receipts, completion times and surfaces for the same profile', () => {
    const playMaze = createLegacyRuntimeMazeForMode('play', 29, 7, corridorProfile);
    const menuMaze = createLegacyRuntimeMazeForMode('menu', 29, 7, corridorProfile);
    const first = createMazeCycleTelemetryReceipt(baseInput(playMaze));
    const later = createMazeCycleTelemetryReceipt({ ...baseInput(playMaze), completedAt: '2026-11-06T00:00:00.000Z' });
    const menu = createMazeCycleTelemetryReceipt(baseInput(menuMaze, 'menu-demo'));

    expect(later.activeFeatureIds).toEqual(first.activeFeatureIds);
    expect(later.featureRegistryVersion).toBe(first.featureRegistryVersion);
    expect(menu.activeFeatureIds).toEqual(first.activeFeatureIds);
  });

  test('uses a null id set for mazes with no generation profile (version still stamped)', () => {
    const maze: LegacyMazeSnapshot = {
      source: 'play-generated',
      width: 5,
      height: 5,
      grid: [
        [false, false, false, false, false],
        [false, true, true, true, false],
        [false, false, false, true, false],
        [false, false, false, true, false],
        [false, false, false, false, false]
      ],
      start: { x: 1, y: 1 },
      goal: { x: 3, y: 3 },
      solutionPath: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 2 },
        { x: 3, y: 3 }
      ],
      seed: 1
    };
    const receipt = createMazeCycleTelemetryReceipt(baseInput(maze));
    expect(receipt.featureRegistryVersion).toBe(LEGACY_MAZE_FEATURE_REGISTRY_VERSION);
    expect(receipt.activeFeatureIds).toBeNull();
  });

  test('persists through storage and surfaces in diagnostics without changing the storage version', () => {
    const { history, storage } = recordStoredReceipt();
    const reread = readMazeCycleTelemetryHistory(storage);

    expect(reread.receipts[0]?.featureRegistryVersion).toBe(LEGACY_MAZE_FEATURE_REGISTRY_VERSION);
    expect(reread.receipts[0]?.activeFeatureIds).toEqual(history.receipts[0]?.activeFeatureIds);
    const diagnostics = summarizeMazeCycleTelemetryDiagnostics(reread);
    expect(diagnostics.latestReceipt?.featureRegistryVersion).toBe(LEGACY_MAZE_FEATURE_REGISTRY_VERSION);
    expect(diagnostics.latestReceipt?.activeFeatureIds).toEqual(history.receipts[0]?.activeFeatureIds);
    expect(MAZE_CYCLE_TELEMETRY_STORAGE_KEY).toBe('mazer.cycle-telemetry.v1');
    expect(JSON.parse(storage.getItem(MAZE_CYCLE_TELEMETRY_STORAGE_KEY) ?? '{}').version).toBe(1);
  });

  test('classifies receipts stored before the registry as an explicit pre-registry era', () => {
    const { storage } = recordStoredReceipt();
    const stored = JSON.parse(storage.getItem(MAZE_CYCLE_TELEMETRY_STORAGE_KEY) ?? '{}');
    delete stored.receipts[0].featureRegistryVersion;
    delete stored.receipts[0].activeFeatureIds;
    storage.setItem(MAZE_CYCLE_TELEMETRY_STORAGE_KEY, JSON.stringify(stored));

    const legacy = readMazeCycleTelemetryHistory(storage).receipts[0];
    expect(legacy?.featureRegistryVersion).toBe(LEGACY_MAZE_FEATURE_REGISTRY_UNSTAMPED_VERSION);
    expect(legacy?.activeFeatureIds).toBeNull();
  });

  test('sanitizes malformed stored stamps', () => {
    const { storage } = recordStoredReceipt();
    const stored = JSON.parse(storage.getItem(MAZE_CYCLE_TELEMETRY_STORAGE_KEY) ?? '{}');
    stored.receipts[0].featureRegistryVersion = 'x'.repeat(500);
    stored.receipts[0].activeFeatureIds = ['corridor-layout', 'corridor-layout', 7, '', 'dead-end-cap'];
    storage.setItem(MAZE_CYCLE_TELEMETRY_STORAGE_KEY, JSON.stringify(stored));

    const receipt = readMazeCycleTelemetryHistory(storage).receipts[0];
    expect(receipt?.featureRegistryVersion).toBe(LEGACY_MAZE_FEATURE_REGISTRY_UNSTAMPED_VERSION);
    expect(receipt?.activeFeatureIds).toEqual(['corridor-layout', 'dead-end-cap']);
  });
});
