/**
 * Wave 4D-B: pure anchor-pose and clearance resolution for the frozen
 * docs/assets/reference/teleport-system-v1/ visual authority. Turns real
 * layout (viewport bounds, HUD/safe-area exclusion rectangles, and the
 * real extraction/delivery target) into the candidate data
 * teleportPrimaryAnchor.ts's selector needs -- each anchor's rotation,
 * transformed beam-port position, and eligibility.
 *
 * Like teleportPrimaryAnchor.ts, this module has no Phaser, DOM, network,
 * persistence, wall-clock, or randomness dependency, and never mutates its
 * inputs. It does not render anything -- a scene adapter supplies real
 * layout/exclusion numbers and is responsible for any drawing.
 *
 * ---------------------------------------------------------------------
 * Current model: logical poses for the procedural edge markers.
 * ---------------------------------------------------------------------
 * The eight anchors are the eight stations of the procedural diamond
 * ring in edgeMarkers.ts (4 corners + 4 edge midpoints, ids 0..7,
 * clockwise from the top-left corner). On arrival all eight diamonds fire
 * a beam inward and on departure the player fires a beam out to all eight;
 * the diamonds themselves are drawn by edgeMarkers.ts as small kites, not
 * as a sprite. This module draws nothing: it resolves a LOGICAL pose per
 * station (position, target-facing rotation, beam-port position and a
 * conservative footprint) so the primary-anchor selector and the QA
 * anchor-pose preview have real clearance data to work with.
 *
 * ---------------------------------------------------------------------
 * Anchor POSITION: the same perimeter formula edgeMarkers.ts uses.
 * ---------------------------------------------------------------------
 * Station `index` sits index/8 of the way round the viewport rectangle
 * inset by `inset` px, clockwise from the top-left corner: even ids land
 * on the four corners, odd ids on the four edge midpoints.
 * anchorPerimeterPosition() below is the same arithmetic as
 * edgeMarkers.ts's resolveEdgeStationPosition and as the settled (non-
 * spinning) case of legacyMenuTitle.ts's resolveLegacyMenuPathTitleOrbitPose.
 * It is reproduced rather than imported because the pose function's own
 * `facing` output points at a fixed viewport center, which is only
 * correct for the ambient menu case -- this module needs to face the real,
 * moving extraction/delivery target instead (see "Anchor ROTATION" below).
 * tests/render/edgeMarkers.test.ts checks the positions agree with
 * resolveEdgeStationPosition for every id, and
 * tests/render/teleportAnchorPose.test.ts cross-checks them against the
 * real resolveLegacyMenuPathTitleOrbitPose, so the reproduction is exact,
 * not just similar.
 *
 * ---------------------------------------------------------------------
 * Anchor ROTATION and PORT: calibrated from the frozen reference shell's
 * measured tip.
 * ---------------------------------------------------------------------
 * The rotation/port math is calibrated from the frozen reference
 * package's measurement, not from anything drawn at runtime. The
 * derivative manifest
 * (docs/assets/reference/teleport-system-v1/mazer-teleport-system-v1-derivative-manifest.json,
 * "_revision.measured_for_rotation") records, for the reference shell
 * canvas: 1254x1254 px, canvas center (627,627), measured visible inward
 * tip at (920,131), native_tip_angle_deg -59.43 (alpha-channel bounding
 * analysis, not eyeballed). NATIVE_TIP_* below is that exact measurement;
 * atan2(131-627, 920-627) independently reproduces -59.43 degrees (see
 * tests/render/teleportAnchorPose.test.ts). No reference image is loaded
 * or drawn: the live diamonds are the procedural kites in edgeMarkers.ts,
 * which point along each station's inward normal. The values here only
 * shape the logical pose (and therefore selection and clearance).
 *
 * Rotating the shell canvas by `rotation` moves any of its own
 * native-orientation features to (nativeAngle + rotation) in world space.
 * To make the measured tip (at NATIVE_TIP_ANGLE natively) face the real
 * inward angle toward the target, `rotation = inwardAngle - NATIVE_TIP_ANGLE`.
 * The resulting real-space port position is then the anchor's own
 * position plus the measured tip's native distance from center (scaled by
 * the shell's logical render scale) at that same inward angle.
 *
 * TELEPORT_SHELL_SOURCE_SIZE_PX is the reference shell canvas side (1254)
 * and is cross-checked against the same manifest's canvas_px in the test
 * file.
 *
 * ---------------------------------------------------------------------
 * Clearance: a conservative, ROTATION-AWARE axis-aligned bounding box.
 * ---------------------------------------------------------------------
 * The rendered shell is the entire square source canvas (side length
 * `shellCanvasSidePx` at zero rotation -- reviewer-caught naming defect
 * fixed here: this parameter was previously called `shellDiagonalPx`
 * while `scale = shellDiagonalPx / TELEPORT_SHELL_SOURCE_SIZE_PX` and the
 * footprint used it as an unrotated SIDE length, not a diagonal; the name
 * is corrected, the numeric value and intended visible shell size are
 * unchanged), scaled uniformly and then rotated by this pose's own
 * `rotation` about its center.
 *
 * A first version of this module used a FIXED axis-aligned square (side
 * = shellCanvasSidePx) regardless of rotation. That is not a general
 * conservative bound: a square of side S rotated by angle theta has an
 * axis-aligned bounding box of side `S * (|cos theta| + |sin theta|)`,
 * which ranges from S (at 0/90/180/270 degrees) up to `S * sqrt(2)`
 * (~41% larger, at 45/135/225/315 degrees) -- a fixed S-sided box
 * under-counts the true rendered footprint at every non-axis-aligned
 * rotation, which is most of them for a real target-facing shell.
 * ROTATED_SQUARE_AABB_FACTOR below is exactly that closed-form factor,
 * applied to the reported footprint so it always bounds the ENTIRE
 * rotated source canvas (including its transparent padding) at every
 * angle -- genuinely conservative, not merely asserted to be, and
 * provable in closed form rather than needing per-frame alpha readback
 * or a polygon-collision library. tests/render/teleportAnchorPose.test.ts
 * proves this by transforming the source canvas's own four corners
 * through the exact same rotation and confirming the reported footprint
 * contains all four at several angles/scales -- not just checking that
 * the function's own output is self-consistent.
 *
 * This remains a real approximation (it bounds the full canvas, not the
 * tighter visible diamond silhouette within it) -- documented as a known
 * conservatism, not a defect, per the review's own guidance that a
 * genuinely conservative rectangle is sufficient and pixel-perfect
 * collision is explicitly not required.
 */
