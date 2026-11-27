import { describe, expect, it } from 'vitest';

import {
  FIRST_TIME_AUTO_DISMISS_MS,
  FIRST_TIME_COPY_MAX_CHARS,
  FIRST_TIME_MIN_SHOWN_MS,
  FIRST_TIME_SESSION_CARD_CAP,
  LEGACY_FIRST_TIME_CARDS,
  LEGACY_FIRST_TIME_LIVE_CARD_IDS,
  LEGACY_FIRST_TIME_TUTORIAL_REGISTRY,
  beginFirstTimeLevel,
  createFirstTimeCardsState,
  decideFirstTimeTouch,
  resolveFirstTimeCard,
  resolveFirstTimeCardPlacement,
  resolveFirstTimeDismiss,
  type FirstTimeCard,
  type FirstTimeCardId,
  type FirstTimeCardsState,
  type FirstTimeTouchKind
} from '../../src/legacy-runtime/legacyFirstTimeCards';
import { LEGACY_CONTROL_HINT_TOKEN } from '../../src/legacy-runtime/legacyControlHint';
import { LEGACY_GUIDE_HAZARD_ROWS, LEGACY_GUIDE_ROWS } from '../../src/legacy-runtime/legacyGuideContent';
import { validateTutorialRegistry } from '../../src/tutorial/tutorialRegistry';

const ALL_TOUCH_CARDS: FirstTimeCardId[] = ['mechanic.locked-gate', 'mechanic.pulse-gate', 'mechanic.switch', 'mechanic.wrap', 'tip.trail', 'level-1.goal'];

/** A tiny driver over the pure machine with an in-memory seen set (the session test covers the real store). */
const driver = (liveCardIds: readonly FirstTimeCardId[] = ALL_TOUCH_CARDS) => {
  let state: FirstTimeCardsState = createFirstTimeCardsState();
  const seen = new Set<FirstTimeCardId>();
  const met = new Set<FirstTimeCardId>();
  let clock = 0;
  return {
    seen,
    met,
    get state() { return state; },
    advance(ms: number) { clock += ms; },
    touch(...touches: FirstTimeTouchKind[]): FirstTimeCard | null {
      const result = decideFirstTimeTouch(state, { touches, nowMs: clock, liveCardIds, isSeen: (card) => seen.has(card.id) });
      result.met.forEach((id) => met.add(id));
      state = result.state;
      return result.fire;
    },
    dismiss(reason: Parameters<typeof resolveFirstTimeDismiss>[1]) {
      const result = resolveFirstTimeDismiss(state, reason, clock);
      state = result.state;
      if (result.outcome === 'acked' && result.cardId) seen.add(result.cardId);
      return result.outcome;
    },
    nextLevel() {
      const result = beginFirstTimeLevel(state, clock);
      state = result.state;
      if (result.outcome === 'acked' && result.cardId) seen.add(result.cardId);
      return result.outcome;
    }
  };
};

