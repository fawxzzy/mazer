// Slice H3 (HAZ-004): the Pulse Gate runtime for the legacy scene.
//
// Rules (docs/architecture/MAZER-HAZARD-GRAPH-CONTRACT.md, Tick semantics and amendments A1/A3):
//  - a gate is open at tick t iff ((t - openFrom) mod period) < openFor;
//  - ARRIVAL-tick legality: a step taken while the world clock reads t is legal only if the
//    destination gate is open at t + 1. A refused step reads as a wall bump and the clock keeps
//    running (that tick is a WAIT, A1);
//  - EJECT (A3): when a gate closes on the cell the player stands on, the player is pushed one cell
//    back along the trail. Not a contact: no rewind, no invulnerability;
//  - TELEGRAPH: the renderer shows each gate's NEXT-tick state (src/render/hazardGateLayer.ts), so
//    what the player sees for the next turn is exactly what the arrival rule consumes.
//
// Only Pulse Gates are live in H3. Every other spec of the overlay (Sentries are H4) is left out:
// removing a hazard never invalidates a witness, so the stored witness still reaches the goal.
//
// The menu demo replays the stored witness one action per tick, and only when the local player has
// already met Pulse Gates (product contract: the demo shows only kinds the player has met).
//
// Allocation-free on the per-frame path: gate state lives in typed arrays and `isBlockedAt` /
// `isOpenAt` are integer math. Allocation happens only at install (once per maze) and on an eject.
// No Phaser, no DOM, and the hazard layer switch is never read here (the scene owns it).
import type { TimedGateSpec } from '../mazer-core/hazards/graphContract';
import { HAZARD_SCHEDULE_FIRST_LEVEL } from '../mazer-core/hazards/schedule';
import { resolveLegacyHazardOverlay, type LegacyHazardOverlayResult } from './legacyHazardOverlay';
import { resolveLegacyNavigationTarget, type LegacyMazeSnapshot, type LegacyPoint } from './legacyMaze';

/** More than the readability cap (6 gates per board); extra gates are ignored, never overflow. */
export const LEGACY_HAZARD_GATE_CAPACITY = 16;

/** One line, player-facing. H6 owns the full skippable intro card (HAZ-008); H3 shows this once. */
export const LEGACY_PULSE_GATE_INTRO_COPY = 'Pulse Gate: the magenta fence opens and closes. Wait for it to open, then go.';

/** Move order shared with the hazard graph (HAZARD_MOVE_ORDER: up, left, down, right). */
const STEP_DELTAS: readonly (readonly [number, number])[] = [[0, -1], [-1, 0], [0, 1], [1, 0]];

export type LegacyHazardGateMode = 'play' | 'menu';
export type LegacyHazardGateOverlaySource = 'worker' | 'main-thread' | 'none';
/** 0: the corridor runs left-right (fence bars stand vertical); 1: it runs up-down. */
export type LegacyHazardGateAxis = 0 | 1;

export interface LegacyHazardGateInstallOptions {
  readonly mode: LegacyHazardGateMode;
  /** Ladder level of the track that built this maze (player track in play, ai-runner track in the menu). */
  readonly level: number;
  /** The local player's own level: decides whether the demo may show gates (met = cleared level 10). */
  readonly playerLevel: number;
  /** The worker's overlay for this maze; undefined computes it here (main-thread fallback). */
  readonly workerOverlay?: LegacyHazardOverlayResult | null;
  readonly exposureStage?: number;
}

export interface LegacyHazardGateInstallResult {
  readonly gateCount: number;
  /** Player-facing intro line to show now, or null. */
  readonly introCopy: string | null;
  readonly overlaySource: LegacyHazardGateOverlaySource;
}

/** Client-only receipt fields (roadmap H3): present only with the layer on. */
export interface LegacyHazardReceiptFields {
  readonly hazardScheduleVersion: number;
  readonly hazardDigest: string;
  readonly exposureStage: number;
}

