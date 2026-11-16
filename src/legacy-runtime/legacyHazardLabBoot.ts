// Browser glue for the hazard layer flag (roadmap slice H1): reads the real URL and localStorage once
// at scene creation, and builds the world clock runtime only when the layer is on. With the layer off
// this returns `runtime: null` and the scene does nothing extra (byte-identical play).
//
// The lab switch is read from the REAL storage, never the Level Preview sandbox storage. All storage
// and DOM access is guarded.
import { HAZARD_LAB_CHIP_TEXT, resolveHazardLayerState, type HazardLayerState } from './legacyHazardLayerFlag';
import { createHazardWorldRuntime, type HazardWorldRuntime } from './legacyWorldClock';

export interface HazardLabBoot {
  readonly state: HazardLayerState;
  readonly runtime: HazardWorldRuntime | null;
  /** "LAB" while the layer is on because of the lab switch, else null. */
  readonly chipText: string | null;
}

/** The `play.worldClock` runtime-diagnostics block (present only while the layer is on). */
export interface HazardLabClockDiagnostics {
  scheduledCount: number;
  labChip: boolean;
  phase: 'idle' | 'running' | 'stopped';
  remainderMs: number;
  source: 'build' | 'lab' | 'off';
  starts: number;
  stops: number;
  ticks: number;
}

export const describeHazardLabClock = (boot: HazardLabBoot | null): HazardLabClockDiagnostics | null => {
  if (!boot || !boot.runtime) {
    return null;
  }
  const clock = boot.runtime.clock.snapshot();
  return {
    scheduledCount: boot.runtime.schedule.hazards.length,
    labChip: boot.state.labChip,
    phase: clock.phase,
    remainderMs: Math.round(clock.remainderMs),
    source: boot.state.source,
    starts: clock.starts,
    stops: clock.stops,
    ticks: clock.ticks
  };
};

export const bootHazardLab = (search: string): HazardLabBoot => {
  let storage: Storage | null = null;
  try {
    if (typeof window !== 'undefined') {
      storage = window.localStorage;
    }
  } catch {
    storage = null;
  }
  const state = resolveHazardLayerState({ search, storage });
  if (!state.enabled) {
    return { state, runtime: null, chipText: null };
  }
  const runtime = createHazardWorldRuntime({
    windowTarget: typeof window === 'undefined' ? null : window,
    documentTarget: typeof document === 'undefined' ? null : document,
    isHidden: () => typeof document !== 'undefined' && document.hidden
  });
  return { state, runtime, chipText: state.labChip ? HAZARD_LAB_CHIP_TEXT : null };
};
