import { describe, expect, test, vi } from 'vitest';
import { HAZARD_EXPOSURE_KIND_ORDER, HAZARD_INTRO_SCHEDULE } from '../../src/mazer-core/hazards';
import { createLegacyInFlowNoticeHost } from '../../src/legacy-runtime/legacyInFlowNoticeHost';
import {
  isShardIntroCard,
  resolveHazardPreviewSeedRecord,
  resolveShardFirstLevel,
  resolveShardFirstNotice,
  SHARD_COACH_LABEL,
  SHARD_HINT_KEYS,
  SHARD_UNLOCKED_NOTICE,
  seedHazardPreviewStorage
} from '../../src/legacy-runtime/legacyShardHint';
import type { InFlowNoticeDismissReason, InFlowNoticeHandle, InFlowNoticeProps } from '../../src/ui/notice/inFlowNotice';

/*
 * H8 shards UI v1: the first-time hint copy and timing, the Level Preview seed, and the reusable notice host.
 * The shard's first level is read from the intro schedule (one place), never hardcoded in UI code.
 */

describe('shard hint', () => {
  test('the first shard level comes from the intro schedule', () => {
    const scheduled = HAZARD_INTRO_SCHEDULE.find((entry) => entry.unit === 'shard');
    expect(scheduled).toBeDefined();
    expect(resolveShardFirstLevel()).toBe(scheduled!.level);
  });

  test('copy names one shard or N shards; the unlock notice dismisses itself', () => {
    expect(resolveShardFirstNotice(1).body).toMatch(/the shard/);
    expect(resolveShardFirstNotice(3).body).toMatch(/3 shards in order/);
    expect(resolveShardFirstNotice(1).actionLabel).toBeTruthy();
    expect(SHARD_UNLOCKED_NOTICE.autoDismissMs).toBeGreaterThan(0);
    expect(SHARD_UNLOCKED_NOTICE.tone).toBe('success');
    expect(SHARD_COACH_LABEL.length).toBeGreaterThan(0);
    expect(SHARD_HINT_KEYS.first).not.toBe(SHARD_HINT_KEYS.unlocked);
  });

  test('only the shard intro card is swapped for the notice and coach', () => {
    expect(isShardIntroCard({ kind: 'shard' })).toBe(true);
    expect(isShardIntroCard({ kind: 'pulseGate' })).toBe(false);
    expect(isShardIntroCard(null)).toBe(false);
  });

  test('the preview seed reads as a player who reached the level by the schedule', () => {
    const level = resolveShardFirstLevel()!;
    const record = resolveHazardPreviewSeedRecord(level);
    const shardIndex = HAZARD_EXPOSURE_KIND_ORDER.indexOf('shard');
    // Everything before the shard is already introduced; the shard itself is not, so its hint still shows.
    expect(record.introsShown).not.toContain('shard');
    expect(record.introsShown).toEqual(HAZARD_EXPOSURE_KIND_ORDER.slice(0, record.stage));
    expect(record.stage).toBeLessThanOrEqual(shardIndex);
    expect(resolveHazardPreviewSeedRecord(1).introsShown).toEqual([]);
  });

  test('the preview storage only fills an empty record and writes through', () => {
    const values = new Map<string, string>();
    const base = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
    expect(seedHazardPreviewStorage(null, 'k', 60)).toBeNull();
    const seeded = seedHazardPreviewStorage(base, 'k', 60)!;
    expect(JSON.parse(seeded.getItem('k')!)).toEqual(resolveHazardPreviewSeedRecord(60));
    expect(seeded.getItem('other')).toBeNull();
    seeded.setItem('k', '{"v":1}');
    expect(values.get('k')).toBe('{"v":1}');
    expect(seeded.getItem('k')).toBe('{"v":1}');
  });
});

describe('in-flow notice host (reusable)', () => {
  const fakeMount = () => {
    const mounted: { props: InFlowNoticeProps; closed: InFlowNoticeDismissReason | null }[] = [];
    const mountInFlowNotice = (props: InFlowNoticeProps): InFlowNoticeHandle => {
      const entry: { props: InFlowNoticeProps; closed: InFlowNoticeDismissReason | null } = { props, closed: null };
      mounted.push(entry);
      return {
        element: {} as HTMLElement,
        isOpen: () => entry.closed === null,
        close: (reason?: InFlowNoticeDismissReason) => {
          if (entry.closed !== null) return;
          entry.closed = reason ?? 'closed';
          props.onDismiss?.(entry.closed);
        }
      };
    };
    return { mounted, loadMount: async () => ({ mountInFlowNotice }) };
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const props = (title: string): InFlowNoticeProps => ({ title, body: 'b', tone: 'info', topPx: 0, reducedMotion: true });

  test('shows, reports open by key, and closes only the named notice', async () => {
    const { mounted, loadMount } = fakeMount();
    const host = createLegacyInFlowNoticeHost({ loadMount });
    host.show('a', props('A'));
    expect(host.isOpen('a')).toBe(true);
    await flush();
    expect(mounted).toHaveLength(1);
    expect(host.isOpen('a')).toBe(true);
    host.close('b');
    expect(host.isOpen('a')).toBe(true);
    host.close('a');
    expect(host.isOpen()).toBe(false);
    expect(mounted[0]!.closed).toBe('closed');
  });

  test('a new notice replaces the open one', async () => {
    const { mounted, loadMount } = fakeMount();
    const host = createLegacyInFlowNoticeHost({ loadMount });
    host.show('a', props('A'));
    await flush();
    host.show('b', props('B'));
    await flush();
    expect(mounted.map((m) => m.closed)).toEqual(['replaced', null]);
    expect(host.isOpen('b')).toBe(true);
    expect(host.isOpen('a')).toBe(false);
  });

  test('closing before the chunk loads drops the pending show; destroy ends everything', async () => {
    const { mounted, loadMount } = fakeMount();
    const host = createLegacyInFlowNoticeHost({ loadMount });
    host.show('a', props('A'));
    host.close('a');
    await flush();
    expect(mounted).toHaveLength(0);
    host.show('b', props('B'));
    host.destroy();
    await flush();
    expect(mounted).toHaveLength(0);
    host.show('c', props('C'));
    await flush();
    expect(mounted).toHaveLength(0);
  });

  test('the player dismissing a notice forwards to its onDismiss and clears it', async () => {
    const { mounted, loadMount } = fakeMount();
    const host = createLegacyInFlowNoticeHost({ loadMount });
    const onDismiss = vi.fn();
    host.show('a', { ...props('A'), onDismiss });
    await flush();
    mounted[0]!.props.onDismiss?.('action');
    expect(onDismiss).toHaveBeenCalledWith('action');
    expect(host.isOpen('a')).toBe(false);
  });

  test('a chunk that fails to load drops the notice', async () => {
    const host = createLegacyInFlowNoticeHost({ loadMount: () => Promise.reject(new Error('offline')) });
    host.show('a', props('A'));
    await flush();
    expect(host.isOpen()).toBe(false);
  });
});
