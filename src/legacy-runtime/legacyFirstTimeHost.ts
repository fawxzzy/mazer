/**
 * First-time cards host (spec docs/design/MAZER-FIRST-TIME-CARDS-SPEC-2026-11-26.md, slice 2): the scene glue between
 * the play loop and the slice-1 session (legacyFirstTimeSession.ts). It turns steps into touch events, shows the card
 * through the reusable in-flow notice (legacyInFlowNoticeHost.ts) and draws the dotted-ring coach mark
 * (src/render/coachMarkView.ts). Neither component holds card copy; this module passes the registry's copy through.
 *
 * - Hook: ONE call in MenuScene (Wave 5C), right after an accepted play step: `noteLegacyFirstTimeStep(this, from, to)`.
 *   On the first call it resolves the flag once. Flag off (the build default): it remembers "off" for the scene and
 *   returns; nothing is created or drawn, and no storage beyond the flag's own lab key is read.
 * - Flag on: per frame (the scene's postupdate event) it follows level changes, the auth scope, the pause/overlay
 *   state, the auto-dismiss clock (visible time only), and the coach mark lifetime (R4).
 * - Level Preview (`?previewLevel=N`): the session keeps its record in memory, so a preview run writes nothing.
 * - Placement: the shared text card rule (src/render/textCardPlacement.ts, the same one the shard cards use). The card
 *   sits under the HUD, never covers the player, the end star, the coach ring or its label pill, and keeps the wraps
 *   and Switches visible where it can (Zac 2026-11-27: cards must not cover anything important). A card with a coach
 *   mark waits one frame so the pill is drawn and can be kept clear.
 *
 * The card look (Zac 2026-11-27: E Two-line, skin B Neon edge) is the in-flow notice's rich layout: this host passes
 * the heading and the mechanic icon; the coach pill shows the same icon.
 */
import type Phaser from 'phaser';
import { centerOfCell } from '../render/boardTileBake';
import { DEFAULT_BOARD_TILE_STYLE } from '../render/boardTileStyle';
import { CoachMarkView } from '../render/coachMarkView';
import type { MechanicIconId } from '../render/mechanicIcons';
import { SHARD_LOOK } from '../render/shardLook';
import {
  estimateTextCardHeight,
  resolveTextCardCellRect,
  resolveTextCardMechanicCells,
  resolveTextCardPlacement,
  resolveTextCardWidth,
  TEXT_CARD_MARKER_HALO_OF_TILE,
  type TextCardRect
} from '../render/textCardPlacement';
import { SHARD_COACH_RING_OF_TILE } from '../render/shardPlayPresenter';
import { designTokens, phaserMaterialAliases } from '../theme/tokens';
import type { TutorialStorage } from '../tutorial/tutorialAckStore';
import type { InFlowNoticeDismissReason, InFlowNoticeProps } from '../ui/notice/inFlowNotice';
import { resolveLegacyAuthStorageScope } from './legacyAuth';
import {
  bleedGateKey,
  readLegacyBleedGateTriggeredKeys,
  resolveLegacyBleedGateBorderCells,
  type LegacyBleedGate
} from './legacyBleedGateState';
import {
  FIRST_TIME_AUTO_DISMISS_MS,
  FIRST_TIME_COACH_LINGER_MS,
  type FirstTimeCard,
  type FirstTimeCardId,
  type FirstTimeTouchKind
} from './legacyFirstTimeCards';
import { createLegacyFirstTimeSession, type LegacyFirstTimeSession } from './legacyFirstTimeSession';
import { mergeLegacyFirstTimeGuestRecord } from './legacyFirstTimeStore';
import { resolveLegacyHeaderControlFrame } from './legacyHeaderControl';
import { createLegacyInFlowNoticeHost, type LegacyInFlowNoticeHost } from './legacyInFlowNoticeHost';
import type { LegacyPoint } from './legacyMaze';

