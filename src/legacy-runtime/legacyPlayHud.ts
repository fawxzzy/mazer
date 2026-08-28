export interface LegacyFrozenElapsedInput {
  completedAtMs?: number | null;
  nowMs: number;
  startedAtMs: number;
}

export const resolveLegacyFrozenElapsedMs = ({
  completedAtMs,
  nowMs,
  startedAtMs
}: LegacyFrozenElapsedInput): number => Math.max(
  0,
  Math.round((completedAtMs ?? nowMs) - startedAtMs)
);
