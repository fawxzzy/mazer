import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { cyberArcadeMaterial } from '../../src/render/cyberArcadeMaterial';
import type { LegacyLeaderboardEntry } from '../../src/legacy-runtime/legacyLeaderboard';
import {
  LEGACY_LEADERBOARD_COPY,
  LEGACY_LEADERBOARD_FETCH_LIMIT,
  LEGACY_LEADERBOARD_ICON_ASSET_PATH,
  LEGACY_LEADERBOARD_OVERLAY_ID,
  LEGACY_LEADERBOARD_USERNAME_MAX_CHARS,
  LEGACY_LEADERBOARD_VISIBLE_ROWS,
  buildLegacyLeaderboardViewModel,
  resolveLegacyLeaderboardLayout,
  resolveLegacyLeaderboardPageRequest,
  resolveLegacyLeaderboardRankTier,
  resolveLegacyLeaderboardTierColor,
  resolveLegacyLeaderboardUsernameDisplay,
  splitLegacyLeaderboardPage,
  type LegacyLeaderboardViewState
} from '../../src/legacy-runtime/legacyLeaderboardView';
import { formatLegacyProgressionOrdinal } from '../../src/legacy-runtime/legacyProgression';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

const makeEntries = (count: number, firstRank = 1, ownIndex = -1): LegacyLeaderboardEntry[] => (
  Array.from({ length: count }, (_, index) => ({
    isRequestingUser: index === ownIndex,
    playerLevel: String(500 - firstRank - index),
    rank: String(firstRank + index),
    username: `player_${firstRank + index}`
  }))
);

const readyState = (overrides: Partial<LegacyLeaderboardViewState> = {}): LegacyLeaderboardViewState => ({
  entries: makeEntries(10),
  errorMessage: null,
  offset: 0,
  selfRank: null,
  status: 'ready',
  usernameGate: 'ok',
  ...overrides
});

describe('legacy leaderboard view: page request and split (limit + 1)', () => {
  test('requests 11 rows at the given offset', () => {
    expect(resolveLegacyLeaderboardPageRequest(0)).toEqual({ limit: 11, offset: 0 });
    expect(resolveLegacyLeaderboardPageRequest(30)).toEqual({ limit: 11, offset: 30 });
    expect(LEGACY_LEADERBOARD_FETCH_LIMIT).toBe(LEGACY_LEADERBOARD_VISIBLE_ROWS + 1);
  });

  test('sanitizes offsets', () => {
    expect(resolveLegacyLeaderboardPageRequest(-5).offset).toBe(0);
    expect(resolveLegacyLeaderboardPageRequest(Number.NaN).offset).toBe(0);
    expect(resolveLegacyLeaderboardPageRequest(12.9).offset).toBe(12);
  });

  test('11 rows -> 10 visible and hasNext; exactly 10 rows -> no false next page', () => {
    const eleven = splitLegacyLeaderboardPage(makeEntries(11));
    expect(eleven.visible).toHaveLength(10);
    expect(eleven.hasNext).toBe(true);
    expect(eleven.visible[9]?.rank).toBe('10');

    const ten = splitLegacyLeaderboardPage(makeEntries(10));
    expect(ten.visible).toHaveLength(10);
    expect(ten.hasNext).toBe(false);

    expect(splitLegacyLeaderboardPage(makeEntries(3))).toEqual({ hasNext: false, visible: makeEntries(3) });
    expect(splitLegacyLeaderboardPage([])).toEqual({ hasNext: false, visible: [] });
  });

  test('never shows more than ten rows even if the caller passes more than eleven', () => {
    const model = buildLegacyLeaderboardViewModel(readyState({ entries: makeEntries(40) }));
    expect(model.rows).toHaveLength(10);
    expect(model.pager?.hasNext).toBe(true);
  });
});

