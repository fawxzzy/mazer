import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { Renderer: { Canvas: { SetTransform: () => true } } } }));

import {
  FIRST_TIME_AUTO_DISMISS_MS,
  FIRST_TIME_COACH_LINGER_MS,
  FIRST_TIME_MIN_SHOWN_MS,
  type FirstTimeCard,
  type FirstTimeCardId
} from '../../src/legacy-runtime/legacyFirstTimeCards';
import { FIRST_TIME_LAB_STORAGE_KEY } from '../../src/legacy-runtime/legacyFirstTimeFlag';
import {
  FIRST_TIME_NOTICE_KEY,
  LEGACY_FIRST_TIME_SCENE_MEMBERS,
  createLegacyFirstTimeCardController,
  isLegacyFirstTimeBackstep,
  isLegacyFirstTimeCardSeenByHazardRecord,
  isLegacyFirstTimeWrapStep,
  noteLegacyFirstTimeStep,
  resolveLegacyFirstTimeAdjacentGate,
  resolveLegacyFirstTimeCardSpot,
  resolveLegacyFirstTimeCoachLabel,
  resolveLegacyFirstTimeOwnedHazardKinds,
  resolveLegacyFirstTimeShardTouch,
  resolveLegacyFirstTimeSwitchAnchor,
  type LegacyFirstTimeFrameInput,
  type LegacyFirstTimeGateView,
  type LegacyFirstTimeNoticeProps,
  type LegacyFirstTimeShardView,
  type LegacyFirstTimeStepContext
} from '../../src/legacy-runtime/legacyFirstTimeHost';
import { createLegacyFirstTimeSession } from '../../src/legacy-runtime/legacyFirstTimeSession';
import type { LegacyInFlowNoticeHost } from '../../src/legacy-runtime/legacyInFlowNoticeHost';
import { LEGACY_GUIDE_ROWS, resolveLegacyGuideHazardRow } from '../../src/legacy-runtime/legacyGuideContent';
import type { TutorialStorage } from '../../src/tutorial/index.ts';
import {
  estimateTextCardHeight,
  resolveTextCardCellRect,
  resolveTextCardWidth,
  TEXT_CARD_MARKER_HALO_OF_TILE
} from '../../src/render/textCardPlacement';
import type { InFlowNoticeProps } from '../../src/ui/notice/inFlowNotice';

class SpyStorage implements TutorialStorage {
  readonly data = new Map<string, string>();
  readonly calls: string[] = [];
  getItem(key: string): string | null { this.calls.push(`get:${key}`); return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.calls.push(`set:${key}`); this.data.set(key, value); }
  removeItem(key: string): void { this.calls.push(`remove:${key}`); this.data.delete(key); }
  writes(): string[] { return this.calls.filter((call) => !call.startsWith('get:')); }
}

/** A fake notice host with the real host's contract: close() calls onDismiss('closed') synchronously. */
const fakeNotices = () => {
  const shown: LegacyFirstTimeNoticeProps[] = [];
  let open: InFlowNoticeProps | null = null;
  let hidden = false;
  const host: LegacyInFlowNoticeHost = {
    show: (key, props) => {
      expect(key).toBe(FIRST_TIME_NOTICE_KEY);
      shown.push(props as LegacyFirstTimeNoticeProps);
      open = props;
    },
    close: () => {
      const was = open;
      open = null;
      was?.onDismiss?.('closed');
    },
    isOpen: () => open !== null,
    setHidden: (value) => { hidden = value; },
    destroy: () => { open = null; }
  };
  return {
    host,
    shown,
    isOpen: () => open !== null,
    isHidden: () => hidden,
    /** The player taps "Got it". */
    tap: () => {
      const was = open;
      open = null;
      was?.onDismiss?.('action');
    }
  };
};

const MAZE = { width: 9, height: 15, goal: { x: 4, y: 0 } };

/** A rig: real session (flag on, memory or spy storage), fake notices, a 15-row board laid out 40 px per row. */
const rig = (options: {
  search?: string;
  storage?: SpyStorage;
  liveCardIds?: readonly FirstTimeCardId[];
  isSeenElsewhere?: (card: FirstTimeCard) => boolean;
} = {}) => {
  const storage = options.storage ?? new SpyStorage();
  const notices = fakeNotices();
  let scope = 'guest';
  const sessions: string[] = [];
  const controller = createLegacyFirstTimeCardController({
    resolveScope: () => scope,
    createSession: (next) => {
      sessions.push(next);
      return createLegacyFirstTimeSession({
        search: options.search ?? '?lab=firsttime',
        deviceStorage: storage,
        resolveSceneStorage: () => storage,
        scope: next,
        liveCardIds: options.liveCardIds,
        isSeenElsewhere: options.isSeenElsewhere,
        now: () => '2026-11-27T00:00:00.000Z'
      });
    },
    notices: notices.host
  });
  let level: object = { ...MAZE };
  let now = 1000;
  let player = { x: 0, y: 7 };
  const frameInput = (over: Partial<LegacyFirstTimeFrameInput> = {}): LegacyFirstTimeFrameInput => ({
    nowMs: now,
    level,
    playing: true,
    visible: true,
    reducedMotion: false,
    noticeTop: 80,
    viewWidth: 390,
    viewHeight: 844,
    player,
    goal: MAZE.goal,
    cellRect: (cell, halo = 0) => resolveTextCardCellRect({ x: 15 + (cell.x * 40), y: 120 + (cell.y * 40) }, 40, 4 + (40 * halo)),
    ...over
  });
  return {
    storage,
    notices,
    controller,
    sessions,
    setScope: (next: string) => { scope = next; },
    newLevel: () => { level = { ...MAZE }; },
    at: () => now,
    advance: (ms: number) => { now += ms; },
    frame: (over: Partial<LegacyFirstTimeFrameInput> = {}) => controller.frame(frameInput(over)),
    /** Two frames: the first draws the coach ring, the second shows the card (a card with a ring waits for its pill). */
    show: (over: Partial<LegacyFirstTimeFrameInput> = {}) => {
      const first = controller.frame(frameInput(over));
      return controller.frame(frameInput(over)) ?? first;
    },
    step: (to: { x: number; y: number }, context?: LegacyFirstTimeStepContext) => {
      const from = player;
      player = to;
      controller.step(from, to, level as typeof MAZE, now, context);
    },
    /** Walk off the left edge at row y and come back on the right. */
    wrapLeft: function (this: void, y = 7) {
      const from = player;
      player = { x: MAZE.width - 1, y };
      controller.step(from, player, level as typeof MAZE, now);
    },
    place: (to: { x: number; y: number }) => { player = to; }
  };
};

