export type LegacyHeaderControlPlacement = 'leading' | 'trailing';

export interface LegacyHeaderControlFrame {
  bottom: number;
  centerX: number;
  centerY: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface ResolveLegacyHeaderControlFrameInput {
  height: number;
  hudHeight: number;
  hudTop: number;
  placement: LegacyHeaderControlPlacement;
  /**
   * Header controls can share a side without inventing a second visual
   * language. Slot zero is the original leading/trailing control; later
   * slots flow inward with the same safe gap.
   */
  slot?: number;
  /**
   * 1 by default. Pass LegacyMenuLayout's headerIconScale here to shrink
   * this control by the same modest amount the inline title had to shrink
   * by to keep fitting in a tight header row, instead of only the title
   * visibly responding. Still floored well above the already-reduced
   * 36-40px band below (see the size clamp), never below a usable tap size.
   */
  sizeScale?: number;
  width: number;
}

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.max(minimum, Math.min(maximum, value))
);

/**
 * Progression is an unbounded completion ordinal, so the glyph scales its
 * digits inside the fixed control frame instead of widening the header row.
 */
export const resolveLegacyHeaderControlMetricFontSize = (level: number, size: number): number => {
  const digits = String(Math.max(1, Math.round(level))).length;
  const ratio = digits >= 3 ? 0.44 : (digits === 2 ? 0.56 : 0.7);
  return clamp(Math.round(size * ratio), 14, 28);
};

/**
 * Header actions intentionally share one square geometry. This prevents the
 * settings cog from drifting into a separate button language as progression
 * values change. Deliberately sized below the usual 44px touch-target floor
 * (36-40px) per explicit design feedback that the header badges read as too
 * large -- the settings cog is the one interactive control in this pair, so
 * this trades a slightly smaller tap target for the requested visual scale.
 */
export const resolveLegacyHeaderControlFrame = (
  input: ResolveLegacyHeaderControlFrameInput
): LegacyHeaderControlFrame => {
  const minDimension = Math.max(1, Math.min(input.width, input.height));
  // Scale applied AFTER the existing 36-40 clamp, not folded into the same
  // formula the clamp floor was tuned against -- at sizeScale 1 (the
  // overwhelming majority of frames) this must equal the unscaled result
  // exactly, not a rounded-through-1x copy of it, so an unsqueezed header
  // keeps its already-tuned 36-40px icons unchanged. Only a real squeeze
  // (sizeScale < 1) is allowed to go below that floor, down to 32.
  const baseSize = clamp(Math.round(minDimension * 0.085), 36, 40);
  const sizeScale = input.sizeScale ?? 1;
  const size = sizeScale >= 1 ? baseSize : Math.max(32, Math.round(baseSize * sizeScale));
  const inset = Math.max(8, Math.round(size * 0.2));
  const slot = Math.max(0, Math.round(input.slot ?? 0));
  const gap = Math.max(8, Math.round(size * 0.18));
  const top = clamp(
    Math.round(input.hudTop + ((input.hudHeight - size) / 2)),
    6,
    Math.max(6, input.height - size - 6)
  );
  const left = input.placement === 'leading'
    ? clamp(inset + (slot * (size + gap)), 8, Math.max(8, input.width - size - inset))
    : clamp(
      input.width - size - inset - (slot * (size + gap)),
      8,
      Math.max(8, input.width - size - 8)
    );

  return {
    bottom: top + size,
    centerX: left + (size / 2),
    centerY: top + (size / 2),
    height: size,
    left,
    right: left + size,
    top,
    width: size
  };
};
