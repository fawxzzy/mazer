/**
 * Wave 4D-B: real-browser integration check for the Teleport anchor-pose
 * QA preview (window.__MAZER_QA__.previewTeleportPrimaryAnchor /
 * endTeleportPrimaryAnchorPreview, wired in src/scenes/MenuScene.ts).
 * Drives the actual built game (not a mock). This is a corrected rewrite
 * responding to a real review that found the previous version proved the
 * wrong things:
 *   - it inspected images[images.length - 1] (a fixed spare slot) instead
 *     of titleOrbitDiamondImages[result.selectedId] -- so it could not
 *     have caught the real bug where the wrong identity's slot moved;
 *   - it compared the image's LOCAL x/y against the resolver's own WORLD-
 *     space output, which is only a valid comparison while
 *     boardZoomContainer happens to be at identity -- it could not have
 *     caught a real coordinate-space bug under a non-identity container
 *     transform;
 *   - it never exercised a real HUD exclusion (only synthetic ones, at the
 *     pure-function level) or the preview's session retention.
 *
 * This version asserts:
 *   - the SELECTED identity's own slot (titleOrbitDiamondImages[selectedId])
 *     moves, while the other 7 slots remain under ambient control (no
 *     duplicate representative for one identity, no orphaned identity);
 *   - the displayed WORLD position (via Image.getWorldTransformMatrix, not
 *     local x/y) matches the resolver's real target-space pose, including
 *     under a real NON-IDENTITY boardZoomContainer transform;
 *   - a real device-independent HUD control's own live bounds (this
 *     scene's actual uiButtons, not a synthetic rectangle) genuinely
 *     excludes an anchor whose footprint overlaps it;
 *   - the preview session retains its held anchor across a target change
 *     (the real selector's own retention rule), and newSession:true starts
 *     fresh;
 *   - ending the preview lets ambient control resume, and Navigation
 *     Core's own canvases stay unaffected.
 *
 * Usage: node scripts/analysis/verify-teleport-anchor-preview-lifecycle.mjs
 */
import { execFileSync } from 'node:child_process';
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

const checks = [];
const check = (label, passed, detail) => {
  checks.push({ label, passed, detail });
  process.stderr.write(`${passed ? 'PASS' : 'FAIL'}: ${label}${detail ? ` -- ${detail}` : ''}\n`);
};

// Advances the scene's own manual clock -- the normal per-frame title-orbit
// draw (and this wave's override riding alongside it) only runs from
// within the real render loop, so a QA call's effect is only actually
// drawn once a frame has run since that call.
const stepOnce = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  window.__mazerTeleportQaClockMs = (window.__mazerTeleportQaClockMs ?? scene.time.now) + 16;
  window.__MAZER_GAME__.loop.step(window.__mazerTeleportQaClockMs);
});

// Reads every slot's real WORLD position (via getWorldTransformMatrix, not
// local x/y -- local coordinates only agree with world ones while the
// parent container happens to be at identity) plus local x/y for
// completeness, so a test can independently verify the coordinate
// conversion this wave's fix relies on rather than trusting it circularly.
const readImagePoolState = (page) => page.evaluate(() => {
  const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
  const images = scene.titleOrbitDiamondImages;
  return {
    poolLength: images.length,
    slots: images.map((image) => {
      const world = image.getWorldTransformMatrix();
      return {
        localX: image.x,
        localY: image.y,
        localRotation: image.rotation,
        worldX: world.tx,
        worldY: world.ty,
        worldRotation: world.rotationNormalized,
        visible: image.visible,
        texture: image.texture.key
      };
    })
  };
});

const anglesMatch = (a, b) => Math.abs(Math.cos(a) - Math.cos(b)) < 0.01 && Math.abs(Math.sin(a) - Math.sin(b)) < 0.01;