describe('first-time host: wrap step detection', () => {
  it('counts a jump across the board on one axis, never a normal step or a diagonal', () => {
    const maze = { width: 9, height: 15 };
    expect(isLegacyFirstTimeWrapStep({ x: 0, y: 3 }, { x: 8, y: 3 }, maze)).toBe(true);
    expect(isLegacyFirstTimeWrapStep({ x: 8, y: 3 }, { x: 0, y: 3 }, maze)).toBe(true);
    expect(isLegacyFirstTimeWrapStep({ x: 4, y: 0 }, { x: 4, y: 14 }, maze)).toBe(true);
    expect(isLegacyFirstTimeWrapStep({ x: 4, y: 3 }, { x: 5, y: 3 }, maze)).toBe(false);
    expect(isLegacyFirstTimeWrapStep({ x: 4, y: 3 }, { x: 4, y: 4 }, maze)).toBe(false);
    expect(isLegacyFirstTimeWrapStep({ x: 0, y: 0 }, { x: 8, y: 14 }, maze)).toBe(false);
    // A 2-wide board cannot tell a wrap from a step.
    expect(isLegacyFirstTimeWrapStep({ x: 0, y: 0 }, { x: 1, y: 0 }, { width: 2, height: 2 })).toBe(false);
  });
});

describe('first-time host: card spot (the shared text card rule; never cover anything important)', () => {
  const frame = { viewWidth: 390, viewHeight: 844, noticeTop: 57, bottomInset: 12, bodyChars: 60, action: true };
  const cell = (y: number, halo = 0) => resolveTextCardCellRect({ x: 195, y }, 40, 4 + (40 * halo));
  const card = (topPx: number) => {
    const width = resolveTextCardWidth(390);
    const height = estimateTextCardHeight({ cardWidth: width, bodyChars: 60, heading: true, action: true });
    return { x: (390 - width) / 2, y: topPx, width, height };
  };
  const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number } | null) => (
    b !== null && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  );
  it('nothing in the way: the top band, right under the HUD', () => {
    expect(resolveLegacyFirstTimeCardSpot({ ...frame, keepClear: [] })).toEqual({ topPx: 57, bottomPx: undefined, covers: -1 });
  });
  it('the player right under the HUD: the bottom band, anchored from the bottom', () => {
    const spot = resolveLegacyFirstTimeCardSpot({ ...frame, keepClear: [cell(120, TEXT_CARD_MARKER_HALO_OF_TILE)] });
    expect(spot.bottomPx).toBe(12);
    expect(spot.covers).toBe(-1);
  });
  it('real L22: player under the header, goal under the top band, ring under the bottom band -> a band in between, clear of all', () => {
    const keepClear = [cell(22, TEXT_CARD_MARKER_HALO_OF_TILE), cell(148, TEXT_CARD_MARKER_HALO_OF_TILE), cell(814)];
    const spot = resolveLegacyFirstTimeCardSpot({ ...frame, keepClear });
    expect(spot.covers).toBe(-1);
    expect(spot.bottomPx).toBeUndefined();
    expect(spot.topPx).toBeGreaterThanOrEqual(57);
    expect(keepClear.some((rect) => overlaps(card(spot.topPx), rect))).toBe(false);
  });
  it('keeps clear of the coach label pill too', () => {
    const pill = { x: 150, y: 57, width: 90, height: 24 };
    const spot = resolveLegacyFirstTimeCardSpot({ ...frame, keepClear: [null, null, null, pill] });
    expect(overlaps(card(spot.topPx), pill)).toBe(false);
  });
  it('no clear spot anywhere: covers the least important thing (the player and goal stay visible)', () => {
    const keepClear = [cell(100, TEXT_CARD_MARKER_HALO_OF_TILE), ...Array.from({ length: 30 }, (_, i) => cell(60 + (i * 28)))];
    const spot = resolveLegacyFirstTimeCardSpot({ ...frame, keepClear });
    expect(spot.covers).toBeGreaterThan(0);
    expect(overlaps(card(spot.topPx), keepClear[0]!)).toBe(false);
  });
});