const ROTATED_SQUARE_AABB_FACTOR = (rotation: number): number => (
  Math.abs(Math.cos(rotation)) + Math.abs(Math.sin(rotation))
);

import type { TeleportAnchorCandidate, TeleportAnchorId } from './teleportPrimaryAnchor';

const ANCHOR_IDS: ReadonlyArray<TeleportAnchorId> = [0, 1, 2, 3, 4, 5, 6, 7];

/** Default perimeter inset in px (matches the settled legacy title-orbit geometry's inset). */
const DEFAULT_VIEWPORT_INSET_PX = 2;

/** Canvas side of the frozen reference shell, from the derivative manifest's canvas_px. */
const TELEPORT_SHELL_SOURCE_SIZE_PX = 1254;

// The frozen reference package's measured tip (see module doc above) --
// 1254x1254 canvas, center (627,627), tip at (920,131), alpha-channel
// bounding analysis. Calibration data only; nothing is drawn from it.
const NATIVE_TIP_DX = 920 - 627;
const NATIVE_TIP_DY = 131 - 627;
/** Radians. Independently reproduces the manifest's native_tip_angle_deg (-59.43). */
const NATIVE_TIP_ANGLE = Math.atan2(NATIVE_TIP_DY, NATIVE_TIP_DX);
/** The tip's distance from canvas center, in the native 1254x1254 canvas's own units. */
const NATIVE_TIP_DISTANCE = Math.hypot(NATIVE_TIP_DX, NATIVE_TIP_DY);

