// MAZER-GEN-030: measurable maze-quality figures for the "too many short useless dead ends, usually one route"
// complaint. Pure and deterministic; the board is a torus (the game's wrap corridors), like the felt explorer.
// Used by the before/after sweep (scripts/analysis/maze-quality-report.ts) and its guard test
// (tests/reset/legacy-maze-quality.test.ts).
//
//   deadEnds          dead-end branches: walk from every floor tip (one floor neighbour, not start/goal) through
//                     degree-2 cells to a junction
//   shortDeadEnds     branches of QUALITY_STUB_MAX_LEN (3) cells or fewer: the nubs the felt explorer never enters
//   shortShare        shortDeadEnds / deadEnds
//   meanDeadEndLen    mean branch length in cells
//   bypassable        1 when at least one step of the shortest route lies on a loop (is not a bridge), i.e. there
//                     is a second way round some stretch of the route; 0 for a pure single-route maze
//   bypassShare       share of the shortest route's steps that lie on a loop (1 - forced share)
//   cyclomatic        E - V + 1: independent loops
//   solutionLength    shortest route steps (torus)

export interface QualityMetricsMaze {
  readonly width: number;
  readonly height: number;
  readonly grid: ReadonlyArray<ReadonlyArray<boolean>>;
  readonly start: { readonly x: number; readonly y: number };
  readonly goal: { readonly x: number; readonly y: number };
}

export interface MazeQualityMetrics {
  readonly reachable: number;
  readonly deadEnds: number;
  readonly shortDeadEnds: number;
  readonly shortShare: number;
  readonly meanDeadEndLen: number;
  readonly bypassable: 0 | 1;
  readonly bypassShare: number;
  readonly cyclomatic: number;
  readonly solutionLength: number;
}

const SHORT_BRANCH_MAX = 3;

// wrap: false measures the board as drawn (no wrap corridors), true the torus the player can really walk.
export const measureMazeQuality = (maze: QualityMetricsMaze, wrap = true): MazeQualityMetrics => {
  const { width: w, height: h } = maze;
  const n = w * h;
  const open = new Uint8Array(n);
  for (let y = 0; y < h; y += 1) { for (let x = 0; x < w; x += 1) { open[(y * w) + x] = maze.grid[y]?.[x] === true ? 1 : 0; } }
  const adjacency: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const list: number[] = [];
    if (open[i] === 1) {
      const x = i % w; const y = (i - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx; const ny = y + dy;
        if (!wrap && (nx < 0 || ny < 0 || nx >= w || ny >= h)) { continue; }
        const j = (((ny % h) + h) % h) * w + (((nx % w) + w) % w);
        if (j !== i && open[j] === 1 && !list.includes(j)) { list.push(j); }
      }
    }
    adjacency.push(list);
  }
  const s = (maze.start.y * w) + maze.start.x;
  const g = (maze.goal.y * w) + maze.goal.x;
  const dist = new Int32Array(n).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  const order: number[] = [s];
  dist[s] = 0;
  for (let q = 0; q < order.length; q += 1) {
    const i = order[q]!;
    for (const j of adjacency[i]!) { if (dist[j] === -1) { dist[j] = dist[i]! + 1; prev[j] = i; order.push(j); } }
  }
  let edges2 = 0;
  for (const i of order) { edges2 += adjacency[i]!.length; }
  const cyclomatic = (edges2 / 2) - order.length + 1;
  const path: number[] = [];
  if (dist[g]! >= 0) { for (let c = g; c !== -1; c = prev[c]!) { path.push(c); } path.reverse(); }

  // Dead-end branches.
  const lengths: number[] = [];
  for (const i of order) {
    if (adjacency[i]!.length !== 1 || i === s || i === g) { continue; }
    let len = 1; let from = i; let cur = adjacency[i]![0]!;
    while (adjacency[cur]!.length === 2 && cur !== s && cur !== g && len <= n) {
      const next = adjacency[cur]!.find((j) => j !== from)!;
      from = cur; cur = next; len += 1;
    }
    lengths.push(len);
  }
  const shortDeadEnds = lengths.filter((len) => len <= SHORT_BRANCH_MAX).length;

  // Bridges (iterative Tarjan) -> the share of the route that has a way round.
  const tin = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const bridges = new Set<number>();
  let timer = 0;
  const stack: { v: number; parent: number; next: number }[] = [{ v: s, parent: -1, next: 0 }];
  tin[s] = timer; low[s] = timer; timer += 1;
  while (stack.length > 0) {
    const top = stack[stack.length - 1]!;
    const list = adjacency[top.v]!;
    if (top.next < list.length) {
      const to = list[top.next]!; top.next += 1;
      if (to === top.parent) { continue; }
      if (tin[to]! >= 0) { low[top.v] = Math.min(low[top.v]!, tin[to]!); } else {
        tin[to] = timer; low[to] = timer; timer += 1;
        stack.push({ v: to, parent: top.v, next: 0 });
      }
    } else {
      stack.pop();
      if (top.parent >= 0) {
        low[top.parent] = Math.min(low[top.parent]!, low[top.v]!);
        if (low[top.v]! > tin[top.parent]!) { bridges.add((Math.min(top.parent, top.v) * n) + Math.max(top.parent, top.v)); }
      }
    }
  }
  let onLoop = 0;
  for (let k = 0; k + 1 < path.length; k += 1) {
    const a = path[k]!; const b = path[k + 1]!;
    if (!bridges.has((Math.min(a, b) * n) + Math.max(a, b))) { onLoop += 1; }
  }
  const solutionLength = Math.max(0, path.length - 1);
  return {
    reachable: order.length,
    deadEnds: lengths.length,
    shortDeadEnds,
    shortShare: lengths.length > 0 ? shortDeadEnds / lengths.length : 0,
    meanDeadEndLen: lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0,
    bypassable: onLoop > 0 ? 1 : 0,
    bypassShare: solutionLength > 0 ? onLoop / solutionLength : 0,
    cyclomatic,
    solutionLength
  };
};
