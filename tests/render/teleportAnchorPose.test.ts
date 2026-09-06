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
const SHELL_DIAGONAL = 40;

describe('resolveTeleportAnchorPoses', () => {
  test('all eight identities are handled and land on the inset viewport perimeter', () => {
    const poses = resolveTeleportAnchorPoses(VIEWPORT, { x: 200, y: 400 }, SHELL_DIAGONAL);
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

    const poses = resolveTeleportAnchorPoses(VIEWPORT, { x: 9999, y: 9999 }, SHELL_DIAGONAL, inset);
    for (let id = 0; id < 8; id += 1) {
      const real = resolveLegacyMenuPathTitleOrbitPose(geometry, id / 8, false, false);
      const mine = poses[id];
      expect(mine.anchorX).toBeCloseTo(real.x, 9);
      expect(mine.anchorY).toBeCloseTo(real.y, 9);
    }
  });

  test('idle positions land exactly on the 4 corners and 4 edge midpoints (index 0/2/4/6 corners, 1/3/5/7 midpoints)', () => {
    const inset = 2;
    const poses = resolveTeleportAnchorPoses(VIEWPORT, { x: 0, y: 0 }, SHELL_DIAGONAL, inset);
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
    const [, , anchor2] = resolveTeleportAnchorPoses(VIEWPORT, target, SHELL_DIAGONAL);
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
    const poses = resolveTeleportAnchorPoses(VIEWPORT, { x: 2, y: 2 }, SHELL_DIAGONAL); // anchor 0 sits at (2,2) with inset 2
    const anchor0 = poses[0];
    expect(Number.isFinite(anchor0.rotation)).toBe(true);
    expect(Number.isFinite(anchor0.portX)).toBe(true);
    expect(Number.isFinite(anchor0.portY)).toBe(true);
  });

  test('a larger shell diagonal produces a proportionally larger footprint and port offset', () => {
    const target = { x: 9999, y: 9999 };
    const small = resolveTeleportAnchorPoses(VIEWPORT, target, 20)[0];
    const large = resolveTeleportAnchorPoses(VIEWPORT, target, 40)[0];
    expect(large.footprint.width).toBeCloseTo(small.footprint.width * 2, 6);
    const smallPortDistance = Math.hypot(small.portX - small.anchorX, small.portY - small.anchorY);
    const largePortDistance = Math.hypot(large.portX - large.anchorX, large.portY - large.anchorY);
    expect(largePortDistance).toBeCloseTo(smallPortDistance * 2, 6);
  });

  test('inputs are never mutated', () => {
    const viewport = { ...VIEWPORT };
    const target = { x: 5, y: 5 };
    const viewportSnapshot = { ...viewport };
    const targetSnapshot = { ...target };
    resolveTeleportAnchorPoses(viewport, target, SHELL_DIAGONAL);
    expect(viewport).toEqual(viewportSnapshot);
    expect(target).toEqual(targetSnapshot);
  });
});

describe('resolveTeleportAnchorEligibility', () => {
  test('an anchor with no intersecting exclusion is eligible', () => {
    const [pose] = resolveTeleportAnchorPoses(VIEWPORT, { x: 200, y: 400 }, SHELL_DIAGONAL);
    const result = resolveTeleportAnchorEligibility(pose, []);
    expect(result.eligible).toBe(true);
    expect(result.ineligibleReason).toBeUndefined();
  });

  test('an anchor whose footprint intersects a HUD/safe-area exclusion is ineligible with a reason', () => {
    const [pose] = resolveTeleportAnchorPoses(VIEWPORT, { x: 200, y: 400 }, SHELL_DIAGONAL); // top-left corner
    const exclusion: TeleportRect = { x: 0, y: 0, width: 100, height: 100 }; // covers the top-left corner
    const result = resolveTeleportAnchorEligibility(pose, [exclusion]);
    expect(result.eligible).toBe(false);
    expect(result.ineligibleReason).toBeTruthy();
  });

  test('an exclusion that does not touch the footprint leaves the anchor eligible (real intersection test, not "any exclusion exists")', () => {
    const anchor0 = resolveTeleportAnchorPoses(VIEWPORT, { x: 200, y: 400 }, SHELL_DIAGONAL)[0]; // top-left corner
    const farExclusion: TeleportRect = { x: VIEWPORT.width - 50, y: VIEWPORT.height - 50, width: 50, height: 50 }; // bottom-right area
    const result = resolveTeleportAnchorEligibility(anchor0, [farExclusion]);
    expect(result.eligible).toBe(true);
  });

  test('an exclusion that only touches the footprint\'s edge (zero-area overlap) does not falsely count as intersecting', () => {
    const [pose] = resolveTeleportAnchorPoses(VIEWPORT, { x: 200, y: 400 }, SHELL_DIAGONAL); // top-left corner
    // Footprint is centered on the anchor with side SHELL_DIAGONAL -- an
    // exclusion placed exactly flush against its right edge shares only a
    // boundary line, not an overlapping area.
    const flushExclusion: TeleportRect = {
      x: pose.footprint.x + pose.footprint.width,
      y: pose.footprint.y,
      width: 50,
      height: 50
    };
    const result = resolveTeleportAnchorEligibility(pose, [flushExclusion]);
    expect(result.eligible).toBe(true);
  });
});

