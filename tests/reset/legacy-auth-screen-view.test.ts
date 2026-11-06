import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { MAZER_OAUTH_SAFE_ERROR_MESSAGE as PORTAL_SAFE_ERROR } from '../../src/legacy-runtime/legacyAccountPortal';
import {
  LEGACY_AUTH_SCREEN_COPY,
  LEGACY_AUTH_SCREEN_DOCK_HEIGHT,
  LEGACY_AUTH_SCREEN_DOCK_RAIL_GAP,
  LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS,
  MAZER_OAUTH_SAFE_ERROR_MESSAGE,
  buildLegacyAuthScreenViewModel,
  resolveLegacyAuthLoadingCopy,
  resolveLegacyAuthScreenLayout,
  type LegacyAuthScreenLayout,
  type LegacyAuthScreenRect,
  type LegacyAuthScreenViewModelInput
} from '../../src/legacy-runtime/legacyAuthScreenView';
import { LEGACY_AUTH_MESSAGE_COPY } from '../../src/legacy-runtime/legacyPlayerMessage';

const baseInput: LegacyAuthScreenViewModelInput = {
  awaitingResolution: false,
  compact: true,
  errorMessage: null,
  hasCallbackInProgress: false,
  status: 'guest',
  submitting: false
};

const build = (overrides: Partial<LegacyAuthScreenViewModelInput> = {}) => (
  buildLegacyAuthScreenViewModel({ ...baseInput, ...overrides })
);