describe('first-time host: the wrap card', () => {
  it('rings the edge walked off on the frame after the first wrap, then shows the wrap card with the Guide row copy', () => {
    const r = rig();
    r.frame();
    r.place({ x: 0, y: 7 });
    r.wrapLeft();
    expect(r.notices.shown).toHaveLength(0);
    const coach = r.frame();
    // The ring draws first; the card waits one frame so it can keep clear of the ring's label pill.
    expect(r.notices.shown).toHaveLength(0);
    r.frame();
    expect(r.notices.shown).toHaveLength(1);
    const props = r.notices.shown[0]!;
    expect(props).toMatchObject({
      title: 'New',
      heading: 'Wrap',
      icon: 'wrap',
      body: LEGACY_GUIDE_ROWS.find((row) => row.id === 'wrap')!.text,
      tone: 'info',
      actionLabel: 'Got it'
    });
    // The goal (row 0) sits under the top band, so the card takes the bottom band, clear of the goal, player and ring.
    expect(props.bottomPx).toBeGreaterThan(0);
    expect(props.topPx).toBeGreaterThan(120 + 24);
    // The host owns the timer (visible time only); the DOM auto-dismiss stays off.
    expect(props.autoDismissMs).toBeUndefined();
    expect(coach).toEqual({ cardId: 'mechanic.wrap', anchor: { x: 0, y: 7 }, label: '' });
  });

  it('fires once: a later wrap, a new level, or a new session never shows it again once seen', () => {
    const storage = new SpyStorage();
    const r = rig({ storage });
    r.frame();
    r.wrapLeft();
    r.show();
    r.notices.tap();
    r.place({ x: 0, y: 7 });
    r.advance(100);
    r.wrapLeft();
    r.show();
    r.newLevel();
    r.advance(100);
    r.frame();
    r.place({ x: 0, y: 7 });
    r.wrapLeft();
    r.show();
    expect(r.notices.shown).toHaveLength(1);
    // A fresh scene on the same device reads the same record.
    const again = rig({ storage });
    again.frame();
    again.wrapLeft();
    again.show();
    expect(again.notices.shown).toHaveLength(0);
  });

  it('places the card on the screen edge away from the player, the ring and the goal', () => {
    // Player and ring low on the board (rows 12): the card stays at the top (no bottomPx).
    const low = rig();
    low.frame();
    low.place({ x: 0, y: 12 });
    low.wrapLeft(12);
    low.show({ goal: null });
    expect(low.notices.shown[0]!.bottomPx).toBeUndefined();
    // Player and ring high (row 1), goal row 0: the card moves to the bottom edge.
    const high = rig();
    high.frame();
    high.place({ x: 0, y: 1 });
    high.wrapLeft(1);
    high.show();
    expect(high.notices.shown[0]!.bottomPx).toBeGreaterThan(0);
  });

  it('a move before 800 ms keeps the card; the first move after acks it and the ring lingers 4 s', () => {
    const r = rig();
    r.frame();
    r.wrapLeft();
    r.show();
    r.advance(FIRST_TIME_MIN_SHOWN_MS - 100);
    r.step({ x: 8, y: 6 });
    expect(r.notices.isOpen()).toBe(true);
    r.advance(200);
    r.step({ x: 8, y: 5 });
    expect(r.notices.isOpen()).toBe(false);
    expect(r.frame()).not.toBeNull();
    r.advance(FIRST_TIME_COACH_LINGER_MS + 1);
    expect(r.frame()).toBeNull();
  });

  it('the ring goes as soon as the player steps back onto it', () => {
    const r = rig();
    r.frame();
    r.wrapLeft();
    r.show();
    r.advance(FIRST_TIME_MIN_SHOWN_MS + 1);
    r.step({ x: 0, y: 7 });
    expect(r.frame()).toBeNull();
  });

  it('counts only visible time toward the 4.5 s auto-dismiss: a pause holds the card', () => {
    const r = rig();
    r.frame();
    r.wrapLeft();
    r.show();
    for (let i = 0; i < 10; i += 1) {
      r.advance(1000);
      r.frame({ visible: false });
    }
    expect(r.notices.isOpen()).toBe(true);
    expect(r.notices.isHidden()).toBe(true);
    r.advance(16);
    r.frame();
    expect(r.notices.isHidden()).toBe(false);
    for (let i = 0; i < 5; i += 1) {
      r.advance(1000);
      r.frame();
    }
    expect(r.notices.isOpen()).toBe(false);
    expect(r.controller.describe().activeCardId).toBeNull();
    expect(FIRST_TIME_AUTO_DISMISS_MS).toBeLessThan(5000);
  });

  it('a tap on "Got it" acks the card and keeps the ring for its linger', () => {
    const r = rig();
    r.frame();
    r.wrapLeft();
    r.show();
    r.notices.tap();
    expect(r.controller.describe().activeCardId).toBeNull();
    expect(r.frame()).not.toBeNull();
  });

  it('a new level closes the card and the ring', () => {
    const r = rig();
    r.frame();
    r.wrapLeft();
    r.show();
    r.newLevel();
    r.advance(16);
    expect(r.frame()).toBeNull();
    expect(r.notices.isOpen()).toBe(false);
  });

  it('waits to show a card while a pause or overlay is up', () => {
    const r = rig();
    r.frame();
    r.wrapLeft();
    r.frame({ visible: false });
    expect(r.notices.shown).toHaveLength(0);
    r.show();
    expect(r.notices.shown).toHaveLength(1);
  });

  it('starts a fresh session for a new auth scope (sign-in), closing what was up', () => {
    const r = rig();
    r.frame();
    r.wrapLeft();
    r.show();
    r.setScope('user:abc');
    r.frame();
    expect(r.notices.isOpen()).toBe(false);
    expect(r.sessions).toEqual(['guest', 'user:abc']);
  });
});

