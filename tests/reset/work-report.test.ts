import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  BLOCKED_GROUPS,
  COMPLETED_TIERS,
  buildWorkReport,
  renderOutputs,
  validateLedger
} from '../../scripts/analysis/work-report.mjs';

const root = resolve(__dirname, '../..');
const registry = JSON.parse(readFileSync(resolve(root, 'config/mazer-owner-work-registry.json'), 'utf8'));
const ledger = JSON.parse(readFileSync(resolve(root, 'config/mazer-work-ledger.json'), 'utf8'));
const { json: report, markdown } = buildWorkReport(registry, ledger);

describe('mazer work report', () => {
  test('the ledger validates and only names registry cards', () => {
    expect(validateLedger(registry, ledger)).toEqual([]);
    const ids = new Set(registry.workItems.map((card: { id: string }) => card.id));
    for (const id of Object.keys(ledger.cards)) expect(ids.has(id), `${id} is not in the registry`).toBe(true);
  });

  test('every registry card appears in exactly one bucket', () => {
    const seen = new Map<string, number>();
    const count = (items: Array<{ id: string }>) => items.forEach((item) => seen.set(item.id, (seen.get(item.id) ?? 0) + 1));
    count(report.needsYou.decisions);
    count(report.needsYou.checks);
    for (const tier of COMPLETED_TIERS) count(report.completed[tier]);
    count(report.inReview);
    for (const group of BLOCKED_GROUPS) count(report.blocked[group]);
    count(report.ready.queue);
    count(report.inProgress);
    count(report.deferred);
    count(report.unclassified);
    expect(seen.size).toBe(registry.workItems.length);
    for (const card of registry.workItems) expect(seen.get(card.id), card.id).toBe(1);
    expect(report.counters.total).toBe(registry.workItems.length);
    expect(Object.values(report.counters.buckets).reduce((a: number, b) => a + (b as number), 0)).toBe(registry.workItems.length);
    for (const card of registry.workItems) expect(markdown, card.id).toContain(`\`${card.id}\``);
  });

  test('every completed card has an evidence tier and every shipped tier is explicit', () => {
    const completed = registry.workItems.filter((card: { status: string }) => card.status === 'completed');
    expect(completed.length).toBeGreaterThan(0);
    for (const card of completed) {
      const evidence = ledger.cards[card.id]?.evidence;
      expect(evidence, `${card.id} has no evidence`).toBeTruthy();
      expect(typeof evidence.headless, card.id).toBe('boolean');
      expect([true, false, null], card.id).toContain(evidence.deviceChecked);
    }
    expect(report.completed.unrecorded).toEqual([]);
  });

  test('the batch shipped on main b640f1da is headless-only with its pull requests', () => {
    const expected: Record<string, string> = {
      'MAZER-PROG-015': '#420', 'MAZER-UI-014': '#428', 'MAZER-UI-017': '#429', 'MAZER-UI-018': '#430, #431',
      'MAZER-MOTION-003': '#424', 'MAZER-CTRL-001': '#427', 'MAZER-FLOW-004': '#419', 'MAZER-FLOW-007': '#433',
      'MAZER-FLOW-008': '#426', 'MAZER-FLOW-009': '#423', 'MAZER-FLOW-010': '#422', 'MAZER-VIS-019': '#419',
      'MAZER-VIS-020': '#419', 'MAZER-VIS-021': '#421'
    };
    for (const [id, prs] of Object.entries(expected)) {
      const item = report.completed.headless.find((card: { id: string }) => card.id === id);
      expect(item, id).toBeTruthy();
      expect(item.prs).toBe(prs);
      expect(item.deployedBuild).toBe('b640f1da');
    }
  });

  test('every card that needs the owner has a non-empty ask', () => {
    for (const item of [...report.needsYou.decisions, ...report.needsYou.checks]) {
      expect(item.ask.trim().length, `${item.id} has no ask`).toBeGreaterThan(0);
    }
    for (const item of report.needsYou.decisions) expect(item.recommendation.trim().length, item.id).toBeGreaterThan(0);
    for (const item of report.needsYou.checks) {
      expect(item.verify.length, `${item.id} has no steps`).toBeGreaterThan(0);
      for (const step of item.verify) expect(step.expected.trim().length).toBeGreaterThan(0);
    }
  });

  test('the markdown keeps the section order', () => {
    const headings = [...markdown.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([
      'At a glance', '1. Needs you now', '2. Completed', '3. In review', '4. Blocked',
      '5. Ready to build', '6. In progress', '7. Deferred', '8. Unclassified'
    ]);
  });

  test('the generator is deterministic', () => {
    const a = renderOutputs(root);
    const b = renderOutputs(root);
    expect(a.markdown).toBe(b.markdown);
    expect(a.json).toBe(b.json);
  });

});
