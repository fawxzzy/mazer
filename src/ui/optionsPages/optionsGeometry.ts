/**
 * Pure geometry and sample data for the dev-only options pages (shards, Help). No DOM, no Phaser, no clock.
 * Numbers that exist in the game are imported from the game (end star radii, Spark kite ratios, the shard schedule), never
 * retyped, so a page cannot drift from the real look.
 */
import { resolveShardRoutePlan } from '../../mazer-core/hazards/shards';

/** Real goal star proportions (boardTileStyle goalStarOuterOfRadius / goalStarInnerOfRadius). */
export const GOAL_STAR_OUTER = 0.7;
export const GOAL_STAR_INNER = 0.32;
/** Real Spark kite proportions as shares of a tile (SPARK_PLAYER: nose 0.44, wings 0.27, tail 0.29). */
export const SPARK_KITE = Object.freeze({ nose: 0.44, wing: 0.27, tail: 0.29 });

export interface UnitPoint { readonly x: number; readonly y: number }

const pct = (value: number): string => `${Math.round(value * 1000) / 10}%`;

/** CSS clip-path polygon() from points in a unit box (0..1). */
export const polygonCss = (points: readonly UnitPoint[]): string => (
  `polygon(${points.map((p) => `${pct(p.x)} ${pct(p.y)}`).join(', ')})`
);

/** A `tips`-point star centred in the unit box. `outer` and `inner` are shares of the half-box; tip 0 points up. */
export const starPoints = (tips: number, outer: number, inner: number): UnitPoint[] => {
  const out: UnitPoint[] = [];
  for (let i = 0; i < tips * 2; i += 1) {
    const radius = (i % 2 === 0 ? outer : inner) * 0.5;
    const angle = (Math.PI * i) / tips - Math.PI / 2;
    out.push({ x: 0.5 + radius * Math.cos(angle), y: 0.5 + radius * Math.sin(angle) });
  }
  return out;
};

/** The end star exactly as the game proportions it: 5 tips, outer 0.7, inner 0.32 of the half tile. */
export const goalStarPoints = (): UnitPoint[] => starPoints(5, GOAL_STAR_OUTER, GOAL_STAR_INNER);

/** The Spark player kite pointing right (+x = heading), centred on the tile, as unit-box points. */
export const sparkKitePoints = (): UnitPoint[] => [
  { x: 0.5 + SPARK_KITE.nose, y: 0.5 },
  { x: 0.5, y: 0.5 + SPARK_KITE.wing },
  { x: 0.5 - SPARK_KITE.tail, y: 0.5 },
  { x: 0.5, y: 0.5 - SPARK_KITE.wing }
];

/** The four-point star-dust sparkle (the shipped trail vocabulary). */
export const sparklePoints = (): UnitPoint[] => starPoints(4, 1, 0.26);

/** A faceted diamond (rhombus). */
export const diamondPoints = (): UnitPoint[] => [
  { x: 0.5, y: 0.04 }, { x: 0.9, y: 0.5 }, { x: 0.5, y: 0.96 }, { x: 0.1, y: 0.5 }
];

/** A hexagon with flat top, pointing left and right. */
export const hexPoints = (): UnitPoint[] => [
  { x: 0.5, y: 0.06 }, { x: 0.9, y: 0.28 }, { x: 0.9, y: 0.72 }, { x: 0.5, y: 0.94 }, { x: 0.1, y: 0.72 }, { x: 0.1, y: 0.28 }
];

/** Shard schedule facts straight from the game code (strict from saturation L288). */
export interface ShardLevelFact { readonly level: number; readonly shards: number; readonly target: number | null }

export const SHARD_SATURATION_LEVEL = 288;

export const shardFactAt = (level: number): ShardLevelFact => {
  const plan = resolveShardRoutePlan(level, { saturationLevel: SHARD_SATURATION_LEVEL });
  return { level, shards: plan.count, target: plan.target };
};

/** Levels the pages quote: first shard (L60), saturation (L288) and the first growth steps. */
export const SHARD_SAMPLE_LEVELS: readonly number[] = Object.freeze([60, 200, 288, 338, 538, 2038]);

/** Which of `total` shards counts as collected / next / later, for a draw that must show order. */
export type ShardState = 'collected' | 'next' | 'later';
export const shardStateOf = (index: number, collected: number): ShardState => (
  index < collected ? 'collected' : index === collected ? 'next' : 'later'
);

/** Pip row model: up to `maxPips` pips, else a single count. Keeps a 35-shard level readable on a phone. */
export const pipModel = (total: number, collected: number, maxPips: number): { pips: ShardState[] | null; label: string } => {
  const label = `${Math.min(collected, total)} / ${total}`;
  if (total > maxPips) return { pips: null, label };
  return { pips: Array.from({ length: total }, (_, i) => shardStateOf(i, collected)), label };
};
