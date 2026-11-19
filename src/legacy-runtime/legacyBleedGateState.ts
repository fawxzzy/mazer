// MAZER-L10: bleed gate runtime state (which gates of the current maze are lit, and when).
//
// A gated bleed-off path is hidden and closed until the player (or the menu AI) passes over its gate tile.
// The maze snapshot carries the gates (`maze.bleedGates`, placed at generation, legacyBleedGates.ts); this
// module holds the per-attempt state: the triggered keys and the time each gate was lit, so the gate's
// activation and the path's draw-in can animate. State is keyed by the gates array itself, so a spread copy
// of the maze (`{ ...maze }`) sees the same state, and a new maze (new array) always starts unlit.
//
// Kept free of value imports from legacyMaze.ts: legacyMaze.ts's navigation reads `isLegacyBleedGateCellHidden`.

import type { BleedAxis } from './legacyBleedPaths';

export interface LegacyBleedGate {
  axis: BleedAxis;
  // Row index of a horizontal path, column index of a vertical one (BleedPath.line).
  line: number;
  // The gate tile.
  x: number;
  y: number;
  // Shortest walk from the gate to the nearer mouth of its path, with the path hidden.
  pathDistance: number;
  // Steps the path saves when it is open from the start (no gate).
  ungatedSaving: number;
  // Steps it saves a player who walks to the gate first (0 when the detour costs more than the wrap gives).
  gatedSaving: number;
}

interface LegacyBleedGateMazeLike {
  readonly bleedGates?: readonly LegacyBleedGate[];
  readonly width?: number;
  readonly height?: number;
  readonly grid: readonly (readonly boolean[])[];
}

interface LegacyBleedGateRuntime {
  triggeredAtMs: Map<string, number>;
  revision: number;
}

// Activation (the ring wakes up), then the path draws in on the pulse (Gate D "Pulse ring" timing, options
// page v1: activation 0.6 s, reveal 1.6 s after it).
export const BLEED_GATE_ACTIVATE_MS = 600;
export const BLEED_GATE_REVEAL_MS = 1600;
export const BLEED_GATE_ANIMATION_MS = BLEED_GATE_ACTIVATE_MS + BLEED_GATE_REVEAL_MS;

const runtimes = new WeakMap<readonly LegacyBleedGate[], LegacyBleedGateRuntime>();

export const bleedGateKey = (gate: Pick<LegacyBleedGate, 'axis' | 'line'>): string => `${gate.axis}:${gate.line}`;

const runtimeFor = (gates: readonly LegacyBleedGate[]): LegacyBleedGateRuntime => {
  let runtime = runtimes.get(gates);
  if (!runtime) {
    runtime = { triggeredAtMs: new Map(), revision: 0 };
    runtimes.set(gates, runtime);
  }
  return runtime;
};

const mazeWidth = (maze: LegacyBleedGateMazeLike): number => maze.width ?? maze.grid[0]?.length ?? 0;
const mazeHeight = (maze: LegacyBleedGateMazeLike): number => maze.height ?? maze.grid.length;

// The two border cells (the path's openings) a gate hides.
export const resolveLegacyBleedGateBorderCells = (
  gate: Pick<LegacyBleedGate, 'axis' | 'line'>,
  width: number,
  height: number
): [{ x: number; y: number }, { x: number; y: number }] => (
  gate.axis === 'horizontal'
    ? [{ x: 0, y: gate.line }, { x: width - 1, y: gate.line }]
    : [{ x: gate.line, y: 0 }, { x: gate.line, y: height - 1 }]
);

export const hasLegacyBleedGates = (maze: LegacyBleedGateMazeLike): boolean => (maze.bleedGates?.length ?? 0) > 0;

export const isLegacyBleedGateTriggered = (maze: LegacyBleedGateMazeLike, gate: Pick<LegacyBleedGate, 'axis' | 'line'>): boolean => (
  maze.bleedGates !== undefined && runtimes.get(maze.bleedGates)?.triggeredAtMs.has(bleedGateKey(gate)) === true
);

export const readLegacyBleedGateTriggeredKeys = (maze: LegacyBleedGateMazeLike): ReadonlySet<string> => (
  new Set(maze.bleedGates ? runtimes.get(maze.bleedGates)?.triggeredAtMs.keys() ?? [] : [])
);

export const readLegacyBleedGateTriggeredAtMs = (
  maze: LegacyBleedGateMazeLike,
  gate: Pick<LegacyBleedGate, 'axis' | 'line'>
): number | null => (
  maze.bleedGates ? runtimes.get(maze.bleedGates)?.triggeredAtMs.get(bleedGateKey(gate)) ?? null : null
);

// Bumped on every trigger / reset: render caches keyed by maze identity add it to their key.
export const readLegacyBleedGateRevision = (maze: LegacyBleedGateMazeLike): number => (
  maze.bleedGates ? runtimes.get(maze.bleedGates)?.revision ?? 0 : 0
);

