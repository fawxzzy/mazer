import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { LegacyLeaderboardEntry } from '../../src/legacy-runtime/legacyLeaderboard';
import {
  LEGACY_LEADERBOARD_OVERLAY_MIN_ROW_HEIGHT,
  buildLegacyLeaderboardOverlayPlan
} from '../../src/legacy-runtime/legacyLeaderboardOverlayPlan';
import {
  LEGACY_LEADERBOARD_COPY,
  LEGACY_LEADERBOARD_ICON_ASSET_PATH,
  buildLegacyLeaderboardViewModel,
  type LegacyLeaderboardViewState
} from '../../src/legacy-runtime/legacyLeaderboardView';
import { LEGACY_UI_MIN_TOUCH_TARGET } from '../../src/legacy-runtime/legacyUiStandards';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

const entries = (count: number, ownIndex = -1): LegacyLeaderboardEntry[] => (
  Array.from({ length: count }, (_, index) => ({
    isRequestingUser: index === ownIndex,
    playerLevel: String(400 - index),
    rank: String(index + 1),
    username: `player_${index + 1}`
  }))
);

const state = (overrides: Partial<LegacyLeaderboardViewState> = {}): LegacyLeaderboardViewState => ({
  entries: entries(11, 2),
  errorMessage: null,
  offset: 0,
  selfRank: { hasUsername: true, playerLevel: '398', rank: '3' },
  status: 'ready',
  usernameGate: 'ok',
  ...overrides
});

const plan = (overrides: Partial<LegacyLeaderboardViewState>, width = 390, height = 844) => (
  buildLegacyLeaderboardOverlayPlan(buildLegacyLeaderboardViewModel(state(overrides)), width, height, { bottom: 0, top: 0 })
);

const VIEWPORTS: ReadonlyArray<readonly [number, number]> = [[390, 844], [320, 568], [1280, 720]];

