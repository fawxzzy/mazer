import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { Renderer: { Canvas: { SetTransform: () => true } } } }));

import {
  FIRST_TIME_AUTO_DISMISS_MS,
  FIRST_TIME_COACH_LINGER_MS,
  FIRST_TIME_MIN_SHOWN_MS,
  type FirstTimeCardId
} from '../../src/legacy-runtime/legacyFirstTimeCards';
import { FIRST_TIME_LAB_STORAGE_KEY } from '../../src/legacy-runtime/legacyFirstTimeFlag';
import {
  FIRST_TIME_NOTICE_KEY,
  LEGACY_FIRST_TIME_SCENE_MEMBERS,
  createLegacyFirstTimeCardController,
  isLegacyFirstTimeWrapStep,
  noteLegacyFirstTimeStep,
  resolveLegacyFirstTimeCardEdge,
  resolveLegacyFirstTimeSwitchAnchor,
  type LegacyFirstTimeFrameInput,
  type LegacyFirstTimeNoticeProps
} from '../../src/legacy-runtime/legacyFirstTimeHost';
import { createLegacyFirstTimeSession } from '../../src/legacy-runtime/legacyFirstTimeSession';
import type { LegacyInFlowNoticeHost } from '../../src/legacy-runtime/legacyInFlowNoticeHost';
import { LEGACY_GUIDE_ROWS } from '../../src/legacy-runtime/legacyGuideContent';
import type { TutorialStorage } from '../../src/tutorial/index.ts';
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
const rig = (options: { search?: string; storage?: SpyStorage; liveCardIds?: readonly FirstTimeCardId[] } = {}) => {
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
    viewHeight: 844,
    player,
    goal: MAZE.goal,
    cellScreenY: (cell) => 120 + cell.y * 40,
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
    step: (to: { x: number; y: number }) => {
      const from = player;
      player = to;
      controller.step(from, to, level as typeof MAZE, now);
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

describe('first-time host: card edge (never cover anything important)', () => {
  const frame = { noticeTop: 80, viewHeight: 844, bottomInset: 16 };
  it('real L10 wrap (up off row 0): player at the bottom, ring and goal under the header -> top', () => {
    expect(resolveLegacyFirstTimeCardEdge({ ...frame, points: [{ y: 814, weight: 3 }, { y: 30, weight: 2 }, { y: 54, weight: 1 }] })).toBe('top');
  });
  it('real L22 wrap (down off the last row): player under the header, ring and goal low -> top', () => {
    expect(resolveLegacyFirstTimeCardEdge({ ...frame, points: [{ y: 22, weight: 3 }, { y: 800, weight: 2 }, { y: 780, weight: 1 }] })).toBe('top');
  });
  it('player right under the header -> bottom; both bands busy -> the one covering the player loses', () => {
    expect(resolveLegacyFirstTimeCardEdge({ ...frame, points: [{ y: 120, weight: 3 }] })).toBe('bottom');
    expect(resolveLegacyFirstTimeCardEdge({ ...frame, points: [{ y: 120, weight: 3 }, { y: 790, weight: 1 }] })).toBe('bottom');
    expect(resolveLegacyFirstTimeCardEdge({ ...frame, points: [{ y: 790, weight: 3 }, { y: 120, weight: 2 }] })).toBe('top');
  });
  it('nothing in either band: the spec rule (farther edge, ties to the top)', () => {
    expect(resolveLegacyFirstTimeCardEdge({ ...frame, points: [] })).toBe('top');
    expect(resolveLegacyFirstTimeCardEdge({ ...frame, points: [{ y: 300, weight: 3 }] })).toBe('bottom');
    expect(resolveLegacyFirstTimeCardEdge({ ...frame, points: [{ y: 600, weight: 3 }] })).toBe('top');
  });
});

describe('first-time host: the wrap card', () => {
  it('shows the wrap card on the frame after the first wrap, with the Guide row copy, and rings the edge walked off', () => {
    const r = rig();
    r.frame();
    r.place({ x: 0, y: 7 });
    r.wrapLeft();
    expect(r.notices.shown).toHaveLength(0);
    const coach = r.frame();
    expect(r.notices.shown).toHaveLength(1);
    const props = r.notices.shown[0]!;
    expect(props).toMatchObject({
      title: 'New',
      heading: 'Wrap',
      icon: 'wrap',
      body: LEGACY_GUIDE_ROWS.find((row) => row.id === 'wrap')!.text,
      tone: 'info',
      actionLabel: 'Got it',
      topPx: 80
    });
    // The host owns the timer (visible time only); the DOM auto-dismiss stays off.
    expect(props.autoDismissMs).toBeUndefined();
    expect(coach).toEqual({ cardId: 'mechanic.wrap', anchor: { x: 0, y: 7 }, label: '' });
  });

  it('fires once: a later wrap, a new level, or a new session never shows it again once seen', () => {
    const storage = new SpyStorage();
    const r = rig({ storage });
    r.frame();
    r.wrapLeft();
    r.frame();
    r.notices.tap();
    r.place({ x: 0, y: 7 });
    r.advance(100);
    r.wrapLeft();
    r.frame();
    r.newLevel();
    r.advance(100);
    r.frame();
    r.place({ x: 0, y: 7 });
    r.wrapLeft();
    r.frame();
    expect(r.notices.shown).toHaveLength(1);
    // A fresh scene on the same device reads the same record.
    const again = rig({ storage });
    again.frame();
    again.wrapLeft();
    again.frame();
    expect(again.notices.shown).toHaveLength(0);
  });

  it('places the card on the screen edge away from the player, the ring and the goal', () => {
    // Player and ring low on the board (rows 12): the card stays at the top (no bottomPx).
    const low = rig();
    low.frame();
    low.place({ x: 0, y: 12 });
    low.wrapLeft(12);
    low.frame({ goal: null });
    expect(low.notices.shown[0]!.bottomPx).toBeUndefined();
    // Player and ring high (row 1), goal row 0: the card moves to the bottom edge.
    const high = rig();
    high.frame();
    high.place({ x: 0, y: 1 });
    high.wrapLeft(1);
    high.frame();
    expect(high.notices.shown[0]!.bottomPx).toBeGreaterThan(0);
  });

  it('a move before 800 ms keeps the card; the first move after acks it and the ring lingers 4 s', () => {
    const r = rig();
    r.frame();
    r.wrapLeft();
    r.frame();
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
    r.frame();
    r.advance(FIRST_TIME_MIN_SHOWN_MS + 1);
    r.step({ x: 0, y: 7 });
    expect(r.frame()).toBeNull();
  });

  it('counts only visible time toward the 4.5 s auto-dismiss: a pause holds the card', () => {
    const r = rig();
    r.frame();
    r.wrapLeft();
    r.frame();
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
    r.frame();
    r.notices.tap();
    expect(r.controller.describe().activeCardId).toBeNull();
    expect(r.frame()).not.toBeNull();
  });

  it('a new level closes the card and the ring', () => {
    const r = rig();
    r.frame();
    r.wrapLeft();
    r.frame();
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
    r.frame();
    expect(r.notices.shown).toHaveLength(1);
  });

  it('starts a fresh session for a new auth scope (sign-in), closing what was up', () => {
    const r = rig();
    r.frame();
    r.wrapLeft();
    r.frame();
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
    // Lighting happens in the scene's frame: the card shows on that same frame.
    expect(r.frame(lit('vertical:4'))).toEqual({ cardId: 'mechanic.switch', anchor, label: 'Open edge' });
    expect(r.notices.shown).toHaveLength(1);
    expect(r.notices.shown[0]).toMatchObject({ heading: 'Switch', icon: 'switch' });
  });

  it('a Switch already lit when the level is first seen, or relit after a reset, never re-fires once seen', () => {
    const r = rig({ liveCardIds: BOTH });
    r.frame(lit('vertical:4'));
    r.advance(16);
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
    r.frame();
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
