/**
 * Wave 4E World Identity: retained real-browser evidence for the level-
 * number reveal fix and the Account/Home icon-ring consistency candidate
 * (PR #358), plus a bounded real-UI-command transition clip and a
 * dedicated menu-demo trail-order clip. Committed (not a scratch script)
 * per review 5206770593's own explicit request that the underlying pixels
 * and traces be retained for independent review, not just narrated in
 * docs/current-truth.md.
 *
 * Same "one real clock, no game.loop.step()" convention as
 * capture-gameplay-transfer-evidence.mjs and the same real-solver
 * (window.__MAZER_QA__.resolveShortestPathToGoal()) movement-driving
 * technique -- see that file's own header for the full rationale. Every
 * clip/screenshot here is labelled by exactly what it is: real organic
 * gameplay, or a clearly-marked direct-state fixture (only the multi-digit
 * level-number check, which needs a level no real fresh account has yet).
 *
 * Produces, under --out-dir (default tmp/world-identity-ui-evidence):
 *  - mazer-world-identity-level-number-sequence.webm + three screenshots
 *    (mid-build, full-reveal-hold, cleared) from one real Play entry.
 *  - mazer-world-identity-level-number-multidigit-FIXTURE.png -- a direct
 *    state fixture (level forced to 42, the real draw call invoked with
 *    the game loop frozen for the shot) proving the shared glyph renderer
 *    handles multiple digits; NOT organic gameplay, labelled as such.
 *  - mazer-world-identity-icon-{menu,options,pause}.png -- native-size,
 *    full-viewport screenshots for a direct Account/Home icon comparison
 *    across the three surfaces.
 *  - mazer-world-identity-transition.webm -- one continuous real-time
 *    recording: Menu -> Options -> back -> Play -> real solver-driven
 *    movement (straight + a turn, so a real mid-glide moment is inside
 *    the recording, not a separate staged shot) -> Pause -> Return Home.
 *  - mazer-world-identity-menu-demo-trail.webm -- the menu's own ambient
 *    demo-AI trail during its real autonomous movement, captured
 *    separately from Active Play (the two use different trail renderers --
 *    see MenuScene.ts's own mode branch in the trail draw path).
 *  - diagnostics.json -- real state samples (mode/overlay/reveal/alpha/
 *    icon visibility/position) captured at the same instants as the
 *    screenshots above, never read at a different moment than its paired
 *    shot.
 *  - manifest.json -- build identity (git HEAD), base URL, and a
 *    SHA-256 for every file this run produced.
 *
 * Usage: node scripts/analysis/capture-world-identity-ui-evidence.mjs [--out-dir=<dir>] [--no-preview] [--skip-build]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  DEFAULT_BASE_URL,
  DEFAULT_PREVIEW_TIMEOUT_MS,
  REPO_ROOT,
  normalizeBaseUrl,
  parseCliArgs
} from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';

const runBuild = () => {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], { cwd: REPO_ROOT, stdio: 'inherit' });
    return;
  }
  execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
};

const resolveGitHead = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
  } catch {
    return null;
  }
};

const isDirtyWorktree = () => {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT }).toString().trim().length > 0;
  } catch {
    return null;
  }
};

// Same wrap-aware sign inference as capture-gameplay-transfer-evidence.mjs's
// own directionForStep -- mirrored exactly, not reinvented.
const directionForStep = (from, to) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
    if (dx === 1) return 'move_right';
    if (dx === -1) return 'move_left';
    if (dy === 1) return 'move_down';
    if (dy === -1) return 'move_up';
    return null;
  }
  if (Math.abs(dx) > 1) {
    return dx > 0 ? 'move_left' : 'move_right';
  }
  return dy > 0 ? 'move_up' : 'move_down';
};

const waitForCondition = async (page, fn, timeoutMs = 20000, pollMs = 100) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.evaluate(fn)) return true;
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(pollMs);
  }
  return false;
};

const readLevelAnnouncerState = (page) => page.evaluate(() => {
  const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const visual = s.resolveLegacyLevelAnnouncerVisualState(s.time.now);
  return {
    t: Math.round(s.time.now),
    phase: s.menuStaticDrawLifecyclePhase,
    alpha: Number(visual.alpha.toFixed(3)),
    revealProgress: Number(visual.revealProgress.toFixed(3)),
    numberVisible: s.levelAnnouncerNumberGraphics.visible,
    level: s.progressionState.tracks[s.resolveActiveLegacyProgressionTrackId()].level
  };
});

const readIconState = (page) => page.evaluate(() => {
  const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const iconState = (img) => (img ? { visible: img.visible, x: Math.round(img.x), y: Math.round(img.y), alpha: Number(img.alpha.toFixed(2)) } : null);
  return {
    mode: s.mode,
    overlay: s.overlay,
    headerSettingsIcon: iconState(s.headerSettingsIconImage),
    touchSettingsCogIcon: iconState(s.touchSettingsCogIconImage),
    headerLeaderboardIcon: iconState(s.headerLeaderboardIconImage),
    uiButtonCount: (s.uiButtons || []).length,
    uiButtonTexts: (s.uiButtons || []).map((b) => b.semanticAction || b.text)
  };
});

const sha256OfFile = (filePath) => createHash('sha256').update(readFileSync(filePath)).digest('hex');

const main = async () => {
  const args = parseCliArgs();
  const baseUrl = normalizeBaseUrl(typeof args.baseUrl === 'string' ? args.baseUrl : DEFAULT_BASE_URL);
  const isTruthyArg = (value) => value === true || value === 'true' || value === '1';
  const useExistingServer = isTruthyArg(args.noPreview ?? args['no-preview']);
  const skipBuild = isTruthyArg(args.skipBuild ?? args['skip-build']);
  const outDir = typeof args['out-dir'] === 'string' ? args['out-dir'] : path.resolve(REPO_ROOT, 'tmp', 'world-identity-ui-evidence');
  mkdirSync(outDir, { recursive: true });

  if (!useExistingServer && !skipBuild) {
    runBuild();
  }

  const preview = useExistingServer
    ? null
    : await launchPreviewServer({ requestedBaseUrl: baseUrl, previewTimeoutMs: DEFAULT_PREVIEW_TIMEOUT_MS });
  const resolvedBaseUrl = preview?.baseUrl ?? baseUrl;

  const browser = await chromium.launch({ headless: true });
  const diagnostics = { levelNumberSequence: [], levelNumberMultidigit: null, transition: [], menuDemoTrail: [] };

  try {
    // ============================================================
    // 1. Level number: real single-digit full sequence.
    // ============================================================
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: outDir, size: { width: 1280, height: 800 } } });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await waitForCondition(page, () => {
        const g = window.__MAZER_GAME__;
        const s = g && g.scene.getScene('MenuScene');
        return !!s && s.overlay === 'none' && s.menuStaticDrawLifecyclePhase === 'settled';
      });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());

      let capturedMidBuild = false;
      let capturedFullReveal = false;
      let capturedCleared = false;
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline && !(capturedMidBuild && capturedFullReveal && capturedCleared)) {
        // eslint-disable-next-line no-await-in-loop
        const state = await readLevelAnnouncerState(page);
        diagnostics.levelNumberSequence.push(state);
        if (!capturedMidBuild && state.revealProgress > 0.15 && state.revealProgress < 0.85) {
          // eslint-disable-next-line no-await-in-loop
          await page.screenshot({ path: path.join(outDir, 'mazer-world-identity-level-number-mid-build.png') });
          capturedMidBuild = true;
          diagnostics.levelNumberSequence.push({ ...state, capturedAs: 'mid-build' });
        } else if (!capturedFullReveal && capturedMidBuild && state.revealProgress >= 1 && state.alpha > 0.9) {
          // eslint-disable-next-line no-await-in-loop
          await page.screenshot({ path: path.join(outDir, 'mazer-world-identity-level-number-full-reveal-hold.png') });
          capturedFullReveal = true;
          diagnostics.levelNumberSequence.push({ ...state, capturedAs: 'full-reveal-hold' });
        } else if (!capturedCleared && capturedFullReveal && state.numberVisible === false) {
          // eslint-disable-next-line no-await-in-loop
          await page.screenshot({ path: path.join(outDir, 'mazer-world-identity-level-number-cleared.png') });
          capturedCleared = true;
          diagnostics.levelNumberSequence.push({ ...state, capturedAs: 'cleared' });
        }
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(60);
      }
      diagnostics.levelNumberSequenceSummary = { capturedMidBuild, capturedFullReveal, capturedCleared };

      const video = page.video();
      await context.close();
      if (video) {
        const videoPath = await video.path();
        copyFileSync(videoPath, path.join(outDir, 'mazer-world-identity-level-number-sequence.webm'));
        unlinkSync(videoPath);
      }
    }

    // ============================================================
    // 2. Level number: multi-digit DIRECT FIXTURE (not organic play).
    // ============================================================
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await waitForCondition(page, () => {
        const g = window.__MAZER_GAME__;
        const s = g && g.scene.getScene('MenuScene');
        return !!s && s.overlay === 'none' && s.menuStaticDrawLifecyclePhase === 'settled';
      });
      // A single forced-then-frozen frame races the real, still-running
      // update loop (confirmed: an earlier attempt intermittently lost the
      // override to a real frame that ran between the eval call and the
      // screenshot, showing a settled ordinary menu instead). Instead,
      // pin the fixture state on EVERY real tick for a real window of time
      // via a page-side interval -- the real loop keeps running (so Phaser
      // actually renders the Graphics draw calls, which a frozen loop
      // never would), but each tick re-asserts level=42 and a build phase
      // elapsed far enough in to sit solidly in the post-reveal hold
      // plateau (per the real single-digit trace above, reveal reaches 1
      // around ~1.1s of elapsed build time and holds until ~2.1s) rather
      // than resetting progress to 0 each tick.
      await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        const trackId = scene.resolveActiveLegacyProgressionTrackId();
        window.__worldIdentityFixtureInterval = setInterval(() => {
          const now = scene.time.now;
          scene.progressionState.tracks[trackId].level = 42;
          scene.menuStaticDrawLifecyclePhase = 'building';
          scene.menuStaticBuildPhaseStartedAtMs = now - 1500;
          scene.levelAnnouncerBuildFadeOutArmed = false;
        }, 16);
      });
      await page.waitForTimeout(400);
      const state = await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        const trackId = scene.resolveActiveLegacyProgressionTrackId();
        const visual = scene.resolveLegacyLevelAnnouncerVisualState(scene.time.now);
        return {
          alpha: Number(visual.alpha.toFixed(3)),
          revealProgress: Number(visual.revealProgress.toFixed(3)),
          visible: scene.levelAnnouncerNumberGraphics.visible,
          level: scene.progressionState.tracks[trackId].level,
          isDirectFixture: true
        };
      });
      await page.screenshot({ path: path.join(outDir, 'mazer-world-identity-level-number-multidigit-FIXTURE.png') });
      await page.evaluate(() => clearInterval(window.__worldIdentityFixtureInterval));
      diagnostics.levelNumberMultidigit = state;
      await context.close();
    }

    // ============================================================
    // 3. Icon comparison, native size, three surfaces.
    // ============================================================
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await waitForCondition(page, () => {
        const g = window.__MAZER_GAME__;
        const s = g && g.scene.getScene('MenuScene');
        return !!s && s.overlay === 'none' && s.menuStaticDrawLifecyclePhase === 'settled';
      });
      await page.screenshot({ path: path.join(outDir, 'mazer-world-identity-icon-menu.png') });

      await page.evaluate(() => window.__MAZER_QA__.openOptionsOverlay());
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, 'mazer-world-identity-icon-options.png') });

      await page.evaluate(() => { window.__MAZER_GAME__.scene.getScene('MenuScene').overlay = 'none'; });
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await waitForCondition(page, () => {
        const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
        return s.menuStaticDrawLifecyclePhase === 'settled' && s.isLegacyPlayLifecycleInputLocked() === false;
      }, 25000);
      await page.evaluate(() => window.__MAZER_QA__.openPauseOverlay());
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, 'mazer-world-identity-icon-pause.png') });
      await context.close();
    }

    // ============================================================
    // 4. Bounded transition, one continuous real-time recording,
    //    including a real mid-glide movement moment inside the video.
    // ============================================================
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: outDir, size: { width: 1280, height: 800 } } });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await waitForCondition(page, () => {
        const g = window.__MAZER_GAME__;
        const s = g && g.scene.getScene('MenuScene');
        return !!s && s.overlay === 'none' && s.menuStaticDrawLifecyclePhase === 'settled';
      });
      diagnostics.transition.push({ label: 'menu', ...(await readIconState(page)) });

      await page.evaluate(() => window.__MAZER_QA__.openOptionsOverlay());
      await page.waitForTimeout(400);
      diagnostics.transition.push({ label: 'options-open', ...(await readIconState(page)) });

      await page.evaluate(() => { window.__MAZER_GAME__.scene.getScene('MenuScene').overlay = 'none'; });
      await page.waitForTimeout(400);
      diagnostics.transition.push({ label: 'options-closed', ...(await readIconState(page)) });

      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await waitForCondition(page, () => {
        const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
        return s.menuStaticDrawLifecyclePhase === 'settled' && s.isLegacyPlayLifecycleInputLocked() === false;
      }, 25000);
      diagnostics.transition.push({ label: 'play-settled', ...(await readIconState(page)) });

      const route = await page.evaluate(() => window.__MAZER_QA__.resolveShortestPathToGoal());
      let lastDir = null;
      if (route?.found && Array.isArray(route.path)) {
        for (let i = 1; i < route.path.length && i <= 9; i += 1) {
          const dir = directionForStep(route.path[i - 1], route.path[i]);
          if (!dir) continue;
          // eslint-disable-next-line no-await-in-loop
          const result = await page.evaluate((d) => window.__MAZER_QA__.movePlayPlayer(d), dir);
          const isTurn = lastDir !== null && lastDir !== dir;
          lastDir = dir;
          // Real wait -- this is the video's own mid-glide moment, captured
          // by the recording simply being active through it, not staged.
          // eslint-disable-next-line no-await-in-loop
          await page.waitForTimeout(120);
          diagnostics.transition.push({ label: `move-${dir}`, isTurn, accepted: result.accepted, ...(await readIconState(page)) });
        }
      }

      await page.evaluate(() => window.__MAZER_QA__.openPauseOverlay());
      await page.waitForTimeout(400);
      diagnostics.transition.push({ label: 'pause-open', ...(await readIconState(page)) });

      await page.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'RETURN_HOME' }));
      await waitForCondition(page, () => {
        const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
        return s.mode === 'menu' && s.overlay === 'none';
      }, 10000);
      await page.waitForTimeout(1000);
      diagnostics.transition.push({ label: 'home-settled', ...(await readIconState(page)) });

      const video = page.video();
      await context.close();
      if (video) {
        const videoPath = await video.path();
        copyFileSync(videoPath, path.join(outDir, 'mazer-world-identity-transition.webm'));
        unlinkSync(videoPath);
      }
    }

    // ============================================================
    // 5. Menu-demo ambient trail, separately from Active Play -- the
    //    menu's own per-tile trail overlay (drawLegacyPlayerTrailTileOverlay)
    //    is a genuinely different code path from Active Play's continuous
    //    Navigation-Core canvas trail (drawLegacyContinuousPlayTrail); a
    //    trail-order finding in one surface says nothing about the other.
    // ============================================================
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: outDir, size: { width: 1280, height: 800 } } });
      const page = await context.newPage();
      await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
      await waitForCondition(page, () => {
        const g = window.__MAZER_GAME__;
        const s = g && g.scene.getScene('MenuScene');
        return !!s && s.overlay === 'none' && s.menuStaticDrawLifecyclePhase === 'settled';
      });
      // Real ambient demo movement -- no QA move calls, this is the
      // scene's own ordinary attract-mode AI, one real clock throughout.
      const deadline = Date.now() + 6000;
      while (Date.now() < deadline) {
        // eslint-disable-next-line no-await-in-loop
        const s = await page.evaluate(() => {
          const sc = window.__MAZER_GAME__.scene.getScene('MenuScene');
          const rendered = sc.resolveLegacyRenderedPlayerPoint(sc.time.now);
          return {
            logical: sc.player ? { x: sc.player.x, y: sc.player.y } : null,
            rendered: rendered ? { x: Number(rendered.x.toFixed(2)), y: Number(rendered.y.toFixed(2)) } : null,
            trailLen: Array.isArray(sc.trail) ? sc.trail.length : null
          };
        });
        diagnostics.menuDemoTrail.push({ t: Date.now(), ...s });
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(150);
      }
      const video = page.video();
      await context.close();
      if (video) {
        const videoPath = await video.path();
        copyFileSync(videoPath, path.join(outDir, 'mazer-world-identity-menu-demo-trail.webm'));
        unlinkSync(videoPath);
      }
    }
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }

  writeFileSync(path.join(outDir, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2));

  const files = readdirSync(outDir).filter((name) => statSync(path.join(outDir, name)).isFile());
  const manifest = {
    capturedAtIso: new Date().toISOString(),
    gitHead: resolveGitHead(),
    gitDirty: isDirtyWorktree(),
    baseUrl: resolvedBaseUrl,
    files: Object.fromEntries(files.sort().map((name) => [name, { sha256: sha256OfFile(path.join(outDir, name)), bytes: statSync(path.join(outDir, name)).size }]))
  };
  writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  process.stderr.write(`Evidence written to ${outDir}\n`);
  process.stderr.write(`${JSON.stringify({ manifest, diagnosticsSummary: diagnostics.levelNumberSequenceSummary }, null, 2)}\n`);
};

main().catch((error) => {
  console.error('FATAL', error);
  process.exitCode = 1;
});
