import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { GEOMETRY_BUDGET_SATURATION_LEVEL } from '../../src/legacy-runtime/legacyGeometryBudget';
import { LEGACY_HAZARD_LAYER_ENABLED, resolveLegacyHazardHandoff } from '../../src/legacy-runtime/legacyHazardHandoff';

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');
const CONTRACT = 'docs/research/MAZER_HAZARD_CONTRACT_PHASE1_2026-11-14.md';

describe('MAZER-HAZ-002 hazard contract phase 1 is signed and still enables nothing', () => {
  const contract = read(CONTRACT);

  test('the signature record names the owner words, the date and the cards', () => {
    const record = contract.split('\n## 0.')[0];
    expect(record).toContain('SIGNED 2026-11-14');
    expect(record).toContain('"yes to all"');
    for (const card of ['MAZER-HAZ-002', 'MAZER-PROG-019', 'MAZER-PROG-005']) {
      expect(record).toContain(card);
    }
    expect(record).toContain('hazardBudgetLevels = level - GEOMETRY_BUDGET_SATURATION_LEVEL');
  });

  test('the contract states the live saturation level, so the doc cannot drift from source', () => {
    expect(contract).toContain(`**${GEOMETRY_BUDGET_SATURATION_LEVEL}**`);
    expect(contract).toContain(`level ${GEOMETRY_BUDGET_SATURATION_LEVEL} owes 0; level ${GEOMETRY_BUDGET_SATURATION_LEVEL + 1} owes 1`);
  });

  test('no open "pending Zac" markers remain in the signed contract', () => {
    expect(contract).not.toContain('pending Zac');
    expect(contract).not.toContain('P0 DRAFT');
  });

  test('signing enables nothing: the layer is off and level 1 and the plateau edge owe no hazard', () => {
    expect(LEGACY_HAZARD_LAYER_ENABLED).toBe(false);
    for (const level of [1, 2, GEOMETRY_BUDGET_SATURATION_LEVEL]) {
      expect(resolveLegacyHazardHandoff(level)).toMatchObject({ hazardBudgetLevels: 0, hazardsActive: false, obstacles: [], enemies: [] });
    }
    expect(resolveLegacyHazardHandoff(GEOMETRY_BUDGET_SATURATION_LEVEL + 1).hazardBudgetLevels).toBe(1);
  });

  test('the decision record addendum and world turn contract point at the signed contract', () => {
    const records = read('docs/ops/MAZER-DECISION-RECORDS-2026-11-14.md');
    expect(records).toContain('Addendum 2026-11-14');
    expect(records).toContain('MAZER_HAZARD_CONTRACT_PHASE1_2026-11-14.md');
    expect(read('docs/architecture/MAZER-WORLD-TURN-CONTRACT.md')).toContain('MAZER-HAZ-002 signed 2026-11-14');
  });
});