describe('first-time host: the Switch card', () => {
  const BOTH: readonly FirstTimeCardId[] = ['mechanic.wrap', 'mechanic.switch'];
  const anchor = { x: 4, y: 0 };
  const lit = (...keys: string[]) => ({ litSwitchKeys: new Set(keys), resolveSwitchAnchor: () => anchor });

  it('fires when a Switch goes from unlit to lit, rings the opened border cell with its label', () => {
    const r = rig({ liveCardIds: BOTH });
    r.frame(lit());
    r.advance(16);
    // Lighting happens in the scene's frame: the ring draws on that same frame, the card on the next.
    expect(r.frame(lit('vertical:4'))).toEqual({ cardId: 'mechanic.switch', anchor, label: 'Open edge' });
    expect(r.notices.shown).toHaveLength(0);
    r.frame(lit('vertical:4'));
    expect(r.notices.shown).toHaveLength(1);
    expect(r.notices.shown[0]).toMatchObject({ heading: 'Switch', icon: 'switch' });
  });

  it('fires when the first step of the scene lights a Switch (the host installs on that step; real L200 board)', () => {
    const r = rig({ liveCardIds: BOTH });
    expect(r.frame(lit('vertical:4'))).toEqual({ cardId: 'mechanic.switch', anchor, label: 'Open edge' });
    r.frame(lit('vertical:4'));
    expect(r.notices.shown).toHaveLength(1);
  });

  it('nothing fires while not playing; a Switch relit after a reset never re-fires once seen', () => {
    const r = rig({ liveCardIds: BOTH });
    r.frame({ ...lit('vertical:4'), playing: false });
    r.frame(lit('vertical:4'));
    expect(r.notices.shown).toHaveLength(0);
    r.frame(lit());
    r.frame(lit('vertical:4'));
    r.frame(lit('vertical:4'));
    expect(r.notices.shown).toHaveLength(1);
    r.notices.tap();
    r.frame(lit());
    r.frame(lit('vertical:4'));
    r.frame(lit('vertical:4'));
    expect(r.notices.shown).toHaveLength(1);
  });

  it('the Switch card is not live in a slice-2-only build list', () => {
    const r = rig({ liveCardIds: ['mechanic.wrap'] });
    r.frame(lit());
    r.frame(lit('vertical:4'));
    r.frame(lit('vertical:4'));
    expect(r.notices.shown).toHaveLength(0);
  });

  it('a ring under the header keeps the ring but drops its label (the pill would land on the menu button)', () => {
    expect(resolveLegacyFirstTimeCoachLabel('Open edge', 18, 57)).toBe('');
    expect(resolveLegacyFirstTimeCoachLabel('Open edge', 57, 57)).toBe('Open edge');
    expect(resolveLegacyFirstTimeCoachLabel('Open edge', null, 57)).toBe('Open edge');
  });

  it('anchors on the nearer opened border cell by walking distance, not straight-line distance', () => {
    // A 5x5 board: column 2 is the Switch's vertical path; the player at (0,1) can only walk down the left column and
    // along the bottom row, so the bottom mouth (2,4) is nearer on foot although (2,0) is nearer as the crow flies.
    const grid = [
      [false, false, true, false, false],
      [true, false, true, false, false],
      [true, false, true, false, false],
      [true, false, true, false, false],
      [true, true, true, false, false]
    ];
    const maze = { grid, width: 5, height: 5, bleedGates: [{ axis: 'vertical' as const, line: 2 }] };
    expect(resolveLegacyFirstTimeSwitchAnchor(maze, 'vertical:2', { x: 0, y: 1 })).toEqual({ x: 2, y: 4 });
    expect(resolveLegacyFirstTimeSwitchAnchor(maze, 'vertical:2', null)).toEqual({ x: 2, y: 0 });
    expect(resolveLegacyFirstTimeSwitchAnchor(maze, 'horizontal:1', { x: 0, y: 1 })).toBeNull();
  });
});

/** A shard run like ShardPlayPresenter's: cells taken in order; the star is locked until all are taken. */
const fakeShards = (cells: readonly { x: number; y: number }[]) => {
  let collected = 0;
  const view: LegacyFirstTimeShardView & { take(): void; holds: boolean[] } = {
    get goalLocked() { return collected < cells.length; },
    untakenShardCell: (offset = 0) => (collected < cells.length ? cells[collected + offset] ?? null : null),
    take: () => { collected += 1; },
    holds: [],
    holdNotices(held: boolean) { this.holds.push(held); }
  };
  return view;
};

