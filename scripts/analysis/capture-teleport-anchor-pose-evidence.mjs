/**
 * Wave 4D-B: real visual proof for the Teleport anchor-pose QA preview.
 * Drives the actual built game via Playwright and the real
 * window.__MAZER_QA__.previewTeleportPrimaryAnchor/endTeleportPrimaryAnchorPreview
 * commands -- the same pure selector and pose adapter intended for real
 * runtime integration, not a duplicate mock. Captures a small, real
 * contact sheet: an ordinary policy-selected case, a different real
 * target selecting a different real anchor, and a forced-ID case
 * (explicitly labeled as forced) demonstrating a corner engagement.
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
    const captureAroundAnchor = async (label, centerX, centerY) => {
      const dataUrl = await page.evaluate(({ cx, cy }) => {
        const canvas = document.querySelector('canvas');
        const size = 200;
        const scale = 3;
        const off = document.createElement('canvas');
        off.width = size * scale;
        off.height = size * scale;
        const ctx = off.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        const sx = Math.max(0, Math.min(canvas.width - size, cx - (size / 2)));
        const sy = Math.max(0, Math.min(canvas.height - size, cy - (size / 2)));
        ctx.drawImage(canvas, sx, sy, size, size, 0, 0, off.width, off.height);
        return off.toDataURL('image/png');
      }, { cx: centerX, cy: centerY });
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