describe('legacy auth screen view model', () => {
  test('is deterministic and does not share mutable state between calls', () => {
    const first = build({ errorMessage: 'x', submitting: true, submittingElapsedMs: 100 });
    const second = build({ errorMessage: 'x', submitting: true, submittingElapsedMs: 100 });
    expect(second).toEqual(first);
    expect(second.anatomy).not.toBe(first.anatomy);
    expect(second.secondaryRail).not.toBe(first.secondaryRail);
  });

  test('renders the family anatomy top to bottom with Welcome and no subtitle', () => {
    const entry = build();
    expect(entry.phase).toBe('entry');
    expect(entry.anatomy).toEqual(['marker', 'title', 'secondary-rail', 'legal-row', 'primary-dock']);
    expect(entry.marker).toEqual({ label: 'MAZER' });
    expect(entry.title).toBe('Welcome');
    expect(entry.subtitle).toBeNull();
    expect(JSON.stringify(entry)).not.toContain('Use your shared Fawxzzy account');
    expect(JSON.stringify(entry)).not.toContain('"Account"');
    expect(entry.secondaryRail.map((link) => link.label)).toEqual(['Create Account', 'Reset Password']);
    expect(entry.secondaryRail.map((link) => link.action)).toEqual(['create-account', 'reset-password']);
    expect(entry.legalRow.map((link) => link.label)).toEqual(['Privacy Policy', 'Terms of Service']);
    expect(entry.legalRow.map((link) => link.action)).toEqual(['privacy', 'terms']);
  });

  test('places the status banner between the title and the secondary rail', () => {
    const withError = build({ errorMessage: MAZER_OAUTH_SAFE_ERROR_MESSAGE });
    expect(withError.anatomy).toEqual([
      'marker', 'title', 'status-banner', 'secondary-rail', 'legal-row', 'primary-dock'
    ]);
    expect(withError.phase).toBe('error');
  });

  test('exposes exactly one primary dock and no home, back or guest action in any entry phase', () => {
    const phases = [
      build(),
      build({ errorMessage: 'boom' }),
      build({ submitting: true }),
      build({ submitting: true, submittingElapsedMs: LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS }),
      build({ hasCallbackInProgress: true }),
      build({ status: 'unavailable' })
    ];
    for (const model of phases) {
      expect(model.anatomy.filter((id) => id === 'primary-dock')).toHaveLength(1);
      expect(model.primaryDock?.action).toBe('sign-in');
      const everyAction = [
        ...model.secondaryRail.map((link) => link.action),
        ...model.legalRow.map((link) => link.action),
        model.primaryDock?.action
      ];
      expect(everyAction.join(' ')).not.toMatch(/guest|home|back|close|skip/i);
    }
  });

  test('sign-in dock states: Sign in, bounded Opening, then retryable Sign in plus browser notice', () => {
    const idle = build();
    expect(idle.primaryDock).toEqual({ action: 'sign-in', disabled: false, label: 'Sign in', pending: false });

    const opening = build({ submitting: true, submittingElapsedMs: LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS - 1 });
    expect(opening.phase).toBe('opening');
    expect(opening.primaryDock).toEqual({ action: 'sign-in', disabled: true, label: 'Opening', pending: true });
    expect(opening.secondaryRail.every((link) => link.disabled)).toBe(true);
    expect(opening.legalRow.every((link) => link.disabled)).toBe(true);

    const slow = build({ submitting: true, submittingElapsedMs: LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS });
    expect(slow.phase).toBe('opening-slow');
    expect(slow.primaryDock).toEqual({ action: 'sign-in', disabled: false, label: 'Sign in', pending: false });
    expect(slow.banner).toEqual({
      copy: 'Still opening. Continue in your browser or try again.',
      tone: 'info'
    });
    expect(slow.secondaryRail.every((link) => !link.disabled)).toBe(true);

    // Without an elapsed reading the label never claims more than the first window.
    expect(build({ submitting: true }).phase).toBe('opening');
  });

  test('an in-flight OAuth callback disables the dock and says Signing you in…', () => {
    const callback = build({ hasCallbackInProgress: true });
    expect(callback.phase).toBe('callback-pending');
    expect(callback.primaryDock).toEqual({ action: 'sign-in', disabled: true, label: 'Signing in', pending: true });
    expect(callback.banner).toEqual({ copy: 'Signing you in…', tone: 'info' });
  });

  test('Create Account stays on the OAuth hand-off and Reset Password on the account host route', () => {
    const rail = build().secondaryRail;
    expect(rail[0].route).toBe('oauth-authorize');
    expect(rail[1].route).toBe('account-host-reset');
  });

  test('passes error copy through unchanged and pins the safe OAuth message', () => {
    expect(MAZER_OAUTH_SAFE_ERROR_MESSAGE).toBe('Account connection unavailable. Return to Mazer and try again.');
    expect(MAZER_OAUTH_SAFE_ERROR_MESSAGE).toBe(PORTAL_SAFE_ERROR);
    const existingCopies = [
      MAZER_OAUTH_SAFE_ERROR_MESSAGE,
      ...Object.values(LEGACY_AUTH_MESSAGE_COPY)
    ];
    for (const copy of existingCopies) {
      expect(build({ errorMessage: copy }).banner).toEqual({ copy, tone: 'error' });
    }
    expect(build({ errorMessage: `  ${MAZER_OAUTH_SAFE_ERROR_MESSAGE}\n` }).banner?.copy)
      .toBe(MAZER_OAUTH_SAFE_ERROR_MESSAGE);
    expect(build({ errorMessage: '   ' }).banner).toBeNull();
    expect(build({ status: 'unavailable' }).banner).toEqual({
      copy: MAZER_OAUTH_SAFE_ERROR_MESSAGE,
      tone: 'error'
    });
    // A real error message wins over the generic unavailable fallback.
    expect(build({ errorMessage: 'specific', status: 'unavailable' }).banner?.copy).toBe('specific');
  });

  test('shows nothing but the loading copy while the first resolution is pending', () => {
    const loading = build({ awaitingResolution: true });
    expect(loading.phase).toBe('loading');
    expect(loading.anatomy).toEqual([]);
    expect(loading.primaryDock).toBeNull();
    expect(loading.loadingCopy).toBe('Loading…');
    expect(build({ awaitingResolution: true, hasStoredSession: true }).loadingCopy).toBe('Signing you in…');
    expect(build({ awaitingResolution: true, hasCallbackInProgress: true }).loadingCopy)
      .toBe('Signing you in…');
  });

  test('renders no entry screen for an authenticated session', () => {
    const authenticated = build({ status: 'authenticated' });
    expect(authenticated.phase).toBe('authenticated');
    expect(authenticated.anatomy).toEqual([]);
    expect(authenticated.primaryDock).toBeNull();
  });

  test('compact only changes density, never copy', () => {
    const compact = build({ compact: true });
    const regular = build({ compact: false });
    expect(compact.density).toBe('compact');
    expect(regular.density).toBe('regular');
    expect({ ...compact, density: 'regular' }).toEqual(regular);
  });
});

