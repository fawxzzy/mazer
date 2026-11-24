import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { LEGACY_RUNTIME_DIAGNOSTICS_AUTH_FIXTURE_USER_ID } from '../../src/legacy-runtime/legacyAuth';
import { sanitizeLegacyBuildId } from '../../src/legacy-runtime/legacyBuildId';
import { formatLegacyProgressionOrdinal } from '../../src/legacy-runtime/legacyProgression';
import {
  createLegacyFeedbackLauncher,
  isLegacyFeedbackAvailable,
  resolveLegacyFeedbackContext
} from '../../src/legacy-runtime/legacyFeedbackLauncher';
import {
  LEGACY_FEEDBACK_RPC,
  buildLegacyFeedbackRpcArgs,
  resolveLegacyFeedbackFixtureResult,
  resolveLegacyFeedbackRpcResult,
  submitLegacyFeedback,
  type LegacyFeedbackRpcResponse
} from '../../src/legacy-runtime/legacyFeedbackSubmit';
import {
  FEEDBACK_STAR_HUE_PERIOD_MS,
  resolveFeedbackStarColour
} from '../../src/ui/feedback/feedbackStarColour';
import { buildFeedbackPayload, createFeedbackDraft } from '../../src/ui/feedback/feedbackState';

// MAZER-FB-001: the in-game feedback popup client. Provider-inert: every RPC here is a stub, never the real database.

const ROOT = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
const MENU_SCENE = read('src/scenes/MenuScene.ts');

const SIGNED_IN = { status: 'authenticated', userId: 'user-1' } as const;
const FIXTURE = { status: 'authenticated', userId: LEGACY_RUNTIME_DIAGNOSTICS_AUTH_FIXTURE_USER_ID } as const;
const payload = buildFeedbackPayload({ ...createFeedbackDraft(), comment: '  nice  ', rating: 4 }, {
  buildId: 'abc1234',
  gameMode: 'play',
  playerLevel: 7,
  source: 'menu'
});

describe('MAZER-FB-001 RPC result mapping (mazer.mazer_submit_feedback_v1)', () => {
  test('saved and rate_limited come straight from the function', () => {
    expect(resolveLegacyFeedbackRpcResult({ data: { status: 'saved' } })).toEqual({ status: 'saved' });
    expect(resolveLegacyFeedbackRpcResult({ data: { retry_after_seconds: 1500, status: 'rate_limited' } }))
      .toEqual({ retryAfterSeconds: 1500, status: 'rate_limited' });
    // A missing or nonsense wait still reads as a rate limit (never an error), with a safe default.
    expect(resolveLegacyFeedbackRpcResult({ data: { status: 'rate_limited' } }))
      .toEqual({ retryAfterSeconds: 60, status: 'rate_limited' });
  });

  test('the three documented errors, offline wording and a lock timeout map to calm outcomes, never rate_limited', () => {
    expect(resolveLegacyFeedbackRpcResult({ error: { code: '28000', message: 'MAZER_FEEDBACK_NOT_SIGNED_IN' } })).toEqual({ status: 'signed_out' });
    expect(resolveLegacyFeedbackRpcResult({ error: { code: '22023', message: 'MAZER_FEEDBACK_BAD_RATING' } })).toEqual({ status: 'failed' });
    expect(resolveLegacyFeedbackRpcResult({ error: { code: '22001', message: 'MAZER_FEEDBACK_COMMENT_TOO_LONG' } })).toEqual({ status: 'failed' });
    expect(resolveLegacyFeedbackRpcResult({ error: { code: '55P03', message: 'canceling statement due to lock timeout' } })).toEqual({ status: 'failed' });
    for (const message of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed']) {
      expect(resolveLegacyFeedbackRpcResult({ error: { message } }), message).toEqual({ status: 'offline' });
    }
    for (const data of [null, undefined, {}, { status: 'weird' }, 'saved', 3]) {
      expect(resolveLegacyFeedbackRpcResult({ data } as LegacyFeedbackRpcResponse), String(data)).toEqual({ status: 'failed' });
    }
  });

  test('the call uses exactly the function parameter names and never sends a user id', () => {
    expect(LEGACY_FEEDBACK_RPC).toBe('mazer_submit_feedback_v1');
    expect(buildLegacyFeedbackRpcArgs(payload)).toEqual({
      p_build_id: 'abc1234',
      p_comment: 'nice',
      p_game_mode: 'play',
      p_player_level: 7,
      p_rating: 4,
      p_source: 'menu'
    });
    expect(Object.keys(buildLegacyFeedbackRpcArgs(payload)).join(',')).not.toMatch(/user/);
  });
});

