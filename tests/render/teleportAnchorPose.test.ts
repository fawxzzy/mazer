import { describe, expect, test } from 'vitest';
import {
  resolveTeleportAnchorCandidates,
  resolveTeleportAnchorEligibility,
  resolveTeleportAnchorPoses,
  type TeleportRect
} from '../../src/render/teleportAnchorPose';
import { selectTeleportPrimaryAnchor, type TeleportAnchorId } from '../../src/render/teleportPrimaryAnchor';
import { resolveLegacyMenuPathTitleOrbitPose } from '../../src/legacy-runtime/legacyMenuTitle';

const VIEWPORT = { width: 400, height: 800 };
const SHELL_SIDE = 40;
// The minimum inset that keeps a shellSide-wide rotated-square footprint
// fully within the viewport at EVERY possible target-facing rotation, not
// just the axis-aligned ones -- half the worst-case (45-degree) rotated
// bounding side. Mirrors MenuScene.ts's own
// TELEPORT_ANCHOR_PREVIEW_VIEWPORT_INSET_PX derivation exactly.
const CLEARING_INSET = (SHELL_SIDE * Math.SQRT2) / 2;

describe('resolveTeleportAnchorPoses', () => {
  test('all eight identities are handled and land on the inset viewport perimeter', () => {
    const poses = resolveTeleportAnchorPoses(VIEWPORT, { x: 200, y: 400 }, SHELL_SIDE);
    expect(poses).toHaveLength(8);
    expect(poses.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  test('cross-checks position against the REAL MenuScene.ts export (resolveLegacyMenuPathTitleOrbitPose), not a re-derivation', () => {
    // Same geometry MenuScene.ts's own private resolveLegacyMenuPathTitleOrbitGeometry()
    // builds for the viewport-edge case: inset=2 from the raw viewport bounds.
    const inset = 2;
    const geometry = {
      bottom: VIEWPORT.height - inset,
      centerX: VIEWPORT.width / 2,
      centerY: VIEWPORT.height / 2,
      crownBottom: VIEWPORT.height - inset,
      crownHalf: 10,
      crownTop: inset,
      left: inset,
      right: VIEWPORT.width - inset,
      top: inset
    };

    const poses = resolveTeleportAnchorPoses(VIEWPORT, { x: 9999, y: 9999 }, SHELL_SIDE, inset);
    for (let id = 0; id < 8; id += 1) {
      const real = resolveLegacyMenuPathTitleOrbitPose(geometry, id / 8, false, false);
      const mine = poses[id];
      expect(mine.anchorX).toBeCloseTo(real.x, 9);
      expect(mine.anchorY).toBeCloseTo(real.y, 9);
    }
  });

  test('idle positions land exactly on the 4 corners and 4 edge midpoints (index 0/2/4/6 corners, 1/3/5/7 midpoints)', () => {
    const inset = 2;
    const poses = resolveTeleportAnchorPoses(VIEWPORT, { x: 0, y: 0 }, SHELL_SIDE, inset);
    const left = inset;
    const right = VIEWPORT.width - inset;
    const top = inset;
    const bottom = VIEWPORT.height - inset;

    expect([poses[0].anchorX, poses[0].anchorY]).toEqual([left, top]); // top-left corner
    expect([poses[1].anchorX, poses[1].anchorY]).toEqual([(left + right) / 2, top]); // top mid
    expect([poses[2].anchorX, poses[2].anchorY]).toEqual([right, top]); // top-right corner
    expect([poses[3].anchorX, poses[3].anchorY]).toEqual([right, (top + bottom) / 2]); // right mid
    expect([poses[4].anchorX, poses[4].anchorY]).toEqual([right, bottom]); // bottom-right corner
    expect([poses[5].anchorX, poses[5].anchorY]).toEqual([(left + right) / 2, bottom]); // bottom mid
    expect([poses[6].anchorX, poses[6].anchorY]).toEqual([left, bottom]); // bottom-left corner
    expect([poses[7].anchorX, poses[7].anchorY]).toEqual([left, (top + bottom) / 2]); // left mid
  });

  test('independently reproduces the derivative manifest\'s measured native tip angle (-59.43 degrees)', () => {
    // edge-diamond-energized.png: 1254x1254 canvas, center (627,627), measured tip (920,131).
    const angleDeg = Math.atan2(131 - 627, 920 - 627) * (180 / Math.PI);
    expect(angleDeg).toBeCloseTo(-59.43, 1);
  });

  test('rotation makes the measured tip face the real target, not a fixed viewport center', () => {
    // Anchor 2 sits at the top-right corner; target is far to the right and
    // below -- its port must lie further toward that target than its own
    // anchor position (i.e. the beam actually reaches out toward it), and
    // the rotation must differ from what a center-facing pose would give.
    const target = { x: 2000, y: 2000 };
    const [, , anchor2] = resolveTeleportAnchorPoses(VIEWPORT, target, SHELL_SIDE);
    const inwardToCenter = Math.atan2((VIEWPORT.height / 2) - anchor2.anchorY, (VIEWPORT.width / 2) - anchor2.anchorX);
    const inwardToTarget = Math.atan2(target.y - anchor2.anchorY, target.x - anchor2.anchorX);
    expect(inwardToCenter).not.toBeCloseTo(inwardToTarget, 3);

    // The port must be measurably farther from the anchor's own position
    // toward the target than the anchor position alone (i.e. it is a real
    // transformed point, not just the anchor's own coordinates repeated).
    const distanceAnchorToTarget = Math.hypot(target.x - anchor2.anchorX, target.y - anchor2.anchorY);
    const distancePortToTarget = Math.hypot(target.x - anchor2.portX, target.y - anchor2.portY);
    expect(distancePortToTarget).toBeLessThan(distanceAnchorToTarget);
  });

  test('a zero-length target direction (target sits exactly on the anchor) does not produce NaN', () => {
    const poses = resolveTeleportAnchorPoses(VIEWPORT, { x: 2, y: 2 }, SHELL_SIDE); // anchor 0 sits at (2,2) with inset 2
    const anchor0 = poses[0];
    expect(Number.isFinite(anchor0.rotation)).toBe(true);
    expect(Number.isFinite(anchor0.portX)).toBe(true);
    expect(Number.isFinite(anchor0.portY)).toBe(true);
  });

  test('a larger shell canvas side produces a proportionally larger footprint and port offset', () => {
    // A target dead ahead of the anchor's own inward-facing axis keeps
    // rotation (and so the rotated-AABB factor) identical between the two
    // sizes, isolating the scale comparison to the size change alone.
    const target = { x: 9999, y: 9999 };
    const small = resolveTeleportAnchorPoses(VIEWPORT, target, 20)[0];
    const large = resolveTeleportAnchorPoses(VIEWPORT, target, 40)[0];
    expect(large.footprint.width).toBeCloseTo(small.footprint.width * 2, 6);
    const smallPortDistance = Math.hypot(small.portX - small.anchorX, small.portY - small.anchorY);
    const largePortDistance = Math.hypot(large.portX - large.anchorX, large.portY - large.anchorY);
    expect(largePortDistance).toBeCloseTo(smallPortDistance * 2, 6);
  });

  describe('rotation-aware footprint (reviewer-caught defect: a fixed unrotated box under-counts a rotated shell)', () => {
    // Transforms the source canvas's own 4 corners (a shellSide x shellSide
    // square centered on the anchor) through the pose's real rotation, the
    // same way the rendered Image itself is rotated -- then asserts the
    // reported footprint contains all 4 transformed corners. This proves
    // the footprint against the actual transformed source geometry, not
    // merely that the function's own output is self-consistent.
    const rotatedCorners = (centerX: number, centerY: number, side: number, rotation: number) => {
      const half = side / 2;
      const localCorners = [[-half, -half], [half, -half], [half, half], [-half, half]];
      return localCorners.map(([lx, ly]) => ({
        x: centerX + (lx * Math.cos(rotation)) - (ly * Math.sin(rotation)),
        y: centerY + (lx * Math.sin(rotation)) + (ly * Math.cos(rotation))
      }));
    };

    const footprintContainsPoint = (footprint: TeleportRect, point: { x: number; y: number }, epsilon = 1e-6) => (
      point.x >= footprint.x - epsilon
      && point.y >= footprint.y - epsilon
      && point.x <= footprint.x + footprint.width + epsilon
      && point.y <= footprint.y + footprint.height + epsilon
    );

    test.each([
      { label: '0 degrees (axis-aligned)', target: { x: 9999, y: 400 } },
      { label: '~45 degrees (worst case)', target: { x: 9999, y: 9999 } },
      { label: '~135 degrees', target: { x: -9999, y: 9999 } },
      { label: 'a real near target, not just a far one', target: { x: 250, y: 450 } }
    ])('reported footprint contains the transformed source canvas corners at $label, at two different sizes', ({ target }) => {
      for (const shellSide of [20, 40, 64]) {
        const [pose] = resolveTeleportAnchorPoses(VIEWPORT, target, shellSide, 100);
        const corners = rotatedCorners(pose.anchorX, pose.anchorY, shellSide, pose.rotation);
        for (const corner of corners) {
          expect(footprintContainsPoint(pose.footprint, corner)).toBe(true);
        }
      }
    });

    test('a FIXED unrotated-size footprint would NOT contain the rotated corners at 45 degrees -- proving the rotation-aware fix is load-bearing, not redundant', () => {
      const target = { x: 9999, y: 9999 };
      const shellSide = 40;
      const [pose] = resolveTeleportAnchorPoses(VIEWPORT, target, shellSide, 100);
      const corners = rotatedCorners(pose.anchorX, pose.anchorY, shellSide, pose.rotation);
      const fixedFootprint: TeleportRect = {
        x: pose.anchorX - (shellSide / 2),
        y: pose.anchorY - (shellSide / 2),
        width: shellSide,
        height: shellSide
      };
      const anyCornerEscapes = corners.some((corner) => !footprintContainsPoint(fixedFootprint, corner));
      expect(anyCornerEscapes).toBe(true);
    });
  });

  test('an inset of half the WORST-CASE (45-degree) rotated footprint keeps every anchor fully within the viewport at every angle (half the unrotated side alone does not)', () => {
    const poses = resolveTeleportAnchorPoses(VIEWPORT, { x: 9999, y: 9999 }, SHELL_SIDE, CLEARING_INSET);
    for (const pose of poses) {
      expect(pose.footprint.x).toBeGreaterThanOrEqual(-1e-9);
      expect(pose.footprint.y).toBeGreaterThanOrEqual(-1e-9);
      expect(pose.footprint.x + pose.footprint.width).toBeLessThanOrEqual(VIEWPORT.width + 1e-9);
      expect(pose.footprint.y + pose.footprint.height).toBeLessThanOrEqual(VIEWPORT.height + 1e-9);
    }

    // Confirms half the UNROTATED side (the old, insufficient formula) does
    // NOT provide this guarantee once rotation is accounted for -- proving
    // this test exercises a real distinction, not something trivially true
    // regardless of inset.
    const halfSideOnly = resolveTeleportAnchorPoses(VIEWPORT, { x: 9999, y: 9999 }, SHELL_SIDE, SHELL_SIDE / 2);
    const anyOffCanvas = halfSideOnly.some((pose) => (
      pose.footprint.x < 0 || pose.footprint.y < 0
      || pose.footprint.x + pose.footprint.width > VIEWPORT.width
      || pose.footprint.y + pose.footprint.height > VIEWPORT.height
    ));
    expect(anyOffCanvas).toBe(true);
  });

  test('inputs are never mutated', () => {
    const viewport = { ...VIEWPORT };
    const target = { x: 5, y: 5 };
    const viewportSnapshot = { ...viewport };
    const targetSnapshot = { ...target };
    resolveTeleportAnchorPoses(viewport, target, SHELL_SIDE);
    expect(viewport).toEqual(viewportSnapshot);
    expect(target).toEqual(targetSnapshot);
  });
});

describe('resolveTeleportAnchorEligibility', () => {
  test('an anchor with no intersecting exclusion, fully within the viewport, is eligible', () => {
    const [pose] = resolveTeleportAnchorPoses(VIEWPORT, { x: 200, y: 400 }, SHELL_SIDE, CLEARING_INSET);
    const result = resolveTeleportAnchorEligibility(pose, [], VIEWPORT);
    expect(result.eligible).toBe(true);
    expect(result.ineligibleReason).toBeUndefined();
  });

  test('an anchor whose footprint intersects a HUD/safe-area exclusion is ineligible with a reason', () => {
    const [pose] = resolveTeleportAnchorPoses(VIEWPORT, { x: 200, y: 400 }, SHELL_SIDE, CLEARING_INSET); // top-left corner
    const exclusion: TeleportRect = { x: 0, y: 0, width: 100, height: 100 }; // covers the top-left corner
    const result = resolveTeleportAnchorEligibility(pose, [exclusion], VIEWPORT);
    expect(result.eligible).toBe(false);
    expect(result.ineligibleReason).toBeTruthy();
  });

  test('an exclusion that does not touch the footprint leaves the anchor eligible (real intersection test, not "any exclusion exists")', () => {
    const anchor0 = resolveTeleportAnchorPoses(VIEWPORT, { x: 200, y: 400 }, SHELL_SIDE, CLEARING_INSET)[0]; // top-left corner
    const farExclusion: TeleportRect = { x: VIEWPORT.width - 50, y: VIEWPORT.height - 50, width: 50, height: 50 }; // bottom-right area
    const result = resolveTeleportAnchorEligibility(anchor0, [farExclusion], VIEWPORT);
    expect(result.eligible).toBe(true);
  });

  test('an exclusion that only touches the footprint\'s edge (zero-area overlap) does not falsely count as intersecting', () => {
    const [pose] = resolveTeleportAnchorPoses(VIEWPORT, { x: 200, y: 400 }, SHELL_SIDE, CLEARING_INSET); // top-left corner
    // An exclusion placed exactly flush against the footprint's right edge
    // shares only a boundary line, not an overlapping area.
    const flushExclusion: TeleportRect = {
      x: pose.footprint.x + pose.footprint.width,
      y: pose.footprint.y,
      width: 50,
      height: 50
    };
    const result = resolveTeleportAnchorEligibility(pose, [flushExclusion], VIEWPORT);
    expect(result.eligible).toBe(true);
  });

  describe('viewport containment (new: a footprint that would render partly off-canvas is ineligible)', () => {
    test('a footprint that exceeds the viewport is ineligible even with zero exclusions', () => {
      // A tiny inset (2px) with a 45-degree-facing rotation produces a
      // footprint that overruns the viewport at this corner.
      const [pose] = resolveTeleportAnchorPoses(VIEWPORT, { x: 9999, y: 9999 }, SHELL_SIDE, 2);
      const result = resolveTeleportAnchorEligibility(pose, [], VIEWPORT);
      expect(result.eligible).toBe(false);
      expect(result.ineligibleReason).toContain('viewport');
    });

    test('omitting the viewport argument skips the containment check (backward-compatible opt-in)', () => {
      const [pose] = resolveTeleportAnchorPoses(VIEWPORT, { x: 9999, y: 9999 }, SHELL_SIDE, 2);
      const result = resolveTeleportAnchorEligibility(pose, []);
      expect(result.eligible).toBe(true);
    });
  });
});

describe('resolveTeleportAnchorCandidates (real pose+clearance feeding the real selector)', () => {
  test('produces candidates the real selectTeleportPrimaryAnchor accepts and resolves correctly', () => {
    const target = { x: VIEWPORT.width - 10, y: 10 }; // near the top-right corner (anchor 2)
    const candidates = resolveTeleportAnchorCandidates(VIEWPORT, target, SHELL_SIDE, [], CLEARING_INSET);
    const result = selectTeleportPrimaryAnchor({ candidates, target, heldAnchorId: null });
    expect(result.outcome).toBe('new');
    expect(result.selectedId).toBe(2);
  });

  test('a real HUD exclusion over the nearest anchor causes the selector to pick the next-nearest real anchor', () => {
    const target = { x: VIEWPORT.width - 10, y: 10 }; // near anchor 2 (top-right corner)
    const exclusion: TeleportRect = { x: VIEWPORT.width - 80, y: 0, width: 80, height: 80 }; // covers anchor 2's whole footprint
    const candidates = resolveTeleportAnchorCandidates(VIEWPORT, target, SHELL_SIDE, [exclusion], CLEARING_INSET);
    expect(candidates.find((c) => c.id === 2)!.eligible).toBe(false);

    const result = selectTeleportPrimaryAnchor({ candidates, target, heldAnchorId: null });
    expect(result.outcome).toBe('new');
    expect(result.selectedId).not.toBe(2);
  });

  test('the visibility/clearance distinction: hidden-but-legally-placeable is not modeled as an exclusion, so it stays eligible', () => {
    // This module has no concept of "hidden" or "not yet mounted" at all --
    // eligibility here comes only from real geometric clearance (exclusions
    // and viewport containment). A caller that wants to reflect a
    // temporarily-hidden sprite must NOT do so by fabricating an exclusion
    // rectangle for it; that would conflate rendering state with legal
    // placement, which the frozen contract and this module's own
    // documentation both explicitly reject.
    const target = { x: 200, y: 400 };
    const candidates = resolveTeleportAnchorCandidates(VIEWPORT, target, SHELL_SIDE, [], CLEARING_INSET);
    expect(candidates.every((c) => c.eligible)).toBe(true);
  });

  test('retention still works end-to-end through real poses: a closer anchor appearing does not reselect a held, eligible anchor', () => {
    const heldId = 6 as TeleportAnchorId;
    const outboundTarget = { x: 10, y: VIEWPORT.height - 10 }; // near anchor 6 itself
    const outboundCandidates = resolveTeleportAnchorCandidates(VIEWPORT, outboundTarget, SHELL_SIDE, [], CLEARING_INSET);
    const outbound = selectTeleportPrimaryAnchor({ candidates: outboundCandidates, target: outboundTarget, heldAnchorId: heldId });
    expect(outbound.selectedId).toBe(heldId);

    const deliveryTarget = { x: VIEWPORT.width - 10, y: 10 }; // now near anchor 2 instead
    const deliveryCandidates = resolveTeleportAnchorCandidates(VIEWPORT, deliveryTarget, SHELL_SIDE, [], CLEARING_INSET);
    const delivering = selectTeleportPrimaryAnchor({ candidates: deliveryCandidates, target: deliveryTarget, heldAnchorId: heldId });
    expect(delivering.outcome).toBe('retained');
    expect(delivering.selectedId).toBe(heldId);
  });

  test('excluding every anchor but one leaves exactly that one selectable, regardless of which is nearest the target', () => {
    // Build one exclusion rectangle directly over each anchor's own real
    // footprint except anchor 6's -- proves the selector genuinely
    // reads per-anchor eligibility rather than merely preferring distance.
    const target = { x: VIEWPORT.width - 10, y: 10 }; // nearest to anchor 2, which is excluded below
    const referencePoses = resolveTeleportAnchorPoses(VIEWPORT, target, SHELL_SIDE, CLEARING_INSET);
    const exclusions = referencePoses
      .filter((pose) => pose.id !== 6)
      .map((pose): TeleportRect => ({ ...pose.footprint }));

    const candidates = resolveTeleportAnchorCandidates(VIEWPORT, target, SHELL_SIDE, exclusions, CLEARING_INSET);
    const eligibleIds = candidates.filter((c) => c.eligible).map((c) => c.id);
    expect(eligibleIds).toEqual([6]);
    const result = selectTeleportPrimaryAnchor({ candidates, target, heldAnchorId: null });
    expect(result.selectedId).toBe(6);
  });
});
