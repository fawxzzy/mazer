import type { RunProjection } from '../projections/runProjection.ts';
import type { TelemetryEvent, TelemetrySemanticSummary } from '../telemetry';
import type { HumanInputTimingSnapshot } from '../input-human';

export const MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY = '__MAZER_RUNTIME_DIAGNOSTICS__' as const;
export const MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-runtime-diagnostics' as const;

export type MenuScenePerformanceMode = 'full' | 'throttled' | 'hidden';

export interface MenuSceneRuntimeTuning {
  diagnosticsPublishIntervalMs: number;
  recentFrameWindow: number;
  heapSampleWindow: number;
  degradeAverageFrameMs: number;
  recoverAverageFrameMs: number;
  degradeSpikeCount: number;
  recoverSpikeCount: number;
  heapGrowthThrottleBytes: number;
  heapGrowthRecoverBytes: number;
  postHiddenRecoveryMs: number;
  spikeFrameMs: number;
  lowPowerHardwareConcurrencyMax: number;
  ambientUpdateIntervalMs: Record<MenuScenePerformanceMode, number>;
  deferredTasksPerFrame: Record<MenuScenePerformanceMode, number>;
}

export interface MenuSceneRuntimeConfig {
  enabled: boolean;
  lowPowerDetected: boolean;
  lowPowerForced: boolean;
  lowPowerActive: boolean;
  hardwareConcurrency: number | null;
  saveData: boolean;
}

export interface MenuSceneFrameWindowSummary {
  count: number;
  averageMs: number;
  worstMs: number;
  spikeCount: number;
  fps: number;
}

export interface MenuSceneRuntimeFeedEntrySnapshot {
  id: string;
  speaker: string;
  kind: string;
  importance: string;
  summary: string;
  slot: number;
}

export interface MenuSceneRuntimeFeedStatusSnapshot {
  speaker: string;
  kind: string;
  importance: string;
  summary: string;
}

export interface MenuSceneRuntimeFeedDiagnostics {
  step: number | null;
  signature: string;
  status: MenuSceneRuntimeFeedStatusSnapshot | null;
  visibleEntryCount: number;
  visibleEntries: MenuSceneRuntimeFeedEntrySnapshot[];
  changeCount: number;
  lastChangedAt: number | null;
}

export interface MenuSceneGenerationDrawStageProgress {
  complete: boolean | null;
  progressPercent: number | null;
  rowCount: number | null;
  rowsRemaining: number | null;
}

