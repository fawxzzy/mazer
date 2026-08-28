import { createHash } from 'node:crypto';
import type { MazeV2MetricFingerprint, MazeV2RecipeDigest, MazeV2TopologyFingerprint } from './types';

// Deterministic canonical serialization + hashing for the mazeV2 domain
// model. Node-only (node:crypto, for the SHA-256 recipe digest): this
// module is consumed by the offline lab script and by tests, both of which
// run under Node -- nothing in src/scenes or the production browser bundle
// imports src/domain/mazeV2/ yet (see types.ts's own header comment), so
// this dependency does not reach the client build.
//
// Three concerns kept separate on purpose:
// 1. Object key order is not guaranteed stable across call sites that build
//    the same logical value slightly differently (e.g. object spread order),
//    so hashing JSON.stringify(value) directly would let two IDENTICAL
//    values hash differently. canonicalizeMazeV2Value sorts keys
//    recursively first.
// 2. Floating-point metrics (ratios, densities) can differ in their last
//    few bits between two runs that are conceptually identical (same
//    inputs, different floating-point summation order) -- roundForMazeV2Hash
//    fixes that by rounding to a stable decimal precision before hashing,
//    so "no identical adjacent recipe fingerprints" (a later-wave
//    acceptance criterion) compares real structural differences, not noise.
// 3. Silent data loss must never happen inside a hash input. JSON.stringify
//    quietly turns NaN/Infinity into `null` and drops undefined object
//    values and functions/symbols entirely -- exactly the kind of mistake
//    that would make two meaningfully-different inputs hash identically.
//    canonicalizeMazeV2Value throws instead of ever reaching that
//    silent-coercion behavior.

const MAZE_V2_HASH_DECIMAL_PLACES = 6;

// Same FNV-1a construction as legacyEndlessProgression.ts's
// hashLegacySeedString -- reused here rather than reimplemented so both
// modules' notion of "deterministic hash of a string" stays identical if
// either is ever audited together. Only used for MazeV2MetricFingerprint,
// where a cheap, collision-tolerant hash is the explicit design (see that
// type's own doc comment in types.ts) -- MazeV2RecipeDigest uses real
// SHA-256 instead, since durable provenance cannot tolerate casual
// collisions the way a similarity bucket can.
const fnv1aHash = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const roundForMazeV2Hash = (value: number): number => (
  Math.round(value * (10 ** MAZE_V2_HASH_DECIMAL_PLACES)) / (10 ** MAZE_V2_HASH_DECIMAL_PLACES)
);

class MazeV2CanonicalizationError extends TypeError {}

// Recursively sorts object keys and rounds floats so structurally-identical
// values always canonicalize to the same JSON string, regardless of
// construction order or floating-point summation noise. Arrays keep their
// order (order is meaningful for arrays in this domain -- e.g. relaxedAxes,
// candidateSeeds). Throws rather than silently coercing on any value that
// can't round-trip through a hash meaningfully: NaN, +-Infinity, undefined,
// functions, symbols, and bigint (JSON has no representation for any of
// these, and every existing caller in this module has no legitimate reason
// to pass one -- a value like that reaching here means the caller built its
// input wrong, not that this function should paper over it).
export const canonicalizeMazeV2Value = (value: unknown): unknown => {
  if (value === null) {
    return null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new MazeV2CanonicalizationError(`Cannot canonicalize a non-finite number: ${String(value)}`);
    }
    return roundForMazeV2Hash(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'undefined') {
    throw new MazeV2CanonicalizationError('Cannot canonicalize undefined');
  }
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    throw new MazeV2CanonicalizationError(`Cannot canonicalize a value of type ${typeof value}`);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeMazeV2Value(entry));
  }
  if (ArrayBuffer.isView(value)) {
    // Typed arrays (e.g. a packed grid representation) serialize as a plain
    // array of their numeric elements -- deterministic regardless of the
    // specific typed-array constructor used to build them.
    return Array.from(value as unknown as ArrayLike<number>, (entry) => canonicalizeMazeV2Value(entry));
  }
  if (typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([leftKey], [rightKey]) => (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0));
    const canonicalObject: Record<string, unknown> = {};
    for (const [key, entryValue] of sortedEntries) {
      canonicalObject[key] = canonicalizeMazeV2Value(entryValue);
    }
    return canonicalObject;
  }
  throw new MazeV2CanonicalizationError(`Cannot canonicalize a value of type ${typeof value}`);
};

