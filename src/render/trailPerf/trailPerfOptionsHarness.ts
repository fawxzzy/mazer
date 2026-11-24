/**
 * Options-page harness (trail-perf-options.html only): switches the star-dust painter on the live scene, fills a long
 * trail, walks it with real moves, and keeps a rolling frame meter. Reads the scene through the QA hooks the game already
 * exposes (window.__MAZER_GAME__, and window.__MAZER_QA__ under ?runtimeDiagnostics=1). Not imported by the game.
 */
import { setStarDustTrailRenderOverride } from '../starDustRenderOverride';
import { TRAIL_REDRAW_COST_MULTIPLE } from '../trailRedrawGate';
import {
  createStarDustPlanRenderer,
  findTrailPerfVariant,
  SHIPPED_PLAN,
  type StarDustRenderPlan,
  type TrailPerfRenderStats,
  type TrailPerfVariantId
} from './starDustTrailVariants';

interface GridPoint { x: number; y: number }
interface SceneLike {
  boardTileLayer?: unknown;
  maze?: { grid: boolean[][] };
  player: GridPoint;
  trail: GridPoint[];
  mode?: string;
  boardDynamicDirty?: boolean;
  trailDrawRecord?: { costMs: number } | null;
  isLegacyPlayLifecycleInputLocked?: () => boolean;
}
interface GameLike { scene: { scenes: SceneLike[] } }
interface QaLike { movePlayPlayer: (direction: string) => { accepted?: boolean } | null | undefined }

const findScene = (): SceneLike | null => {
  const game = (window as unknown as { __MAZER_GAME__?: GameLike }).__MAZER_GAME__;
  return game?.scene?.scenes?.find((scene) => Boolean(scene.boardTileLayer)) ?? null;
};

export const isPlayReady = (): boolean => {
  const scene = findScene();
  return Boolean(scene?.maze && scene.mode === 'play' && scene.isLegacyPlayLifecycleInputLocked?.() === false);
};

const key = (p: GridPoint): string => `${p.x},${p.y}`;

/** Longest shortest-path route in the maze (BFS twice), as the PERF-017 profiler builds it. */
const longestRoute = (grid: boolean[][], from: GridPoint): GridPoint[] => {
  const bfs = (start: GridPoint): GridPoint[] => {
    const prev = new Map<string, GridPoint | null>([[key(start), null]]);
    const queue: GridPoint[] = [start];
    let last = start;
    for (let head = 0; head < queue.length; head += 1) {
      const cur = queue[head]!;
      last = cur;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
        const next = { x: cur.x + dx, y: cur.y + dy };
        if (grid[next.y]?.[next.x] !== true || prev.has(key(next))) continue;
        prev.set(key(next), cur);
        queue.push(next);
      }
    }
    const path: GridPoint[] = [];
    for (let c: GridPoint | null = last; c; c = prev.get(key(c)) ?? null) path.push({ x: c.x, y: c.y });
    return path.reverse();
  };
  const far = bfs(from);
  return bfs(far[far.length - 1]!);
};

export interface FrameMeterReading { frames: number; meanMs: number; p95Ms: number; fps: number }

export interface TrailPerfHarness {
  readonly variant: TrailPerfVariantId;
  select(id: TrailPerfVariantId): void;
  /** Bench only: paints with today's plan changed by `changes` (layer ablation). */
  usePlan(changes: Partial<StarDustRenderPlan>): void;
  /** One real move along the stored route; false at its end or when the move was refused. */
  step(): boolean;
  stats(): TrailPerfRenderStats;
  /** Puts `tilesShortOfEnd` short of the longest route into the trail (player on its end). Returns the trail length. */
  fillLongTrail(tilesShortOfEnd?: number): number;
  /** Walks on along the stored route with real moves every `stepMs`. */
  startWalk(stepMs?: number): void;
  stopWalk(): void;
  readonly walking: boolean;
  meter(windowMs?: number): FrameMeterReading;
  routeLength(): number;
}