export interface MenuSceneRuntimeDiagnostics {
  revision: number;
  sceneInstanceId: number;
  updatedAt: number;
  runtimeMs: number;
  surface: {
    mode: 'menu' | 'play';
    overlay: string;
  };
  play?: {
    board: {
      bottom: number;
      left: number;
      right: number;
      top: number;
      size: number;
      tileSize: number;
    };
    inputBuffer: {
      held: {
        down: boolean;
        left: boolean;
        right: boolean;
        up: boolean;
      };
      pendingTimerActive: boolean;
      pointerStartActive: boolean;
      resolvedVector: {
        deltaX: number;
        deltaY: number;
      };
      simultaneousDelayMs: number;
    };
    player: {
      x: number;
      y: number;
      screenX: number;
      screenY: number;
    };
  };
  menuDemo?: {
    phase: string | null;
    cue: string | null;
    pathCursor: number | null;
    reachedGoal: boolean;
    prerollSteps: number;
    runnerMistakesEnabled: boolean | null;
    route?: {
      aiResetPathCursor: number | null;
      canonicalPathLength: number;
      cueCounts: Partial<Record<string, number>>;
      routeLength: number;
      segmentCount: number;
      trailModeCounts: Partial<Record<string, number>>;
      traverseMs: number;
    };
  };
  generation?: {
    maze?: {
      buildKind: 'menu-snapshot' | 'menu-generated' | 'play-generated' | null;
      source: 'menu-snapshot' | 'menu-generated' | 'play-generated';
      size: number;
      seed: number;
      solutionPathLength: number;
      shortcutStats?: {
        requested: number;
        attempts: number;
        created: number;
        wallArrayEntries: number;
        uniqueWallCandidates: number;
        exhaustedWallArray: boolean;
      };
      pathBuilderStats?: {
        acceptedCheckpoints: number;
        backtracks: number;
        longestPathLength: number;
        pathTiles: number;
        requestedCheckpoints: number;
        wallArrayEntries: number;
      };
      playableTopologyStats?: {
        disconnectedComponentsPruned: number;
        disconnectedFloorTilesPruned: number;
        goalRebasedToFarthestReachableFloor: boolean;
        reachableFloors: number;
        resolvedGoalDistance: number;
      };
      routeQualityStats?: {
        bypassableRouteBands: number;
        bypassableSolutionEdges: number;
        meaningfulBypassableRouteBands: number;
        meaningfulBypassableSolutionEdges: number;
        routeQuality: 'single-route' | 'multi-route';
        sampledSolutionEdges: number;
      };
    };
    drawStage?: {
      batchSize: number | null;
      batchUnit: string | null;
      complete: boolean | null;
      progressPercent: number | null;
      rowCount: number | null;
      rowsRemaining: number | null;
      rowsVisible: number | null;
      staged: boolean;
    };
    stageCursor: {
      completionSignal: string | null;
      currentStageId: number | null;
      phase: string | null;
      previousStageIds: number[];
      processComplete: boolean | null;
      remainingStageIds: number[];
    };
  };
  visibility: {
    hidden: boolean;
    changeCount: number;
    suspendCount: number;
  };
  performance: {
    mode: MenuScenePerformanceMode;
    averageFrameMs: number;
    recentAverageFrameMs: number;
    recentFrameCount: number;
    worstFrameMs: number;
    worstRecentFrameMs: number;
    spikeCount: number;
    recentSpikeCount: number;
    estimatedFps: number;
    lowPowerDetected: boolean;
    lowPowerForced: boolean;
    lowPowerActive: boolean;
    heapPressureActive: boolean;
    postHiddenRecoveryActive: boolean;
    hardwareConcurrency: number | null;
    saveData: boolean;
  };
  feed: MenuSceneRuntimeFeedDiagnostics;
  input: HumanInputTimingSnapshot & {
    queueDepth: number;
    maxQueueDepth: number;
  };
  projection: RunProjection | null;
  telemetry: {
    eventLogVersion: number;
    currentRunId: string | null;
    currentMazeId: string | null;
    currentAttemptNo: number | null;
    events: TelemetryEvent[];
    summary: TelemetrySemanticSummary;
  };
  resources: {
    activeTweens: number;
    activeTimers: number;
    listenerCount: number;
    listenerBreakdown: {
      sceneUpdate: number;
      sceneShutdown: number;
      scaleResize: number;
      visibilityAttached: boolean;
      legacyPlayFocusGuardAttached: boolean;
      installSurfaceAttached: boolean;
    };
    trailSegmentCount: number;
    trailSegmentCap: number;
    runnerPolicy: {
      wrongBranchCount: number;
      backtrackCount: number;
      recoveryCount: number;
    };
    intentEntryCount: number;
    intentEntryCap: number;
    deferredVisualTasksRemaining: number;
    deferredTasksPerFrameCap: number;
    background: {
      clouds: number;
      farStars: number;
      nearStars: number;
      twinkles: number;
      veils: number;
      driftMotes: number;
      moving: number;
      movingCap: number;
      signatureCap: number;
    };
    jsHeap?: {
      usedBytes: number;
      totalBytes?: number;
      limitBytes?: number;
    };
  };
}

declare global {
  interface Window {
    __MAZER_RUNTIME_DIAGNOSTICS__?: MenuSceneRuntimeDiagnostics;
    __MAZER_MENU_SCENE_INSTANCE__?: number;
  }
}

const TRUTHY_PARAM_VALUES = new Set(['1', 'true', 'yes', 'on']);

let fallbackSceneInstanceId = 0;

const resolveRuntimeWindow = (): Window | undefined => (
  typeof window === 'undefined' ? undefined : window
);

const resolveRuntimeDocument = (): Document | undefined => (
  typeof document === 'undefined' ? undefined : document
);

const normalizeFeedSummary = (value: string): string => value.trim().replace(/\s+/g, ' ');

const buildFeedSignature = (
  entries: readonly MenuSceneRuntimeFeedEntrySnapshot[]
): string => entries
  .map((entry) => [
    entry.speaker,
    entry.kind,
    entry.importance,
    normalizeFeedSummary(entry.summary),
    entry.slot
  ].join('|'))
  .join('||');

const isTruthyParam = (value: string | null | undefined): boolean => (
  value !== null && value !== undefined && TRUTHY_PARAM_VALUES.has(value.toLowerCase())
);