const fakeGates = (cells: readonly { x: number; y: number }[], mode: string | null = 'play'): LegacyFirstTimeGateView => ({
  gateCount: cells.length,
  mode,
  gateX: (index) => cells[index]!.x,
  gateY: (index) => cells[index]!.y
});

describe('first-time host: Shard and Pulse Gate touches (pure)', () => {
  it('a shard pickup is landing on the next untaken shard; the coach target is the shard after it (none after the last)', () => {
    const shards = fakeShards([{ x: 2, y: 5 }, { x: 6, y: 9 }]);
    expect(resolveLegacyFirstTimeShardTouch(shards, { x: 2, y: 5 }, MAZE.goal)).toEqual({ touch: 'shard-pickup', next: { x: 6, y: 9 } });
    // The second shard out of order is not a pickup (only the next one can be taken).
    expect(resolveLegacyFirstTimeShardTouch(shards, { x: 6, y: 9 }, MAZE.goal)).toBeNull();
    shards.take();
    expect(resolveLegacyFirstTimeShardTouch(shards, { x: 6, y: 9 }, MAZE.goal)).toEqual({ touch: 'shard-pickup', next: null });
  });

  it('a step onto the locked star is a locked-star step ringing the next shard; an open star or a plain cell is no touch', () => {
    const shards = fakeShards([{ x: 2, y: 5 }]);
    expect(resolveLegacyFirstTimeShardTouch(shards, MAZE.goal, MAZE.goal)).toEqual({ touch: 'locked-star-step', next: { x: 2, y: 5 } });
    expect(resolveLegacyFirstTimeShardTouch(shards, { x: 1, y: 1 }, MAZE.goal)).toBeNull();
    shards.take();
    expect(resolveLegacyFirstTimeShardTouch(shards, MAZE.goal, MAZE.goal)).toBeNull();
    expect(resolveLegacyFirstTimeShardTouch(fakeShards([]), MAZE.goal, MAZE.goal)).toBeNull();
  });

  it('a Pulse Gate touch is a move one cell from a gate on a row or column (or onto it), nearest first, play only', () => {
    const gates = fakeGates([{ x: 3, y: 7 }, { x: 5, y: 7 }]);
    expect(resolveLegacyFirstTimeAdjacentGate(gates, { x: 2, y: 7 })).toEqual({ x: 3, y: 7 });
    expect(resolveLegacyFirstTimeAdjacentGate(gates, { x: 3, y: 6 })).toEqual({ x: 3, y: 7 });
    expect(resolveLegacyFirstTimeAdjacentGate(gates, { x: 5, y: 7 })).toEqual({ x: 5, y: 7 });
    expect(resolveLegacyFirstTimeAdjacentGate(gates, { x: 4, y: 6 })).toBeNull(); // diagonal to both
    expect(resolveLegacyFirstTimeAdjacentGate(gates, { x: 1, y: 7 })).toBeNull(); // two cells away
    expect(resolveLegacyFirstTimeAdjacentGate(fakeGates([{ x: 3, y: 7 }], 'menu'), { x: 2, y: 7 })).toBeNull();
    expect(resolveLegacyFirstTimeAdjacentGate(fakeGates([]), { x: 2, y: 7 })).toBeNull();
  });

  it('R5: hazard onboarding drops its own card only for the live registry kinds, and only with both labs on', () => {
    const cardsOn = vi.fn(() => true);
    expect(resolveLegacyFirstTimeOwnedHazardKinds(false, cardsOn)).toEqual([]);
    expect(cardsOn).not.toHaveBeenCalled(); // hazard layer off: the first-time flag is never read
    expect(resolveLegacyFirstTimeOwnedHazardKinds(true, () => false)).toEqual([]);
    expect(resolveLegacyFirstTimeOwnedHazardKinds(true, cardsOn)).toEqual(['shard', 'pulseGate']);
    expect(resolveLegacyFirstTimeOwnedHazardKinds(true, cardsOn, ['mechanic.wrap', 'mechanic.pulse-gate'])).toEqual(['pulseGate']);
  });

  it('R5: the old shard hint / Pulse Gate intro in introsShown counts that card (and only that card) as seen', () => {
    expect(isLegacyFirstTimeCardSeenByHazardRecord('mechanic.locked-gate', ['shard'])).toBe(true);
    expect(isLegacyFirstTimeCardSeenByHazardRecord('mechanic.locked-gate', ['pulseGate'])).toBe(false);
    expect(isLegacyFirstTimeCardSeenByHazardRecord('mechanic.pulse-gate', ['pulseGate'])).toBe(true);
    expect(isLegacyFirstTimeCardSeenByHazardRecord('mechanic.wrap', ['shard', 'pulseGate'])).toBe(false);
    expect(isLegacyFirstTimeCardSeenByHazardRecord('mechanic.locked-gate', null)).toBe(false);
  });
});

