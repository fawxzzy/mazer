/**
 * First-time cards (spec docs/design/MAZER-FIRST-TIME-CARDS-SPEC-2026-11-26.md, slice 1): the card registry and the
 * pure touch-to-card state machine. No UI, no storage, no Phaser, no DOM here.
 *
 * - A card fires on the account's FIRST TOUCH of its mechanic (D5, R1), never at a level start and never because the
 *   mechanic is on the board. Veterans are not skipped and nothing is pre-acked.
 * - Caps (D10, S1-S5): at most one card per level and two per app session, one card on screen at a time; a capped
 *   card is deferred (stays unacked and fires at the next touch), never dropped. A touch marks the mechanic met even
 *   when its card is deferred (S7), and the Guide reads met (legacyFirstTimeGuide.ts).
 * - Ack (R3, S5): "Got it", the 4500 ms timeout, the first move at least 800 ms after the card showed, or a level end
 *   at least 800 ms after it showed. Anything shorter, or the app closing, leaves the card unacked: it comes back.
 *
 * Card look (Zac 2026-11-27): a two-line card, heading + body, with a small "New" marker and a "Got it" action, plus
 * an optional dotted-ring coach mark on a board target. The host (legacyFirstTimeHost.ts) feeds this copy into the
 * reusable in-flow notice and coach mark; those components hold no card text. Cards must not cover anything important:
 * the host places the card on the screen edge away from the player and the coach target
 * (`resolveFirstTimeCardPlacement`).
 *
 * Live cards: LEGACY_FIRST_TIME_LIVE_CARD_IDS. Slice 2 made the wrap card live (legacyFirstTimeHost.ts shows it), slice 3 the
 * Switch, slice 9 the trail tip and the level-1 goal coach, slices 7 and 8 the Shard and Pulse Gate cards; each later slice
 * adds its card id.
 */
import type { TutorialToken } from '../tutorial/tutorialRegistry.ts';
import {
  LEGACY_CONTROL_HINT_CARD_COPY_KEYS,
  LEGACY_CONTROL_HINT_CARD_COPY_MOUSE,
  LEGACY_CONTROL_HINT_CARD_COPY_NEUTRAL,
  LEGACY_CONTROL_HINT_CARD_COPY_TOUCH,
  LEGACY_CONTROL_HINT_TOKEN,
  type LegacyControlHintInput
} from './legacyControlHint';
import { LEGACY_GUIDE_ROWS, resolveLegacyGuideHazardRow, type LegacyGuideRow } from './legacyGuideContent';

export type FirstTimeCardId =
  | 'level-1.controls'
  | 'mechanic.locked-gate'
  | 'mechanic.pulse-gate'
  | 'mechanic.switch'
  | 'mechanic.wrap'
  | 'tip.trail'
  | 'level-1.goal';

/** What the host reports when the player touches a mechanic. One step can carry several (a rare same-step tie). */
export type FirstTimeTouchKind =
  | 'shard-pickup'
  | 'locked-star-step'
  | 'pulse-gate-adjacent'
  | 'switch-trigger'
  | 'wrap-step'
  | 'trail-backstep'
  | 'control-hint-dismissed';

/** What the dotted-ring coach mark sits on. The host resolves it to a board cell. */
export type FirstTimeCoachTarget =
  | 'next-untaken-shard'
  | 'touched-pulse-gate'
  | 'opened-border-cell'
  /** The open edge cell the player just walked off (the wrap card, Zac 2026-11-27: keep the dotted ring). */
  | 'wrapped-edge-cell'
  | 'goal-stars';

/** Who owns the seen record: the account-scoped first-time record, or the existing per-device tutorial acks. */
export type FirstTimeCardStore = 'account' | 'device';

export interface FirstTimeNoticeCopy {
  /** The small marker tag before the heading. */
  readonly marker: 'New';
  readonly heading: string;
  readonly body: string;
  readonly actionLabel: 'Got it';
  /** Only the level-1 control hint: the body follows the input the player actually uses (legacyControlHint.ts). */
  readonly bodyByInput?: Readonly<Record<LegacyControlHintInput, string>>;
}

