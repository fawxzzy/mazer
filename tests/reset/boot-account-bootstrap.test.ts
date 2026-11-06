import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  MAZER_ACCOUNT_BOOTSTRAP_TIMEOUT_MS,
  runBoundedAccountBootstrap
} from '../../src/boot/bootAccountBootstrap';

interface FakeTimers {
  cleared: unknown[];
  fire(): void;
  pendingMs: number | null;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

const createFakeTimers = (): FakeTimers => {
  let callback: (() => void) | null = null;
  const timers: FakeTimers = {
    cleared: [],
    pendingMs: null,
    fire: () => callback?.(),
    setTimer: (cb, ms) => {
      callback = cb;
      timers.pendingMs = ms;
      return 'timer-1';
    },
    clearTimer: (handle) => {
      timers.cleared.push(handle);
    }
  };
  return timers;
};

describe('bounded account bootstrap', () => {
  test('defaults to a 4000 ms bound exposed as a named constant', () => {
    expect(MAZER_ACCOUNT_BOOTSTRAP_TIMEOUT_MS).toBe(4000);
    const timers = createFakeTimers();
    void runBoundedAccountBootstrap({
      bootstrap: () => new Promise(() => {}),
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer
    });
    expect(timers.pendingMs).toBe(MAZER_ACCOUNT_BOOTSTRAP_TIMEOUT_MS);
  });

  test('resolves completed and clears the timer when the bootstrap finishes in time', async () => {
    const timers = createFakeTimers();
    const outcome = await runBoundedAccountBootstrap({
      bootstrap: async () => 'ok',
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer
    });

    expect(outcome).toBe('completed');
    expect(timers.cleared).toEqual(['timer-1']);
  });

  test('falls back to timed-out when the bootstrap hangs, without any network', async () => {
    const timers = createFakeTimers();
    const pending = runBoundedAccountBootstrap({
      bootstrap: () => new Promise(() => {}),
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer
    });

    timers.fire();
    await expect(pending).resolves.toBe('timed-out');
  });

  test('a bootstrap that settles after the timeout cannot change the outcome or leak a rejection', async () => {
    const timers = createFakeTimers();
    let rejectLate: (error: Error) => void = () => {};
    const failures: unknown[] = [];
    const pending = runBoundedAccountBootstrap({
      bootstrap: () => new Promise((_resolve, reject) => {
        rejectLate = reject;
      }),
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      onFailure: (error) => failures.push(error)
    });

    timers.fire();
    await expect(pending).resolves.toBe('timed-out');
    rejectLate(new Error('late'));
    await Promise.resolve();
    expect(failures).toEqual([]);
  });

  test('a rejecting or throwing bootstrap falls back to failed and reports the error', async () => {
    const failures: unknown[] = [];
    const rejecting = await runBoundedAccountBootstrap({
      bootstrap: async () => {
        throw new Error('network down');
      },
      onFailure: (error) => failures.push(error)
    });
    const throwing = await runBoundedAccountBootstrap({
      bootstrap: () => {
        throw new Error('sync throw');
      },
      onFailure: (error) => failures.push(error)
    });

    expect(rejecting).toBe('failed');
    expect(throwing).toBe('failed');
    expect(failures.map((error) => (error as Error).message)).toEqual(['network down', 'sync throw']);
  });

  test('runs with the real timers too (short bound)', async () => {
    const started = Date.now();
    const outcome = await runBoundedAccountBootstrap({
      bootstrap: () => new Promise(() => {}),
      timeoutMs: 20
    });

    expect(outcome).toBe('timed-out');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test('main.ts runs the bootstrap inside the bound, marks the stages in order, and arms the splash failsafe', () => {
    const mainSource = readFileSync(resolve(process.cwd(), 'src/boot/main.ts'), 'utf8');
    const stageIndex = (needle: string): number => mainSource.indexOf(needle);

    expect(mainSource).not.toContain('await bootstrapLegacyRemoteAccountStateForRoute(');
    expect(mainSource).toContain('await runBoundedAccountBootstrap({');
    expect(stageIndex("markMazerBootStatus('oauth-exchange')")).toBeGreaterThan(-1);
    expect(stageIndex("markMazerBootStatus('oauth-exchange')")).toBeLessThan(stageIndex('await consumeMazerOAuthCallback('));
    expect(stageIndex("markMazerBootStatus('install-gate-checking')")).toBeLessThan(stageIndex("markMazerBootStatus('account-bootstrap')"));
    expect(stageIndex("markMazerBootStatus('account-bootstrap')")).toBeLessThan(stageIndex('await runBoundedAccountBootstrap({'));
    expect(stageIndex('await runBoundedAccountBootstrap({')).toBeLessThan(stageIndex("markMazerBootStatus('game-creating')"));
    expect(stageIndex("markMazerBootStatus('game-creating')")).toBeLessThan(stageIndex('game = new Phaser.Game('));
    expect(mainSource).toContain('MAZER_BOOT_SPLASH_MAX_AFTER_GAME_CREATE_MS');
  });
});
