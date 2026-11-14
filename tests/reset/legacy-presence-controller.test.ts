import { describe, expect, test } from 'vitest';
import { LegacyPresenceController } from '../../src/legacy-runtime/legacyPresenceController';
import type { PresenceSessionDeps } from '../../src/legacy-runtime/legacyPresenceClient';

const MASTER_URL = 'https://bxtcuhkotumitoqtrcej.supabase.co';
const KEY = 'sb_publishable_abcdefghijklmnopqrstuvwxyz';

const makeDeps = (log: string[]): PresenceSessionDeps => ({
  addPageHideListener: () => { log.push('pagehide+'); return () => { log.push('pagehide-'); }; },
  addVisibilityListener: () => { log.push('visibility+'); return () => { log.push('visibility-'); }; },
  clearIntervalTimer: () => { log.push('interval-'); },
  clearTimer: () => { log.push('timer-'); },
  createClient: async () => { throw new Error('no network in tests'); },
  isVisible: () => true,
  origin: () => 'https://mazer.fawxzzy.com',
  randomKey: () => 'k',
  setIntervalTimer: () => { log.push('interval+'); return 1; },
  setTimer: () => { log.push('timer+'); return 2; }
});

describe('MAZER-UI-024 presence controller', () => {
  test('signed out: no session, no listeners, no timers (no extra network), and the frame is hidden', () => {
    const log: string[] = [];
    let depsCreated = 0;
    const controller = new LegacyPresenceController({
      createDeps: () => { depsCreated += 1; return makeDeps(log); },
      now: () => 0,
      resolveConfig: () => ({ anonKey: KEY, url: MASTER_URL })
    });
    controller.setSignedIn(false);
    expect(controller.isSessionActive()).toBe(false);
    expect(depsCreated).toBe(0);
    expect(log).toEqual([]);
    expect(controller.frame(10, false).visible).toBe(false);
  });

  test('signing in starts one session; signing out stops it and clears the number; repeated calls are idempotent', () => {
    const log: string[] = [];
    const controller = new LegacyPresenceController({
      createDeps: () => makeDeps(log),
      now: () => 0,
      resolveConfig: () => ({ anonKey: KEY, url: MASTER_URL })
    });
    controller.setSignedIn(true);
    controller.setSignedIn(true);
    expect(controller.isSessionActive()).toBe(true);
    expect(log.filter((entry) => entry === 'visibility+')).toHaveLength(1);
    controller.setSignedIn(false);
    expect(controller.isSessionActive()).toBe(false);
    expect(log).toContain('visibility-');
    expect(log).toContain('pagehide-');
    expect(controller.frame(10, false).visible).toBe(false);
  });

  test('fails closed like the sign-in client: no config, or a project Mazer is not admitted to, means no session', () => {
    for (const config of [null, { anonKey: KEY, url: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co' }, { anonKey: KEY, url: 'https://evil.example.com' }]) {
      let depsCreated = 0;
      const controller = new LegacyPresenceController({
        createDeps: () => { depsCreated += 1; return makeDeps([]); },
        now: () => 0,
        resolveConfig: () => config
      });
      controller.setSignedIn(true);
      expect(controller.isSessionActive()).toBe(false);
      expect(depsCreated).toBe(0);
      expect(controller.frame(10, false).visible).toBe(false);
    }
  });

  test('QA count shows without any session or network, and releases back to hidden', () => {
    let depsCreated = 0;
    let now = 0;
    const controller = new LegacyPresenceController({
      createDeps: () => { depsCreated += 1; return makeDeps([]); },
      now: () => now,
      resolveConfig: () => ({ anonKey: KEY, url: MASTER_URL })
    });
    controller.setQaCount(1234);
    now = 1000;
    expect(controller.frame(now, true)).toMatchObject({ value: 1234, visible: true });
    controller.setSignedIn(true);
    expect(controller.isSessionActive()).toBe(false);
    expect(depsCreated).toBe(0);
    controller.setQaCount(undefined);
    controller.setSignedIn(false);
    expect(controller.frame(now, true).visible).toBe(false);
  });

  test('needsRedraw is true once per change and then only while something animates', () => {
    let now = 0;
    const controller = new LegacyPresenceController({ now: () => now });
    controller.setQaCount(7);
    expect(controller.needsRedraw(0, false)).toBe(true);
    now = 5000;
    expect(controller.needsRedraw(5000, false)).toBe(false);
    expect(controller.needsRedraw(5100, false)).toBe(false);
  });
});
