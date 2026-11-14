/**
 * MAZER-PERF-008: run one level-start maze generation OFF the main thread.
 *
 * Generation (`createLegacyRuntimeMazeForMode`) is pure and seed-deterministic,
 * but a large level blocks the main thread for 400-1200 ms at 4x CPU throttle,
 * far past one frame budget. This module lets a caller start the SAME call in a
 * Web Worker ahead of the moment it needs the maze, then take the result.
 *
 * Contract:
 *  - the worker executes exactly `runLegacyMazeGenerationJob`, i.e. the same
 *    production entry point with the same arguments, so "same seed => same
 *    maze" holds byte for byte (the only transform is structured clone);
 *  - correctness never depends on the worker: `resolve()` returns the worker
 *    maze only when it already arrived, otherwise it runs the identical call
 *    synchronously (exactly the pre-PERF-008 behaviour);
 *  - no Worker (node, tests, old browsers, `?mazeWorker=off`, a construction
 *    error) means no background build is offered at all.
 *
 * Pure: no Phaser, no DOM. The Worker constructor lives in
 * legacyMazeWorkerClient.ts and the worker script in
 * legacyMazeGeneration.worker.ts.
 */
import {
  createLegacyRuntimeMazeForMode,
  type LegacyGenerationMode,
  type LegacyGenerationRequest,
  type LegacyGenerationSelectionOptions
} from './legacyGenerationLifecycle';
import {
  normalizeLegacyMazeGenerationProfile,
  type LegacyMazeGenerationProfile,
  type LegacyMazeSnapshot
} from './legacyMaze';

export interface LegacyMazeGenerationJobInput {
  readonly aspectRatio: number;
  readonly mode: LegacyGenerationMode;
  readonly profile: LegacyMazeGenerationProfile;
  readonly scale: number;
  readonly seed: number;
  readonly selection: LegacyGenerationSelectionOptions;
}

export type LegacyMazeGenerationJobRequest = { readonly id: number; readonly input: LegacyMazeGenerationJobInput };
export type LegacyMazeGenerationJobResponse =
  | { readonly id: number; readonly maze: LegacyMazeSnapshot }
  | { readonly id: number; readonly error: string };

export const runLegacyMazeGenerationJob = (input: LegacyMazeGenerationJobInput): LegacyMazeSnapshot => (
  createLegacyRuntimeMazeForMode(
    input.mode,
    input.scale,
    input.seed,
    input.profile,
    input.selection,
    input.aspectRatio
  )
);

export const createLegacyMazeGenerationJobInput = (input: {
  aspectRatio?: number;
  mode: LegacyGenerationMode;
  profile?: Partial<LegacyMazeGenerationProfile> | null;
  scale: number;
  seed: number;
  selection?: LegacyGenerationSelectionOptions;
}): LegacyMazeGenerationJobInput => ({
  aspectRatio: input.aspectRatio ?? 1,
  mode: input.mode,
  profile: normalizeLegacyMazeGenerationProfile(input.profile),
  scale: input.scale,
  seed: input.seed,
  selection: input.selection ?? {}
});

/**
 * The job input that reproduces exactly what `consumeLegacyGenerationRequest` would build for
 * this request at `scale` (same seed, profile, aspect ratio and selection options).
 */
export const createLegacyMazeGenerationJobInputFromRequest = (
  request: LegacyGenerationRequest,
  scale: number
): LegacyMazeGenerationJobInput => createLegacyMazeGenerationJobInput({
  aspectRatio: request.aspectRatio,
  mode: request.mode,
  profile: request.generationProfile,
  scale,
  seed: request.seed,
  selection: {
    candidateCount: request.selectionCandidateCount,
    targetComplexity: request.targetComplexity,
    tolerance: request.selectionTolerance
  }
});

/** Everything that decides the maze EXCEPT the seed (so a seed can be chosen early and compared late). */
export const resolveLegacyMazeGenerationJobKey = (input: LegacyMazeGenerationJobInput): string => (
  JSON.stringify({
    aspectRatio: input.aspectRatio,
    mode: input.mode,
    profile: input.profile,
    scale: input.scale,
    selection: input.selection
  })
);

export type LegacyMazeBackgroundBuildStatus = 'pending' | 'ready' | 'failed' | 'cancelled';

export class LegacyMazeBackgroundBuild {
  public status: LegacyMazeBackgroundBuildStatus = 'pending';
  public maze: LegacyMazeSnapshot | null = null;

  public constructor(
    public readonly input: LegacyMazeGenerationJobInput,
    private readonly onCancel: (build: LegacyMazeBackgroundBuild) => void
  ) {}

  /** The worker maze if it already arrived; otherwise the identical synchronous build. */
  public resolve(): LegacyMazeSnapshot {
    if (this.status === 'ready' && this.maze !== null) {
      return this.maze;
    }
    this.cancel();
    return runLegacyMazeGenerationJob(this.input);
  }

  public cancel(): void {
    if (this.status === 'pending') {
      this.status = 'cancelled';
      this.onCancel(this);
    }
  }
}

/**
 * A single parked background build with a label the taker must match (a mode, or
 * a job key). `take` hands the maze over exactly once; a different label discards it.
 */