describe('first-time host: the Shard card (slice 7)', () => {
  const SHARDS = [{ x: 2, y: 5 }, { x: 6, y: 9 }];

  it('fires on the first shard pickup with the Guide Shard row copy and rings the next untaken shard', () => {
    const r = rig();
    const shards = fakeShards(SHARDS);
    r.frame();
    r.place({ x: 2, y: 4 });
    r.step({ x: 2, y: 5 }, { shards });
    shards.take(); // the scene notes the arrival after the hook
    expect(r.controller.busy()).toBe(true);
    const coach = r.show();
    expect(coach).toEqual({ cardId: 'mechanic.locked-gate', anchor: { x: 6, y: 9 }, label: 'Take this next' });
    expect(r.notices.shown).toHaveLength(1);
    const row = resolveLegacyGuideHazardRow('shard');
    expect(r.notices.shown[0]).toMatchObject({ title: 'New', heading: row.heading, icon: 'locked-star', body: row.text, actionLabel: 'Got it' });
    // R4: the ring goes once the player reaches that shard.
    r.advance(100);
    r.step({ x: 6, y: 9 }, { shards });
    expect(r.controller.describe().coach).toBeNull();
  });

  it('fires on a first step onto the locked star, ringing the first shard; never on an open star', () => {
    const r = rig();
    const shards = fakeShards(SHARDS);
    r.frame();
    r.place({ x: 4, y: 1 });
    r.step(MAZE.goal, { shards });
    expect(r.show()).toEqual({ cardId: 'mechanic.locked-gate', anchor: { x: 2, y: 5 }, label: 'Take this next' });
    const open = rig();
    const taken = fakeShards([{ x: 2, y: 5 }]);
    taken.take();
    open.frame();
    open.place({ x: 4, y: 1 });
    open.step(MAZE.goal, { shards: taken });
    open.show();
    expect(open.notices.shown).toHaveLength(0);
  });

  it('the only shard: the pickup opens the star, so the card shows with no ring', () => {
    const r = rig();
    const shards = fakeShards([{ x: 2, y: 5 }]);
    r.frame();
    r.place({ x: 2, y: 4 });
    r.step({ x: 2, y: 5 }, { shards });
    shards.take();
    expect(r.show()).toBeNull();
    expect(r.notices.shown).toHaveLength(1);
    r.notices.tap();
    expect(r.controller.busy()).toBe(false);
  });

  it('fires once: later pickups, a new level or a new session never show it again once seen', () => {
    const storage = new SpyStorage();
    const r = rig({ storage });
    const shards = fakeShards(SHARDS);
    r.frame();
    r.place({ x: 2, y: 4 });
    r.step({ x: 2, y: 5 }, { shards });
    shards.take();
    r.show();
    r.notices.tap();
    r.newLevel();
    r.advance(100);
    r.frame();
    const next = fakeShards(SHARDS);
    r.place({ x: 2, y: 4 });
    r.step({ x: 2, y: 5 }, { shards: next });
    r.show();
    expect(r.notices.shown).toHaveLength(1);
    const again = rig({ storage });
    again.frame();
    again.place({ x: 4, y: 1 });
    again.step(MAZE.goal, { shards: fakeShards(SHARDS) });
    again.show();
    expect(again.notices.shown).toHaveLength(0);
  });

  it("R5: a player who already had the old shard hint (introsShown: ['shard']) never gets the card; Pulse Gate still fires", () => {
    const r = rig({ isSeenElsewhere: (card) => isLegacyFirstTimeCardSeenByHazardRecord(card.id, ['shard']) });
    r.frame();
    r.place({ x: 2, y: 4 });
    r.step({ x: 2, y: 5 }, { shards: fakeShards(SHARDS) });
    r.show();
    expect(r.notices.shown).toHaveLength(0);
    r.place({ x: 1, y: 7 });
    r.step({ x: 2, y: 7 }, { gates: fakeGates([{ x: 3, y: 7 }]) });
    r.show();
    expect(r.notices.shown.map((props) => props.heading)).toEqual(['Pulse Gate']);
  });
});

describe('first-time host: the Pulse Gate card (slice 8)', () => {
  const GATES = [{ x: 3, y: 7 }];

  it('fires on the first move next to a Pulse Gate with the Guide Pulse Gate row copy and rings that gate', () => {
    const r = rig();
    r.frame();
    r.place({ x: 1, y: 7 });
    r.step({ x: 2, y: 7 }, { gates: fakeGates(GATES) });
    expect(r.show()).toEqual({ cardId: 'mechanic.pulse-gate', anchor: { x: 3, y: 7 }, label: 'Wait for the gap' });
    const row = resolveLegacyGuideHazardRow('pulseGate');
    expect(r.notices.shown).toHaveLength(1);
    expect(r.notices.shown[0]).toMatchObject({ title: 'New', heading: row.heading, icon: 'pulse-gate', body: row.text, actionLabel: 'Got it' });
  });

  it('fires once: moving next to a gate again, on this or a later level, shows nothing', () => {
    const r = rig();
    r.frame();
    r.place({ x: 1, y: 7 });
    r.step({ x: 2, y: 7 }, { gates: fakeGates(GATES) });
    r.show();
    r.notices.tap();
    r.advance(100);
    r.place({ x: 3, y: 5 });
    r.step({ x: 3, y: 6 }, { gates: fakeGates(GATES) });
    r.show();
    r.newLevel();
    r.advance(100);
    r.frame();
    r.place({ x: 1, y: 7 });
    r.step({ x: 2, y: 7 }, { gates: fakeGates(GATES) });
    r.show();
    expect(r.notices.shown).toHaveLength(1);
  });

  it('a menu-mode gate (the demo replay) or a step two cells away is no touch', () => {
    const r = rig();
    r.frame();
    r.place({ x: 0, y: 7 });
    r.step({ x: 1, y: 7 }, { gates: fakeGates(GATES) });
    r.step({ x: 2, y: 7 }, { gates: fakeGates(GATES, 'menu') });
    r.show();
    expect(r.notices.shown).toHaveLength(0);
  });

  it('one step that wraps and lands next to a gate: the Pulse Gate (on route) wins over the wrap (optional)', () => {
    const r = rig();
    r.frame();
    r.place({ x: 0, y: 7 });
    r.step({ x: MAZE.width - 1, y: 7 }, { gates: fakeGates([{ x: MAZE.width - 1, y: 6 }]) });
    expect(r.show()).toEqual({ cardId: 'mechanic.pulse-gate', anchor: { x: MAZE.width - 1, y: 6 }, label: 'Wait for the gap' });
  });
});

