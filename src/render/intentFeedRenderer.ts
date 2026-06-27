import Phaser from 'phaser';
import { legacyTuning } from '../config/tuning';
import type { PresentationDeploymentProfile } from '../boot/presentation';
import {
  MAX_INTENT_VISIBLE_ENTRIES,
  type IntentFeedState
} from '../mazer-core/intent';
import type { IntentKind } from '../mazer-core/intent/IntentEvent';
import {
  formatIntentFeedRole,
  resolveIntentFeedRole,
  resolveIntentRiskCue,
  resolveIntentSemanticTag
} from '../mazer-core/intent/IntentFeed';
import { palette } from './palette';
import { applyTextResolution, resolveHudTextResolution } from './textCrispness';
import { resolveSceneViewport } from './viewport';

type FeedDock = 'bottom-center' | 'bottom-left' | 'bottom-right' | 'right-rail' | 'left-rail';
type FeedPlacementMode = 'bottom' | 'rail';

export interface IntentFeedAnchorRect {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface IntentFeedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface IntentFeedLayout {
  dock: FeedDock;
  mode: FeedPlacementMode;
  rect: IntentFeedRect;
  compact: boolean;
  maxVisibleEvents: number;
}

export interface IntentFeedPanelMetrics {
  compact: boolean;
  mode: FeedPlacementMode;
  width: number;
  height: number;
  maxVisibleEvents: number;
}

export interface IntentFeedHudLayoutSnapshot {
  visible: boolean;
  dock?: FeedDock;
  mode?: FeedPlacementMode;
  compact: boolean;
  rect?: IntentFeedRect;
  statusVisible: boolean;
  statusText: string | null;
  quickThoughtCount: number;
  maxVisibleEvents: number;
  onboardingVisible: boolean;
  onboardingLabel: string | null;
  riskVisible: boolean;
  nextRiskLabel: string | null;
}

export interface IntentFeedLayoutAnchors {
  player?: IntentFeedAnchorRect | null;
  objective?: IntentFeedAnchorRect | null;
  board?: IntentFeedAnchorRect | null;
  title?: IntentFeedAnchorRect | null;
  install?: IntentFeedAnchorRect | null;
  avoid?: IntentFeedAnchorRect[] | null;
}

interface IntentFeedPalette {
  panel: number;
  panelStroke: number;
  accent: number;
  hintText: number;
}

interface IntentFeedHudOptions {
  palette?: typeof palette;
  profile?: PresentationDeploymentProfile;
}

interface IntentFeedRiskMeta {
  nextRiskLabel?: string | null;
  statusLabel?: string | null;
  onboardingLabel?: string | null;
}

interface WeightedIntentFeedRect extends IntentFeedRect {
  key: string;
}

const DOCK_ORDER: readonly FeedDock[] = ['right-rail', 'left-rail', 'bottom-center', 'bottom-left', 'bottom-right'];

export const clampIntentFeedSummary = (summary: string, maxChars: number): string => {
  const normalized = summary.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxChars) {
    return normalized;
  }

  if (maxChars <= 3) {
    return normalized.slice(0, maxChars);
  }

  return `${normalized.slice(0, maxChars - 3).trimEnd()}...`;
};

const trimIntentSummaryPunctuation = (summary: string): string => (
  summary.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/u, '')
);