describe('legacy leaderboard view: rows', () => {
  test('rank accent tier is GLOBAL rank 1-3 only, not page-relative', () => {
    expect(resolveLegacyLeaderboardRankTier('1')).toBe('gold');
    expect(resolveLegacyLeaderboardRankTier('2')).toBe('cyan');
    expect(resolveLegacyLeaderboardRankTier('3')).toBe('mint');
    expect(resolveLegacyLeaderboardRankTier('4')).toBe('standard');

    const page2 = buildLegacyLeaderboardViewModel(readyState({ entries: makeEntries(10, 11), offset: 10 }));
    expect(page2.rows.map((row) => row.tier)).toEqual(Array(10).fill('standard'));

    const page1 = buildLegacyLeaderboardViewModel(readyState());
    expect(page1.rows.slice(0, 4).map((row) => row.tier)).toEqual(['gold', 'cyan', 'mint', 'standard']);
  });

  test('tier follows the rank value, not the row index (ties / gaps)', () => {
    const entries: LegacyLeaderboardEntry[] = [
      { isRequestingUser: false, playerLevel: '9', rank: '2', username: 'b' },
      { isRequestingUser: false, playerLevel: '9', rank: '2', username: 'c' },
      { isRequestingUser: false, playerLevel: '8', rank: '4', username: 'd' }
    ];
    const model = buildLegacyLeaderboardViewModel(readyState({ entries }));
    expect(model.rows.map((row) => row.tier)).toEqual(['cyan', 'cyan', 'standard']);
  });

  test('tier colors come from the shared cyber-arcade material', () => {
    expect(resolveLegacyLeaderboardTierColor('gold')).toBe(cyberArcadeMaterial.signal.start);
    expect(resolveLegacyLeaderboardTierColor('cyan')).toBe(cyberArcadeMaterial.rail.cyan);
    expect(resolveLegacyLeaderboardTierColor('mint')).toBe(cyberArcadeMaterial.rail.mint);
    expect(resolveLegacyLeaderboardTierColor('standard')).toBe(cyberArcadeMaterial.rail.white);
  });

  test('ranks and levels are bigint-safe decimal strings (no Number precision loss)', () => {
    const huge = '9007199254740993123';
    const entries: LegacyLeaderboardEntry[] = [
      { isRequestingUser: false, playerLevel: '123456789012345678901', rank: huge, username: 'big' }
    ];
    const model = buildLegacyLeaderboardViewModel(readyState({ entries, offset: 0 }));
    expect(model.rows[0]?.rankChipText).toBe('9,007,199,254,740,993,123');
    expect(model.rows[0]?.levelText).toBe('123,456,789,012,345,678,901');
    expect(model.rows[0]?.key).toBe(huge);
    expect(model.rows[0]?.rankChipText).toBe(formatLegacyProgressionOrdinal(huge));
    expect(model.rows[0]?.tier).toBe('standard');
  });

  test('the module source never converts ranks with Number()/parseInt/parseFloat', () => {
    const source = read('src/legacy-runtime/legacyLeaderboardView.ts');
    expect(source).not.toMatch(/\bNumber\(/);
    expect(source).not.toMatch(/\bparseInt\(/);
    expect(source).not.toMatch(/\bparseFloat\(/);
    expect(source).not.toContain('legacyAuth');
  });

  test('flags the requesting user row and exposes level right-aligned text', () => {
    const model = buildLegacyLeaderboardViewModel(readyState({ entries: makeEntries(10, 1, 4) }));
    expect(model.rows.map((row) => row.isOwn)).toEqual([false, false, false, false, true, false, false, false, false, false]);
    expect(model.rows[4]?.accessibilityLabel).toContain('you');
    expect(model.rows[0]?.levelText).toBe('499');
  });

  test('username display: max 15 chars including the ellipsis, ellipsis-safe, surrogate-safe', () => {
    expect(LEGACY_LEADERBOARD_USERNAME_MAX_CHARS).toBe(15);
    expect(resolveLegacyLeaderboardUsernameDisplay('123456789012345')).toBe('123456789012345');
    const long = resolveLegacyLeaderboardUsernameDisplay('1234567890123456');
    expect(long).toBe('12345678901234…');
    expect(Array.from(long)).toHaveLength(15);
    expect(resolveLegacyLeaderboardUsernameDisplay('abcdefghij', 5)).toBe('abcd…');
    expect(resolveLegacyLeaderboardUsernameDisplay('abc', 1)).toBe('…');

    const emoji = resolveLegacyLeaderboardUsernameDisplay('\u{1F600}'.repeat(20), 6);
    expect(emoji).toBe(`${'\u{1F600}'.repeat(5)}…`);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(emoji)).toBe(false);

    const model = buildLegacyLeaderboardViewModel(
      readyState({ entries: [{ isRequestingUser: false, playerLevel: '1', rank: '1', username: 'abcdefghijklmnopqrstuvwxyz' }] }),
      { usernameMaxChars: 8 }
    );
    expect(model.rows[0]?.usernameText).toBe('abcdefg…');
  });
});

describe('legacy leaderboard view: self card', () => {
  test('ranked: "#N" and "Level N" with grouped digits', () => {
    const model = buildLegacyLeaderboardViewModel(readyState({
      selfRank: { hasUsername: true, playerLevel: '1234', rank: '1520' }
    }));
    expect(model.selfCard).toEqual({
      label: 'YOU',
      levelText: 'Level 1,234',
      rankText: '#1,520',
      summaryText: '#1,520 · Level 1,234',
      variant: 'ranked'
    });
  });

  test('no username on the self-rank record -> set-a-username copy', () => {
    const model = buildLegacyLeaderboardViewModel(readyState({
      selfRank: { hasUsername: false, playerLevel: '3', rank: null }
    }));
    expect(model.selfCard?.variant).toBe('needs-username');
    expect(model.selfCard?.summaryText).toBe('Set a username on the account screen to appear here.');
    expect(model.selfCard?.rankText).toBeNull();
  });

  test('absent self rank (or a named caller with a null rank) yields no card', () => {
    expect(buildLegacyLeaderboardViewModel(readyState()).selfCard).toBeNull();
    expect(buildLegacyLeaderboardViewModel(readyState({
      selfRank: { hasUsername: true, playerLevel: '3', rank: null }
    })).selfCard).toBeNull();
  });
});

describe('legacy leaderboard view: username gate and states', () => {
  test('loading gate replaces the whole body', () => {
    const model = buildLegacyLeaderboardViewModel(readyState({ usernameGate: 'loading' }));
    expect(model.phase).toBe('gate');
    expect(model.body).toEqual({ kind: 'gate-loading', text: 'Loading username...', tone: 'info' });
    expect(model.rows).toEqual([]);
    expect(model.actions).toEqual([]);
    expect(model.pager).toBeNull();
    expect(model.selfCard).toBeNull();
  });

  test('unavailable gate offers Retry', () => {
    const model = buildLegacyLeaderboardViewModel(readyState({ usernameGate: 'unavailable' }));
    expect(model.body?.text).toBe('Username unavailable. Try again.');
    expect(model.body?.tone).toBe('error');
    expect(model.actions.map((action) => [action.id, action.label])).toEqual([['retry-username', 'Retry']]);
  });

  test('needs-username gate offers Go to Account', () => {
    const model = buildLegacyLeaderboardViewModel(readyState({ usernameGate: 'needs-username' }));
    expect(model.body?.text).toBe('You need a username to access the leaderboard.');
    expect(model.actions.map((action) => [action.id, action.label])).toEqual([['go-to-account', 'Go to Account']]);
    expect(model.rows).toEqual([]);
  });

  test('gate beats every page status', () => {
    for (const status of ['idle', 'loading', 'ready', 'empty', 'error', 'unavailable'] as const) {
      expect(buildLegacyLeaderboardViewModel(readyState({ status, usernameGate: 'needs-username' })).phase).toBe('gate');
    }
  });

  test('loading and idle show ten skeleton rows plus the self card, no rows or pager', () => {
    for (const status of ['loading', 'idle'] as const) {
      const model = buildLegacyLeaderboardViewModel(readyState({
        selfRank: { hasUsername: true, playerLevel: '2', rank: '9' },
        status
      }));
      expect(model.phase).toBe('loading');
      expect(model.skeletonRowCount).toBe(10);
      expect(model.rows).toEqual([]);
      expect(model.pager).toBeNull();
      expect(model.selfCard?.rankText).toBe('#9');
      expect(model.body?.text).toBe('Loading...');
    }
  });

  test('empty at offset 0 shows the pinned empty copy and no pager', () => {
    const model = buildLegacyLeaderboardViewModel(readyState({ entries: [], status: 'empty' }));
    expect(model.phase).toBe('empty');
    expect(model.body?.text).toBe('No one has a public rank yet.');
    expect(model.pager).toBeNull();
  });

  test('a ready page past the end shows an empty-page body with a way back', () => {
    const model = buildLegacyLeaderboardViewModel(readyState({ entries: [], offset: 20 }));
    expect(model.body?.kind).toBe('empty-page');
    expect(model.pager?.pageLabel).toBe('Page 3');
    expect(model.actions.map((action) => action.id)).toEqual(['previous-page']);
  });

  test('error / unavailable: exact message, Retry, fallback copy when absent', () => {
    const network = buildLegacyLeaderboardViewModel(readyState({
      entries: [], errorMessage: 'Could not reach the leaderboard. Check your connection and try again.', status: 'error'
    }));
    expect(network.phase).toBe('error');
    expect(network.body?.text).toBe('Could not reach the leaderboard. Check your connection and try again.');
    expect(network.actions.map((action) => [action.id, action.label])).toEqual([['retry-page', 'Retry']]);

    const unavailable = buildLegacyLeaderboardViewModel(readyState({ entries: [], errorMessage: null, status: 'unavailable' }));
    expect(unavailable.body?.text).toBe('The leaderboard is not available right now.');
    expect(unavailable.actions.map((action) => action.id)).toEqual(['retry-page']);

    const blank = buildLegacyLeaderboardViewModel(readyState({ errorMessage: '   ', status: 'error' }));
    expect(blank.body?.text).toBe('The leaderboard is not available right now.');
  });

  test('error keeps the self card visible when present', () => {
    const model = buildLegacyLeaderboardViewModel(readyState({
      selfRank: { hasUsername: true, playerLevel: '2', rank: '9' }, status: 'error'
    }));
    expect(model.selfCard?.rankText).toBe('#9');
  });
});

describe('legacy leaderboard view: pager', () => {
  test('page 1: no Previous, Next only when an 11th row exists', () => {
    const withNext = buildLegacyLeaderboardViewModel(readyState({ entries: makeEntries(11) }));
    expect(withNext.pager).toEqual({
      hasNext: true, hasPrevious: false, nextOffset: 10, pageLabel: 'Page 1', pageNumber: 1, previousOffset: 0
    });
    expect(withNext.actions.map((action) => action.id)).toEqual(['next-page']);

    const exactlyTen = buildLegacyLeaderboardViewModel(readyState({ entries: makeEntries(10) }));
    expect(exactlyTen.pager?.hasNext).toBe(false);
    expect(exactlyTen.actions).toEqual([]);
  });

  test('later pages: Page N label, both directions', () => {
    const model = buildLegacyLeaderboardViewModel(readyState({ entries: makeEntries(11, 21), offset: 20 }));
    expect(model.pager).toEqual({
      hasNext: true, hasPrevious: true, nextOffset: 30, pageLabel: 'Page 3', pageNumber: 3, previousOffset: 10
    });
    expect(model.actions.map((action) => [action.id, action.label])).toEqual([
      ['previous-page', 'Previous'],
      ['next-page', 'Next']
    ]);
  });

  test('columns and header copy', () => {
    const model = buildLegacyLeaderboardViewModel(readyState());
    expect(model.header.title).toBe('Leaderboard');
    expect(model.columns).toEqual({ level: 'LEVEL', player: 'PLAYER' });
    expect(model.overlayId).toBe('leaderboard');
  });
});

describe('legacy leaderboard view: determinism and pins', () => {
  test('same state, same model', () => {
    const state = readyState({ entries: makeEntries(11, 1, 2), selfRank: { hasUsername: true, playerLevel: '9', rank: '3' } });
    expect(JSON.stringify(buildLegacyLeaderboardViewModel(state))).toBe(JSON.stringify(buildLegacyLeaderboardViewModel(state)));
  });

  test('does not mutate its input', () => {
    const entries = makeEntries(11);
    const snapshot = JSON.stringify(entries);
    buildLegacyLeaderboardViewModel(readyState({ entries }));
    expect(JSON.stringify(entries)).toBe(snapshot);
  });

  test('pinned strings are rendered through the view-model: the scene draws the model, the module owns the copy', () => {
    const scene = read('src/scenes/MenuScene.ts');
    const view = read('src/legacy-runtime/legacyLeaderboardView.ts');
    for (const copy of [
      LEGACY_LEADERBOARD_COPY.loadingUsername,
      LEGACY_LEADERBOARD_COPY.usernameUnavailable,
      LEGACY_LEADERBOARD_COPY.retry,
      LEGACY_LEADERBOARD_COPY.needsUsername,
      LEGACY_LEADERBOARD_COPY.goToAccount,
      LEGACY_LEADERBOARD_COPY.emptyBoard,
      LEGACY_LEADERBOARD_COPY.selfNeedsUsername,
      LEGACY_LEADERBOARD_COPY.errorFallback
    ]) {
      expect(view).toContain(`'${copy}'`);
      expect(scene).not.toContain(`'${copy}'`);
    }
    expect(scene).toContain('buildLegacyLeaderboardViewModel(this.resolveLegacyLeaderboardViewState())');
    expect(scene).toContain('resolveLegacyLeaderboardPageRequest(offset)');
    expect(scene).not.toContain('LEADERBOARD_VISIBLE_ROWS');
    expect(LEGACY_LEADERBOARD_VISIBLE_ROWS).toBe(10);
  });

  test('exact error copy is mirrored from legacyLeaderboard.ts', () => {
    const source = read('src/legacy-runtime/legacyLeaderboard.ts');
    expect(source).toContain(`'${LEGACY_LEADERBOARD_COPY.errorFallback}'`);
    expect(source).toContain(`'${LEGACY_LEADERBOARD_COPY.errorNetwork}'`);
    expect(source).toContain(`'${LEGACY_LEADERBOARD_COPY.errorNotSetUp}'`);
  });

  test('keeps the overlay id and the leaderboard header icon asset', () => {
    expect(LEGACY_LEADERBOARD_OVERLAY_ID).toBe('leaderboard');
    expect(existsSync(resolve(process.cwd(), 'public', LEGACY_LEADERBOARD_ICON_ASSET_PATH))).toBe(true);
    expect(read('src/legacy-runtime/legacyOverlayRouting.ts')).toContain("'leaderboard'");
  });
});

describe('legacy leaderboard view: layout', () => {
  test('row height is 44 normally and 40 when the viewport is shorter than 760', () => {
    expect(resolveLegacyLeaderboardLayout(390, 844).rowHeight).toBe(44);
    expect(resolveLegacyLeaderboardLayout(1280, 760).rowHeight).toBe(44);
    expect(resolveLegacyLeaderboardLayout(1280, 759).rowHeight).toBe(40);
    expect(resolveLegacyLeaderboardLayout(1280, 720).rowHeight).toBe(40);
  });

  test('fits at 390x844 with ten rows (also with notch/home-indicator safe areas)', () => {
    const layout = resolveLegacyLeaderboardLayout(390, 844);
    expect(layout.compact).toBe(true);
    expect(layout.visibleRows).toBe(10);
    expect(layout.fits).toBe(true);
    expect(layout.overflowPx).toBe(0);
    expect(layout.contentHeight).toBeLessThanOrEqual(layout.availableHeight);
    expect(layout.maxRowsThatFit).toBe(10);
    expect(resolveLegacyLeaderboardLayout(390, 844, { bottom: 34, top: 47 }).fits).toBe(true);
  });

  test('fits at 1280x720 with ten rows', () => {
    const layout = resolveLegacyLeaderboardLayout(1280, 720);
    expect(layout.compact).toBe(false);
    expect(layout.rowHeight).toBe(40);
    expect(layout.fits).toBe(true);
    expect(layout.contentHeight).toBeLessThanOrEqual(layout.availableHeight);
  });

  test('reuses resolveLegacyOverlayPanelLayout rather than duplicating its math', () => {
    const source = read('src/legacy-runtime/legacyLeaderboardView.ts');
    expect(source).toContain("resolveLegacyOverlayPanelLayout");
    expect(source).toContain("from './legacyUiStandards'");
    expect(source).not.toContain('viewportWidth - (horizontalInset');
    const layout = resolveLegacyLeaderboardLayout(390, 844);
    expect(layout.panel.width).toBe(374);
    expect(layout.panel.top).toBe(8);
  });

  test('regions stack top to bottom without overlap and the pager keeps a touch target', () => {
    for (const [width, height] of [[390, 844], [1280, 720]] as const) {
      const layout = resolveLegacyLeaderboardLayout(width, height);
      expect(layout.tops.selfCard).toBeLessThan(layout.tops.columnHeader);
      expect(layout.tops.columnHeader).toBeLessThan(layout.tops.list);
      expect(layout.tops.list + layout.listHeight).toBe(layout.tops.pager);
      expect(layout.tops.pager + layout.pagerHeight + layout.bottomInset).toBeLessThanOrEqual(layout.panel.top + layout.panel.height);
      expect(layout.pagerHeight).toBeGreaterThanOrEqual(44);
    }
  });

  test('reports overflow on a tiny viewport instead of lying about fit', () => {
    const layout = resolveLegacyLeaderboardLayout(320, 480);
    expect(layout.fits).toBe(false);
    expect(layout.overflowPx).toBeGreaterThan(0);
    expect(layout.maxRowsThatFit).toBeLessThan(10);
  });

  test('omitting the self card frees its height', () => {
    const withCard = resolveLegacyLeaderboardLayout(390, 844);
    const without = resolveLegacyLeaderboardLayout(390, 844, {}, { includeSelfCard: false });
    expect(without.contentHeight).toBeLessThan(withCard.contentHeight);
  });
});
