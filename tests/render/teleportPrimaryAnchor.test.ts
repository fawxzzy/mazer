import { describe, expect, test } from 'vitest';
import {
  selectTeleportPrimaryAnchor,
  type TeleportAnchorCandidate,
  type TeleportAnchorId
} from '../../src/render/teleportPrimaryAnchor';

// Eight candidates at the "4 corners + 4 edge midpoints" resting layout the
// existing title-orbit sigils use when idle (see teleportPrimaryAnchor.ts's
// module doc) -- a 100x100 logical square, ids 0-7 clockwise from the
// top-left corner. All eligible by default; individual tests override.
const EIGHT_ANCHORS_100: ReadonlyArray<TeleportAnchorCandidate> = [
  { id: 0, portX: 0, portY: 0, eligible: true }, // top-left corner
  { id: 1, portX: 50, portY: 0, eligible: true }, // top edge midpoint
  { id: 2, portX: 100, portY: 0, eligible: true }, // top-right corner
  { id: 3, portX: 100, portY: 50, eligible: true }, // right edge midpoint
  { id: 4, portX: 100, portY: 100, eligible: true }, // bottom-right corner
  { id: 5, portX: 50, portY: 100, eligible: true }, // bottom edge midpoint
  { id: 6, portX: 0, portY: 100, eligible: true }, // bottom-left corner
  { id: 7, portX: 0, portY: 50, eligible: true } // left edge midpoint
];

const withEligibility = (
  candidates: ReadonlyArray<TeleportAnchorCandidate>,
  overrides: Partial<Record<TeleportAnchorId, boolean>>
): TeleportAnchorCandidate[] => (
  candidates.map((candidate) => (
    candidate.id in overrides
      ? { ...candidate, eligible: overrides[candidate.id]!, ineligibleReason: overrides[candidate.id] ? undefined : 'test-excluded' }
      : candidate
  ))
);

