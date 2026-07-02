import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const readRepoFile = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

const extractCurrentMarker = (markerDoc: string): number => {
  const match = markerDoc.match(/Current marker:\s*`(\d+)%`/);
  expect(match, 'marker doc must publish a current marker').not.toBeNull();
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

describe('legacy one-to-one marker', () => {
  test('keeps marker arithmetic and current truth synchronized', () => {
    const markerDoc = readRepoFile('docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md');
    const currentTruth = readRepoFile('docs/current-truth.md');
    const parityMatrix = readRepoFile('docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md');
    const agentRules = readRepoFile('AGENTS.md');

    const currentMarker = extractCurrentMarker(markerDoc);
    const currentTotal = extractCurrentTotal(markerDoc);
    const weightedPoints = extractWeightedTablePoints(markerDoc);

    expect(weightedPoints.reduce((sum, points) => sum + points, 0)).toBe(currentTotal);
    expect(currentTotal).toBe(currentMarker);
    expect(currentTruth).toContain(`- \`${currentMarker}%\``);
    expect(parityMatrix).toContain(`held at \`${currentMarker}%\``);
    expect(markerDoc).toContain('Every legacy 1:1 pass must re-evaluate this marker before closeout');
    expect(agentRules).toContain('On every legacy 1:1 pass, explicitly re-evaluate the percent marker');
  });
});