describe('legacy auth loading copy truth table', () => {
  const rows: Array<[boolean, boolean, boolean, string]> = [
    // awaitingResolution, hasSession, callbackInProgress -> copy
    [false, false, false, 'Loading…'],
    [false, true, false, 'Loading…'],
    [false, false, true, 'Signing you in…'],
    [false, true, true, 'Signing you in…'],
    [true, false, false, 'Loading…'],
    [true, true, false, 'Signing you in…'],
    [true, false, true, 'Signing you in…'],
    [true, true, true, 'Signing you in…']
  ];

  test.each(rows)('awaiting=%s hasSession=%s callback=%s -> %s', (awaitingResolution, hasSession, callbackInProgress, copy) => {
    expect(resolveLegacyAuthLoadingCopy({ awaitingResolution, callbackInProgress, hasSession })).toBe(copy);
  });

  test('a first-time visitor (no session, no callback) never sees Signing you in…', () => {
    for (const awaitingResolution of [true, false]) {
      expect(resolveLegacyAuthLoadingCopy({ awaitingResolution, callbackInProgress: false, hasSession: false }))
        .toBe(LEGACY_AUTH_SCREEN_COPY.loading);
    }
  });
});

const rectRight = (rect: LegacyAuthScreenRect) => rect.left + rect.width;
const rectBottom = (rect: LegacyAuthScreenRect) => rect.top + rect.height;
const overlaps = (a: LegacyAuthScreenRect, b: LegacyAuthScreenRect) => (
  a.left < rectRight(b) && b.left < rectRight(a) && a.top < rectBottom(b) && b.top < rectBottom(a)
);

