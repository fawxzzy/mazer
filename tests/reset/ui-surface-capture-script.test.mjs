import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  collectMenuControlSpacingIssues,
  evaluateAuthenticatedFixtureReadiness,
  evaluateStandaloneFirstVisibleHomeReadiness,
  hasExpectedTextLabels,
  matchesExpectedTextLabel,
  waitForAuthenticatedFixtureReady
} from '../../scripts/analysis/capture-ui-surfaces.mjs';

const bounds = (left = 0, top = 0, width = 44, height = 44) => ({
  bottom: top + height,
  centerX: left + (width / 2),
  centerY: top + (height / 2),
  height,
  left,
  right: left + width,
  top,
  width
});

const authenticatedMenuDiagnostics = ({ buttons } = {}) => ({
  runtime: { auth: { status: 'authenticated' } },
  visual: {
    buttons: buttons ?? [
      { active: true, bounds: bounds(100, 200, 120, 48), iconOnly: false, semanticAction: 'Start', text: 'Start' },
      { active: true, bounds: bounds(340, 12, 44, 44), iconOnly: true, semanticAction: 'Settings', text: 'Settings' }
    ],
    runtime: { mode: 'menu', overlay: 'none' }
  }
});

describe('UI surface authenticated fixture readiness', () => {
  test('prefers stable semantic actions when visible labels change equivalently', () => {
    const evaluation = evaluateAuthenticatedFixtureReadiness(authenticatedMenuDiagnostics({
      buttons: [
        { active: true, bounds: bounds(100, 200, 120, 48), iconOnly: false, semanticAction: 'Start', text: 'Play maze' },
        { active: true, bounds: bounds(340, 12, 44, 44), iconOnly: true, semanticAction: 'Settings', text: 'Options' }
      ]
    }));

    expect(evaluation.ready).toBe(true);
    expect(evaluation.failedClauses).toEqual([]);
    expect(evaluation.state.buttons.start.text).toBe('Play maze');
    expect(evaluation.state.buttons.settings.text).toBe('Options');
  });

  test('uses exact legacy text only when semantic actions have not been published yet', () => {
    const evaluation = evaluateAuthenticatedFixtureReadiness(authenticatedMenuDiagnostics({
      buttons: [
        { bounds: bounds(100, 200, 120, 48), iconOnly: false, text: 'Start' },
        { bounds: bounds(340, 12, 44, 44), iconOnly: true, text: 'Settings' }
      ]
    }));

    expect(evaluation.ready).toBe(true);
    expect(evaluation.state.buttons.start.activeDeclared).toBe(false);
    expect(evaluation.state.buttons.settings.activeDeclared).toBe(false);
  });

  test('waits through delayed diagnostics publication', async () => {
    const diagnostics = [
      { runtime: null, visual: null },
      {
        runtime: { auth: { status: 'authenticated' } },
        visual: { buttons: [], runtime: { mode: 'menu', overlay: 'none' } }
      },
      authenticatedMenuDiagnostics()
    ];
    let reads = 0;

    const evaluation = await waitForAuthenticatedFixtureReady({}, {
      now: () => 0,
      pollIntervalMs: 0,
      readDiagnosticsFn: async () => diagnostics[Math.min(reads++, diagnostics.length - 1)],
      timeoutMs: 100,
      waitFn: async () => {}
    });

    expect(evaluation.ready).toBe(true);
    expect(reads).toBe(3);
  });

  test('fails with clause-level last-state evidence when a required action is genuinely missing', async () => {
    const missingSettings = authenticatedMenuDiagnostics({
      buttons: [
        { active: true, bounds: bounds(100, 200, 120, 48), iconOnly: false, semanticAction: 'Start', text: 'Play maze' }
      ]
    });

    await expect(waitForAuthenticatedFixtureReady({}, {
      now: () => 0,
      readDiagnosticsFn: async () => missingSettings,
      timeoutMs: 0,
      waitFn: async () => {}
    })).rejects.toMatchObject({
      code: 'AUTHENTICATED_FIXTURE_READINESS_TIMEOUT',
      evidence: {
        failedClauses: ['settingsAction'],
        lastState: {
          authStatus: 'authenticated',
          buttons: {
            settings: {
              active: false,
              geometry: { finite: false },
              semanticAction: null,
              text: null
            }
          },
          mode: 'menu',
          overlay: 'none'
        }
      }
    });
  });
});

