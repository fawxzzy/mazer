import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * MAZER-MOTION-002: pins the thin call sites in MenuScene.ts. The scene must only ask for a snapshot cover; it must
 * not delay, re-time or gate the state change itself (taps act immediately), and scripted QA entry points stay
 * deterministic (no cover).
 */
const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n?/g, '\n');

const bodyOf = (signature: string, until: string): string => {
  const start = source.indexOf(signature);
  expect(start, `${signature} exists`).toBeGreaterThan(-1);
  const end = source.indexOf(until, start + signature.length);
  expect(end, `${until} follows ${signature}`).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe('MenuScene uses the eased UI transition at three call sites', () => {
  test('opening an overlay snapshots the old screen first, only when the overlay actually changes', () => {
    const open = bodyOf('private openOverlay(kind: OverlayKind): void {', "if (kind === 'pause') {");
    expect(open).toMatch(/if \(kind !== previousOverlay\) \{\n\s+this\.beginUiTransition\('overlay-open'\);/);
  });

  test('closing an overlay snapshots before any teardown, and only when one is open', () => {
    const close = bodyOf('private closeOverlay(): void {', 'this.orientationFlipOriginLandscape = null;');
    expect(close).toMatch(/if \(this\.overlay !== 'none'\) \{\n\s+this\.beginUiTransition\('overlay-close'\);/);
  });

  test('Start snapshots the menu after the access check and before the play state is installed', () => {
    const start = bodyOf('private startPlayMode(): void {', 'this.resetLegacyPlayInputBuffer();');
    expect(start).toContain('if (!this.hasLegacyPlayAccess()) {');
    expect(start.indexOf('hasLegacyPlayAccess')).toBeLessThan(start.indexOf("beginUiTransition('start')"));
    expect(start).toMatch(/if \(this\.mode === 'menu'\) \{\n\s+this\.beginUiTransition\('start'\);/);
  });

  test('the scene never waits on the transition: begin is fire-and-forget and update only advances the fade', () => {
    const begin = bodyOf('private beginUiTransition(kind: UiTransitionKind): void {', 'private installLegacyQaDiagnosticsSurface');
    expect(begin).not.toMatch(/await|setTimeout|delayedCall|return (?!;)/);
  });

  test('QA entry points change state without the cover so scripted captures stay deterministic', () => {
    const list = source.match(/const QA_STATE_CHANGE_ENTRY_POINTS = \[([^\]]*)\] as const;/)?.[1] ?? '';
    for (const name of ['openSettingsOverlay', 'openOptionsOverlay', 'openPauseOverlay', 'startGuestPlayMode', 'startPlayMode', 'dispatchUiCommand']) {
      expect(list).toContain(`'${name}'`);
    }
    expect(source).toContain('this.withoutUiTransition(() => original(...args))');
  });

  test('the cover is skipped under the frame budget, fed by the scene frame delta', () => {
    expect(source).toContain('this.uiTransitionGhost?.update(time, delta);');
    const ghost = readFileSync(resolve(process.cwd(), 'src/render/uiTransitionGhost.ts'), 'utf8');
    expect(ghost).toContain('shouldSkipUiTransitionForFrameBudget(this.frameAverageMs)');
    expect(ghost).toContain('advanceUiTransitionFrameAverageMs(this.frameAverageMs, deltaMs)');
  });

  test('capture scripts can wait the cover out deterministically through a QA hook', () => {
    expect(source).toContain('isUiTransitionActive: (): boolean => this.uiTransitionGhost?.active === true,');
    const harness = readFileSync(resolve(process.cwd(), 'scripts/analysis/capture-ui-surfaces.mjs'), 'utf8');
    expect(harness).toContain('window.__MAZER_QA__?.isUiTransitionActive?.() !== true');
    const click = harness.slice(harness.indexOf('export const clickPoint'), harness.indexOf('export const openOptionsOverlayViaQa'));
    expect(click).toContain('await page.mouse.click(point.x, point.y);');
    expect(click).toContain('await waitOutUiTransition(page);');
  });

  test('the snapshot is released on scene shutdown', () => {
    expect(source).toMatch(/Phaser\.Scenes\.Events\.SHUTDOWN, \(\) => \{\n\s+this\.uiTransitionGhost\?\.release\(\);/);
  });

  test('the in-game loader is the shared app loader overlay, not a private 420 ms pulse', () => {
    // MAZER-VIS-039 replaced the private diamond pulse with the one app loader (src/render/appLoader.ts).
    expect(source).toContain('new AppLoaderOverlay(this');
    expect(source).not.toContain('Math.sin(time / 420)');
  });
});