export class LegacyMazePrefetchSlot {
  private entry: { label: string; build: LegacyMazeBackgroundBuild } | null = null;

  public constructor(private readonly host: { start(input: LegacyMazeGenerationJobInput): LegacyMazeBackgroundBuild | null; readonly available: boolean }) {}

  public get available(): boolean {
    return this.host.available;
  }

  public get occupied(): boolean {
    return this.entry !== null;
  }

  /** Parks a new background build (replacing any parked one). False when no worker is available. */
  public start(input: LegacyMazeGenerationJobInput, label: string): boolean {
    this.clear();
    const build = this.host.start(input);
    if (build === null) {
      return false;
    }
    this.entry = { label, build };
    return true;
  }

  /** Creates the worker now (it loads off the main thread) so the first real build does not pay for its start-up. */
  public warm(): void {
    void this.host.available;
  }

  /** MAZER-PERF-009: where the parked build stands (null when nothing is parked), without taking it. */
  public peekStatus(): LegacyMazeBackgroundBuildStatus | null {
    return this.entry?.build.status ?? null;
  }

  /** The seed of the parked build when its label matches, without taking it (the maze can arrive later). */
  public peekSeed(label: string): number | null {
    return this.entry !== null && this.entry.label === label ? this.entry.build.input.seed : null;
  }

  /** The parked maze (worker result, or the identical synchronous build) when the label matches; else null. */
  public take(label: string): { seed: number; maze: LegacyMazeSnapshot } | null {
    const entry = this.entry;
    if (entry === null) {
      return null;
    }
    this.entry = null;
    if (entry.label !== label) {
      entry.build.cancel();
      return null;
    }
    return { seed: entry.build.input.seed, maze: entry.build.resolve() };
  }

  /** Discards the parked build, only when `label` is omitted or matches. */
  public clear(label?: string): void {
    if (this.entry === null || (label !== undefined && this.entry.label !== label)) {
      return;
    }
    this.entry.build.cancel();
    this.entry = null;
  }
}

export interface LegacyMazeWorkerLike {
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: LegacyMazeGenerationJobResponse }) => void) | null;
  postMessage(message: LegacyMazeGenerationJobRequest): void;
  terminate(): void;
}

export type LegacyMazeWorkerFactory = () => LegacyMazeWorkerLike | null;

/** One lazily created worker shared by every background build. */
export class LegacyMazeWorkerHost {
  private worker: LegacyMazeWorkerLike | null = null;
  private broken = false;
  private nextId = 1;
  private readonly inFlight = new Map<number, LegacyMazeBackgroundBuild>();

  public constructor(private readonly factory: LegacyMazeWorkerFactory) {}

  /** A background build, or null when no worker can be had (callers then do nothing extra). */
  public start(input: LegacyMazeGenerationJobInput): LegacyMazeBackgroundBuild | null {
    const worker = this.ensureWorker();
    if (worker === null) {
      return null;
    }
    const id = this.nextId;
    this.nextId += 1;
    const build = new LegacyMazeBackgroundBuild(input, (cancelled) => this.release(cancelled));
    this.inFlight.set(id, build);
    try {
      worker.postMessage({ id, input });
    } catch {
      this.fail();
      return null;
    }
    return build;
  }

  public get available(): boolean {
    return !this.broken && (this.worker !== null || this.ensureWorker() !== null);
  }

  private ensureWorker(): LegacyMazeWorkerLike | null {
    if (this.worker !== null) {
      return this.worker;
    }
    if (this.broken) {
      return null;
    }
    let created: LegacyMazeWorkerLike | null = null;
    try {
      created = this.factory();
    } catch {
      created = null;
    }
    if (created === null) {
      this.broken = true;
      return null;
    }
    created.onmessage = (event) => this.receive(event.data);
    created.onerror = () => this.fail();
    this.worker = created;
    return created;
  }

  private receive(response: LegacyMazeGenerationJobResponse): void {
    const build = this.inFlight.get(response.id);
    if (build === undefined) {
      return;
    }
    this.inFlight.delete(response.id);
    if (build.status !== 'pending') {
      return;
    }
    if ('maze' in response) {
      build.maze = response.maze;
      build.status = 'ready';
    } else {
      build.status = 'failed';
    }
  }

  private fail(): void {
    this.broken = true;
    this.dropWorker();
  }

  private release(cancelled: LegacyMazeBackgroundBuild): void {
    for (const [id, build] of this.inFlight) {
      if (build === cancelled) {
        this.inFlight.delete(id);
      }
    }
    // A worker cannot interrupt a generation it already started, so the only way to
    // stop wasted work (and not queue the next build behind it) is to restart it.
    // Builds still queued on it fall back to the synchronous path through resolve().
    if (this.worker !== null) {
      this.dropWorker();
    }
  }

  private dropWorker(): void {
    const worker = this.worker;
    this.worker = null;
    worker?.terminate();
    for (const build of this.inFlight.values()) {
      if (build.status === 'pending') {
        build.status = 'failed';
      }
    }
    this.inFlight.clear();
  }
}
