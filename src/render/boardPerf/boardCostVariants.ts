/**
 * The board-layer cost options shown on board-cost-options.html (dev/proposal page, not a build input). Pure data, so
 * the page, the bench (scripts/analysis/board-cost-options-bench.mjs) and the tests agree on ids and wording.
 *
 *   today: the game as it ships (Phaser draws the baked board with its roundPixels half-pixel stretch, canvas at the
 *          device ratio capped at 3).
 *   A:     exact board copy. The same baked board, copied 1:1 at a whole device pixel (src/render/exactImageBlit.ts)
 *          instead of resampled; canvas still at 3x.
 *   B:     2x canvas cap. Everything drawn at 2 device px per css px on a 3x phone; the browser scales the canvas up.
 *   C:     both A and B.
 */
export type BoardCostVariantId = 'today' | 'A' | 'B' | 'C';

export interface BoardCostVariant {
  id: BoardCostVariantId;
  name: string;
  /** Copy the board 1:1 (exactImageBlit.ts). */
  exactBoard: boolean;
  /** Canvas backing scale cap (null = today's cap of 3). Applied at boot, or in place (the page re-lays out the scene). */
  canvasScaleCap: number | null;
  /** What it looks like next to Today, in plain words (checked on captures, see the playbook note). */
  look: string;
}

export const BOARD_COST_VARIANTS: readonly BoardCostVariant[] = Object.freeze([
  {
    id: 'today',
    name: 'Today',
    exactBoard: false,
    canvasScaleCap: null,
    look: 'The game as it ships.'
  },
  {
    id: 'A',
    name: 'A Exact board',
    exactBoard: true,
    canvasScaleCap: null,
    look: 'Same tiles, same 3x canvas. The board is copied pixel for pixel instead of stretched by half a device pixel, '
      + 'so tile edges are a hair sharper; nothing moves by more than half a device pixel.'
  },
  {
    id: 'B',
    name: 'B 2x canvas',
    exactBoard: false,
    canvasScaleCap: 2,
    look: 'Everything (tiles, stars, text, trail) drawn at 2x and scaled up by the phone: visibly softer edges on a 3x '
      + 'iPhone.'
  },
  {
    id: 'C',
    name: 'C Both',
    exactBoard: true,
    canvasScaleCap: 2,
    look: 'A and B together: the 2x softness of B, with the board copied pixel for pixel.'
  }
]);

export const findBoardCostVariant = (id: string | null | undefined): BoardCostVariant => (
  BOARD_COST_VARIANTS.find((variant) => variant.id === id) ?? BOARD_COST_VARIANTS[0]!
);

/** The device pixel ratio the page reports to the game under a cap (null = untouched). */
export const capDevicePixelRatio = (real: number, cap: number | null): number => {
  const safe = Number.isFinite(real) && real > 0 ? real : 1;
  return cap === null ? safe : Math.min(safe, cap);
};