describe('UI surface capture label matching', () => {
  test('accepts explicit inline state labels without weakening unrelated label matching', () => {
    expect(matchesExpectedTextLabel('Camera Follow', 'Camera Follow')).toBe(true);
    expect(matchesExpectedTextLabel('Camera Follow: On', 'Camera Follow')).toBe(true);
    expect(matchesExpectedTextLabel('High Contrast: On', 'High Contrast')).toBe(true);
    expect(matchesExpectedTextLabel('Smart Steering: Off', 'Smart Steering')).toBe(true);
    expect(matchesExpectedTextLabel('Control Style: Arrows', 'Control Style')).toBe(true);
    expect(matchesExpectedTextLabel('Camera Follower: On', 'Camera Follow')).toBe(false);
    expect(matchesExpectedTextLabel('Camera Follow: ', 'Camera Follow')).toBe(false);
    expect(matchesExpectedTextLabel('Camera Follow:    ', 'Camera Follow')).toBe(false);
    expect(matchesExpectedTextLabel('Login: Error', 'Login')).toBe(false);
    expect(matchesExpectedTextLabel('Start: Disabled', 'Start')).toBe(false);
    expect(hasExpectedTextLabels(
      ['Camera Follow: On', 'Smart Steering: Off', 'Control Style: Stick'],
      ['Camera Follow', 'Smart Steering', 'Control Style']
    )).toBe(true);
    expect(hasExpectedTextLabels(['High Contrast: On', 'Account'], ['High Contrast', 'Account'])).toBe(true);
    expect(hasExpectedTextLabels(
      ['Camera Follower: On', 'Smart Steering: Off', 'Control Style: Stick'],
      ['Camera Follow', 'Smart Steering', 'Control Style']
    )).toBe(false);
    expect(hasExpectedTextLabels(['Login: Error'], ['Login'])).toBe(false);
    expect(hasExpectedTextLabels(['Start: Disabled'], ['Start'])).toBe(false);
  });
});

describe('UI surface standalone first-visible home readiness', () => {
  const accountSurface = ({
    active = true,
    bounds: accountBounds = bounds(8, 8, 96, 32),
    inputEnabled = true,
    visible = true
  } = {}) => ({
    active,
    bounds: accountBounds,
    inputEnabled,
    visible
  });
  const firstVisibleDiagnostics = ({ buttons, title } = {}) => ({
    runtime: { auth: { status: 'authenticated' } },
    visual: {
      board: { bounds: bounds(24, 160, 342, 520) },
      buttons: buttons ?? [
        { active: true, bounds: bounds(120, 720, 150, 48), iconOnly: false, semanticAction: 'Start', text: 'Start' },
        { active: true, bounds: bounds(342, 16, 44, 44), iconOnly: true, semanticAction: 'Settings', text: 'Settings' },
        { active: true, bounds: bounds(288, 16, 44, 44), iconOnly: true, semanticAction: 'Leaderboard', text: 'Leaderboard' },
        { active: true, bounds: bounds(234, 16, 44, 44), iconOnly: true, semanticAction: 'Account', text: 'Account' }
      ],
      runtime: { mode: 'menu', overlay: 'none' },
      title: title ?? { progressPercent: 100, visible: true }
    }
  });

  test('requires the exact one-step resume revision and every first-frame home surface', () => {
    const evaluation = evaluateStandaloneFirstVisibleHomeReadiness({
      accountSurface: accountSurface(),
      beforeViewportRevision: 7,
      diagnostics: firstVisibleDiagnostics(),
      interactions: [],
      standalone: true,
      viewport: { width: 390, height: 844 },
      viewportRevision: 8
    });

    expect(evaluation.ready).toBe(true);
    expect(evaluation.failedClauses).toEqual([]);
    expect(evaluation.state.actions).toMatchObject({
      account: { active: true },
      leaderboard: { active: true },
      settings: { active: true },
      start: { active: true }
    });
  });

  test('fails closed for a duplicate publication or a missing profile surface', () => {
    const diagnostics = firstVisibleDiagnostics();
    diagnostics.visual.buttons = diagnostics.visual.buttons.filter(
      (button) => button.semanticAction !== 'Account'
    );
    const evaluation = evaluateStandaloneFirstVisibleHomeReadiness({
      accountSurface: accountSurface(),
      beforeViewportRevision: 7,
      diagnostics,
      interactions: [],
      standalone: true,
      viewport: { width: 390, height: 844 },
      viewportRevision: 9
    });

    expect(evaluation.ready).toBe(false);
    expect(evaluation.failedClauses).toEqual(expect.arrayContaining([
      'accountAction',
      'viewportRevisionAdvanced'
    ]));
  });

  test('fails closed for the production-shaped 1x1 account placeholder without active truth', () => {
    const diagnostics = firstVisibleDiagnostics();
    const account = diagnostics.visual.buttons.find(
      (button) => button.semanticAction === 'Account'
    );
    delete account.active;
    account.bounds = bounds(0, 0, 1, 1);
    const evaluation = evaluateStandaloneFirstVisibleHomeReadiness({
      accountSurface: accountSurface({
        active: false,
        bounds: bounds(0, 0, 1, 1),
        inputEnabled: false,
        visible: false
      }),
      beforeViewportRevision: 7,
      diagnostics,
      interactions: [],
      standalone: true,
      viewport: { width: 390, height: 844 },
      viewportRevision: 8
    });

    expect(evaluation.ready).toBe(false);
    expect(evaluation.failedClauses).toContain('accountAction');
    expect(evaluation.state.actions.account).toMatchObject({
      active: true,
      activeDeclared: false,
      geometry: { height: 1, width: 1 }
    });
  });

  test('fails closed when a trusted interaction occurs before the first-visible capture completes', () => {
    const evaluation = evaluateStandaloneFirstVisibleHomeReadiness({
      accountSurface: accountSurface(),
      beforeViewportRevision: 7,
      diagnostics: firstVisibleDiagnostics(),
      interactions: [{ key: null, type: 'pointerdown', x: 195, y: 802 }],
      standalone: true,
      viewport: { width: 390, height: 844 },
      viewportRevision: 8
    });

    expect(evaluation.ready).toBe(false);
    expect(evaluation.failedClauses).toContain('noInteractions');
    expect(evaluation.state.interactions).toHaveLength(1);
  });
});

