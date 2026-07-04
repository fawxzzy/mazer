import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const readRepoFile = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

const extractCurrentMarker = (markerDoc: string): number => {
  const match = markerDoc.match(/Current marker:\s*`(\d+)%`/);
  expect(match, 'marker doc must publish a current marker').not.toBeNull();
  return Number(match?.[1]);
};

const extractRetiredMarker = (markerDoc: string): number => {
  const match = markerDoc.match(/Retired marker:\s*`(\d+)%`/);
  expect(match, 'retired marker doc must publish a retired marker').not.toBeNull();
  return Number(match?.[1]);
};

const extractCurrentTotal = (markerDoc: string): number => {
  const match = markerDoc.match(/-\s*`(\d+)\s*\/\s*100`/);
  expect(match, 'marker doc must publish a current total').not.toBeNull();
  return Number(match?.[1]);
};

const extractWeightedTablePoints = (markerDoc: string): number[] => markerDoc
  .split('\n')
  .filter((line) => line.startsWith('| ') && !line.startsWith('| Segment') && !line.startsWith('| ---'))
  .map((line) => line.split('|').map((cell) => cell.trim()))
  .filter((cells) => cells.length >= 4)
  .map((cells) => {
    const pointsMatch = cells[3]?.match(/^`(\d+)`$/);
    expect(pointsMatch, `marker row must have numeric current points: ${cells[1]}`).not.toBeNull();
    return Number(pointsMatch?.[1]);
  });

describe('Mazer completion markers', () => {
  test('keeps the active mechanics/mobile marker arithmetic and current truth synchronized', () => {
    const markerDoc = readRepoFile('docs/research/MAZER_MECHANICS_MOBILE_COMPLETION_MARKER.md');
    const currentTruth = readRepoFile('docs/current-truth.md');
    const agentRules = readRepoFile('AGENTS.md');

    const currentMarker = extractCurrentMarker(markerDoc);
    const currentTotal = extractCurrentTotal(markerDoc);
    const weightedPoints = extractWeightedTablePoints(markerDoc);

    expect(weightedPoints.reduce((sum, points) => sum + points, 0)).toBe(currentTotal);
    expect(currentTotal).toBe(currentMarker);
    expect(currentTruth).toContain(`- \`${currentMarker}%\``);
    expect(markerDoc).toContain('This is the active completion marker for the current Mazer direction.');
    expect(markerDoc).toContain('Do not ratchet the retired legacy visual 1:1 marker from this lane.');
    expect(currentTruth).toContain('legacy visual 1:1 marker is retired');
    expect(agentRules).toContain('use `docs/research/MAZER_MECHANICS_MOBILE_COMPLETION_MARKER.md` as the active percent marker');
  });

  test('keeps the active proof spine explicit and aligned with repo verify scripts', () => {
    const currentTruth = readRepoFile('docs/current-truth.md');
    const packageJson = readRepoFile('package.json');
    const verifyScript = readRepoFile('scripts/verify/run-verify.mjs');

    expect(packageJson).toContain('"verify": "node ./scripts/verify/run-verify.mjs"');
    expect(packageJson).toContain('"test:verify": "vitest run tests/reset tests/ai/demo-walker.test.ts tests/scenes/menu-render-frame.test.ts --maxWorkers 1"');
    expect(verifyScript).toContain("runNpm(['run', 'test:verify'])");
    expect(verifyScript).toContain("runNpm(['run', 'build'])");
    expect(currentTruth).toContain('Current `verify` means:');
    expect(currentTruth).toContain('- `npm run test:verify`');
    expect(currentTruth).toContain('- `npm run build`');
    expect(currentTruth).toContain('Current `test:verify` means:');
    expect(currentTruth).toContain('- `tests/reset`');
    expect(currentTruth).toContain('- `tests/ai/demo-walker.test.ts`');
    expect(currentTruth).toContain('- `tests/scenes/menu-render-frame.test.ts`');
    expect(currentTruth).toContain('- `--maxWorkers 1`');
    expect(currentTruth).toContain('npm run lint');
  });

  test('keeps the legacy visual one-to-one marker retired unless screenshot parity is reopened', () => {
    const retiredMarkerDoc = readRepoFile('docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md');
    const currentTruth = readRepoFile('docs/current-truth.md');
    const agentRules = readRepoFile('AGENTS.md');

    const retiredMarker = extractRetiredMarker(retiredMarkerDoc);

    expect(retiredMarker).toBe(93);
    expect(retiredMarkerDoc).toContain('Status: retired / archival');
    expect(retiredMarkerDoc).toContain('Do not ratchet it during mechanics-first or mobile-clean work.');
    expect(currentTruth).toContain(`retired at \`${retiredMarker}%\``);
    expect(agentRules).toContain('explicitly reopened legacy screenshot 1:1 passes only');
  });
});
