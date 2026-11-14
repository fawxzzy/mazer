/**
 * MAZER-UI-024: the "online now" presence session for the main menu.
 *
 * Joins the anonymous Supabase Realtime presence channel `mazer-presence-v1` while this tab is
 * visible and reports the current count; reports null whenever the count is unknown. It is the
 * same mechanism as the website's header counter (FawxzzyWeb docs/live-presence.md), so it needs
 * no SQL, Edge Function or Supabase setting: a public channel, joined with the public key Mazer
 * already ships for sign-in.
 *
 * Privacy: a random per-tab key held only in memory, tracked payload `{ v: 1 }` and nothing else
 * (no account, name, route, user agent). No cookie, no storage. The tab leaves the channel when it
 * becomes hidden, on `pagehide`, on stop() and when it closes. The caller never starts a session
 * while signed out, so a signed-out tab makes no extra network request at all.
 *
 * Cadence: the Realtime client sends its own websocket heartbeat every 25 s (library default) and
 * only while connected, i.e. only while this tab is visible. A watchdog re-checks the socket every
 * 30 s and reports null when it is not joined, so a silent drop never leaves a stale number.
 *
 * Everything outside the Realtime library is injectable so the session is unit-tested without a
 * network. The library itself is imported lazily (it ships in the same lazy chunk as sign-in's
 * `@supabase/supabase-js`), never in the boot payload.
 */
import {
  MAZER_PRESENCE_CHANNEL,
  MAZER_PRESENCE_TRACK_PAYLOAD,
  countPresence,
  isBrowserSafePresenceKey,
  isMazerPresenceOrigin,
  resolvePresenceRealtimeUrl
} from './legacyPresenceContract';

/** Join this long after the menu is up, so presence never competes with first paint. */
export const PRESENCE_JOIN_DELAY_MS = 2500;
/** Socket health re-check. The library's own heartbeat is 25 s. */
export const PRESENCE_WATCHDOG_MS = 30_000;

export interface PresenceChannelLike {
  on(type: 'presence', filter: { event: 'sync' }, callback: () => void): PresenceChannelLike;
  subscribe(callback: (status: string) => void): unknown;
  track(payload: Record<string, unknown>): Promise<unknown>;
  untrack(): Promise<unknown>;
  presenceState(): unknown;
  readonly state?: string;
}

export interface PresenceRealtimeClientLike {
  channel(name: string, options: { config: { presence: { key: string } } }): PresenceChannelLike;
  disconnect(): unknown;
  isConnected?(): boolean;
}

export type PresenceRealtimeFactory = (
  url: string,
  options: { params: { apikey: string } }
) => Promise<PresenceRealtimeClientLike>;

