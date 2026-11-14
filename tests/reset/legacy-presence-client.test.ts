import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  PRESENCE_JOIN_DELAY_MS,
  PRESENCE_WATCHDOG_MS,
  startMazerPresenceSession,
  type PresenceChannelLike,
  type PresenceRealtimeClientLike,
  type PresenceSessionDeps
} from '../../src/legacy-runtime/legacyPresenceClient';
import { MAZER_PRESENCE_CHANNEL } from '../../src/legacy-runtime/legacyPresenceContract';

const URL_OK = 'https://abcdefghijklmnopqrst.supabase.co';
const KEY_OK = 'sb_publishable_abcdefghijklmnopqrstuvwxyz';

class FakeChannel implements PresenceChannelLike {
  public state = 'joined';
  public presence: Record<string, unknown[]> = {};
  public tracked: unknown[] = [];
  public untracked = 0;
  private syncListener: (() => void) | null = null;
  public statusListener: ((status: string) => void) | null = null;
  public constructor(public readonly name: string, public readonly options: unknown) {}
  public on(_type: 'presence', _filter: { event: 'sync' }, callback: () => void): PresenceChannelLike {
    this.syncListener = callback;
    return this;
  }
  public subscribe(callback: (status: string) => void): unknown {
    this.statusListener = callback;
    return this;
  }
  public async track(payload: Record<string, unknown>): Promise<unknown> {
    this.tracked.push(payload);
    return 'ok';
  }
  public async untrack(): Promise<unknown> {
    this.untracked += 1;
    return 'ok';
  }
  public presenceState(): unknown {
    return this.presence;
  }
  public sync(): void {
    this.syncListener?.();
  }
}

class FakeClient implements PresenceRealtimeClientLike {
  public channels: FakeChannel[] = [];
  public disconnected = 0;
  public connected = true;
  public constructor(public readonly url: string, public readonly options: unknown) {}
  public channel(name: string, options: { config: { presence: { key: string } } }): PresenceChannelLike {
    const channel = new FakeChannel(name, options);
    this.channels.push(channel);
    return channel;
  }
  public disconnect(): unknown {
    this.disconnected += 1;
    return undefined;
  }
  public isConnected(): boolean {
    return this.connected;
  }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
};

const setup = (options: { visible?: boolean; origin?: string | null } = {}) => {
  const clients: FakeClient[] = [];
  const timers: Array<{ id: number; ms: number; callback: () => void; interval: boolean; cleared: boolean }> = [];
  const visibilityListeners = new Set<() => void>();
  const pageHideListeners = new Set<() => void>();
  let visible = options.visible ?? true;
  let keyCounter = 0;
  let createCalls = 0;
  const deps: PresenceSessionDeps = {
    addPageHideListener: (listener) => { pageHideListeners.add(listener); return () => pageHideListeners.delete(listener); },
    addVisibilityListener: (listener) => { visibilityListeners.add(listener); return () => visibilityListeners.delete(listener); },
    clearIntervalTimer: (handle) => { (handle as { cleared: boolean }).cleared = true; },
    clearTimer: (handle) => { (handle as { cleared: boolean }).cleared = true; },
    createClient: async (url, clientOptions) => {
      createCalls += 1;
      const client = new FakeClient(url, clientOptions);
      clients.push(client);
      return client;
    },
    isVisible: () => visible,
    origin: () => (options.origin === undefined ? 'https://mazer.fawxzzy.com' : options.origin),
    randomKey: () => { keyCounter += 1; return `tab-key-${keyCounter}`; },
    setIntervalTimer: (callback, ms) => { const t = { callback, cleared: false, id: timers.length, interval: true, ms }; timers.push(t); return t; },
    setTimer: (callback, ms) => { const t = { callback, cleared: false, id: timers.length, interval: false, ms }; timers.push(t); return t; }
  };
  const counts: Array<number | null> = [];
  return {
    clients,
    counts,
    deps,
    firePageHide: () => pageHideListeners.forEach((l) => l()),
    fireTimer: (predicate: (t: (typeof timers)[number]) => boolean) => timers.filter((t) => !t.cleared && predicate(t)).forEach((t) => { if (!t.interval) { t.cleared = true; } t.callback(); }),
    createCalls: () => createCalls,
    listeners: () => ({ pageHide: pageHideListeners.size, visibility: visibilityListeners.size }),
    setVisible: (next: boolean) => { visible = next; visibilityListeners.forEach((l) => l()); },
    start: (overrides: Partial<Parameters<typeof startMazerPresenceSession>[0]> = {}) => startMazerPresenceSession(
      { onCount: (count) => counts.push(count), publicKey: KEY_OK, supabaseUrl: URL_OK, ...overrides },
      deps
    ),
    timers
  };
};