describe('first-time card registry', () => {
  it('has unique ids and unique priorities, and order equals priority', () => {
    const ids = LEGACY_FIRST_TIME_CARDS.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
    const priorities = LEGACY_FIRST_TIME_CARDS.map((card) => card.priority);
    expect(new Set(priorities).size).toBe(priorities.length);
    for (const card of LEGACY_FIRST_TIME_CARDS) {
      if (card.id !== 'level-1.controls') expect(card.token.order).toBe(card.priority);
      expect(card.token.id).toBe(card.id);
    }
    expect(LEGACY_FIRST_TIME_CARDS.map((card) => card.id)).toEqual([
      'level-1.controls', 'mechanic.locked-gate', 'mechanic.pulse-gate', 'mechanic.switch', 'mechanic.wrap', 'tip.trail', 'level-1.goal'
    ]);
  });

  it('passes validateTutorialRegistry, with once / revision 1 / first-occurrence mechanic-touch events', () => {
    const result = validateTutorialRegistry(JSON.parse(JSON.stringify(LEGACY_FIRST_TIME_TUTORIAL_REGISTRY)));
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    for (const token of LEGACY_FIRST_TIME_TUTORIAL_REGISTRY.tokens) {
      expect(token.repeat).toBe('once');
      expect(token.revision).toBe(1);
      expect(token.trigger.kind).toBe('first-occurrence');
    }
    // The device-scoped level-1 hint keeps its own token and store.
    expect(LEGACY_FIRST_TIME_TUTORIAL_REGISTRY.tokens.map((token) => token.id)).not.toContain('level-1.controls');
    expect(resolveFirstTimeCard('level-1.controls').token).toBe(LEGACY_CONTROL_HINT_TOKEN);
    expect(resolveFirstTimeCard('level-1.controls').store).toBe('device');
  });

  it('keeps every line within the Guide cap and names an existing Guide row', () => {
    const rowIds = new Set<string>([...LEGACY_GUIDE_ROWS, ...LEGACY_GUIDE_HAZARD_ROWS].map((row) => row.id));
    for (const card of LEGACY_FIRST_TIME_CARDS) {
      expect(rowIds.has(card.guideRowId), card.id).toBe(true);
      if (card.notice && card.id !== 'level-1.controls') {
        expect(card.notice.body.length, card.id).toBeLessThanOrEqual(FIRST_TIME_COPY_MAX_CHARS);
        expect(card.notice.heading.length).toBeGreaterThan(0);
        expect(card.notice.marker).toBe('New');
        expect(card.notice.actionLabel).toBe('Got it');
      }
      if (card.coach) expect(card.coach.ring).toBe('dotted');
    }
  });

  it('carries the spec section 4 / 8 copy unchanged, the hazard cards reading their Guide rows', () => {
    const shard = resolveFirstTimeCard('mechanic.locked-gate');
    expect(shard.notice).toMatchObject({ heading: 'Shard', body: 'Take the shards in order. The star stays locked until you do.' });
    expect(shard.notice!.body).toBe(LEGACY_GUIDE_HAZARD_ROWS.find((row) => row.id === 'hazard-shard')!.text);
    expect(shard.coach).toEqual({ target: 'next-untaken-shard', label: 'Take this next', ring: 'dotted' });

    const gate = resolveFirstTimeCard('mechanic.pulse-gate');
    expect(gate.notice).toMatchObject({ heading: 'Pulse Gate', body: 'Gates open and shut on a beat. Wait for the gap, then go through.' });
    expect(gate.notice!.body).toBe(LEGACY_GUIDE_HAZARD_ROWS.find((row) => row.id === 'hazard-gate')!.text);
    expect(gate.coach).toEqual({ target: 'touched-pulse-gate', label: 'Wait for the gap', ring: 'dotted' });

    const sw = resolveFirstTimeCard('mechanic.switch');
    expect(sw.notice).toMatchObject({ heading: 'Switch', body: 'A Switch is the pale tile with a dashed ring. Walk onto it to open a hidden wrap.' });
    expect(sw.coach).toEqual({ target: 'opened-border-cell', label: 'Open edge', ring: 'dotted' });
    expect(sw.guideRowId).toBe('bleed-gate');

    const wrap = resolveFirstTimeCard('mechanic.wrap');
    expect(wrap.notice).toMatchObject({ heading: 'Wrap', body: 'Open edges wrap: walk off one to come back on the far side. Edge stars fill as beams hit.' });
    // Slice 2: the body IS the Guide Wrap row (R2), and the ring stays on the edge walked off (Zac 2026-11-27), no label.
    expect(wrap.notice!.body).toBe(LEGACY_GUIDE_ROWS.find((row) => row.id === 'wrap')!.text);
    expect(wrap.coach).toEqual({ target: 'wrapped-edge-cell', label: '', ring: 'dotted' });

    expect(resolveFirstTimeCard('tip.trail').notice).toMatchObject({ heading: LEGACY_GUIDE_ROWS.find((row) => row.id === 'trail')!.heading, body: 'Step back to wipe your trail.' });
    expect(resolveFirstTimeCard('tip.trail').coach).toBeNull();

    const goal = resolveFirstTimeCard('level-1.goal');
    expect(goal.notice).toBeNull();
    expect(goal.coach).toEqual({ target: 'goal-stars', label: 'Reach these', ring: 'dotted' });
    expect(goal.countsTowardCaps).toBe(false);
  });

  it('maps each first touch to its card (D5)', () => {
    expect(resolveFirstTimeCard('mechanic.locked-gate').touches).toEqual(['shard-pickup', 'locked-star-step']);
    expect(resolveFirstTimeCard('mechanic.pulse-gate').touches).toEqual(['pulse-gate-adjacent']);
    expect(resolveFirstTimeCard('mechanic.switch').touches).toEqual(['switch-trigger']);
    expect(resolveFirstTimeCard('mechanic.wrap').touches).toEqual(['wrap-step']);
    expect(resolveFirstTimeCard('tip.trail').touches).toEqual(['trail-backstep']);
    expect(resolveFirstTimeCard('level-1.goal').touches).toEqual(['control-hint-dismissed']);
    expect(resolveFirstTimeCard('level-1.controls').touches).toEqual([]);
  });

  it('ships only the wrap (slice 2) and Switch (slice 3) cards live: every other touch fires nothing and marks nothing met', () => {
    expect(LEGACY_FIRST_TIME_LIVE_CARD_IDS).toEqual(['mechanic.wrap', 'mechanic.switch']);
    const switchCard = resolveFirstTimeCard('mechanic.switch');
    expect(switchCard.notice).toMatchObject({ heading: 'Switch', body: LEGACY_GUIDE_ROWS.find((row) => row.id === 'bleed-gate')!.text });
    expect(LEGACY_GUIDE_ROWS.find((row) => row.id === 'bleed-gate')!.heading).toBe('Switch');
    expect(decideFirstTimeTouch(createFirstTimeCardsState(), { touches: ['switch-trigger'], nowMs: 0, isSeen: () => false }).fire?.id)
      .toBe('mechanic.switch');
    const others = decideFirstTimeTouch(createFirstTimeCardsState(), {
      touches: ['shard-pickup', 'pulse-gate-adjacent', 'trail-backstep', 'control-hint-dismissed'],
      nowMs: 0,
      isSeen: () => false
    });
    expect(others.fire).toBeNull();
    expect(others.met).toEqual([]);
    const wrap = decideFirstTimeTouch(createFirstTimeCardsState(), { touches: ['wrap-step'], nowMs: 0, isSeen: () => false });
    expect(wrap.fire?.id).toBe('mechanic.wrap');
  });
});