describe('leaderboard overlay plan: loaded state', () => {
  test('pins the own-rank card and draws title, column header, ten rows and a Next control', () => {
    const loaded = plan({});
    expect(loaded.titleText).toBe('Leaderboard');
    expect(loaded.selfCard?.model.summaryText).toBe('#3 · Level 398');
    expect(loaded.selfCard!.rect.top).toBeLessThan(loaded.columnHeader!.centerY);
    expect(loaded.rows).toHaveLength(10);
    expect(loaded.rows.map((row) => row.model.rankChipText)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(loaded.rows[2]?.model.isOwn).toBe(true);
    expect(loaded.skeletonRows).toHaveLength(0);
    expect(loaded.body).toBeNull();
    expect(loaded.pager?.label.text).toBe('Page 1');
    expect(loaded.pager?.next?.action.label).toBe('Next');
    expect(loaded.pager?.previous).toBeNull();
  });

  test('exactly ten rows (no 11th row) means no false Next; page two offers Previous', () => {
    expect(plan({ entries: entries(10) }).pager?.next).toBeNull();
    const second = plan({ entries: entries(11), offset: 10 });
    expect(second.pager?.previous?.action.label).toBe('Previous');
    expect(second.pager?.label.text).toBe('Page 2');
  });

  test('rows, columns and pager stay inside the card and keep a column order of chip, name, level', () => {
    for (const [width, height] of VIEWPORTS) {
      const loaded = plan({}, width, height);
      for (const row of loaded.rows) {
        expect(row.chipCenterX).toBeLessThan(row.usernameLeft);
        expect(row.usernameLeft + row.usernameMaxWidth).toBeLessThan(row.levelRight);
        expect(row.rect.left).toBeGreaterThanOrEqual(loaded.card.left);
        expect(row.rect.left + row.rect.width).toBeLessThanOrEqual(loaded.card.left + loaded.card.width);
        expect(row.rect.height).toBeGreaterThanOrEqual(LEGACY_LEADERBOARD_OVERLAY_MIN_ROW_HEIGHT);
      }
      const last = loaded.rows[loaded.rows.length - 1]!;
      expect(last.rect.top + last.rect.height).toBeLessThanOrEqual(loaded.pager!.label.centerY);
    }
  });

  test('fits the card at 390x844, 320x568 and 1280x720 (rows shrink instead of overflowing)', () => {
    for (const [width, height] of VIEWPORTS) {
      const loaded = plan({}, width, height);
      expect(loaded.fits, `${width}x${height} overflowPx=${loaded.overflowPx}`).toBe(true);
      const pagerBottom = loaded.pager!.next!.rect.top + loaded.pager!.next!.rect.height;
      expect(pagerBottom).toBeLessThanOrEqual(loaded.card.top + loaded.card.height);
    }
  });

  test('safe-area top inset moves the whole card content down', () => {
    const base = plan({});
    const inset = buildLegacyLeaderboardOverlayPlan(
      buildLegacyLeaderboardViewModel(state()), 390, 844, { bottom: 34, top: 47 }
    );
    expect(inset.card.top).toBe(base.card.top + 47);
    expect(inset.titleCenterY).toBe(base.titleCenterY + 47);
    expect(inset.rows[0]!.rect.top).toBeGreaterThan(base.rows[0]!.rect.top);
  });
});

describe('leaderboard overlay plan: loading, empty, error and gate states', () => {
  test('loading: status line plus ten skeleton rows, no real rows, no pager, no raw text', () => {
    const loading = plan({ entries: [], status: 'loading' });
    expect(loading.statusLine?.text).toBe(LEGACY_LEADERBOARD_COPY.loading);
    expect(loading.skeletonRows).toHaveLength(10);
    expect(loading.rows).toHaveLength(0);
    expect(loading.body).toBeNull();
    expect(loading.pager).toBeNull();
    expect(loading.selfCard).not.toBeNull();
  });

  test('idle reads as loading', () => {
    expect(plan({ entries: [], status: 'idle' }).statusLine?.text).toBe('Loading...');
  });

  test('empty: friendly sentence, no rows, no actions', () => {
    const empty = plan({ entries: [], selfRank: null, status: 'empty' });
    expect(empty.body?.model.text).toBe(LEGACY_LEADERBOARD_COPY.emptyBoard);
    expect(empty.rows).toHaveLength(0);
    expect(empty.bodyActions).toHaveLength(0);
    expect(empty.selfCard).toBeNull();
  });

  test('empty page past the end explains it and offers Previous only', () => {
    const past = plan({ entries: [], offset: 30, status: 'ready' });
    expect(past.body?.model.text).toBe(LEGACY_LEADERBOARD_COPY.emptyPage);
    expect(past.pager?.previous?.action.id).toBe('previous-page');
    expect(past.pager?.next).toBeNull();
  });

  test('error: friendly copy only (never the raw message) with a Retry button of at least 44px', () => {
    const error = plan({ entries: [], errorMessage: '   ', status: 'error' });
    expect(error.body?.model.text).toBe(LEGACY_LEADERBOARD_COPY.errorFallback);
    expect(error.body?.model.tone).toBe('error');
    expect(error.bodyActions.map((item) => item.action.id)).toEqual(['retry-page']);
    expect(error.bodyActions[0]!.rect.height).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);

    const friendly = plan({ entries: [], errorMessage: LEGACY_LEADERBOARD_COPY.errorNetwork, status: 'error' });
    expect(friendly.body?.model.text).toBe(LEGACY_LEADERBOARD_COPY.errorNetwork);
  });

  test('username gate replaces the whole body: no self card, no rows; Retry / Go to Account actions', () => {
    const loadingGate = plan({ usernameGate: 'loading' });
    expect(loadingGate.body?.model.text).toBe(LEGACY_LEADERBOARD_COPY.loadingUsername);
    expect(loadingGate.selfCard).toBeNull();
    expect(loadingGate.rows).toHaveLength(0);

    const unavailable = plan({ usernameGate: 'unavailable' });
    expect(unavailable.bodyActions.map((item) => item.action.id)).toEqual(['retry-username']);

    const needsName = plan({ usernameGate: 'needs-username' });
    expect(needsName.body?.model.text).toBe(LEGACY_LEADERBOARD_COPY.needsUsername);
    expect(needsName.bodyActions.map((item) => item.action.label)).toEqual([LEGACY_LEADERBOARD_COPY.goToAccount]);
  });

  test('every interactive rectangle is at least 44px in both axes in every state and viewport', () => {
    const states: Array<Partial<LegacyLeaderboardViewState>> = [
      {},
      { entries: entries(11), offset: 10 },
      { entries: [], errorMessage: null, status: 'error' },
      { entries: [], offset: 20, status: 'ready' },
      { usernameGate: 'unavailable' },
      { usernameGate: 'needs-username' }
    ];
    for (const [width, height] of VIEWPORTS) {
      for (const overrides of states) {
        const result = plan(overrides, width, height);
        const rects = [
          ...result.bodyActions.map((item) => item.rect),
          ...(result.pager?.previous ? [result.pager.previous.rect] : []),
          ...(result.pager?.next ? [result.pager.next.rect] : [])
        ];
        for (const rect of rects) {
          expect(rect.height).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
          expect(rect.width).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
        }
      }
    }
  });
});

