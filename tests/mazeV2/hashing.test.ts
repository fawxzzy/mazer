import { describe, expect, test } from 'vitest';
import {
  canonicalizeMazeV2Json,
  canonicalizeMazeV2Value,
  createMazeV2MetricFingerprint,
  createMazeV2RecipeDigest,
  createMazeV2TopologyFingerprint,
  resolveMazeV2VectorDistance
} from '../../src/domain/mazeV2/hashing';

describe('mazeV2 canonicalization', () => {
  test('sorts object keys recursively regardless of construction order', () => {
    const a = { z: 1, a: { y: 2, b: 3 } };
    const b = { a: { b: 3, y: 2 }, z: 1 };
    expect(canonicalizeMazeV2Json(a)).toBe(canonicalizeMazeV2Json(b));
  });

  test('preserves array order -- arrays are not sorted', () => {
    expect(canonicalizeMazeV2Json([3, 1, 2])).not.toBe(canonicalizeMazeV2Json([1, 2, 3]));
  });

  test('rounds floats to a stable precision so summation-order noise does not change the hash', () => {
    const a = 0.1 + 0.2; // 0.30000000000000004 in IEEE-754
    const b = 0.3;
    expect(canonicalizeMazeV2Json({ value: a })).toBe(canonicalizeMazeV2Json({ value: b }));
  });

  test('rejects NaN instead of silently coercing it', () => {
    expect(() => canonicalizeMazeV2Value(Number.NaN)).toThrow(TypeError);
  });

  test('rejects positive and negative infinity', () => {
    expect(() => canonicalizeMazeV2Value(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => canonicalizeMazeV2Value(Number.NEGATIVE_INFINITY)).toThrow(TypeError);
  });

  test('rejects undefined instead of silently dropping it', () => {
    expect(() => canonicalizeMazeV2Value(undefined)).toThrow(TypeError);
    expect(() => canonicalizeMazeV2Value({ a: 1, b: undefined })).toThrow(TypeError);
  });

  test('rejects functions and symbols', () => {
    expect(() => canonicalizeMazeV2Value(() => {})).toThrow(TypeError);
    expect(() => canonicalizeMazeV2Value(Symbol('x'))).toThrow(TypeError);
  });

  test('rejects bigint', () => {
    expect(() => canonicalizeMazeV2Value(10n)).toThrow(TypeError);
  });

  test('serializes typed arrays deterministically as plain numeric arrays', () => {
    const typed = new Uint8Array([1, 0, 1, 1]);
    const plain = [1, 0, 1, 1];
    expect(canonicalizeMazeV2Json(typed)).toBe(canonicalizeMazeV2Json(plain));
  });

  test('null survives canonicalization as null, not as a rejected value', () => {
    expect(canonicalizeMazeV2Value(null)).toBeNull();
  });
});

describe('mazeV2 metric fingerprint', () => {
  test('is deterministic for the same canonical input', () => {
    const value = { a: 1, b: { c: 2 } };
    expect(createMazeV2MetricFingerprint(value)).toBe(createMazeV2MetricFingerprint(value));
  });

  test('differs for different input', () => {
    expect(createMazeV2MetricFingerprint({ a: 1 })).not.toBe(createMazeV2MetricFingerprint({ a: 2 }));
  });
});

describe('mazeV2 topology fingerprint', () => {
  test('is deterministic for the same canonical input', () => {
    const topology = { width: 3, height: 3, start: { x: 0, y: 0 }, goal: { x: 2, y: 2 }, walkable: ['111', '101', '111'] };
    expect(createMazeV2TopologyFingerprint(topology)).toBe(createMazeV2TopologyFingerprint(topology));
  });

  test('is a real (collision-resistant) digest, distinct in construction from the metric fingerprint', () => {
    const topology = { width: 3, height: 3, start: { x: 0, y: 0 }, goal: { x: 2, y: 2 }, walkable: ['111', '101', '111'] };
    // SHA-256 hex digests are 64 characters; the metric fingerprint is an
    // 8-character FNV-1a hex hash -- different lengths is a cheap, direct
    // proof these two functions are not secretly the same implementation.
    expect(createMazeV2TopologyFingerprint(topology)).toHaveLength(64);
    expect(createMazeV2MetricFingerprint(topology)).toHaveLength(8);
  });
});

describe('mazeV2 recipe digest', () => {
  test('is deterministic for the same canonical input', () => {
    const contract = { generatorVersion: 'v1', level: '5', requestedSeed: 42, selectedSeed: 42 };
    expect(createMazeV2RecipeDigest(contract)).toBe(createMazeV2RecipeDigest(contract));
  });

  test('differs when the seed differs, even if everything else matches', () => {
    const base = { generatorVersion: 'v1', level: '5', requestedSeed: 42 };
    expect(createMazeV2RecipeDigest({ ...base, selectedSeed: 42 }))
      .not.toBe(createMazeV2RecipeDigest({ ...base, selectedSeed: 43 }));
  });

  test('is a 64-character hex SHA-256 digest', () => {
    expect(createMazeV2RecipeDigest({ x: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('resolveMazeV2VectorDistance', () => {
  test('is zero for identical vectors', () => {
    expect(resolveMazeV2VectorDistance({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(0);
  });

  test('computes euclidean distance across the union of keys, treating a missing key as zero', () => {
    expect(resolveMazeV2VectorDistance({ a: 3 }, { a: 0, b: 4 })).toBe(5);
  });
});