// A border cell of a gated path whose gate is not lit yet: drawn as wall and closed to movement.
export const isLegacyBleedGateCellHidden = (maze: LegacyBleedGateMazeLike, x: number, y: number): boolean => {
  const gates = maze.bleedGates;
  if (!gates || gates.length === 0) {
    return false;
  }
  const width = mazeWidth(maze);
  const height = mazeHeight(maze);
  const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
  if (!onBorder) {
    return false;
  }
  const triggered = runtimes.get(gates)?.triggeredAtMs;
  for (const gate of gates) {
    if (triggered?.has(bleedGateKey(gate)) === true) {
      continue;
    }
    const hit = gate.axis === 'horizontal'
      ? y === gate.line && (x === 0 || x === width - 1)
      : x === gate.line && (y === 0 || y === height - 1);
    if (hit) {
      return true;
    }
  }
  return false;
};

// Lights a gate (no-op when already lit). Returns true when this call lit it.
export const triggerLegacyBleedGate = (
  maze: LegacyBleedGateMazeLike,
  gate: Pick<LegacyBleedGate, 'axis' | 'line'>,
  nowMs: number
): boolean => {
  if (!maze.bleedGates) {
    return false;
  }
  const runtime = runtimeFor(maze.bleedGates);
  const key = bleedGateKey(gate);
  if (runtime.triggeredAtMs.has(key)) {
    return false;
  }
  runtime.triggeredAtMs.set(key, nowMs);
  runtime.revision += 1;
  return true;
};

// A new attempt on the same maze: every gate goes dark and every gated path hides again.
export const resetLegacyBleedGates = (maze: LegacyBleedGateMazeLike): void => {
  if (!maze.bleedGates) {
    return;
  }
  const runtime = runtimes.get(maze.bleedGates);
  if (runtime && runtime.triggeredAtMs.size > 0) {
    runtime.triggeredAtMs.clear();
    runtime.revision += 1;
  }
};

// Pass-over detection: the player's tile, plus the last few trail tiles (a fast run can cross the gate
// between two polls). Lights every unlit gate found; returns the gates lit by this call.
export const LEGACY_BLEED_GATE_TRAIL_LOOKBACK = 4;

export const syncLegacyBleedGatePassOver = (
  maze: LegacyBleedGateMazeLike,
  player: { x: number; y: number },
  trail: readonly { x: number; y: number }[],
  nowMs: number
): LegacyBleedGate[] => {
  const gates = maze.bleedGates;
  if (!gates || gates.length === 0) {
    return [];
  }
  const lit: LegacyBleedGate[] = [];
  const recent = [player, ...trail.slice(Math.max(0, trail.length - LEGACY_BLEED_GATE_TRAIL_LOOKBACK))];
  for (const gate of gates) {
    if (recent.some((point) => point.x === gate.x && point.y === gate.y) && triggerLegacyBleedGate(maze, gate, nowMs)) {
      lit.push(gate);
    }
  }
  return lit;
};

export interface LegacyBleedGateAnimationState {
  // 0 asleep .. 1 awake (the ring lights and spins up).
  activation: number;
  // 0 hidden .. 1 drawn in (the path fades in on the pulse).
  reveal: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

// Reduced motion: the gate is awake and the path is drawn the instant it is lit.
export const resolveLegacyBleedGateAnimationState = (
  triggeredAtMs: number | null,
  nowMs: number,
  reducedMotion = false
): LegacyBleedGateAnimationState => {
  if (triggeredAtMs === null) {
    return { activation: 0, reveal: 0 };
  }
  if (reducedMotion) {
    return { activation: 1, reveal: 1 };
  }
  const elapsed = Math.max(0, nowMs - triggeredAtMs);
  return {
    activation: clamp01(elapsed / BLEED_GATE_ACTIVATE_MS),
    reveal: clamp01((elapsed - BLEED_GATE_ACTIVATE_MS) / BLEED_GATE_REVEAL_MS)
  };
};

// True while any lit gate of the maze is still mid-animation (the board needs a redraw this frame).
export const isLegacyBleedGateAnimating = (maze: LegacyBleedGateMazeLike, nowMs: number, reducedMotion = false): boolean => {
  if (!maze.bleedGates || reducedMotion) {
    return false;
  }
  const runtime = runtimes.get(maze.bleedGates);
  if (!runtime) {
    return false;
  }
  for (const at of runtime.triggeredAtMs.values()) {
    if (nowMs - at < BLEED_GATE_ANIMATION_MS + 50) {
      return true;
    }
  }
  return false;
};

const viewGrids = new WeakMap<readonly LegacyBleedGate[], { revision: number; source: readonly (readonly boolean[])[]; grid: boolean[][] }>();

// The grid as drawn right now: every unlit gated path's two openings are wall. Memoized per maze and gate
// revision (the board bake keys on the grid's content, so a stable array keeps it cheap). The maze's own
// grid when it has no gates.
export const resolveLegacyBleedGateViewGrid = (maze: LegacyBleedGateMazeLike & { readonly grid: boolean[][] }): boolean[][] => {
  const gates = maze.bleedGates;
  if (!gates || gates.length === 0) {
    return maze.grid;
  }
  const revision = readLegacyBleedGateRevision(maze);
  const cached = viewGrids.get(gates);
  if (cached && cached.revision === revision && cached.source === maze.grid) {
    return cached.grid;
  }
  const grid = maze.grid.map((row, y) => row.map((open, x) => open && !isLegacyBleedGateCellHidden(maze, x, y)));
  viewGrids.set(gates, { revision, source: maze.grid, grid });
  return grid;
};
