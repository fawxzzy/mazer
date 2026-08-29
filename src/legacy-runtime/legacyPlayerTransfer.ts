export type LegacyPlayerTransferPhase = 'idle' | 'pending' | 'outbound' | 'stored' | 'delivering' | 'complete';

export interface LegacyPlayerTransferVisualState {
  active: boolean;
  deliveryProgress: number;
  energyAlpha: number;
  outboundProgress: number;
  phase: LegacyPlayerTransferPhase;
  swirlPhase: number;
}

export interface LegacyPlayerTransferVisualInput {
  armed: boolean;
  deliveryElapsedMs: number | null;
  deliveryFlashMs: number;
  deliveryTravelMs: number;
  nowMs: number;
  outboundElapsedMs: number | null;
  reducedMotion?: boolean;
}

// 360 * 1.25 -- a literal 25% slowdown per feedback the laser "glitches,
// pauses, doesn't have enough time to shoot out." The other half of that
// complaint was resolveLegacyPlayerTransferVisualState's own energyAlpha
// curve (see below): it held the beam fully invisible for the first ~52%
// of this whole duration, so even the beam's actual travel window was
// roughly half what this constant suggests -- both are fixed together.
export const LEGACY_PLAYER_TRANSFER_OUTBOUND_MS = 450;
export const LEGACY_PLAYER_TRANSFER_SWIRL_PERIOD_MS = 1200;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const normalizeElapsedMs = (value: number | null): number | null => (
  value === null || !Number.isFinite(value) ? null : Math.max(0, value)
);

const normalizeDurationMs = (value: number): number => (
  Number.isFinite(value) && value > 0 ? value : 1
);

const smoothstep = (value: number): number => {
  const x = clamp01(value);
  return x * x * (3 - (2 * x));
};

/**
 * Resolves the visual-only player-energy handoff without owning any gameplay
 * timing. The scene supplies elapsed values from the already-existing
 * deconstruct and spawn clocks; this function only turns those clocks into a
 * bounded render envelope.
 */
export const resolveLegacyPlayerTransferVisualState = (
  input: LegacyPlayerTransferVisualInput
): LegacyPlayerTransferVisualState => {
  if (!input.armed) {
    return {
      active: false,
      deliveryProgress: 0,
      energyAlpha: 0,
      outboundProgress: 0,
      phase: 'idle',
      swirlPhase: 0
    };
  }

  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : 0;
  const swirlPhase = input.reducedMotion === true
    ? 0
    : ((nowMs % LEGACY_PLAYER_TRANSFER_SWIRL_PERIOD_MS) + LEGACY_PLAYER_TRANSFER_SWIRL_PERIOD_MS)
      % LEGACY_PLAYER_TRANSFER_SWIRL_PERIOD_MS
      / LEGACY_PLAYER_TRANSFER_SWIRL_PERIOD_MS;
  const deliveryElapsedMs = normalizeElapsedMs(input.deliveryElapsedMs);
  if (deliveryElapsedMs !== null) {
    const travelMs = normalizeDurationMs(input.deliveryTravelMs);
    const totalMs = travelMs + normalizeDurationMs(input.deliveryFlashMs);
    if (deliveryElapsedMs >= totalMs) {
      return {
        active: false,
        deliveryProgress: 1,
        energyAlpha: 0,
        outboundProgress: 1,
        phase: 'complete',
        swirlPhase
      };
    }

    const deliveryProgress = smoothstep(deliveryElapsedMs / travelMs);
    return {
      active: true,
      deliveryProgress,
      energyAlpha: clamp01(1 - deliveryProgress),
      outboundProgress: 1,
      phase: 'delivering',
      swirlPhase
    };
  }

  const outboundElapsedMs = normalizeElapsedMs(input.outboundElapsedMs);
  if (outboundElapsedMs === null) {
    return {
      active: false,
      deliveryProgress: 0,
      energyAlpha: 0,
      outboundProgress: 0,
      phase: 'pending',
      swirlPhase
    };
  }

  const outboundProgress = input.reducedMotion === true
    ? 1
    : smoothstep(outboundElapsedMs / LEGACY_PLAYER_TRANSFER_OUTBOUND_MS);
  if (outboundProgress < 1) {
    return {
      active: true,
      deliveryProgress: 0,
      energyAlpha: smoothstep((outboundProgress - 0.52) / 0.48),
      outboundProgress,
      phase: 'outbound',
      swirlPhase
    };
  }

  return {
    active: true,
    deliveryProgress: 0,
    energyAlpha: input.reducedMotion === true
      ? 0.9
      : 0.88 + (Math.sin(swirlPhase * Math.PI * 2) * 0.1),
    outboundProgress: 1,
    phase: 'stored',
    swirlPhase
  };
};
