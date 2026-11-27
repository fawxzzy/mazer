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
    type Entry = { props: InFlowNoticeProps; closed: InFlowNoticeDismissReason | null; hidden: boolean };
    const mounted: Entry[] = [];
    const mountInFlowNotice = (props: InFlowNoticeProps): InFlowNoticeHandle => {
      const entry: Entry = { props, closed: null, hidden: false };
      mounted.push(entry);
      return {
        element: {} as HTMLElement,
        isOpen: () => entry.closed === null,
        setHidden: (hidden: boolean) => { entry.hidden = hidden; },
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

  test('setHidden hides the open notice, and one shown while hidden mounts hidden', async () => {
    const { mounted, loadMount } = fakeMount();
    const host = createLegacyInFlowNoticeHost({ loadMount });
    host.show('a', props('A'));
    await flush();
    host.setHidden(true);
    expect(mounted[0]!.hidden).toBe(true);
    expect(host.isOpen('a')).toBe(true);
    host.show('b', props('B'));
    await flush();
    expect(mounted[1]!.hidden).toBe(true);
    host.setHidden(false);
    expect(mounted[1]!.hidden).toBe(false);
  });

  test('a chunk that fails to load drops the notice', async () => {
    const host = createLegacyInFlowNoticeHost({ loadMount: () => Promise.reject(new Error('offline')) });
    host.show('a', props('A'));
    await flush();
    expect(host.isOpen()).toBe(false);
  });
});

describe('in-flow notice DOM (reusable)', () => {
  /** Just enough of a DOM for mountInFlowNotice (no jsdom in this repo). */
  class FakeElement {
    className = '';
    textContent = '';
    style: Record<string, string> = {};
    dataset: Record<string, string> = {};
    children: FakeElement[] = [];
    parent: FakeElement | null = null;
    private attrs = new Map<string, string>();
    classList = {
      add: (name: string) => { if (!this.className.split(' ').includes(name)) this.className = `${this.className} ${name}`.trim(); },
      remove: (name: string) => { this.className = this.className.split(' ').filter((c) => c !== name).join(' '); },
      contains: (name: string) => this.className.split(' ').includes(name)
    };
    setAttribute(name: string, value: string): void { this.attrs.set(name, value); }
    getAttribute(name: string): string | null { return this.attrs.get(name) ?? null; }
    append(...nodes: FakeElement[]): void { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    remove(): void { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
    querySelector(selector: string): FakeElement | null {
      const name = selector.slice(1);
      for (const child of this.children) {
        if (child.className.split(' ').includes(name)) return child;
        const deeper = child.querySelector(selector);
        if (deeper) return deeper;
      }
      return null;
    }
  }
  const fakeDocument = (withFrames: boolean) => {
    const frames: (() => void)[] = [];
    const body = new FakeElement();
    const view = withFrames ? { requestAnimationFrame: (cb: () => void) => { frames.push(cb); return frames.length; }, setTimeout } : null;
    const doc = { body, defaultView: view, createElement: () => new FakeElement() };
    return { doc: doc as unknown as Document, body, frames };
  };

  test('the live region is in the page empty first, then filled, so a screen reader announces it', async () => {
    const { mountInFlowNotice } = await import('../../src/ui/notice/inFlowNotice');
    const { doc, body, frames } = fakeDocument(true);
    const handle = mountInFlowNotice({ title: 'New', body: 'Hello there', topPx: 40, reducedMotion: true }, doc);
    const banner = handle.element as unknown as FakeElement;
    expect(body.children).toHaveLength(1);
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.getAttribute('aria-live')).toBe('polite');
    expect(banner.querySelector('.mazer-status-banner__message')!.textContent).toBe('');
    expect(banner.querySelector('.mazer-status-banner__marker')!.textContent).toBe('');
    frames.forEach((frame) => frame());
    expect(banner.querySelector('.mazer-status-banner__message')!.textContent).toBe('Hello there');
    expect(banner.querySelector('.mazer-status-banner__marker')!.textContent).toBe('New');
    expect(banner.classList.contains('mazer-inflow-notice--open')).toBe(true);
    handle.close();
  });

  test('without frames it fills at once; setHidden hides it without closing it', async () => {
    const { mountInFlowNotice } = await import('../../src/ui/notice/inFlowNotice');
    const { doc, body } = fakeDocument(false);
    const handle = mountInFlowNotice({ body: 'Hi', topPx: 0, reducedMotion: true }, doc);
    const host = body.children[0]!;
    expect((handle.element as unknown as FakeElement).querySelector('.mazer-status-banner__message')!.textContent).toBe('Hi');
    expect((handle.element as unknown as FakeElement).querySelector('.mazer-status-banner__marker')!.textContent).toBe('Info');
    handle.setHidden(true);
    expect(host.style.visibility).toBe('hidden');
    expect(handle.isOpen()).toBe(true);
    handle.setHidden(false);
    expect(host.style.visibility).toBe('');
    handle.close();
    expect(body.children).toHaveLength(0);
  });
});

describe('Guide and hint say the same thing', () => {
  test('the Guide Shard row is the hint in general form (order, then the locked star)', async () => {
    const { resolveLegacyGuideHazardRow } = await import('../../src/legacy-runtime/legacyGuideContent');
    const guide = resolveLegacyGuideHazardRow('shard').text;
    expect(guide).toBe('Take the shards in order. The star stays locked until you do.');
    expect(resolveShardFirstNotice(3).body).toBe(guide.replace('the shards', 'the 3 shards'));
    const lockSentence = guide.slice(guide.indexOf('The star'));
    expect(resolveShardFirstNotice(1).body.endsWith(lockSentence)).toBe(true);
  });
});