/** The notice host key: one first-time card on screen at a time (S2). */
export const FIRST_TIME_NOTICE_KEY = 'firsttime.card';

/** The mechanic icon (src/render/mechanicIcons.ts) each card shows in its icon well and on its coach pill. */
export const FIRST_TIME_CARD_ICON: Readonly<Partial<Record<FirstTimeCardId, MechanicIconId>>> = Object.freeze({
  'mechanic.wrap': 'wrap',
  'mechanic.switch': 'switch',
  'mechanic.locked-gate': 'locked-star',
  'mechanic.pulse-gate': 'pulse-gate'
});

/** The notice props this host sends (the rich layout: heading + icon). */
export type LegacyFirstTimeNoticeProps = InFlowNoticeProps;

/** The board facts the host reads (a structural slice of LegacyMazeSnapshot). */
export interface LegacyFirstTimeMazeView {
  readonly width: number;
  readonly height: number;
  readonly goal?: LegacyPoint | null;
}

/**
 * Pure: a step that left one edge and came back on the far side (F17). A normal step moves one cell; a wrap step
 * jumps the whole board on one axis. Boards narrower than 3 cells cannot tell the two apart and never count.
 */
export const isLegacyFirstTimeWrapStep = (
  from: LegacyPoint,
  to: LegacyPoint,
  maze: Pick<LegacyFirstTimeMazeView, 'width' | 'height'>
): boolean => {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  return (dy === 0 && dx > 1 && maze.width >= 3) || (dx === 0 && dy > 1 && maze.height >= 3);
};

/** Where the card sits (the shared text card rule's answer): `bottomPx` set = anchored at the bottom band. */
export interface LegacyFirstTimeCardSpot {
  readonly topPx: number;
  readonly bottomPx?: number;
  /** Index into keepClear of the most important thing the card covers (-1 = covers nothing). */
  readonly covers: number;
}

/**
 * Pure: where the card goes (Zac 2026-11-27: cards must not cover anything important), by the shared text card rule
 * (src/render/textCardPlacement.ts): under the HUD, the top band, then the bottom band, then every scan step; the
 * first spot that covers nothing wins, else the one whose most important covered thing matters least. `keepClear`
 * is most important first: player, end star, coach target, coach pill, then the wraps and Switches.
 */
export const resolveLegacyFirstTimeCardSpot = (input: {
  readonly viewWidth: number;
  readonly viewHeight: number;
  readonly noticeTop: number;
  readonly bottomInset: number;
  readonly bodyChars: number;
  readonly action: boolean;
  readonly keepClear: readonly (TextCardRect | null)[];
}): LegacyFirstTimeCardSpot => {
  const cardWidth = resolveTextCardWidth(input.viewWidth);
  const place = resolveTextCardPlacement({
    viewWidth: input.viewWidth,
    viewHeight: input.viewHeight,
    topMin: input.noticeTop,
    bottomInset: input.bottomInset,
    cardWidth,
    cardHeight: estimateTextCardHeight({ cardWidth, bodyChars: input.bodyChars, heading: true, action: input.action }),
    keepClear: input.keepClear
  });
  return { topPx: place.topPx, bottomPx: place.bottomPx, covers: place.covers };
};

/**
 * Pure: the coach label to draw. A ring on a cell under the header (above noticeTop) keeps its ring but drops the
 * label: the coach mark would put the pill below the ring, on the header controls (seen on a real L200 board, where
 * "Open edge" sat on the menu button). The card already names the mechanic.
 */
export const resolveLegacyFirstTimeCoachLabel = (label: string, anchorScreenY: number | null, noticeTop: number): string =>
  anchorScreenY !== null && anchorScreenY < noticeTop ? '' : label;

/**
 * Pure: the border cell a just-lit Switch opened that the player will walk to: the nearer of its two by walking
 * distance on the floor grid (no wrapping), else the nearer as the crow flies when neither is reachable.
 */
