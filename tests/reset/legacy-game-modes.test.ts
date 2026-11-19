import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getLegacyAuthClient } from '../../src/legacy-runtime/legacyAuth';
import {
  LEGACY_DEFAULT_GAME_MODE_ID,
  LEGACY_GAME_MODES,
  LEGACY_RESERVED_GAME_MODE_SLOTS,
  isLegacyGameModeId,
  resolveLegacyGameMode,
  resolveLegacyScoreMode
} from '../../src/legacy-runtime/legacyGameModes';
import {
  fetchLegacyLeaderboardPage,
  fetchLegacyLeaderboardSelfRank
} from '../../src/legacy-runtime/legacyLeaderboard';
import {
  LEGACY_LEADERBOARD_MODE_TAB_SIZES,
  buildLegacyLeaderboardModeTabs,
  layoutLegacyLeaderboardModeTabs
} from '../../src/legacy-runtime/legacyLeaderboardModeTabs';
import { buildLegacyLeaderboardOverlayPlan } from '../../src/legacy-runtime/legacyLeaderboardOverlayPlan';
import {
  buildLegacyLeaderboardViewModel,
  resolveLegacyLeaderboardRequest,
  type LegacyLeaderboardViewState
} from '../../src/legacy-runtime/legacyLeaderboardView';

vi.mock('../../src/legacy-runtime/legacyAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/legacy-runtime/legacyAuth')>();
  return { ...actual, getLegacyAuthClient: vi.fn(async () => null) };
});

beforeEach(() => {
  vi.mocked(getLegacyAuthClient).mockReset();
});

const viewState = (patch: Partial<LegacyLeaderboardViewState> = {}): LegacyLeaderboardViewState => ({
  entries: [{ isRequestingUser: false, playerLevel: '9', rank: '1', username: 'nova' }],
  errorMessage: null,
  online: true,
  selfRank: null,
  selfUsername: '',
  signedIn: true,
  status: 'ready',
  usernameGate: 'ok',
  ...patch
});

describe('game mode registry', () => {
  test('Endless is the only registered, playable mode and the default', () => {
    expect(LEGACY_GAME_MODES.map((mode) => mode.id)).toEqual(['endless']);
    expect(LEGACY_GAME_MODES.every((mode) => mode.playable)).toBe(true);
    expect(LEGACY_DEFAULT_GAME_MODE_ID).toBe('endless');
    expect(LEGACY_GAME_MODES[0]!.label).toBe('Endless');
    expect(Object.isFrozen(LEGACY_GAME_MODES)).toBe(true);
  });

  test('the hazards slot is documented and reserved but not reachable', () => {
    expect(LEGACY_RESERVED_GAME_MODE_SLOTS.map((slot) => [slot.slot, slot.status])).toEqual([['hazards', 'reserved']]);
    for (const slot of LEGACY_RESERVED_GAME_MODE_SLOTS) {
      expect(isLegacyGameModeId(slot.slot)).toBe(false);
      expect(resolveLegacyGameMode(slot.slot).id).toBe('endless');
      expect(LEGACY_GAME_MODES.some((mode) => mode.id === slot.slot)).toBe(false);
    }
    const tabs = buildLegacyLeaderboardModeTabs('hazards');
    expect(tabs.tabs.map((tab) => tab.id)).toEqual(['endless']);
    expect(tabs.selectedId).toBe('endless');
  });

  test('unknown, missing and legacy values resolve to Endless', () => {
    for (const raw of [undefined, null, '', 'ENDLESS ', 'zen', 42, {}]) {
      expect(resolveLegacyScoreMode(raw)).toBe('endless');
    }
    expect(isLegacyGameModeId('endless')).toBe(true);
    expect(isLegacyGameModeId('Endless')).toBe(false);
  });
});

