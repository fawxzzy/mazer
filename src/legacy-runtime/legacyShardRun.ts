/**
 * Shards in play (H8 UI v1). The run state of one maze's shards: where they sit, how many were taken,
 * and whether the end star is still locked. Pure TypeScript (no Phaser, DOM or clock): the scene asks,
 * src/render/shardSceneLayer.ts draws.
 *
 * Placement is the existing H8 core (`computeShardLayer` in src/mazer-core/hazards/shards.ts) over the
 * live maze graph with every bleed-gated wrap walled (the adapter masks it, `maskLegacyBleedGatedCells`, spec D8), fed the gate
 * specs that are live in play, so the shipped route is the one the solvability verdict proved and it
 * never needs a wrap behind an unlit Switch. Play has one base per level (no reject-and-try-next-base loop),
 * so a strict level whose base misses the route band ships the nearest route the verdict passes
 * (`onStrictMiss: 'nearest'`, `inBand` false) instead of no shards. Shards count only in order
 * (`advanceShardProgress`); the star unlocks when the last one is taken (`isStarUnlocked`).
 *
 * Only built while the hazard layer is on (`?lab=hazards` or the build default); the scene keeps
 * `null` otherwise, so flag-off play never reaches this file. A placement that fails or throws ships
 * the level without shards (star unlocked), never a locked star the player cannot open.
 */
import type { HazardGraph, HazardSpec } from '../mazer-core/hazards/graphContract';
import { advanceShardProgress, computeShardLayer, isStarUnlocked, type ShardLayerStatus } from '../mazer-core/hazards/shards';
import { createLegacyMazeHazardGraph } from './legacyHazardGraphAdapter';
import type { LegacyMazeSnapshot, LegacyPoint } from './legacyMaze';

/** Specs whose cells are all floor on the placement graph (a gate on a closed wrap opening cannot touch the route). */
const specsOnGraph = (graph: HazardGraph, specs: readonly HazardSpec[]): readonly HazardSpec[] => (
  specs.filter((spec) => (spec.kind === 'patrol' ? spec.route.every((cell) => graph.isWalkable(cell)) : graph.isWalkable(spec.cell)))
);

/** What a step onto a cell did: took the next shard, took the last one (star unlocks), or nothing. */
export type LegacyShardArrival = 'collected' | 'unlocked' | null;

export interface LegacyShardInstallOptions {
  readonly mode: 'play' | 'menu';
  readonly level: number;
  readonly saturationLevel: number;
  readonly exposureStage?: number;
  /** The specs live in play (the gate controller's Pulse Gates). */
  readonly specs: readonly HazardSpec[];
}

export interface LegacyShardInstallResult {
  readonly status: ShardLayerStatus | 'off';
  readonly count: number;
}

export interface LegacyShardDiagnostics {
  readonly status: ShardLayerStatus | 'off';
  readonly count: number;
  readonly collected: number;
  readonly locked: boolean;
  readonly cells: readonly LegacyPoint[];
  readonly digest: string;
  readonly routeTicks: number | null;
  /** False when the shipped route missed the strict band (nearest-route fallback) or nothing shipped. */
  readonly inBand: boolean;
  /** The placer's rejection codes when it did not place (diagnostics only). */
  readonly rejections: readonly string[];
  readonly computeMs: number;
}

export class LegacyShardRun {
  private width = 0;
  private cells: number[] = [];
  private next = 0;
  private changes = 0;
  private status: ShardLayerStatus | 'off' = 'off';
  private digest = '';
  private routeTicks: number | null = null;
  private inBand = false;
  private rejections: readonly string[] = [];
  private computeMs = 0;

  /** Bumps on every install, clear and collect, so a view can redraw only when something changed. */
  get version(): number {
    return this.changes;
  }

  get count(): number {
    return this.cells.length;
  }

  get collected(): number {
    return this.next;
  }

  /** True while this maze has shards (locked or not). */
  get active(): boolean {
    return this.cells.length > 0;
  }

  /** True while the end star is locked: shards exist and not all were taken. */
  get goalLocked(): boolean {
    return this.cells.length > 0 && !isStarUnlocked(this.next, this.cells.length);
  }

  shardX(index: number): number {
    return (this.cells[index] ?? 0) % Math.max(1, this.width);
  }

  shardY(index: number): number {
    return Math.floor((this.cells[index] ?? 0) / Math.max(1, this.width));
  }

  clear(): void {
    this.cells = [];
    this.next = 0;
    this.status = 'off';
    this.digest = '';
    this.rejections = [];
    this.routeTicks = null;
    this.inBand = false;
    this.computeMs = 0;
    this.changes += 1;
  }

  install(maze: LegacyMazeSnapshot, options: LegacyShardInstallOptions, now: () => number = () => 0): LegacyShardInstallResult {
    this.clear();
    if (options.mode !== 'play') {
      return { status: 'off', count: 0 };
    }
    const startedAt = now();
    try {
      // Every gate starts unlit (new maze, Pause > Reset level), so the wrap behind it counts as blocked: the
      // adapter walls it for any maze that carries `bleedGates` (slice 5, adapter-wide).
      const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
      const result = computeShardLayer(graph, {
        start,
        goal,
        mazeSeed: Math.trunc(maze.seed) | 0,
        level: options.level,
        saturationLevel: options.saturationLevel,
        exposureStage: options.exposureStage,
        specs: specsOnGraph(graph, options.specs),
        onStrictMiss: 'nearest'
      });
      this.width = graph.width;
      this.status = result.status;
      this.rejections = [...result.rejections];
      if (result.status === 'placed') {
        this.cells = [...result.shards];
        this.digest = result.digest;
        this.routeTicks = result.routeTicks;
        this.inBand = result.inBand;
      }
    } catch {
      // Fail open: a level whose placement throws ships without shards rather than with a star it cannot open.
      this.status = 'failed';
      this.cells = [];
    }
    this.computeMs = Math.max(0, now() - startedAt);
    this.changes += 1;
    return { status: this.status, count: this.cells.length };
  }

  /** A new attempt at the same maze (pause > Reset level): every shard goes back and the star locks again. */
  restart(): void {
    if (this.next === 0) {
      return;
    }
    this.next = 0;
    this.changes += 1;
  }

  /** Call after the player lands on `point`. Only the next shard in order can be taken. */
  noteArrival(point: LegacyPoint): LegacyShardArrival {
    if (!this.goalLocked) {
      return null;
    }
    const cell = (point.y * this.width) + point.x;
    const after = advanceShardProgress(this.cells, cell, this.next);
    if (after === this.next) {
      return null;
    }
    this.next = after;
    this.changes += 1;
    return isStarUnlocked(after, this.cells.length) ? 'unlocked' : 'collected';
  }

  describe(): LegacyShardDiagnostics {
    return {
      status: this.status,
      count: this.cells.length,
      collected: this.next,
      locked: this.goalLocked,
      cells: this.cells.map((_, index) => ({ x: this.shardX(index), y: this.shardY(index) })),
      digest: this.digest,
      rejections: this.rejections,
      routeTicks: this.routeTicks,
      inBand: this.inBand,
      computeMs: Math.round(this.computeMs * 1000) / 1000
    };
  }
}

export const createLegacyShardRun = (): LegacyShardRun => new LegacyShardRun();