const toSearchParams = (search?: string | URLSearchParams): URLSearchParams => {
  if (search instanceof URLSearchParams) {
    return search;
  }

  if (typeof search !== 'string' || search.length === 0) {
    return new URLSearchParams();
  }

  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
};

export const resolveMenuSceneRuntimeConfig = (
  search?: string | URLSearchParams,
  options: {
    hardwareConcurrency?: number | null;
    saveData?: boolean | null;
    lowPowerHardwareConcurrencyMax?: number;
  } = {}
): MenuSceneRuntimeConfig => {
  const params = toSearchParams(search);
  const enabled = isTruthyParam(params.get('runtimeDiagnostics'))
    || isTruthyParam(params.get('runtime'))
    || isTruthyParam(params.get('soak'));
  const lowPowerForced = isTruthyParam(params.get('lowPower'))
    || (params.get('power') ?? '').toLowerCase() === 'low';
  const hardwareConcurrency = typeof options.hardwareConcurrency === 'number' && Number.isFinite(options.hardwareConcurrency)
    ? options.hardwareConcurrency
    : null;
  const saveData = options.saveData === true;
  const hardwareLimit = Math.max(1, Math.trunc(options.lowPowerHardwareConcurrencyMax ?? 4));
  const lowPowerDetected = saveData
    || (hardwareConcurrency !== null && hardwareConcurrency > 0 && hardwareConcurrency <= hardwareLimit);

  return {
    enabled,
    lowPowerDetected,
    lowPowerForced,
    lowPowerActive: lowPowerForced || lowPowerDetected,
    hardwareConcurrency,
    saveData
  };
};

export const resolveMenuScenePerformanceMode = (
  previousMode: MenuScenePerformanceMode,
  options: {
    hidden: boolean;
    lowPowerActive: boolean;
    recentAverageFrameMs: number;
    recentSpikeCount: number;
    heapPressureActive?: boolean;
    recoveryHoldActive?: boolean;
    tuning: Pick<
      MenuSceneRuntimeTuning,
      'degradeAverageFrameMs'
      | 'recoverAverageFrameMs'
      | 'degradeSpikeCount'
      | 'recoverSpikeCount'
    >;
  }
): MenuScenePerformanceMode => {
  if (options.hidden) {
    return 'hidden';
  }

  if (options.lowPowerActive) {
    return 'throttled';
  }

  if (options.heapPressureActive === true || options.recoveryHoldActive === true) {
    return 'throttled';
  }

  const recentAverageFrameMs = Number.isFinite(options.recentAverageFrameMs)
    ? options.recentAverageFrameMs
    : 0;
  const recentSpikeCount = Number.isFinite(options.recentSpikeCount)
    ? Math.max(0, Math.trunc(options.recentSpikeCount))
    : 0;

  if (previousMode === 'throttled') {
    return recentAverageFrameMs > options.tuning.recoverAverageFrameMs
      || recentSpikeCount > options.tuning.recoverSpikeCount
      ? 'throttled'
      : 'full';
  }

  return recentAverageFrameMs >= options.tuning.degradeAverageFrameMs
    || recentSpikeCount >= options.tuning.degradeSpikeCount
    ? 'throttled'
    : 'full';
};

export const summarizeMenuSceneFrameWindow = (
  frameTimesMs: readonly number[],
  spikeFrameMs: number
): MenuSceneFrameWindowSummary => {
  const count = frameTimesMs.length;
  if (count <= 0) {
    return {
      count: 0,
      averageMs: 0,
      worstMs: 0,
      spikeCount: 0,
      fps: 0
    };
  }

  let totalMs = 0;
  let worstMs = 0;
  let spikeCount = 0;

  for (const sample of frameTimesMs) {
    const safeSample = Number.isFinite(sample) ? Math.max(0, sample) : 0;
    totalMs += safeSample;
    worstMs = Math.max(worstMs, safeSample);
    if (safeSample >= spikeFrameMs) {
      spikeCount += 1;
    }
  }

  const averageMs = totalMs / count;
  return {
    count,
    averageMs: Number(averageMs.toFixed(3)),
    worstMs: Number(worstMs.toFixed(3)),
    spikeCount,
    fps: averageMs > 0 ? Number((1000 / averageMs).toFixed(2)) : 0
  };
};