export interface FirstTimeCoachMark {
  readonly target: FirstTimeCoachTarget;
  readonly label: string;
  /** The coach mark is the pulsing dotted ring (src/render/coachMarkView.ts). */
  readonly ring: 'dotted';
}

export interface FirstTimeCard {
  readonly id: FirstTimeCardId;
  /** Registry token for the ack store (validateTutorialRegistry). `order` equals `priority`. */
  readonly token: TutorialToken;
  /** 0 = first. Unique, so a same-step tie always has one winner (mandatory, then on-route, then optional). */
  readonly priority: number;
  /** First-touch triggers. Empty = not fired by this machine (the level-1 control hint keeps its own presenter). */
  readonly touches: readonly FirstTimeTouchKind[];
  readonly store: FirstTimeCardStore;
  /** False = exempt from the per-level and per-session caps (the level-1 sequence). */
  readonly countsTowardCaps: boolean;
  /** Null = coach mark only (the level-1 goal coach). */
  readonly notice: FirstTimeNoticeCopy | null;
  /** Null = no coach mark. */
  readonly coach: FirstTimeCoachMark | null;
  /** The Guide row this card teaches (one source of copy, R2). */
  readonly guideRowId: LegacyGuideRow['id'];
}

export const FIRST_TIME_CARD_REVISION = 1;
export const FIRST_TIME_LEVEL_CARD_CAP = 1;
export const FIRST_TIME_SESSION_CARD_CAP = 2;
/** R3 / S5: a card is only acked by a move or a level end once it has been up this long. */
export const FIRST_TIME_MIN_SHOWN_MS = 800;
/** R3: the notice dismisses itself after this long (and that counts as seen). */
export const FIRST_TIME_AUTO_DISMISS_MS = 4500;
/** R4: the coach mark outlives a dismissed notice by this long (or until the anchor is reached / the level ends). */
export const FIRST_TIME_COACH_LINGER_MS = 4000;
/** Copy cap shared with the Guide rows. */
export const FIRST_TIME_COPY_MAX_CHARS = 90;

const MARKER = 'New' as const;
const ACTION = 'Got it' as const;

const guideRow = (id: LegacyGuideRow['id']): LegacyGuideRow => LEGACY_GUIDE_ROWS.find((row) => row.id === id)!;

const mechanicToken = (id: FirstTimeCardId, event: string, priority: number): TutorialToken => Object.freeze({
  id,
  trigger: Object.freeze({ kind: 'first-occurrence', event } as const),
  repeat: 'once',
  revision: FIRST_TIME_CARD_REVISION,
  order: priority,
  copy: Object.freeze({
    titleKey: `firsttime.${id}.title`,
    bodyKey: `firsttime.${id}.body`,
    continueKey: `firsttime.${id}.continue`
  })
});

const coach = (target: FirstTimeCoachTarget, label: string): FirstTimeCoachMark => Object.freeze({ target, label, ring: 'dotted' });

const shardRow = resolveLegacyGuideHazardRow('shard');
const pulseGateRow = resolveLegacyGuideHazardRow('pulseGate');

/**
 * The registry, in priority order. Copy is the spec's section 4 / 8 copy, unchanged. The locked-gate and Pulse Gate
 * bodies ARE the Guide hazard rows (read, not copied), and so are the wrap and Switch bodies (the Guide Wrap row took
 * the card copy in slice 2, the Switch row in slice 3, where "Wrap gate" became "Switch", D1).
 */