describe('MAZER-FB-001 submit wrapper', () => {
  test('signed out never reaches the network', async () => {
    const getClient = vi.fn();
    expect(await submitLegacyFeedback(payload, { status: 'guest', userId: null }, { getClient })).toEqual({ status: 'signed_out' });
    expect(getClient).not.toHaveBeenCalled();
  });

  test('a signed-in submit calls the RPC once with the mapped args', async () => {
    const rpc = vi.fn(async () => ({ data: { status: 'saved' }, error: null }));
    const result = await submitLegacyFeedback(payload, SIGNED_IN, { getClient: async () => ({ rpc }), isOnline: () => true });
    expect(result).toEqual({ status: 'saved' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('mazer_submit_feedback_v1', buildLegacyFeedbackRpcArgs(payload));
  });

  test('offline short-circuits, a thrown network error is offline, any other throw and a missing client are generic failures', async () => {
    const rpc = vi.fn();
    expect(await submitLegacyFeedback(payload, SIGNED_IN, { getClient: async () => ({ rpc }), isOnline: () => false })).toEqual({ status: 'offline' });
    expect(rpc).not.toHaveBeenCalled();
    const thrower = (message: string) => ({ rpc: async () => { throw new Error(message); } });
    expect(await submitLegacyFeedback(payload, SIGNED_IN, { getClient: async () => thrower('Failed to fetch'), isOnline: () => true })).toEqual({ status: 'offline' });
    expect(await submitLegacyFeedback(payload, SIGNED_IN, { getClient: async () => thrower('boom'), isOnline: () => true })).toEqual({ status: 'failed' });
    expect(await submitLegacyFeedback(payload, SIGNED_IN, { getClient: async () => null, isOnline: () => true })).toEqual({ status: 'failed' });
  });

  test('the diagnostics fixture identity is provider-inert and only answers with the diagnostics URL flags', async () => {
    const getClient = vi.fn();
    const base = '?runtimeDiagnostics=1&authFixture=authenticated';
    expect(await submitLegacyFeedback(payload, FIXTURE, { getClient, search: base })).toEqual({ status: 'saved' });
    expect(await submitLegacyFeedback(payload, FIXTURE, { getClient, search: `${base}&feedbackFixture=limited` }))
      .toEqual({ retryAfterSeconds: 1500, status: 'rate_limited' });
    expect(await submitLegacyFeedback(payload, FIXTURE, { getClient, search: `${base}&feedbackFixture=failed` })).toEqual({ status: 'failed' });
    expect(await submitLegacyFeedback(payload, FIXTURE, { getClient, search: `${base}&feedbackFixture=offline` })).toEqual({ status: 'offline' });
    expect(getClient).not.toHaveBeenCalled();
    // No flags: the fixture identity cannot reach a fixture answer, and a real account never takes this branch.
    expect(resolveLegacyFeedbackFixtureResult('')).toBeNull();
    expect(resolveLegacyFeedbackFixtureResult('?feedbackFixture=saved')).toBeNull();
    expect(resolveLegacyFeedbackFixtureResult('?runtimeDiagnostics=1&feedbackFixture=saved')).toBeNull();
    expect(await submitLegacyFeedback(payload, FIXTURE, { getClient, search: '' })).toEqual({ status: 'failed' });
  });
});

describe('MAZER-FB-001 build id and context', () => {
  test('the build id is validated with the database pattern and otherwise dropped', () => {
    expect(sanitizeLegacyBuildId('0a1b2c3d4e5f')).toBe('0a1b2c3d4e5f');
    expect(sanitizeLegacyBuildId('v1.2+build_3-x')).toBe('v1.2+build_3-x');
    for (const bad of ['', 'has space', 'x'.repeat(65), 'semi;colon', null, undefined, 12]) {
      expect(sanitizeLegacyBuildId(bad), String(bad)).toBeNull();
    }
  });

  test('vite injects a git sha constant and the client reads it through the validator', () => {
    const vite = read('vite.config.ts');
    expect(vite).toContain('__MAZER_BUILD_ID__');
    expect(vite).toContain('VERCEL_GIT_COMMIT_SHA');
    expect(read('src/vite-env.d.ts')).toContain('declare const __MAZER_BUILD_ID__: string | null;');
    expect(read('src/legacy-runtime/legacyBuildId.ts')).toContain('sanitizeLegacyBuildId(__MAZER_BUILD_ID__)');
  });

  test('level and mode are clamped to what the function accepts (0..1000000, ^[a-z][a-z0-9_]{0,31}$)', () => {
    const ctx = (level: unknown, gameMode: string | null) => resolveLegacyFeedbackContext({ gameMode, level, source: 'pause' });
    expect(ctx(12, 'play')).toMatchObject({ gameMode: 'play', playerLevel: 12, source: 'pause' });
    expect(ctx('34', 'menu')).toMatchObject({ playerLevel: 34 });
    expect(ctx(0, null)).toMatchObject({ gameMode: null, playerLevel: 0 });
    for (const level of [-1, 1_000_001, 2.5, Number.NaN, '12345678901234567890', 'abc', null, undefined]) {
      expect(ctx(level, 'play').playerLevel, String(level)).toBeNull();
    }
    expect(ctx(1, 'Play Mode').gameMode).toBeNull();
    expect(ctx(1, 'x'.repeat(33)).gameMode).toBeNull();
  });

  test('levels from 1000 up are sent (the raw ordinal, never the display string with a thousands separator)', () => {
    const ctx = (level: unknown) => resolveLegacyFeedbackContext({ gameMode: 'play', level, source: 'menu' }).playerLevel;
    expect(ctx('1234')).toBe(1234);
    expect(ctx(1234)).toBe(1234);
    expect(ctx('1000000')).toBe(1_000_000);
    expect(ctx('1000001')).toBeNull();
    // The display form is what broke it: it must never be what the scene hands in.
    expect(formatLegacyProgressionOrdinal('1234')).not.toBe('1234');
    expect(ctx(formatLegacyProgressionOrdinal('1234'))).toBeNull();
    const menu = read('src/scenes/MenuScene.ts');
    const openFeedback = menu.slice(menu.indexOf('private openLegacyFeedback('), menu.indexOf('private buildLegacyPlayMenuOverlay('));
    expect(openFeedback).toContain('const level = this.progressionState.tracks.player.level;');
    expect(openFeedback).not.toContain('formatLegacyProgressionOrdinal(');
  });
});

describe('MAZER-FB-001 launcher (menu row only, signed in only, popup loaded on demand)', () => {
  const makeMount = () => {
    let onClose: () => void = () => undefined;
    let submit: (draft: ReturnType<typeof createFeedbackDraft>) => Promise<unknown> = async () => null;
    const close = vi.fn(() => onClose());
    const mountFeedbackPopup = vi.fn((options: { onClose: () => void; submit: typeof submit; theme?: string }) => {
      onClose = options.onClose;
      submit = options.submit;
      return { close } as never;
    });
    return { close, mountFeedbackPopup, submit: (draft: ReturnType<typeof createFeedbackDraft>) => submit(draft) };
  };
  const flush = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); };

  test('availability is signed-in only', () => {
    expect(isLegacyFeedbackAvailable({ status: 'authenticated' })).toBe(true);
    for (const status of ['guest', 'unavailable', 'loading', 'error'] as const) {
      expect(isLegacyFeedbackAvailable({ status } as never), status).toBe(false);
    }
  });

  test('signed out: open() is refused and nothing loads', async () => {
    const loadMount = vi.fn();
    const launcher = createLegacyFeedbackLauncher({ getAuthSnapshot: () => ({ status: 'guest', userId: null }), loadMount, onClosed: vi.fn() });
    expect(launcher.open({ gameMode: 'menu', level: 1, source: 'menu' })).toBe(false);
    expect(launcher.isOpen()).toBe(false);
    await flush();
    expect(loadMount).not.toHaveBeenCalled();
  });

  test('open() flips isOpen at once, mounts once, submits through the stub, and onClosed fires once on close', async () => {
    const mount = makeMount();
    const onClosed = vi.fn();
    const send = vi.fn(async () => ({ status: 'saved' }) as const);
    const launcher = createLegacyFeedbackLauncher({
      getAuthSnapshot: () => SIGNED_IN,
      isDarkTheme: () => true,
      loadMount: async () => ({ mountFeedbackPopup: mount.mountFeedbackPopup as never }),
      onClosed,
      submit: send
    });
    expect(launcher.open({ gameMode: 'play', level: '9', source: 'pause' })).toBe(true);
    expect(launcher.isOpen()).toBe(true);
    expect(launcher.open({ gameMode: 'play', level: '9', source: 'pause' })).toBe(false);
    await flush();
    expect(mount.mountFeedbackPopup).toHaveBeenCalledTimes(1);
    expect(mount.mountFeedbackPopup.mock.calls[0][0].theme).toBe('dark');
    await mount.submit({ ...createFeedbackDraft(), comment: ' ok ', rating: 5 });
    expect(send).toHaveBeenCalledTimes(1);
    const [sentPayload, sentAuth] = send.mock.calls[0] as unknown as [ReturnType<typeof buildFeedbackPayload>, unknown];
    expect(sentPayload).toMatchObject({ p_comment: 'ok', p_game_mode: 'play', p_player_level: 9, p_rating: 5, p_source: 'pause' });
    expect(sentAuth).toEqual(SIGNED_IN);
    mount.close();
    expect(launcher.isOpen()).toBe(false);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  test('a failed popup load closes the launcher quietly; destroy closes an open popup without calling onClosed', async () => {
    const onClosed = vi.fn();
    const broken = createLegacyFeedbackLauncher({ getAuthSnapshot: () => SIGNED_IN, loadMount: async () => { throw new Error('chunk'); }, onClosed });
    expect(broken.open({ gameMode: 'menu', level: 1, source: 'menu' })).toBe(true);
    await flush();
    expect(broken.isOpen()).toBe(false);
    expect(onClosed).toHaveBeenCalledTimes(1);

    const mount = makeMount();
    const onClosed2 = vi.fn();
    const live = createLegacyFeedbackLauncher({
      getAuthSnapshot: () => SIGNED_IN,
      loadMount: async () => ({ mountFeedbackPopup: mount.mountFeedbackPopup as never }),
      onClosed: onClosed2
    });
    live.open({ gameMode: 'menu', level: 1, source: 'menu' });
    await flush();
    live.destroy();
    expect(mount.close).toHaveBeenCalledTimes(1);
    expect(live.isOpen()).toBe(false);
    expect(onClosed2).not.toHaveBeenCalled();
    expect(live.open({ gameMode: 'menu', level: 1, source: 'menu' })).toBe(false);

    // A restarted scene keeps its fields and calls activate() from create(): the row works again.
    live.activate();
    expect(live.open({ gameMode: 'menu', level: 1, source: 'menu' })).toBe(true);
    await flush();
    expect(mount.mountFeedbackPopup).toHaveBeenCalledTimes(2);
    mount.close();
    expect(live.isOpen()).toBe(false);
    expect(onClosed2).toHaveBeenCalledTimes(1);
  });
});

describe('MAZER-FB-001 rainbow stars: real pointed shapes, never a glow', () => {
  test('the star colour is a flat #rrggbb that shifts slowly with time and spreads across the row', () => {
    for (const index of [0, 1, 4]) {
      for (const t of [0, 5000, 12000, 23999]) {
        expect(resolveFeedbackStarColour(index, t), `${index}@${t}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
    expect(resolveFeedbackStarColour(0, 0)).not.toBe(resolveFeedbackStarColour(2, 0));
    expect(resolveFeedbackStarColour(0, 0)).not.toBe(resolveFeedbackStarColour(0, FEEDBACK_STAR_HUE_PERIOD_MS / 3));
    // One full lap returns to the same colour.
    expect(resolveFeedbackStarColour(1, 100)).toBe(resolveFeedbackStarColour(1, 100 + FEEDBACK_STAR_HUE_PERIOD_MS));
  });

  test('no glow anywhere in the popup sources: no shadow, blur, filter, drop-shadow or glow wording; the star path is a real 5-point star', () => {
    const files = ['feedbackPopup.ts', 'feedbackPopup.css', 'feedbackStarColour.ts', 'feedbackMount.ts'].map((name) => read(`src/ui/feedback/${name}`));
    for (const source of files) {
      expect(source).not.toMatch(/box-shadow|text-shadow|drop-shadow|filter\s*:|blur\(|boxShadow|textShadow/i);
    }
    const css = files[1];
    expect(css).not.toMatch(/glow/i);
    const popup = files[0];
    // 10 vertices (5 outer, 5 inner) = a pointed star, not a circle or rounded blob.
    const path = /STAR_PATH = '([^']+)'/.exec(popup)?.[1] ?? '';
    expect((path.match(/[lL]|[Mm]/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(path).not.toMatch(/[ac]/i);
  });

  test('picked stars are painted from the one rainbow material and the colour timer is cleaned up', () => {
    const popup = read('src/ui/feedback/feedbackPopup.ts');
    expect(popup).toContain('resolveFeedbackStarColour(index, now())');
    expect(popup).toContain('window.setInterval');
    expect(popup).toContain('window.clearInterval(colourTimer)');
    expect(read('src/ui/feedback/feedbackStarColour.ts')).toContain("from '../../render/rainbowUiPalette'");
  });
});

describe('MAZER-FB-001 safety of the popup DOM', () => {
  test('the player note is only ever written as text (never innerHTML / insertAdjacentHTML / document.write)', () => {
    for (const name of ['feedbackPopup.ts', 'feedbackMount.ts', 'feedbackStarColour.ts']) {
      expect(read(`src/ui/feedback/${name}`), name).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    }
    for (const name of ['legacyFeedbackLauncher.ts', 'legacyFeedbackSubmit.ts', 'legacyBuildId.ts']) {
      expect(read(`src/legacy-runtime/${name}`), name).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
    }
    expect(read('src/ui/feedback/feedbackPopup.ts')).toContain('textarea.value');
  });

  // Keys typed into the popup never reach the game behind it: proven with real key events in
  // tests/reset/legacy-feedback-key-isolation.test.ts (bubble-phase game handlers and the capture-phase control hint).

  test('a tap on the backdrop never throws away a typed note (it only closes a SENT popup)', () => {
    expect(read('src/ui/feedback/feedbackMount.ts')).toContain("event.target === scrim && popup.getDraft().phase === 'sent'");
  });

  test('errors are one in-flow notice, never red text: the popup only ever builds info / success banners', () => {
    const popup = read('src/ui/feedback/feedbackPopup.ts');
    expect(popup).toContain("tone: notice.tone === 'success' ? 'success' : 'info'");
    expect(popup).not.toMatch(/tone: ?'(error|danger|warning)'/);
    expect(read('src/ui/feedback/feedbackPopup.css')).not.toMatch(/color:\s*(red|#f00|#ff0000)|semantic-error|semantic-danger/i);
  });

  test('the card fits a 320px phone: the star row may shrink instead of pushing the card contents past its edge', () => {
    const css = read('src/ui/feedback/feedbackPopup.css');
    expect(css).toMatch(/\.mazer-feedback__rate \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.mazer-feedback__star \{[^}]*flex: 0 1 52px;[^}]*min-width: 0;/);
  });
});

describe('MAZER-FB-001 scene wiring stays minimal and hazard-free', () => {
  test('both Menu screens route the Feedback row to openLegacyFeedback with the right source', () => {
    expect(MENU_SCENE).toMatch(/case 'feedback':\n\s+this\.openLegacyFeedback\('menu'\);/);
    expect(MENU_SCENE).toMatch(/case 'feedback':\n\s+this\.openLegacyFeedback\('pause'\);/);
  });

  test('the row is offered only to a signed-in player on both screens', () => {
    expect(MENU_SCENE.split('feedbackAvailable: isLegacyFeedbackAvailable(this.authSnapshot)').length - 1).toBe(2);
  });

  test('while the popup is open the paused dropdown and the Settings sheet are not built behind it, and the launcher is cleaned up on shutdown', () => {
    expect(MENU_SCENE).toMatch(/!this\.settingsGuideOpen\n\s+&& !this\.feedbackLauncher\.isOpen\(\);/);
    expect(MENU_SCENE).toMatch(/private buildPauseOverlay\(\): void \{\n\s+if \(this\.feedbackLauncher\.isOpen\(\)\) \{\n\s+return;/);
    expect(MENU_SCENE).toMatch(/this\.feedbackLauncher\.activate\(\);\n\s+this\.events\.once\(Phaser\.Scenes\.Events\.SHUTDOWN, \(\) => this\.feedbackLauncher\.destroy\(\)\);/);
  });

  test('there is no auto prompt: nothing but the Feedback row opens the popup', () => {
    expect(MENU_SCENE.split('feedbackLauncher.open(').length - 1).toBe(1);
    expect(MENU_SCENE.split('openLegacyFeedback(').length - 1).toBe(3);
  });

  test('the popup copy never names Hazards', () => {
    for (const name of ['feedbackState.ts', 'feedbackPopup.ts', 'feedbackMount.ts']) {
      expect(read(`src/ui/feedback/${name}`), name).not.toMatch(/hazard/i);
    }
    expect(read('src/legacy-runtime/legacyFeedbackLauncher.ts')).not.toMatch(/hazard/i);
  });
});