describe('leaderboard mode tab shell', () => {
  test('a single selected Endless tab is part of every board body', () => {
    for (const patch of [{}, { status: 'loading' as const }, { entries: [], status: 'empty' as const }, { status: 'error' as const }, { online: false, status: 'error' as const }]) {
      const view = buildLegacyLeaderboardViewModel(viewState(patch));
      expect(view.modeTabs?.tabs).toEqual([
        { accessibilityLabel: 'Endless leaderboard, selected', id: 'endless', label: 'Endless', selected: true }
      ]);
    }
  });

  test('signed-out and username-gate bodies carry no tabs', () => {
    expect(buildLegacyLeaderboardViewModel(viewState({ signedIn: false })).modeTabs).toBeNull();
    expect(buildLegacyLeaderboardViewModel(viewState({ usernameGate: 'needs-username' })).modeTabs).toBeNull();
  });

  test('the strip sits between the exit row and the column header, centred, inside the card', () => {
    for (const [width, height] of [[320, 568], [390, 844], [1280, 720]] as const) {
      const plan = buildLegacyLeaderboardOverlayPlan(buildLegacyLeaderboardViewModel(viewState()), width, height);
      const tab = plan.modeTabs![0]!;
      expect(plan.modeTabs).toHaveLength(1);
      expect(tab.top).toBeGreaterThanOrEqual(plan.exit.top + plan.exit.height);
      expect(tab.top + tab.height).toBeLessThanOrEqual(plan.columnHeader!.rect.top);
      expect(tab.left).toBeGreaterThanOrEqual(plan.card.left);
      expect(tab.left + tab.width).toBeLessThanOrEqual(plan.card.left + plan.card.width);
      expect(Math.abs((tab.left + (tab.width / 2)) - (plan.card.left + (plan.card.width / 2)))).toBeLessThanOrEqual(1);
      expect(tab.height).toBe(LEGACY_LEADERBOARD_MODE_TAB_SIZES.height);
    }
  });

  test('no tab strip is planned for the signed-out body', () => {
    const plan = buildLegacyLeaderboardOverlayPlan(buildLegacyLeaderboardViewModel(viewState({ signedIn: false })), 390, 844);
    expect(plan.modeTabs).toBeNull();
  });

  test('layout puts several tabs side by side without overlap (ready for a second mode)', () => {
    const rects = layoutLegacyLeaderboardModeTabs(
      { selectedId: 'endless', tabs: [
        { accessibilityLabel: 'a', id: 'endless', label: 'Endless', selected: true },
        { accessibilityLabel: 'b', id: 'endless', label: 'Other', selected: false }
      ] },
      0, 300, 10
    );
    expect(rects[1]!.left).toBeGreaterThanOrEqual(rects[0]!.left + rects[0]!.width);
  });
});

describe('leaderboard queries stay mode-free until the column exists', () => {
  test('the request carries no mode field and the page RPC sends only limit and offset', async () => {
    expect(Object.keys(resolveLegacyLeaderboardRequest()).sort()).toEqual(['limit', 'offset']);
    const rpc = vi.fn(async () => ({ data: [{ rank: 1, username: 'nova', player_level: 9, is_requesting_user: false }], error: null }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ rpc } as never);
    const result = await fetchLegacyLeaderboardPage(0, 50);
    expect(rpc).toHaveBeenCalledWith('mazer_leaderboard_page', { p_limit: 50, p_offset: 0 });
    expect(result.entries).toHaveLength(1);
  });

  test('the self-rank RPC takes no arguments', async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    vi.mocked(getLegacyAuthClient).mockResolvedValueOnce({ rpc } as never);
    await fetchLegacyLeaderboardSelfRank();
    expect(rpc).toHaveBeenCalledWith('mazer_leaderboard_self_rank');
  });

  test('a row that carries a mode, or none, is still an Endless score', () => {
    expect(resolveLegacyScoreMode(undefined)).toBe('endless');
    expect(resolveLegacyScoreMode('endless')).toBe('endless');
  });
});

describe('product contract and SQL proposal are present and not wired into the app', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const contract = read('../../docs/architecture/MAZER-GAME-MODES-PRODUCT-CONTRACT.md');

  test('the contract states the guarantees this module implements', () => {
    expect(contract).toContain('Endless');
    expect(contract).toContain('existing score becomes Endless');
    expect(contract).toContain('hazards');
    expect(contract).toContain('legacyGameModes.ts');
  });

  test('no runtime source references the proposed mode column or a mode RPC argument', () => {
    for (const file of ['legacyLeaderboard.ts', 'legacyLeaderboardView.ts', 'legacyLeaderboardModeTabs.ts', 'legacyGameModes.ts']) {
      const source = read(`../../src/legacy-runtime/${file}`);
      expect(source).not.toMatch(/p_mode|\.mode\b|'mode'/);
    }
  });
});