export const createTrailPerfHarness = (initial: TrailPerfVariantId): TrailPerfHarness => {
  let variant: TrailPerfVariantId = initial;
  let plan: Readonly<StarDustRenderPlan> = findTrailPerfVariant(variant).plan;
  let renderer = createStarDustPlanRenderer(plan);
  const install = (): void => {
    // Today's draw goes through the shipped code path itself (no override), so the baseline is the real thing.
    setStarDustTrailRenderOverride(variant === 'shipped' ? null : renderer);
  };
  install();

  let route: GridPoint[] = [];
  let walkTimer: number | null = null;

  // Rolling frame meter: rAF deltas with their timestamps.
  const deltas: Array<{ at: number; ms: number }> = [];
  let lastFrame: number | null = null;
  const tick = (now: number): void => {
    // B: the scene's redraw gate waits TRAIL_REDRAW_COST_MULTIPLE x the last rebuild's cost before a clock-only repaint
    // (trailRedrawGate.ts). Holding that cost at idleRepaintMs / multiple gives the idle cadence the game would use; a
    // move still repaints at once (a changed stamp ignores the gap).
    if (plan.idleRepaintMs > 0) {
      const record = findScene()?.trailDrawRecord;
      const floor = plan.idleRepaintMs / TRAIL_REDRAW_COST_MULTIPLE;
      if (record && record.costMs < floor) record.costMs = floor;
    }
    if (lastFrame !== null) {
      deltas.push({ at: now, ms: now - lastFrame });
      while (deltas.length > 0 && now - deltas[0]!.at > 10000) deltas.shift();
    }
    lastFrame = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const dirFor = (a: GridPoint, b: GridPoint): string => (
    b.x > a.x ? 'move_right' : b.x < a.x ? 'move_left' : b.y > a.y ? 'move_down' : 'move_up'
  );

  const harness: TrailPerfHarness = {
    get variant() { return variant; },
    select(id) {
      variant = findTrailPerfVariant(id).id;
      plan = findTrailPerfVariant(variant).plan;
      renderer = createStarDustPlanRenderer(plan);
      install();
      const scene = findScene();
      if (scene) scene.boardDynamicDirty = true;
    },
    usePlan(changes) {
      variant = 'shipped';
      plan = Object.freeze({ ...SHIPPED_PLAN, ...changes });
      renderer = createStarDustPlanRenderer(plan);
      setStarDustTrailRenderOverride(renderer);
      const scene = findScene();
      if (scene) scene.boardDynamicDirty = true;
    },
    step() {
      const scene = findScene();
      const qa = (window as unknown as { __MAZER_QA__?: QaLike }).__MAZER_QA__;
      if (!scene || !qa) return false;
      const i = route.findIndex((p) => p.x === scene.player.x && p.y === scene.player.y);
      if (i < 0 || i + 1 >= route.length) return false;
      return qa.movePlayPlayer(dirFor(route[i]!, route[i + 1]!))?.accepted === true;
    },
    stats: () => ({ ...renderer.stats }),
    fillLongTrail(tilesShortOfEnd = 40) {
      const scene = findScene();
      if (!scene?.maze) return 0;
      route = longestRoute(scene.maze.grid, scene.player);
      const length = Math.max(2, route.length - Math.max(0, tilesShortOfEnd));
      const path = route.slice(0, length).map((p) => ({ ...p }));
      scene.trail = path;
      scene.player = { ...path[path.length - 1]! };
      scene.boardDynamicDirty = true;
      return path.length;
    },
    startWalk(stepMs = 139) {
      harness.stopWalk();
      const qa = (window as unknown as { __MAZER_QA__?: QaLike }).__MAZER_QA__;
      if (!qa || route.length === 0) return;
      walkTimer = window.setInterval(() => {
        const scene = findScene();
        const i = scene ? route.findIndex((p) => p.x === scene.player.x && p.y === scene.player.y) : -1;
        if (i < 0 || i + 1 >= route.length) {
          harness.stopWalk();
          return;
        }
        harness.step();
      }, stepMs);
    },
    stopWalk() {
      if (walkTimer !== null) window.clearInterval(walkTimer);
      walkTimer = null;
    },
    get walking() { return walkTimer !== null; },
    meter(windowMs = 2000) {
      const now = performance.now();
      const recent = deltas.filter((d) => now - d.at <= windowMs).map((d) => d.ms);
      if (recent.length === 0) return { frames: 0, meanMs: 0, p95Ms: 0, fps: 0 };
      const sorted = [...recent].sort((a, b) => a - b);
      const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
      return {
        frames: recent.length,
        meanMs: mean,
        p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!,
        fps: 1000 / mean
      };
    },
    routeLength: () => route.length
  };
  return harness;
};
