import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runMazerAccountSignedOutAtBoot } from '../../src/boot/accountActionBoot';
import { MAZER_ACCOUNT_HOST_REFERRER_PREFIX } from '../../src/boot/loaderHandoff';
import {
  MAZER_ACCOUNT_ACTION_PARAM,
  MAZER_ACCOUNT_ACTION_REFERRER_PREFIX,
  captureAndScrubMazerAccountAction,
  clearMazerPendingAccountAction,
  holdMazerPendingAccountAction,
  isMazerAccountHostReferrer,
  parseMazerAccountAction,
  peekMazerPendingAccountAction,
  resolveMazerAccountActionStep
} from '../../src/legacy-runtime/legacyAccountActionHandoff';

// MAZER-UI-100: the account page's Sign out / Reset progress hand back into Mazer with one closed-set key.
const HOST = 'https://account.fawxzzy.com/';

const capture = (search: string, options: { ignore?: boolean; referrer?: string | null } = {}) => {
  const replaceState = vi.fn();
  const action = captureAndScrubMazerAccountAction({ hash: '#h', pathname: '/', search }, { replaceState }, options);
  return { action, replaceState };
};

afterEach(() => clearMazerPendingAccountAction());

describe('accountAction parse and scrub', () => {
  it('accepts exactly one value from the closed set', () => {
    expect(MAZER_ACCOUNT_ACTION_PARAM).toBe('accountAction');
    expect(parseMazerAccountAction('?accountAction=signed-out')).toBe('signed-out');
    expect(parseMazerAccountAction('?accountAction=reset-progress')).toBe('reset-progress');
    for (const search of ['', '?accountAction=', '?accountAction=delete', '?accountAction=signed-out&accountAction=signed-out']) {
      expect(parseMazerAccountAction(search)).toBeNull();
    }
  });

  it('uses the same account-host referrer prefix as the loader hand-off', () => {
    expect(MAZER_ACCOUNT_ACTION_REFERRER_PREFIX).toBe(MAZER_ACCOUNT_HOST_REFERRER_PREFIX);
    expect(isMazerAccountHostReferrer(HOST)).toBe(true);
    expect(isMazerAccountHostReferrer('https://account.fawxzzy.com/account?app=mazer')).toBe(true);
    for (const referrer of ['', null, undefined, 'https://account.fawxzzy.com.evil.example/', 'https://evil.example/', 'https://fawxzzy.com/']) {
      expect(isMazerAccountHostReferrer(referrer)).toBe(false);
    }
  });

  it('strips every accountAction key and keeps the rest of the URL', () => {
    const { action, replaceState } = capture('?accountAction=reset-progress&x=1');
    expect(action).toBe('reset-progress');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/?x=1#h');
    expect(capture('?accountAction=nope').replaceState).toHaveBeenCalledWith(null, '', '/#h');
  });

  it('leaves the address bar alone when there is no key', () => {
    const { action, replaceState } = capture('?previewLevel=3');
    expect(action).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('honours signed-out only from the account host (no logout CSRF), still stripping the key', () => {
    expect(capture('?accountAction=signed-out', { referrer: HOST }).action).toBe('signed-out');
    const foreign = capture('?accountAction=signed-out', { referrer: 'https://evil.example/' });
    expect(foreign.action).toBeNull();
    expect(foreign.replaceState).toHaveBeenCalledTimes(1);
    expect(capture('?accountAction=signed-out').action).toBeNull();
  });

  it('opens the reset confirmation without a referrer, since nothing resets before the player confirms', () => {
    expect(capture('?accountAction=reset-progress').action).toBe('reset-progress');
  });

  it('defers to an OAuth callback on the same URL', () => {
    expect(capture('?accountAction=reset-progress&code=c&state=s', { ignore: true, referrer: HOST }).action).toBeNull();
  });
});

describe('pending reset-progress', () => {
  it('only reset-progress waits for the game', () => {
    holdMazerPendingAccountAction('signed-out');
    expect(peekMazerPendingAccountAction()).toBeNull();
    holdMazerPendingAccountAction('reset-progress');
    expect(peekMazerPendingAccountAction()).toBe('reset-progress');
    clearMazerPendingAccountAction();
    expect(peekMazerPendingAccountAction()).toBeNull();
  });

  it('waits for the gate, opens signed in, drops signed out', () => {
    expect(resolveMazerAccountActionStep({ authResolved: true, pending: null, signedIn: true })).toBeNull();
    expect(resolveMazerAccountActionStep({ authResolved: false, pending: 'reset-progress', signedIn: false })).toBe('wait');
    expect(resolveMazerAccountActionStep({ authResolved: true, pending: 'reset-progress', signedIn: true })).toBe('open-reset-confirmation');
    expect(resolveMazerAccountActionStep({ authResolved: true, pending: 'reset-progress', signedIn: false })).toBe('drop');
  });
});

describe('signed-out boot', () => {
  const deps = (hasStoredSession: boolean, signOutLocally: () => Promise<unknown> = async () => undefined) => {
    const recordExplicitSignOut = vi.fn();
    const local = vi.fn(signOutLocally);
    return { deps: { hasStoredSession: () => hasStoredSession, now: () => 42, recordExplicitSignOut, signOutLocally: local }, local, recordExplicitSignOut };
  };

  it('ends the stored Mazer session locally and records the explicit sign-out', async () => {
    const { deps: d, local, recordExplicitSignOut } = deps(true);
    await runMazerAccountSignedOutAtBoot(d);
    expect(local).toHaveBeenCalledTimes(1);
    expect(recordExplicitSignOut).toHaveBeenCalledWith(42);
  });

  it('without a stored session it only records the explicit sign-out (no bounce back to the host sign-in)', async () => {
    const { deps: d, local, recordExplicitSignOut } = deps(false);
    await runMazerAccountSignedOutAtBoot(d);
    expect(local).not.toHaveBeenCalled();
    expect(recordExplicitSignOut).toHaveBeenCalledWith(42);
  });

  it('never throws when the local sign-out fails', async () => {
    const { deps: d } = deps(true, async () => { throw new Error('boom'); });
    await expect(runMazerAccountSignedOutAtBoot(d)).resolves.toBeUndefined();
  });

  it('never calls the host sign-out (the account session is already gone)', () => {
    const source = readFileSync(resolve(__dirname, '../../src/boot/accountActionBoot.ts'), 'utf8');
    expect(source).not.toMatch(/runMazerHostSignOut|legacyHostSignOut/);
    const main = readFileSync(resolve(__dirname, '../../src/boot/main.ts'), 'utf8');
    expect(main.indexOf('runMazerAccountSignedOutAtBootInBrowser()')).toBeLessThan(main.indexOf('await runMazerSignedOutHandoffAtBoot('));
    expect(main).toMatch(/referrer: document\.referrer/);
  });
});