const assertLayoutInvariants = (
  layout: LegacyAuthScreenLayout,
  viewport: { height: number; width: number },
  safe: { bottom?: number; left?: number; right?: number; top?: number } = {}
) => {
  const stack = [layout.body, layout.rail.row, layout.legal.row, layout.dock];

  // Dock: full column width, >= 44px target, height 52, pinned above the bottom safe area.
  expect(layout.dock.height).toBe(LEGACY_AUTH_SCREEN_DOCK_HEIGHT);
  expect(layout.dock.height).toBeGreaterThanOrEqual(44);
  expect(layout.dock.width).toBe(layout.columnWidth);
  expect(rectBottom(layout.dock)).toBeLessThanOrEqual(viewport.height - (safe.bottom ?? 0));
  expect(layout.dock.left).toBeGreaterThanOrEqual(safe.left ?? 0);
  expect(rectRight(layout.dock)).toBeLessThanOrEqual(viewport.width - (safe.right ?? 0));

  // Every integer coordinate (no blurry half pixels).
  for (const rect of [...stack, layout.rail.divider, layout.legal.divider, ...layout.rail.items, ...layout.legal.items]) {
    for (const value of [rect.left, rect.top, rect.width, rect.height]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  }

  // Rows are touch-safe and the legal row sits exactly the shared gap above the dock.
  for (const row of [layout.rail, layout.legal]) {
    expect(row.row.height).toBeGreaterThanOrEqual(44);
    for (const item of row.items) {
      expect(item.height).toBeGreaterThanOrEqual(44);
      expect(item.width).toBeGreaterThan(0);
    }
    // Divider is centered on the screen centerline and between the two items.
    expect(layout.centerX - row.divider.left).toBe(row.divider.width / 2);
    expect(rectRight(row.items[0])).toBeLessThanOrEqual(row.divider.left);
    expect(row.items[1].left).toBeGreaterThanOrEqual(rectRight(row.divider));
    expect(overlaps(row.items[0], row.items[1])).toBe(false);
  }
  expect(layout.dock.top - rectBottom(layout.legal.row)).toBe(LEGACY_AUTH_SCREEN_DOCK_RAIL_GAP);
  expect(layout.legal.row.top).toBe(rectBottom(layout.rail.row));

  // Marker < title < body < rail < legal < dock, with no overlap.
  expect(layout.markerCenterY).toBeLessThan(layout.titleCenterY);
  expect(layout.titleCenterY).toBeLessThan(layout.body.top);
  expect(layout.overflow).toBe(false);
  expect(rectBottom(layout.body)).toBeLessThanOrEqual(layout.rail.row.top);
  for (let index = 0; index < stack.length; index += 1) {
    for (let other = index + 1; other < stack.length; other += 1) {
      expect(overlaps(stack[index], stack[other])).toBe(false);
    }
  }

  // Column is horizontally centered on the usable area and inside the viewport.
  expect(layout.columnLeft + Math.floor(layout.columnWidth / 2)).toBe(layout.centerX);
  expect(layout.columnLeft).toBeGreaterThanOrEqual(0);
  expect(rectRight(layout.body)).toBeLessThanOrEqual(viewport.width);
};

describe('legacy auth screen layout', () => {
  test('fits the 390x844 phone viewport as a full-width dock column', () => {
    const layout = resolveLegacyAuthScreenLayout(390, 844);
    assertLayoutInvariants(layout, { height: 844, width: 390 });
    expect(layout.compact).toBe(true);
    expect(layout.columnWidth).toBe(390 - 16 - 32);
    expect(layout.dock).toEqual({ height: 52, left: 24, top: 768, width: 342 });
    expect(layout.markerCenterY).toBe(50);
    expect(layout.titleCenterY).toBe(111);
  });

  test('fits the 1280x720 desktop viewport inside the bounded column', () => {
    const layout = resolveLegacyAuthScreenLayout(1280, 720);
    assertLayoutInvariants(layout, { height: 720, width: 1280 });
    expect(layout.compact).toBe(false);
    expect(layout.columnWidth).toBe(420);
    expect(layout.centerX).toBe(640);
    expect(layout.dock.top).toBe(720 - 16 - 24 - 52);
  });

  test('keeps the dock above bottom insets and the column inside side insets', () => {
    for (const [width, height, safe] of [
      [390, 844, { bottom: 34, left: 0, right: 0, top: 47 }],
      [844, 390, { bottom: 0, left: 47, right: 47, top: 0 }],
      [1280, 720, { bottom: 0, left: 0, right: 0, top: 24 }]
    ] as const) {
      const layout = resolveLegacyAuthScreenLayout(width, height, safe);
      const bare = resolveLegacyAuthScreenLayout(width, height);
      assertLayoutInvariants(layout, { height, width }, safe);
      expect(layout.dock.top).toBe(bare.dock.top - safe.bottom);
      expect(layout.markerCenterY).toBe(bare.markerCenterY + safe.top);
    }
  });

  test('keeps the marker and title above the body on a small 320x568 phone', () => {
    assertLayoutInvariants(resolveLegacyAuthScreenLayout(320, 568, { bottom: 0, top: 20 }), {
      height: 568,
      width: 320
    }, { bottom: 0, top: 20 });
  });

  test('reports overflow instead of overlapping when the viewport is too short', () => {
    const layout = resolveLegacyAuthScreenLayout(390, 300);
    expect(layout.overflow).toBe(true);
    expect(layout.body.height).toBe(0);
    // The pinned stack stays ordered even then: rail above legal above dock.
    expect(rectBottom(layout.rail.row)).toBeLessThanOrEqual(layout.legal.row.top);
    expect(rectBottom(layout.legal.row)).toBeLessThan(layout.dock.top);
  });

  test('flags short landscape phones with a bottom inset as overflow so the scene can scroll the body', () => {
    expect(resolveLegacyAuthScreenLayout(844, 390).overflow).toBe(false);
    expect(resolveLegacyAuthScreenLayout(844, 390, { bottom: 21, left: 47, right: 47 }).overflow).toBe(true);
  });

  test('is deterministic and tolerates non-finite or negative insets', () => {
    const first = resolveLegacyAuthScreenLayout(390, 844, { bottom: 12.4, top: 3 });
    expect(resolveLegacyAuthScreenLayout(390, 844, { bottom: 12.4, top: 3 })).toEqual(first);
    expect(resolveLegacyAuthScreenLayout(390, 844, { bottom: Number.NaN, left: -5, top: Number.POSITIVE_INFINITY }))
      .toEqual(resolveLegacyAuthScreenLayout(390, 844));
  });
});

describe('legacy auth screen module boundary', () => {
  test('is a pure module with no Phaser, storage, network or timer access', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyAuthScreenView.ts'), 'utf8');
    expect(source).not.toMatch(/from 'phaser'/);
    expect(source).not.toMatch(/\b(?:window|document|localStorage|sessionStorage|fetch|setTimeout|Date\.now)\b/);
  });
});