export const formatIntentHudSummary = (summary: string): string => {
  const normalized = trimIntentSummaryPunctuation(summary);
  const rewrite = (
    pattern: RegExp,
    formatter: (...matches: string[]) => string
  ): string | null => {
    const matches = normalized.match(pattern);
    return matches ? formatter(...matches) : null;
  };

  return rewrite(/^Seeing the exit(?: line)? from (.+)$/u, () => 'I can see the exit.')
    ?? rewrite(/^Watching (.+) pressure near (.+)$/u, () => 'That side feels risky.')
    ?? rewrite(/^Spotting (.+) timing at (.+)$/u, () => 'That timing looks bad.')
    ?? rewrite(/^Checking the (.+) near (.+)$/u, () => 'There might be something here.')
    ?? rewrite(/^Reading the (.+) timing at (.+)$/u, () => 'Wait. Not yet.')
    ?? rewrite(/^Recalling the dead end at (.+)$/u, () => 'Dead end. Back up.')
    ?? rewrite(/^Dead end at (.+); back out$/u, () => 'Dead end. Back up.')
    ?? rewrite(/^Noting (.+) near (.+)$/u, () => 'This spot looks useful.')
    ?? rewrite(/^Replanning at (.+); try (.+)$/u, () => 'That path wasted time.')
    ?? rewrite(/^Taking the exit from (.+)$/u, () => 'Almost there.')
    ?? rewrite(/^Taking (.+) from (.+)$/u, () => 'Closer this way.')
    ?? rewrite(/^Waiting for the gate at (.+)$/u, () => 'Wait. The gate will open.')
    ?? rewrite(/^Checking (.+) from (.+)$/u, () => 'This side looks better.')
    ?? rewrite(/^There is a marker here$/u, () => 'This spot looks useful.')
    ?? normalized;
};

const INTENT_HUD_STATUS_LEADS: Partial<Record<IntentKind, string>> = {};

const resolveIntentHudStatusLead = (kind: IntentKind | null | undefined): string => (
  kind ? INTENT_HUD_STATUS_LEADS[kind] ?? '' : ''
);

const normalizeAnchorRect = (
  key: string,
  anchor: IntentFeedAnchorRect | null | undefined,
  pad: number
): WeightedIntentFeedRect | null => {
  if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
    return null;
  }

  const width = Math.max(1, Math.round(anchor.width ?? pad * 2));
  const height = Math.max(1, Math.round(anchor.height ?? pad * 2));
  return {
    key,
    left: Math.round(anchor.x - (width / 2) - pad),
    top: Math.round(anchor.y - (height / 2) - pad),
    width: width + (pad * 2),
    height: height + (pad * 2)
  };
};

const rectRight = (rect: IntentFeedRect): number => rect.left + rect.width;

const rectBottom = (rect: IntentFeedRect): number => rect.top + rect.height;

const rectCenterX = (rect: IntentFeedRect): number => rect.left + (rect.width / 2);

const intersectsRect = (left: IntentFeedRect, right: IntentFeedRect): boolean => (
  left.left < rectRight(right)
  && rectRight(left) > right.left
  && left.top < rectBottom(right)
  && rectBottom(left) > right.top
);

const overlapArea = (left: IntentFeedRect, right: IntentFeedRect): number => {
  if (!intersectsRect(left, right)) {
    return 0;
  }

  const width = Math.min(rectRight(left), rectRight(right)) - Math.max(left.left, right.left);
  const height = Math.min(rectBottom(left), rectBottom(right)) - Math.max(left.top, right.top);
  return Math.max(0, width) * Math.max(0, height);
};

const clampFeedRect = (
  rect: IntentFeedRect,
  viewportWidth: number,
  viewportHeight: number,
  insetX: number,
  insetY: number
): IntentFeedRect => ({
  ...rect,
  left: Math.max(insetX, Math.min(rect.left, Math.max(insetX, viewportWidth - insetX - rect.width))),
  top: Math.max(insetY, Math.min(rect.top, Math.max(insetY, viewportHeight - insetY - rect.height)))
});

const resolveDock = (rect: IntentFeedRect, viewportWidth: number): FeedDock => {
  const centerDelta = rectCenterX(rect) - (viewportWidth / 2);
  if (Math.abs(centerDelta) <= Math.max(28, viewportWidth * 0.08)) {
    return 'bottom-center';
  }

  return centerDelta < 0 ? 'bottom-left' : 'bottom-right';
};

const resolveRailDock = (rect: IntentFeedRect, viewportWidth: number): FeedDock => (
  rectCenterX(rect) >= (viewportWidth / 2) ? 'right-rail' : 'left-rail'
);

const isBottomDockedAnchorRect = (
  rect: WeightedIntentFeedRect | null | undefined,
  viewportHeight: number
): boolean => {
  if (!rect) {
    return false;
  }

  const centerY = rect.top + (rect.height / 2);
  return rect.top >= viewportHeight * 0.58 || centerY >= viewportHeight * 0.62;
};

