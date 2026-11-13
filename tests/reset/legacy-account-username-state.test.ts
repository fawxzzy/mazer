import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { LegacyAuthSessionSnapshot } from '../../src/legacy-runtime/legacyAuth';
import {
  applyLegacyUsernameRenameToSnapshot,
  resolveLegacyProfileUsernameRename,
  shouldRereadLegacyUsernameAfterProfileCreate,
  type LegacyUsernameRereadInput
} from '../../src/legacy-runtime/legacyAccountUsernameState';

const input = (patch: Partial<LegacyUsernameRereadInput> = {}): LegacyUsernameRereadInput => ({
  loadedForUserId: 'u1',
  rereadForUserId: null,
  savedValue: '',
  userId: 'u1',
  ...patch
});

/**
 * A mock of the in-session sign-in: the scene's one-per-user username read, the profile
 * bootstrap that creates the row, and (after the fix) the one re-read. It mirrors the
 * scene's use of the rule in legacyAccountUsernameState.ts.
 */
const runInSessionSignIn = async (useReread: boolean): Promise<{ reads: number; savedValue: string }> => {
  let profile: string | null = null; // the row does not exist yet
  let reads = 0;
  const read = async (): Promise<string | null> => { reads += 1; return profile; };
  let loadedForUserId: string | null = null;
  let rereadForUserId: string | null = null;
  let savedValue = '';
  const load = async (): Promise<void> => {
    loadedForUserId = 'u1';
    savedValue = (await read()) ?? '';
  };
  await load(); // the sticky read taken before the profile exists
  profile = 'Mazer-123456'; // the sign-in bootstrap creates the profile
  if (useReread && shouldRereadLegacyUsernameAfterProfileCreate({ loadedForUserId, rereadForUserId, savedValue, userId: 'u1' })) {
    rereadForUserId = 'u1';
    await load();
  }
  return { reads, savedValue };
};

describe('MAZER-ACCT-019: re-read the username after the profile is created', () => {
  test('the stale read leaves the player on the gate without the fix', async () => {
    expect(await runInSessionSignIn(false)).toEqual({ reads: 1, savedValue: '' });
  });

  test('with the fix the username is read again and the name is found', async () => {
    expect(await runInSessionSignIn(true)).toEqual({ reads: 2, savedValue: 'Mazer-123456' });
  });

  test('re-reads once when the first read left no name', () => {
    expect(shouldRereadLegacyUsernameAfterProfileCreate(input())).toBe(true);
    expect(shouldRereadLegacyUsernameAfterProfileCreate(input({ savedValue: '   ' }))).toBe(true);
  });

  test('already-named path: no re-read', () => {
    expect(shouldRereadLegacyUsernameAfterProfileCreate(input({ savedValue: 'bob' }))).toBe(false);
  });

  test('signed-out path: no user, no re-read', () => {
    expect(shouldRereadLegacyUsernameAfterProfileCreate(input({ userId: null }))).toBe(false);
  });

  test('no read started yet for this user: the normal read runs after the profile exists, no extra one', () => {
    expect(shouldRereadLegacyUsernameAfterProfileCreate(input({ loadedForUserId: null }))).toBe(false);
    expect(shouldRereadLegacyUsernameAfterProfileCreate(input({ loadedForUserId: 'other' }))).toBe(false);
  });

  test('never a loop: one re-read per user', () => {
    expect(shouldRereadLegacyUsernameAfterProfileCreate(input({ rereadForUserId: 'u1' }))).toBe(false);
    expect(shouldRereadLegacyUsernameAfterProfileCreate(input({ rereadForUserId: 'u0' }))).toBe(true);
  });
});

describe('MAZER-ACCT-021: the header name follows a saved rename', () => {
  const snapshot = (patch: Partial<LegacyAuthSessionSnapshot> = {}): LegacyAuthSessionSnapshot => ({
    canonicalUsername: 'OldName',
    configured: true,
    displayName: 'Old Display',
    email: 'a@b.c',
    error: null,
    info: null,
    status: 'authenticated',
    userId: 'u1',
    ...patch
  });
  const rename = { userId: 'u1', username: 'NewName' };

  test('a rename shows at once: the snapshot name becomes the new name and nothing else changes', () => {
    const next = applyLegacyUsernameRenameToSnapshot(snapshot(), rename);
    expect(next.canonicalUsername).toBe('NewName');
    expect({ ...next, canonicalUsername: 'OldName' }).toEqual(snapshot());
  });

  test('a later auth refresh (stale metadata name again) is patched with the rename too', () => {
    expect(applyLegacyUsernameRenameToSnapshot(snapshot({ canonicalUsername: 'OldName' }), rename).canonicalUsername).toBe('NewName');
    expect(applyLegacyUsernameRenameToSnapshot(snapshot({ canonicalUsername: null }), rename).canonicalUsername).toBe('NewName');
  });

  test('no rename, another account, signed out or the same name: the snapshot is returned untouched', () => {
    const base = snapshot();
    expect(applyLegacyUsernameRenameToSnapshot(base, null)).toBe(base);
    expect(applyLegacyUsernameRenameToSnapshot(base, { userId: 'u2', username: 'NewName' })).toBe(base);
    expect(applyLegacyUsernameRenameToSnapshot(base, { userId: 'u1', username: '  ' })).toBe(base);
    const guest = snapshot({ status: 'guest', userId: null });
    expect(applyLegacyUsernameRenameToSnapshot(guest, rename)).toBe(guest);
    const same = snapshot({ canonicalUsername: 'NewName' });
    expect(applyLegacyUsernameRenameToSnapshot(same, rename)).toBe(same);
  });
});