export interface TeleportViewportBounds {
  readonly width: number;
  readonly height: number;
}

export interface TeleportRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TeleportPoseTarget {
  readonly x: number;
  readonly y: number;
}

export interface TeleportAnchorPose {
  readonly id: TeleportAnchorId;
  /** The station's own position (its center), along the viewport's inset perimeter. */
  readonly anchorX: number;
  readonly anchorY: number;
  /** Radians to rotate the reference shell canvas so its measured tip faces `target`. */
  readonly rotation: number;
  /** The measured tip's real-space position after that rotation -- the logical beam port. */
  readonly portX: number;
  readonly portY: number;
  /** Conservative axis-aligned bounding-box approximation of the shell canvas's footprint. */
  readonly footprint: TeleportRect;
}

/**
 * The shared perimeter parametrization (same arithmetic as edgeMarkers.ts's
 * resolveEdgeStationPosition and the settled case of legacyMenuTitle.ts's
 * resolveLegacyMenuPathTitleOrbitPose) -- see module doc above. Returns
 * only the position; this module computes its own target-facing rotation
 * separately.
 */
const anchorPerimeterPosition = (
  id: TeleportAnchorId,
  left: number,
  right: number,
  top: number,
  bottom: number
): { x: number; y: number } => {
  const perimeter = (id / ANCHOR_IDS.length) * 4;
  if (perimeter < 1) {
    return { x: left + ((right - left) * perimeter), y: top };
  }
  if (perimeter < 2) {
    return { x: right, y: top + ((bottom - top) * (perimeter - 1)) };
  }
  if (perimeter < 3) {
    return { x: right - ((right - left) * (perimeter - 2)), y: bottom };
  }
  return { x: left, y: bottom - ((bottom - top) * (perimeter - 3)) };
};

/**
 * Resolves all eight anchors' real poses (position, target-facing
 * rotation, transformed measured port) for the given viewport bounds,
 * target, and rendered shell size. Pure: same inputs always produce the
 * same output, and none of the inputs are mutated.
 */
export const resolveTeleportAnchorPoses = (
  viewport: TeleportViewportBounds,
  target: TeleportPoseTarget,
  shellCanvasSidePx: number,
  inset: number = DEFAULT_VIEWPORT_INSET_PX
): ReadonlyArray<TeleportAnchorPose> => {
  const left = inset;
  const right = viewport.width - inset;
  const top = inset;
  const bottom = viewport.height - inset;
  const scale = shellCanvasSidePx / TELEPORT_SHELL_SOURCE_SIZE_PX;
  const portDistance = NATIVE_TIP_DISTANCE * scale;

  return ANCHOR_IDS.map((id) => {
    const { x: anchorX, y: anchorY } = anchorPerimeterPosition(id, left, right, top, bottom);
    const dx = target.x - anchorX;
    const dy = target.y - anchorY;
    // atan2(0, 0) is well-defined (0) in IEEE 754 / ECMAScript, not NaN --
    // but a zero-length target direction (the target sits exactly on the
    // anchor) is called out explicitly here rather than left to that
    // implicit fallback, since a caller reading this code should not have
    // to know that atan2's edge case happens to do the right thing.
    const inwardAngle = (dx === 0 && dy === 0) ? 0 : Math.atan2(dy, dx);
    const rotation = inwardAngle - NATIVE_TIP_ANGLE;
    const portX = anchorX + (portDistance * Math.cos(inwardAngle));
    const portY = anchorY + (portDistance * Math.sin(inwardAngle));
    // The reported footprint bounds the ENTIRE rotated source canvas at
    // this pose's own rotation -- see the module doc's ROTATED_SQUARE_AABB_FACTOR
    // explanation for why a fixed (rotation-independent) box was wrong.
    const footprintSide = shellCanvasSidePx * ROTATED_SQUARE_AABB_FACTOR(rotation);

    return {
      id,
      anchorX,
      anchorY,
      rotation,
      portX,
      portY,
      footprint: {
        x: anchorX - (footprintSide / 2),
        y: anchorY - (footprintSide / 2),
        width: footprintSide,
        height: footprintSide
      }
    };
  });
};