describe('first-time host: caps hold with the hazard cards (S1, S3)', () => {
  it('S1: one card per level; the Pulse Gate touched after the Shard card on the same level waits for a later level', () => {
    const r = rig();
    r.frame();
    r.place({ x: 2, y: 4 });
    r.step({ x: 2, y: 5 }, { shards: fakeShards([{ x: 2, y: 5 }, { x: 6, y: 9 }]) });
    r.show();
    r.notices.tap();
    r.advance(100);
    r.place({ x: 1, y: 7 });
    r.step({ x: 2, y: 7 }, { gates: fakeGates([{ x: 3, y: 7 }]) });
    r.show();
    expect(r.notices.shown.map((props) => props.heading)).toEqual(['Shard']);
    r.newLevel();
    r.advance(100);
    r.frame();
    r.place({ x: 1, y: 7 });
    r.step({ x: 2, y: 7 }, { gates: fakeGates([{ x: 3, y: 7 }]) });
    r.show();
    expect(r.notices.shown.map((props) => props.heading)).toEqual(['Shard', 'Pulse Gate']);
  });

  it('S3: two cards per session; a third (here the Pulse Gate) waits for the next session', () => {
    const storage = new SpyStorage();
    const r = rig({ storage });
    r.frame();
    r.place({ x: 0, y: 7 });
    r.wrapLeft();
    r.show();
    r.notices.tap();
    r.newLevel();
    r.advance(100);
    r.frame();
    r.place({ x: 2, y: 4 });
    r.step({ x: 2, y: 5 }, { shards: fakeShards([{ x: 2, y: 5 }]) });
    r.show();
    r.notices.tap();
    r.newLevel();
    r.advance(100);
    r.frame();
    r.place({ x: 1, y: 7 });
    r.step({ x: 2, y: 7 }, { gates: fakeGates([{ x: 3, y: 7 }]) });
    r.show();
    expect(r.notices.shown.map((props) => props.heading)).toEqual(['Wrap', 'Shard']);
    const next = rig({ storage });
    next.frame();
    next.place({ x: 1, y: 7 });
    next.step({ x: 2, y: 7 }, { gates: fakeGates([{ x: 3, y: 7 }]) });
    next.show();
    expect(next.notices.shown.map((props) => props.heading)).toEqual(['Pulse Gate']);
  });
});

describe('first-time host: the trail tip (slice 9)', () => {
  it('a step straight back is a backstep; a turn, a second step on, or no previous step is not', () => {
    const a = { x: 2, y: 5 };
    const b = { x: 3, y: 5 };
    expect(isLegacyFirstTimeBackstep({ from: a, to: b }, b, a)).toBe(true);
    expect(isLegacyFirstTimeBackstep(null, b, a)).toBe(false);
    expect(isLegacyFirstTimeBackstep({ from: a, to: b }, b, { x: 3, y: 6 })).toBe(false);
    expect(isLegacyFirstTimeBackstep({ from: a, to: b }, b, { x: 4, y: 5 })).toBe(false);
  });

  it('fires on the first step back with the trail row heading, no ring, and "Got it"', () => {
    const r = rig();
    r.frame();
    r.place({ x: 2, y: 7 });
    r.step({ x: 3, y: 7 });
    r.frame();
    expect(r.notices.shown).toHaveLength(0);
    r.step({ x: 2, y: 7 });
    expect(r.frame()).toBeNull();
    expect(r.notices.shown).toHaveLength(1);
    expect(r.notices.shown[0]).toMatchObject({
      title: 'New',
      heading: LEGACY_GUIDE_ROWS.find((row) => row.id === 'trail')!.heading,
      icon: 'trail',
      body: 'Step back to wipe your trail.',
      actionLabel: 'Got it'
    });
  });

  it('a new level forgets the last step: the first step of a level is never a backstep', () => {
    const r = rig();
    r.frame();
    r.place({ x: 2, y: 7 });
    r.step({ x: 3, y: 7 });
    r.newLevel();
    r.frame();
    r.step({ x: 2, y: 7 });
    r.frame();
    expect(r.notices.shown).toHaveLength(0);
  });

  it('shares the one-card-per-level cap: after the wrap card, a step back waits for the next level', () => {
    const r = rig();
    r.frame();
    r.wrapLeft();
    r.show();
    r.notices.tap();
    r.step({ x: 7, y: 7 });
    r.step({ x: 8, y: 7 });
    r.frame();
    expect(r.notices.shown.map((props) => props.heading)).toEqual(['Wrap']);
  });
});

