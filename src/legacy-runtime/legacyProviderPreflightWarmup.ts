/**
 * Sign-in pre-flight warm-up (MAZER-ACCT-037).
 *
 * MAZER-ACCT-036 made Sign in ask the account service whether it is up before
 * leaving the app (legacyProviderPreflight.ts). Measured on 2026-11-12, that
 * costs the first tap 100 to 250 ms and nothing inside the 30 s success cache.
 * This module runs the SAME probe quietly when the Welcome screen is drawn, so
 * the cache is already warm at the first tap.
 *
 * Rules (each pinned by tests/reset/legacy-provider-preflight-warmup.test.ts):
 *  - It never blocks anything: callers do not await it and it never throws.
 *  - It never shows anything. Its result is discarded; only a Sign in tap
 *    produces the failure line, from the tap's own probe.
 *  - It never caches a failure. It reuses runProviderPreflight and its shared
 *    cache, which stores a success only. A failed warm-up leaves the cache
 *    empty, so the tap probes afresh.
 *  - It never turns a slow-but-up service into a blocked Sign in: the tap does
 *    NOT join or trust a warm-up in flight (a warm-up that started earlier would
 *    time out earlier than a probe started at the tap). It only benefits from a
 *    cached success.
 *  - It is throttled: Welcome is rebuilt on every resize, so the warm-up skips
 *    when a cache entry is fresh, when one is already in flight, and when the
 *    previous warm-up started less than one cache window ago (an outage would
 *    otherwise re-probe on every rebuild). The throttle remembers when an
 *    attempt STARTED, not how it ended.
 */
import {
  PROVIDER_PREFLIGHT_SUCCESS_CACHE_MS,
  runProviderPreflight,
  type ProviderPreflightDeps,
  type ProviderPreflightResult
} from './legacyProviderPreflight';

export const PROVIDER_PREFLIGHT_WARMUP_MIN_INTERVAL_MS = PROVIDER_PREFLIGHT_SUCCESS_CACHE_MS;

export interface ProviderPreflightWarmupState {
  inFlight: boolean;
  lastStartedAtMs: number | null;
}

export const createProviderPreflightWarmupState = (): ProviderPreflightWarmupState => ({
  inFlight: false,
  lastStartedAtMs: null
});

export type ProviderPreflightWarmupOutcome =
  | { started: false; reason: 'cache-fresh' | 'in-flight' | 'throttled' }
  | { started: true; result: ProviderPreflightResult | null };

const isCacheFresh = (deps: ProviderPreflightDeps, nowMs: number): boolean => {
  const lastOkAtMs = deps.cache?.lastOkAtMs ?? null;
  return lastOkAtMs !== null
    && nowMs >= lastOkAtMs
    && nowMs - lastOkAtMs < PROVIDER_PREFLIGHT_SUCCESS_CACHE_MS;
};

/**
 * Runs one quiet probe if the throttle allows it. The returned promise resolves
 * (never rejects) when the warm-up finished or was skipped; callers do not wait
 * for it.
 */
export const warmProviderPreflight = async (
  deps: ProviderPreflightDeps,
  state: ProviderPreflightWarmupState
): Promise<ProviderPreflightWarmupOutcome> => {
  let nowMs: number;
  try {
    nowMs = deps.now();
  } catch {
    return { reason: 'throttled', started: false };
  }
  if (state.inFlight) {
    return { reason: 'in-flight', started: false };
  }
  if (isCacheFresh(deps, nowMs)) {
    return { reason: 'cache-fresh', started: false };
  }
  if (
    state.lastStartedAtMs !== null
    && nowMs >= state.lastStartedAtMs
    && nowMs - state.lastStartedAtMs < PROVIDER_PREFLIGHT_WARMUP_MIN_INTERVAL_MS
  ) {
    return { reason: 'throttled', started: false };
  }
  state.inFlight = true;
  state.lastStartedAtMs = nowMs;
  try {
    return { result: await runProviderPreflight(deps), started: true };
  } catch {
    return { result: null, started: true };
  } finally {
    state.inFlight = false;
  }
};