export const LEGACY_FIRST_TIME_CARDS: readonly FirstTimeCard[] = Object.freeze([
  Object.freeze({
    // Level-1 control hint (per device, own presenter: src/render/legacyControlHintOverlay.ts). Flag on (slice 9) it is a
    // card with this copy (the twin-stars goal line); flag off it stays the unchanged pill.
    id: 'level-1.controls',
    token: LEGACY_CONTROL_HINT_TOKEN,
    priority: 0,
    touches: Object.freeze([]),
    store: 'device',
    countsTowardCaps: false,
    notice: Object.freeze({
      marker: MARKER,
      heading: guideRow('move').heading,
      body: LEGACY_CONTROL_HINT_CARD_COPY_NEUTRAL,
      actionLabel: ACTION,
      bodyByInput: Object.freeze({
        touch: LEGACY_CONTROL_HINT_CARD_COPY_TOUCH,
        mouse: LEGACY_CONTROL_HINT_CARD_COPY_MOUSE,
        keys: LEGACY_CONTROL_HINT_CARD_COPY_KEYS,
        neutral: LEGACY_CONTROL_HINT_CARD_COPY_NEUTRAL
      })
    }),
    coach: null,
    guideRowId: 'move'
  }),
  Object.freeze({
    id: 'mechanic.locked-gate',
    token: mechanicToken('mechanic.locked-gate', 'mechanic-touch.locked-gate', 1),
    priority: 1,
    touches: Object.freeze(['shard-pickup', 'locked-star-step'] as const),
    store: 'account',
    countsTowardCaps: true,
    notice: Object.freeze({ marker: MARKER, heading: shardRow.heading, body: shardRow.text, actionLabel: ACTION }),
    coach: coach('next-untaken-shard', 'Take this next'),
    guideRowId: 'hazard-shard'
  }),
  Object.freeze({
    id: 'mechanic.pulse-gate',
    token: mechanicToken('mechanic.pulse-gate', 'mechanic-touch.pulse-gate', 2),
    priority: 2,
    touches: Object.freeze(['pulse-gate-adjacent'] as const),
    store: 'account',
    countsTowardCaps: true,
    notice: Object.freeze({ marker: MARKER, heading: pulseGateRow.heading, body: pulseGateRow.text, actionLabel: ACTION }),
    coach: coach('touched-pulse-gate', 'Wait for the gap'),
    guideRowId: 'hazard-gate'
  }),
  Object.freeze({
    id: 'mechanic.switch',
    token: mechanicToken('mechanic.switch', 'mechanic-touch.switch', 3),
    priority: 3,
    touches: Object.freeze(['switch-trigger'] as const),
    store: 'account',
    countsTowardCaps: true,
    notice: Object.freeze({
      marker: MARKER,
      heading: 'Switch',
      body: guideRow('bleed-gate').text,
      actionLabel: ACTION
    }),
    coach: coach('opened-border-cell', 'Open edge'),
    guideRowId: 'bleed-gate'
  }),
  Object.freeze({
    id: 'mechanic.wrap',
    token: mechanicToken('mechanic.wrap', 'mechanic-touch.wrap', 4),
    priority: 4,
    touches: Object.freeze(['wrap-step'] as const),
    store: 'account',
    countsTowardCaps: true,
    notice: Object.freeze({
      marker: MARKER,
      heading: guideRow('wrap').heading,
      body: guideRow('wrap').text,
      actionLabel: ACTION
    }),
    // No label: the card alone explains it (options page, open question kept as is); the ring marks the edge used.
    coach: coach('wrapped-edge-cell', ''),
    guideRowId: 'wrap'
  }),
  Object.freeze({
    id: 'tip.trail',
    token: mechanicToken('tip.trail', 'mechanic-touch.trail', 5),
    priority: 5,
    touches: Object.freeze(['trail-backstep'] as const),
    store: 'account',
    countsTowardCaps: true,
    notice: Object.freeze({ marker: MARKER, heading: guideRow('trail').heading, body: 'Step back to wipe your trail.', actionLabel: ACTION }),
    coach: null,
    guideRowId: 'trail'
  }),
  Object.freeze({
    // Level-1 goal coach: after the control hint is dismissed, a dotted ring on the twin stars. Part of the level-1
    // sequence with the control hint, so it is exempt from the caps like the hint.
    id: 'level-1.goal',
    token: mechanicToken('level-1.goal', 'level-1.control-hint-dismissed', 6),
    priority: 6,
    touches: Object.freeze(['control-hint-dismissed'] as const),
    store: 'account',
    countsTowardCaps: false,
    notice: null,
    coach: coach('goal-stars', 'Reach these'),
    guideRowId: 'goal'
  })
]);