describe('first-time card state machine', () => {
  it('fires a card once, on first touch only, and never again once acked', () => {
    const d = driver();
    expect(d.touch('wrap-step')?.id).toBe('mechanic.wrap');
    d.advance(FIRST_TIME_AUTO_DISMISS_MS);
    expect(d.dismiss('timeout')).toBe('acked');
    d.nextLevel();
    expect(d.touch('wrap-step')).toBeNull();
  });

  it('S1: one card per level; a second mechanic in the same level is deferred, met, and fires next level', () => {
    const d = driver();
    expect(d.touch('shard-pickup')?.id).toBe('mechanic.locked-gate');
    d.advance(1000);
    expect(d.dismiss('action')).toBe('acked');
    expect(d.touch('switch-trigger')).toBeNull();
    expect(d.met.has('mechanic.switch')).toBe(true);
    expect(d.seen.has('mechanic.switch')).toBe(false);
    d.nextLevel();
    expect(d.touch('switch-trigger')?.id).toBe('mechanic.switch');
  });

  it('S1 tie: two first touches on one step fire the lower priority number and defer the other', () => {
    const result = decideFirstTimeTouch(createFirstTimeCardsState(), {
      touches: ['wrap-step', 'locked-star-step'],
      nowMs: 0,
      liveCardIds: ALL_TOUCH_CARDS,
      isSeen: () => false
    });
    expect(result.fire?.id).toBe('mechanic.locked-gate');
    expect(result.deferred).toEqual(['mechanic.wrap']);
    expect(result.met).toEqual(['mechanic.locked-gate', 'mechanic.wrap']);
  });

  it('S2: never two cards at once, even for a cap-exempt card', () => {
    const d = driver();
    expect(d.touch('trail-backstep')?.id).toBe('tip.trail');
    expect(d.touch('control-hint-dismissed')).toBeNull();
    d.advance(1000);
    d.dismiss('action');
    expect(d.touch('control-hint-dismissed')?.id).toBe('level-1.goal');
  });

  it('S3: at most two cards per session; the third is deferred, never dropped', () => {
    const d = driver();
    expect(d.touch('shard-pickup')?.id).toBe('mechanic.locked-gate');
    d.advance(1000); d.dismiss('action'); d.nextLevel();
    expect(d.touch('pulse-gate-adjacent')?.id).toBe('mechanic.pulse-gate');
    d.advance(1000); d.dismiss('action'); d.nextLevel();
    expect(d.state.sessionCardsCounted).toBe(FIRST_TIME_SESSION_CARD_CAP);
    expect(d.touch('switch-trigger')).toBeNull();
    expect(d.met.has('mechanic.switch')).toBe(true);
    // A new app session (fresh machine state) over the same seen set fires it at the next touch.
    const result = decideFirstTimeTouch(createFirstTimeCardsState(), {
      touches: ['switch-trigger'], nowMs: 0, liveCardIds: ALL_TOUCH_CARDS, isSeen: (card) => d.seen.has(card.id)
    });
    expect(result.fire?.id).toBe('mechanic.switch');
  });

  it('cap-exempt level-1 goal coach neither needs nor uses a cap slot', () => {
    const d = driver();
    d.touch('shard-pickup'); d.advance(1000); d.dismiss('action');
    d.nextLevel();
    d.touch('pulse-gate-adjacent'); d.advance(1000); d.dismiss('action');
    expect(d.touch('control-hint-dismissed')?.id).toBe('level-1.goal');
    d.advance(1000); d.dismiss('action');
    expect(d.state.sessionCardsCounted).toBe(2);
  });

  it('R3: a move closes the card only once it has been up 800 ms', () => {
    const d = driver();
    d.touch('wrap-step');
    d.advance(FIRST_TIME_MIN_SHOWN_MS - 1);
    expect(d.dismiss('move')).toBe('kept');
    expect(d.state.active?.cardId).toBe('mechanic.wrap');
    d.advance(1);
    expect(d.dismiss('move')).toBe('acked');
    expect(d.seen.has('mechanic.wrap')).toBe(true);
  });

  it('S5: a level end under 800 ms leaves the card unacked and refunds its session slot; it fires again next touch', () => {
    const d = driver();
    d.touch('wrap-step');
    d.advance(FIRST_TIME_MIN_SHOWN_MS - 1);
    expect(d.nextLevel()).toBe('unacked');
    expect(d.seen.has('mechanic.wrap')).toBe(false);
    expect(d.state.sessionCardsCounted).toBe(0);
    expect(d.touch('wrap-step')?.id).toBe('mechanic.wrap');
  });

  it('a level end after 800 ms counts as seen; closing the app never does', () => {
    const d = driver();
    d.touch('wrap-step');
    d.advance(FIRST_TIME_MIN_SHOWN_MS);
    expect(d.nextLevel()).toBe('acked');
    d.touch('switch-trigger');
    d.advance(5000);
    expect(d.dismiss('closed')).toBe('unacked');
    expect(d.seen.has('mechanic.switch')).toBe(false);
  });

  it('nothing fires without a touch: a level start alone never shows a card', () => {
    const d = driver();
    for (let level = 0; level < 5; level += 1) {
      expect(d.nextLevel()).toBeNull();
      expect(d.state.active).toBeNull();
    }
    expect(d.touch()).toBeNull();
  });

  it('the L200 fresh-account script (spec section 5), with no veteran skip', () => {
    const d = driver();
    // 1. L200 starts: nothing.
    expect(d.nextLevel()).toBeNull();
    // 2. Shard pickup: locked-gate card, session card 1.
    expect(d.touch('shard-pickup')?.id).toBe('mechanic.locked-gate');
    d.advance(1500); expect(d.dismiss('move')).toBe('acked');
    // 3. Switch later in L200: deferred (level used its card), but met.
    expect(d.touch('switch-trigger')).toBeNull();
    expect(d.met.has('mechanic.switch')).toBe(true);
    // 4. L201: next to a Pulse Gate: session card 2.
    d.nextLevel();
    expect(d.touch('pulse-gate-adjacent')?.id).toBe('mechanic.pulse-gate');
    d.advance(4500); expect(d.dismiss('timeout')).toBe('acked');
    // 5. Session cap hit: the Switch waits for a later session.
    d.nextLevel();
    expect(d.touch('switch-trigger')).toBeNull();
    const later = driver();
    d.seen.forEach((id) => later.seen.add(id));
    expect(later.touch('switch-trigger')?.id).toBe('mechanic.switch');
    later.advance(1000); later.dismiss('action'); later.nextLevel();
    expect(later.touch('wrap-step')?.id).toBe('mechanic.wrap');
    // 6. A veteran who never steps on a Switch never sees the Switch card.
    const veteran = driver();
    for (let level = 0; level < 50; level += 1) {
      veteran.nextLevel();
      veteran.touch('trail-backstep');
      veteran.advance(1000);
      veteran.dismiss('action');
    }
    expect(veteran.seen.has('mechanic.switch')).toBe(false);
    expect(veteran.met.has('mechanic.switch')).toBe(false);
  });
});

describe('card placement never covers the player or the coach target', () => {
  it('goes to the edge farther from everything that must stay visible', () => {
    expect(resolveFirstTimeCardPlacement({ viewportHeightPx: 844, keepVisibleYPx: [] })).toBe('top');
    expect(resolveFirstTimeCardPlacement({ viewportHeightPx: 844, keepVisibleYPx: [120] })).toBe('bottom');
    expect(resolveFirstTimeCardPlacement({ viewportHeightPx: 844, keepVisibleYPx: [700] })).toBe('top');
    expect(resolveFirstTimeCardPlacement({ viewportHeightPx: 844, keepVisibleYPx: [100, 300] })).toBe('bottom');
    expect(resolveFirstTimeCardPlacement({ viewportHeightPx: 844, keepVisibleYPx: [422] })).toBe('top');
    expect(resolveFirstTimeCardPlacement({ viewportHeightPx: 0, keepVisibleYPx: [10] })).toBe('top');
  });
});