export const resolveLegacyFirstTimeSwitchAnchor = (
  maze: {
    readonly grid: readonly (readonly boolean[])[];
    readonly width: number;
    readonly height: number;
    readonly bleedGates?: readonly Pick<LegacyBleedGate, 'axis' | 'line'>[];
  },
  key: string,
  from: LegacyPoint | null
): LegacyPoint | null => {
  const gate = maze.bleedGates?.find((candidate) => bleedGateKey(candidate) === key);
  if (!gate) return null;
  const cells = resolveLegacyBleedGateBorderCells(gate, maze.width, maze.height);
  if (from === null) return cells[0];
  const distance = new Map<string, number>([[`${from.x},${from.y}`, 0]]);
  const queue: LegacyPoint[] = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const p = queue[head]!;
    const d = distance.get(`${p.x},${p.y}`)!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: p.x + dx, y: p.y + dy };
      const id = `${n.x},${n.y}`;
      if (maze.grid[n.y]?.[n.x] !== true || distance.has(id)) continue;
      distance.set(id, d + 1);
      queue.push(n);
    }
  }
  const cost = (cell: LegacyPoint): number => distance.get(`${cell.x},${cell.y}`)
    ?? maze.width * maze.height + Math.abs(cell.x - from.x) + Math.abs(cell.y - from.y);
  return cost(cells[1]) < cost(cells[0]) ? cells[1] : cells[0];
};

const samePoint = (a: LegacyPoint | null | undefined, b: LegacyPoint | null | undefined): boolean => (
  a != null && b != null && a.x === b.x && a.y === b.y
);

/* ------------------------------------------------------------------ */
/* Controller: no Phaser, no DOM (the scene binding below feeds it)    */
/* ------------------------------------------------------------------ */

export interface LegacyFirstTimeFrameInput {
  readonly nowMs: number;
  /** The current maze object; a new object is a new level. */
  readonly level: object | null;
  /** True while the player is in a run (mode `play`). */
  readonly playing: boolean;
  /** True while the play view is unobstructed (no overlay, no open menu). The card hides otherwise. */
  readonly visible: boolean;
  readonly reducedMotion: boolean;
  /** Screen y (CSS px) just under the header controls: a top card sits here. */
  readonly noticeTop: number;
  readonly viewWidth: number;
  readonly viewHeight: number;
  readonly player: LegacyPoint | null;
  readonly goal: LegacyPoint | null;
  /**
   * A board cell's keep-clear rect on screen (CSS px), grown by `haloOfTile` of a tile on every side; null when the
   * board is not laid out.
   */
  readonly cellRect: (cell: LegacyPoint, haloOfTile?: number) => TextCardRect | null;
  /** The wraps and Switches on this board the card should leave visible (resolveTextCardMechanicCells). */
  readonly mechanicCells?: readonly LegacyPoint[];
  /** The coach label pill as drawn last frame (CoachMarkView.pillRect), so the card keeps clear of it. */
  readonly coachPillRect?: TextCardRect | null;
  /** Keys of the Switches lit on this board right now (absent on a board without Switches). */
  readonly litSwitchKeys?: ReadonlySet<string>;
  /** The opened border cell to ring for a Switch that just lit (the nearer of its two). */
  readonly resolveSwitchAnchor?: (key: string) => LegacyPoint | null;
}

/** What the scene draws this frame: the dotted ring on `anchor`, with `label` (empty = ring only). */
export interface LegacyFirstTimeCoachDraw {
  readonly cardId: FirstTimeCardId;
  readonly anchor: LegacyPoint;
  readonly label: string;
}

export interface LegacyFirstTimeCardControllerDeps {
  /** Current auth scope (`user:<id>` or `guest`). A change starts a fresh session for that account. */
  readonly resolveScope: () => string;
  readonly createSession: (scope: string) => LegacyFirstTimeSession;
  readonly notices: LegacyInFlowNoticeHost;
}

