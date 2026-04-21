import { describe, expect, test, vi } from 'vitest';
import { resolveIntentSemanticTag } from '../../src/mazer-core/intent/IntentFeed';
import {
  clampIntentFeedSummary,
  formatIntentHudSummary,
  resolveIntentFeedLayout,
  resolveIntentFeedPanelMetrics,
  resolveIntentFeedRoleLabel,
  resolveIntentFeedVisibleEntries,
  resolveNextRiskLabel,
  shouldRenderIntentFeedStatusLine
} from '../../src/render/intentFeedRenderer';

vi.mock('phaser', () => ({
  default: {
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
      Linear: (left: number, right: number, t: number) => left + ((right - left) * t)
    }
  }
}));

const overlaps = (
  left: { left: number; top: number; width: number; height: number },
  right: { left: number; top: number; width: number; height: number }
): boolean => (
  left.left < right.left + right.width
  && left.left + left.width > right.left
  && left.top < right.top + right.height
  && left.top + left.height > right.top
);

describe('intent feed renderer', () => {
  test('only reserves a status row when the feed has no visible thoughts', () => {
    const withStatus = resolveIntentFeedLayout({ width: 1280, height: 720 }, 4, {}, true);
    const withoutStatus = resolveIntentFeedLayout({ width: 1280, height: 720 }, 4, {}, false);

    expect(withStatus.rect.height).toBeGreaterThan(withoutStatus.rect.height);
    expect(withStatus.mode).toBe('bottom');
    expect(withoutStatus.mode).toBe('bottom');
  });

  test('defaults to a bottom-center dock and keeps room for three thought lines on standard phone heights', () => {
    const layout = resolveIntentFeedLayout(
      { width: 390, height: 844 },
      4,
      {
        board: { x: 195, y: 328, width: 278, height: 278 },
        install: { x: 195, y: 820, width: 168, height: 24 }
      }
    );

    expect(layout.dock).toBe('bottom-center');
    expect(layout.mode).toBe('bottom');
    expect(layout.maxVisibleEvents).toBe(3);
    expect(layout.rect.left + layout.rect.width).toBeLessThanOrEqual(390);
    expect(layout.rect.top + layout.rect.height).toBeLessThanOrEqual(844);
    expect(layout.rect.top).toBeGreaterThanOrEqual(328 + (278 / 2) + 10);
  });

  test('does not grow the feed panel for removed helper rows', () => {
    const withOnboarding = resolveIntentFeedPanelMetrics({ width: 390, height: 844 }, true, true);
    const withoutOnboarding = resolveIntentFeedPanelMetrics({ width: 390, height: 844 }, true, false);

    expect(withOnboarding.mode).toBe('bottom');
    expect(withOnboarding.height).toBe(withoutOnboarding.height);
    expect(withOnboarding.maxVisibleEvents).toBe(withoutOnboarding.maxVisibleEvents);
  });

  test('keeps landscape desktops in a bottom-docked panel with the full five-line stack', () => {
    const layout = resolveIntentFeedLayout(
      { width: 1440, height: 900 },
      4,
      {
        board: { x: 620, y: 430, width: 560, height: 560 },
        title: { x: 120, y: 52, width: 220, height: 56 },
        install: { x: 1320, y: 860, width: 160, height: 36 }
      }
    );

    expect(layout.mode).toBe('bottom');
    expect(layout.dock).toBe('bottom-center');
    expect(layout.rect.width).toBeGreaterThanOrEqual(700);
    expect(layout.rect.top).toBeGreaterThan(600);
    expect(layout.maxVisibleEvents).toBe(5);
  });

  test('keeps short phone landscape layouts in the bottom panel instead of forcing a rail', () => {
    const layout = resolveIntentFeedLayout(
      { width: 844, height: 390 },
      4,
      {
        board: { x: 422, y: 156, width: 280, height: 280 },
        install: { x: 422, y: 366, width: 168, height: 24 }
      }
    );

    expect(layout.mode).toBe('bottom');
    expect(layout.dock.startsWith('bottom-')).toBe(true);
    expect(layout.rect.top + layout.rect.height).toBeLessThanOrEqual(390);
  });

  test('keeps taller mobile viewports on the full three-line rolling feed', () => {
    const layout = resolveIntentFeedLayout(
      { width: 430, height: 932 },
      4,
      {
        board: { x: 215, y: 350, width: 298, height: 298 },
        install: { x: 215, y: 906, width: 168, height: 24 }
      }
    );

    expect(layout.dock).toBe('bottom-center');
    expect(layout.maxVisibleEvents).toBe(3);
    expect(layout.rect.top + layout.rect.height).toBeLessThanOrEqual(932);
  });

  test('keeps the spectator feed bottom-docked when install chrome moves into the top band', () => {
    const layout = resolveIntentFeedLayout(
      { width: 390, height: 844 },
      4,
      {
        board: { x: 195, y: 328, width: 278, height: 278 },
        title: { x: 128, y: 54, width: 180, height: 48 },
        install: { x: 318, y: 54, width: 148, height: 30 }
      }
    );

    expect(layout.dock).toBe('bottom-center');
    expect(layout.rect.top).toBeGreaterThanOrEqual(720);
    expect(layout.rect.top + layout.rect.height).toBeLessThanOrEqual(844);
  });

  test('keeps the next-risk strip compact and mechanic-first', () => {
    const nextRisk = resolveNextRiskLabel({
      step: 4,
      status: {
        speaker: 'Runner',
        category: 'observe',
        kind: 'frontier-chosen',
        importance: 'low',
        summary: 'Scanning West branch from Junction A.',
        confidence: 0.62,
        step: 4
      },
      events: [
        {
          id: 'trap-1',
          speaker: 'TrapNet',
          category: 'danger',
          kind: 'trap-inferred',
          importance: 'high',
          summary: 'Hazard timing near Junction A.',
          confidence: 0.82,
          step: 4,
          ttlSteps: 7,
          ageSteps: 0,
          slot: 0,
          opacity: 1
        },
        {
          id: 'gate-1',
          speaker: 'Puzzle',
          category: 'observe',
          kind: 'gate-aligned',
          importance: 'medium',
          summary: 'Waiting on gate at Junction A.',
          confidence: 0.79,
          step: 4,
          ttlSteps: 4,
          ageSteps: 0,
          slot: 1,
          opacity: 0.7
        }
      ],
      entries: [],
      pings: [],
      metrics: {
        emittedCount: 2,
        highImportanceEventCount: 1,
        speakerCount: 2,
        totalSteps: 5,
        intentEmissionRate: 0.4,
        worldPingCount: 0,
        worldPingEmissionRate: 0,
        maxConsecutiveEmissionStreak: 1,
        maxVisibleWorldPings: 0,
        debouncedEventCount: 0,
        debouncedWorldPingCount: 0,
        statusRepeatCount: 0,
        verbFirstPass: true,
        statusPresencePass: true,
        importanceTtlPass: true,
        slotOpacityPass: true,
        feedReadabilityPass: true,
        intentDebouncePass: true,
        worldPingSpamPass: true,
        highImportanceStickyPass: true,
        intentStackOverlapPass: true
      }
    } as never);

    expect(nextRisk).toBe('Next risk: hazard');
  });

  test('treats the thought box as a newest-first feed and only falls back to a status row when no thoughts are visible', () => {
    const state = {
      step: 6,
      status: {
        speaker: 'Runner',
        category: 'goal',
        kind: 'route-commitment-changed',
        importance: 'medium',
        summary: 'Committing the safer route.',
        confidence: 0.8,
        step: 6
      },
      events: [
        {
          id: 'latest',
          speaker: 'Runner',
          category: 'goal',
          kind: 'route-commitment-changed',
          importance: 'medium',
          summary: 'This way is cleaner.',
          confidence: 0.82,
          step: 6,
          ttlSteps: 4,
          ageSteps: 0,
          slot: 0,
          opacity: 1
        },
        {
          id: 'older',
          speaker: 'Runner',
          category: 'replan',
          kind: 'replan-triggered',
          importance: 'medium',
          summary: 'Back up and try the other side.',
          confidence: 0.74,
          step: 5,
          ttlSteps: 4,
          ageSteps: 1,
          slot: 1,
          opacity: 0.78
        },
        {
          id: 'oldest',
          speaker: 'Runner',
          category: 'observe',
          kind: 'frontier-chosen',
          importance: 'low',
          summary: 'Left still looks better.',
          confidence: 0.7,
          step: 4,
          ttlSteps: 4,
          ageSteps: 2,
          slot: 2,
          opacity: 0.58
        }
      ],
      entries: [],
      pings: [],
      metrics: {
        emittedCount: 3,
        highImportanceEventCount: 0,
        speakerCount: 1,
        totalSteps: 6,
        intentEmissionRate: 0.5,
        worldPingCount: 0,
        worldPingEmissionRate: 0,
        maxConsecutiveEmissionStreak: 1,
        maxVisibleWorldPings: 0,
        debouncedEventCount: 0,
        debouncedWorldPingCount: 0,
        statusRepeatCount: 0,
        verbFirstPass: true,
        statusPresencePass: true,
        importanceTtlPass: true,
        slotOpacityPass: true,
        feedReadabilityPass: true,
        intentDebouncePass: true,
        worldPingSpamPass: true,
        highImportanceStickyPass: true,
        intentStackOverlapPass: true
      }
    } as never;

    const visibleEntries = resolveIntentFeedVisibleEntries(state, 3);
    expect(visibleEntries.map((entry) => entry.id)).toEqual(['latest', 'older', 'oldest']);
    expect(shouldRenderIntentFeedStatusLine(visibleEntries.length, 'Committing the safer route.')).toBe(false);
    expect(shouldRenderIntentFeedStatusLine(0, 'Committing the safer route.')).toBe(true);
  });

  test('shifts off dead-center when the lower board lane would cover the player or objective', () => {
    const playerRect = { left: 196 - 28 - 36, top: 708 - 28 - 36, width: 56 + 72, height: 56 + 72 };
    const objectiveRect = { left: 224 - 28 - 36, top: 684 - 28 - 36, width: 56 + 72, height: 56 + 72 };
    const layout = resolveIntentFeedLayout(
      { width: 430, height: 932 },
      4,
      {
        board: { x: 215, y: 350, width: 298, height: 298 },
        install: { x: 215, y: 906, width: 168, height: 24 },
        player: { x: 196, y: 708, width: 56, height: 56 },
        objective: { x: 224, y: 684, width: 56, height: 56 }
      }
    );

    expect(layout.rect.left + layout.rect.width).toBeLessThanOrEqual(430);
    expect(layout.rect.top + layout.rect.height).toBeLessThanOrEqual(932);
    expect(overlaps(layout.rect, playerRect)).toBe(false);
    expect(overlaps(layout.rect, objectiveRect)).toBe(false);
  });

  test('clamps long summaries into a single readable line', () => {
    expect(
      clampIntentFeedSummary('  scanning   a long branch note that should not stay as a full sentence on the HUD  ', 32)
    ).toBe('scanning a long branch note t...');
    expect(clampIntentFeedSummary('short note', 32)).toBe('short note');
  });

  test('rewrites visible HUD copy into plain route guidance without changing the feed contract', () => {
    expect(formatIntentHudSummary('Replanning at Junction A; try West branch.')).toBe('That path wasted time.');
    expect(formatIntentHudSummary('Recalling the dead end at Dead branch 2:3.')).toBe('Dead end. Back up.');
    expect(formatIntentHudSummary('Seeing the exit from Junction A.')).toBe('I can see the exit.');
    expect(formatIntentHudSummary('Taking the exit from Junction A.')).toBe('Almost there.');
    expect(formatIntentHudSummary('There is a marker here.')).toBe('This spot looks useful.');
  });

  test('maps roles onto the scan hypothesis commit and recall grammar', () => {
    expect(resolveIntentFeedRoleLabel('frontier-chosen')).toBe('SCAN');
    expect(resolveIntentFeedRoleLabel('trap-inferred')).toBe('HYPOTHESIS');
    expect(resolveIntentFeedRoleLabel('route-commitment-changed')).toBe('COMMIT');
    expect(resolveIntentFeedRoleLabel('dead-end-confirmed')).toBe('RECALL');
  });

  test('maps hazard, timing, route, recall, and progress events onto the spectator taxonomy', () => {
    expect(resolveIntentSemanticTag('trap-inferred')).toBe('hazard_seen');
    expect(resolveIntentSemanticTag('replan-triggered')).toBe('route_rejected');
    expect(resolveIntentSemanticTag('route-commitment-changed')).toBe('route_committed');
    expect(resolveIntentSemanticTag('gate-aligned')).toBe('timing_wait');
    expect(resolveIntentSemanticTag('dead-end-confirmed')).toBe('memory_recall');
    expect(resolveIntentSemanticTag('goal-observed')).toBe('goal_progress');
  });
});