describe('MAZER-ACCT-033: the header keeps the saved name after a reload', () => {
  const freshSnapshot = (): LegacyAuthSessionSnapshot => ({
    canonicalUsername: 'mzr-qa-1112',
    configured: true,
    displayName: 'mzr-qa-1112',
    email: 'a@b.c',
    error: null,
    info: null,
    status: 'authenticated',
    userId: 'u1'
  });

  test('the rule: a profile name for the signed-in user is a rename, a missing or blank one is not', () => {
    expect(resolveLegacyProfileUsernameRename('u1', 'mzr-qa-tmp1')).toEqual({ userId: 'u1', username: 'mzr-qa-tmp1' });
    expect(resolveLegacyProfileUsernameRename('u1', '  Padded  ')).toEqual({ userId: 'u1', username: 'Padded' });
    expect(resolveLegacyProfileUsernameRename('u1', null)).toBeNull();
    expect(resolveLegacyProfileUsernameRename('u1', undefined)).toBeNull();
    expect(resolveLegacyProfileUsernameRename('u1', '   ')).toBeNull();
    expect(resolveLegacyProfileUsernameRename(null, 'name')).toBeNull();
  });

  test('rename, reload, read: the rebuilt snapshot carries the old sign-in name until the profile read lands, then the saved name', () => {
    // Session 1: the player renames; the server keeps the new name in the profile only.
    let profileName = 'mzr-qa-1112';
    profileName = 'mzr-qa-tmp1';
    // Reload: the auth layer rebuilds the snapshot from the unchanged sign-in metadata.
    const afterReload = freshSnapshot();
    expect(afterReload.canonicalUsername).toBe('mzr-qa-1112');
    // The scene's one username read finds the profile name and applies it as a rename.
    const patched = applyLegacyUsernameRenameToSnapshot(afterReload, resolveLegacyProfileUsernameRename('u1', profileName));
    expect(patched.canonicalUsername).toBe('mzr-qa-tmp1');
    // A later auth refresh (token refresh) hands back the stale metadata name; the held rename keeps it.
    const rename = resolveLegacyProfileUsernameRename('u1', profileName);
    expect(applyLegacyUsernameRenameToSnapshot(freshSnapshot(), rename).canonicalUsername).toBe('mzr-qa-tmp1');
  });

  test('a player with no profile row yet keeps the sign-in name in the header', () => {
    const base = freshSnapshot();
    expect(applyLegacyUsernameRenameToSnapshot(base, resolveLegacyProfileUsernameRename('u1', null))).toBe(base);
  });
});

describe('scene wiring (source pins)', () => {
  const menu = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n?/g, '\n');

  test('the header label still reads the auth snapshot name; a rename and every auth refresh are patched into it', () => {
    const start = menu.indexOf('private createLegacyHeaderIdentityLabel(): void {');
    expect(start).toBeGreaterThan(0);
    expect(menu.slice(start, start + 700)).toContain("this.authSnapshot.canonicalUsername?.trim() ?? ''");
    expect(menu.split('this.authSnapshot = applyLegacyUsernameRenameToSnapshot(this.authSnapshot, this.accountUsernameRename);').length - 1).toBe(2);
  });

  test('the one-per-user profile read feeds the header (reload case, MAZER-ACCT-033)', () => {
    const start = menu.indexOf('const rename = resolveLegacyProfileUsernameRename(userId, result.username);');
    expect(start).toBeGreaterThan(0);
    const block = menu.slice(start, start + 400);
    expect(block).toContain('this.accountUsernameRename = rename;');
    expect(block).toContain('applyLegacyUsernameRenameToSnapshot(this.authSnapshot, rename)');
  });

  test('a saved rename updates the held name and repaints', () => {
    const start = menu.indexOf('this.accountUsernameSavedValue = outcome.username;');
    expect(start).toBeGreaterThan(0);
    expect(menu.slice(start, start + 1500)).toContain('this.uiDirty = true;');
  });

  test('the sign-in bootstrap triggers the one re-read, and a user change resets it', () => {
    const start = menu.indexOf('private async hydrateLegacyAccountDataAfterAuth(');
    expect(start).toBeGreaterThan(0);
    const block = menu.slice(start, start + 1800);
    expect(block.match(/this\.rereadAccountUsernameAfterProfileCreate\(snapshot\.userId\)/g)?.length).toBe(2);
    expect(menu).toContain('this.accountUsernameRereadForUserId = null;');
  });
});
