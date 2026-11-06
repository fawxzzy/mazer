import { describe, expect, it, vi } from 'vitest';

import { buildAssetIndex } from '../../src/domain/assets/assetManifest.ts';
import { EXAMPLE_TUTORIAL_REGISTRY } from '../../src/tutorial/exampleTutorials.ts';
import {
  MIGRATED_ACK_TIMESTAMP,
  TUTORIAL_ACK_STORAGE_KEY_PREFIX,
  buildTutorialAckStorageKey,
  createTutorialAckStore,
  getTutorialsForTrigger,
  parseStoredTutorialAcks,
  selectPendingTutorials,
  serializeTutorialAcks,
  triggerKey,
  validateTutorialRegistry
} from '../../src/tutorial/index.ts';
import type { TutorialStorage, TutorialToken } from '../../src/tutorial/index.ts';

class MemoryStorage implements TutorialStorage {
  readonly data = new Map<string, string>();
  readonly setCalls: string[] = [];
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.setCalls.push(key); this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const tokens = EXAMPLE_TUTORIAL_REGISTRY.tokens;
const welcome = tokens.find((token) => token.id === 'example.welcome') as TutorialToken;
const firstGoal = tokens.find((token) => token.id === 'example.first-goal') as TutorialToken;
const tip = tokens.find((token) => token.id === 'example.tip-of-the-day') as TutorialToken;
const clock = () => {
  let tick = 0;
  return () => `2026-11-05T00:00:${String(tick++).padStart(2, '0')}.000Z`;
};

describe('tutorial registry', () => {
  it('accepts the example registry (placeholder content)', () => {
    expect(validateTutorialRegistry(clone(EXAMPLE_TUTORIAL_REGISTRY)).ok).toBe(true);
  });

  it('orders tokens per trigger by order then id, deterministically', () => {
    const registry = clone(EXAMPLE_TUTORIAL_REGISTRY) as { schemaVersion: 1; tokens: TutorialToken[] };
    registry.tokens.push({ ...clone(firstGoal), id: 'example.a-first-goal', order: 10 });
    registry.tokens.push({ ...clone(firstGoal), id: 'example.early-goal', order: 1 });
    const ids = getTutorialsForTrigger(registry, { kind: 'first-occurrence', event: 'goal-reached' }).map((token) => token.id);
    expect(ids).toEqual(['example.early-goal', 'example.a-first-goal', 'example.first-goal']);
    expect(getTutorialsForTrigger(registry, { kind: 'account-created' }).map((token) => token.id)).toEqual(['example.welcome']);
    expect(triggerKey({ kind: 'first-occurrence', event: 'goal-reached' })).toBe('first-occurrence:goal-reached');
  });

  it('reports structural violations sorted and without throwing', () => {
    const registry: any = clone(EXAMPLE_TUTORIAL_REGISTRY);
    registry.tokens.push(clone(registry.tokens[0]));
    registry.tokens[1].trigger = { kind: 'first-occurrence' };
    registry.tokens[2].repeat = 'sometimes';
    registry.tokens[2].revision = 0;
    delete registry.tokens[2].copy.bodyKey;
    registry.tokens[1].surprise = true;
    const result = validateTutorialRegistry(registry);
    expect(result.ok).toBe(false);
    expect(result.violations.map((entry) => entry.rule)).toEqual(expect.arrayContaining([
      'duplicate-id', 'invalid-trigger', 'invalid-repeat', 'invalid-revision', 'missing-copy-key', 'unknown-field'
    ]));
    const keys = result.violations.map((entry) => `${entry.path}|${entry.rule}|${entry.message}`);
    expect([...keys].sort()).toEqual(keys);
    expect(validateTutorialRegistry('nope').ok).toBe(false);
    expect(validateTutorialRegistry({ schemaVersion: 2, tokens: [] }).violations[0].rule).toBe('unsupported-schema-version');
  });

  it('resolves optional image asset references against an asset index', () => {
    const assetIndex = buildAssetIndex({
      assets: [{ id: 'example.image.banner', kind: 'image', status: 'approved' } as never, { id: 'example.image.old', kind: 'image', status: 'deprecated' } as never]
    });
    const registry: any = clone(EXAMPLE_TUTORIAL_REGISTRY);
    registry.tokens[0].imageAssetId = 'example.image.banner';
    expect(validateTutorialRegistry(registry, { assetIndex }).ok).toBe(true);
    registry.tokens[0].imageAssetId = 'example.image.missing';
    expect(validateTutorialRegistry(registry, { assetIndex }).violations.map((entry) => entry.rule)).toEqual(['unresolved-asset']);
    registry.tokens[0].imageAssetId = 'example.image.old';
    expect(validateTutorialRegistry(registry, { assetIndex }).violations.map((entry) => entry.rule)).toEqual(['deprecated-asset']);
  });
});

describe('tutorial acknowledgement store', () => {
  it('builds account-scoped keys that cannot collide across accounts', () => {
    expect(buildTutorialAckStorageKey('acct-1')).toBe(`${TUTORIAL_ACK_STORAGE_KEY_PREFIX}:acct-1`);
    expect(buildTutorialAckStorageKey('a:b')).not.toBe(buildTutorialAckStorageKey('a'));
    expect(buildTutorialAckStorageKey('a b')).not.toBe(buildTutorialAckStorageKey('a%20b'));
    expect(() => buildTutorialAckStorageKey('')).toThrow(TypeError);
    expect(() => buildTutorialAckStorageKey('   ')).toThrow(TypeError);
  });

  it('acknowledges once-tokens idempotently without rewriting storage', () => {
    const storage = new MemoryStorage();
    const store = createTutorialAckStore({ storage, accountId: 'acct-1', now: clock() });
    expect(store.isAcknowledged(welcome)).toBe(false);
    expect(store.acknowledge(welcome)).toEqual({ changed: true, persisted: true });
    const bytes = storage.data.get(store.storageKey);
    expect(store.isAcknowledged(welcome)).toBe(true);

    expect(store.acknowledge(welcome)).toEqual({ changed: false, persisted: false });
    expect(storage.setCalls).toHaveLength(1);
    expect(storage.data.get(store.storageKey)).toBe(bytes);
    expect(store.snapshot()[welcome.id]).toMatchObject({ revision: 1, count: 1, firstAckedAt: '2026-11-05T00:00:00.000Z' });
  });

  it('survives reload: a new store over the same storage and account sees prior acknowledgements', () => {
    const storage = new MemoryStorage();
    createTutorialAckStore({ storage, accountId: 'acct-1' }).acknowledge(welcome);
    const reloaded = createTutorialAckStore({ storage, accountId: 'acct-1' });
    expect(reloaded.isAcknowledged(welcome)).toBe(true);
    expect(selectPendingTutorials(EXAMPLE_TUTORIAL_REGISTRY, reloaded, { kind: 'account-created' })).toEqual([]);
  });

  it('isolates accounts sharing one storage, including after switching and clearing', () => {
    const storage = new MemoryStorage();
    const alice = createTutorialAckStore({ storage, accountId: 'alice' });
    const bob = createTutorialAckStore({ storage, accountId: 'bob' });
    alice.acknowledge(welcome);
    alice.acknowledge(firstGoal);
    expect(bob.isAcknowledged(welcome)).toBe(false);
    expect(bob.snapshot()).toEqual({});
    expect(selectPendingTutorials(EXAMPLE_TUTORIAL_REGISTRY, bob, { kind: 'account-created' }).map((token) => token.id)).toEqual(['example.welcome']);

    bob.acknowledge(welcome);
    alice.clear();
    expect(alice.isAcknowledged(welcome)).toBe(false);
    expect(bob.isAcknowledged(welcome)).toBe(true);
    expect(Object.keys(bob.snapshot())).toEqual([welcome.id]);
    expect(createTutorialAckStore({ storage, accountId: 'alice' }).snapshot()).toEqual({});
  });

  it('never suppresses repeatable tokens but counts acknowledgements', () => {
    const store = createTutorialAckStore({ storage: new MemoryStorage(), accountId: 'acct-1', now: clock() });
    expect(store.acknowledge(tip).changed).toBe(true);
    expect(store.acknowledge(tip).changed).toBe(true);
    expect(store.isAcknowledged(tip)).toBe(false);
    expect(store.snapshot()[tip.id].count).toBe(2);
    expect(selectPendingTutorials(EXAMPLE_TUTORIAL_REGISTRY, store, { kind: 'first-occurrence', event: 'menu-opened' })).toHaveLength(1);
  });

  it('re-shows a once-token when its revision is bumped, and keeps the first-ack time', () => {
    const storage = new MemoryStorage();
    const store = createTutorialAckStore({ storage, accountId: 'acct-1', now: clock() });
    store.acknowledge(welcome);
    const revised: TutorialToken = { ...welcome, revision: 2 };
    expect(store.isAcknowledged(revised)).toBe(false);
    expect(store.acknowledge(revised).changed).toBe(true);
    expect(store.isAcknowledged(revised)).toBe(true);
    expect(store.snapshot()[welcome.id]).toMatchObject({ revision: 2, count: 2, firstAckedAt: '2026-11-05T00:00:00.000Z', lastAckedAt: '2026-11-05T00:00:01.000Z' });
  });

  it('writes deterministic bytes regardless of acknowledgement order', () => {
    const a = new MemoryStorage();
    const b = new MemoryStorage();
    const storeA = createTutorialAckStore({ storage: a, accountId: 'x', now: () => '2026-11-05T00:00:00.000Z' });
    const storeB = createTutorialAckStore({ storage: b, accountId: 'x', now: () => '2026-11-05T00:00:00.000Z' });
    storeA.acknowledge(welcome); storeA.acknowledge(firstGoal);
    storeB.acknowledge(firstGoal); storeB.acknowledge(welcome);
    expect(a.data.get(storeA.storageKey)).toBe(b.data.get(storeB.storageKey));
  });

  describe('stored versioning and migration', () => {
    it('writes the current version', () => {
      const storage = new MemoryStorage();
      const store = createTutorialAckStore({ storage, accountId: 'acct-1' });
      store.acknowledge(welcome);
      expect(JSON.parse(storage.data.get(store.storageKey) as string).version).toBe(1);
      expect(store.diagnostics().status).toBe('ok');
    });

    it('migrates a bare array of token ids to the current shape', () => {
      const storage = new MemoryStorage();
      const key = buildTutorialAckStorageKey('acct-1');
      storage.data.set(key, JSON.stringify(['example.welcome', 42, '']));
      const store = createTutorialAckStore({ storage, accountId: 'acct-1' });
      expect(store.diagnostics()).toMatchObject({ status: 'migrated', droppedEntries: 2 });
      expect(store.isAcknowledged(welcome)).toBe(true);
      expect(store.snapshot()[welcome.id]).toEqual({ revision: 1, count: 1, firstAckedAt: MIGRATED_ACK_TIMESTAMP, lastAckedAt: MIGRATED_ACK_TIMESTAMP });
      // The next write persists the migrated shape.
      store.acknowledge(firstGoal);
      const parsed = parseStoredTutorialAcks(storage.data.get(key) as string);
      expect(parsed.status).toBe('ok');
      expect(Object.keys(parsed.acks).sort()).toEqual(['example.first-goal', 'example.welcome']);
    });

    it('does not overwrite data written by a newer client, but still works in memory', () => {
      const storage = new MemoryStorage();
      const key = buildTutorialAckStorageKey('acct-1');
      const future = JSON.stringify({ version: 7, shiny: true });
      storage.data.set(key, future);
      const store = createTutorialAckStore({ storage, accountId: 'acct-1' });
      expect(store.diagnostics().status).toBe('future-version');
      expect(store.acknowledge(welcome)).toEqual({ changed: true, persisted: false });
      expect(store.isAcknowledged(welcome)).toBe(true);
      expect(store.diagnostics().unpersisted).toBe(true);
      expect(storage.data.get(key)).toBe(future);
      expect(storage.setCalls).toEqual([]);
    });
  });

  describe('corrupt storage recovery', () => {
    const corruptValues: Array<[string, string]> = [
      ['invalid JSON', '{not json'],
      ['JSON null', 'null'],
      ['a number', '12'],
      ['wrong version', JSON.stringify({ version: 0, acks: {} })],
      ['acks not an object', JSON.stringify({ version: 1, acks: [] })]
    ];

    it.each(corruptValues)('recovers to an empty state from %s and preserves the bad bytes on next write', (_label, raw) => {
      const storage = new MemoryStorage();
      const key = buildTutorialAckStorageKey('acct-1');
      storage.data.set(key, raw);
      const store = createTutorialAckStore({ storage, accountId: 'acct-1' });
      expect(store.snapshot()).toEqual({});
      expect(store.isAcknowledged(welcome)).toBe(false);
      expect(store.diagnostics().status).toBe('recovered');

      expect(store.acknowledge(welcome)).toEqual({ changed: true, persisted: true });
      expect(storage.data.get(`${key}.corrupt`)).toBe(raw);
      expect(createTutorialAckStore({ storage, accountId: 'acct-1' }).isAcknowledged(welcome)).toBe(true);
    });

    it('keeps valid entries and drops only malformed ones', () => {
      const storage = new MemoryStorage();
      const key = buildTutorialAckStorageKey('acct-1');
      const good = { revision: 1, count: 1, firstAckedAt: 'a', lastAckedAt: 'b' };
      storage.data.set(key, JSON.stringify({ version: 1, acks: { 'example.welcome': good, 'example.bad': { revision: 'x' }, 'example.worse': 5 } }));
      const store = createTutorialAckStore({ storage, accountId: 'acct-1' });
      expect(store.snapshot()).toEqual({ 'example.welcome': good });
      expect(store.diagnostics()).toMatchObject({ status: 'recovered', droppedEntries: 2 });
    });

    it('corruption in one account does not affect another', () => {
      const storage = new MemoryStorage();
      storage.data.set(buildTutorialAckStorageKey('alice'), '{bad');
      createTutorialAckStore({ storage, accountId: 'bob' }).acknowledge(welcome);
      expect(createTutorialAckStore({ storage, accountId: 'alice' }).snapshot()).toEqual({});
      expect(createTutorialAckStore({ storage, accountId: 'bob' }).isAcknowledged(welcome)).toBe(true);
    });

    it('degrades to in-memory when storage throws, without throwing to the caller', () => {
      const storage: TutorialStorage = {
        getItem: vi.fn(() => { throw new Error('denied'); }),
        setItem: vi.fn(() => { throw new Error('quota'); }),
        removeItem: vi.fn(() => { throw new Error('denied'); })
      };
      const store = createTutorialAckStore({ storage, accountId: 'acct-1' });
      expect(store.isAcknowledged(welcome)).toBe(false);
      expect(store.acknowledge(welcome)).toEqual({ changed: true, persisted: false });
      expect(store.isAcknowledged(welcome)).toBe(true);
      expect(store.acknowledge(welcome).changed).toBe(false);
      expect(store.diagnostics()).toMatchObject({ storageError: true, unpersisted: true });
      expect(() => store.clear()).not.toThrow();
    });
  });

  it('parse + serialize round-trips', () => {
    const ack = { revision: 2, count: 3, firstAckedAt: 'a', lastAckedAt: 'b' };
    const parsed = parseStoredTutorialAcks(serializeTutorialAcks({ b: ack, a: ack }));
    expect(parsed).toEqual({ acks: { a: ack, b: ack }, status: 'ok', droppedEntries: 0 });
    expect(serializeTutorialAcks({ b: ack, a: ack }).indexOf('"a"')).toBeLessThan(serializeTutorialAcks({ b: ack, a: ack }).indexOf('"b"'));
  });
});
