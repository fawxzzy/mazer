/**
 * MAZER-VIS-052: how many "bleed-off" openings (floor cells on the board's outer
 * ring: corridors that run off the screen edge / edge-wrap docks) do the menu demo
 * mazes carry, per ai-runner level?  Headless, no browser: it generates the same
 * runtime maze the menu does (mode 'menu', ai-runner track profile + scale).
 * Also reports bleed PATHS (an opening pair that wraps a whole line, legacyBleedPaths.ts),
 * how many mazes carry a bleed gate, and the mean build time per maze.
 *
 *   npx vite-node scripts/analysis/menu-demo-bleed-rate.ts -- --seeds=20 --levels=1,2,5,10,30,60,100,140
 *   npx vite-node scripts/analysis/menu-demo-bleed-rate.ts -- --src=./.old/src   (measure another checkout's src)
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const srcRoot = resolve(arg('src', './src'));
const seeds = Number(arg('seeds', '20'));
const levels = arg('levels', '1,2,3,5,8,10,15,20,30,50,80,100,120,140,200').split(',').map(Number);
const scaleBase = Number(arg('scale', '50'));

const load = (rel: string) => import(pathToFileURL(resolve(srcRoot, rel)).href);

export interface BleedSample { openings: number; wrapPairs: number; sides: number; }

// Floor cells on the outer ring; a wrap pair is an opening whose opposite-side cell is also floor.
export const countBoardBleed = (grid: boolean[][]): BleedSample => {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  let openings = 0;
  let wrapPairs = 0;
  const sides = new Set<string>();
  for (let x = 0; x < w; x += 1) {
    if (grid[0]![x]) { openings += 1; sides.add('N'); if (grid[h - 1]![x]) { wrapPairs += 1; } }
    if (grid[h - 1]![x]) { openings += 1; sides.add('S'); }
  }
  for (let y = 0; y < h; y += 1) {
    if (grid[y]![0]) { openings += 1; sides.add('W'); if (grid[y]![w - 1]) { wrapPairs += 1; } }
    if (grid[y]![w - 1]) { openings += 1; sides.add('E'); }
  }
  return { openings, wrapPairs, sides: sides.size };
};

const main = async () => {
  const prog = await load('legacy-runtime/legacyProgression.ts');
  const life = await load('legacy-runtime/legacyGenerationLifecycle.ts');
  const paths = await load('legacy-runtime/legacyBleedPaths.ts');
  const base = prog.createEmptyLegacyProgressionState().tracks['ai-runner'];
  console.log(`src=${srcRoot} seeds=${seeds}`);
  console.log('level | scale | mean openings | mean wrap pairs | % mazes >=1 opening | % mazes >=1 wrap pair | mean bleed paths | mean gates | % mazes with a gate | mean build ms');
  for (const level of levels) {
    const targetComplexity = Math.min(prog.LEGACY_PROGRESSION_MAX_COMPLEXITY, prog.LEGACY_PROGRESSION_MIN_COMPLEXITY + ((Math.min(level, 99) - 1) * 4));
    const track = { ...base, level: String(level), targetComplexity };
    const scale = prog.resolveLegacyProgressionGenerationScale(scaleBase, track, {});
    const { fraction } = prog.resolveLegacyProgressionScaleDetail(scaleBase, track, {});
    const resolveProfile = arg('profile', 'demo') === 'ladder' || !prog.resolveLegacyMenuDemoMazeGenerationProfileForProgression
      ? prog.resolveLegacyMazeGenerationProfileForProgression
      : prog.resolveLegacyMenuDemoMazeGenerationProfileForProgression;
    const profile = resolveProfile(track, { fraction });
    let op = 0; let wp = 0; let anyOp = 0; let anyWp = 0; let pathSum = 0; let gateSum = 0; let anyGate = 0; let ms = 0;
    for (let s = 0; s < seeds; s += 1) {
      const t0 = performance.now();
      const maze = life.createLegacyRuntimeMazeForMode('menu', scale, 1000 + (s * 7919), profile, { targetComplexity }, 1);
      ms += performance.now() - t0;
      pathSum += paths.listBleedPaths(maze.grid).length;
      const gates = maze.bleedGates?.length ?? 0;
      gateSum += gates; anyGate += gates > 0 ? 1 : 0;
      const b = countBoardBleed(maze.grid);
      op += b.openings; wp += b.wrapPairs; anyOp += b.openings > 0 ? 1 : 0; anyWp += b.wrapPairs > 0 ? 1 : 0;
    }
    console.log(`${level} | ${scale} | ${(op / seeds).toFixed(2)} | ${(wp / seeds).toFixed(2)} | ${Math.round((100 * anyOp) / seeds)} | ${Math.round((100 * anyWp) / seeds)} | ${(pathSum / seeds).toFixed(2)} | ${(gateSum / seeds).toFixed(2)} | ${Math.round((100 * anyGate) / seeds)} | ${(ms / seeds).toFixed(0)}`);
  }
};

await main();
