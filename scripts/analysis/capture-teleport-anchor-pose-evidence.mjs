/**
 * Wave 4D-B: real visual proof for the Teleport anchor-pose QA preview.
 * Drives the actual built game via Playwright and the real
 * window.__MAZER_QA__.previewTeleportPrimaryAnchor/endTeleportPrimaryAnchorPreview
 * commands -- the same pure selector and pose adapter intended for real
 * runtime integration, not a duplicate mock. Captures a real contact sheet:
 * three ordinary policy-selected cases; a geometry panel (diagnostic
 * overlay ON: target crosshair, measured port dot, exclusion rectangles,
 * and the selected footprint, under a real non-identity uniform
 * `boardZoomContainer` transform) paired with an overlay-OFF appearance
 * panel of the exact same selection; a touch-control panel (a real active
 * floating stick excluding the anchor it overlaps); and a reduced-motion
 * begin/end pair captured with zero manual frame steps, proving the
 * preview applies and restores its presentation synchronously.
 *
 * Usage: node scripts/analysis/capture-teleport-anchor-pose-evidence.mjs
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import sharp from 'sharp';
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

const labelPng = async (buffer, label, width) => {
  const svg = Buffer.from(
    `<svg width="${width}" height="28"><rect width="100%" height="100%" fill="#0b0f14"/><text x="6" y="19" font-family="monospace" font-size="14" fill="#e6fff5">${label}</text></svg>`
  );
  const base = await sharp(buffer).resize({ width, fit: 'inside' }).toBuffer();
  const baseMeta = await sharp(base).metadata();
  const canvas = sharp({
    create: { width: baseMeta.width, height: baseMeta.height + 28, channels: 4, background: '#0b0f14' }
  });
  return canvas.composite([{ input: svg, top: 0, left: 0 }, { input: base, top: 28, left: 0 }]).png().toBuffer();
};

const compositeGrid = async (labeledBuffers, columns, tileWidth) => {
  const rows = Math.ceil(labeledBuffers.length / columns);
  const metas = await Promise.all(labeledBuffers.map((b) => sharp(b).metadata()));
  const tileHeight = Math.max(...metas.map((m) => m.height));
  const canvas = sharp({
    create: { width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: '#05070a' }
  });
  const composites = labeledBuffers.map((buf, i) => ({
    input: buf, left: (i % columns) * tileWidth, top: Math.floor(i / columns) * tileHeight
  }));
  return canvas.composite(composites).png().toBuffer();
};

const main = async () => {
  const args = parseCliArgs();
  const baseUrl = normalizeBaseUrl(typeof args.baseUrl === 'string' ? args.baseUrl : DEFAULT_BASE_URL);
  const isTruthyArg = (value) => value === true || value === 'true' || value === '1';
  const useExistingServer = isTruthyArg(args.noPreview ?? args['no-preview']);
  const skipBuild = isTruthyArg(args.skipBuild ?? args['skip-build']);
  const outDir = typeof args['out-dir'] === 'string' ? args['out-dir'] : process.cwd();

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
    await page.goto(`${resolvedBaseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.previewTeleportPrimaryAnchor), { timeout: 15000 });
    await page.evaluate(() => window.__MAZER_GAME__.loop.stop());

    let clockMs = await page.evaluate(() => window.__MAZER_GAME__.scene.getScene('MenuScene').time.now);
    const stepOnce = async () => {
      clockMs += 16;
      await page.evaluate((t) => window.__MAZER_GAME__.loop.step(t), clockMs);
    };
    for (let i = 0; i < 400; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await stepOnce();
    }

    // Zooms in on a real 200x200 game-space region centered on the
    // selected anchor's own real position (falling back to the target
    // itself when selection was unavailable), at 3x scale so the shell is
    // actually legible in the composited sheet.
    // `overlay` (optional) draws real geometry directly onto the captured
    // region, in the SAME game-canvas coordinate space the capture crops
    // from: target crosshair, measured port dot, exclusion rectangles (red),
    // and the selected pose's own footprint (amber). All values passed in
    // come from a real preview result -- nothing here is a drawn mock.
    const captureAroundAnchor = async (label, centerX, centerY, overlay, cropSize) => {
      const dataUrl = await page.evaluate(({ cx, cy, ov, size }) => {
        const canvas = document.querySelector('canvas');
        const scale = 600 / size;
        const off = document.createElement('canvas');
        off.width = size * scale;
        off.height = size * scale;
        const ctx = off.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        const sx = Math.max(0, Math.min(canvas.width - size, cx - (size / 2)));
        const sy = Math.max(0, Math.min(canvas.height - size, cy - (size / 2)));
        ctx.drawImage(canvas, sx, sy, size, size, 0, 0, off.width, off.height);
        if (ov) {
          const toOff = (px, py) => ({ x: (px - sx) * scale, y: (py - sy) * scale });
          if (Array.isArray(ov.exclusions)) {
            ctx.strokeStyle = 'rgba(255,90,90,0.95)';
            ctx.lineWidth = 3;
            for (const rect of ov.exclusions) {
              const topLeft = toOff(rect.x, rect.y);
              ctx.strokeRect(topLeft.x, topLeft.y, rect.width * scale, rect.height * scale);
            }
          }
          if (ov.footprint) {
            const topLeft = toOff(ov.footprint.x, ov.footprint.y);
            ctx.strokeStyle = 'rgba(255,205,80,0.95)';
            ctx.lineWidth = 3;
            ctx.strokeRect(topLeft.x, topLeft.y, ov.footprint.width * scale, ov.footprint.height * scale);
          }
          if (ov.target) {
            const t = toOff(ov.target.x, ov.target.y);
            ctx.strokeStyle = 'rgba(120,200,255,0.95)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(t.x - 16, t.y); ctx.lineTo(t.x + 16, t.y);
            ctx.moveTo(t.x, t.y - 16); ctx.lineTo(t.x, t.y + 16);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(t.x, t.y, 16, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (ov.port) {
            const p = toOff(ov.port.x, ov.port.y);
            ctx.fillStyle = 'rgba(150,255,190,0.98)';
            ctx.strokeStyle = 'rgba(10,40,25,0.95)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
        return off.toDataURL('image/png');
      }, { cx: centerX, cy: centerY, ov: overlay ?? null, size: cropSize ?? 200 });
      const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
      return labelPng(buf, label, 600);
    };

    const panels = [];

    // Panel 1: ordinary policy-selected case -- target near the true
    // top-left corner, real selection (no forced ID).
    {
      const target = { x: 20, y: 20 };
      const result = await page.evaluate((t) => window.__MAZER_QA__.previewTeleportPrimaryAnchor(t.x, t.y, true), target);
      await stepOnce();
      const center = result.pose ?? { anchorX: target.x, anchorY: target.y };
      panels.push(await captureAroundAnchor(`Policy-selected: target=(${target.x},${target.y}) -> anchor ${result.selectedId} (${result.outcome})`, center.anchorX, center.anchorY));
    }

    // Panel 2: a different real target near the true top-left corner but
    // offset toward the left edge -- still policy-selected, demonstrating
    // the rotation actually differs (still real selection, not forced).
    {
      const target = { x: 5, y: 250 };
      const result = await page.evaluate((t) => window.__MAZER_QA__.previewTeleportPrimaryAnchor(t.x, t.y, true), target);
      await stepOnce();
      const center = result.pose ?? { anchorX: target.x, anchorY: target.y };
      panels.push(await captureAroundAnchor(`Policy-selected: target=(${target.x},${target.y}) -> anchor ${result.selectedId} (${result.outcome})`, center.anchorX, center.anchorY));
    }

    // Panel 3: a third genuine real target, near the top edge but well
    // right of center -- again real policy selection, no forced ID. All
    // three panels here are real selections; a forced-ID diagnostic mode
    // is not part of this QA surface (out of scope for this slice --
    // see the PR description).
    {
      const target = { x: 700, y: 5 };
      const result = await page.evaluate((t) => window.__MAZER_QA__.previewTeleportPrimaryAnchor(t.x, t.y, true), target);
      await stepOnce();
      const center = result.pose ?? { anchorX: target.x, anchorY: target.y };
      panels.push(await captureAroundAnchor(`Policy-selected: target=(${target.x},${target.y}) -> anchor ${result.selectedId} (${result.outcome})`, center.anchorX, center.anchorY));
    }

    await page.evaluate(() => window.__MAZER_QA__.endTeleportPrimaryAnchorPreview());

    // Panels 4-5: geometry (overlay ON) paired with appearance (overlay
    // OFF) for the SAME real selection, under a real non-identity uniform
    // boardZoomContainer transform -- proving the corrected position,
    // rotation, scale, port, and footprint all genuinely agree in one
    // logical space, not just that the shell "looks placed".
    {
      const target = { x: 980, y: 140 };
      const geometry = await page.evaluate((t) => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        scene.boardZoomContainer.setPosition(14, -9).setScale(1.6, 1.6);
        const result = window.__MAZER_QA__.previewTeleportPrimaryAnchor(t.x, t.y, true);
        const image = scene.titleOrbitDiamondImages[result.selectedId];
        const world = image.getWorldTransformMatrix();
        const port = world.transformPoint(920 - 627, 131 - 627);
        return { result, port: { x: port.x, y: port.y } };
      }, target);
      await stepOnce();
      const anchorPos = geometry.result.pose ?? { anchorX: target.x, anchorY: target.y };
      // Center the crop midway between the target and the selected anchor
      // so both the crosshair and the shell are visible in the same frame,
      // with a larger crop than the single-shell panels above.
      const center = { anchorX: (anchorPos.anchorX + target.x) / 2, anchorY: (anchorPos.anchorY + target.y) / 2 };
      const geometryCropSize = 340;
      const overlay = {
        target,
        port: geometry.port,
        footprint: geometry.result.pose?.footprint,
        exclusions: geometry.result.rejected.map((r) => {
          const match = /at \(([-\d.]+), ([-\d.]+), ([-\d.]+)x([-\d.]+)\)/.exec(r.reason);
          return match ? { x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]) } : null;
        }).filter(Boolean)
      };
      panels.push(await captureAroundAnchor(
        `Geometry (overlay ON, 1.6x uniform zoom): target=blue ring, port=green dot, footprint=amber, exclusions=red -> anchor ${geometry.result.selectedId}`,
        center.anchorX, center.anchorY, overlay, geometryCropSize
      ));
      panels.push(await captureAroundAnchor(
        `Appearance (overlay OFF, same 1.6x uniform zoom, same selection) -> anchor ${geometry.result.selectedId}`,
        center.anchorX, center.anchorY, undefined, geometryCropSize
      ));
      await page.evaluate(() => window.__MAZER_QA__.endTeleportPrimaryAnchorPreview());
      await page.evaluate(() => window.__MAZER_GAME__.scene.getScene('MenuScene').boardZoomContainer.setPosition(0, 0).setScale(1, 1));
      await stepOnce();
    }

    // Panel 6: a real active floating stick's transient footprint
    // genuinely excluding the anchor it overlaps -- a live control case,
    // not a synthetic rectangle.
    {
      await page.evaluate(() => window.__MAZER_QA__.startPlayMode());
      await stepOnce();
      const touch = await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        scene.playFloatingStickOrigin = { x: 640, y: 16 };
        const result = window.__MAZER_QA__.previewTeleportPrimaryAnchor(640, 16, true);
        const stick = scene.resolveLegacyPlayFloatingStickGeometry(scene.playFloatingStickOrigin);
        return { result, stickOuter: { x: stick.outer.left, y: stick.outer.top, width: stick.outer.width, height: stick.outer.height } };
      });
      await stepOnce();
      // Center on the stick's own real footprint (anchor 1's own real
      // position) -- the selection this panel is about is that this
      // whole region is now excluded, which reads clearest centered on
      // the excluded region itself rather than on wherever the policy
      // relocated to (which can be an anchor far across the board).
      const stickCenterX = touch.stickOuter.x + (touch.stickOuter.width / 2);
      const stickCenterY = touch.stickOuter.y + (touch.stickOuter.height / 2);
      panels.push(await captureAroundAnchor(
        `Active floating stick (overlay ON, red=stick footprint) excludes anchor 1 -> selected ${touch.result.selectedId} elsewhere instead`,
        stickCenterX, stickCenterY,
        { exclusions: [touch.stickOuter] },
        260
      ));
      await page.evaluate(() => window.__MAZER_QA__.endTeleportPrimaryAnchorPreview());
      await page.evaluate(() => { window.__MAZER_GAME__.scene.getScene('MenuScene').playFloatingStickOrigin = null; });
      await stepOnce();
    }

    // Panels 7-8: reduced-motion begin/end restoration, captured with
    // ZERO manual frame steps between the QA call and the screenshot --
    // proving the presentation update is synchronous, not dependent on
    // the ambient per-frame draw this scene disables under reduced motion.
    {
      const before = await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        scene.__evidenceOriginalPrefersReducedMotion = scene.prefersLegacyReducedMotion;
        scene.prefersLegacyReducedMotion = () => true;
        return null;
      });
      void before;
      const begin = await page.evaluate(() => window.__MAZER_QA__.previewTeleportPrimaryAnchor(20, 20, true));
      const beginCenter = begin.pose ?? { anchorX: 20, anchorY: 20 };
      panels.push(await captureAroundAnchor(
        `Reduced motion, settled scene, ZERO frame steps: begin() applied immediately -> anchor ${begin.selectedId}`,
        beginCenter.anchorX, beginCenter.anchorY
      ));
      await page.evaluate(() => window.__MAZER_QA__.endTeleportPrimaryAnchorPreview());
      panels.push(await captureAroundAnchor(
        'Reduced motion, settled scene, ZERO frame steps: end() restored ambient presentation immediately',
        beginCenter.anchorX, beginCenter.anchorY
      ));
      await page.evaluate(() => {
        const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
        scene.prefersLegacyReducedMotion = scene.__evidenceOriginalPrefersReducedMotion;
        delete scene.__evidenceOriginalPrefersReducedMotion;
      });
      await stepOnce();
    }

    const sheet = await compositeGrid(panels, 3, 600);
    writeFileSync(`${outDir}/mazer-wave4d-b-teleport-anchor-pose-proof.png`, sheet);
    process.stderr.write('Wrote mazer-wave4d-b-teleport-anchor-pose-proof.png\n');

    await context.close();
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