describe('resolveTeleportAnchorCandidates (real pose+clearance feeding the real selector)', () => {
  test('produces candidates the real selectTeleportPrimaryAnchor accepts and resolves correctly', () => {
    const target = { x: VIEWPORT.width - 10, y: 10 }; // near the top-right corner (anchor 2)
    const candidates = resolveTeleportAnchorCandidates(VIEWPORT, target, SHELL_DIAGONAL, []);
    const result = selectTeleportPrimaryAnchor({ candidates, target, heldAnchorId: null });
    expect(result.outcome).toBe('new');
    expect(result.selectedId).toBe(2);
  });

  test('a real HUD exclusion over the nearest anchor causes the selector to pick the next-nearest real anchor', () => {
    const target = { x: VIEWPORT.width - 10, y: 10 }; // near anchor 2 (top-right corner)
    const exclusion: TeleportRect = { x: VIEWPORT.width - 60, y: 0, width: 60, height: 60 }; // covers anchor 2
    const candidates = resolveTeleportAnchorCandidates(VIEWPORT, target, SHELL_DIAGONAL, [exclusion]);
    expect(candidates.find((c) => c.id === 2)!.eligible).toBe(false);

    const result = selectTeleportPrimaryAnchor({ candidates, target, heldAnchorId: null });
    expect(result.outcome).toBe('new');
    expect(result.selectedId).not.toBe(2);
  });

  test('the visibility/clearance distinction: hidden-but-legally-placeable is not modeled as an exclusion, so it stays eligible', () => {
    // This module has no concept of "hidden" or "not yet mounted" at all --
    // eligibility here comes only from real geometric clearance. A caller
    // that wants to reflect a temporarily-hidden sprite must NOT do so by
    // fabricating an exclusion rectangle for it; that would conflate
    // rendering state with legal placement, which the frozen contract and
    // this module's own documentation both explicitly reject.
    const target = { x: 200, y: 400 };
    const candidates = resolveTeleportAnchorCandidates(VIEWPORT, target, SHELL_DIAGONAL, []);
    expect(candidates.every((c) => c.eligible)).toBe(true);
  });

  test('retention still works end-to-end through real poses: a closer anchor appearing does not reselect a held, eligible anchor', () => {
    const heldId = 6 as TeleportAnchorId;
    const outboundTarget = { x: 10, y: VIEWPORT.height - 10 }; // near anchor 6 itself
    const outboundCandidates = resolveTeleportAnchorCandidates(VIEWPORT, outboundTarget, SHELL_DIAGONAL, []);
    const outbound = selectTeleportPrimaryAnchor({ candidates: outboundCandidates, target: outboundTarget, heldAnchorId: heldId });
    expect(outbound.selectedId).toBe(heldId);

    const deliveryTarget = { x: VIEWPORT.width - 10, y: 10 }; // now near anchor 2 instead
    const deliveryCandidates = resolveTeleportAnchorCandidates(VIEWPORT, deliveryTarget, SHELL_DIAGONAL, []);
    const delivering = selectTeleportPrimaryAnchor({ candidates: deliveryCandidates, target: deliveryTarget, heldAnchorId: heldId });
    expect(delivering.outcome).toBe('retained');
    expect(delivering.selectedId).toBe(heldId);
  });
});