export const resolveIntentFeedRoleLabel = (kind: Parameters<typeof resolveIntentFeedRole>[0]): string => (
  formatIntentFeedRole(kind)
);

const RISK_PRIORITY: Record<NonNullable<ReturnType<typeof resolveIntentSemanticTag>>, number> = {
  hazard_seen: 5,
  timing_wait: 4,
  route_committed: 3,
  route_rejected: 3,
  memory_recall: 2,
  goal_progress: 1
};

type RiskRecord = {
  kind: Parameters<typeof resolveIntentFeedRole>[0];
  summary: string;
  step: number;
};

export const resolveIntentFeedVisibleEntries = (
  state: IntentFeedState | null,
  maxVisibleEntries: number
): IntentFeedState['entries'] => (state?.events ?? state?.entries ?? []).slice(0, Math.max(0, maxVisibleEntries));

export const shouldRenderIntentFeedStatusLine = (
  visibleEntryCount: number,
  statusLabel: string
): boolean => visibleEntryCount === 0 && statusLabel.trim().length > 0;

const resolveIntentFeedLineAlphaScale = (slot: number): number => (
  legacyTuning.menu.intentFeed.lineAlphaScales[
    Math.max(0, Math.min(slot, legacyTuning.menu.intentFeed.lineAlphaScales.length - 1))
  ] ?? legacyTuning.menu.intentFeed.lineAlphaScales[legacyTuning.menu.intentFeed.lineAlphaScales.length - 1] ?? 1
);

export const resolveNextRiskLabel = (state: IntentFeedState | null): string | null => {
  const records: RiskRecord[] = state
    ? [
        ...(state.status ? [state.status] : []),
        ...(state.events ?? state.entries ?? [])
      ]
    : [];

  const candidates = records
    .map((record) => {
      const semanticTag = resolveIntentSemanticTag(record.kind);
      const riskCue = resolveIntentRiskCue(record.kind);
      return {
        record,
        semanticTag,
        riskCue,
        priority: semanticTag ? RISK_PRIORITY[semanticTag] ?? 0 : 0
      };
    })
    .filter((item): item is {
      record: RiskRecord;
      semanticTag: NonNullable<ReturnType<typeof resolveIntentSemanticTag>> | null;
      riskCue: NonNullable<ReturnType<typeof resolveIntentRiskCue>>;
      priority: number;
    } => item.riskCue !== null)
    .sort((left, right) => (
      right.priority - left.priority
      || right.record.step - left.record.step
    ));

  const candidate = candidates[0] ?? null;
  return candidate ? `Next risk: ${candidate.riskCue}` : null;
};