export interface LegacyFirstTimeCardController {
  /** An accepted play step from `from` to `to` on `level` (the maze object). */
  step(from: LegacyPoint, to: LegacyPoint, level: object & Pick<LegacyFirstTimeMazeView, 'width' | 'height'>, nowMs: number): void;
  /** Once per frame. Returns the coach mark to draw, or null. */
  frame(input: LegacyFirstTimeFrameInput): LegacyFirstTimeCoachDraw | null;
  describe(): { activeCardId: FirstTimeCardId | null; pendingCardId: FirstTimeCardId | null; coach: LegacyFirstTimeCoachDraw | null };
  destroy(): void;
}

interface CoachState {
  readonly cardId: FirstTimeCardId;
  readonly anchor: LegacyPoint;
  readonly label: string;
  /** Null while the card is up; then the linger deadline (R4). */
  until: number | null;
  /** True once a frame has returned this mark to draw (its pill rect is known from then on). */
  drawn: boolean;
}

export const createLegacyFirstTimeCardController = (deps: LegacyFirstTimeCardControllerDeps): LegacyFirstTimeCardController => {
  let scope: string | null = null;
  let session: LegacyFirstTimeSession | null = null;
  let level: object | null = null;
  let pending: { card: FirstTimeCard; anchor: LegacyPoint | null } | null = null;
  let shownCardId: FirstTimeCardId | null = null;
  let coach: CoachState | null = null;
  let visibleMs = 0;
  let lastNowMs = 0;
  let destroyed = false;
  /** Switches already lit when last looked at; null = not looked at on this level yet (sync without firing). */
  let knownLitSwitches: Set<string> | null = null;

  const closeNotice = (): void => {
    pending = null;
    shownCardId = null;
    deps.notices.close(FIRST_TIME_NOTICE_KEY);
  };

  const ensureSession = (): LegacyFirstTimeSession => {
    const next = deps.resolveScope();
    if (session === null || next !== scope) {
      if (session !== null) closeNotice();
      coach = null;
      scope = next;
      session = deps.createSession(next);
    }
    return session;
  };

  /** The card went away (acked or not): the coach lingers 4 s, unless it already went (R4). */
  const lingerCoach = (nowMs: number): void => {
    if (coach !== null && coach.until === null) coach.until = nowMs + FIRST_TIME_COACH_LINGER_MS;
  };

  const syncLevel = (current: object | null, nowMs: number): void => {
    if (current === level) return;
    const previous = level;
    level = current;
    knownLitSwitches = null;
    if (previous === null) return;
    // A new level: a card still up ends as a level end (acked only if it was up 800 ms, S5); the coach goes too.
    ensureSession().startLevel(nowMs);
    closeNotice();
    coach = null;
    visibleMs = 0;
  };

  const onNoticeDismiss = (reason: InFlowNoticeDismissReason): void => {
    if (destroyed || session === null) return;
    if (shownCardId !== null) shownCardId = null;
    // 'closed' after this host closed it is a no-op (the session has no active card any more).
    const event = session.dismiss(reason, lastNowMs);
    if (event !== null) lingerCoach(lastNowMs);
  };

  const showPending = (input: LegacyFirstTimeFrameInput): void => {
    if (pending === null) return;
    const { card, anchor } = pending;
    const notice = card.notice;
    pending = null;
    if (notice === null) return;
    const keepClear: (TextCardRect | null)[] = [
      input.player ? input.cellRect(input.player, TEXT_CARD_MARKER_HALO_OF_TILE) : null,
      input.goal ? input.cellRect(input.goal, TEXT_CARD_MARKER_HALO_OF_TILE) : null,
      anchor ? input.cellRect(anchor) : null,
      anchor ? input.coachPillRect ?? null : null,
      ...(input.mechanicCells ?? []).map((cell) => input.cellRect(cell))
    ];
    const spot = resolveLegacyFirstTimeCardSpot({
      viewWidth: input.viewWidth,
      viewHeight: input.viewHeight,
      noticeTop: input.noticeTop,
      bottomInset: designTokens.spacingPx[3]!,
      bodyChars: notice.body.length,
      action: notice.actionLabel !== undefined,
      keepClear
    });
    const props: LegacyFirstTimeNoticeProps = {
      title: notice.marker,
      heading: notice.heading,
      icon: FIRST_TIME_CARD_ICON[card.id],
      body: notice.body,
      tone: 'info',
      actionLabel: notice.actionLabel,
      topPx: spot.topPx,
      bottomPx: spot.bottomPx,
      reducedMotion: input.reducedMotion,
      onDismiss: onNoticeDismiss
    };
    shownCardId = card.id;
    visibleMs = 0;
    deps.notices.show(FIRST_TIME_NOTICE_KEY, props);
  };

  const fire = (
    s: LegacyFirstTimeSession,
    touches: readonly FirstTimeTouchKind[],
    nowMs: number,
    resolveAnchor: (target: string) => LegacyPoint | null
  ): void => {
    const card = s.touch(touches, nowMs);
    if (card === null) return;
    const anchor = card.coach === null ? null : resolveAnchor(card.coach.target);
    pending = { card, anchor };
    coach = card.coach !== null && anchor !== null ? { cardId: card.id, anchor, label: card.coach.label, until: null, drawn: false } : null;
  };

  /** A Switch went from unlit to lit since the last frame (lighting happens in the scene's frame, not on the step). */
  const pollSwitches = (s: LegacyFirstTimeSession, input: LegacyFirstTimeFrameInput): void => {
    const lit = input.litSwitchKeys;
    if (lit === undefined) return;
    // A level first seen starts from "none lit": lit state is per attempt and in memory only (legacyBleedGateState), so
    // anything lit at the first look was lit by the step that installed this host (the scene's first step), and that
    // step counts. A new attempt darkens every Switch: the set shrinks, and relighting one is a fresh touch (seen
    // cards stay seen).
    const known = knownLitSwitches ?? new Set<string>();
    knownLitSwitches = new Set(lit);
    if (!input.playing) return;
    const fresh = [...lit].find((key) => !known.has(key));
    if (fresh === undefined) return;
    fire(s, ['switch-trigger'], input.nowMs, (target) => (
      target === 'opened-border-cell' ? input.resolveSwitchAnchor?.(fresh) ?? null : null
    ));
  };

  return {
    step: (from, to, current, nowMs) => {
      if (destroyed) return;
      lastNowMs = nowMs;
      const s = ensureSession();
      syncLevel(current, nowMs);
      if (coach !== null && samePoint(to, coach.anchor)) coach = null; // R4: the anchor was reached.
      if (s.activeCard() !== null) {
        // R3: the first move at least 800 ms after the card showed acks it; an earlier move leaves it up.
        const event = s.dismiss('move', nowMs);
        if (event !== null && event.outcome !== 'kept') {
          closeNotice();
          lingerCoach(nowMs);
        }
      }
      if (!isLegacyFirstTimeWrapStep(from, to, current)) return;
      // The wrap card rings the open edge cell the player walked off.
      fire(s, ['wrap-step'], nowMs, (target) => (target === 'wrapped-edge-cell' ? { x: from.x, y: from.y } : null));
    },
    frame: (input) => {
      if (destroyed) return null;
      const dt = Math.max(0, input.nowMs - lastNowMs);
      lastNowMs = input.nowMs;
      const s = ensureSession();
      syncLevel(input.level, input.nowMs);
      pollSwitches(s, input);
      const visible = input.playing && input.visible;
      deps.notices.setHidden(!visible);
      // A card with a coach mark waits until the mark has been drawn once, so its label pill can be kept clear.
      if (visible && (coach === null || coach.drawn)) showPending(input);
      if (shownCardId !== null && s.activeCard() !== null && visible) {
        visibleMs += dt;
        // R3: 4500 ms of the card on screen (a pause does not count), then it goes and counts as seen.
        if (visibleMs >= FIRST_TIME_AUTO_DISMISS_MS) {
          s.dismiss('timeout', input.nowMs);
          closeNotice();
          lingerCoach(input.nowMs);
        }
      }
      if (coach !== null && coach.until !== null && input.nowMs >= coach.until) coach = null;
      if (coach === null || !visible) return null;
      coach.drawn = true;
      return { cardId: coach.cardId, anchor: coach.anchor, label: coach.label };
    },
    describe: () => ({
      activeCardId: session?.activeCard()?.id ?? null,
      pendingCardId: pending?.card.id ?? null,
      coach: coach === null ? null : { cardId: coach.cardId, anchor: coach.anchor, label: coach.label }
    }),
    destroy: () => {
      destroyed = true;
      pending = null;
      coach = null;
      deps.notices.destroy();
    }
  };
};