export const summarizeMenuSceneRuntimeFeed = (options: {
  step?: number | null;
  status?: MenuSceneRuntimeFeedStatusSnapshot | null;
  visibleEntries?: readonly MenuSceneRuntimeFeedEntrySnapshot[] | null;
  previous?: MenuSceneRuntimeFeedDiagnostics | null;
  nowMs: number;
}): MenuSceneRuntimeFeedDiagnostics => {
  const status = options.status
    ? {
        ...options.status,
        summary: normalizeFeedSummary(options.status.summary)
      }
    : null;
  const visibleEntries = (options.visibleEntries ?? [])
    .slice()
    .sort((left, right) => left.slot - right.slot)
    .map((entry) => ({
      ...entry,
      summary: normalizeFeedSummary(entry.summary)
    }));
  const statusSignature = status
    ? [
        status.speaker,
        status.kind,
        status.importance,
        status.summary
      ].join('|')
    : '';
  const signature = [statusSignature, buildFeedSignature(visibleEntries)]
    .filter((value) => value.length > 0)
    .join('||');
  const previous = options.previous;
  const changed = signature !== (previous?.signature ?? '');

  return {
    step: Number.isFinite(options.step) ? Math.max(0, Math.trunc(options.step ?? 0)) : null,
    signature,
    status,
    visibleEntryCount: visibleEntries.length,
    visibleEntries,
    changeCount: (previous?.changeCount ?? 0) + (changed ? 1 : 0),
    lastChangedAt: changed ? Math.max(0, Math.round(options.nowMs)) : (previous?.lastChangedAt ?? null)
  };
};

export const resolveMenuSceneGenerationDrawStageProgress = (options: {
  rowCount?: number | null;
  rowsVisible?: number | null;
}): MenuSceneGenerationDrawStageProgress => {
  const rowCount = Number.isFinite(options.rowCount)
    ? Math.max(0, Math.trunc(options.rowCount ?? 0))
    : null;
  if (rowCount === null || rowCount <= 0 || !Number.isFinite(options.rowsVisible)) {
    return {
      complete: null,
      progressPercent: null,
      rowCount,
      rowsRemaining: null
    };
  }

  const rowsVisible = Math.min(rowCount, Math.max(0, Math.trunc(options.rowsVisible ?? 0)));
  const rowsRemaining = Math.max(0, rowCount - rowsVisible);

  return {
    complete: rowsRemaining === 0,
    progressPercent: Number(((rowsVisible / rowCount) * 100).toFixed(1)),
    rowCount,
    rowsRemaining
  };
};

export const nextMenuSceneInstanceId = (): number => {
  const runtime = resolveRuntimeWindow();
  if (!runtime) {
    fallbackSceneInstanceId += 1;
    return fallbackSceneInstanceId;
  }

  runtime.__MAZER_MENU_SCENE_INSTANCE__ = (runtime.__MAZER_MENU_SCENE_INSTANCE__ ?? 0) + 1;
  return runtime.__MAZER_MENU_SCENE_INSTANCE__;
};

export const parseMenuSceneRuntimeDiagnosticsAttribute = (
  value: string | null | undefined
): MenuSceneRuntimeDiagnostics | null => {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<MenuSceneRuntimeDiagnostics> | null;
    if (
      parsed
      && parsed.sceneInstanceId
      && parsed.performance
      && parsed.resources
    ) {
      return parsed as MenuSceneRuntimeDiagnostics;
    }
  } catch {
    return null;
  }

  return null;
};

const publishMenuSceneRuntimeDiagnosticsInstallSurface = (
  diagnostics?: MenuSceneRuntimeDiagnostics
): void => {
  const runtimeDocument = resolveRuntimeDocument();
  if (!runtimeDocument) {
    return;
  }

  if (!diagnostics) {
    runtimeDocument.documentElement.removeAttribute(MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE);
    return;
  }

  runtimeDocument.documentElement.setAttribute(
    MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE,
    JSON.stringify(diagnostics)
  );
};

export const publishMenuSceneRuntimeDiagnostics = (
  diagnostics?: MenuSceneRuntimeDiagnostics
): void => {
  const runtime = resolveRuntimeWindow();
  if (runtime) {
    if (!diagnostics) {
      delete runtime[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY];
    } else {
      runtime[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY] = diagnostics;
    }
  }
  publishMenuSceneRuntimeDiagnosticsInstallSurface(diagnostics);
};

export const clearMenuSceneRuntimeDiagnostics = (): void => {
  publishMenuSceneRuntimeDiagnostics();
};