const main = async () => {
  const args = parseCliArgs();
  const baseUrl = normalizeBaseUrl(typeof args.baseUrl === 'string' ? args.baseUrl : DEFAULT_BASE_URL);
  const isTruthyArg = (value) => value === true || value === 'true' || value === '1';
  const useExistingServer = isTruthyArg(args.noPreview ?? args['no-preview']);
  const skipBuild = isTruthyArg(args.skipBuild ?? args['skip-build']);

  if (!useExistingServer && !skipBuild) {
    runBuild();
  }

  const preview = useExistingServer
    ? null
    : await launchPreviewServer({ requestedBaseUrl: baseUrl, previewTimeoutMs: DEFAULT_PREVIEW_TIMEOUT_MS });
  const resolvedBaseUrl = preview?.baseUrl ?? baseUrl;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.previewTeleportPrimaryAnchor), { timeout: 15000 });
    await page.evaluate(() => window.__MAZER_GAME__.loop.stop());
    // Fast-forward past the title's own build animation so the scene is
    // fully settled before exercising the preview.
    for (let i = 0; i < 400; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await stepOnce(page);
    }

    const before = await readImagePoolState(page);
    check('the pool starts with exactly 8 diamond image slots', before.poolLength === 8, `poolLength=${before.poolLength}`);

    // === Correct-identity + world-space placement, at IDENTITY container transform ===
    const target = { x: 1260, y: 20 }; // near the top-right corner -> anchor 2
    const result = await page.evaluate((t) => window.__MAZER_QA__.previewTeleportPrimaryAnchor(t.x, t.y, true), target);
    await stepOnce(page);
    const during = await readImagePoolState(page);

    check('the selector actually chose an anchor for this target', result.selectedId !== null, JSON.stringify(result));

    const selectedSlot = result.selectedId === null ? null : during.slots[result.selectedId];
    check(
      'the SELECTED IDENTITY\'s own slot (not a fixed spare) moved to the real computed pose, in real WORLD space',
      selectedSlot !== null && result.pose !== null
        && Math.abs(selectedSlot.worldX - result.pose.anchorX) < 0.5
        && Math.abs(selectedSlot.worldY - result.pose.anchorY) < 0.5
        && anglesMatch(selectedSlot.worldRotation, result.pose.rotation),
      `selectedId=${result.selectedId} slot=${JSON.stringify(selectedSlot)} pose=${JSON.stringify(result.pose)}`
    );
    check(
      'the selected slot is visible and uses the real canonical shell texture',
      selectedSlot?.visible === true && selectedSlot?.texture === 'mazerVfxEdgeDiamondEnergized',
      JSON.stringify(selectedSlot)
    );
    check(
      'the OTHER seven identities are not pinned to the same pose -- one representative per identity, no duplicate',
      during.slots.every((slot, id) => (
        id === result.selectedId
        || Math.abs(slot.worldX - result.pose.anchorX) > 1
        || Math.abs(slot.worldY - result.pose.anchorY) > 1
      )),
      JSON.stringify(during.slots.map((s) => ({ worldX: Math.round(s.worldX), worldY: Math.round(s.worldY) })))
    );

    // === Real, non-identity boardZoomContainer transform ===
    // Empirically, this codebase's own "Board Zoom" setting does not
    // currently move this container (confirmed live: it changes tile size
    // instead) -- but relying on that rather than converting explicitly is
    // exactly the fragility a reviewer flagged, so this proves the
    // conversion is correct under a transform regardless of whether any
    // current UI setting happens to produce one.
    await page.evaluate(() => {
      const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
      window.__mazerTeleportQaOriginalTransform = {
        x: scene.boardZoomContainer.x,
        y: scene.boardZoomContainer.y,
        scaleX: scene.boardZoomContainer.scaleX,
        scaleY: scene.boardZoomContainer.scaleY
      };
      // Uniform scale, matching the only way a real "zoom" (this container's
      // own name and stated purpose) would ever actually scale it -- a
      // non-uniform (anisotropic) parent scale would shear a rotated
      // child's own effective world rotation in a way that has no single
      // "correct" recomposition (the child's own circular/diamond
      // silhouette itself becomes an ellipse under such a transform), so
      // that case is intentionally not modeled as a supported scenario.
      scene.boardZoomContainer.setPosition(37, -19).setScale(1.6, 1.6);
    });
    const transformedTarget = { x: 40, y: 700 }; // near the bottom-left corner -> anchor 6
    const transformedResult = await page.evaluate(
      (t) => window.__MAZER_QA__.previewTeleportPrimaryAnchor(t.x, t.y, true),
      transformedTarget
    );
    await stepOnce(page);
    const duringTransformed = await readImagePoolState(page);
    const transformedSlot = transformedResult.selectedId === null ? null : duringTransformed.slots[transformedResult.selectedId];
    check(
      'under a real non-identity boardZoomContainer transform, the displayed WORLD position and rotation still match the real target-space pose',
      transformedSlot !== null && transformedResult.pose !== null
        && Math.abs(transformedSlot.worldX - transformedResult.pose.anchorX) < 0.5
        && Math.abs(transformedSlot.worldY - transformedResult.pose.anchorY) < 0.5
        && anglesMatch(transformedSlot.worldRotation, transformedResult.pose.rotation),
      `selectedId=${transformedResult.selectedId} slot=${JSON.stringify(transformedSlot)} pose=${JSON.stringify(transformedResult.pose)}`
    );
    check(
      'the same non-identity transform actually moved local coordinates away from world ones (proving this case is a real test, not a no-op)',
      transformedSlot !== null && (Math.abs(transformedSlot.localX - transformedSlot.worldX) > 1 || Math.abs(transformedSlot.localY - transformedSlot.worldY) > 1),
      JSON.stringify(transformedSlot)
    );
    await page.evaluate(() => {
      const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
      const t = window.__mazerTeleportQaOriginalTransform;
      scene.boardZoomContainer.setPosition(t.x, t.y).setScale(t.scaleX, t.scaleY);
    });
    await page.evaluate(() => window.__MAZER_QA__.endTeleportPrimaryAnchorPreview());
    await stepOnce(page);

    // === Real HUD-control exclusion (this scene's own live uiButtons, not a synthetic rect) ===
    const hudProbe = await page.evaluate(() => {
      const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
      const buttons = scene.uiButtons
        .map((b) => ({ x: b.bounds.left, y: b.bounds.top, width: b.bounds.width, height: b.bounds.height, semanticAction: b.semanticAction }))
        .filter((b) => b.width > 0 && b.height > 0);
      if (buttons.length === 0) {
        return { buttons, result: null };
      }
      const button = buttons[0];
      const targetX = button.x + (button.width / 2);
      const targetY = button.y + (button.height / 2);
      const result = window.__MAZER_QA__.previewTeleportPrimaryAnchor(targetX, targetY, true);
      return { buttons, button, result };
    });
    check('this scene has at least one real, currently-active HUD control (uiButtons) to test exclusion against', hudProbe.buttons.length > 0, `buttons=${JSON.stringify(hudProbe.buttons)}`);
    if (hudProbe.buttons.length > 0) {
      const rejectedNearButton = hudProbe.result.rejected.some((r) => r.reason.includes('excluded region'));
      check(
        'a target placed on a real HUD control (' + (hudProbe.button.semanticAction ?? 'unnamed') + ') causes at least one anchor to be excluded by a real (non-safe-area) rectangle',
        rejectedNearButton,
        JSON.stringify(hudProbe.result.rejected)
      );
    }
    await page.evaluate(() => window.__MAZER_QA__.endTeleportPrimaryAnchorPreview());
    await stepOnce(page);

    // === Session retention: held anchor survives a target change; newSession starts fresh ===
    const sessionStart = await page.evaluate((t) => window.__MAZER_QA__.previewTeleportPrimaryAnchor(t.x, t.y, true), { x: 20, y: 700 });
    await stepOnce(page);
    check('session start selects a real anchor', sessionStart.selectedId !== null, JSON.stringify(sessionStart));

    // A target now much closer to a different anchor -- the real selector's
    // own retention rule must keep the held anchor anyway.
    const sessionContinued = await page.evaluate((t) => window.__MAZER_QA__.previewTeleportPrimaryAnchor(t.x, t.y), { x: 1260, y: 20 });
    await stepOnce(page);
    check(
      'continuing the same session (no newSession flag) retains the held anchor even though a different one is now much closer',
      sessionContinued.outcome === 'retained' && sessionContinued.selectedId === sessionStart.selectedId,
      `start=${sessionStart.selectedId} continued=${JSON.stringify(sessionContinued)}`
    );

    const sessionReset = await page.evaluate((t) => window.__MAZER_QA__.previewTeleportPrimaryAnchor(t.x, t.y, true), { x: 1260, y: 20 });
    await stepOnce(page);
    check(
      'newSession: true starts a genuinely fresh selection instead of retaining the prior session\'s held anchor',
      sessionReset.outcome === 'new' && sessionReset.selectedId !== sessionStart.selectedId,
      `start=${sessionStart.selectedId} reset=${JSON.stringify(sessionReset)}`
    );

    // === Ending the preview restores ambient control ===
    const duringReset = await readImagePoolState(page);
    const resetSlot = duringReset.slots[sessionReset.selectedId];
    await page.evaluate(() => window.__MAZER_QA__.endTeleportPrimaryAnchorPreview());
    await stepOnce(page);
    const after = await readImagePoolState(page);
    const afterSlot = after.slots[sessionReset.selectedId];
    check(
      'ending the preview lets the ambient draw take the selected slot back over (no longer pinned to the preview pose)',
      afterSlot !== null && (Math.abs(afterSlot.worldX - resetSlot.worldX) > 0.5 || Math.abs(afterSlot.worldY - resetSlot.worldY) > 0.5),
      `duringSlot=${JSON.stringify(resetSlot)} afterSlot=${JSON.stringify(afterSlot)}`
    );

    // === Rendered port/footprint agreement (the review's finding 1) ===
    // Independently transforms the canonical shell's own MEASURED tip
    // (edge-diamond-energized.png: 1254x1254 canvas, center (627,627), tip
    // at (920,131) -- see teleportAnchorPose.ts's own module doc) through
    // the Image's ACTUAL world transform matrix (Phaser's own
    // TransformMatrix.transformPoint, which composes position, rotation,
    // AND scale -- position/rotation alone, which the previous round's
    // checks used, cannot catch a scale-compensation bug). Compares that
    // independently-measured point against the resolver's own reported
    // portX/portY, and transforms the shell's 4 source-canvas corners the
    // same way to confirm they fit the reported footprint -- not merely
    // that the footprint is self-consistent with its own inputs.
    const NATIVE_TIP_DX = 920 - 627;
    const NATIVE_TIP_DY = 131 - 627;
    const HALF_SOURCE = 627;
    const verifyRenderedPortAndFootprint = (page2, label, parentScale) => page2.evaluate(({ dx, dy, half, scale, lbl }) => {
      const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
      const original = { x: scene.boardZoomContainer.x, y: scene.boardZoomContainer.y, sx: scene.boardZoomContainer.scaleX, sy: scene.boardZoomContainer.scaleY };
      scene.boardZoomContainer.setPosition(11, -7).setScale(scale, scale);
      const result = window.__MAZER_QA__.previewTeleportPrimaryAnchor(1260, 20, true);
      const image = scene.titleOrbitDiamondImages[result.selectedId];
      const world = image.getWorldTransformMatrix();
      const measuredPort = world.transformPoint(dx, dy);
      const corners = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([cx, cy]) => world.transformPoint(cx, cy));
      window.__MAZER_QA__.endTeleportPrimaryAnchorPreview();
      scene.boardZoomContainer.setPosition(original.x, original.y).setScale(original.sx, original.sy);
      return { label: lbl, result, measuredPort, corners };
    }, { dx: NATIVE_TIP_DX, dy: NATIVE_TIP_DY, half: HALF_SOURCE, scale: parentScale, lbl: label });

    const footprintContains = (footprint, point, epsilon = 0.5) => (
      point.x >= footprint.x - epsilon && point.y >= footprint.y - epsilon
      && point.x <= footprint.x + footprint.width + epsilon && point.y <= footprint.y + footprint.height + epsilon
    );

    for (const parentScale of [1, 1.6, 0.5]) {
      // eslint-disable-next-line no-await-in-loop
      const probe = await verifyRenderedPortAndFootprint(page, `parent scale ${parentScale}`, parentScale);
      // eslint-disable-next-line no-await-in-loop
      await stepOnce(page);
      const portMatches = probe.result.pose !== null
        && Math.abs(probe.measuredPort.x - probe.result.pose.portX) < 0.5
        && Math.abs(probe.measuredPort.y - probe.result.pose.portY) < 0.5;
      check(
        `the rendered port (measured by transforming the real source tip through the Image's actual world matrix) matches the resolver's portX/portY at ${probe.label}`,
        portMatches,
        `measuredPort=${JSON.stringify(probe.measuredPort)} pose=${JSON.stringify(probe.result.pose)}`
      );
      const cornersContained = probe.result.pose !== null && probe.corners.every((corner) => footprintContains(probe.result.pose.footprint, corner));
      check(
        `all 4 transformed source-canvas corners fit the reported footprint at ${probe.label}`,
        cornersContained,
        `corners=${JSON.stringify(probe.corners)} footprint=${JSON.stringify(probe.result.pose?.footprint)}`
      );
    }

    // Negative control: reproduces the ORIGINAL uncompensated-scale bug
    // directly (bypassing the real fix) and proves the SAME port comparison
    // above would have failed it -- confirming this test suite actually
    // catches the defect it claims to, not just that the current code
    // happens to pass.
    const negativeControl = await page.evaluate(({ dx, dy }) => {
      const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
      const original = { x: scene.boardZoomContainer.x, y: scene.boardZoomContainer.y, sx: scene.boardZoomContainer.scaleX, sy: scene.boardZoomContainer.scaleY };
      scene.boardZoomContainer.setPosition(11, -7).setScale(1.6, 1.6);
      const result = window.__MAZER_QA__.previewTeleportPrimaryAnchor(1260, 20, true);
      const image = scene.titleOrbitDiamondImages[result.selectedId];
      // Reproduce the ORIGINAL bug: a fixed local scale not divided by the
      // parent's own scale (this is exactly what applyLegacyTeleportAnchorPreviewOverride
      // used to do before this correction round).
      const uncompensatedScale = 32 / 1254;
      image.setScale(uncompensatedScale);
      const world = image.getWorldTransformMatrix();
      const measuredPort = world.transformPoint(dx, dy);
      window.__MAZER_QA__.endTeleportPrimaryAnchorPreview();
      scene.boardZoomContainer.setPosition(original.x, original.y).setScale(original.sx, original.sy);
      return { result, measuredPort };
    }, { dx: NATIVE_TIP_DX, dy: NATIVE_TIP_DY });
    await stepOnce(page);
    const negativeControlPortMatches = negativeControl.result.pose !== null
      && Math.abs(negativeControl.measuredPort.x - negativeControl.result.pose.portX) < 0.5
      && Math.abs(negativeControl.measuredPort.y - negativeControl.result.pose.portY) < 0.5;
    check(
      'negative control: the ORIGINAL uncompensated-scale bug genuinely fails this same port comparison (proving the test has teeth)',
      negativeControlPortMatches === false,
      `measuredPort=${JSON.stringify(negativeControl.measuredPort)} pose=${JSON.stringify(negativeControl.result.pose)}`
    );

    // === Reduced-motion, settled-scene preview updates (the review's finding 2) ===
    // The whole point of this block is that NO stepOnce() (manual frame
    // advance) is called between any of these calls and reading their
    // effect -- the previous round's fix relied on the real per-frame
    // ambient draw to apply/restore the preview, which this scene's own
    // hasLegacyMenuTitleAnimationPendingFrame explicitly disables under
    // reduced motion, and boardPathDirty is only forced every frame when
    // reduced motion is OFF. A settled, reduced-motion scene therefore has
    // no guaranteed next frame at all -- this proves begin/update/end all
    // apply their effect SYNCHRONOUSLY, independent of any frame running.
    const reducedMotionProbe = await page.evaluate((t) => {
      const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
      const originalReducedMotion = scene.prefersLegacyReducedMotion;
      scene.prefersLegacyReducedMotion = () => true;

      const begin = window.__MAZER_QA__.previewTeleportPrimaryAnchor(t.beginX, t.beginY, true);
      const afterBeginWorld = begin.selectedId === null ? null : scene.titleOrbitDiamondImages[begin.selectedId].getWorldTransformMatrix();
      const afterBeginPos = afterBeginWorld ? { x: afterBeginWorld.tx, y: afterBeginWorld.ty } : null;

      const update = window.__MAZER_QA__.previewTeleportPrimaryAnchor(t.updateX, t.updateY);
      const afterUpdateWorld = update.selectedId === null ? null : scene.titleOrbitDiamondImages[update.selectedId].getWorldTransformMatrix();
      const afterUpdatePos = afterUpdateWorld ? { x: afterUpdateWorld.tx, y: afterUpdateWorld.ty } : null;

      const beforeEndWorld = scene.titleOrbitDiamondImages[update.selectedId].getWorldTransformMatrix();
      const beforeEndPos = { x: beforeEndWorld.tx, y: beforeEndWorld.ty };
      window.__MAZER_QA__.endTeleportPrimaryAnchorPreview();
      const afterEndWorld = scene.titleOrbitDiamondImages[update.selectedId].getWorldTransformMatrix();
      const afterEndPos = { x: afterEndWorld.tx, y: afterEndWorld.ty };

      scene.prefersLegacyReducedMotion = originalReducedMotion;
      return { begin, afterBeginPos, update, afterUpdatePos, beforeEndPos, afterEndPos };
    }, { beginX: 20, beginY: 20, updateX: 1260, updateY: 20 });
    check(
      'reduced motion, settled scene, NO frame step: begin displays the chosen slot immediately',
      reducedMotionProbe.begin.selectedId !== null && reducedMotionProbe.afterBeginPos !== null
        && Math.abs(reducedMotionProbe.afterBeginPos.x - reducedMotionProbe.begin.pose.anchorX) < 0.5
        && Math.abs(reducedMotionProbe.afterBeginPos.y - reducedMotionProbe.begin.pose.anchorY) < 0.5,
      JSON.stringify(reducedMotionProbe)
    );
    check(
      'reduced motion, settled scene, NO frame step: a held-target update is applied immediately',
      reducedMotionProbe.update.selectedId !== null && reducedMotionProbe.afterUpdatePos !== null
        && Math.abs(reducedMotionProbe.afterUpdatePos.x - reducedMotionProbe.update.pose.anchorX) < 0.5
        && Math.abs(reducedMotionProbe.afterUpdatePos.y - reducedMotionProbe.update.pose.anchorY) < 0.5,
      JSON.stringify(reducedMotionProbe)
    );
    check(
      'reduced motion, settled scene, NO frame step: end restores ambient presentation immediately',
      Math.abs(reducedMotionProbe.beforeEndPos.x - reducedMotionProbe.afterEndPos.x) > 0.5 || Math.abs(reducedMotionProbe.beforeEndPos.y - reducedMotionProbe.afterEndPos.y) > 0.5,
      JSON.stringify(reducedMotionProbe)
    );
    await stepOnce(page);

    // === Real play-control clearance (the review's finding 3) ===
    // Distinguishes the fixed pause-button hit region (always real when
    // touch controls should render) from an ACTIVE floating stick's own
    // transient footprint (real only while a drag is genuinely in
    // progress) -- and confirms the much larger whole-canvas gesture
    // surface is NOT itself an exclusion (selection must still succeed).
    await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
    await stepOnce(page);
    const touchControlProbe = await page.evaluate(() => {
      const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
      const touchControlLayout = scene.resolveLegacyPlayTouchControlLayout();
      const pause = touchControlLayout.controls.pause;
      // A target placed exactly on the real, fixed pause-button bounds.
      const pauseResult = window.__MAZER_QA__.previewTeleportPrimaryAnchor(
        pause.left + (pause.width / 2),
        pause.top + (pause.height / 2),
        true
      );
      window.__MAZER_QA__.endTeleportPrimaryAnchorPreview();

      // An active floating stick mounted right where anchor 1 (top-mid)
      // sits, so its real footprint genuinely overlaps that anchor.
      scene.playFloatingStickOrigin = { x: 640, y: 16 };
      const stickResult = window.__MAZER_QA__.previewTeleportPrimaryAnchor(640, 16, true);
      const stickRejectedAnchor1 = stickResult.rejected.some((r) => r.reason.includes('excluded region'));
      window.__MAZER_QA__.endTeleportPrimaryAnchorPreview();
      scene.playFloatingStickOrigin = null;

      // The same target with NO active stick -- anchor 1 must be selectable
      // once the transient footprint is gone.
      const noStickResult = window.__MAZER_QA__.previewTeleportPrimaryAnchor(640, 16, true);
      window.__MAZER_QA__.endTeleportPrimaryAnchorPreview();

      // The gesture-capture surface itself (the whole canvas, no active
      // stick) must NOT make every anchor ineligible -- an ordinary
      // in-canvas target still resolves normally.
      const ordinaryResult = window.__MAZER_QA__.previewTeleportPrimaryAnchor(scene.layout.width / 2, scene.layout.height / 2, true);
      window.__MAZER_QA__.endTeleportPrimaryAnchorPreview();

      return { pause, pauseResult, stickRejectedAnchor1, noStickResult, ordinaryResult };
    });
    await stepOnce(page);
    check(
      'a target on the real, fixed pause-button bounds is genuinely excluded',
      touchControlProbe.pauseResult.rejected.some((r) => r.reason.includes('excluded region')),
      JSON.stringify(touchControlProbe.pauseResult)
    );
    check(
      'an active floating stick\'s real footprint genuinely excludes the anchor it overlaps',
      touchControlProbe.stickRejectedAnchor1,
      JSON.stringify(touchControlProbe)
    );
    check(
      'once the stick is no longer active, the same anchor becomes selectable again -- a transient control, not a permanent exclusion',
      touchControlProbe.noStickResult.selectedId === 1,
      JSON.stringify(touchControlProbe.noStickResult)
    );
    check(
      'the whole-canvas gesture-capture surface is NOT itself an exclusion -- an ordinary target still resolves to a real anchor',
      touchControlProbe.ordinaryResult.selectedId !== null,
      JSON.stringify(touchControlProbe.ordinaryResult)
    );

    // === Navigation Core unaffected, including in settled Active Play ===
    await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
    await stepOnce(page);
    const playPreview = await page.evaluate((t) => window.__MAZER_QA__.previewTeleportPrimaryAnchor(t.x, t.y, true), { x: 20, y: 20 });
    await stepOnce(page);
    check('the preview also resolves a real selection while in settled Active Play, not only Main Menu', playPreview.selectedId !== null, JSON.stringify(playPreview));
    await page.evaluate(() => window.__MAZER_QA__.endTeleportPrimaryAnchorPreview());
    await stepOnce(page);
    const navCoreState = await page.evaluate(() => {
      const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
      return {
        mode: scene.mode,
        trailCanvasExists: Boolean(scene.trailCanvasImage),
        playerGlowExists: Boolean(scene.playerGlowCanvasImage),
        goalHaloExists: Boolean(scene.goalHaloCanvasImage)
      };
    });
    check(
      'Navigation Core\'s trail/player-glow/goal-halo canvas layers are unaffected',
      navCoreState.mode === 'play' && navCoreState.trailCanvasExists && navCoreState.playerGlowExists && navCoreState.goalHaloExists,
      JSON.stringify(navCoreState)
    );

    check('no page errors across the whole sequence', consoleErrors.length === 0, consoleErrors.join(' | '));

    await context.close();
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }

  const failed = checks.filter((c) => !c.passed);
  process.stderr.write(`\n${checks.length - failed.length}/${checks.length} checks passed.\n`);
  process.exitCode = failed.length > 0 ? 1 : 0;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
