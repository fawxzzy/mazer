// Usage (plain node; reads committed fixtures only, never account data):
//   node scripts/analysis/ai-run-calibration-thresholds.mjs --derive   rewrite calibration-thresholds.v1.json from the baselines (only if changed)
//   node scripts/analysis/ai-run-calibration-thresholds.mjs --check    exit 1 when the baselines violate the committed thresholds
//   node scripts/analysis/ai-run-calibration-thresholds.mjs --table    print the markdown table derived from the baselines
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  checkBaselinesAgainstThresholds,
  deriveCalibrationThresholds,
  loadBaselines,
  renderCalibrationThresholdsMarkdown
} from './lib/ai-run-calibration-thresholds.mjs';

const PACK_DIR = resolve('tests/fixtures/ai-run-seed-packs');
const THRESHOLDS_PATH = resolve(PACK_DIR, 'calibration-thresholds.v1.json');

export const runCalibrationThresholdsCli = async (argv = process.argv.slice(2)) => {
  const mode = argv[0] ?? '--check';
  const baselines = await loadBaselines(PACK_DIR);
  if (mode === '--table') {
    process.stdout.write(`${renderCalibrationThresholdsMarkdown(deriveCalibrationThresholds(baselines))}\n`);
    return { mode };
  }
  if (mode === '--derive') {
    const text = `${JSON.stringify(deriveCalibrationThresholds(baselines), null, 2)}\n`;
    let existing = null;
    try {
      existing = (await readFile(THRESHOLDS_PATH, 'utf8')).replace(/\r\n/g, '\n');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const changed = existing !== text;
    if (changed) {
      await mkdir(dirname(THRESHOLDS_PATH), { recursive: true });
      await writeFile(THRESHOLDS_PATH, text, 'utf8');
    }
    process.stdout.write(`${changed ? 'wrote' : 'unchanged'} ${THRESHOLDS_PATH}\n`);
    return { mode, changed };
  }
  if (mode === '--check') {
    const thresholds = JSON.parse(await readFile(THRESHOLDS_PATH, 'utf8'));
    const result = checkBaselinesAgainstThresholds(thresholds, baselines);
    const lines = result.pass
      ? ['calibration thresholds: PASS']
      : ['calibration thresholds: FAIL', ...result.violations.map((v) => `- ${v.scope}: ${v.message}`)];
    process.stdout.write(`${lines.join('\n')}\n`);
    if (!result.pass) process.exitCode = 1;
    return { mode, ...result };
  }
  process.stderr.write('Usage: --derive | --check | --table\n');
  process.exitCode = 2;
  return { mode, error: 'usage' };
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCalibrationThresholdsCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