describe('leaderboard overlay: scene wiring and the kept icon', () => {
  test('the header entry icon asset path and its menu placement are unchanged', () => {
    expect(LEGACY_LEADERBOARD_ICON_ASSET_PATH).toBe('assets/hud/hud-leaderboard.png');
    expect(existsSync(resolve(process.cwd(), 'public', LEGACY_LEADERBOARD_ICON_ASSET_PATH))).toBe(true);
    const scene = read('src/scenes/MenuScene.ts');
    expect(scene).toContain('MAZER_HUD_LEADERBOARD_TEXTURE_KEY');
    expect(scene).toContain('private drawLegacyMenuLeaderboardIcon(time: number): void');
    expect(scene).toContain('private createLegacyMenuLeaderboardButton(onClick: () => void): UiButton');
    expect(scene).toContain("semanticAction: 'Leaderboard'");
    expect(scene).toContain('MAZER_HUD_LEADERBOARD_ICON_METRICS');
  });

  test('the overlay is drawn from the view-model plan; the old drawing code is gone', () => {
    const scene = read('src/scenes/MenuScene.ts').replace(/\r\n/g, '\n');
    const start = scene.indexOf('  private buildLeaderboardOverlay(): void {');
    const end = scene.indexOf('  private buildProgressionResetConfirmationOverlay(): void {');
    const overlay = scene.slice(start, end);
    expect(overlay).toContain('buildLegacyLeaderboardViewModel(this.resolveLegacyLeaderboardViewState())');
    expect(overlay).toContain('buildLegacyLeaderboardOverlayPlan(');
    expect(overlay).toContain('createOverlayBackChevronButton(panel, () => this.closeOverlay())');
    expect(overlay).toContain('material.substrate.field');
    for (const retired of [
      'drawLegacyLeaderboardTitleGlyph',
      'resolveLegacyLeaderboardRowAccent',
      'createAuthAccountSummaryCard',
      'YOUR RANK',
      'leaderboardHasNextPage'
    ]) {
      expect(scene, retired).not.toContain(retired);
    }
  });

  test('page fetch asks for limit + 1 rows and keeps the existing data sources', () => {
    const scene = read('src/scenes/MenuScene.ts');
    expect(scene).toContain('const request = resolveLegacyLeaderboardPageRequest(offset);');
    expect(scene).toContain('fetchLegacyLeaderboardPage(request.offset, request.limit, this.authSnapshot)');
    expect(scene).toContain('fetchLegacyLeaderboardSelfRank(this.authSnapshot)');
  });

  test('actions route to the existing handlers (retry reloads the same offset)', () => {
    const scene = read('src/scenes/MenuScene.ts').replace(/\r\n/g, '\n');
    const start = scene.indexOf('  private runLegacyLeaderboardAction(');
    const body = scene.slice(start, scene.indexOf('  private addLegacyLeaderboardText(', start));
    expect(body).toContain("case 'retry-page':\n        void this.loadLeaderboardPage(this.leaderboardOffset);");
    expect(body).toContain('pager.previousOffset');
    expect(body).toContain('pager.nextOffset');
    expect(body).toContain("{ type: 'NAVIGATE', surface: 'account' }");
    expect(body).toContain('this.accountUsernameLoadedForUserId = null;');
  });
});
