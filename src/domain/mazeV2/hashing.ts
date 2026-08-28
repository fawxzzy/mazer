// Deterministic canonical serialization + hashing for the mazeV2 domain
// model. Two concerns kept separate on purpose:
//
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

const MAZE_V2_HASH_DECIMAL_PLACES = 6;

// Same FNV-1a construction as legacyEndlessProgression.ts's
// hashLegacySeedString -- reused here rather than reimplemented so both
// modules' notion of "deterministic hash of a string" stays identical if
// either is ever audited together.
const fnv1aHash = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const roundForMazeV2Hash = (value: number): number => {
  if (!Number.isFinite(value)) {
    return value;
  }
  const factor = 10 ** MAZE_V2_HASH_DECIMAL_PLACES;
  return Math.round(value * factor) / factor;
};

// Recursively sorts object keys and rounds floats so structurally-identical
// values always canonicalize to the same JSON string, regardless of
// construction order or floating-point summation noise. Arrays keep their
// order (order is meaningful for arrays in this domain -- e.g. relaxedAxes).
export const canonicalizeMazeV2Value = (value: unknown): unknown => {
  if (typeof value === 'number') {
    return roundForMazeV2Hash(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeMazeV2Value(entry));
  }
  if (value !== null && typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([leftKey], [rightKey]) => (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0));
    const canonicalObject: Record<string, unknown> = {};
    for (const [key, entryValue] of sortedEntries) {
      canonicalObject[key] = canonicalizeMazeV2Value(entryValue);
    }
    return canonicalObject;
  }
  return value;
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
export const hashMazeV2Value = (value: unknown): string => (
  fnv1aHash(canonicalizeMazeV2Json(value)).toString(16).padStart(8, '0')
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
