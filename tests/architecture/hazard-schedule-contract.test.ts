import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { LEGACY_HAZARD_LAYER_ENABLED } from '../../src/legacy-runtime/legacyHazardHandoff';

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');
const readJson = (path: string): any => JSON.parse(read(path));

const MANIFEST = 'docs/contracts/mazer-hazard-schedule.v1.json';
const SCHEMA = 'docs/contracts/mazer-hazard-schedule.v1.schema.json';
const PRODUCT_CONTRACT = 'docs/architecture/MAZER-HAZARD-PRODUCT-CONTRACT.md';
const GRAPH_CONTRACT = 'docs/architecture/MAZER-HAZARD-GRAPH-CONTRACT.md';

// Minimal structural validator for the keywords the schema file uses. The repo carries no direct
// JSON-schema dependency, so this stays local to the test.
const validate = (schema: any, value: unknown, path = '$'): string[] => {
  const errors: string[] = [];
  const typeOf = (v: unknown): string => (Array.isArray(v) ? 'array' : v === null ? 'null' : Number.isInteger(v) ? 'integer' : typeof v);
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) errors.push(`${path}: const`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: enum`);
  if (schema.type) {
    const actual = typeOf(value);
    const ok = schema.type === actual || (schema.type === 'number' && actual === 'integer');
    if (!ok) { errors.push(`${path}: type ${schema.type} got ${actual}`); return errors; }
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: minLength`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: pattern`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: maximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: minItems`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) errors.push(`${path}: uniqueItems`);
    if (schema.items) value.forEach((item, i) => errors.push(...validate(schema.items, item, `${path}[${i}]`)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in record)) errors.push(`${path}: missing ${key}`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) if (!(key in (schema.properties ?? {}))) errors.push(`${path}: unexpected ${key}`);
    }
    for (const [key, sub] of Object.entries<any>(schema.properties ?? {})) {
      if (key in record) errors.push(...validate(sub, record[key], `${path}.${key}`));
    }
  }
  return errors;
};

describe('MAZER-HAZ-002 hazard schedule manifest v1 (slice H0)', () => {
  const manifest = readJson(MANIFEST);
  const schema = readJson(SCHEMA);

  test('the manifest satisfies its structural schema', () => {
    expect(validate(schema, manifest)).toEqual([]);
  });

  test('the validator rejects a broken manifest, so the check above is not vacuous', () => {
    const broken = JSON.parse(JSON.stringify(manifest));
    broken.flag.buildDefaultEnabled = true;
    delete broken.caps.gates;
    broken.extra = 1;
    expect(validate(schema, broken).length).toBeGreaterThanOrEqual(3);
  });

  test('the signed intro schedule is gate 10, sentry 20, hunter 35, shard 60, strictly ascending', () => {
    expect(manifest.intro.map((entry: any) => [entry.level, entry.unit])).toEqual([
      [10, 'pulseGate'],
      [20, 'sentry'],
      [35, 'hunter'],
      [60, 'shard']
    ]);
    const levels = manifest.intro.map((entry: any) => entry.level);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    expect(manifest.rejected.draftUnlockLevels).toEqual([6, 11, 16]);
    expect(levels).not.toEqual(expect.arrayContaining(manifest.rejected.draftUnlockLevels));
    expect(manifest.tail).toMatchObject({ fromLevel: 36, everyLevels: 15, blockersRemoved: true });
    expect(manifest.tail.fromLevel).toBeGreaterThan(levels[levels.length - 2]);
  });

  test('contact, eject, burnout and cap values match the signed contract', () => {
    expect(manifest.contact).toMatchObject({
      consequence: 'rewind-to-last-trail-junction',
      invulnerableTicksPlay: 4,
      invulnerableTicksValidator: 2,
      hunterBurnoutContacts: 3,
      gateCloseOnPlayer: 'eject-one-cell-back-no-contact'
    });
    expect(manifest.contact.invulnerableTicksPlay).toBeGreaterThanOrEqual(manifest.contact.invulnerableTicksValidator);
    expect(manifest.kinds.hunter).toMatchObject({ speedDivisorAtIntro: 3, speedDivisorFloor: 2 });
    expect(manifest.caps).toMatchObject({ gates: 6, sentries: 4, hunters: 2, enemiesTotal: 5, shards: 'tail-rule' });
    expect(manifest.caps.enemiesTotal).toBeLessThanOrEqual(manifest.caps.sentries + manifest.caps.hunters);
    expect(manifest.fairness.escapeSlackRatioMin).toBe(0.9);
    expect(manifest.forever).toMatchObject({ axis: 'shard-route-target', shardCountGrowsEveryLevels: 50 });
  });

  test('the product contract is signed with the owner words and carries every scheduled number', () => {
    const doc = read(PRODUCT_CONTRACT);
    const record = doc.split('\n## 1.')[0];
    expect(record).toContain('SIGNED 2026-11-15');
    expect(record).toContain('Zac (owner), 2026-11-15, via chat');
    expect(record).toContain('"YES to all four contract calls"');
    expect(manifest.contract.signedBy).toBe('Zac, 2026-11-15, via chat');
    expect(manifest.contract.signedWords).toBe('YES to all four contract calls');
    for (const phrase of ['Pulse Gate', 'Sentry', 'Hunter', 'Shard', 'last junction on their own trail', '**4 ticks**', 'third contact with the same Hunter']) {
      expect(doc).toContain(phrase);
    }
    expect(doc).toContain('docs/contracts/mazer-hazard-schedule.v1.json');
    expect(doc).not.toContain('pending Zac');
    expect(read(manifest.contract.doc)).toBe(doc);
    expect(read(manifest.contract.graphContract)).toBe(read(GRAPH_CONTRACT));
  });

  test('the hazard graph contract carries the signed amendments A1 to A6', () => {
    const doc = read(GRAPH_CONTRACT);
    expect(doc.split('\n## Ownership')[0]).toContain('SIGNED 2026-11-15');
    expect(doc).toContain('## Signed amendments (2026-11-15)');
    for (const id of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']) expect(doc).toContain(`### ${id}.`);
    expect(doc).toContain('real-time world clock');
    expect(doc).toContain('N = 4');
    expect(doc).toContain('ejected one cell back along the trail');
    expect(doc).toContain('The third contact with the same Hunter');
    expect(doc).toContain('The static `blocker` is dropped from the placement menu');
    expect(doc).toContain('docs/contracts/mazer-hazard-schedule.v1.json');
  });

  test('signing the contract wires nothing: the dormant switch stays off', () => {
    expect(LEGACY_HAZARD_LAYER_ENABLED).toBe(false);
    expect(manifest.flag.buildDefaultEnabled).toBe(false);
    expect(manifest.status).toBe('signed-not-wired');
  });
});
