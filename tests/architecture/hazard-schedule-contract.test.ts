import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { HAZARD_LAYER_BUILD_DEFAULT, resolveHazardLayerEnabled } from '../../src/legacy-runtime/legacyHazardLayerFlag';

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
    expect(record).toContain('"yes to all four"');
    expect(manifest.contract.signedBy).toBe('Zac, 2026-11-15, via chat');
    expect(manifest.contract.signedWords).toBe('yes to all four');
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
    expect(HAZARD_LAYER_BUILD_DEFAULT).toBe(false);
    expect(resolveHazardLayerEnabled()).toBe(false);
    expect(manifest.flag.buildDefaultEnabled).toBe(HAZARD_LAYER_BUILD_DEFAULT);
    expect(manifest.status).toBe('signed-not-wired');
  });
});

describe('hazard schedule manifest v2 (first-time cards spec slice 6, D4)', () => {
  const MANIFEST_V2 = 'docs/contracts/mazer-hazard-schedule.v2.json';
  const SCHEMA_V2 = 'docs/contracts/mazer-hazard-schedule.v2.schema.json';
  const SPEC = 'docs/design/MAZER-FIRST-TIME-CARDS-SPEC-2026-11-26.md';
  const v1 = readJson(MANIFEST);
  const v2 = readJson(MANIFEST_V2);
  const schemaV2 = readJson(SCHEMA_V2);

  test('the v2 manifest satisfies its schema, and the validator still rejects a broken one', () => {
    expect(validate(schemaV2, v2)).toEqual([]);
    const broken = JSON.parse(JSON.stringify(v2));
    broken.shardLock.curve = 'B';
    delete broken.shardLock.salt;
    broken.version = 1;
    expect(validate(schemaV2, broken).length).toBeGreaterThanOrEqual(3);
  });

  test('v2 moves only the shard entry (60 -> 100) and adds the curve-A lock layer; v1 stays the signed record', () => {
    expect(v2.supersedes).toBe(MANIFEST);
    expect(v2.intro.map((entry: any) => [entry.level, entry.unit])).toEqual([
      [10, 'pulseGate'],
      [20, 'sentry'],
      [35, 'hunter'],
      [100, 'shard']
    ]);
    expect(v1.intro.map((entry: any) => entry.level)).toEqual([10, 20, 35, 60]);
    expect(v2.shardLock).toMatchObject({
      curve: 'A',
      salt: '0x4c4f434b',
      chanceBelowEntry: 0,
      chanceAtEntry: 0.3,
      fullFromLevel: 283,
      firstLockLevel: 102,
      lockLevelsBelowFull: 105
    });
    // Everything outside the shard entry, the lock layer, the exposure rule and the record is v1 unchanged.
    for (const key of ['manifestId', 'flag', 'kinds', 'tail', 'caps', 'fairness', 'rejected']) {
      expect(v2[key], key).toEqual(v1[key]);
    }
    expect(v2.intro.slice(0, 3)).toEqual(v1.intro.slice(0, 3));
    expect({ ...v2.forever, shardsOnEveryLevelFrom: undefined }).toEqual({ ...v1.forever, shardsOnEveryLevelFrom: undefined });
    expect(v2.forever.shardsOnEveryLevelFrom).toBe(v2.shardLock.fullFromLevel);
    expect(v2.flag.buildDefaultEnabled).toBe(HAZARD_LAYER_BUILD_DEFAULT);
  });

  test('v2 is signed by the D4 decision and the product contract carries the amendment', () => {
    const spec = read(SPEC);
    expect(v2.contract.signedBy).toBe('Zac, 2026-11-27, via chat');
    expect(spec).toContain(v2.contract.signedWords);
    expect(spec).toContain('| D4 | Curve and schedule |');
    expect(v2.shardLock.decision).toContain(SPEC);
    const doc = read(PRODUCT_CONTRACT);
    expect(doc).toContain('## Amendment 2026-11-27, manifest v2 (locked gates from 100, curve A)');
    expect(doc).toContain(MANIFEST_V2);
    expect(doc).toContain(v2.contract.signedWords);
    expect(read(v2.contract.doc)).toBe(doc);
  });
});