/* ------------------------------------------------------------------ */
/* Scene binding (MenuScene's one-line hook)                            */
/* ------------------------------------------------------------------ */

/**
 * The MenuScene members this host reads. They are private there, so the binding reads them structurally;
 * tests/tutorial/first-time-host.test.ts pins that MenuScene still declares every one.
 */
export const LEGACY_FIRST_TIME_SCENE_MEMBERS = Object.freeze([
  'maze', 'player', 'mode', 'overlay', 'menuDropdown', 'authSnapshot', 'layout', 'boardZoomContainer', 'boardTileLayer',
  'boardDynamicGraphics', 'resolveBrowserLocalStorage', 'prefersLegacyReducedMotion', 'applyLegacyUiTextCrispness'
] as const);

interface FirstTimeSceneView {
  readonly maze?: (LegacyFirstTimeMazeView & {
    readonly grid: boolean[][];
    readonly bleedGates?: LegacyBleedGate[];
  }) | null;
  readonly player?: LegacyPoint | null;
  readonly mode?: string;
  readonly overlay?: string;
  readonly menuDropdown?: { isOpen(): boolean } | null;
  readonly authSnapshot?: { userId?: string | null } | null;
  readonly layout?: {
    readonly width: number;
    readonly height: number;
    readonly lanes: { readonly hud?: { readonly top: number; readonly height: number } | null };
    readonly headerSafeInset?: { readonly left: number; readonly right: number };
    readonly headerIconScale?: number;
  } | null;
  readonly boardZoomContainer?: Phaser.GameObjects.Container | null;
  readonly boardTileLayer?: {
    readonly currentBake: { readonly scale: number; readonly boardWidth: number } | null;
    readonly snappedOrigin: { x: number; y: number } | null;
  } | null;
  readonly boardDynamicGraphics?: Phaser.GameObjects.GameObject | null;
  resolveBrowserLocalStorage?(): TutorialStorage | undefined;
  prefersLegacyReducedMotion?(): boolean;
  applyLegacyUiTextCrispness?(text: Phaser.GameObjects.Text): Phaser.GameObjects.Text;
}