describe('UI surface capture menu header controls', () => {
  const menuSurface = ({
    playerLevel = null,
    settings = bounds(352, 13, 36, 36)
  } = {}) => ({
    mode: 'menu',
    overlay: 'none',
    progressionBadge: { bounds: playerLevel },
    buttons: [{ bounds: settings, iconOnly: true, text: 'Settings' }]
  });

  test('accepts the standalone settings control when no menu level glyph is rendered', () => {
    expect(collectMenuControlSpacingIssues(menuSurface())).toEqual([]);
  });

  test('rejects a visible player glyph or undersized settings control', () => {
    expect(collectMenuControlSpacingIssues(menuSurface({ playerLevel: bounds(9, 13, 44, 44) })))
      .toContain('menu:player-level-glyph-visible');
    expect(collectMenuControlSpacingIssues(menuSurface({ settings: bounds(350, 15, 30, 30) })))
      .toEqual(expect.arrayContaining([
        'menu:settings-target=30.0x30.0<36'
      ]));
  });
});

describe('UI surface capture script contract', () => {
  test('captures menu, options, play, and pause from runtime diagnostics', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts/analysis/capture-ui-surfaces.mjs'), 'utf8')
      .replace(/\r\n/g, '\n');
    const transitionSource = readFileSync(resolve(process.cwd(), 'scripts/analysis/capture-ui-transitions.mjs'), 'utf8')
      .replace(/\r\n/g, '\n');
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.scripts['visual:ui-surfaces']).toBe('node ./scripts/analysis/capture-ui-surfaces.mjs');
    expect(packageJson.scripts['visual:cyber-arcade-matrix']).toBe('node ./scripts/analysis/capture-cyber-arcade-matrix.mjs');
    expect(packageJson.scripts['visual:cyber-arcade-compare']).toBe('node ./scripts/analysis/build-cyber-arcade-comparison.mjs');
    expect(packageJson.scripts['visual:ui-transitions']).toBe('node ./scripts/analysis/capture-ui-transitions.mjs');
    expect(transitionSource).toContain('skipTopologyDiagnostics: true');
    expect(source).toContain("const RUNTIME_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-runtime-diagnostics';");
    expect(source).toContain("const WRAP_TOPOLOGY_PROGRESSION_STORAGE_KEY = 'mazer.progression.v1:user:runtime-diagnostics-auth-fixture';");
    expect(source).toContain("const VISUAL_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-visual-diagnostics';");
    expect(source).toContain('const DEFAULT_DEVICE_SCALE_FACTOR = 2;');
    expect(source).toContain('export const evaluateStandaloneFirstVisibleHomeReadiness = ({');
    expect(source).toContain('const installStandaloneFirstVisibleHarness = async (page) => {');
    expect(source).toContain("query !== '(display-mode: standalone)'");
    expect(source).toContain('window.__MAZER_SIMULATED_HIDDEN__ = true;');
    expect(source).toContain("document.dispatchEvent(new Event('visibilitychange'));");
    expect(source).toContain("id: '01-standalone-first-visible-home'");
    expect(source).toContain("window.addEventListener('pointerdown', recordInteraction, true);");
    expect(source).toContain("window.addEventListener('keydown', recordInteraction, true);");
    expect(source).toContain('interactionTransitions: readiness.state.interactions');
    expect(source).toContain("firstVisibleHomeOnly: args['first-visible-home'] === true || args['first-visible-home'] === 'true'");
    expect(source).toContain('const gameScale = window.__MAZER_GAME__?.scale;');
    expect(source).toContain('gameScale?.width === width');
    expect(source).toContain('gameScale?.height === height');
    expect(source).toContain('const mobileViewport = viewport.width < 720;');
    expect(source).toContain('hasTouch: transition ? false : mobileViewport');
    expect(source).toContain('isMobile: transition ? false : mobileViewport');
    expect(source).toContain("assertVisualScreenContract(screenContract);");
    expect(source).toContain('buildVisualScreenContract({');
    expect(source).toContain('const waitForVisualBuildSettled = async (page, { requireReadableTitle = false, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {');
    expect(source).toContain('requireReadableTitle = false');
    expect(source).toContain('visual?.title?.visible === true && visual?.title?.progressPercent >= 95');
    expect(source).toContain("drawStage?.complete === true || drawStage?.lifecyclePhase === 'settled'");
    expect(source).toContain("visual?.runtime?.playLifecycle?.inputLocked === false");
    expect(source).toContain('export const evaluateAuthenticatedFixtureReadiness = ({ runtime = null, visual = null } = {}) => {');
    expect(source).toContain('export const waitForAuthenticatedFixtureReady = async (page, {');
    expect(source).toContain("button?.semanticAction === semanticAction");
    expect(source).toContain("error.code = 'AUTHENTICATED_FIXTURE_READINESS_TIMEOUT';");
    expect(source).toContain('const playGeometrySettled = !requireSettledPlayGeometry');
    expect(source).toContain('Number.isFinite(board?.left)');
    expect(source).toContain('Number.isFinite(board?.top)');
    expect(source).toContain('Number.isFinite(board?.right)');
    expect(source).toContain('Number.isFinite(board?.bottom)');
    expect(source).toContain("findAuthenticatedFixtureAction(buttons, 'Settings', 'Settings')");
    expect(source).toContain("if (authFixture === 'authenticated') {");
    expect(source).toContain('await waitForAuthenticatedFixtureReady(page, { timeoutMs });');
    expect(source).toContain('expectedOverlay: overlay');
    expect(source).toContain("visual?.runtime?.mode === expectedMode\n          && visual?.runtime?.overlay === expectedOverlay");
    expect(source).toContain('screenContract: optionsSurface.screenContract');
    expect(source).toContain('const resolveRouteWithParams = (route, params) => {');
    expect(source).toContain('const isAuthGatedMenuSurface = (surface) => (');
    expect(source).toContain("hasVisualButton(surface, 'Login')");
    expect(source).toContain("const hasVisualButton = (surface, text, { iconOnly = null } = {}) => (");
    expect(source).toContain('const OPTIONS_BASE_EXPECTED_LABELS = Object.freeze([');
    expect(source).toContain('export const matchesExpectedTextLabel = (actualLabel, expectedLabel) => (');
    expect(source).toContain('export const hasExpectedTextLabels = (actualLabels, expectedLabels) => (');
    expect(source).toContain('const INLINE_STATE_TEXT_LABELS = Object.freeze([');
    expect(source).toContain('allowStateSuffix: INLINE_STATE_TEXT_LABELS.includes(expectedLabel)');
    expect(source).toContain('expected: expectedLabelDescriptors');
    expect(source).toContain('return hasExpectedTextLabels(labels, expectedLabels);');
    expect(source).toContain("actualLabel.startsWith(`${expectedLabel}: `)");
    expect(source).toContain('actualLabel.slice(expectedLabel.length + 2).trim().length > 0');
    expect(source).toContain('const OPTIONS_BOTTOM_EXPECTED_LABELS = Object.freeze([');
    expect(source).toContain("'Account'");
    expect(source).not.toContain("authenticated ? 'Log out' : 'Account'");
    expect(source).not.toContain("surfaces.menu.authStatus === 'authenticated' || hasTextLabels(surfaces.options, ['Log out'])");
    expect(source).toContain('hasLabels(surfaces.optionsBottom, optionsBottomExpectedLabels)');
    expect(source).toContain("collectOverlayScrollBottomIssues('options-bottom', surfaces.optionsBottom, optionsBottomExpectedLabels)");
    expect(source).toContain('const getVisualButtonPoint = (visual, text) => {');
    expect(source).toContain("const button = (visual?.buttons ?? []).find((entry) => entry?.text === text && isFiniteBounds(entry?.bounds));");
    expect(source).toContain("login: getVisualButtonPoint(visual, 'Login') ?? {");
    expect(source).toContain("start: getVisualButtonPoint(visual, 'Start') ?? {");
    expect(source).toContain("options: getVisualButtonPoint(visual, 'Settings') ?? {");
    expect(source).toContain("hasVisualButton(surfaces.menu, 'Settings', { iconOnly: true })");
    expect(source).toContain('const openOptionsOverlayViaQa = async (page, timeoutMs) => {');
    expect(source).toContain('window.__MAZER_QA__?.openSettingsOverlay');
    expect(source).toContain('api.openSettingsOverlay()');
    expect(source).toContain('Unable to open Settings through QA bridge');
    expect(source).toContain('const PLAY_TRAIL_SEED_MOVES = Object.freeze([');
    expect(source).toContain('const seedPlayTrailForVisualProof = async (');
    expect(source).toContain('{ expectTrailShineEnabled = true, timeoutMs = DEFAULT_TIMEOUT_MS } = {}');
    expect(source).toContain('window.__MAZER_QA__?.movePlayPlayer');
    expect(source).toContain('visual?.markerStyle?.trailShineEnabled === expected');
    expect(source).toContain("const trailShineChecks = ['menu', 'play'].map((id) => createCheck(");
    expect(source).toContain('`${id}-trail-shine-white`');
    expect(source).toContain('EXPECTED_TRAIL_SHINE_COLOR = 0xf1faf6');
    expect(source).toContain('EXPECTED_TRAIL_SHINE_EDGE_COLOR = 0xe9fff1');
    expect(source).toContain('Unable to seed play trail for visual proof');
    expect(source).toContain("id: '01-menu'");
    expect(source).toContain("id: '02-auth'");
    expect(source).toContain("id: '02-options'");
    expect(source).toContain("id: '02-options-bottom'");
    expect(source).toContain("id: '03-play'");
    expect(source).toContain("id: '04-pause'");
    expect(source).toContain("id: '04-pause-bottom'");
    expect(source).toContain("mode: 'menu'");
    expect(source).toContain("mode: 'play'");
    expect(source).toContain("overlay: 'none'");
    expect(source).toContain("overlay: 'options'");
    expect(source).toContain("overlay: 'auth'");
    expect(source).toContain("overlay: 'pause'");
    expect(source).toContain('expectedLabels: []');
    expect(source).toContain("hasLabels(surfaces.menu, ['Login']) && hasVisualButton(surfaces.menu, 'Settings', { iconOnly: true })");
    expect(source).toContain('const closeOverlayToMenu = async (page, timeoutMs) => {');
    expect(source).toContain("await clickPoint(page, {\n    x: Math.round(bounds.centerX),\n    y: Math.round(bounds.centerY)\n  }, 'Back');");
    expect(source).toContain("const pathStyleSurfaceIds = ['menu', 'options', 'play', 'pause'];");
    expect(source).toContain("resolveRouteWithParams(route, { authFixture: 'authenticated' })");
    expect(source).toContain('const openPauseOverlayViaQa = async (page, timeoutMs) => {');
    expect(source).toContain('await openPauseOverlayViaQa(page, timeoutMs);');
    expect(source).toContain('const playTrailSeed = options.skipPlayTrailSeed');
    expect(source).toContain('expectTrailShineEnabled: !options.reducedMotion');
    expect(source).toContain("reason: 'focused-topology-proof'");
    expect(source).toContain("const seedTopologyFixture = async (page, fixture) => {");
    expect(source).toContain("fixture !== 'wrap-enabled'");
    expect(source).toContain('markerStyle: menu.diagnostics.visual?.markerStyle');
    expect(source).toContain('hud: play.diagnostics.visual?.hud');
    expect(source).toContain('expectedLabels: []');
    expect(source).toContain("? []\n        : ['GUIDE', 'Board Zoom', 'Trail Fade', 'Trail Shine', 'Animated Background']");
    expect(source).toContain("url.searchParams.set('mazeSeed', mazeSeed);");
    expect(source).toContain("url.searchParams.set('authFixture', authFixture);");
    expect(source).not.toContain("url.searchParams.set('pathStyle', pathStyle);");
    expect(source).toContain('expected=corridor');
    expect(source).toContain('const checks = buildSurfaceChecks({');
    expect(source).toContain('requirePlayTrailSeed: !options.skipPlayTrailSeed');
    expect(source).toContain("requireWrapPairs: topologyFixture === 'wrap-enabled'");
    expect(source).toContain('requirePlayTrailSeed = true');
    expect(source).toContain('requireTopologyDiagnostics = true');
    expect(source).toContain('reducedMotion = false');
    expect(source).toContain("'reduced-motion-rendering'");
    expect(source).toContain("'skipped for focused material and layout proof'");
    expect(source).toContain('const isIgnorableConsoleMessage = (message) => (');
    expect(source).toContain("message.text.includes('WebGL: CONTEXT_LOST_WEBGL')");
    expect(source).toContain("createCheck(\n      'play-player-green'");
    expect(source).toContain("createCheck(\n      'play-goal-red'");
    expect(source).toContain("createCheck(\n      'play-stick-controls'");
    expect(source).toContain("createCheck(\n      'play-trail-shine-seeded-on'");
    expect(source).toContain('...trailShineChecks');
    expect(source).toContain('deviceScaleFactor,');
    expect(source).toContain('authFixture: authFixture ?? null');
    expect(source).toContain('playTrailSeed,');
    expect(source).toContain('topologyFixture: topologyFixture ?? null');
    expect(source).toContain("`- Topology fixture: ${summary.topologyFixture ?? 'none'}`");
    expect(source).toContain("createCheck(\n      'menu-text-labels'");
    expect(source).toContain("createCheck(\n      'menu-title-readable'");
    expect(source).toContain("createCheck(\n      'auth-surface'");
    expect(source).toContain("createCheck(\n      'auth-text-labels'");
    expect(source).toContain('const AUTH_EXPECTED_LABELS = Object.freeze([');
    expect(source).not.toContain("'Play as guest'");
    expect(source).toContain("'EMAIL'");
    expect(source).toContain("'PASSWORD'");
    expect(source).toContain('hasLabels(surfaces.auth, AUTH_EXPECTED_LABELS)');
    expect(source).toContain('const collectTextBoundsIssues = (surfaceId, surface, viewport) => {');
    expect(source).toContain('const collectNativeInputBoundsIssues = (surfaceId, surface, viewport) => {');
    expect(source).toContain('const collectTextOverlapIssues = (surfaceId, surface) => {');
    expect(source).toContain('export const collectMenuControlSpacingIssues = (surface) => {');
    expect(source).toContain('const collectProgressionBadgeGeometryIssues = (surfaceId, surface, viewport) => {');
    expect(source).toContain("issues.push('menu:player-level-glyph-visible');");
    expect(source).not.toContain('menu:ai-level-settings-size-mismatch=');
    expect(source).not.toContain('menu:ai-level-settings-top-mismatch=');
    expect(source).not.toContain("issues.push('menu:missing-ai-level-glyph');");
    expect(source).not.toContain('menu:ai-level-to-settings-gap=');
    expect(source).toContain("surface?.mode !== 'play'");
    expect(source).toContain('badge.width > board.width + 1');
    expect(source).not.toContain('progression-badge-not-above-play-board');
    expect(source).not.toContain('progression-badge-not-above-menu-board');
    expect(source).toContain('progression-badge-to-pause-gap=');
    expect(source).toContain("'progression-badge-geometry'");
    expect(source).toContain("createCheck(\n      'mobile-text-label-bounds'");
    expect(source).toContain("createCheck(\n      'mobile-native-input-bounds'");
    expect(source).toContain("createCheck(\n      'mobile-text-overlap'");
    expect(source).toContain("createCheck(\n      'mobile-control-spacing'");
    expect(source).toContain("createCheck(\n      'mobile-badge-text-fit'");
    expect(source).toContain('const collectOverlayScrollAffordanceIssues = (surfaceId, surface) => {');
    expect(source).toContain('const collectOverlayScrollCueTextIssues = (surfaceId, surface) => {');
    expect(source).toContain('text-crosses-scroll-edge-cue');
    expect(source).toContain("'overlay-scroll-edge-cue-text-clearance'");
    expect(source).not.toContain('text-under-bottom-fade');
    expect(source).toContain('const requiredRects = scroll.enabled === true');
    expect(source).toContain("if (scroll.enabled !== true) {");
    expect(source).toContain('const collectButtonLabelContainmentIssues = (surfaceId, surface) =>');
    expect(source).toContain('const collectButtonLabelFillIssues = (surfaceId, surface) =>');
    expect(source).toContain('progressionBadge fontSize=');
    expect(source).not.toContain('pause-height=');
    expect(source).toContain('const collectGuideTextContainmentIssues = (surfaceId, surface) => {');
    expect(source).toContain('const collectWrapTopologyDiagnosticIssues = (surfaceId, surface, { requirePairs = false } = {}) => {');
    expect(source).toContain('const collectCyberArcadeMaterialIssues = (surfaceId, surface) => {');
    expect(source).toContain('material.geometry?.textTextureResolution !== 1');
    expect(source).toContain("material.geometry?.textTransformOwner !== 'game-canvas-only'");
    expect(source).toContain("'cyber-arcade-material-system'");
    expect(source).toContain('materialSystem: menu.diagnostics.visual?.materialSystem');
    expect(source).toContain("createCheck(\n      'mobile-overlay-scroll-affordance'");
    expect(source).toContain("createCheck(\n      'mobile-overlay-scroll-reachability'");
    expect(source).toContain("createCheck(\n      'button-label-containment'");
    expect(source).toContain("createCheck(\n      'button-label-fill'");
    expect(source).toContain("createCheck(\n      'guide-text-containment'");
    expect(source).toContain("createCheck(\n      'wrap-topology-diagnostics'");
    expect(source).toContain('const scrollOverlayToBottom = async (page, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {');
    expect(source).toContain('const desktopViewport = (before.visual?.viewport?.width ?? 0) >= 720;');
    expect(source).toContain('const wheelDelta = Math.max(scroll.maxOffset * 4, dragDistance);');
    expect(source).toContain('await page.mouse.wheel(0, wheelDelta);');
    expect(source).toContain('expectedLabels: optionsBottomExpectedLabels');
    expect(source).toContain("collectOverlayScrollBottomIssues('pause-bottom', surfaces.pauseBottom, [])");
    expect(source).toContain('optionsSurface.diagnostics.visual?.overlayUi');
    expect(source).toContain('pause.diagnostics.visual?.overlayUi');
    expect(source).toContain("nativeInputs: authSurface.nativeInputs");
    expect(source).toContain('progressionBadge: menu.diagnostics.visual?.progressionBadge');
    expect(source).toContain('menuAiProgressionBadge: menu.diagnostics.visual?.menuAiProgressionBadge');
    expect(source).toContain('title: menu.diagnostics.visual?.title');
    expect(source).toContain('generation: menu.diagnostics.runtime?.generation');
    expect(source).toContain('progressionBadge: authSurface.diagnostics.visual?.progressionBadge');
    expect(source).toContain('progressionBadge: play.diagnostics.visual?.progressionBadge');
    expect(source).toContain('generation: play.diagnostics.runtime?.generation');
    expect(source).toContain('all active text labels stay inside viewport');
    expect(source).toContain('the active-play level glyph fits its chrome');
    expect(source).toContain("deviceScaleFactor: parseIntegerArg(args['device-scale-factor'], DEFAULT_DEVICE_SCALE_FACTOR)");
    expect(source).toContain("reducedMotion: args['reduced-motion'] === true || args['reduced-motion'] === 'true'");
    expect(source).toContain("reducedMotion: options.reducedMotion ? 'reduce' : 'no-preference'");
    expect(source).toContain("skipPlayTrailSeed: args['skip-play-trail-seed'] === true || args['skip-play-trail-seed'] === 'true'");
    expect(source).toContain("topologyFixture: typeof args['topology-fixture'] === 'string' ? args['topology-fixture'] : undefined");
    expect(source).toContain("authFixture: typeof args['auth-fixture'] === 'string' ? args['auth-fixture'] : undefined");
    expect(source).toContain("authFixture: result.authFixture");
    expect(source).toContain("preferenceFixture: typeof args['preference-fixture'] === 'string' ? args['preference-fixture'] : undefined");
    expect(source).toContain("if (preferenceFixture !== 'fresh') {");
    expect(source).toContain("'fresh-session-defaults'");
    expect(source).toContain('hasLabelsAcross(');
    expect(source).toContain("'Full maze view.'");
    expect(source).toContain("'Trail stays.'");
    expect(source).toContain("'Slow white shine.'");
    expect(source).toContain("'Shifts 1 tile at walls.'");
    expect(source).toContain('preferenceFixture: result.preferenceFixture');
    expect(source).toContain('window.requestAnimationFrame(() => {');
    expect(source).toContain('window.requestAnimationFrame(resolvePaint);');
    expect(source).toContain('const exerciseReducedMotionPreferenceChange = async (page, timeoutMs) => {');
    expect(source).toContain("await page.emulateMedia({ reducedMotion: 'reduce' });");
    expect(source).toContain("await page.emulateMedia({ reducedMotion: 'no-preference' });");
    expect(source).toContain("'reduced-motion-preference-change'");
    expect(source).toContain('reducedMotionToggle.initial === false');
    expect(source).toContain('// Restoring the operating-system motion preference redraws the canvas UI.');
    expect(source).toContain("const startsAtAuthOverlay = initialDiagnostics.visual?.runtime?.mode === 'menu'");
    expect(source).toContain("authenticatedUrl.searchParams.set('runtimeDiagnostics', '1');");
    expect(source).toContain("authenticatedUrl.searchParams.set('authFixture', 'authenticated');");
    expect(source).not.toContain('window.__MAZER_QA__?.startGuestPlayMode?.() ?? null');
    expect(source).not.toContain('Guest visual fixture action rejected');
    expect(source).toContain('surfaces.auth.captured === true');
    expect(source).toContain('const menu = await captureSurface({');
    expect(source).toContain("resolveRouteWithParams(route, { authFixture: 'authenticated' })");
    expect(source).not.toContain("expectedLabels: ['Exit', 'Start', 'Options']");
    expect(source).toContain("hasVisualButton(surfaces.menu, 'Start') && hasVisualButton(surfaces.menu, 'Settings', { iconOnly: true })");
    expect(source).toContain("surfaces.options.mode === 'menu' && surfaces.options.overlay === 'options'");
    expect(source).toContain('const optionsCaptureExpectedLabels = [...OPTIONS_BASE_EXPECTED_LABELS];');
    expect(source).toContain('expectedLabels: optionsBottomExpectedLabels');
    expect(source).toContain('skipWait = false');
    expect(source).toContain('skipWait ? await readDiagnostics(page)');
    expect(source).toContain('return expected.every(({ allowStateSuffix, expectedLabel }) => labels.some((actualLabel) => (');
    expect(source).not.toContain('Surface ${id} missing labels after direct diagnostics read');
    expect(source).toContain('const diagnostics = skipWait ? await readDiagnostics(page) : await waitForSurface(page, {');
    expect(source).toContain('await openOptionsOverlayViaQa(page, timeoutMs);');
    expect(source).toContain("skipWait: authFixture === 'authenticated' || startsAtAuthOverlay");
    expect(source).toContain('expectedLabels: optionsCaptureExpectedLabels');
    expect(source).toContain('hasLabels(surfaces.options, OPTIONS_BASE_EXPECTED_LABELS)');
    expect(source).toContain("!hasLabels(surfaces.options, ['Game Toggles', 'Maze Scale', 'Camera Scale'])");
    expect(source).toContain("'play-settings-cog'");
    expect(source).toContain("!hasLabels(surfaces.play, ['PAUSE', 'RESET'])");
    expect(source).toContain("hasLabels(surfaces.pause, ['GUIDE', 'Board Zoom', 'Trail Fade', 'Trail Shine', 'Animated Background'])");
    expect(source).toContain("!hasLabels(surfaces.pause, ['Game Toggles', 'Resume'])");
    expect(source).toContain('const reportPath = resolve(outputDir, \'report.md\');');
    expect(source).toContain('![Menu](${summary.screenshots.menu})');
    expect(source).toContain('![Auth](${summary.screenshots.auth})');
    expect(source).toContain('const DEFAULT_TRANSITION_VIEWPORTS = Object.freeze({');
    expect(source).toContain('const captureViewportTransition = async ({');
    expect(source).toContain("if (overlay === 'none') {");
    expect(source).toContain('const stableBoardDiagnostics = (board) => board ? {');
    expect(source).toContain('await page.setViewportSize(viewport);');
    expect(source).toContain('restoredDiagnosticsMatch: JSON.stringify(initial.diagnostics) === JSON.stringify(restored.diagnostics)');
    expect(source).toContain('nativeInputs: surface.nativeInputs');
    expect(source).toContain('const buildViewportTransitionChecks = (transitions) =>');
    expect(source).toContain('checks.push(...buildViewportTransitionChecks(transitions));');
  });
});