describe('first-time host: the level-1 goal coach (slice 9)', () => {
  it('after the hint is dismissed: a "Reach these" ring on the twin stars, no notice, seen once drawn', () => {
    const storage = new SpyStorage();
    const r = rig({ storage });
    r.frame();
    r.controller.queueTouch('control-hint-dismissed');
    expect(r.frame()).toEqual({ cardId: 'level-1.goal', anchor: MAZE.goal, label: 'Reach these' });
    expect(r.frame()).toEqual({ cardId: 'level-1.goal', anchor: MAZE.goal, label: 'Reach these' });
    expect(r.notices.shown).toHaveLength(0);
    expect(r.controller.describe().activeCardId).toBeNull();
    // Seen: a later session does not offer it again.
    const again = rig({ storage });
    again.frame();
    again.controller.queueTouch('control-hint-dismissed');
    expect(again.frame()).toBeNull();
  });

  it('the ring stays for the card time plus the linger, then goes', () => {
    const r = rig();
    r.frame();
    r.controller.queueTouch('control-hint-dismissed');
    r.frame();
    r.frame();
    r.advance(FIRST_TIME_AUTO_DISMISS_MS + FIRST_TIME_COACH_LINGER_MS - 1);
    expect(r.frame()).not.toBeNull();
    r.advance(1);
    expect(r.frame()).toBeNull();
  });

  it('waits while not playing, and does not count toward the per-level cap (the trail tip can still fire)', () => {
    const r = rig();
    r.frame();
    r.controller.queueTouch('control-hint-dismissed');
    expect(r.frame({ playing: false })).toBeNull();
    expect(r.frame()).not.toBeNull();
    r.frame();
    r.place({ x: 2, y: 7 });
    r.step({ x: 3, y: 7 });
    r.step({ x: 2, y: 7 });
    r.frame();
    expect(r.notices.shown.map((props) => props.body)).toEqual(['Step back to wipe your trail.']);
  });

  it('no goal to point at: nothing is drawn and the coach is not marked seen', () => {
    const storage = new SpyStorage();
    const r = rig({ storage });
    r.frame();
    r.controller.queueTouch('control-hint-dismissed');
    expect(r.frame({ goal: null })).toBeNull();
    expect(r.frame({ goal: null })).toBeNull();
    const again = rig({ storage });
    again.frame();
    again.controller.queueTouch('control-hint-dismissed');
    expect(again.frame()).not.toBeNull();
  });
});

describe('first-time host: flag and preview', () => {
  it('flag off: no card, no ring, no notice call, and no storage read beyond the lab key', () => {
    const storage = new SpyStorage();
    const r = rig({ search: '', storage });
    r.frame();
    r.wrapLeft();
    expect(r.frame()).toBeNull();
    expect(r.notices.shown).toHaveLength(0);
    expect(storage.calls.every((call) => call === `get:${FIRST_TIME_LAB_STORAGE_KEY}`)).toBe(true);
    expect(storage.writes()).toEqual([]);
  });

  it('Level Preview writes nothing, even with the card shown and acked', () => {
    const storage = new SpyStorage();
    const r = rig({ search: '?lab=firsttime&previewLevel=22', storage });
    r.frame();
    r.wrapLeft();
    r.show();
    expect(r.notices.shown).toHaveLength(1);
    r.notices.tap();
    expect(storage.writes()).toEqual([]);
  });

  it('scene binding, flag off: reads the auth scope once, registers nothing, draws nothing', () => {
    const reads: string[] = [];
    const events = { on: vi.fn(), once: vi.fn(), off: vi.fn() };
    const target = { mode: 'play', maze: { ...MAZE }, events, time: { now: 0 }, authSnapshot: null };
    const scene = new Proxy(target, {
      get: (obj, key) => {
        if (typeof key === 'string') reads.push(key);
        return (obj as Record<string | symbol, unknown>)[key];
      }
    });
    noteLegacyFirstTimeStep(scene as never, { x: 0, y: 3 }, { x: 8, y: 3 });
    noteLegacyFirstTimeStep(scene as never, { x: 8, y: 3 }, { x: 0, y: 3 });
    expect(events.on).not.toHaveBeenCalled();
    expect(events.once).not.toHaveBeenCalled();
    expect(reads).toEqual(['authSnapshot']);
  });
});

describe('first-time host: MenuScene members it reads', () => {
  it('MenuScene still declares every member the binding reads structurally', () => {
    const source = readFileSync(resolve(__dirname, '../../src/scenes/MenuScene.ts'), 'utf8');
    for (const member of LEGACY_FIRST_TIME_SCENE_MEMBERS) {
      const declared = new RegExp(`^\\s+(?:private |protected |public )?(?:readonly )?${member}\\b[?!]?\\s*[:(=<]`, 'm');
      expect(declared.test(source), member).toBe(true);
    }
    // The one-line hook (Wave 5C): the call sits right after an accepted play step.
    const calls = source.match(/noteLegacyFirstTimeStep\(/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(source).toMatch(/this\.appendLegacyPlayCyclePoint\(nextStep\.player\);\s+noteLegacyFirstTimeStep\(this, previousPlayer, nextStep\.player\);/);
  });
});