describe('MAZER-UI-024 presence session', () => {
  test('inert (no client, no listeners, no timers) off the production origin, or without a valid URL or key', () => {
    for (const config of [
      { env: { origin: 'http://localhost:5173' }, overrides: {} },
      { env: { origin: null }, overrides: {} },
      { env: {}, overrides: { supabaseUrl: undefined } },
      { env: {}, overrides: { supabaseUrl: 'https://evil.example.com' } },
      { env: {}, overrides: { publicKey: undefined } },
      { env: {}, overrides: { publicKey: 'sb_secret_abcdefghijklmnopqrstuvwxyz' } }
    ]) {
      const h = setup(config.env);
      h.start(config.overrides).stop();
      expect(h.listeners()).toEqual({ pageHide: 0, visibility: 0 });
      expect(h.timers).toHaveLength(0);
      expect(h.createCalls()).toBe(0);
    }
  });

  test('joins only after the join delay, on the mazer channel, with a random in-memory key and payload { v: 1 } only', async () => {
    const h = setup();
    h.start();
    expect(h.createCalls()).toBe(0);
    expect(h.timers.find((t) => !t.interval)?.ms).toBe(PRESENCE_JOIN_DELAY_MS);
    h.fireTimer((t) => !t.interval);
    await flush();
    const client = h.clients[0]!;
    expect(client.url).toBe('wss://abcdefghijklmnopqrst.supabase.co/realtime/v1');
    expect(client.options).toEqual({ params: { apikey: KEY_OK } });
    const channel = client.channels[0]!;
    expect(channel.name).toBe(MAZER_PRESENCE_CHANNEL);
    expect(channel.options).toEqual({ config: { presence: { key: 'tab-key-1' } } });
    channel.statusListener?.('SUBSCRIBED');
    await flush();
    expect(channel.tracked).toEqual([{ v: 1 }]);
  });

  test('the first sync (before this tab has joined, count 0) is never shown; the count is recomputed on each sync', async () => {
    const h = setup();
    h.start({ joinDelayMs: 0 });
    h.fireTimer((t) => !t.interval);
    await flush();
    const channel = h.clients[0]!.channels[0]!;
    channel.sync();
    expect(h.counts).toEqual([null]);
    channel.statusListener?.('SUBSCRIBED');
    await flush();
    channel.presence = { 'tab-key-1': [{ v: 1 }], other: [{ v: 1 }] };
    channel.sync();
    expect(h.counts[h.counts.length - 1]).toBe(2);
    channel.presence = { 'tab-key-1': [{ v: 1 }], a: [{ v: 1 }], b: [{ v: 1 }] };
    channel.sync();
    expect(h.counts[h.counts.length - 1]).toBe(3);
    channel.presence = { 'tab-key-1': [{ v: 1 }] };
    channel.sync();
    expect(h.counts[h.counts.length - 1]).toBe(1);
  });

  test('a channel error, timeout or close reports unknown (null), never a stale number', async () => {
    for (const status of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) {
      const h = setup();
      h.start();
      h.fireTimer((t) => !t.interval);
      await flush();
      const channel = h.clients[0]!.channels[0]!;
      channel.statusListener?.('SUBSCRIBED');
      await flush();
      channel.presence = { 'tab-key-1': [{ v: 1 }], x: [{ v: 1 }] };
      channel.sync();
      expect(h.counts[h.counts.length - 1]).toBe(2);
      channel.statusListener?.(status);
      expect(h.counts[h.counts.length - 1], status).toBeNull();
    }
  });

  test('visible tabs only: hiding the tab leaves (untrack + disconnect) and reports null; showing it joins again', async () => {
    const h = setup();
    h.start({ joinDelayMs: 0 });
    h.fireTimer((t) => !t.interval);
    await flush();
    const first = h.clients[0]!;
    first.channels[0]!.statusListener?.('SUBSCRIBED');
    await flush();
    h.setVisible(false);
    expect(first.channels[0]!.untracked).toBe(1);
    expect(first.disconnected).toBe(1);
    expect(h.counts[h.counts.length - 1]).toBeNull();
    h.setVisible(true);
    await flush();
    expect(h.clients).toHaveLength(2);
    expect(h.clients[1]!.channels[0]!.options).toEqual({ config: { presence: { key: 'tab-key-2' } } });
  });

  test('never joins while hidden at start, and a join that was in flight when the tab hid is torn down', async () => {
    const hidden = setup({ visible: false });
    hidden.start({ joinDelayMs: 0 });
    hidden.fireTimer((t) => !t.interval);
    await flush();
    expect(hidden.createCalls()).toBe(0);

    const h = setup();
    h.start();
    h.fireTimer((t) => !t.interval);
    h.setVisible(false);
    await flush();
    expect(h.clients[0]!.channels).toHaveLength(0);
    expect(h.clients[0]!.disconnected).toBe(1);
  });

  test('pagehide leaves; stop() leaves, removes listeners and timers, and later events do nothing', async () => {
    const h = setup();
    const handle = h.start({ joinDelayMs: 0 });
    h.fireTimer((t) => !t.interval);
    await flush();
    const client = h.clients[0]!;
    client.channels[0]!.statusListener?.('SUBSCRIBED');
    await flush();
    h.firePageHide();
    expect(client.disconnected).toBe(1);
    handle.stop();
    expect(h.listeners()).toEqual({ pageHide: 0, visibility: 0 });
    expect(h.timers.every((t) => t.cleared)).toBe(true);
    const before = h.counts.length;
    h.setVisible(true);
    await flush();
    expect(h.clients).toHaveLength(1);
    expect(h.counts).toHaveLength(before);
  });

  test('watchdog: a socket that is no longer connected reports null instead of a stale count', async () => {
    const h = setup();
    h.start({ joinDelayMs: 0 });
    h.fireTimer((t) => !t.interval);
    await flush();
    const client = h.clients[0]!;
    const channel = client.channels[0]!;
    channel.statusListener?.('SUBSCRIBED');
    await flush();
    channel.presence = { 'tab-key-1': [{ v: 1 }] };
    channel.sync();
    expect(h.counts[h.counts.length - 1]).toBe(1);
    expect(h.timers.find((t) => t.interval)?.ms).toBe(PRESENCE_WATCHDOG_MS);
    h.fireTimer((t) => t.interval);
    expect(h.counts[h.counts.length - 1]).toBe(1);
    client.connected = false;
    h.fireTimer((t) => t.interval);
    expect(h.counts[h.counts.length - 1]).toBeNull();
  });

  test('a library that fails to load reports unknown and never throws into the scene', async () => {
    const h = setup();
    h.deps.createClient = async () => { throw new Error('chunk failed'); };
    h.start({ joinDelayMs: 0 });
    h.fireTimer((t) => !t.interval);
    await flush();
    expect(h.counts[h.counts.length - 1]).toBeNull();
  });

  test('privacy by construction: the client source touches no storage, cookie, account, username or route', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyPresenceClient.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'canonicalUsername', 'username', 'email', 'userId', 'location.href', 'location.pathname', 'navigator.userAgent']) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });
});