export interface LegacyHazardGateDiagnostics {
  readonly arrivalBlocks: number;
  readonly demo: { readonly active: boolean; readonly cursor: number; readonly length: number; readonly startTick: number };
  readonly digest: string | null;
  readonly ejects: number;
  readonly exposureStage: number | null;
  readonly firstEncounter: string | null;
  readonly gateCount: number;
  readonly gates: readonly { readonly x: number; readonly y: number; readonly period: number; readonly openFrom: number; readonly openFor: number }[];
  readonly introShown: boolean;
  readonly level: number | null;
  readonly mode: LegacyHazardGateMode | null;
  readonly overlaySource: LegacyHazardGateOverlaySource;
  readonly scheduleVersion: number | null;
  readonly status: string | null;
}

/** The player's local "has met Pulse Gates" rule until H6's exposure stage replaces it. */
export const hasLegacyPlayerMetPulseGates = (playerLevel: number): boolean => (
  Number.isFinite(playerLevel) && playerLevel > HAZARD_SCHEDULE_FIRST_LEVEL
);

/** Parses a progression track level ("12") into a finite positive integer (1 when unreadable). */
export const parseLegacyHazardLevel = (level: string | number): number => {
  const parsed = typeof level === 'number' ? level : Number.parseInt(level, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
};

/** The one-cell delta (with wrap) that moves `from` onto `to`, or null when they are not neighbours. */
export const resolveLegacyHazardStepDelta = (
  maze: Pick<LegacyMazeSnapshot, 'grid'>,
  from: LegacyPoint,
  to: LegacyPoint
): { deltaX: number; deltaY: number } | null => {
  for (const [deltaX, deltaY] of STEP_DELTAS) {
    const target = resolveLegacyNavigationTarget(maze, from, deltaX, deltaY);
    if (target !== null && target.x === to.x && target.y === to.y) {
      return { deltaX, deltaY };
    }
  }
  return null;
};

export class LegacyHazardGateController {
  private width = 0;
  private height = 0;
  private count = 0;
  private readonly xs = new Int32Array(LEGACY_HAZARD_GATE_CAPACITY);
  private readonly ys = new Int32Array(LEGACY_HAZARD_GATE_CAPACITY);
  private readonly periods = new Int32Array(LEGACY_HAZARD_GATE_CAPACITY);
  private readonly openFroms = new Int32Array(LEGACY_HAZARD_GATE_CAPACITY);
  private readonly openFors = new Int32Array(LEGACY_HAZARD_GATE_CAPACITY);
  private readonly axes = new Uint8Array(LEGACY_HAZARD_GATE_CAPACITY);
  private cellToGate = new Int16Array(0);
  private replayXs = new Int32Array(0);
  private replayYs = new Int32Array(0);
  private replayLength = 0;
  private replayCursor = 0;
  private replayStartTick = 0;
  private currentMode: LegacyHazardGateMode | null = null;
  private overlay: LegacyHazardOverlayResult | null = null;
  private source: LegacyHazardGateOverlaySource = 'none';
  private receipt: LegacyHazardReceiptFields | null = null;
  private introShown = false;
  private blocks = 0;
  private ejectCount = 0;
  private installVersion = 0;

  /** Bumped on every clear/install, so a renderer knows the gate set changed. */
  get version(): number {
    return this.installVersion;
  }

  /** Number of live gates on the current board (0 = nothing to draw or check). */
  get gateCount(): number {
    return this.count;
  }

  get mode(): LegacyHazardGateMode | null {
    return this.currentMode;
  }

  get ejects(): number {
    return this.ejectCount;
  }

  get arrivalBlocks(): number {
    return this.blocks;
  }

  /** Board width in cells of the installed maze (the renderer sizes its canvas from it). */
  get boardWidth(): number {
    return this.width;
  }

  get boardHeight(): number {
    return this.height;
  }

  /** Back to an empty board (no gates, no demo, no receipt fields). Keeps the intro-shown latch. */
  clear(): void {
    this.installVersion += 1;
    this.count = 0;
    this.width = 0;
    this.height = 0;
    this.replayLength = 0;
    this.replayCursor = 0;
    this.replayStartTick = 0;
    this.currentMode = null;
    this.overlay = null;
    this.source = 'none';
    this.receipt = null;
    this.blocks = 0;
    this.ejectCount = 0;
  }

  /** A new maze was installed. Computes (or adopts the worker's) overlay and loads its Pulse Gates. */
  install(maze: LegacyMazeSnapshot, options: LegacyHazardGateInstallOptions): LegacyHazardGateInstallResult {
    this.clear();
    if (options.mode === 'menu' && (maze.source === 'menu-snapshot' || !hasLegacyPlayerMetPulseGates(options.playerLevel))) {
      return { gateCount: 0, introCopy: null, overlaySource: 'none' };
    }
    const overlay = options.workerOverlay !== undefined
      ? options.workerOverlay
      : resolveLegacyHazardOverlay(maze, { enabled: true, level: options.level, exposureStage: options.exposureStage });
    this.source = overlay === null ? 'none' : (options.workerOverlay !== undefined ? 'worker' : 'main-thread');
    this.currentMode = options.mode;
    if (overlay === null) {
      return { gateCount: 0, introCopy: null, overlaySource: this.source };
    }
    this.overlay = overlay;
    if (options.mode === 'play') {
      this.receipt = {
        hazardScheduleVersion: overlay.scheduleVersion,
        hazardDigest: overlay.digest,
        exposureStage: overlay.exposureStage
      };
    }
    const witness = overlay.verdict?.witness ?? null;
    if (options.mode === 'menu' && witness === null) {
      return { gateCount: 0, introCopy: null, overlaySource: this.source };
    }
    this.loadGates(maze, overlay);
    if (options.mode === 'menu' && this.count > 0 && witness !== null) {
      this.loadReplay(witness.cells, witness.startTick);
    } else if (options.mode === 'menu') {
      this.count = 0;
    }
    let introCopy: string | null = null;
    if (options.mode === 'play' && this.count > 0 && overlay.allocation.firstEncounter === 'pulseGate' && !this.introShown) {
      this.introShown = true;
      introCopy = LEGACY_PULSE_GATE_INTRO_COPY;
    }
    return { gateCount: this.count, introCopy, overlaySource: this.source };
  }

  private loadGates(maze: LegacyMazeSnapshot, overlay: LegacyHazardOverlayResult): void {
    const height = maze.grid.length;
    const width = maze.grid[0]?.length ?? 0;
    this.width = width;
    this.height = height;
    if (this.cellToGate.length < width * height) {
      this.cellToGate = new Int16Array(width * height);
    }
    this.cellToGate.fill(-1, 0, width * height);
    let count = 0;
    for (const spec of overlay.specs) {
      if (spec.kind !== 'timedGate' || count >= LEGACY_HAZARD_GATE_CAPACITY) {
        continue;
      }
      const gate = spec as TimedGateSpec;
      const x = gate.cell % width;
      const y = Math.floor(gate.cell / width);
      this.xs[count] = x;
      this.ys[count] = y;
      this.periods[count] = Math.max(1, gate.period);
      this.openFroms[count] = gate.openFrom;
      this.openFors[count] = gate.openFor;
      const left = resolveLegacyNavigationTarget(maze, { x, y }, -1, 0);
      const right = resolveLegacyNavigationTarget(maze, { x, y }, 1, 0);
      this.axes[count] = left !== null || right !== null ? 0 : 1;
      this.cellToGate[(y * width) + x] = count;
      count += 1;
    }
    this.count = count;
  }

  private loadReplay(cells: readonly number[], startTick: number): void {
    if (this.replayXs.length < cells.length) {
      this.replayXs = new Int32Array(cells.length);
      this.replayYs = new Int32Array(cells.length);
    }
    for (let index = 0; index < cells.length; index += 1) {
      this.replayXs[index] = cells[index]! % this.width;
      this.replayYs[index] = Math.floor(cells[index]! / this.width);
    }
    this.replayLength = cells.length;
    this.replayCursor = 0;
    this.replayStartTick = startTick;
  }

  gateX(index: number): number {
    return this.xs[index]!;
  }

  gateY(index: number): number {
    return this.ys[index]!;
  }

  gateAxis(index: number): LegacyHazardGateAxis {
    return this.axes[index] === 1 ? 1 : 0;
  }

  isOpenAt(index: number, tick: number): boolean {
    const period = this.periods[index]!;
    const q = (((tick - this.openFroms[index]!) % period) + period) % period;
    return q < this.openFors[index]!;
  }

  /** True when (x, y) holds a gate that is closed at `tick`. Integer math only. */
  isBlockedAt(x: number, y: number, tick: number): boolean {
    if (this.count === 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return false;
    }
    const index = this.cellToGate[(y * this.width) + x]!;
    return index >= 0 && !this.isOpenAt(index, tick);
  }

  /**
   * Arrival-tick legality for a step onto `target` taken while the world clock reads `currentTick`:
   * refused when the gate there is closed at `currentTick + 1`. Counts each refusal.
   */
  isArrivalBlocked(target: LegacyPoint, currentTick: number): boolean {
    if (!this.isBlockedAt(target.x, target.y, currentTick + 1)) {
      return false;
    }
    this.blocks += 1;
    return true;
  }

  /**
   * A3 eject: when the gate under `player` is closed at `tick`, the one-cell step that moves the
   * player back along the trail (the previous trail cell when it is a neighbour that is not itself
   * closed; otherwise the first open neighbour in up/left/down/right order). Null when the player is
   * not standing in a closed gate (or, impossible by placement, has nowhere to go).
   */
  resolveEjectStep(
    maze: Pick<LegacyMazeSnapshot, 'grid'>,
    player: LegacyPoint,
    trail: readonly LegacyPoint[],
    tick: number
  ): { deltaX: number; deltaY: number } | null {
    if (!this.isBlockedAt(player.x, player.y, tick)) {
      return null;
    }
    const last = trail[trail.length - 1];
    const previous = last !== undefined && last.x === player.x && last.y === player.y
      ? trail[trail.length - 2]
      : last;
    if (previous !== undefined && !this.isBlockedAt(previous.x, previous.y, tick)) {
      const back = resolveLegacyHazardStepDelta(maze, player, previous);
      if (back !== null) {
        this.ejectCount += 1;
        return back;
      }
    }
    for (const [deltaX, deltaY] of STEP_DELTAS) {
      const target = resolveLegacyNavigationTarget(maze, player, deltaX, deltaY);
      if (target !== null && !this.isBlockedAt(target.x, target.y, tick)) {
        this.ejectCount += 1;
        return { deltaX, deltaY };
      }
    }
    return null;
  }

  /** True while the menu demo is replaying a stored witness that has steps left. */
  get demoReplayActive(): boolean {
    return this.currentMode === 'menu' && this.count > 0 && this.replayLength > 1;
  }

  /** The demo's world tick: the witness start tick plus the actions replayed so far. */
  get demoTick(): number {
    return this.replayStartTick + this.replayCursor;
  }

  get demoCursor(): number {
    return this.replayCursor;
  }

  get demoLength(): number {
    return this.replayLength;
  }

  /** Advances the demo one witness action. Returns the new cursor, or -1 when the replay is over. */
  advanceDemo(): number {
    if (!this.demoReplayActive || this.replayCursor >= this.replayLength - 1) {
      return -1;
    }
    this.replayCursor += 1;
    return this.replayCursor;
  }

  demoX(cursor: number): number {
    return this.replayXs[cursor]!;
  }

  demoY(cursor: number): number {
    return this.replayYs[cursor]!;
  }

  /** True once the replay stands on its last witness cell (the goal). */
  get demoFinished(): boolean {
    return this.replayLength > 0 && this.replayCursor >= this.replayLength - 1;
  }

  /** Receipt fields for a play completion (null in the menu or with no overlay). Same object each call. */
  receiptFields(): LegacyHazardReceiptFields | null {
    return this.receipt;
  }

  describe(): LegacyHazardGateDiagnostics {
    const gates = [];
    for (let index = 0; index < this.count; index += 1) {
      gates.push({ x: this.xs[index]!, y: this.ys[index]!, period: this.periods[index]!, openFrom: this.openFroms[index]!, openFor: this.openFors[index]! });
    }
    return {
      arrivalBlocks: this.blocks,
      demo: { active: this.demoReplayActive, cursor: this.replayCursor, length: this.replayLength, startTick: this.replayStartTick },
      digest: this.overlay?.digest ?? null,
      ejects: this.ejectCount,
      exposureStage: this.overlay?.exposureStage ?? null,
      firstEncounter: this.overlay?.allocation.firstEncounter ?? null,
      gateCount: this.count,
      gates,
      introShown: this.introShown,
      level: this.overlay?.level ?? null,
      mode: this.currentMode,
      overlaySource: this.source,
      scheduleVersion: this.overlay?.scheduleVersion ?? null,
      status: this.overlay?.status ?? null
    };
  }
}

export const createLegacyHazardGateController = (): LegacyHazardGateController => new LegacyHazardGateController();