const dedupeRects = (rects: Array<WeightedIntentFeedRect | null | undefined>): WeightedIntentFeedRect[] => {
  const seen = new Set<string>();
  const result: WeightedIntentFeedRect[] = [];

  for (const rect of rects) {
    if (!rect) {
      continue;
    }

    const key = `${rect.key}:${rect.left}:${rect.top}:${rect.width}:${rect.height}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(rect);
  }

  return result;
};

const resolveMaxVisibleEvents = (
  viewport: { width: number; height: number },
  compact: boolean
): number => {
  const tuning = legacyTuning.menu.intentFeed;
  const isPortrait = viewport.height >= viewport.width;
  const expandedViewport = viewport.width >= tuning.expandedVisibleEntriesMinWidthPx
    && viewport.height >= tuning.expandedVisibleEntriesMinHeightPx;
  if (expandedViewport) {
    return tuning.expandedVisibleEntries;
  }

  const landscapeViewport = !isPortrait
    && viewport.width >= tuning.compactLandscapeVisibleEntriesMinWidthPx
    && viewport.height >= tuning.compactLandscapeVisibleEntriesMinHeightPx;
  if (landscapeViewport) {
    return compact ? tuning.landscapeVisibleEntries : Math.max(tuning.landscapeVisibleEntries, tuning.portraitVisibleEntries);
  }

  return tuning.portraitVisibleEntries;
};

const resolveFeedWidth = (
  viewportWidth: number,
  compact: boolean,
  railMode: boolean
): number => {
  const tuning = legacyTuning.menu.intentFeed;
  const insetX = tuning.insetXPx;
  const wideBottomPanel = !compact && !railMode && viewportWidth >= tuning.commentaryRailMinViewportWidthPx;
  const maxWidth = compact
    ? tuning.compactWidthPx
    : railMode
      ? Math.min(tuning.widthPx, Math.round(viewportWidth * 0.28))
      : wideBottomPanel
        ? Math.min(tuning.desktopBottomWidthPx, Math.round(viewportWidth * tuning.desktopBottomMaxWidthRatio))
        : tuning.widthPx;
  const minWidth = compact
    ? tuning.compactMinWidthPx
    : wideBottomPanel
      ? tuning.desktopBottomMinWidthPx
      : tuning.minWidthPx;
  const widthRatio = compact
    ? tuning.compactMaxWidthRatio
    : railMode
      ? Math.min(tuning.maxWidthRatio, 0.28)
      : wideBottomPanel
        ? tuning.desktopBottomMaxWidthRatio
        : tuning.maxWidthRatio;
  const availableWidth = Math.max(96, viewportWidth - (insetX * 2));
  const desiredWidth = Math.round(viewportWidth * widthRatio);
  const cappedWidth = Math.min(maxWidth, availableWidth);
  const floorWidth = Math.min(minWidth, cappedWidth);

  return Math.max(floorWidth, Math.min(cappedWidth, desiredWidth));
};

const resolveFeedHeight = (
  compact: boolean,
  quickThoughtCount: number,
  hasStatus: boolean,
  hasOnboarding = false
): number => {
  void hasOnboarding;
  const tuning = legacyTuning.menu.intentFeed;
  const lineHeight = compact ? tuning.compactLineHeightPx : tuning.lineHeightPx;
  const paddingY = compact ? tuning.compactPaddingYPx : tuning.paddingYPx;
  const entryGap = compact ? tuning.compactEntryGapPx : tuning.entryGapPx;
  const lineCount = Math.max(0, quickThoughtCount) + (hasStatus ? 1 : 0);
  const gaps = Math.max(0, lineCount - 1);

  return Math.max(
    compact ? tuning.compactMinHeightPx : tuning.minHeightPx,
    (paddingY * 2)
      + (lineCount * lineHeight)
      + (gaps * entryGap)
  );
};

const canUseRailMode = (
  viewport: { width: number; height: number },
  profile?: PresentationDeploymentProfile
): boolean => {
  const tuning = legacyTuning.menu.intentFeed;
  const aspectRatio = viewport.width / Math.max(1, viewport.height);
  const recoveryOverride = profile === 'recovery';
  const railEnabled = recoveryOverride || tuning.commentaryRailEnabled;

  if (!railEnabled) {
    return false;
  }

  return (
    viewport.width >= tuning.commentaryRailMinViewportWidthPx
    && viewport.height >= tuning.commentaryRailMinViewportHeightPx
    && aspectRatio >= tuning.commentaryRailMinAspectRatio
  );
};

export const resolveIntentFeedPanelMetrics = (
  viewport: { width: number; height: number },
  hasStatus = true,
  hasOnboarding = false,
  profile?: PresentationDeploymentProfile
): IntentFeedPanelMetrics => {
  const compact = viewport.width <= legacyTuning.menu.layout.narrowBreakpoint;
  const railMode = canUseRailMode(viewport, profile);
  const maxVisibleEvents = resolveMaxVisibleEvents(viewport, compact);

  return {
    compact,
    mode: railMode ? 'rail' : 'bottom',
    width: resolveFeedWidth(viewport.width, compact, railMode),
    height: resolveFeedHeight(compact, maxVisibleEvents, hasStatus, hasOnboarding),
    maxVisibleEvents
  };
};

export const resolveIntentFeedLayout = (
  viewport: { width: number; height: number },
  entryCount: number,
  anchors: IntentFeedLayoutAnchors = {},
  hasStatus = true,
  hasOnboarding = false,
  profile?: PresentationDeploymentProfile
): IntentFeedLayout => {
  const tuning = legacyTuning.menu.intentFeed;
  const metrics = resolveIntentFeedPanelMetrics(viewport, hasStatus, hasOnboarding, profile);
  const compact = metrics.compact;
  const railMode = metrics.mode === 'rail';
  const visibleEventCount = Math.max(0, Math.min(metrics.maxVisibleEvents, Math.trunc(entryCount)));
  const feedWidth = metrics.width;
  const feedHeight = resolveFeedHeight(compact, visibleEventCount, hasStatus, hasOnboarding);
  const boardRect = normalizeAnchorRect('board', anchors.board, 0);
  const titleRect = normalizeAnchorRect('title', anchors.title, 0);
  const installRect = normalizeAnchorRect('install', anchors.install, 0);
  const bottomInstallRect = isBottomDockedAnchorRect(installRect, viewport.height) ? installRect : null;
  const criticalRects = dedupeRects([
    normalizeAnchorRect('player', anchors.player, tuning.occlusionPadPx),
    normalizeAnchorRect('objective', anchors.objective, tuning.occlusionPadPx),
    boardRect,
    titleRect,
    installRect,
    ...(anchors.avoid ?? []).map((anchor, index) => normalizeAnchorRect(`avoid-${index}`, anchor, tuning.occlusionPadPx))
  ]);

  const insetX = tuning.insetXPx;
  const insetY = tuning.insetYPx;
  const preferredCenterX = railMode
    ? viewport.width - insetX - (feedWidth / 2)
    : boardRect ? rectCenterX(boardRect) : viewport.width / 2;
  const laneBottom = railMode
    ? Math.max(insetY + feedHeight, viewport.height - insetY)
    : bottomInstallRect
      ? bottomInstallRect.top - tuning.installGapPx
      : viewport.height - insetY;
  const preferredTop = railMode
    ? Math.max(insetY, Math.round((viewport.height - feedHeight) / 2))
    : Math.max(insetY, laneBottom - feedHeight);
  const laneTop = railMode
    ? Math.max(insetY, Math.round((viewport.height - feedHeight) / 2))
    : boardRect
      ? rectBottom(boardRect) + tuning.boardGapPx
      : Math.max(insetY, Math.round(viewport.height * 0.62));
  const candidateCenters = railMode
    ? [
        viewport.width - insetX - (feedWidth / 2),
        viewport.width - insetX - feedWidth,
        insetX + (feedWidth / 2)
      ]
    : [
        preferredCenterX,
        viewport.width / 2,
        boardRect ? boardRect.left + (feedWidth / 2) : null,
        boardRect ? rectRight(boardRect) - (feedWidth / 2) : null,
        insetX + (feedWidth / 2),
        viewport.width - insetX - (feedWidth / 2)
      ]
      .filter((value, index, array): value is number => (
        Number.isFinite(value)
        && array.findIndex((candidate) => Number.isFinite(candidate) && Math.abs(Number(candidate) - Number(value)) < 1) === index
      ));
  const candidateTops = railMode
    ? [
        preferredTop,
        Math.max(insetY, Math.round(viewport.height * 0.44)),
        Math.max(insetY, Math.round(viewport.height * 0.56))
      ]
    : [
        Math.max(insetY, preferredTop),
        Math.max(insetY, preferredTop - Math.max(8, Math.round(feedHeight * 0.08))),
        Math.max(insetY, laneTop)
      ].filter((value, index, array) => array.indexOf(value) === index);
  const candidates = candidateCenters.flatMap((centerX) => candidateTops.map((top) => {
    const rect = clampFeedRect({
      left: Math.round(centerX - (feedWidth / 2)),
      top,
      width: feedWidth,
      height: feedHeight
    }, viewport.width, viewport.height, insetX, insetY);
    const overlaps = criticalRects.filter((criticalRect) => intersectsRect(rect, criticalRect));
    const overlapScore = overlaps.reduce((total, criticalRect) => total + overlapArea(rect, criticalRect), 0);
    const laneOverflow = Math.max(0, laneTop - rect.top) + Math.max(0, rectBottom(rect) - laneBottom);
    const dock = railMode ? resolveRailDock(rect, viewport.width) : resolveDock(rect, viewport.width);

    return {
      dock,
      rect,
      compact,
      mode: railMode ? 'rail' as const : 'bottom' as const,
      maxVisibleEvents: metrics.maxVisibleEvents,
      overlapCount: overlaps.length,
      overlapScore,
      laneOverflow,
      bottomSlack: Math.max(0, laneBottom - rectBottom(rect)),
      centerDrift: Math.abs(rectCenterX(rect) - preferredCenterX),
      dockOrder: DOCK_ORDER.indexOf(dock)
    };
  }));

  candidates.sort((left, right) => {
    if (left.laneOverflow !== right.laneOverflow) {
      return left.laneOverflow - right.laneOverflow;
    }
    if (left.overlapCount !== right.overlapCount) {
      return left.overlapCount - right.overlapCount;
    }
    if (left.overlapScore !== right.overlapScore) {
      return left.overlapScore - right.overlapScore;
    }
    if (left.bottomSlack !== right.bottomSlack) {
      return left.bottomSlack - right.bottomSlack;
    }
    if (left.dockOrder !== right.dockOrder) {
      return left.dockOrder - right.dockOrder;
    }
    return left.centerDrift - right.centerDrift;
  });

  return {
    dock: candidates[0].dock,
    mode: candidates[0].mode,
    rect: candidates[0].rect,
    compact,
    maxVisibleEvents: metrics.maxVisibleEvents
  };
};

export const createIntentFeedHud = (
  scene: Phaser.Scene,
  options: IntentFeedHudOptions = {}
) => {
  const colors: IntentFeedPalette = {
    panel: options.palette?.hud.panel ?? palette.hud.panel,
    panelStroke: options.palette?.hud.panelStroke ?? palette.hud.panelStroke,
    accent: options.palette?.hud.accent ?? palette.hud.accent,
    hintText: options.palette?.hud.hintText ?? palette.hud.hintText
  };
  const root = scene.add.container(0, 0).setDepth(10.6).setVisible(false);
  const intentFontFamily = '"Bahnschrift SemiCondensed", "Trebuchet MS", "Segoe UI", sans-serif';
  const initialResolution = resolveHudTextResolution(resolveSceneViewport(scene));
  const status = applyTextResolution(scene.add.text(0, 0, '', {
    color: `#${colors.accent.toString(16).padStart(6, '0')}`,
    fontFamily: intentFontFamily,
    fontSize: `${legacyTuning.menu.intentFeed.statusFontPx}px`,
    fontStyle: 'bold'
  }).setOrigin(0.5, 1).setAlign('center'), initialResolution);
  const entries = Array.from({ length: MAX_INTENT_VISIBLE_ENTRIES }, () => (
    applyTextResolution(scene.add.text(0, 0, '', {
      color: `#${colors.hintText.toString(16).padStart(6, '0')}`,
      fontFamily: intentFontFamily,
      fontSize: `${legacyTuning.menu.intentFeed.entryFontPx}px`
    }).setOrigin(0.5, 1).setAlign('center'), initialResolution)
  ));
  const risk = applyTextResolution(scene.add.text(0, 0, '', {
    color: `#${colors.accent.toString(16).padStart(6, '0')}`,
    fontFamily: intentFontFamily,
    fontSize: `${Math.max(9, legacyTuning.menu.intentFeed.statusFontPx - 1)}px`,
    fontStyle: 'bold'
  }).setOrigin(0.5, 1).setAlign('center'), initialResolution);
  let entryTransitions = new Map<string, {
    slot: number;
    changedAtMs: number;
  }>();
  let lastSnapshot: IntentFeedHudLayoutSnapshot = {
      visible: false,
      compact: false,
      statusVisible: false,
      statusText: null,
      quickThoughtCount: 0,
      maxVisibleEvents: 1,
      onboardingVisible: false,
      onboardingLabel: null,
      riskVisible: false,
      nextRiskLabel: null
    };

  root.add([status, ...entries, risk]);

  return {
    setState(
      state: IntentFeedState | null,
      anchors: IntentFeedLayoutAnchors = {},
      riskMeta: IntentFeedRiskMeta = {}
    ): void {
      const tuning = legacyTuning.menu.intentFeed;
      const visibleStatus = state?.status ?? null;
      const rawEntries = state?.events ?? state?.entries ?? [];
      const viewport = resolveSceneViewport(scene);
      const textResolution = resolveHudTextResolution(viewport);
      const hasStatusOverride = typeof riskMeta.statusLabel === 'string' && riskMeta.statusLabel.trim().length > 0;
      const wideDesktopLine = viewport.width >= 1200;
      const reserveStatusLine = rawEntries.length === 0 && (hasStatusOverride || Boolean(visibleStatus));
      const layout = resolveIntentFeedLayout(
        viewport,
        rawEntries.length,
        anchors,
        reserveStatusLine,
        false,
        options.profile
      );
      const visibleEntries = resolveIntentFeedVisibleEntries(state, layout.maxVisibleEvents);
      const statusMaxChars = layout.compact
        ? tuning.compactStatusMaxChars
        : Math.max(tuning.statusMaxChars, wideDesktopLine ? 58 : tuning.statusMaxChars);
      const entryMaxChars = layout.compact
        ? tuning.compactSummaryMaxChars
        : Math.max(tuning.summaryMaxChars, wideDesktopLine ? 56 : tuning.summaryMaxChars);
      const statusLabel = hasStatusOverride
        ? clampIntentFeedSummary(formatIntentHudSummary(riskMeta.statusLabel ?? ''), statusMaxChars)
        : visibleStatus
          ? clampIntentFeedSummary(
            (() => {
              const lead = resolveIntentHudStatusLead(visibleStatus.kind);
              const summary = formatIntentHudSummary(visibleStatus.summary);
              return lead ? `${lead}: ${summary}` : summary;
            })(),
            statusMaxChars
          )
          : '';
      const hasStatusLine = shouldRenderIntentFeedStatusLine(visibleEntries.length, statusLabel);

      if (!hasStatusLine && visibleEntries.length === 0) {
        root.setVisible(false);
        lastSnapshot = {
          visible: false,
          compact: layout.compact,
          mode: layout.mode,
          statusVisible: false,
          statusText: null,
          quickThoughtCount: 0,
          maxVisibleEvents: layout.maxVisibleEvents,
          onboardingVisible: false,
          onboardingLabel: null,
          riskVisible: false,
          nextRiskLabel: null
        };
        return;
      }

      const lineHeight = layout.compact ? tuning.compactLineHeightPx : tuning.lineHeightPx;
      const entryGap = layout.compact ? tuning.compactEntryGapPx : tuning.entryGapPx;
      const paddingY = layout.compact ? tuning.compactPaddingYPx : tuning.paddingYPx;
      const statusFontPx = (layout.compact ? tuning.compactStatusFontPx : tuning.statusFontPx) + 1;
      const entryFontPx = (layout.compact ? tuning.compactEntryFontPx : tuning.entryFontPx) + 1;
      const fadeDurationMs = Math.max(1, Math.round(tuning.fadeDurationMs ?? (tuning.transitionMs * 1.25)));
      const transitionStartAlpha = Phaser.Math.Clamp(tuning.transitionStartAlpha, 0, 1);
      const replacementOverlapMs = Math.max(0, Math.round(tuning.replacementOverlapMs ?? 0));
      const nowMs = scene.time.now;
      const laneCenterX = layout.rect.width / 2;
      const baselineY = layout.rect.height - paddingY;
      const perspectiveInsetStep = layout.compact ? 7 : 10;
      const perspectiveRiseStep = layout.compact ? tuning.compactUpwardDriftPx : tuning.upwardDriftPx;

      root.setPosition(layout.rect.left, layout.rect.top).setVisible(true);

      status
        .setResolution(textResolution)
        .setVisible(hasStatusLine)
        .setFontSize(statusFontPx)
        .setPosition(Math.round(laneCenterX), Math.round(baselineY))
        .setFixedSize(layout.rect.width - (tuning.paddingXPx * 2), 0)
        .setWordWrapWidth(layout.rect.width - (tuning.paddingXPx * 2), true)
        .setText(statusLabel)
        .setAlpha(0.98);
      status.setName('intent-status');
      status.setDataEnabled();
      status.setData('intent-role', resolveIntentFeedRole(visibleStatus?.kind ?? null));
      status.setData('intent-semantic-tag', resolveIntentSemanticTag(visibleStatus?.kind ?? null));
      const nextEntryTransitions = new Map<string, {
        slot: number;
        changedAtMs: number;
      }>();

      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const record = visibleEntries[index];
        if (!record) {
          entry.setVisible(false);
          continue;
        }

        const previousTransition = entryTransitions.get(record.id);
        const previousSlot = previousTransition?.slot ?? null;
        const changedAtMs = previousTransition && previousTransition.slot === index
          ? previousTransition.changedAtMs
          : nowMs;
        const transitionLeadMs = previousSlot === null ? 0 : Math.min(replacementOverlapMs, fadeDurationMs - 1);
        const transitionProgress = Phaser.Math.Clamp((nowMs - changedAtMs + transitionLeadMs) / fadeDurationMs, 0, 1);
        const roleToken = resolveIntentFeedRoleLabel(record.kind);
        const targetY = baselineY - (index * (lineHeight + entryGap + perspectiveRiseStep));
        const previousY = previousSlot === null
          ? targetY + Math.round(lineHeight * tuning.slideOffsetLines) + perspectiveRiseStep
          : baselineY - (previousSlot * (lineHeight + entryGap + perspectiveRiseStep));
        const slotWidth = Math.max(
          120,
          layout.rect.width - ((tuning.paddingXPx + (index * perspectiveInsetStep)) * 2)
        );
        const slotScale = index <= 0 ? 1 : index === 1 ? 0.97 : index === 2 ? 0.94 : index === 3 ? 0.91 : 0.88;
        const targetAlphaScale = resolveIntentFeedLineAlphaScale(index);
        const fromAlphaScale = previousSlot === null
          ? Math.min(targetAlphaScale, Math.max(0.16, transitionStartAlpha * targetAlphaScale))
          : resolveIntentFeedLineAlphaScale(previousSlot);
        const resolvedAlpha = Phaser.Math.Linear(fromAlphaScale, targetAlphaScale, transitionProgress);
        nextEntryTransitions.set(record.id, {
          slot: index,
          changedAtMs
        });

        entry
          .setResolution(textResolution)
          .setVisible(true)
          .setFontSize(entryFontPx)
          .setPosition(
            Math.round(laneCenterX),
            Math.round(Phaser.Math.Linear(previousY, targetY, transitionProgress))
          )
          .setFixedSize(slotWidth, 0)
          .setWordWrapWidth(slotWidth, true)
          .setText(clampIntentFeedSummary(formatIntentHudSummary(record.summary), entryMaxChars))
          .setScale(slotScale)
          .setAlpha(Phaser.Math.Clamp((record.opacity ?? 1) * resolvedAlpha, 0, 1));
        entry.setName('thought-line');
        entry.setDataEnabled();
        entry.setData('intent-role', resolveIntentFeedRole(record.kind));
        entry.setData('intent-role-token', roleToken);
        entry.setData('intent-semantic-tag', resolveIntentSemanticTag(record.kind));
      }
      entryTransitions = nextEntryTransitions;
      risk.setResolution(textResolution).setVisible(false);
      risk.setName('next-risk');
      risk.setDataEnabled();
      risk.setData('intent-risk-label', null);

      lastSnapshot = {
        visible: true,
        dock: layout.dock,
        mode: layout.mode,
        compact: layout.compact,
        rect: { ...layout.rect },
        statusVisible: hasStatusLine,
        statusText: hasStatusLine ? statusLabel : null,
        quickThoughtCount: visibleEntries.length,
        maxVisibleEvents: layout.maxVisibleEvents,
        onboardingVisible: false,
        onboardingLabel: null,
        riskVisible: false,
        nextRiskLabel: null
      };
    },
    getLayoutSnapshot(): IntentFeedHudLayoutSnapshot {
      return lastSnapshot;
    },
    destroy(): void {
      root.destroy(true);
    }
  };
};
