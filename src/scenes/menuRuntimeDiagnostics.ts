import type { RunProjection } from '../projections/runProjection.ts';
import type { TelemetryEvent, TelemetrySemanticSummary } from '../telemetry';
import type { HumanInputTimingSnapshot } from '../input-human';

export const MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY = '__MAZER_RUNTIME_DIAGNOSTICS__' as const;
export const MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-runtime-diagnostics' as const;
export const MENU_SCENE_RUNTIME_DIAGNOSTICS_SURFACE_ID = 'mazer-runtime-diagnostics' as const;

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

export interface MenuSceneRuntimeDiagnostics {
  revision: number;
  sceneInstanceId: number;
  updatedAt: number;
  runtimeMs: number;
  menuDemo?: {
    phase: string | null;
    cue: string | null;
    pathCursor: number | null;
    reachedGoal: boolean;
    prerollSteps: number;
    runnerMistakesEnabled: boolean | null;
  };
  generation?: {
    drawStage?: {
      batchSize: number | null;
      batchUnit: string | null;
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

const formatRuntimeMetric = (value: number, digits = 1): string => (
  Number.isFinite(value) ? Number(value).toFixed(digits) : 'n/a'
);

const resolveRuntimeViewportSize = (): { width: number; height: number } => {
  const runtime = resolveRuntimeWindow();
  const runtimeDocument = resolveRuntimeDocument();
  const documentWidth = Number(runtimeDocument?.documentElement?.clientWidth ?? 0);
  const documentHeight = Number(runtimeDocument?.documentElement?.clientHeight ?? 0);
  const windowWidth = Number(runtime?.innerWidth ?? 0);
  const windowHeight = Number(runtime?.innerHeight ?? 0);

  return {
    width: Math.max(0, Math.trunc(Number.isFinite(windowWidth) && windowWidth > 0 ? windowWidth : documentWidth)),
    height: Math.max(0, Math.trunc(Number.isFinite(windowHeight) && windowHeight > 0 ? windowHeight : documentHeight))
  };
};

export const resolveMenuSceneRuntimeDiagnosticsSurfaceCssText = (
  viewportWidth?: number | null,
  viewportHeight?: number | null
): string => {
  const width = Number.isFinite(viewportWidth) ? Math.max(0, Math.trunc(viewportWidth ?? 0)) : 0;
  const height = Number.isFinite(viewportHeight) ? Math.max(0, Math.trunc(viewportHeight ?? 0)) : 0;
  const useDesktopPlacement = width >= 960 && height >= 540;
  const desktopMaxWidth = Math.min(320, Math.max(220, Math.round(width * 0.24)));
  const compactFontSize = width > 0 && width < 460 ? 11 : 12;

  return [
    'position:fixed',
    useDesktopPlacement ? 'left:12px' : 'left:12px',
    useDesktopPlacement ? 'top:12px' : 'bottom:12px',
    useDesktopPlacement ? 'right:auto' : 'right:12px',
    useDesktopPlacement ? 'bottom:auto' : 'top:auto',
    'z-index:99999',
    'margin:0',
    'padding:8px 10px',
    'max-width:' + (useDesktopPlacement ? `${desktopMaxWidth}px` : 'calc(100vw - 24px)'),
    'overflow-wrap:anywhere',
    'border:1px solid rgba(222, 219, 230, 0.28)',
    'background:rgba(5, 5, 10, 0.72)',
    'color:#d7f0d6',
    `font:${compactFontSize}px/1.35 "Courier New", monospace`,
    'white-space:pre-wrap',
    'pointer-events:none',
    'border-radius:4px',
    'box-shadow:0 4px 16px rgba(0, 0, 0, 0.28)'
  ].join(';');
};

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

export const nextMenuSceneInstanceId = (): number => {
  const runtime = resolveRuntimeWindow();
  if (!runtime) {
    fallbackSceneInstanceId += 1;
    return fallbackSceneInstanceId;
  }

  runtime.__MAZER_MENU_SCENE_INSTANCE__ = (runtime.__MAZER_MENU_SCENE_INSTANCE__ ?? 0) + 1;
  return runtime.__MAZER_MENU_SCENE_INSTANCE__;
};

export const formatMenuSceneRuntimeDiagnosticsSurfaceText = (
  diagnostics: MenuSceneRuntimeDiagnostics
): string => [
  `diag s${diagnostics.sceneInstanceId} r${diagnostics.revision} perf:${diagnostics.performance.mode}`,
  `fps ${Math.round(diagnostics.performance.estimatedFps)} avg ${formatRuntimeMetric(diagnostics.performance.recentAverageFrameMs)}ms worst ${formatRuntimeMetric(diagnostics.performance.worstRecentFrameMs)}ms spikes ${diagnostics.performance.recentSpikeCount}`,
  `trail ${diagnostics.resources.trailSegmentCount}/${diagnostics.resources.trailSegmentCap} listeners ${diagnostics.resources.listenerCount} vis ${diagnostics.visibility.changeCount}/${diagnostics.visibility.suspendCount} low ${diagnostics.performance.lowPowerActive ? 'on' : 'off'}`,
  `demo ${diagnostics.menuDemo?.phase ?? 'none'} cue ${diagnostics.menuDemo?.cue ?? 'none'} mistakes ${diagnostics.menuDemo?.runnerMistakesEnabled === true ? 'on' : diagnostics.menuDemo?.runnerMistakesEnabled === false ? 'off' : 'n/a'} cursor ${diagnostics.menuDemo?.pathCursor ?? 'n/a'}`,
  `gen stage ${diagnostics.generation?.stageCursor.phase ?? 'none'}:${diagnostics.generation?.stageCursor.currentStageId ?? 'n/a'} signal ${diagnostics.generation?.stageCursor.completionSignal ?? 'n/a'} complete ${diagnostics.generation?.stageCursor.processComplete === true ? 'yes' : diagnostics.generation?.stageCursor.processComplete === false ? 'no' : 'n/a'}`,
  `draw rows ${diagnostics.generation?.drawStage?.rowsVisible ?? 'n/a'} batch ${diagnostics.generation?.drawStage?.batchSize ?? 'n/a'} ${diagnostics.generation?.drawStage?.batchUnit ?? 'n/a'} staged ${diagnostics.generation?.drawStage?.staged === true ? 'yes' : diagnostics.generation?.drawStage?.staged === false ? 'no' : 'n/a'}`
].join('\n');

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

const ensureMenuSceneRuntimeDiagnosticsSurface = (
  runtimeDocument: Document
): HTMLElement | null => {
  const viewport = resolveRuntimeViewportSize();
  const cssText = resolveMenuSceneRuntimeDiagnosticsSurfaceCssText(viewport.width, viewport.height);
  const existing = runtimeDocument.getElementById(MENU_SCENE_RUNTIME_DIAGNOSTICS_SURFACE_ID);
  if (
    existing
    && typeof (existing as Partial<HTMLElement>).textContent !== 'undefined'
    && typeof (existing as Partial<HTMLElement>).style !== 'undefined'
  ) {
    (existing as HTMLElement).style.cssText = cssText;
    return existing as HTMLElement;
  }

  if (!runtimeDocument.body) {
    return null;
  }

  const surface = runtimeDocument.createElement('pre');
  surface.id = MENU_SCENE_RUNTIME_DIAGNOSTICS_SURFACE_ID;
  surface.style.cssText = cssText;
  runtimeDocument.body.appendChild(surface);
  return surface;
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
    runtimeDocument.getElementById(MENU_SCENE_RUNTIME_DIAGNOSTICS_SURFACE_ID)?.remove();
    return;
  }

  runtimeDocument.documentElement.setAttribute(
    MENU_SCENE_RUNTIME_DIAGNOSTICS_ATTRIBUTE,
    JSON.stringify(diagnostics)
  );
  const surface = ensureMenuSceneRuntimeDiagnosticsSurface(runtimeDocument);
  if (!surface) {
    return;
  }

  surface.textContent = formatMenuSceneRuntimeDiagnosticsSurfaceText(diagnostics);
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
