import { copyFile, unlink, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { chromium } from 'playwright';
import {
  DEFAULT_BASE_URL,
  REPO_ROOT,
  STACK_ROOT,
  ensureDir,
  normalizeBaseUrl,
  parseCliArgs,
  parseIntegerArg,
  resolveSessionId
} from './common.mjs';
import { resolveLayoutMatrixRoute, resolveLayoutMatrixViewports } from './layout-matrix.config.mjs';
import { launchPreviewServer, stopPreviewServer } from './preview-server.mjs';
import {
  buildExperimentManifest,
  buildTelemetryReceipt,
  normalizeExperimentToggles,
  resolveExperimentVariantId
} from '../../src/telemetry/index.ts';
import { resolveTouchControlLayout } from '../../src/input-human/touch.ts';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH;

const EDGE_LIVE_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-edge-live');
const VISUAL_CAPTURE_KEY = '__MAZER_VISUAL_CAPTURE__';
const VISUAL_DIAGNOSTICS_KEY = '__MAZER_VISUAL_DIAGNOSTICS__';
const VISUAL_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-visual-diagnostics';
const RUNTIME_DIAGNOSTICS_KEY = '__MAZER_RUNTIME_DIAGNOSTICS__';
const RUNTIME_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-runtime-diagnostics';
const PROOF_SURFACE_SIGNAL_KEY = '__MAZER_PROOF_SURFACES__';
const DEFAULT_PRESET_GROUP = 'core';
const DEFAULT_HEADLESS = true;
const EDGE_LIVE_DEFAULT_CAPTURE_TIMEOUT_MS = 45_000;
const EDGE_LIVE_DEFAULT_PREVIEW_TIMEOUT_MS = 60_000;
const EDGE_LIVE_CAPTURE_RETRIES = 2;
const EDGE_LIVE_CAPTURE_RETRY_DELAY_MS = 1_000;
const EDGE_LIVE_END_WINDOW_POLL_MS = 80;
const CAPTURE_CONFIG = Object.freeze({
  enabled: true,
  forceInstallMode: 'available'
});
const PROOF_SURFACE_404_FAILURE_CODE = 'EDGE_LIVE_PROOF_404';
const INTERACTIVE_PLAY_FAILURE_CODE = 'EDGE_LIVE_PLAY_INTERACTION';
const INTERACTIVE_PLAY_MODE_RUN_ID = 'play-mode-interactive';
const MOBILE_TOUCH_SMOKE_RUN_ID = 'mobile-touch-smoke';
const EDGE_LIVE_SPECIAL_ROUTES = Object.freeze({
  'watch-play-shell': '/?content=core-only&mode=play&theme=aurora',
  'play-mode-smoke': '/?content=core-only&mode=play&theme=ember',
  'play-hud-trim': '/?content=core-only&mode=play&theme=aurora',
  'play-mode-interactive': '/?content=core-only&mode=play&theme=aurora',
  'mobile-touch-smoke': '/?content=core-only&mode=play&theme=aurora',
  'core-only-watch': '/?content=core-only&theme=aurora',
  'core-only-play': '/?content=core-only&mode=play&theme=aurora',
  'core-only-cycle': '/?content=core-only&theme=aurora',
  'core-only-watch-recovery': '/?content=core-only&theme=aurora&design=recovery',
  'core-only-play-recovery': '/?content=core-only&mode=play&theme=aurora&design=recovery'
});
const EDGE_LIVE_RUN_VIEWPORT_IDS = Object.freeze({
  'play-mode-interactive': ['desktop'],
  'mobile-touch-smoke': ['phone-portrait'],
  'core-only-watch': ['phone-portrait', 'desktop'],
  'core-only-play': ['phone-portrait', 'desktop'],
  'core-only-cycle': ['phone-portrait', 'desktop'],
  'core-only-watch-recovery': ['phone-portrait', 'desktop'],
  'core-only-play-recovery': ['phone-portrait', 'desktop']
});
const EDGE_LIVE_INTERACTION_RUNS = Object.freeze({
  'play-mode-interactive': Object.freeze({
    kind: 'keyboard',
    requiredMode: 'play',
    requiresControlEvents: false,
    movementWaitMs: 220,
    controlWaitMs: 180,
    restartWaitMs: 900,
    steps: [
      { id: 'move-1', kind: 'movement', candidates: ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'] },
      { id: 'move-2', kind: 'movement', candidates: ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'] },
      { id: 'pause', kind: 'control', key: 'p' },
      { id: 'resume', kind: 'control', key: 'p' },
      { id: 'toggle-thoughts', kind: 'control', key: 't' },
      { id: 'restart', kind: 'control', key: 'r' },
      { id: 'move-3', kind: 'movement', candidates: ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'], waitMs: 320 }
    ]
  }),
  'mobile-touch-smoke': Object.freeze({
    kind: 'touch',
    requiredMode: 'play',
    requiresControlEvents: false,
    movementWaitMs: 260,
    controlWaitMs: 850,
    restartWaitMs: 900,
    steps: [
      { id: 'move-1', kind: 'movement', candidates: ['move_up', 'move_right', 'move_down', 'move_left'] },
      { id: 'move-2', kind: 'movement', candidates: ['move_up', 'move_right', 'move_down', 'move_left'] },
      { id: 'pause', kind: 'control', control: 'pause' },
      { id: 'resume', kind: 'control', control: 'pause' },
      { id: 'toggle-thoughts', kind: 'control', control: 'toggle_thoughts' },
      { id: 'restart', kind: 'control', control: 'restart_attempt' },
      { id: 'move-3', kind: 'movement', candidates: ['move_up', 'move_right', 'move_down', 'move_left'], waitMs: 360 }
    ]
  })
});
const PROOF_SURFACE_WORKFLOWS = Object.freeze({
  'watch-pass-preview': Object.freeze({
    runId: 'watch-pass-preview',
    viewportIds: ['phone-portrait', 'desktop'],
    routes: [
      {
        id: 'watch-pass-ios-full',
        label: 'Watch Pass iOS full',
        route: '/watch-pass-preview.html?platform=ios&privacy=full&thoughtDensity=richer&pacingPreset=balanced'
      },
      {
        id: 'watch-pass-android-compact',
        label: 'Watch Pass Android compact',
        route: '/watch-pass-preview.html?platform=android&privacy=compact&thoughtDensity=sparse&pacingPreset=brisk'
      },
      {
        id: 'watch-pass-ios-private',
        label: 'Watch Pass iOS private',
        route: '/watch-pass-preview.html?platform=ios&privacy=private&reducedMotion=true&thoughtDensity=sparse&pacingPreset=calm'
      },
      {
        id: 'watch-pass-paywall-yearly',
        label: 'Watch Pass paywall yearly',
        route: '/watch-pass-paywall.html?platform=ios&privacy=compact&thoughtDensity=richer&pacingPreset=balanced&plan=yearly&entryPoint=watch-pass-preview&sourceCta=Watch%20Pass%20preview'
      }
    ]
  }),
  'watch-pass-setup': Object.freeze({
    runId: 'watch-pass-setup',
    viewportIds: ['phone-portrait', 'desktop'],
    routes: [
      {
        id: 'watch-pass-setup-snapshot',
        label: 'Watch Pass setup snapshot',
        route: '/watch-pass-setup.html?surface=snapshot-card&platformFrame=ios-like&privacy=full&thoughtDensity=richer&pacingPreset=balanced'
      },
      {
        id: 'watch-pass-setup-active-private',
        label: 'Watch Pass setup active private',
        route: '/watch-pass-setup.html?surface=active-run-tracker&platformFrame=ios-like&privacy=private&reducedMotion=true&thoughtDensity=sparse&pacingPreset=calm'
      },
      {
        id: 'watch-pass-setup-ambient-compact',
        label: 'Watch Pass setup ambient compact',
        route: '/watch-pass-setup.html?surface=ambient-tile&platformFrame=android-like&privacy=compact&thoughtDensity=sparse&pacingPreset=brisk'
      }
    ]
  }),
  'projection-proof-shell': Object.freeze({
    runId: 'projection-proof-shell',
    viewportIds: ['phone-portrait', 'desktop'],
    routes: [
      {
        id: 'shell-ios',
        label: 'Proof shell iOS',
        route: '/proof-surfaces.html?surface=all&fixture=watching&skin=ios&mode=all'
      },
      {
        id: 'shell-android',
        label: 'Proof shell Android',
        route: '/proof-surfaces.html?surface=all&fixture=watching&skin=android&mode=all'
      }
    ]
  }),
  'projection-proof-snapshot': Object.freeze({
    runId: 'projection-proof-snapshot',
    viewportIds: ['phone-portrait', 'desktop'],
    routes: [
      {
        id: 'snapshot-watching',
        label: 'Snapshot card watching',
        route: '/proof-surfaces.html?surface=snapshot-card&fixture=watching&skin=ios&mode=all'
      }
    ]
  }),
  'projection-proof-active': Object.freeze({
    runId: 'projection-proof-active',
    viewportIds: ['phone-portrait', 'desktop'],
    routes: [
      {
        id: 'active-building',
        label: 'Active tracker building',
        route: '/proof-surfaces.html?surface=active-run-tracker&fixture=building&skin=ios&mode=all'
      },
      {
        id: 'active-watching',
        label: 'Active tracker watching',
        route: '/proof-surfaces.html?surface=active-run-tracker&fixture=watching&skin=ios&mode=all'
      },
      {
        id: 'active-failed',
        label: 'Active tracker failed',
        route: '/proof-surfaces.html?surface=active-run-tracker&fixture=failed&skin=ios&mode=all'
      }
    ]
  }),
  'projection-proof-ambient': Object.freeze({
    runId: 'projection-proof-ambient',
    viewportIds: ['phone-portrait', 'desktop'],
    routes: [
      {
        id: 'ambient-waiting',
        label: 'Ambient tile waiting',
        route: '/proof-surfaces.html?surface=ambient-tile&fixture=waiting&skin=android&mode=all'
      }
    ]
  })
});

const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const normalizeTelemetryMode = (value) => (
  value === 'watch' || value === 'play' ? value : null
);

const buildWatchPassFunnelLines = (receipt) => [
  `- Mode: ${receipt?.mode ?? 'n/a'}`,
  `- Source CTA: ${receipt?.sourceCta ?? 'n/a'}`,
  `- Paywall views: ${receipt?.kpis?.paywallViewCount ?? 0}`,
  `- Plan selects: ${receipt?.kpis?.planSelectedCount ?? 0}`,
  `- Paywall -> plan select: ${receipt?.kpis?.paywall_view_to_plan_select ?? 'n/a'}`,
  `- Paywall -> purchase completed: ${receipt?.kpis?.paywall_view_to_purchase_completed ?? 'n/a'}`,
  `- Purchase completed: ${receipt?.kpis?.purchaseCompletedCount ?? 0}`,
  `- Widget attach rate: ${receipt?.kpis?.widget_attach_rate ?? 0}`,
  `- Live activity start rate: ${receipt?.kpis?.live_activity_start_rate ?? 0}`,
  `- Reduced motion adoption: ${receipt?.kpis?.reduced_motion_adoption ?? 0}`,
  `- Private mode adoption: ${receipt?.kpis?.private_mode_adoption ?? 0}`
];

const normalizeTelemetryEventKey = (event) => (
  event?.eventId
  ?? [
    event?.kind ?? '',
    event?.runId ?? '',
    event?.mazeId ?? '',
    event?.attemptNo ?? '',
    event?.elapsedMs ?? '',
    event?.createdAt ?? ''
  ].join('|')
);

const resolveTelemetryModeFromCaptures = (captures) => {
  for (const capture of captures) {
    const candidates = [
      capture?.telemetry?.mode,
      capture?.firstLoad?.telemetry?.mode,
      capture?.secondLoad?.telemetry?.mode,
      capture?.lifecycle?.telemetry?.mode
    ];

    for (const candidate of candidates) {
      const normalized = normalizeTelemetryMode(candidate);
      if (normalized) {
        return normalized;
      }
    }

    const url = typeof capture?.url === 'string' && capture.url.length > 0
      ? new URL(capture.url)
      : null;
    const normalizedUrlMode = normalizeTelemetryMode(url?.searchParams.get('mode'));
    if (normalizedUrlMode) {
      return normalizedUrlMode;
    }
  }

  return null;
};

const relativeToRun = (runDir, filePath) => relative(runDir, filePath).replace(/\\/g, '/');

const normalizeRoute = (value) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return '/';
  }

  const trimmed = value.trim();
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const resolveInteractiveProjectionMode = (projection) => (
  projection?.mode === 'play' || projection?.mode === 'watch'
    ? projection.mode
    : null
);

const resolveInteractiveSurfaceMode = (surface) => (
  surface?.mode === 'play' || surface?.mode === 'menu'
    ? surface.mode
    : null
);

const EXPECTED_PLAY_MARKER_STYLE = Object.freeze({
  goalCoreColor: 0xff263f,
  goalEdgeColor: 0xd81b2a,
  playerCoreColor: 0x36ff7d,
  playerHaloColor: 0x00b84a
});

const isFiniteRect = (rect) => (
  rect
  && Number.isFinite(rect.left)
  && Number.isFinite(rect.top)
  && Number.isFinite(rect.right)
  && Number.isFinite(rect.bottom)
  && Number.isFinite(rect.width)
  && Number.isFinite(rect.height)
);

export const summarizeEdgeLiveInteractiveState = (diagnostics) => {
  const runtime = diagnostics?.runtime ?? null;
  const visual = diagnostics?.visual ?? null;
  const visualRuntime = visual?.runtime ?? null;
  const markerStyle = visual?.markerStyle ?? runtime?.play?.markerStyle ?? null;
  const surface = runtime?.surface ?? (
    visualRuntime
      ? {
          mode: visualRuntime.mode ?? null,
          overlay: visualRuntime.overlay ?? null
        }
      : null
  );
  const player = runtime?.play?.player ?? visualRuntime?.player ?? runtime?.player ?? null;
  const telemetrySummary = runtime?.telemetry?.summary ?? null;
  const telemetryEvents = Array.isArray(runtime?.telemetry?.events) ? runtime.telemetry.events : [];
  const projection = runtime?.projection ?? null;
  const feed = runtime?.feed ?? null;
  const playMetrics = telemetrySummary?.playMetrics ?? null;
  const goal = runtime?.play?.goal ?? visualRuntime?.goal ?? runtime?.goal ?? null;
  const playBoard = runtime?.play?.board ?? null;
  const resolveScreenCoordinate = (point, axis) => {
    const screenKey = axis === 'x' ? 'screenX' : 'screenY';
    if (Number.isFinite(point?.[screenKey])) {
      return point[screenKey];
    }

    const boardOrigin = axis === 'x'
      ? playBoard?.left ?? visual?.board?.bounds?.left ?? null
      : playBoard?.top ?? visual?.board?.bounds?.top ?? null;
    const tileSize = playBoard?.tileSize ?? visual?.board?.tileSize ?? null;
    if (!Number.isFinite(point?.[axis]) || !Number.isFinite(boardOrigin) || !Number.isFinite(tileSize)) {
      return null;
    }

    return boardOrigin + ((point[axis] + 0.5) * tileSize);
  };
  const controlUsedCount = Math.max(
    telemetrySummary?.eventCounts?.control_used ?? 0,
    telemetryEvents.filter((event) => event?.kind === 'control_used').length
  );

  return {
    mode: (
      resolveInteractiveProjectionMode(projection)
      ?? resolveInteractiveSurfaceMode(surface)
      ?? resolveTelemetryModeFromCaptures([{ telemetry: { mode: telemetrySummary?.mode ?? null } }])
      ?? null
    ),
    overlay: surface?.overlay ?? null,
    controlUsedCount,
    projection: projection
      ? {
          mode: resolveInteractiveProjectionMode(projection),
          state: projection.state ?? null,
          progressPct: projection.progressPct ?? null,
          riskLevel: projection.riskLevel ?? null,
          miniMapHash: projection.miniMapHash ?? null,
          elapsedMs: projection.elapsedMs ?? null
        }
      : null,
    feed: feed
      ? {
          signature: feed.signature ?? null,
          step: feed.step ?? null,
          changeCount: feed.changeCount ?? null,
          visibleEntryCount: feed.visibleEntryCount ?? null
        }
      : null,
    playBoard: playBoard
      ? {
          left: playBoard.left ?? null,
          top: playBoard.top ?? null,
          tileSize: playBoard.tileSize ?? null
        }
      : null,
    input: runtime?.input
      ? {
          acceptedCount: runtime.input.acceptedCount ?? 0,
          droppedCount: runtime.input.droppedCount ?? 0,
          mergedCount: runtime.input.mergedCount ?? 0,
          queueDepth: runtime.input.queueDepth ?? 0,
          maxQueueDepth: runtime.input.maxQueueDepth ?? 0,
          lastDroppedReason: runtime.input.lastDroppedReason ?? null
        }
      : null,
    hud: visual?.intentFeed
      ? {
          visible: visual.intentFeed.visible ?? null,
          compact: visual.intentFeed.compact ?? null,
          statusVisible: visual.intentFeed.statusVisible ?? null,
          statusText: visual.intentFeed.statusText ?? null,
          quickThoughtCount: visual.intentFeed.quickThoughtCount ?? null,
          onboardingVisible: visual.intentFeed.onboardingVisible ?? null,
          onboardingLabel: visual.intentFeed.onboardingLabel ?? null,
          riskVisible: visual.intentFeed.riskVisible ?? null,
          nextRiskLabel: visual.intentFeed.nextRiskLabel ?? null
        }
      : null,
    controlUsedBreakdown: playMetrics?.controlUsedByControl ?? null,
    controlActionBreakdown: playMetrics?.controlUsedByAction ?? null,
    watchToPlaySwitchCount: playMetrics?.watchToPlaySwitchCount ?? 0,
    failToRetryContinuation: telemetrySummary?.failToRetryContinuation ?? null,
    resources: runtime?.resources
      ? {
          trailSegmentCap: runtime.resources.trailSegmentCap ?? null,
          trailSegmentCount: runtime.resources.trailSegmentCount ?? null
        }
      : visualRuntime
        ? {
            trailSegmentCap: null,
            trailSegmentCount: visualRuntime.trailLength ?? null
          }
        : null,
    markerStyle: markerStyle
      ? {
          goalCoreColor: markerStyle.goalCoreColor ?? null,
          goalEdgeColor: markerStyle.goalEdgeColor ?? null,
          playerCoreColor: markerStyle.playerCoreColor ?? null,
          playerCoreRadius: markerStyle.playerCoreRadius ?? null,
          playerHaloColor: markerStyle.playerHaloColor ?? null,
          playerHaloRadius: markerStyle.playerHaloRadius ?? null
        }
      : null,
    trail: visual?.trail
      ? {
          currentIndex: visual.trail.currentIndex ?? null,
          nextIndex: visual.trail.nextIndex ?? null,
          progress: visual.trail.progress ?? null,
          cue: visual.trail.cue ?? null
        }
      : null,
    player: player
      ? {
          x: Number.isFinite(player.x) ? player.x : null,
          y: Number.isFinite(player.y) ? player.y : null,
          screenX: resolveScreenCoordinate(player, 'x'),
          screenY: resolveScreenCoordinate(player, 'y')
        }
      : null,
    goal: goal
      ? {
          x: Number.isFinite(goal.x) ? goal.x : null,
          y: Number.isFinite(goal.y) ? goal.y : null,
          screenX: resolveScreenCoordinate(goal, 'x'),
          screenY: resolveScreenCoordinate(goal, 'y')
        }
      : null
  };
};

const MOVEMENT_KEY_TO_TOUCH_CONTROL = Object.freeze({
  ArrowUp: 'move_up',
  ArrowDown: 'move_down',
  ArrowLeft: 'move_left',
  ArrowRight: 'move_right'
});

export const resolvePlayModeMovementKeyFromTrail = (trail, rasterWidth = null) => {
  const currentIndex = Number.isFinite(trail?.currentIndex) ? Math.max(0, Math.trunc(trail.currentIndex)) : null;
  const nextIndex = Number.isFinite(trail?.nextIndex) ? Math.max(0, Math.trunc(trail.nextIndex)) : null;
  const width = Number.isFinite(rasterWidth) ? Math.max(1, Math.trunc(rasterWidth)) : null;
  if (currentIndex === null || nextIndex === null || currentIndex === nextIndex) {
    return null;
  }

  const delta = nextIndex - currentIndex;
  if (delta === 1) {
    return 'ArrowRight';
  }
  if (delta === -1) {
    return 'ArrowLeft';
  }

  if (width !== null) {
    if (delta === width) {
      return 'ArrowDown';
    }
    if (delta === -width) {
      return 'ArrowUp';
    }
  }

  if (delta > 0) {
    return 'ArrowDown';
  }
  if (delta < 0) {
    return 'ArrowUp';
  }

  return null;
};

const buildInteractiveStateSignature = (state) => JSON.stringify(state ?? null);

const hasInteractiveStateDelta = (before, after) => buildInteractiveStateSignature(before) !== buildInteractiveStateSignature(after);

export const resolveRestartTrailResetVerdict = (timeline) => {
  const restartStep = Array.isArray(timeline)
    ? timeline.find((step) => step?.id === 'restart')
    : null;
  const beforeCount = restartStep?.before?.resources?.trailSegmentCount ?? null;
  const afterCount = restartStep?.after?.resources?.trailSegmentCount ?? null;
  const pass = Number.isFinite(afterCount) && afterCount <= 1;

  return {
    pass,
    beforeTrailSegmentCount: Number.isFinite(beforeCount) ? beforeCount : null,
    afterTrailSegmentCount: Number.isFinite(afterCount) ? afterCount : null
  };
};

export const resolvePlayMarkerStyleVerdict = (state) => {
  const style = state?.markerStyle ?? null;
  const tileSize = state?.playBoard?.tileSize ?? null;
  const colorMatches = Boolean(style)
    && style.goalCoreColor === EXPECTED_PLAY_MARKER_STYLE.goalCoreColor
    && style.goalEdgeColor === EXPECTED_PLAY_MARKER_STYLE.goalEdgeColor
    && style.playerCoreColor === EXPECTED_PLAY_MARKER_STYLE.playerCoreColor
    && style.playerHaloColor === EXPECTED_PLAY_MARKER_STYLE.playerHaloColor;
  const radiusFitsTile = Boolean(style)
    && Number.isFinite(style.playerHaloRadius)
    && style.playerHaloRadius > 0
    && (
      !Number.isFinite(tileSize)
      || (style.playerHaloRadius * 2) <= (tileSize + 0.01)
    );

  return {
    pass: colorMatches && radiusFitsTile,
    colorMatches,
    radiusFitsTile,
    expected: EXPECTED_PLAY_MARKER_STYLE,
    observed: style
      ? {
          goalCoreColor: style.goalCoreColor ?? null,
          goalEdgeColor: style.goalEdgeColor ?? null,
          playerCoreColor: style.playerCoreColor ?? null,
          playerHaloColor: style.playerHaloColor ?? null,
          playerHaloRadius: style.playerHaloRadius ?? null,
          tileSize: Number.isFinite(tileSize) ? tileSize : null
        }
      : null
  };
};

const parsePngRgba = (pngBytes) => {
  const bytes = Buffer.from(pngBytes);
  const signature = '89504e470d0a1a0a';
  if (bytes.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('Marker pixel proof expected a PNG screenshot.');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Marker pixel proof only supports 8-bit RGB/RGBA PNG screenshots; received bitDepth=${bitDepth}, colorType=${colorType}.`);
  }

  const sourceChannels = colorType === 6 ? 4 : 3;
  const stride = width * sourceChannels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rgba = new Uint8ClampedArray(width * height * 4);
  let sourceOffset = 0;
  let previous = new Uint8Array(stride);

  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const current = Uint8Array.from(inflated.subarray(sourceOffset, sourceOffset + stride));
    sourceOffset += stride;

    for (let index = 0; index < stride; index += 1) {
      const left = index >= sourceChannels ? current[index - sourceChannels] : 0;
      const up = previous[index] ?? 0;
      const upLeft = index >= sourceChannels ? previous[index - sourceChannels] ?? 0 : 0;
      if (filter === 1) {
        current[index] = (current[index] + left) & 0xff;
      } else if (filter === 2) {
        current[index] = (current[index] + up) & 0xff;
      } else if (filter === 3) {
        current[index] = (current[index] + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const paeth = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        current[index] = (current[index] + paeth) & 0xff;
      } else if (filter !== 0) {
        throw new Error(`Marker pixel proof received unsupported PNG filter ${filter}.`);
      }
    }

    for (let x = 0; x < width; x += 1) {
      const sourceIndex = x * sourceChannels;
      const targetIndex = ((row * width) + x) * 4;
      rgba[targetIndex] = current[sourceIndex];
      rgba[targetIndex + 1] = current[sourceIndex + 1];
      rgba[targetIndex + 2] = current[sourceIndex + 2];
      rgba[targetIndex + 3] = sourceChannels === 4 ? current[sourceIndex + 3] : 255;
    }

    previous = current;
  }

  return {
    width,
    height,
    rgba
  };
};

export const sampleScreenshotMarkerPixels = async (page, state) => {
  const screenshot = await page.screenshot({
    fullPage: false,
    animations: 'disabled'
  });
  const image = parsePngRgba(screenshot);
  const player = state?.player ?? null;
  const goal = state?.goal ?? null;
  const sampleRadius = Math.max(1, Math.ceil((state?.markerStyle?.playerHaloRadius ?? 2) + 1));
  const samplePoint = (point, classifier) => {
    if (!Number.isFinite(point?.screenX) || !Number.isFinite(point?.screenY)) {
      return {
        pass: false,
        reason: 'missing-point',
        matchCount: 0,
        sampledCount: 0
      };
    }

    const centerX = Math.round(point.screenX);
    const centerY = Math.round(point.screenY);
    let matchCount = 0;
    let sampledCount = 0;
    const colorCounts = new Map();
    for (let y = centerY - sampleRadius; y <= centerY + sampleRadius; y += 1) {
      for (let x = centerX - sampleRadius; x <= centerX + sampleRadius; x += 1) {
        if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
          continue;
        }
        const pixelIndex = ((y * image.width) + x) * 4;
        const red = image.rgba[pixelIndex];
        const green = image.rgba[pixelIndex + 1];
        const blue = image.rgba[pixelIndex + 2];
        const alpha = image.rgba[pixelIndex + 3];
        if (alpha > 0) {
          sampledCount += 1;
          const colorKey = `${red},${green},${blue},${alpha}`;
          colorCounts.set(colorKey, (colorCounts.get(colorKey) ?? 0) + 1);
          if (classifier(red, green, blue, alpha)) {
            matchCount += 1;
          }
        }
      }
    }

    return {
      pass: matchCount >= 3,
      centerX,
      centerY,
      matchCount,
      sampledCount,
      topColors: [...colorCounts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 6)
        .map(([rgba, count]) => ({ rgba, count }))
    };
  };

  const playerSample = samplePoint(player, (red, green, blue) => green >= 170 && red <= 120 && blue >= 70);
  const goalSample = samplePoint(goal, (red, green, blue) => red >= 180 && green <= 120 && blue <= 140);

  return {
    pass: playerSample.pass && goalSample.pass,
    reason: playerSample.pass && goalSample.pass ? null : 'marker-pixel-mismatch',
    player: playerSample,
    goal: goalSample
  };
};

const buildMovementDelta = (before, after) => {
  const beforeTrail = before?.trail ?? null;
  const afterTrail = after?.trail ?? null;
  const currentIndexDelta = Number.isFinite(afterTrail?.currentIndex) && Number.isFinite(beforeTrail?.currentIndex)
    ? afterTrail.currentIndex - beforeTrail.currentIndex
    : null;
  const nextIndexDelta = Number.isFinite(afterTrail?.nextIndex) && Number.isFinite(beforeTrail?.nextIndex)
    ? afterTrail.nextIndex - beforeTrail.nextIndex
    : null;
  const progressDelta = Number.isFinite(afterTrail?.progress) && Number.isFinite(beforeTrail?.progress)
    ? round(afterTrail.progress - beforeTrail.progress, 3)
    : null;
  const playerXDelta = Number.isFinite(after?.player?.x) && Number.isFinite(before?.player?.x)
    ? after.player.x - before.player.x
    : null;
  const playerYDelta = Number.isFinite(after?.player?.y) && Number.isFinite(before?.player?.y)
    ? after.player.y - before.player.y
    : null;

  return {
    currentIndexDelta,
    nextIndexDelta,
    playerXDelta,
    playerYDelta,
    progressDelta,
    moved: Boolean(
      (currentIndexDelta ?? 0) !== 0
      || (nextIndexDelta ?? 0) !== 0
      || (playerXDelta ?? 0) !== 0
      || (playerYDelta ?? 0) !== 0
      || (progressDelta ?? 0) !== 0
    )
  };
};

export const resolvePreferredMovementCandidate = (state, interaction, candidates) => {
  const preferredKey = resolvePlayModeMovementKeyFromTrail(state?.trail ?? null);
  if (!preferredKey) {
    return null;
  }

  const preferredCandidate = interaction.kind === 'touch'
    ? MOVEMENT_KEY_TO_TOUCH_CONTROL[preferredKey] ?? null
    : preferredKey;

  return preferredCandidate && candidates.includes(preferredCandidate)
    ? preferredCandidate
    : null;
};

export const prioritizeMovementCandidates = (state, interaction, candidates) => {
  const preferredCandidate = resolvePreferredMovementCandidate(state, interaction, candidates);
  if (!preferredCandidate) {
    return [...candidates];
  }

  return [
    preferredCandidate,
    ...candidates.filter((candidate) => candidate !== preferredCandidate)
  ];
};

const resolveEdgeLiveInteraction = (runId) => (
  typeof runId === 'string' ? EDGE_LIVE_INTERACTION_RUNS[runId] ?? null : null
);

const EDGE_LIVE_RUN_TIMEOUTS_MS = Object.freeze({
  'core-only-watch': 120_000,
  'core-only-play': 60_000,
  'core-only-cycle': 180_000,
  'core-only-watch-recovery': 120_000,
  'core-only-play-recovery': 60_000
});
const EDGE_LIVE_END_WINDOW_RUNS = new Set(['core-only-watch', 'core-only-cycle', 'core-only-watch-recovery']);

export const resolveEdgeLiveTimeoutMs = (runId, defaultTimeoutMs = EDGE_LIVE_DEFAULT_CAPTURE_TIMEOUT_MS) => (
  typeof runId === 'string' && Number.isFinite(EDGE_LIVE_RUN_TIMEOUTS_MS[runId])
    ? EDGE_LIVE_RUN_TIMEOUTS_MS[runId]
    : defaultTimeoutMs
);

export const resolveEdgeLiveViewports = (presetGroup, runId) => {
  const viewports = resolveLayoutMatrixViewports(presetGroup);
  const allowedViewportIds = typeof runId === 'string' ? EDGE_LIVE_RUN_VIEWPORT_IDS[runId] : null;
  if (!Array.isArray(allowedViewportIds) || allowedViewportIds.length === 0) {
    return viewports;
  }

  const allowedSet = new Set(allowedViewportIds);
  return viewports.filter((viewport) => allowedSet.has(viewport.id));
};

const resolveTouchControlPoint = ({ viewport, diagnostics, control }) => {
  const safeInsets = diagnostics?.visual?.viewport?.safeInsets ?? {};
  const layout = resolveTouchControlLayout({
    width: viewport.width,
    height: viewport.height
  }, {
    safeInsets,
    compact: viewport.width < 720 || viewport.height < 720
  });
  const rect = layout.controls[control];

  return rect
    ? { x: rect.centerX, y: rect.centerY }
    : null;
};

const TOUCH_MOVEMENT_CONTROLS = new Set(['move_up', 'move_right', 'move_down', 'move_left']);

const resolveTouchMovementSwipe = ({ diagnostics, control }) => {
  if (!TOUCH_MOVEMENT_CONTROLS.has(control)) {
    return null;
  }

  const player = diagnostics?.runtime?.play?.player ?? null;
  const board = diagnostics?.runtime?.play?.board ?? null;
  if (
    !Number.isFinite(player?.screenX)
    || !Number.isFinite(player?.screenY)
    || !Number.isFinite(board?.left)
    || !Number.isFinite(board?.right)
    || !Number.isFinite(board?.top)
    || !Number.isFinite(board?.bottom)
  ) {
    return null;
  }

  const distance = Math.max(18, Math.round((board.tileSize ?? 8) * 1.8));
  const deltaByControl = {
    move_up: { x: 0, y: -distance },
    move_right: { x: distance, y: 0 },
    move_down: { x: 0, y: distance },
    move_left: { x: -distance, y: 0 }
  };
  const delta = deltaByControl[control];
  return {
    start: {
      x: Math.min(board.right - 1, Math.max(board.left + 1, player.screenX)),
      y: Math.min(board.bottom - 1, Math.max(board.top + 1, player.screenY))
    },
    end: {
      x: Math.min(board.right - 1, Math.max(board.left + 1, player.screenX + delta.x)),
      y: Math.min(board.bottom - 1, Math.max(board.top + 1, player.screenY + delta.y))
    }
  };
};

const runEdgeLiveInteraction = async ({
  page,
  viewport,
  timeoutMs,
  interaction
}) => {
  const waitAfterInput = async (ms, options = {}) => {
    await page.waitForTimeout(Math.max(0, Math.round(ms)));
    try {
      return await waitForDiagnostics(page, Math.max(2_000, Math.round(timeoutMs / 3)), options);
    } catch {
      return readDiagnostics(page);
    }
  };

  const triggerKeyboardStep = async (key, options = {}) => {
    const holdMs = Math.max(0, Math.round(options.holdMs ?? 0));
    if (holdMs <= 0) {
      await page.keyboard.press(key);
      return;
    }

    await page.keyboard.down(key);
    try {
      await page.waitForTimeout(holdMs);
    } finally {
      await page.keyboard.up(key);
    }
  };

  const waitForMovementReady = async () => {
    await page.waitForFunction(
      ({ runtimeKey, runtimeAttribute, requiredMode }) => {
        const runtime = window[runtimeKey] ?? (() => {
          const serialized = document.documentElement.getAttribute(runtimeAttribute);
          if (typeof serialized !== 'string' || serialized.length === 0) {
            return null;
          }

          try {
            const parsed = JSON.parse(serialized);
            return (
              parsed
              && parsed.sceneInstanceId
              && parsed.performance
              && parsed.resources
            ) ? parsed : null;
          } catch {
            return null;
          }
        })();
        const projection = runtime?.projection ?? null;
        const projectionReady = projection?.mode === requiredMode && projection?.state === 'watching';
        const surfaceReady = runtime?.surface?.mode === requiredMode;
        return projectionReady || surfaceReady;
      },
      {
        runtimeKey: RUNTIME_DIAGNOSTICS_KEY,
        runtimeAttribute: RUNTIME_DIAGNOSTICS_ATTRIBUTE,
        requiredMode: interaction.requiredMode ?? 'play'
      },
      { timeout: Math.max(5_000, Math.round(timeoutMs * 0.8)) }
    );
    return readDiagnostics(page);
  };

  const triggerTouchStep = async (diagnostics, control) => {
    const swipe = resolveTouchMovementSwipe({ diagnostics, control });
    if (swipe) {
      await page.mouse.move(swipe.start.x, swipe.start.y);
      await page.mouse.down();
      await page.mouse.move(swipe.end.x, swipe.end.y, { steps: 4 });
      await page.mouse.up();
      return;
    }

    const point = resolveTouchControlPoint({ viewport, diagnostics, control });
    if (!point) {
      const error = new Error(`Interactive touch workflow could not resolve ${control} touch coordinates on ${viewport.id}.`);
      error.code = INTERACTIVE_PLAY_FAILURE_CODE;
      error.failureStage = 'touch-layout';
      error.control = control;
      throw error;
    }

    await page.touchscreen.tap(point.x, point.y);
  };

  if (interaction.kind === 'keyboard') {
    await page.evaluate(() => {
      window.focus();
    });
    await page.locator('canvas').first().click({
      position: { x: 4, y: 4 },
      timeout: 2_000
    }).catch(() => {});
    await page.waitForTimeout(interaction.keyboardSettleWaitMs ?? 750);
  }

  let currentDiagnostics = await readDiagnostics(page);
  const baselineState = summarizeEdgeLiveInteractiveState(currentDiagnostics);
  const timeline = [];
  const movementDeltas = [];

  if (interaction.requiredMode && baselineState.mode !== interaction.requiredMode) {
    if (interaction.kind !== 'keyboard' || typeof interaction.ensureModeKey !== 'string') {
      const error = new Error(`Interactive ${interaction.kind} workflow requires play mode on ${viewport.id}, but it could not switch modes automatically.`);
      error.code = INTERACTIVE_PLAY_FAILURE_CODE;
      error.failureStage = 'ensure-play-mode';
      error.interaction = {
        runId: INTERACTIVE_PLAY_MODE_RUN_ID,
        baseline: baselineState,
        timeline
      };
      throw error;
    }

    const beforeSwitch = summarizeEdgeLiveInteractiveState(currentDiagnostics);
    await triggerKeyboardStep(interaction.ensureModeKey);
    currentDiagnostics = await waitAfterInput(interaction.controlWaitMs ?? 180);
    const afterSwitch = summarizeEdgeLiveInteractiveState(currentDiagnostics);
    timeline.push({
      id: 'ensure-play-mode',
      kind: 'mode',
      key: interaction.ensureModeKey,
      before: beforeSwitch,
      after: afterSwitch,
      changed: hasInteractiveStateDelta(beforeSwitch, afterSwitch)
    });

    if (afterSwitch.mode !== interaction.requiredMode) {
      const error = new Error(`Interactive ${interaction.kind} workflow did not switch into ${interaction.requiredMode} mode on ${viewport.id}.`);
      error.code = INTERACTIVE_PLAY_FAILURE_CODE;
      error.failureStage = 'ensure-play-mode';
      error.interaction = {
        runId: INTERACTIVE_PLAY_MODE_RUN_ID,
        baseline: baselineState,
        timeline
      };
      throw error;
    }
  } else {
    timeline.push({
      id: 'ensure-play-mode',
      kind: 'mode',
      key: null,
      before: baselineState,
      after: baselineState,
      changed: false
    });
  }

  let movementChanged = false;
  for (const step of interaction.steps ?? []) {
    let before = summarizeEdgeLiveInteractiveState(await readDiagnostics(page));
    let after = before;
    let attempted = [];
    let usedInput = null;

    if (step.kind === 'movement') {
      currentDiagnostics = await waitForMovementReady();
      const movementReadyState = summarizeEdgeLiveInteractiveState(currentDiagnostics);
      const currentProjectionState = movementReadyState?.projection?.state ?? null;
      const hasResetLaneMovementState = movementReadyState.mode === (interaction.requiredMode ?? 'play')
        && (movementReadyState.trail !== null || movementReadyState.player !== null);
      if (currentProjectionState !== 'watching' && !hasResetLaneMovementState) {
        const error = new Error(`Interactive ${interaction.kind} workflow never reached a movement-ready play state on ${viewport.id}.`);
        error.code = INTERACTIVE_PLAY_FAILURE_CODE;
        error.failureStage = 'movement-ready';
        throw error;
      }

      before = movementReadyState;
      after = movementReadyState;
      const candidates = prioritizeMovementCandidates(
        movementReadyState,
        interaction,
        Array.isArray(step.candidates) ? step.candidates : []
      );
      attempted = candidates;
      for (const candidate of candidates) {
        const beforeCandidateDiagnostics = await readDiagnostics(page);
        if (interaction.kind === 'touch') {
          await triggerTouchStep(beforeCandidateDiagnostics, candidate);
        } else {
          await triggerKeyboardStep(candidate, { holdMs: interaction.keyboardMovementHoldMs ?? 160 });
        }
        currentDiagnostics = await waitAfterInput(step.waitMs ?? interaction.movementWaitMs ?? 220);
        after = summarizeEdgeLiveInteractiveState(currentDiagnostics);
        usedInput = candidate;
        if (buildMovementDelta(before, after).moved) {
          movementChanged = true;
          break;
        }
      }
    } else if (interaction.kind === 'touch') {
      attempted = [step.control];
      await triggerTouchStep(await readDiagnostics(page), step.control);
      currentDiagnostics = await waitAfterInput(
        step.control === 'restart_attempt'
          ? interaction.restartWaitMs ?? 900
          : step.waitMs ?? interaction.controlWaitMs ?? 180
      );
      after = summarizeEdgeLiveInteractiveState(currentDiagnostics);
      usedInput = step.control;
    } else {
      attempted = [step.key];
      await triggerKeyboardStep(step.key);
      currentDiagnostics = await waitAfterInput(
        step.key === 'r'
          ? interaction.restartWaitMs ?? 900
          : step.waitMs ?? interaction.controlWaitMs ?? 180
      );
      after = summarizeEdgeLiveInteractiveState(currentDiagnostics);
      usedInput = step.key;
    }

    timeline.push({
      id: step.id,
      kind: step.kind,
      input: usedInput,
      attempted,
      before,
      after,
      changed: hasInteractiveStateDelta(before, after),
      ...(step.kind === 'movement'
        ? {
            movementDelta: buildMovementDelta(before, after)
          }
        : {})
    });
    if (step.kind === 'movement') {
      movementDeltas.push(buildMovementDelta(before, after));
    }
  }

  const finalDiagnostics = await waitAfterInput(Math.max(200, interaction.controlWaitMs ?? 180), { requireActiveTrail: true });
  const finalState = summarizeEdgeLiveInteractiveState(finalDiagnostics);
  if (interaction.requiredMode && finalState.mode !== interaction.requiredMode) {
    const error = new Error(`Interactive ${interaction.kind} workflow on ${viewport.id} drifted out of ${interaction.requiredMode} mode.`);
    error.code = INTERACTIVE_PLAY_FAILURE_CODE;
    error.failureStage = 'final-mode';
    error.interaction = {
      runId: interaction.kind === 'touch' ? MOBILE_TOUCH_SMOKE_RUN_ID : INTERACTIVE_PLAY_MODE_RUN_ID,
      baseline: baselineState,
      timeline,
      final: finalState
    };
    throw error;
  }

  if (!movementChanged) {
    const error = new Error(`Interactive ${interaction.kind} workflow on ${viewport.id} did not change runtime or projection state after movement.`);
    error.code = INTERACTIVE_PLAY_FAILURE_CODE;
    error.failureStage = 'interaction-state-delta';
    error.interaction = {
      runId: interaction.kind === 'touch' ? MOBILE_TOUCH_SMOKE_RUN_ID : INTERACTIVE_PLAY_MODE_RUN_ID,
      baseline: baselineState,
      timeline,
      final: finalState
    };
    throw error;
  }

  if (!movementDeltas.some((delta) => delta.moved)) {
    const error = new Error(`Interactive ${interaction.kind} workflow on ${viewport.id} never produced a measurable movement delta.`);
    error.code = INTERACTIVE_PLAY_FAILURE_CODE;
    error.failureStage = 'interaction-movement-delta';
    error.interaction = {
      runId: interaction.kind === 'touch' ? MOBILE_TOUCH_SMOKE_RUN_ID : INTERACTIVE_PLAY_MODE_RUN_ID,
      baseline: baselineState,
      timeline,
      final: finalState
    };
    throw error;
  }

  if (interaction.requiresControlEvents !== false && (finalState.controlUsedCount ?? 0) <= 0) {
    const error = new Error(`Interactive ${interaction.kind} workflow on ${viewport.id} did not record any control_used events.`);
    error.code = INTERACTIVE_PLAY_FAILURE_CODE;
    error.failureStage = 'interaction-control-events';
    error.interaction = {
      runId: interaction.kind === 'touch' ? MOBILE_TOUCH_SMOKE_RUN_ID : INTERACTIVE_PLAY_MODE_RUN_ID,
      baseline: baselineState,
      timeline,
      final: finalState
    };
    throw error;
  }

  const restartTrailReset = resolveRestartTrailResetVerdict(timeline);
  if (timeline.some((step) => step.id === 'restart') && !restartTrailReset.pass) {
    const error = new Error(`Interactive ${interaction.kind} workflow on ${viewport.id} did not clear trail on restart/reset.`);
    error.code = INTERACTIVE_PLAY_FAILURE_CODE;
    error.failureStage = 'restart-trail-reset';
    error.interaction = {
      runId: interaction.kind === 'touch' ? MOBILE_TOUCH_SMOKE_RUN_ID : INTERACTIVE_PLAY_MODE_RUN_ID,
      baseline: baselineState,
      timeline,
      final: finalState,
      restartTrailReset
    };
    throw error;
  }

  const markerStyleVerdict = resolvePlayMarkerStyleVerdict(finalState);
  if (!markerStyleVerdict.pass) {
    const error = new Error(`Interactive ${interaction.kind} workflow on ${viewport.id} did not publish the expected green player/red goal marker style.`);
    error.code = INTERACTIVE_PLAY_FAILURE_CODE;
    error.failureStage = 'marker-style';
    error.interaction = {
      runId: interaction.kind === 'touch' ? MOBILE_TOUCH_SMOKE_RUN_ID : INTERACTIVE_PLAY_MODE_RUN_ID,
      baseline: baselineState,
      timeline,
      final: finalState,
      restartTrailReset,
      markerStyleVerdict
    };
    throw error;
  }

  const touchChromeVerdict = interaction.kind === 'touch'
    ? resolvePlayTouchChromeVerdict(finalDiagnostics)
    : { pass: true, topActionBar: true, bottomDpad: true, compass: true, observed: null };
  if (!touchChromeVerdict.pass) {
    const error = new Error(`Interactive ${interaction.kind} workflow on ${viewport.id} did not publish the expected top action bar, bottom D-pad, and compass layout.`);
    error.code = INTERACTIVE_PLAY_FAILURE_CODE;
    error.failureStage = 'touch-chrome';
    error.interaction = {
      runId: interaction.kind === 'touch' ? MOBILE_TOUCH_SMOKE_RUN_ID : INTERACTIVE_PLAY_MODE_RUN_ID,
      baseline: baselineState,
      timeline,
      final: finalState,
      restartTrailReset,
      markerStyleVerdict,
      touchChromeVerdict
    };
    throw error;
  }

  const markerPixelVerdict = await sampleScreenshotMarkerPixels(page, finalState);
  if (!markerPixelVerdict.pass) {
    const error = new Error(`Interactive ${interaction.kind} workflow on ${viewport.id} did not render visible green player/red goal pixels: ${JSON.stringify(markerPixelVerdict)}`);
    error.code = INTERACTIVE_PLAY_FAILURE_CODE;
    error.failureStage = 'marker-pixels';
    error.interaction = {
      runId: interaction.kind === 'touch' ? MOBILE_TOUCH_SMOKE_RUN_ID : INTERACTIVE_PLAY_MODE_RUN_ID,
      baseline: baselineState,
      timeline,
      final: finalState,
      restartTrailReset,
      markerStyleVerdict,
      touchChromeVerdict,
      markerPixelVerdict
    };
    throw error;
  }

  return {
    runId: interaction.kind === 'touch' ? MOBILE_TOUCH_SMOKE_RUN_ID : INTERACTIVE_PLAY_MODE_RUN_ID,
    inputKind: interaction.kind,
    baseline: baselineState,
    final: finalState,
    finalDiagnostics,
    keyTimeline: timeline,
    movementDeltas,
    controlUsedCount: finalState.controlUsedCount,
    controlUsedBreakdown: finalState.controlUsedBreakdown,
    controlActionBreakdown: finalState.controlActionBreakdown,
    watchToPlaySwitchCount: finalState.watchToPlaySwitchCount,
    failToRetryContinuation: finalState.failToRetryContinuation,
    hud: finalState.hud,
    input: finalState.input,
    restartTrailReset,
    markerStyleVerdict,
    touchChromeVerdict,
    markerPixelVerdict,
    changed: hasInteractiveStateDelta(baselineState, finalState),
    mode: finalState.mode
  };
};

export const resolveEdgeLiveDefaultRoute = (runId) => {
  if (typeof runId !== 'string') {
    return undefined;
  }

  return EDGE_LIVE_SPECIAL_ROUTES[runId] ?? undefined;
};

const isBaseUrlReady = async (baseUrl) => {
  try {
    const response = await fetch(normalizeBaseUrl(baseUrl), { redirect: 'manual' });
    return response.ok;
  } catch {
    return false;
  }
};

const resolveViewportTargetUrl = ({ viewport, baseUrl, route, explicitUrl }) => {
  if (typeof explicitUrl === 'string' && explicitUrl.trim().length > 0) {
    const url = new URL(explicitUrl.trim());
    if (!url.searchParams.has('runtimeDiagnostics')) {
      url.searchParams.set('runtimeDiagnostics', '1');
    }
    return url.toString();
  }

  const url = new URL(`${normalizeBaseUrl(baseUrl)}${normalizeRoute(route ?? resolveLayoutMatrixRoute(viewport))}`);
  if (!url.searchParams.has('runtimeDiagnostics')) {
    url.searchParams.set('runtimeDiagnostics', '1');
  }
  return url.toString();
};

const isInsideBounds = (inner, outer, tolerance = 0) => (
  Boolean(inner)
  && Boolean(outer)
  && inner.left >= (outer.left - tolerance)
  && inner.right <= (outer.right + tolerance)
  && inner.top >= (outer.top - tolerance)
  && inner.bottom <= (outer.bottom + tolerance)
);

const doRectsOverlap = (left, right) => (
  Boolean(left)
  && Boolean(right)
  && left.left < right.right
  && left.right > right.left
  && left.top < right.bottom
  && left.bottom > right.top
);

export const resolvePlayTouchChromeVerdict = (diagnostics) => {
  const visual = diagnostics?.visual ?? diagnostics ?? null;
  const controls = visual?.touchControls?.controls ?? null;
  const boardBounds = visual?.board?.bounds ?? null;
  const hud = visual?.hud ?? null;
  const viewport = visual?.viewport ?? null;
  const pause = controls?.pause ?? null;
  const restart = controls?.restart_attempt ?? null;
  const trail = controls?.toggle_thoughts ?? null;
  const up = controls?.move_up ?? null;
  const down = controls?.move_down ?? null;
  const left = controls?.move_left ?? null;
  const right = controls?.move_right ?? null;
  const actionControls = [pause, restart, trail];
  const dpadControls = [up, down, left, right];
  const hasActionControls = actionControls.every(isFiniteRect);
  const hasDpadControls = dpadControls.every(isFiniteRect);
  const rowTolerance = 3;
  const topActionBar = hasActionControls
    && actionControls.every((rect) => Math.abs(rect.top - pause.top) <= rowTolerance)
    && actionControls.every((rect) => Math.abs(rect.bottom - pause.bottom) <= rowTolerance)
    && pause.right < restart.left
    && restart.right < trail.left
    && (!isFiniteRect(boardBounds) || Math.max(pause.bottom, restart.bottom, trail.bottom) < boardBounds.top);
  const bottomDpad = hasDpadControls
    && up.centerY < left.centerY
    && up.centerY < right.centerY
    && down.centerY > left.centerY
    && down.centerY > right.centerY
    && left.centerX < up.centerX
    && right.centerX > up.centerX
    && (!isFiniteRect(boardBounds) || Math.min(up.top, left.top, right.top, down.top) > boardBounds.bottom);
  const compass = isFiniteRect(hud?.arrowBounds)
    && isFiniteRect(hud?.timerBounds)
    && hud.arrowBounds.width >= 40
    && hud.arrowBounds.height >= 40
    && hud.arrowBounds.left > hud.timerBounds.right
    && (!viewport || hud.arrowBounds.right >= viewport.width - 16);

  return {
    pass: Boolean(topActionBar && bottomDpad && compass),
    topActionBar,
    bottomDpad,
    compass,
    observed: {
      pause,
      restart,
      trail,
      up,
      down,
      left,
      right,
      boardBounds,
      arrowBounds: hud?.arrowBounds ?? null,
      timerBounds: hud?.timerBounds ?? null
    }
  };
};

const resolveExperimentSelection = (args = {}) => {
  const readToggle = (camelKey, kebabKey) => (
    typeof args[camelKey] === 'string'
      ? args[camelKey]
      : typeof args[kebabKey] === 'string'
        ? args[kebabKey]
        : undefined
  );
  const toggles = normalizeExperimentToggles({
    pacing: typeof args.pacing === 'string' ? args.pacing : undefined,
    thoughtDensity: readToggle('thoughtDensity', 'thought-density'),
    failCardTiming: readToggle('failCardTiming', 'fail-card-timing'),
    memoryBeat: typeof args.memoryBeat === 'string'
      ? args.memoryBeat
      : typeof args['memory-beat'] === 'string'
        ? args['memory-beat']
        : args.memoryBeat === true || args['memory-beat'] === true
          ? 'on'
          : undefined,
    trapTelegraph: readToggle('trapTelegraph', 'trap-telegraph')
  });

  return {
    toggles,
    variantId: resolveExperimentVariantId(toggles)
  };
};

export const resolveEdgeLiveRunPaths = (runId) => {
  const runDir = resolve(EDGE_LIVE_ROOT, runId);
  return {
    runDir,
    screenshotsDir: resolve(runDir, 'screenshots'),
    videosDir: resolve(runDir, 'videos'),
    metadataDir: resolve(runDir, 'metadata'),
    summaryPath: resolve(runDir, 'summary.json'),
    markdownPath: resolve(runDir, 'summary.md')
  };
};

export const resolveEdgeLiveWorkflow = (runId) => (
  typeof runId === 'string' && PROOF_SURFACE_WORKFLOWS[runId]
    ? PROOF_SURFACE_WORKFLOWS[runId]
    : null
);

export const buildEdgeLiveExperiment = (options = {}) => {
  const selection = options.toggles
    ? (() => {
        const toggles = normalizeExperimentToggles(options.toggles);
        return {
          toggles,
          variantId: resolveExperimentVariantId(toggles)
        };
      })()
    : resolveExperimentSelection(options);
  return buildExperimentManifest({
    kind: 'edge-live',
    label: typeof options.label === 'string' ? options.label : 'edge-live',
    runId: typeof options.runId === 'string' ? options.runId : null,
    mazeId: typeof options.mazeId === 'string' ? options.mazeId : null,
    attemptNo: Number.isFinite(options.attemptNo) ? options.attemptNo : null,
    toggles: selection.toggles,
    generatedAt: typeof options.generatedAt === 'string' ? options.generatedAt : undefined
  });
};

export const buildProofSurfaceFailureArtifact = ({
  error,
  workflowId,
  routeDefinition,
  viewport,
  url,
  stage,
  httpFailures,
  consoleMessages,
  runDir,
  metadataPath,
  screenshotPath
}) => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  workflowId,
  routeId: routeDefinition.id,
  routeLabel: routeDefinition.label,
  route: routeDefinition.route,
  stage,
  viewport,
  url,
  failure: {
    code: error?.code ?? PROOF_SURFACE_404_FAILURE_CODE,
    reason: error?.message ?? 'unknown proof-shell failure',
    message: error?.message ?? 'unknown proof-shell failure'
  },
  httpFailures,
  consoleMessages,
  files: {
    metadata: relativeToRun(runDir, metadataPath),
    screenshot: screenshotPath ? relativeToRun(runDir, screenshotPath) : null
  }
});

export const resolveEdgeLiveTargetUrl = (viewport, options = {}) => resolveViewportTargetUrl({
  viewport,
  baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
  route: options.route,
  explicitUrl: options.url
});

export const resolveEdgeLiveVerdicts = (diagnostics) => {
  const boardBounds = diagnostics?.board?.bounds ?? null;
  const safeBounds = diagnostics?.board?.safeBounds ?? null;
  const hudBounds = diagnostics?.hud?.bounds ?? diagnostics?.intentFeed?.bounds ?? null;
  const viewport = diagnostics?.viewport ?? null;
  const viewportBounds = viewport
    ? {
        left: 0,
        top: 0,
        right: viewport.width,
        bottom: viewport.height
      }
    : null;

  const boardOverflow = isInsideBounds(boardBounds, safeBounds, 4);
  const hudOverlap = hudBounds ? Boolean(boardBounds && !doRectsOverlap(boardBounds, hudBounds)) : true;
  const hudClip = hudBounds ? Boolean(viewportBounds && isInsideBounds(hudBounds, viewportBounds, 2)) : true;

  return {
    boardOverflow: {
      pass: boardOverflow,
      bounds: boardBounds,
      safeBounds
    },
    hudOverlap: {
      pass: hudOverlap,
      bounds: hudBounds,
      boardBounds
    },
    hudClip: {
      pass: hudClip,
      bounds: hudBounds,
      viewportBounds
    }
  };
};

export const isEdgeLiveEndWindowRun = (runId) => (
  typeof runId === 'string' && EDGE_LIVE_END_WINDOW_RUNS.has(runId)
);

export const resolveEdgeLiveArrivalProofState = (diagnostics) => {
  const visual = diagnostics?.visual ?? diagnostics ?? null;
  const attempt = visual?.attempt ?? null;
  const arrival = visual?.arrival ?? null;

  return {
    mode: attempt?.mode ?? null,
    sequence: attempt?.sequence ?? null,
    lifecyclePhase: attempt?.lifecyclePhase ?? null,
    ritualPhase: attempt?.ritualPhase ?? null,
    elapsedMs: attempt?.elapsedMs ?? null,
    presentationElapsedMs: attempt?.presentationElapsedMs ?? null,
    visualArrivalLatchMs: attempt?.visualArrivalLatchMs ?? null,
    actorVisible: arrival?.actorVisible ?? false,
    goalVisible: arrival?.goalVisible ?? false,
    actorInsideExitRegion: arrival?.actorInsideExitRegion ?? false,
    settleProgress: arrival?.settleProgress ?? 0,
    settleRemainingMs: arrival?.settleRemainingMs ?? null,
    readyToClear: arrival?.readyToClear ?? false,
    actorCenter: arrival?.actorCenter ?? null,
    goalCenter: arrival?.goalCenter ?? null,
    goalTileBounds: arrival?.goalTileBounds ?? null,
    exitRegionBounds: arrival?.exitRegionBounds ?? null
  };
};

export const isEdgeLiveArrivalProofCandidate = (state) => {
  const isArrivalWindow = state.lifecyclePhase === 'active-watch'
    && (state.sequence === 'arrival' || state.sequence === 'fade' || state.sequence === 'reveal');
  const isClearHoldFallback = state.lifecyclePhase === 'clear-hold' && state.readyToClear;

  return state.actorVisible
    && state.goalVisible
    && (
      (state.actorInsideExitRegion && isArrivalWindow)
      || isClearHoldFallback
    );
};

export const isEdgeLiveArrivalProofPass = (snapshot) => (
  snapshot?.attempt?.lifecyclePhase === 'active-watch'
    ? snapshot?.arrival?.actorInsideExitRegion === true
    : snapshot?.attempt?.lifecyclePhase === 'clear-hold'
      ? snapshot?.arrival?.readyToClear === true
      : false
);

export const isRetriableEdgeLiveDiagnosticsReadError = (error) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return /Execution context was destroyed|Cannot find context with specified id|Target page, context or browser has been closed/i.test(
    error.message
  );
};

export const readDiagnostics = async (page, { retries = 3, retryDelayMs = 120 } = {}) => {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await page.evaluate((keys) => {
        const readJsonAttribute = (attributeName, accept) => {
          const serialized = document.documentElement.getAttribute(attributeName);
          if (typeof serialized !== 'string' || serialized.length === 0) {
            return null;
          }

          try {
            const parsed = JSON.parse(serialized);
            return accept(parsed) ? parsed : null;
          } catch {
            return null;
          }
        };

        const visualFromAttribute = readJsonAttribute(
          keys.visualAttribute,
          (parsed) => Boolean(parsed?.board?.bounds && parsed?.runtime?.mode)
        );
        const runtimeFromWindow = window[keys.runtime] ?? null;
        const runtimeFromAttribute = readJsonAttribute(
          keys.runtimeAttribute,
          (parsed) => Boolean(parsed?.sceneInstanceId && parsed?.performance && parsed?.resources)
        );

        return {
          visual: window[keys.visual] ?? visualFromAttribute,
          runtime: runtimeFromWindow ?? runtimeFromAttribute
        };
      }, {
        visual: VISUAL_DIAGNOSTICS_KEY,
        visualAttribute: VISUAL_DIAGNOSTICS_ATTRIBUTE,
        runtime: RUNTIME_DIAGNOSTICS_KEY,
        runtimeAttribute: RUNTIME_DIAGNOSTICS_ATTRIBUTE
      });
    } catch (error) {
      lastError = error;
      if (!isRetriableEdgeLiveDiagnosticsReadError(error) || attempt >= retries) {
        throw error;
      }

      await page.waitForTimeout(retryDelayMs);
    }
  }

  throw lastError ?? new Error('Unable to read edge-live diagnostics.');
};

export const isResetLaneVisualDiagnostics = (visual) => Boolean(
  visual
  && visual.board?.bounds
  && visual.board?.safeBounds
  && visual.runtime?.mode
  && Number.isFinite(visual.runtime?.trailLength)
);

export const hasHostedAttemptLifecycle = (diagnostics) => Boolean(
  diagnostics?.visual?.attempt || diagnostics?.visual?.arrival
);

export const isEdgeLiveDiagnosticsReady = (diagnostics, { requireActiveTrail = false } = {}) => {
  const visual = diagnostics?.visual ?? null;
  if (!visual?.board?.bounds || !visual?.board?.safeBounds) {
    return false;
  }

  const hostedProofReady = Boolean(
    visual.intentFeed?.bounds
    && visual.intentFeed?.visible === true
    && (!requireActiveTrail || (
      visual.trail?.currentIndex !== visual.trail?.nextIndex
      && visual.trail?.progress > 0
      && visual.trail?.progress < 1
    ))
  );
  if (hostedProofReady) {
    return true;
  }

  if (!isResetLaneVisualDiagnostics(visual)) {
    return false;
  }

  return !requireActiveTrail || visual.runtime.trailLength > 1;
};

const waitForDiagnostics = async (page, timeoutMs, { requireActiveTrail = false } = {}) => {
  const startedAt = Date.now();
  let lastDiagnostics = null;

  while ((Date.now() - startedAt) < timeoutMs) {
    lastDiagnostics = await readDiagnostics(page);
    if (isEdgeLiveDiagnosticsReady(lastDiagnostics, { requireActiveTrail })) {
      return lastDiagnostics;
    }

    await page.waitForTimeout(200);
  }

  const error = new Error(requireActiveTrail
    ? 'Timed out waiting for an active attempt lifecycle frame.'
    : 'Timed out waiting for edge live diagnostics to become ready.');
  error.lastDiagnostics = lastDiagnostics;
  throw error;
};

const waitForDiagnosticsMatch = async (page, timeoutMs, predicate, errorMessage) => {
  const startedAt = Date.now();
  let lastDiagnostics = null;

  while ((Date.now() - startedAt) < timeoutMs) {
    lastDiagnostics = await readDiagnostics(page);
    if (predicate(lastDiagnostics)) {
      return lastDiagnostics;
    }

    await page.waitForTimeout(EDGE_LIVE_END_WINDOW_POLL_MS);
  }

  const error = new Error(errorMessage);
  error.lastDiagnostics = lastDiagnostics;
  throw error;
};

export const isRetriableEdgeLiveCaptureError = (error) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('Timed out waiting for edge live diagnostics')
    || message.includes('Timed out waiting for an active attempt lifecycle frame')
    || message.includes('Timed out waiting for a hosted watch arrival frame before clear-hold')
    || message.includes('Timed out waiting for clear-hold after hosted watch arrival')
    || message.includes('Timed out waiting for erase-wipe after hosted watch clear-hold')
    || (error?.name === 'TimeoutError')
  );
};

const createSnapshot = (stage, diagnostics, screenshotPath) => {
  const visual = diagnostics.visual;
  const runtime = diagnostics.runtime;
  const verdicts = resolveEdgeLiveVerdicts(visual);
  const arrivalProof = resolveEdgeLiveArrivalProofState(visual);

  return {
    stage,
    screenshotPath,
    revision: visual?.revision ?? null,
    board: {
      bounds: visual?.board?.bounds ?? null,
      safeBounds: visual?.board?.safeBounds ?? null,
      tileSize: visual?.board?.tileSize ?? null
    },
    hud: {
      bounds: visual?.hud?.bounds ?? visual?.intentFeed?.bounds ?? null,
      visible: visual?.hud?.visible ?? visual?.intentFeed?.visible ?? null,
      dock: visual?.intentFeed?.dock ?? null,
      kind: visual?.hud?.kind ?? null,
      timerBounds: visual?.hud?.timerBounds ?? null,
      arrowBounds: visual?.hud?.arrowBounds ?? null,
      compact: visual?.intentFeed?.compact ?? null,
      statusVisible: visual?.intentFeed?.statusVisible ?? null,
      statusText: visual?.intentFeed?.statusText ?? null,
      quickThoughtCount: visual?.intentFeed?.quickThoughtCount ?? null,
      maxVisibleEvents: visual?.intentFeed?.maxVisibleEvents ?? null,
      onboardingVisible: visual?.intentFeed?.onboardingVisible ?? null,
      onboardingLabel: visual?.intentFeed?.onboardingLabel ?? null,
      riskVisible: visual?.intentFeed?.riskVisible ?? null,
      nextRiskLabel: visual?.intentFeed?.nextRiskLabel ?? null
    },
    trail: visual?.trail
      ? {
          start: visual.trail.start,
          limit: visual.trail.limit,
          currentIndex: visual.trail.currentIndex,
          nextIndex: visual.trail.nextIndex,
          progress: visual.trail.progress,
          cue: visual.trail.cue
        }
      : null,
    attempt: visual?.attempt
      ? {
          mode: visual.attempt.mode ?? null,
          sequence: visual.attempt.sequence ?? null,
          lifecyclePhase: visual.attempt.lifecyclePhase ?? null,
          ritualPhase: visual.attempt.ritualPhase ?? null,
          elapsedMs: visual.attempt.elapsedMs ?? null,
          presentationElapsedMs: visual.attempt.presentationElapsedMs ?? null,
          visualArrivalLatchMs: visual.attempt.visualArrivalLatchMs ?? null
        }
      : null,
    arrival: arrivalProof,
    runtime: runtime?.feed
      ? {
          step: runtime.feed.step ?? null,
          signature: runtime.feed.signature ?? null,
          changeCount: runtime.feed.changeCount ?? null,
          visibleEntryCount: runtime.feed.visibleEntryCount ?? null
        }
      : null,
    telemetry: runtime?.telemetry?.summary
      ? {
          eventCount: runtime.telemetry.summary.eventCount ?? 0,
          eventCounts: runtime.telemetry.summary.eventCounts ?? {},
          eventKinds: runtime.telemetry.summary.eventKinds ?? [],
          timingWindows: runtime.telemetry.summary.timingWindows ?? [],
          failToRetryContinuation: runtime.telemetry.summary.failToRetryContinuation ?? null,
          thoughtDwell: runtime.telemetry.summary.thoughtDwell ?? null,
          mode: normalizeTelemetryMode(runtime.telemetry.summary.mode ?? runtime.telemetry.mode ?? null),
          events: Array.isArray(runtime?.telemetry?.events) ? runtime.telemetry.events : []
        }
      : null,
    projection: runtime?.projection ?? null,
    verdicts
  };
};

export const collectTelemetryEventsFromEdgeLiveCaptures = (captures) => {
  const deduped = new Map();

  for (const capture of captures) {
    const snapshots = [
      capture?.firstLoad,
      capture?.secondLoad,
      capture?.lifecycle?.available === false ? null : capture?.lifecycle
    ].filter(Boolean);
    for (const snapshot of snapshots) {
      const events = Array.isArray(snapshot?.telemetry?.events) ? snapshot.telemetry.events : [];
      for (const event of events) {
        const key = normalizeTelemetryEventKey(event);
        if (!deduped.has(key)) {
          deduped.set(key, event);
        }
      }
    }
  }

  return [...deduped.values()].sort((left, right) => (
    (Number.isFinite(left?.elapsedMs) ? left.elapsedMs : Number.MAX_SAFE_INTEGER)
    - (Number.isFinite(right?.elapsedMs) ? right.elapsedMs : Number.MAX_SAFE_INTEGER)
  ));
};

export const buildEdgeLiveReceiptFromCaptures = ({
  captures,
  runId,
  toggles
}) => {
  const events = collectTelemetryEventsFromEdgeLiveCaptures(captures);
  const mode = resolveTelemetryModeFromCaptures(captures);
  return buildTelemetryReceipt({
    kind: 'edge-live',
    label: runId,
    runId,
    toggles,
    events,
    mode,
    privacyMode: 'full',
    sessionCount: 1
  });
};

export const resolveEdgeLiveAttemptKey = (diagnostics) => {
  const projection = diagnostics?.runtime?.projection ?? null;
  if (!projection) {
    return null;
  }

  const runId = typeof projection.runId === 'string' ? projection.runId : '';
  const mazeId = typeof projection.mazeId === 'string' ? projection.mazeId : '';
  const attemptNo = Number.isFinite(projection.attemptNo) ? projection.attemptNo : '';
  if (!runId && !mazeId && attemptNo === '') {
    return null;
  }

  return `${runId}|${mazeId}|${attemptNo}`;
};

const captureEndWindowProof = async ({
  page,
  runId,
  timeoutMs,
  runDir,
  screenshotsDir,
  viewport
}) => {
  if (!isEdgeLiveEndWindowRun(runId)) {
    return null;
  }

  const arrivalPath = resolve(screenshotsDir, `${viewport.id}-end-window-arrival.png`);
  const clearHoldPath = resolve(screenshotsDir, `${viewport.id}-end-window-clear-hold.png`);
  const erasePath = resolve(screenshotsDir, `${viewport.id}-end-window-erase.png`);
  const arrivalDiagnostics = await waitForDiagnosticsMatch(
    page,
    timeoutMs,
    (diagnostics) => isEdgeLiveArrivalProofCandidate(resolveEdgeLiveArrivalProofState(diagnostics?.visual)),
    'Timed out waiting for a hosted watch arrival frame before clear-hold.'
  );
  await page.screenshot({
    path: arrivalPath,
    fullPage: false,
    animations: 'disabled'
  });
  const arrivalAttemptKey = resolveEdgeLiveAttemptKey(arrivalDiagnostics);

  const clearHoldDiagnostics = await waitForDiagnosticsMatch(
    page,
    timeoutMs,
    (diagnostics) => {
      const state = resolveEdgeLiveArrivalProofState(diagnostics?.visual);
      const attemptKey = resolveEdgeLiveAttemptKey(diagnostics);
      return state.lifecyclePhase === 'clear-hold'
        && state.actorVisible
        && state.readyToClear
        && (!arrivalAttemptKey || attemptKey === arrivalAttemptKey);
    },
    'Timed out waiting for clear-hold after hosted watch arrival.'
  );
  await page.screenshot({
    path: clearHoldPath,
    fullPage: false,
    animations: 'disabled'
  });

  const eraseDiagnostics = await waitForDiagnosticsMatch(
    page,
    timeoutMs,
    (diagnostics) => {
      const attemptKey = resolveEdgeLiveAttemptKey(diagnostics);
      return resolveEdgeLiveArrivalProofState(diagnostics?.visual).lifecyclePhase === 'erase-wipe'
        && (!arrivalAttemptKey || attemptKey === arrivalAttemptKey);
    },
    'Timed out waiting for erase-wipe after hosted watch clear-hold.'
  );
  await page.screenshot({
    path: erasePath,
    fullPage: false,
    animations: 'disabled'
  });

  const arrivalSnapshot = createSnapshot('end-window-arrival', arrivalDiagnostics, relativeToRun(runDir, arrivalPath));
  const clearHoldSnapshot = createSnapshot('end-window-clear-hold', clearHoldDiagnostics, relativeToRun(runDir, clearHoldPath));
  const eraseSnapshot = createSnapshot('end-window-erase', eraseDiagnostics, relativeToRun(runDir, erasePath));
  const clearHoldAttemptKey = resolveEdgeLiveAttemptKey(clearHoldDiagnostics);
  const eraseAttemptKey = resolveEdgeLiveAttemptKey(eraseDiagnostics);

  return {
    pass: Boolean(
      isEdgeLiveArrivalProofPass(arrivalSnapshot)
      && clearHoldSnapshot.attempt?.lifecyclePhase === 'clear-hold'
      && clearHoldSnapshot.arrival?.readyToClear === true
      && eraseSnapshot.attempt?.lifecyclePhase === 'erase-wipe'
      && (!arrivalAttemptKey || arrivalAttemptKey === clearHoldAttemptKey)
      && (!arrivalAttemptKey || arrivalAttemptKey === eraseAttemptKey)
      && (arrivalSnapshot.attempt?.elapsedMs ?? -1) <= (clearHoldSnapshot.attempt?.elapsedMs ?? -1)
      && (clearHoldSnapshot.attempt?.elapsedMs ?? -1) <= (eraseSnapshot.attempt?.elapsedMs ?? -1)
    ),
    attemptKey: arrivalAttemptKey,
    arrival: arrivalSnapshot,
    clearHold: clearHoldSnapshot,
    erase: eraseSnapshot,
    files: {
      arrival: relativeToRun(runDir, arrivalPath),
      clearHold: relativeToRun(runDir, clearHoldPath),
      erase: relativeToRun(runDir, erasePath)
    }
  };
};

const captureViewport = async ({
  browser,
  baseUrl,
  explicitUrl,
  viewport,
  route,
  runId,
  timeoutMs,
  runDir,
  screenshotsDir,
  videosDir,
  metadataDir,
  experiment
}) => {
  const interaction = resolveEdgeLiveInteraction(runId);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    hasTouch: interaction?.kind === 'touch',
    isMobile: interaction?.kind === 'touch',
    recordVideo: {
      dir: videosDir,
      size: { width: viewport.width, height: viewport.height }
    }
  });

  await context.addInitScript(({ key, value }) => {
    window[key] = value;
  }, {
    key: VISUAL_CAPTURE_KEY,
    value: CAPTURE_CONFIG
  });

  const page = await context.newPage();
  const consoleMessages = [];
  page.on('console', (message) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text(),
      location: message.location()
    });
  });
  page.on('pageerror', (error) => {
    consoleMessages.push({
      type: 'pageerror',
      text: error.message
    });
  });

  const url = resolveViewportTargetUrl({ viewport, baseUrl, route, explicitUrl });
  const firstLoadPath = resolve(screenshotsDir, `${viewport.id}-first-load.png`);
  const secondLoadPath = resolve(screenshotsDir, `${viewport.id}-second-load.png`);
  const lifecyclePath = resolve(screenshotsDir, `${viewport.id}-attempt-lifecycle.png`);
  const metadataPath = resolve(metadataDir, `${viewport.id}.json`);
  const videoPath = resolve(videosDir, `${viewport.id}.webm`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', {
      timeout: Math.min(10_000, timeoutMs)
    }).catch(() => {});
    await page.waitForTimeout(250);
    const firstDiagnostics = await waitForDiagnostics(page, timeoutMs);
    await page.screenshot({
      path: firstLoadPath,
      fullPage: false,
      animations: 'disabled'
    });

    await page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', {
      timeout: Math.min(10_000, timeoutMs)
    }).catch(() => {});
    await page.waitForTimeout(250);
    const secondDiagnostics = await waitForDiagnostics(page, timeoutMs);
    await page.screenshot({
      path: secondLoadPath,
      fullPage: false,
      animations: 'disabled'
    });

    let lifecycle = null;
    let interactionRecord = null;
    let endWindow = null;
    try {
      let lifecycleDiagnostics = null;
      if (interaction) {
        interactionRecord = await runEdgeLiveInteraction({
          page,
          viewport,
          timeoutMs,
          interaction
        });
        lifecycleDiagnostics = interactionRecord.finalDiagnostics ?? await readDiagnostics(page);
      } else {
        lifecycleDiagnostics = await waitForDiagnostics(page, Math.max(2_000, Math.round(timeoutMs / 3)), { requireActiveTrail: true });
      }
      await page.screenshot({
        path: lifecyclePath,
        fullPage: false,
        animations: 'disabled'
      });
      lifecycle = createSnapshot('attempt-lifecycle', lifecycleDiagnostics, relativeToRun(runDir, lifecyclePath));
    } catch (error) {
      if (interaction) {
        throw error;
      }
      lifecycle = {
        available: false
      };
    }

    if (!interaction) {
      if (isEdgeLiveEndWindowRun(runId) && hasHostedAttemptLifecycle(secondDiagnostics)) {
        endWindow = await captureEndWindowProof({
          page,
          runId,
          timeoutMs,
          runDir,
          screenshotsDir,
          viewport
        });
      } else {
        endWindow = {
          available: false,
          reason: hasHostedAttemptLifecycle(secondDiagnostics)
            ? 'not-an-end-window-run'
            : 'reset-lane-visual-diagnostics'
        };
      }
    }

    const record = {
      viewport,
      url,
      route: explicitUrl ? null : route,
      experiment,
      consoleMessages,
      firstLoad: createSnapshot('first-load', firstDiagnostics, relativeToRun(runDir, firstLoadPath)),
      secondLoad: createSnapshot('second-load', secondDiagnostics, relativeToRun(runDir, secondLoadPath)),
      lifecycle,
      endWindow,
      interaction: interactionRecord
        ? {
            ...interactionRecord,
            finalDiagnostics: undefined
          }
        : null,
      files: {
        firstLoad: relativeToRun(runDir, firstLoadPath),
        secondLoad: relativeToRun(runDir, secondLoadPath),
        lifecycle: lifecycle?.available === false ? null : relativeToRun(runDir, lifecyclePath),
        endWindow: endWindow?.files ?? null,
        video: relativeToRun(runDir, videoPath),
        metadata: relativeToRun(runDir, metadataPath)
      }
    };

    await writeFile(metadataPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

    await page.close();
    const video = page.video();
    if (video) {
      const rawVideoPath = await video.path();
      await copyFile(rawVideoPath, videoPath);
      await unlink(rawVideoPath);
    }

    return record;
  } finally {
    await context.close();
  }
};

const buildMarkdownSummary = ({ runId, sourceMode, baseUrl, explicitUrl, presetGroup, experiment, captures, receipt, interaction }) => {
  const playMetrics = receipt.playMetrics ?? receipt.kpis;
  const lines = [
    '# Mazer Edge Live Check',
    '',
    `- Run: ${runId}`,
    `- Source: ${sourceMode}`,
    `- Mode: ${receipt.mode ?? 'n/a'}`,
    `- Base URL: ${baseUrl}`,
    `- Explicit URL: ${explicitUrl ?? 'not provided'}`,
    `- Presets: ${presetGroup}`,
    `- Variant: ${experiment.variantId}`,
    `- Toggles: pacing ${experiment.toggles.pacing}, thought ${experiment.toggles.thoughtDensity}, fail card ${experiment.toggles.failCardTiming}, memory ${experiment.toggles.memoryBeat}, trap ${experiment.toggles.trapTelegraph}`,
    '',
    '| Viewport | Route | Board Bounds | HUD Bounds | Board Overflow | HUD Overlap | HUD Clip | Video |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |'
  ];

  for (const capture of captures) {
    const telemetry = capture.telemetry ?? { eventCount: 0, thoughtDwell: { densityPerMinute: 0 } };
    lines.push(
      `| ${capture.viewport.id} | ${capture.route ?? '-'} | ${formatBounds(capture.board.bounds)} | ${formatBounds(capture.hud.bounds)} | ${capture.verdicts.boardOverflow.pass ? 'pass' : 'fail'} | ${capture.verdicts.hudOverlap.pass ? 'pass' : 'fail'} | ${capture.verdicts.hudClip.pass ? 'pass' : 'fail'} | ${capture.files.video} |`
    );
    lines.push(`  Events: ${telemetry.eventCount}, thought density ${telemetry.thoughtDwell?.densityPerMinute ?? 0}/min`);
    if (capture.endWindow) {
      lines.push(
        `  End window: ${capture.endWindow.pass ? 'pass' : 'fail'} | arrival ${capture.endWindow.arrival?.attempt?.lifecyclePhase ?? 'n/a'} @ ${capture.endWindow.arrival?.attempt?.elapsedMs ?? 'n/a'}ms -> clear ${capture.endWindow.clearHold?.attempt?.lifecyclePhase ?? 'n/a'} -> erase ${capture.endWindow.erase?.attempt?.lifecyclePhase ?? 'n/a'}`
      );
    }
  }

  lines.push(
    '',
    '## Business / KPI',
    '',
    `- Event count: ${receipt.eventCount}`,
    `- Privacy mode: ${receipt.privacyMode ?? 'n/a'}`,
    `- Source CTA: ${receipt.sourceCta ?? 'n/a'}`,
    `- Experiment ids: ${receipt.experimentIds.join(', ') || experiment.variantId}`,
    `- Runs watched / session: ${receipt.kpis.runsWatchedPerSession}`,
    `- Avg watch time: ${receipt.kpis.averageWatchTimeMs ?? 'n/a'}ms`,
    `- Thought dwell: ${receipt.kpis.thoughtBoxDwellMs ?? 'n/a'}ms`,
    `- Widget attach rate: ${receipt.kpis.widgetAttachRate}`,
    `- Live activity rate: ${receipt.kpis.liveActivityStartRate}`,
    `- Paywall to purchase: ${receipt.kpis.paywallToPurchaseConversion ?? 'n/a'}`,
    `- Reduced motion adoption: ${receipt.kpis.reducedMotionAdoptionRate}`,
    `- Private mode adoption: ${receipt.kpis.privateModeAdoptionRate}`,
    '',
    '## Play Metrics',
    '',
    `- Controls used: total ${playMetrics.controlUsedCount}; keyboard ${playMetrics.controlUsedByControl.keyboard}; touch ${playMetrics.controlUsedByControl.touch}; restart ${playMetrics.controlUsedByControl.restart}; pause ${playMetrics.controlUsedByControl.pause}; toggle ${playMetrics.controlUsedByControl.toggle_thoughts}`,
    `- Action mix: move ${playMetrics.controlUsedByAction.move}; pause ${playMetrics.controlUsedByAction.pause}; restart ${playMetrics.controlUsedByAction.restart}; toggle thoughts ${playMetrics.controlUsedByAction.toggle_thoughts}`,
    `- Watch -> play switch: count ${playMetrics.watchToPlaySwitchCount}, rate ${playMetrics.watchToPlaySwitchRate ?? 'n/a'}`,
    `- Play fail -> retry continuation: count ${playMetrics.playFailToRetryContinuationCount}, rate ${playMetrics.playFailToRetryContinuationRate ?? 'n/a'}`,
    '',
    '## Watch Pass Funnel',
    '',
    ...buildWatchPassFunnelLines(receipt),
  );

  if (interaction) {
    lines.push(
      '',
      '## Interactive Proof',
      '',
      `- Mode: ${interaction.mode ?? 'n/a'}`,
      `- Input: ${interaction.inputKind ?? 'n/a'}`,
      `- Control used count: ${interaction.controlUsedCount ?? 0}`,
      `- Control breakdown: ${interaction.controlUsedBreakdown ? JSON.stringify(interaction.controlUsedBreakdown) : 'n/a'}`,
      `- Movement deltas: ${Array.isArray(interaction.movementDeltas) ? interaction.movementDeltas.filter((delta) => delta.moved).length : 0}`,
      `- Watch -> play switches: ${interaction.watchToPlaySwitchCount ?? 0}`,
      `- Input timing: ${interaction.input ? `accepted ${interaction.input.acceptedCount}, dropped ${interaction.input.droppedCount}, merged ${interaction.input.mergedCount}` : 'n/a'}`,
      `- HUD state: ${interaction.hud ? `${interaction.hud.statusText ?? 'status-hidden'} | ${interaction.hud.nextRiskLabel ?? 'risk-hidden'}` : 'n/a'}`,
      `- Restart trail reset: ${interaction.restartTrailReset?.pass ? 'pass' : 'fail'} (${interaction.restartTrailReset?.beforeTrailSegmentCount ?? 'n/a'} -> ${interaction.restartTrailReset?.afterTrailSegmentCount ?? 'n/a'})`,
      `- Marker style: ${interaction.markerStyleVerdict?.pass ? 'pass' : 'fail'} (player ${interaction.markerStyleVerdict?.observed?.playerCoreColor ?? 'n/a'}, goal ${interaction.markerStyleVerdict?.observed?.goalCoreColor ?? 'n/a'}, haloRadius ${interaction.markerStyleVerdict?.observed?.playerHaloRadius ?? 'n/a'}, tile ${interaction.markerStyleVerdict?.observed?.tileSize ?? 'n/a'})`,
      `- Touch chrome: ${interaction.touchChromeVerdict?.pass ? 'pass' : 'fail'} (top actions ${interaction.touchChromeVerdict?.topActionBar ? 'pass' : 'fail'}, bottom D-pad ${interaction.touchChromeVerdict?.bottomDpad ? 'pass' : 'fail'}, compass ${interaction.touchChromeVerdict?.compass ? 'pass' : 'fail'})`,
      `- Marker pixels: ${interaction.markerPixelVerdict?.pass ? 'pass' : 'fail'} (player matches ${interaction.markerPixelVerdict?.player?.matchCount ?? 'n/a'}, goal matches ${interaction.markerPixelVerdict?.goal?.matchCount ?? 'n/a'})`,
      `- State changed: ${interaction.changed ? 'yes' : 'no'}`,
      '- Input timeline:'
    );

    for (const step of interaction.keyTimeline ?? []) {
      lines.push(`  - ${step.id}: ${step.kind} ${step.input ?? 'n/a'} changed=${step.changed ? 'yes' : 'no'}`);
    }
  }

  lines.push(
    '',
    '## Notes',
    '',
    '- First load, second load, and an active-motion attempt frame are captured when available.',
    '- Core watch and cycle runs also capture arrival, clear-hold, and erase end-window proof frames.',
    '- Board overflow compares the published board bounds against the safe frame.',
    '- HUD overlap checks the published HUD proof footprint against the maze board bounds.',
    '- HUD clip checks the published HUD proof footprint against the viewport bounds.'
  );

  return `${lines.join('\n')}\n`;
};

const formatBounds = (bounds) => (
  bounds
    ? `${Math.round(bounds.left)},${Math.round(bounds.top)} ${Math.round(bounds.width)}x${Math.round(bounds.height)}`
    : '-'
);

const resolveSourceMode = ({ explicitUrl, previewUsed }) => {
  if (typeof explicitUrl === 'string' && explicitUrl.trim().length > 0) {
    return 'explicit-url';
  }

  return previewUsed ? 'existing-preview' : 'local-preview';
};

const waitForProofSurfaceDiagnostics = async (page, timeoutMs) => {
  await page.waitForFunction(
    (signalKey) => Boolean(window[signalKey]?.ready),
    PROOF_SURFACE_SIGNAL_KEY,
    { timeout: timeoutMs }
  );

  return page.evaluate((signalKey) => window[signalKey]?.getDiagnostics?.() ?? window[signalKey] ?? null, PROOF_SURFACE_SIGNAL_KEY);
};

const resolveWorkflowViewports = (workflow) => {
  const allViewports = resolveLayoutMatrixViewports(DEFAULT_PRESET_GROUP);
  const allowedIds = new Set(workflow.viewportIds);
  return allViewports.filter((viewport) => allowedIds.has(viewport.id));
};

const captureProofSurfaceRoute = async ({
  browser,
  workflowId,
  baseUrl,
  routeDefinition,
  viewport,
  timeoutMs,
  runDir,
  screenshotsDir,
  metadataDir,
  interactive = null
}) => {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  const consoleMessages = [];
  const httpFailures = [];
  const httpFailureKeys = new Set();
  let currentStage = 'initial-load';

  page.on('console', (message) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text()
    });
  });
  page.on('response', (response) => {
    if (response.status() !== 404) {
      return;
    }

    const request = response.request();
    const key = `404|${request.method()}|${request.resourceType()}|${response.url()}`;
    if (httpFailureKeys.has(key)) {
      return;
    }

    httpFailureKeys.add(key);
    httpFailures.push({
      stage: currentStage,
      status: response.status(),
      method: request.method(),
      resourceType: request.resourceType(),
      url: response.url()
    });
  });
  page.on('pageerror', (error) => {
    consoleMessages.push({
      type: 'pageerror',
      text: error.message
    });
  });

  const url = `${normalizeBaseUrl(baseUrl)}${routeDefinition.route}`;
  const screenshotPath = resolve(screenshotsDir, `${routeDefinition.id}-${viewport.id}.png`);
  const lifecycleScreenshotPath = resolve(screenshotsDir, `${routeDefinition.id}-${viewport.id}.lifecycle.png`);
  const failureScreenshotPath = resolve(screenshotsDir, `${routeDefinition.id}-${viewport.id}.failure.png`);
  const metadataPath = resolve(metadataDir, `${routeDefinition.id}-${viewport.id}.json`);
  const failureMetadataPath = resolve(metadataDir, `${routeDefinition.id}-${viewport.id}.failure.json`);

  const assertNoProofSurface404s = async (stage) => {
    const firstFailure = httpFailures[0];
    if (!firstFailure) {
      return;
    }

    const error = new Error(
      `Proof-shell 404 detected while capturing ${routeDefinition.id} on ${viewport.id} during ${stage}: ${firstFailure.url}`
    );
    error.code = PROOF_SURFACE_404_FAILURE_CODE;
    error.failureStage = stage;
    error.httpFailures = httpFailures;
    error.failurePath = failureMetadataPath;
    throw error;
  };

  try {
    currentStage = 'first-load';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const diagnostics = await waitForProofSurfaceDiagnostics(page, timeoutMs);
    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
      animations: 'disabled'
    });
    await assertNoProofSurface404s('first-load');

    let interaction = null;
    let interactionScreenshotPath = null;
    let lifecycle = null;

    if (interactive) {
      const baselineState = summarizeEdgeLiveInteractiveState(diagnostics);
      const timeline = [];
      const waitAfterKey = async (ms) => {
        await page.waitForTimeout(Math.max(0, Math.round(ms)));
      };

      if (baselineState.mode !== 'play') {
        const beforeSwitch = summarizeEdgeLiveInteractiveState(await readDiagnostics(page));
        await page.keyboard.press(interactive.ensureModeKey ?? 'm');
        await waitAfterKey(interactive.controlWaitMs ?? 160);
        const afterSwitchDiagnostics = await waitForProofSurfaceDiagnostics(page, timeoutMs);
        const afterSwitch = summarizeEdgeLiveInteractiveState(afterSwitchDiagnostics);
        timeline.push({
          id: 'ensure-play-mode',
          kind: 'mode',
          key: interactive.ensureModeKey ?? 'm',
          before: beforeSwitch,
          after: afterSwitch,
          changed: hasInteractiveStateDelta(beforeSwitch, afterSwitch)
        });

        if (afterSwitch.mode !== 'play') {
          const error = new Error(`Interactive play workflow did not switch into play mode on ${viewport.id}.`);
          error.code = INTERACTIVE_PLAY_FAILURE_CODE;
          error.failureStage = 'ensure-play-mode';
          error.interaction = {
            runId: INTERACTIVE_PLAY_MODE_RUN_ID,
            baseline: baselineState,
            timeline
          };
          throw error;
        }
      } else {
        timeline.push({
          id: 'ensure-play-mode',
          kind: 'mode',
          key: null,
          before: baselineState,
          after: baselineState,
          changed: false
        });
      }

      const runInteractiveStep = async (step) => {
        const before = summarizeEdgeLiveInteractiveState(await readDiagnostics(page));
        await page.keyboard.press(step.key);
        await waitAfterKey(step.kind === 'movement'
          ? interactive.movementWaitMs ?? 180
          : interactive.controlWaitMs ?? 160);
        const afterDiagnostics = await waitForProofSurfaceDiagnostics(page, timeoutMs);
        const after = summarizeEdgeLiveInteractiveState(afterDiagnostics);
        timeline.push({
          id: step.id,
          kind: step.kind,
          key: step.key,
          before,
          after,
          changed: hasInteractiveStateDelta(before, after)
        });
        return afterDiagnostics;
      };

      let finalDiagnostics = diagnostics;
      const movementSteps = interactive.timeline.filter((step) => step.kind === 'movement');
      const controlSteps = interactive.timeline.filter((step) => step.kind === 'control');
      let movementChanged = false;

      for (const step of movementSteps) {
        finalDiagnostics = await runInteractiveStep(step);
        if (hasInteractiveStateDelta(summarizeEdgeLiveInteractiveState(diagnostics), summarizeEdgeLiveInteractiveState(finalDiagnostics))) {
          movementChanged = true;
          break;
        }
      }

      for (const step of controlSteps) {
        finalDiagnostics = await runInteractiveStep(step);
      }

      if (!movementChanged) {
        const error = new Error(`Interactive play workflow on ${viewport.id} did not change runtime or projection state after movement.`);
        error.code = INTERACTIVE_PLAY_FAILURE_CODE;
        error.failureStage = 'interaction-state-delta';
        error.interaction = {
          runId: INTERACTIVE_PLAY_MODE_RUN_ID,
          baseline: baselineState,
          timeline,
          final: summarizeEdgeLiveInteractiveState(finalDiagnostics)
        };
        throw error;
      }

      const lifecycleDiagnostics = await waitForProofSurfaceDiagnostics(page, Math.max(2_000, Math.round(timeoutMs / 3)));
      await page.screenshot({
        path: lifecycleScreenshotPath,
        fullPage: false,
        animations: 'disabled'
      });
      interactionScreenshotPath = lifecycleScreenshotPath;
      lifecycle = createSnapshot('attempt-lifecycle', lifecycleDiagnostics, relativeToRun(runDir, lifecycleScreenshotPath));
      const finalState = summarizeEdgeLiveInteractiveState(lifecycleDiagnostics);
      const controlUsedCount = finalState.controlUsedCount;
      if (controlUsedCount <= 0) {
        const error = new Error(`Interactive play workflow on ${viewport.id} did not record any control_used events.`);
        error.code = INTERACTIVE_PLAY_FAILURE_CODE;
        error.failureStage = 'interaction-control-events';
        error.interaction = {
          runId: INTERACTIVE_PLAY_MODE_RUN_ID,
          baseline: baselineState,
          timeline,
          final: finalState
        };
        throw error;
      }

      interaction = {
        runId: INTERACTIVE_PLAY_MODE_RUN_ID,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        baseline: baselineState,
        final: finalState,
        keyTimeline: timeline,
        controlUsedCount,
        changed: hasInteractiveStateDelta(baselineState, finalState),
        mode: finalState.mode
      };
    } else {
      try {
        const lifecycleDiagnostics = await waitForProofSurfaceDiagnostics(page, Math.max(2_000, Math.round(timeoutMs / 3)), { requireActiveTrail: true });
        await page.screenshot({
          path: lifecycleScreenshotPath,
          fullPage: false,
          animations: 'disabled'
        });
        lifecycle = createSnapshot('attempt-lifecycle', lifecycleDiagnostics, relativeToRun(runDir, lifecycleScreenshotPath));
      } catch {
        lifecycle = {
          available: false
        };
      }
    }

    const record = {
      routeId: routeDefinition.id,
      routeLabel: routeDefinition.label,
      route: routeDefinition.route,
      viewport,
      url,
      diagnostics,
      consoleMessages,
      interaction,
      files: {
        screenshot: relativeToRun(runDir, screenshotPath),
        metadata: relativeToRun(runDir, metadataPath),
        ...(interactionScreenshotPath
          ? { interaction: relativeToRun(runDir, interactionScreenshotPath) }
          : {})
      }
    };

    await writeFile(metadataPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    return record;
  } catch (error) {
    let partialScreenshotPath = null;

    try {
      await page.screenshot({
        path: failureScreenshotPath,
        fullPage: false,
        animations: 'disabled'
      });
      partialScreenshotPath = failureScreenshotPath;
    } catch {
      partialScreenshotPath = null;
    }

    const failureArtifact = buildProofSurfaceFailureArtifact({
      error,
      workflowId,
      routeDefinition,
      viewport,
      url,
      stage: error?.failureStage ?? currentStage,
      httpFailures,
      consoleMessages,
      runDir,
      metadataPath: failureMetadataPath,
      screenshotPath: partialScreenshotPath
    });

    await writeFile(failureMetadataPath, `${JSON.stringify(failureArtifact, null, 2)}\n`, 'utf8');

    if (error instanceof Error) {
      error.failurePath = failureMetadataPath;
      error.httpFailures = httpFailures;
      if (!error.code) {
        error.code = PROOF_SURFACE_404_FAILURE_CODE;
      }
      throw error;
    }

    const wrappedError = new Error(String(error));
    wrappedError.code = PROOF_SURFACE_404_FAILURE_CODE;
    wrappedError.failurePath = failureMetadataPath;
    wrappedError.httpFailures = httpFailures;
    throw wrappedError;
  } finally {
    await context.close();
  }
};

const buildProofSurfaceMarkdownSummary = ({ workflowId, runId, sourceMode, baseUrl, captures, interaction }) => {
  const receipt = captures.find((capture) => capture?.diagnostics?.receipt)?.diagnostics?.receipt ?? null;
  const lines = [
    '# Mazer Edge Live Proof Surfaces',
    '',
    `- Workflow: ${workflowId}`,
    `- Run: ${runId}`,
    `- Source: ${sourceMode}`,
    `- Mode: ${receipt?.mode ?? 'n/a'}`,
    `- Base URL: ${baseUrl}`,
    '',
    '| Route | Viewport | Surface | Fixture | Skin | Modes | Screenshot |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  ];

  for (const capture of captures) {
    lines.push(
      `| ${capture.routeId} | ${capture.viewport.id} | ${capture.diagnostics?.surface ?? '-'} | ${capture.diagnostics?.fixture ?? '-'} | ${capture.diagnostics?.skin ?? '-'} | ${(capture.diagnostics?.modes ?? []).join(', ') || '-'} | ${capture.files.screenshot} |`
    );
    if (capture.diagnostics?.receipt) {
      lines.push(`  Receipt: events ${capture.diagnostics.receipt.eventCount}, privacy ${capture.diagnostics.receipt.privacyMode ?? 'n/a'}, widget ${capture.diagnostics.receipt.kpis?.widgetAttachRate ?? 'n/a'}, live ${capture.diagnostics.receipt.kpis?.liveActivityStartRate ?? 'n/a'}`);
    }
  }

  lines.push(
    '',
    '## Watch Pass Funnel',
    '',
    ...buildWatchPassFunnelLines(receipt)
  );

  if (interaction) {
    lines.push(
      '',
      '## Interactive Proof',
      '',
      `- Mode: ${interaction.mode ?? 'n/a'}`,
      `- Control used count: ${interaction.controlUsedCount ?? 0}`,
      `- Movement deltas: ${Array.isArray(interaction.movementDeltas) ? interaction.movementDeltas.filter((delta) => delta.moved).length : 0}`,
      `- Input timing: ${interaction.input ? `accepted ${interaction.input.acceptedCount}, dropped ${interaction.input.droppedCount}, merged ${interaction.input.mergedCount}` : 'n/a'}`,
      `- State changed: ${interaction.changed ? 'yes' : 'no'}`,
      '- Key timeline:'
    );

    for (const step of interaction.keyTimeline ?? []) {
      lines.push(
        `  - ${step.id}: ${step.kind} ${step.key ?? 'n/a'} changed=${step.changed ? 'yes' : 'no'}`
      );
    }
  }

  return `${lines.join('\n')}\n`;
};

export const captureEdgeLiveProofWorkflow = async ({
  workflowId,
  baseUrl = DEFAULT_BASE_URL,
  runId,
  timeoutMs = EDGE_LIVE_DEFAULT_CAPTURE_TIMEOUT_MS,
  previewTimeoutMs = EDGE_LIVE_DEFAULT_PREVIEW_TIMEOUT_MS,
  skipBuild = false,
  headless = DEFAULT_HEADLESS
} = {}) => {
  const workflow = resolveEdgeLiveWorkflow(workflowId);
  if (!workflow) {
    throw new Error(`Unknown edge live proof workflow: ${workflowId}`);
  }

  const requestedBaseUrl = normalizeBaseUrl(baseUrl);
  const resolvedRunId = resolveSessionId(runId ?? workflow.runId ?? workflowId);
  const runPaths = resolveEdgeLiveRunPaths(resolvedRunId);
  const previewUsed = !(await isBaseUrlReady(requestedBaseUrl));
  const preview = previewUsed
    ? await (async () => {
      if (!skipBuild) {
        await import('node:child_process').then(({ execFileSync }) => {
          if (process.platform === 'win32') {
            execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], {
              cwd: REPO_ROOT,
              stdio: 'inherit'
            });
            return;
          }

          execFileSync('npm', ['run', 'build'], {
            cwd: REPO_ROOT,
            stdio: 'inherit'
          });
        });
      }

      return launchPreviewServer({
        requestedBaseUrl,
        previewTimeoutMs
      });
    })()
    : null;
  const resolvedBaseUrl = normalizeBaseUrl(preview?.baseUrl ?? requestedBaseUrl);
  const sourceMode = resolveSourceMode({ explicitUrl: null, previewUsed });
  const browser = await chromium.launch({
    channel: 'msedge',
    headless,
    args: ['--use-angle=swiftshader']
  });

  await ensureDir(EDGE_LIVE_ROOT);
  await ensureDir(runPaths.runDir);
  await ensureDir(runPaths.screenshotsDir);
  await ensureDir(runPaths.metadataDir);

  try {
    const viewports = resolveWorkflowViewports(workflow);
    const captures = [];

    for (const routeDefinition of workflow.routes) {
      for (const viewport of viewports) {
        captures.push(await captureProofSurfaceRoute({
          browser,
          workflowId,
          baseUrl: resolvedBaseUrl,
          routeDefinition,
          viewport,
          timeoutMs,
          runDir: runPaths.runDir,
          screenshotsDir: runPaths.screenshotsDir,
          metadataDir: runPaths.metadataDir,
          interactive: workflow.interactive ?? null
        }));
      }
    }

    const interactive = captures.find((capture) => capture?.interaction)?.interaction ?? null;

    const summary = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      workflowId,
      runId: resolvedRunId,
      source: {
        mode: sourceMode,
        baseUrl: resolvedBaseUrl
      },
      artifactRoot: runPaths.runDir,
      files: {
        markdown: relativeToRun(runPaths.runDir, runPaths.markdownPath)
      },
      captures
    };

    const markdown = buildProofSurfaceMarkdownSummary({
      workflowId,
      runId: resolvedRunId,
      sourceMode,
      baseUrl: resolvedBaseUrl,
      captures,
      interaction: interactive
    });

    await writeFile(runPaths.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    await writeFile(runPaths.markdownPath, markdown, 'utf8');

    return {
      runDir: runPaths.runDir,
      summaryPath: runPaths.summaryPath,
      markdownPath: runPaths.markdownPath,
      summary
    };
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }
};

const captureViewportWithRetries = async (options) => {
  let lastError;

  for (let attempt = 1; attempt <= EDGE_LIVE_CAPTURE_RETRIES; attempt += 1) {
    try {
      return await captureViewport(options);
    } catch (error) {
      lastError = error;
      if (!isRetriableEdgeLiveCaptureError(error) || attempt >= EDGE_LIVE_CAPTURE_RETRIES) {
        break;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, EDGE_LIVE_CAPTURE_RETRY_DELAY_MS * attempt));
    }
  }

  throw lastError;
};

export const captureEdgeLive = async ({
  baseUrl = DEFAULT_BASE_URL,
  url,
  route,
  presetGroup = DEFAULT_PRESET_GROUP,
  runId,
  timeoutMs = EDGE_LIVE_DEFAULT_CAPTURE_TIMEOUT_MS,
  previewTimeoutMs = EDGE_LIVE_DEFAULT_PREVIEW_TIMEOUT_MS,
  skipBuild = false,
  headless = DEFAULT_HEADLESS,
  experiment = resolveExperimentSelection()
} = {}) => {
  const explicitUrl = typeof url === 'string' && url.trim().length > 0 ? url.trim() : null;
  const requestedBaseUrl = normalizeBaseUrl(baseUrl);
  const resolvedRunId = resolveSessionId(runId);
  const resolvedRoute = route ?? resolveEdgeLiveDefaultRoute(runId);
  const runPaths = resolveEdgeLiveRunPaths(resolvedRunId);
  const viewports = resolveEdgeLiveViewports(presetGroup, resolvedRunId);
  const resolvedTimeoutMs = resolveEdgeLiveTimeoutMs(resolvedRunId, timeoutMs);

  await ensureDir(EDGE_LIVE_ROOT);
  await ensureDir(runPaths.runDir);
  await ensureDir(runPaths.screenshotsDir);
  await ensureDir(runPaths.videosDir);
  await ensureDir(runPaths.metadataDir);

  const previewUsed = !explicitUrl && !(await isBaseUrlReady(requestedBaseUrl));
  const preview = previewUsed
    ? await (async () => {
      if (!skipBuild) {
        await import('node:child_process').then(({ execFileSync }) => {
          if (process.platform === 'win32') {
            execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], {
              cwd: REPO_ROOT,
              stdio: 'inherit'
            });
            return;
          }

          execFileSync('npm', ['run', 'build'], {
            cwd: REPO_ROOT,
            stdio: 'inherit'
          });
        });
      }

      return launchPreviewServer({
        requestedBaseUrl,
        previewTimeoutMs
      });
    })()
    : null;

  const resolvedBaseUrl = normalizeBaseUrl(preview?.baseUrl ?? requestedBaseUrl);
  const sourceMode = resolveSourceMode({ explicitUrl, previewUsed });
  const experimentManifest = buildExperimentManifest({
    kind: 'edge-live',
    label: resolvedRunId,
    runId: resolvedRunId,
    toggles: experiment.toggles
  });
  const browser = await chromium.launch({
    channel: 'msedge',
    headless,
    args: ['--use-angle=swiftshader']
  });

  try {
    const captures = [];

    for (const viewport of viewports) {
      captures.push(await captureViewportWithRetries({
        browser,
        baseUrl: resolvedBaseUrl,
        explicitUrl,
        viewport,
        route: resolvedRoute,
        runId: resolvedRunId,
        timeoutMs: resolvedTimeoutMs,
        runDir: runPaths.runDir,
        screenshotsDir: runPaths.screenshotsDir,
        videosDir: runPaths.videosDir,
        metadataDir: runPaths.metadataDir,
        experiment: experimentManifest
      }));
    }

    const receipt = buildEdgeLiveReceiptFromCaptures({
      captures,
      runId: resolvedRunId,
      toggles: experiment.toggles
    });
    const interaction = captures.find((capture) => capture?.interaction)?.interaction ?? null;

    const summary = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      runId: resolvedRunId,
      experiment: experimentManifest,
      business: {
        eventCount: receipt.eventCount,
        experimentIds: receipt.experimentIds,
        mode: receipt.mode,
        privacyMode: receipt.privacyMode,
        sourceCta: receipt.sourceCta,
        sourceCtas: receipt.sourceCtas,
        planIds: receipt.planIds,
        kpis: receipt.kpis,
        playMetrics: receipt.playMetrics,
        watchPass: {
          mode: receipt.mode,
          sourceCta: receipt.sourceCta,
          sourceCtas: receipt.sourceCtas,
          planIds: receipt.planIds,
          paywallViewCount: receipt.kpis.paywallViewCount,
          planSelectedCount: receipt.kpis.planSelectedCount,
          paywallViewToPlanSelect: receipt.kpis.paywall_view_to_plan_select,
          paywallViewToPurchaseCompleted: receipt.kpis.paywall_view_to_purchase_completed,
          purchaseCompletedCount: receipt.kpis.purchaseCompletedCount,
          widgetAttachRate: receipt.kpis.widget_attach_rate,
          liveActivityStartRate: receipt.kpis.live_activity_start_rate,
          reducedMotionAdoption: receipt.kpis.reduced_motion_adoption,
          privateModeAdoption: receipt.kpis.private_mode_adoption
        }
      },
      source: {
        mode: sourceMode,
        baseUrl: resolvedBaseUrl,
        explicitUrl
      },
      presetGroup,
      artifactRoot: runPaths.runDir,
      files: {
        markdown: relativeToRun(runPaths.runDir, runPaths.markdownPath),
      experiment: relativeToRun(runPaths.runDir, resolve(runPaths.runDir, 'experiment.json')),
      receipt: relativeToRun(runPaths.runDir, resolve(runPaths.runDir, 'receipt.json'))
    },
      captures: captures.map((capture) => ({
        viewport: capture.viewport,
        route: capture.route,
        url: capture.url,
        experiment: capture.experiment,
        files: capture.files,
        board: capture.secondLoad.board,
        hud: capture.secondLoad.hud,
        verdicts: capture.secondLoad.verdicts,
        telemetry: capture.secondLoad.telemetry,
        projection: capture.secondLoad.projection,
        lifecycle: capture.lifecycle,
        endWindow: capture.endWindow,
        interaction: capture.interaction,
        consoleMessageCount: capture.consoleMessages.length
      }))
    };

    const markdown = buildMarkdownSummary({
      runId: resolvedRunId,
      sourceMode,
      baseUrl: resolvedBaseUrl,
      explicitUrl,
      presetGroup,
      experiment: experimentManifest,
      captures: summary.captures,
      receipt,
      interaction
    });

    await writeFile(resolve(runPaths.runDir, 'experiment.json'), `${JSON.stringify(experimentManifest, null, 2)}\n`, 'utf8');
    await writeFile(resolve(runPaths.runDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    await writeFile(runPaths.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    await writeFile(runPaths.markdownPath, markdown, 'utf8');

    return {
      runDir: runPaths.runDir,
      summaryPath: runPaths.summaryPath,
      markdownPath: runPaths.markdownPath,
      summary
    };
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }
};

const main = async () => {
  const args = parseCliArgs();
  const experiment = resolveExperimentSelection(args);
  const workflow = typeof args.run === 'string' ? resolveEdgeLiveWorkflow(args.run) : null;
  const result = workflow
    ? await captureEdgeLiveProofWorkflow({
      workflowId: args.run,
      baseUrl: typeof args['base-url'] === 'string' ? args['base-url'] : DEFAULT_BASE_URL,
      runId: typeof args['run-id'] === 'string' ? args['run-id'] : undefined,
      timeoutMs: parseIntegerArg(args.timeout, EDGE_LIVE_DEFAULT_CAPTURE_TIMEOUT_MS),
      previewTimeoutMs: parseIntegerArg(args['preview-timeout'], EDGE_LIVE_DEFAULT_PREVIEW_TIMEOUT_MS),
      skipBuild: args['skip-build'] === true || args['skip-build'] === 'true',
      headless: args.headless === undefined ? DEFAULT_HEADLESS : !(args.headless === false || args.headless === 'false')
    })
    : await captureEdgeLive({
      baseUrl: typeof args['base-url'] === 'string' ? args['base-url'] : DEFAULT_BASE_URL,
      url: typeof args.url === 'string' ? args.url : undefined,
      route: typeof args.route === 'string' ? args.route : undefined,
      presetGroup: typeof args.preset === 'string' ? args.preset : DEFAULT_PRESET_GROUP,
      runId: typeof args.run === 'string' ? args.run : undefined,
      timeoutMs: parseIntegerArg(args.timeout, EDGE_LIVE_DEFAULT_CAPTURE_TIMEOUT_MS),
      previewTimeoutMs: parseIntegerArg(args['preview-timeout'], EDGE_LIVE_DEFAULT_PREVIEW_TIMEOUT_MS),
      skipBuild: args['skip-build'] === true || args['skip-build'] === 'true',
      headless: args.headless === undefined ? DEFAULT_HEADLESS : !(args.headless === false || args.headless === 'false'),
      experiment
    });

  process.stdout.write(`${JSON.stringify({
    runDir: result.runDir,
    summaryPath: result.summaryPath,
    markdownPath: result.markdownPath,
    captureCount: result.summary.captures.length
  }, null, 2)}\n`);
};

if (isDirectRun) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