describe('selectTeleportPrimaryAnchor', () => {
  test('nearest valid beam port wins for a new transfer', () => {
    const result = selectTeleportPrimaryAnchor({
      candidates: EIGHT_ANCHORS_100,
      target: { x: 96, y: 4 }, // closest to anchor 2 (top-right corner, 100,0)
      heldAnchorId: null
    });
    expect(result.outcome).toBe('new');
    expect(result.selectedId).toBe(2);
  });

  test('nearest center and nearest port disagree: the PORT position wins', () => {
    // Anchor 0's "center" would be far from the target, but its port is
    // placed right next to it -- proves selection uses portX/portY, not
    // some other notion of the anchor's position.
    const candidates: TeleportAnchorCandidate[] = [
      { id: 0, portX: 10, portY: 10, eligible: true },
      { id: 1, portX: 90, portY: 90, eligible: true }
    ];
    const result = selectTeleportPrimaryAnchor({
      candidates,
      target: { x: 11, y: 11 },
      heldAnchorId: null
    });
    expect(result.selectedId).toBe(0);
  });

  test('nearest candidate is excluded (ineligible): the next valid candidate wins', () => {
    const candidates = withEligibility(EIGHT_ANCHORS_100, { 2: false });
    const result = selectTeleportPrimaryAnchor({
      candidates,
      target: { x: 96, y: 4 }, // nearest is 2 (excluded), next nearest is 1 or 3
      heldAnchorId: null
    });
    expect(result.outcome).toBe('new');
    expect(result.selectedId).not.toBe(2);
    // Anchor 1 (50,0) is distance^2 = 46^2+4^2=2132; anchor 3 (100,50) is
    // distance^2 = 4^2+46^2=2132 -- an exact tie, so the fixed lowest-ID
    // order must pick anchor 1.
    expect(result.selectedId).toBe(1);
  });

  test('equal-distance tie uses the fixed (lowest) anchor-ID order', () => {
    const candidates: TeleportAnchorCandidate[] = [
      { id: 5, portX: -10, portY: 0, eligible: true },
      { id: 2, portX: 10, portY: 0, eligible: true },
      { id: 7, portX: 0, portY: 10, eligible: true }
    ];
    const result = selectTeleportPrimaryAnchor({
      candidates,
      target: { x: 0, y: 0 }, // all three are equidistant (distance^2 = 100)
      heldAnchorId: null
    });
    expect(result.selectedId).toBe(2); // lowest id among the tied set
  });

  test('candidate-array permutations preserve the result', () => {
    const target = { x: 30, y: 70 };
    const forward = selectTeleportPrimaryAnchor({ candidates: EIGHT_ANCHORS_100, target, heldAnchorId: null });
    const shuffled = [...EIGHT_ANCHORS_100].reverse();
    const reversed = selectTeleportPrimaryAnchor({ candidates: shuffled, target, heldAnchorId: null });
    expect(reversed.selectedId).toBe(forward.selectedId);
    expect(reversed.outcome).toBe(forward.outcome);
  });

  test('repeated identical inputs preserve the result', () => {
    const input = { candidates: EIGHT_ANCHORS_100, target: { x: 12, y: 88 }, heldAnchorId: null as TeleportAnchorId | null };
    const first = selectTeleportPrimaryAnchor(input);
    const second = selectTeleportPrimaryAnchor(input);
    expect(second).toEqual(first);
  });

  test('all eight identities are individually selectable', () => {
    for (const anchor of EIGHT_ANCHORS_100) {
      const result = selectTeleportPrimaryAnchor({
        candidates: EIGHT_ANCHORS_100,
        target: { x: anchor.portX, y: anchor.portY },
        heldAnchorId: null
      });
      expect(result.selectedId).toBe(anchor.id);
    }
  });

  test('all candidates ineligible returns explicit unavailability, not a fallback pick', () => {
    const candidates = EIGHT_ANCHORS_100.map((candidate) => ({ ...candidate, eligible: false, ineligibleReason: 'hud-overlap' }));
    const result = selectTeleportPrimaryAnchor({ candidates, target: { x: 0, y: 0 }, heldAnchorId: null });
    expect(result.outcome).toBe('unavailable');
    expect(result.selectedId).toBeNull();
    expect(result.rejected).toHaveLength(8);
    expect(result.rejected.every((r) => r.reason === 'hud-overlap')).toBe(true);
  });

  test('duplicate candidate IDs are rejected as invalid input', () => {
    const candidates: TeleportAnchorCandidate[] = [
      { id: 0, portX: 0, portY: 0, eligible: true },
      { id: 0, portX: 10, portY: 10, eligible: true }
    ];
    const result = selectTeleportPrimaryAnchor({ candidates, target: { x: 0, y: 0 }, heldAnchorId: null });
    expect(result.outcome).toBe('invalid-input');
    expect(result.selectedId).toBeNull();
  });

  test('an unknown candidate ID (outside 0-7) is rejected as invalid input', () => {
    const candidates = [{ id: 8, portX: 0, portY: 0, eligible: true }] as unknown as TeleportAnchorCandidate[];
    const result = selectTeleportPrimaryAnchor({ candidates, target: { x: 0, y: 0 }, heldAnchorId: null });
    expect(result.outcome).toBe('invalid-input');
  });

  test('an unknown heldAnchorId (outside 0-7 or not null) is rejected as invalid input', () => {
    const result = selectTeleportPrimaryAnchor({
      candidates: EIGHT_ANCHORS_100,
      target: { x: 0, y: 0 },
      heldAnchorId: 9 as unknown as TeleportAnchorId
    });
    expect(result.outcome).toBe('invalid-input');
  });

  test('non-finite candidate coordinates are rejected as invalid input', () => {
    const candidates: TeleportAnchorCandidate[] = [{ id: 0, portX: Number.NaN, portY: 0, eligible: true }];
    const result = selectTeleportPrimaryAnchor({ candidates, target: { x: 0, y: 0 }, heldAnchorId: null });
    expect(result.outcome).toBe('invalid-input');
  });

  test('non-finite target coordinates are rejected as invalid input', () => {
    const result = selectTeleportPrimaryAnchor({
      candidates: EIGHT_ANCHORS_100,
      target: { x: Infinity, y: 0 },
      heldAnchorId: null
    });
    expect(result.outcome).toBe('invalid-input');
  });

  test('inputs are never mutated', () => {
    const candidates = EIGHT_ANCHORS_100.map((c) => ({ ...c }));
    const candidatesSnapshot = JSON.parse(JSON.stringify(candidates));
    const target = { x: 5, y: 5 };
    const targetSnapshot = { ...target };
    selectTeleportPrimaryAnchor({ candidates, target, heldAnchorId: null });
    expect(candidates).toEqual(candidatesSnapshot);
    expect(target).toEqual(targetSnapshot);
  });

  describe('retention across transfer phases', () => {
    test('previous valid primary is retained even though a different candidate is now closer', () => {
      // Anchor 6 held; target sits right next to anchor 2, which is
      // clearly nearer -- must still retain 6.
      const result = selectTeleportPrimaryAnchor({
        candidates: EIGHT_ANCHORS_100,
        target: { x: 96, y: 4 },
        heldAnchorId: 6
      });
      expect(result.outcome).toBe('retained');
      expect(result.selectedId).toBe(6);
    });

    test('a new delivery destination does not silently reselect the held anchor', () => {
      const held = 6 as TeleportAnchorId;
      const outboundResult = selectTeleportPrimaryAnchor({
        candidates: EIGHT_ANCHORS_100,
        target: { x: 4, y: 96 }, // extraction target near anchor 6 itself
        heldAnchorId: held
      });
      const deliveryResult = selectTeleportPrimaryAnchor({
        candidates: EIGHT_ANCHORS_100,
        target: { x: 96, y: 4 }, // delivery destination is now clear across the board
        heldAnchorId: held
      });
      expect(outboundResult.selectedId).toBe(held);
      expect(deliveryResult.selectedId).toBe(held);
      expect(deliveryResult.outcome).toBe('retained');
    });

    test('previous valid primary is retained identically across outbound, stored, and delivering calls', () => {
      const held = 3 as TeleportAnchorId;
      const outbound = selectTeleportPrimaryAnchor({ candidates: EIGHT_ANCHORS_100, target: { x: 10, y: 10 }, heldAnchorId: held });
      const stored = selectTeleportPrimaryAnchor({ candidates: EIGHT_ANCHORS_100, target: { x: 10, y: 10 }, heldAnchorId: held });
      const delivering = selectTeleportPrimaryAnchor({ candidates: EIGHT_ANCHORS_100, target: { x: 90, y: 90 }, heldAnchorId: held });
      expect(outbound.selectedId).toBe(held);
      expect(stored.selectedId).toBe(held);
      expect(delivering.selectedId).toBe(held);
    });

    test('a permitted layout invalidation (held anchor now ineligible) remaps deterministically', () => {
      const candidates = withEligibility(EIGHT_ANCHORS_100, { 6: false });
      const result = selectTeleportPrimaryAnchor({
        candidates,
        target: { x: 4, y: 96 }, // nearest to the now-ineligible anchor 6
        heldAnchorId: 6
      });
      expect(result.outcome).toBe('remapped');
      expect(result.selectedId).not.toBe(6);
      // Nearest remaining eligible anchors to (4,96) are 5 (50,100) and 7
      // (0,50) -- 5 is closer (46^2+4^2=2132 vs 4^2+46^2=2132... exact tie,
      // so fixed ID order picks 5).
      expect(result.selectedId).toBe(5);
    });

    test('a held anchor missing entirely from the candidate set is treated as invalidated, not an error', () => {
      const candidates = EIGHT_ANCHORS_100.filter((c) => c.id !== 6);
      const result = selectTeleportPrimaryAnchor({
        candidates,
        target: { x: 4, y: 96 },
        heldAnchorId: 6
      });
      expect(result.outcome).toBe('remapped');
      expect(result.selectedId).not.toBeNull();
    });

    test('no eligible remap target returns explicit unavailability, not a stale or unsafe pick', () => {
      // Held anchor 6 is ineligible (invalidated) and every other candidate
      // is also ineligible -- there is nothing left to remap to.
      const candidates = EIGHT_ANCHORS_100.map((c) => ({ ...c, eligible: false, ineligibleReason: 'test-excluded' }));
      const result = selectTeleportPrimaryAnchor({
        candidates,
        target: { x: 4, y: 96 },
        heldAnchorId: 6
      });
      expect(result.outcome).toBe('unavailable');
      expect(result.selectedId).toBeNull();
    });

    test('a new transfer (heldAnchorId: null) does not inherit a previous transfer\'s stale selection', () => {
      const previousHeld = 6 as TeleportAnchorId;
      const previous = selectTeleportPrimaryAnchor({ candidates: EIGHT_ANCHORS_100, target: { x: 4, y: 96 }, heldAnchorId: previousHeld });
      expect(previous.selectedId).toBe(previousHeld);

      // A genuinely new transfer always passes heldAnchorId: null and gets
      // fresh selection based only on this call's own target/candidates.
      const fresh = selectTeleportPrimaryAnchor({ candidates: EIGHT_ANCHORS_100, target: { x: 96, y: 4 }, heldAnchorId: null });
      expect(fresh.outcome).toBe('new');
      expect(fresh.selectedId).toBe(2);
      expect(fresh.selectedId).not.toBe(previousHeld);
    });
  });

  describe('geometric invariances', () => {
    test('fractional coordinates work', () => {
      const candidates: TeleportAnchorCandidate[] = [
        { id: 0, portX: 0.1, portY: 0.2, eligible: true },
        { id: 1, portX: 99.9, portY: 99.8, eligible: true }
      ];
      const result = selectTeleportPrimaryAnchor({ candidates, target: { x: 0.15, y: 0.25 }, heldAnchorId: null });
      expect(result.selectedId).toBe(0);
    });

    test('translating every candidate and the target equally preserves the selection', () => {
      const target = { x: 30, y: 70 };
      const base = selectTeleportPrimaryAnchor({ candidates: EIGHT_ANCHORS_100, target, heldAnchorId: null });

      const shiftX = 1000;
      const shiftY = -500;
      const translated = EIGHT_ANCHORS_100.map((c) => ({ ...c, portX: c.portX + shiftX, portY: c.portY + shiftY }));
      const translatedResult = selectTeleportPrimaryAnchor({
        candidates: translated,
        target: { x: target.x + shiftX, y: target.y + shiftY },
        heldAnchorId: null
      });

      expect(translatedResult.selectedId).toBe(base.selectedId);
    });

    test('uniformly scaling the same logical geometry preserves the selection', () => {
      const target = { x: 30, y: 70 };
      const base = selectTeleportPrimaryAnchor({ candidates: EIGHT_ANCHORS_100, target, heldAnchorId: null });

      const scale = 7.5;
      const scaled = EIGHT_ANCHORS_100.map((c) => ({ ...c, portX: c.portX * scale, portY: c.portY * scale }));
      const scaledResult = selectTeleportPrimaryAnchor({
        candidates: scaled,
        target: { x: target.x * scale, y: target.y * scale },
        heldAnchorId: null
      });

      expect(scaledResult.selectedId).toBe(base.selectedId);
    });
  });
});