/**
 * Card ids the scene may fire (legacyFirstTimeHost.ts). Each card slice adds its id here: slice 2 the wrap card, slice 3 the Switch,
 * slice 9 the trail tip and the level-1 goal coach, slices 7 and 8 the Shard (locked gate) and Pulse Gate cards. Those two
 * can only be touched with `?lab=hazards` on as well (only then do shards and Pulse Gates exist). Everything stays behind
 * `?lab=firsttime` (build default off).
 */
export const LEGACY_FIRST_TIME_LIVE_CARD_IDS: readonly FirstTimeCardId[] = Object.freeze([
  'mechanic.wrap', 'mechanic.switch', 'tip.trail', 'level-1.goal', 'mechanic.locked-gate', 'mechanic.pulse-gate'
] as FirstTimeCardId[]);

export const resolveFirstTimeCard = (id: FirstTimeCardId): FirstTimeCard => LEGACY_FIRST_TIME_CARDS.find((card) => card.id === id)!;

/** Registry shape for validateTutorialRegistry and the ack store (account-scoped cards only). */
export const LEGACY_FIRST_TIME_TUTORIAL_REGISTRY = Object.freeze({
  schemaVersion: 1 as const,
  tokens: Object.freeze(LEGACY_FIRST_TIME_CARDS.filter((card) => card.store === 'account').map((card) => card.token))
});

/* ------------------------------------------------------------------ */
/* State machine                                                       */
/* ------------------------------------------------------------------ */

export interface FirstTimeActiveCard {
  readonly cardId: FirstTimeCardId;
  readonly shownAtMs: number;
  /** True when this card used the level slot and a session slot (refunded if it ends unacked). */
  readonly counted: boolean;
}

export interface FirstTimeCardsState {
  readonly levelCardFired: boolean;
  readonly sessionCardsCounted: number;
  readonly active: FirstTimeActiveCard | null;
}

export const createFirstTimeCardsState = (): FirstTimeCardsState => ({ levelCardFired: false, sessionCardsCounted: 0, active: null });

export interface FirstTimeTouchInput {
  readonly touches: readonly FirstTimeTouchKind[];
  readonly nowMs: number;
  /** Is this card already seen (acked at its revision) by this account? */
  readonly isSeen: (card: FirstTimeCard) => boolean;
  /** Defaults to LEGACY_FIRST_TIME_LIVE_CARD_IDS. */
  readonly liveCardIds?: readonly FirstTimeCardId[];
}

export interface FirstTimeTouchResult {
  readonly state: FirstTimeCardsState;
  /** The card to show now, or null. */
  readonly fire: FirstTimeCard | null;
  /** Every live, account-scoped card this touch met (mark met even when deferred, S7). */
  readonly met: readonly FirstTimeCardId[];
  /** Unseen cards this touch could not show (cap or a card already up); they fire at a later touch. */
  readonly deferred: readonly FirstTimeCardId[];
}

const byPriority = (a: FirstTimeCard, b: FirstTimeCard): number => a.priority - b.priority;