/** Same depth as the shard coach pill (MenuScene LEGACY_HAZARD_MOMENT_DEPTH): over the board, under the overlays. */
const FIRST_TIME_COACH_DEPTH = 40;

const COACH_ACCENT: Readonly<Partial<Record<FirstTimeCardId, number>>> = Object.freeze({
  'mechanic.wrap': phaserMaterialAliases['semantic.info'],
  'mechanic.switch': phaserMaterialAliases['semantic.info']
});

const readWindowSearch = (): string => (typeof window === 'undefined' ? '' : window.location.search);
const readDeviceStorage = (): TutorialStorage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

interface SceneHost {
  step(from: LegacyPoint, to: LegacyPoint): void;
}

const sceneHosts = new WeakMap<object, SceneHost | 'off'>();

/** Board cell (0,0)-relative layout px -> the board container's local space, from the current tile bake. */
const resolveCellLocal = (view: FirstTimeSceneView, cell: LegacyPoint): { x: number; y: number; tile: number } | null => {
  const bake = view.boardTileLayer?.currentBake ?? null;
  const origin = view.boardTileLayer?.snappedOrigin ?? null;
  const width = view.maze?.width ?? 0;
  if (bake === null || origin === null || width <= 0 || !(bake.boardWidth > 0)) return null;
  // The bake snaps grid lines to device pixels; boardWidth / width is the tile within a device pixel.
  const tile = bake.boardWidth / width;
  const [x, y] = centerOfCell(cell, tile, bake.scale, origin.x, origin.y);
  return { x, y, tile };
};