export const canonicalizeMazeV2Json = (value: unknown): string => (
  JSON.stringify(canonicalizeMazeV2Value(value))
);

// A single FNV-1a pass is intentionally weak as a cryptographic hash --
// this is a structural fingerprint for novelty/dedup comparisons within one
// generation run, never a security boundary. Returned as an 8-character
// hex string (one 32-bit hash) for compactness in reports/galleries;
// collisions are acceptable here in the same way they're acceptable for
// legacyEndlessProgression.ts's own seed hashing -- a false "looks similar"
// match just costs one extra generation retry, not a correctness bug.
const hashMazeV2ValueRaw = (value: unknown): string => (
  fnv1aHash(canonicalizeMazeV2Json(value)).toString(16).padStart(8, '0')
);

// Retained as a plain-string export for call sites that don't yet need the
// branded MazeV2MetricFingerprint distinction (e.g. metrics.ts's own
// internal use before it's assigned to the branded field). Prefer
// createMazeV2MetricFingerprint at any boundary that produces a value
// callers will treat as a real fingerprint.
export const hashMazeV2Value = hashMazeV2ValueRaw;

export const createMazeV2MetricFingerprint = (value: unknown): MazeV2MetricFingerprint => (
  hashMazeV2ValueRaw(value) as MazeV2MetricFingerprint
);

// Exact topology identity. Callers must pass ONLY topology-defining fields
// (dimensions, walkable layout, start, goal, wrap pairs) -- see
// MazeV2TopologyFingerprint's own doc comment in types.ts. This function
// has no way to enforce that at the type level (the input is deliberately
// a plain canonicalizable value, not a MazeV2CanonicalMaze, so callers
// bridging from either engine's own shape aren't forced through an extra
// conversion just to compute a fingerprint) -- correctness here is the
// caller's responsibility, verified by tests/mazeV2/identity.test.ts's own
// "two different seeds, same resulting graph -> same topology fingerprint"
// case instead.
export const createMazeV2TopologyFingerprint = (topologyOnlyValue: unknown): MazeV2TopologyFingerprint => (
  createHash('sha256').update(canonicalizeMazeV2Json(topologyOnlyValue)).digest('hex') as MazeV2TopologyFingerprint
);

// Durable recipe provenance. Real SHA-256, not FNV-1a: this identity is
// meant to be persisted, compared across sessions/devices, and eventually
// verified server-side, where a cheap 32-bit hash's routine collisions
// would be a real correctness problem, not just a novelty-heuristic
// nuisance. Callers must pass a value built ONLY from resolved generation
// contract fields, never measured outcome -- see MazeV2RecipeDigest's own
// doc comment in types.ts.
export const createMazeV2RecipeDigest = (resolvedContractValue: unknown): MazeV2RecipeDigest => (
  createHash('sha256').update(canonicalizeMazeV2Json(resolvedContractValue)).digest('hex') as MazeV2RecipeDigest
);

// Euclidean distance between two same-shaped numeric vectors (e.g. two
// MazeV2TargetVector instances, or two flattened metrics objects) -- the
// shared building block for target-fit distance and novelty distance
// during candidate selection in a later wave.
export const resolveMazeV2VectorDistance = (
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>
): number => {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  let sumOfSquares = 0;
  for (const key of keys) {
    const delta = (left[key] ?? 0) - (right[key] ?? 0);
    sumOfSquares += delta * delta;
  }
  return Math.sqrt(sumOfSquares);
};