export const decideFirstTimeTouch = (state: FirstTimeCardsState, input: FirstTimeTouchInput): FirstTimeTouchResult => {
  const live = new Set(input.liveCardIds ?? LEGACY_FIRST_TIME_LIVE_CARD_IDS);
  const touched = LEGACY_FIRST_TIME_CARDS
    .filter((card) => live.has(card.id) && card.store === 'account' && card.touches.some((kind) => input.touches.includes(kind)))
    .sort(byPriority);
  const met = touched.map((card) => card.id);
  const candidates = touched.filter((card) => !input.isSeen(card));

  let fire: FirstTimeCard | null = null;
  const deferred: FirstTimeCardId[] = [];
  for (const card of candidates) {
    const blocked = fire !== null
      || state.active !== null // S2: one card on screen at a time.
      || (card.countsTowardCaps && (
        state.levelCardFired // S1
        || state.sessionCardsCounted >= FIRST_TIME_SESSION_CARD_CAP // S3
      ));
    if (blocked) deferred.push(card.id);
    else fire = card;
  }

  if (fire === null) return { state, fire, met, deferred };
  const counted = fire.countsTowardCaps;
  return {
    state: {
      levelCardFired: state.levelCardFired || counted,
      sessionCardsCounted: state.sessionCardsCounted + (counted ? 1 : 0),
      active: { cardId: fire.id, shownAtMs: input.nowMs, counted }
    },
    fire,
    met,
    deferred
  };
};

export type FirstTimeDismissReason = 'action' | 'timeout' | 'move' | 'level-end' | 'replaced' | 'closed';

/** acked = mark seen; kept = the card stays up (a move too soon); unacked = gone, but it comes back at the next touch. */
export type FirstTimeDismissOutcome = 'acked' | 'kept' | 'unacked';

export interface FirstTimeDismissResult {
  readonly state: FirstTimeCardsState;
  readonly cardId: FirstTimeCardId | null;
  readonly outcome: FirstTimeDismissOutcome | null;
}

export const resolveFirstTimeDismiss = (
  state: FirstTimeCardsState,
  reason: FirstTimeDismissReason,
  nowMs: number
): FirstTimeDismissResult => {
  const active = state.active;
  if (active === null) return { state, cardId: null, outcome: null };
  const shownLongEnough = nowMs - active.shownAtMs >= FIRST_TIME_MIN_SHOWN_MS;
  let outcome: FirstTimeDismissOutcome;
  if (reason === 'action' || reason === 'timeout') outcome = 'acked';
  else if (reason === 'move') outcome = shownLongEnough ? 'acked' : 'kept';
  else if (reason === 'level-end') outcome = shownLongEnough ? 'acked' : 'unacked'; // S5: no flash-and-gone.
  else outcome = 'unacked'; // replaced / closed: the player may not have read it.

  if (outcome === 'kept') return { state, cardId: active.cardId, outcome };
  // An unacked card gives its session slot back: it was not really seen, and it must not push a later card out.
  const refund = outcome === 'unacked' && active.counted ? 1 : 0;
  return {
    state: { ...state, sessionCardsCounted: state.sessionCardsCounted - refund, active: null },
    cardId: active.cardId,
    outcome
  };
};

/** A new level: any card still up ends as a level end (S5), then the per-level slot frees. */
export const beginFirstTimeLevel = (state: FirstTimeCardsState, nowMs: number): FirstTimeDismissResult => {
  const ended = resolveFirstTimeDismiss(state, 'level-end', nowMs);
  return { ...ended, state: { ...ended.state, levelCardFired: false } };
};

/* ------------------------------------------------------------------ */
/* Placement: never cover anything important                           */
/* ------------------------------------------------------------------ */

export type FirstTimeCardEdge = 'top' | 'bottom';

/**
 * Which screen edge the card sits on: the one farther from everything that must stay visible (the player, the coach
 * target). No points = top (under the header, the in-flow notice default). Ties go to the top.
 */
export const resolveFirstTimeCardPlacement = (input: {
  readonly viewportHeightPx: number;
  readonly keepVisibleYPx: readonly number[];
}): FirstTimeCardEdge => {
  const ys = input.keepVisibleYPx.filter((y) => Number.isFinite(y));
  if (ys.length === 0 || !(input.viewportHeightPx > 0)) return 'top';
  const topClearance = Math.min(...ys);
  const bottomClearance = input.viewportHeightPx - Math.max(...ys);
  return bottomClearance > topClearance ? 'bottom' : 'top';
};