export interface PresenceSessionDeps {
  readonly createClient: PresenceRealtimeFactory;
  readonly randomKey: () => string;
  readonly isVisible: () => boolean;
  readonly origin: () => string | null;
  readonly addVisibilityListener: (listener: () => void) => () => void;
  readonly addPageHideListener: (listener: () => void) => () => void;
  readonly setTimer: (callback: () => void, ms: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
  readonly setIntervalTimer: (callback: () => void, ms: number) => unknown;
  readonly clearIntervalTimer: (handle: unknown) => void;
}

export interface PresenceSessionConfig {
  readonly supabaseUrl: string | null | undefined;
  readonly publicKey: string | null | undefined;
  readonly onCount: (count: number | null) => void;
  /** Allow a non-production origin (tests only). */
  readonly skipOriginCheck?: boolean;
  readonly joinDelayMs?: number;
}

export interface PresenceSessionHandle {
  stop(): void;
}

const INERT: PresenceSessionHandle = { stop: () => undefined };

export const createBrowserPresenceDeps = (): PresenceSessionDeps => ({
  addPageHideListener: (listener) => {
    window.addEventListener('pagehide', listener);
    return () => window.removeEventListener('pagehide', listener);
  },
  addVisibilityListener: (listener) => {
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
  clearIntervalTimer: (handle) => window.clearInterval(handle as number),
  clearTimer: (handle) => window.clearTimeout(handle as number),
  createClient: async (url, options) => {
    // Lazy: shares the sign-in chunk, never part of the boot payload.
    const { RealtimeClient } = await import('@supabase/supabase-js');
    return new RealtimeClient(url, options) as unknown as PresenceRealtimeClientLike;
  },
  isVisible: () => document.visibilityState === 'visible',
  origin: () => window.location.origin,
  randomKey: () => crypto.randomUUID(),
  setIntervalTimer: (callback, ms) => window.setInterval(callback, ms),
  setTimer: (callback, ms) => window.setTimeout(callback, ms)
});

export const startMazerPresenceSession = (
  config: PresenceSessionConfig,
  deps: PresenceSessionDeps
): PresenceSessionHandle => {
  const url = resolvePresenceRealtimeUrl(config.supabaseUrl);
  const key = config.publicKey;
  if (
    url === null
    || !isBrowserSafePresenceKey(key)
    || (config.skipOriginCheck !== true && !isMazerPresenceOrigin(deps.origin()))
  ) {
    return INERT;
  }

  let client: PresenceRealtimeClientLike | null = null;
  let channel: PresenceChannelLike | null = null;
  let joining = false;
  let stopped = false;
  let joinTimer: unknown = null;
  let joinGeneration = 0;

  const report = (count: number | null): void => {
    if (!stopped) {
      config.onCount(count);
    }
  };

  const leave = (): void => {
    joinGeneration += 1;
    joining = false;
    const current = channel;
    const connection = client;
    channel = null;
    client = null;
    report(null);
    if (current !== null) {
      void Promise.resolve(current.untrack()).catch(() => undefined);
    }
    if (connection !== null) {
      try {
        void Promise.resolve(connection.disconnect()).catch(() => undefined);
      } catch {
        // Already closed.
      }
    }
  };

  const join = async (): Promise<void> => {
    if (stopped || client !== null || joining || !deps.isVisible()) {
      return;
    }
    joining = true;
    const generation = ++joinGeneration;
    let connection: PresenceRealtimeClientLike;
    try {
      connection = await deps.createClient(url, { params: { apikey: key } });
    } catch {
      joining = false;
      report(null);
      return;
    }
    if (stopped || generation !== joinGeneration || !deps.isVisible()) {
      joining = false;
      try {
        void Promise.resolve(connection.disconnect()).catch(() => undefined);
      } catch {
        // Nothing to close.
      }
      return;
    }
    joining = false;
    // A random per-tab key held only in memory; it is gone when the tab closes.
    const presence = connection.channel(MAZER_PRESENCE_CHANNEL, { config: { presence: { key: deps.randomKey() } } });
    client = connection;
    channel = presence;
    let tracked = false;
    presence.on('presence', { event: 'sync' }, () => {
      // The first sync arrives before this tab has joined and reports 0: never show it.
      const count = countPresence(presence.presenceState());
      report(tracked && count >= 1 ? count : null);
    });
    presence.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void presence.track({ ...MAZER_PRESENCE_TRACK_PAYLOAD }).then(() => {
          tracked = true;
          const count = countPresence(presence.presenceState());
          report(count >= 1 ? count : null);
        }).catch(() => report(null));
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        tracked = false;
        report(null);
      }
    });
  };

  const onVisibility = (): void => {
    if (deps.isVisible()) {
      void join();
    } else {
      leave();
    }
  };
  const removeVisibility = deps.addVisibilityListener(onVisibility);
  const removePageHide = deps.addPageHideListener(leave);
  joinTimer = deps.setTimer(() => {
    joinTimer = null;
    void join();
  }, config.joinDelayMs ?? PRESENCE_JOIN_DELAY_MS);
  const watchdog = deps.setIntervalTimer(() => {
    if (stopped || client === null || joining) {
      return;
    }
    const connected = client.isConnected?.() ?? true;
    const joined = channel?.state === undefined || channel.state === 'joined';
    if (!connected || !joined) {
      report(null);
    }
  }, PRESENCE_WATCHDOG_MS);

  return {
    stop: () => {
      if (stopped) {
        return;
      }
      if (joinTimer !== null) {
        deps.clearTimer(joinTimer);
        joinTimer = null;
      }
      deps.clearIntervalTimer(watchdog);
      removeVisibility();
      removePageHide();
      leave();
      stopped = true;
    }
  };
};