const installSceneHost = (scene: Phaser.Scene): SceneHost | null => {
  const view = scene as unknown as FirstTimeSceneView;
  const resolveScope = (): string => resolveLegacyAuthStorageScope({ userId: view.authSnapshot?.userId ?? null });
  const createSession = (scope: string): LegacyFirstTimeSession => {
    const session = createLegacyFirstTimeSession({
      search: readWindowSearch(),
      deviceStorage: readDeviceStorage(),
      resolveSceneStorage: () => view.resolveBrowserLocalStorage?.(),
      scope
    });
    // P2: on sign-in the guest record merges into the account's (union, max revision). Never on a preview route.
    if (session.enabled && !session.preview) {
      const storage = view.resolveBrowserLocalStorage?.();
      if (storage) mergeLegacyFirstTimeGuestRecord(storage, scope);
    }
    return session;
  };
  // The flag is read once, here. Off: nothing else is created, read or drawn for this scene.
  const probe = createSession(resolveScope());
  if (!probe.enabled) return null;

  const notices = createLegacyInFlowNoticeHost();
  let firstSession: LegacyFirstTimeSession | null = probe;
  const controller = createLegacyFirstTimeCardController({
    resolveScope,
    createSession: (scope) => {
      const reuse = firstSession;
      firstSession = null;
      return reuse ?? createSession(scope);
    },
    notices
  });
  const coachView = new CoachMarkView(scene, {
    depth: FIRST_TIME_COACH_DEPTH,
    crisp: (text) => { view.applyLegacyUiTextCrispness?.(text); }
  });
  const container = view.boardZoomContainer ?? null;
  if (container) {
    // Under the crisp cast (player, start/goal), like the shard coach ring.
    const below = view.boardDynamicGraphics ? container.getIndex(view.boardDynamicGraphics) : -1;
    if (below >= 0) container.addAt(coachView.ringGraphics, below);
    else container.add(coachView.ringGraphics);
  }

  const cellScreen = (cell: LegacyPoint): { x: number; y: number } | null => {
    const local = resolveCellLocal(view, cell);
    if (local === null || !container) return null;
    const out = container.getWorldTransformMatrix().transformPoint(local.x, local.y);
    return { x: out.x, y: out.y };
  };
  const cellRect = (cell: LegacyPoint, haloOfTile = 0): TextCardRect | null => {
    const centre = cellScreen(cell);
    const next = cellScreen({ x: cell.x + 1, y: cell.y });
    if (centre === null || next === null) return null;
    const cellPx = Math.abs(next.x - centre.x);
    return resolveTextCardCellRect(centre, cellPx, 4 + (cellPx * haloOfTile));
  };
  // The wraps and Switches of the current board, worked out once per level.
  let mechanicMaze: object | null = null;
  let mechanicCells: readonly LegacyPoint[] = [];
  const readMechanicCells = (maze: NonNullable<FirstTimeSceneView['maze']>): readonly LegacyPoint[] => {
    if (maze !== mechanicMaze) {
      mechanicMaze = maze;
      mechanicCells = resolveTextCardMechanicCells(maze);
    }
    return mechanicCells;
  };

  const onPostUpdate = (time: number): void => {
    const layout = view.layout ?? null;
    const playing = view.mode === 'play';
    const visible = playing && view.overlay === 'none' && view.menuDropdown?.isOpen() !== true;
    const header = layout
      ? resolveLegacyHeaderControlFrame({
        height: layout.height,
        hudHeight: layout.lanes.hud?.height ?? 64,
        hudTop: layout.lanes.hud?.top ?? 0,
        safeArea: layout.headerSafeInset,
        sizeScale: layout.headerIconScale,
        width: layout.width,
        placement: 'leading'
      })
      : null;
    const noticeTop = header ? header.top + header.height + designTokens.spacingPx[1]! : 0;
    const reducedMotion = view.prefersLegacyReducedMotion?.() ?? false;
    const maze = view.maze ?? null;
    const hasSwitches = maze !== null && (maze.bleedGates?.length ?? 0) > 0;
    const draw = controller.frame({
      litSwitchKeys: hasSwitches ? readLegacyBleedGateTriggeredKeys(maze) : undefined,
      resolveSwitchAnchor: (key) => (maze === null ? null : resolveLegacyFirstTimeSwitchAnchor(maze, key, view.player ?? null)),
      nowMs: time,
      level: view.maze ?? null,
      playing,
      visible,
      reducedMotion,
      noticeTop,
      viewWidth: layout?.width ?? 0,
      viewHeight: layout?.height ?? 0,
      player: view.player ?? null,
      goal: view.maze?.goal ?? null,
      cellRect,
      mechanicCells: maze === null ? [] : readMechanicCells(maze),
      coachPillRect: coachView.pillRect
    });
    const local = draw === null ? null : resolveCellLocal(view, draw.anchor);
    if (draw === null || local === null || !container) {
      coachView.draw(null);
      return;
    }
    coachView.draw({
      anchor: { x: local.x, y: local.y },
      ringRadius: local.tile * SHARD_COACH_RING_OF_TILE,
      dotRadius: Math.max(SHARD_LOOK.cage.minDotRadiusCss, local.tile * SHARD_LOOK.cage.dotRadiusOfTile),
      label: resolveLegacyFirstTimeCoachLabel(draw.label, cellScreen(draw.anchor)?.y ?? null, noticeTop),
      accent: COACH_ACCENT[draw.cardId] ?? phaserMaterialAliases['semantic.info'],
      nowMs: time,
      reducedMotion,
      alpha: 1,
      toScreen: (p) => {
        const out = container.getWorldTransformMatrix().transformPoint(p.x, p.y);
        return { x: out.x, y: out.y };
      },
      minTop: noticeTop,
      viewWidth: layout?.width ?? 0,
      icon: FIRST_TIME_CARD_ICON[draw.cardId],
      iconEnv: { boardTileStyle: DEFAULT_BOARD_TILE_STYLE, devicePixelRatio: view.boardTileLayer?.currentBake?.scale ?? 1 }
    });
  };

  // Phaser scene events by name ('postupdate' = Phaser.Scenes.Events.POST_UPDATE, 'shutdown' = SHUTDOWN).
  scene.events.on('postupdate', onPostUpdate);
  scene.events.once('shutdown', () => {
    scene.events.off('postupdate', onPostUpdate);
    controller.destroy();
    coachView.destroy();
    sceneHosts.delete(scene);
  });

  return {
    step: (from, to) => {
      const maze = view.maze;
      if (!maze || view.mode !== 'play') return;
      controller.step(from, to, maze, scene.time.now);
    }
  };
};

/**
 * MenuScene's one-line hook: call right after an accepted play step (the player moved from `from` to `to`).
 * Flag off: one flag read on the first call, then a WeakMap lookup per step; nothing is drawn.
 */
export const noteLegacyFirstTimeStep = (scene: Phaser.Scene, from: LegacyPoint, to: LegacyPoint): void => {
  let host = sceneHosts.get(scene);
  if (host === 'off') return;
  if (host === undefined) {
    const installed = installSceneHost(scene);
    sceneHosts.set(scene, installed ?? 'off');
    if (installed === null) return;
    host = installed;
  }
  host.step(from, to);
};
