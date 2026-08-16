import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, STACK_ROOT, ensureDir, parseCliArgs } from '../visual/common.mjs';
import { CYBER_ARCADE_VIEWPORTS } from './capture-cyber-arcade-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH;

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const toDataUri = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`;

export const buildCyberArcadeComparison = async ({
  artifactRoot = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-cyber-arcade'),
  outputDir = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-cyber-arcade-comparison'),
  sessionId
}) => {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  const iconPath = resolve(REPO_ROOT, 'public', 'icons', 'mazer-app-icon.png');
  const iconBuffer = await readFile(iconPath);
  const entries = [];
  for (const profile of CYBER_ARCADE_VIEWPORTS) {
    const summaryPath = resolve(artifactRoot, `${sessionId}-${profile.id}`, 'summary.json');
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
    for (const surface of ['menu', 'play', 'pause']) {
      const screenshotPath = summary.screenshots?.[surface];
      if (!screenshotPath) {
        continue;
      }
      const buffer = await readFile(screenshotPath);
      entries.push({
        profile: profile.id,
        surface,
        path: screenshotPath,
        sha256: sha256(buffer),
        dataUri: toDataUri(buffer)
      });
    }
  }

  await ensureDir(outputDir);
  const htmlPath = resolve(outputDir, `${sessionId}.html`);
  const receiptPath = resolve(outputDir, `${sessionId}.json`);
  const cards = entries.map((entry) => `
    <figure>
      <figcaption>${entry.profile} · ${entry.surface}</figcaption>
      <img src="${entry.dataUri}" alt="${entry.profile} ${entry.surface}">
    </figure>`).join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Mazer crisp cyber arcade comparison</title>
<style>body{margin:0;background:#02070d;color:#ecfff5;font:16px system-ui;padding:24px}header{display:flex;gap:24px;align-items:center;margin-bottom:24px}header img{width:160px;height:160px;image-rendering:pixelated}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}figure{margin:0;background:#07131d;border:1px solid #72e0bf;padding:12px}figcaption{margin-bottom:8px;color:#b7f2ff}figure img{width:100%;height:560px;object-fit:contain;background:#07111d}</style>
</head><body><header><img src="${toDataUri(iconBuffer)}" alt="Approved Mazer app icon"><div><h1>Crisp cyber arcade material proof</h1><p>Approved icon target: ${basename(iconPath)}</p><p>Session: ${sessionId}</p></div></header><main class="grid">${cards}</main></body></html>`;
  const receipt = {
    contractVersion: 'mazer-cyber-arcade-comparison-v1',
    sessionId,
    icon: { path: iconPath, sha256: sha256(iconBuffer) },
    entries: entries.map(({ dataUri: _dataUri, ...entry }) => entry),
    htmlPath
  };
  await writeFile(htmlPath, html, 'utf8');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { htmlPath, receiptPath, receipt };
};

if (isDirectRun) {
  const args = parseCliArgs();
  buildCyberArcadeComparison({
    artifactRoot: typeof args['artifact-root'] === 'string' ? args['artifact-root'] : undefined,
    outputDir: typeof args['output-dir'] === 'string' ? args['output-dir'] : undefined,
    sessionId: typeof args.session === 'string' ? args.session : undefined
  }).then(({ htmlPath, receiptPath, receipt }) => {
    process.stdout.write(`${JSON.stringify({ htmlPath, receiptPath, entryCount: receipt.entries.length }, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