const rectsIntersect = (a: TeleportRect, b: TeleportRect): boolean => (
  a.x < b.x + b.width
  && a.x + a.width > b.x
  && a.y < b.y + b.height
  && a.y + a.height > b.y
);

export interface TeleportAnchorEligibility {
  readonly eligible: boolean;
  readonly ineligibleReason?: string;
}

const containsRect = (outer: TeleportRect, inner: TeleportRect): boolean => (
  inner.x >= outer.x
  && inner.y >= outer.y
  && inner.x + inner.width <= outer.x + outer.width
  && inner.y + inner.height <= outer.y + outer.height
);

/**
 * Tests one anchor's (conservative, see module doc) footprint against
 * real viewport containment AND a set of real HUD/safe-area exclusion
 * rectangles. An anchor whose footprint exceeds the viewport, or
 * intersects ANY exclusion, is ineligible -- this is a clearance
 * decision, not a rendering-visibility decision: a pose is ineligible
 * because it cannot legally be placed there, never because its diamond
 * happens to be hidden, dimmed, or not yet mounted this frame.
 */
export const resolveTeleportAnchorEligibility = (
  pose: TeleportAnchorPose,
  exclusions: ReadonlyArray<TeleportRect>,
  viewport?: TeleportViewportBounds
): TeleportAnchorEligibility => {
  if (viewport !== undefined && !containsRect({ x: 0, y: 0, width: viewport.width, height: viewport.height }, pose.footprint)) {
    return {
      eligible: false,
      ineligibleReason: `footprint (${pose.footprint.x}, ${pose.footprint.y}, ${pose.footprint.width}x${pose.footprint.height}) exceeds the ${viewport.width}x${viewport.height} viewport`
    };
  }
  const collision = exclusions.find((exclusion) => rectsIntersect(pose.footprint, exclusion));
  if (collision === undefined) {
    return { eligible: true };
  }
  return {
    eligible: false,
    ineligibleReason: `footprint intersects an excluded region at (${collision.x}, ${collision.y}, ${collision.width}x${collision.height})`
  };
};

/**
 * Convenience: resolves poses AND eligibility together into the exact
 * candidate shape teleportPrimaryAnchor.ts's selectTeleportPrimaryAnchor
 * expects, so a caller does not have to hand-assemble that shape itself.
 * Eligibility is checked against both `exclusions` and real viewport
 * containment (a footprint that would render partly off-canvas is
 * ineligible, not merely "close to the edge").
 */
export const resolveTeleportAnchorCandidates = (
  viewport: TeleportViewportBounds,
  target: TeleportPoseTarget,
  shellCanvasSidePx: number,
  exclusions: ReadonlyArray<TeleportRect>,
  inset: number = DEFAULT_VIEWPORT_INSET_PX
): ReadonlyArray<TeleportAnchorCandidate & { readonly pose: TeleportAnchorPose }> => (
  resolveTeleportAnchorPoses(viewport, target, shellCanvasSidePx, inset).map((pose) => {
    const { eligible, ineligibleReason } = resolveTeleportAnchorEligibility(pose, exclusions, viewport);
    return {
      id: pose.id,
      portX: pose.portX,
      portY: pose.portY,
      eligible,
      ineligibleReason,
      pose
    };
  })
);
