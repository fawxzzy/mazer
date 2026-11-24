/**
 * Frame times measured by scripts/analysis/board-cost-options-bench.mjs --set=inplace, copied from its output
 * (docs/playbook-notes/2026-11-24-mazer-board-tile-cost-options.md). Mean rAF frame interval in ms at level 300 with a
 * long trail, standing still (idle) and walking one step every 139 ms, per option, trail painting off (the frame without
 * the trail painter) and on (today's painter). One page and one maze; each round switches through every option in place,
 * in a rotating order; the value is the median of 5 rounds. Compare an option with Today in the same run: the machine
 * was shared, so absolute numbers move between runs.
 */
import type { BoardCostVariantId } from './boardCostVariants';

export interface BoardCostFrame { idleMs: number; walkMs: number }

export interface BoardCostRun {
  engine: 'webkit' | 'chromium';
  label: string;
  trailPaint: boolean;
  frames: Record<BoardCostVariantId, BoardCostFrame>;
}

export const BOARD_COST_SETUP = 'level 300, 390x844 at 3x, long trail, same maze for every option; WebKit = Playwright '
  + 'WebKit on Windows (a stand-in for Safari, not an iPhone: software raster and a software compositor)';

export const BOARD_COST_RUNS: readonly BoardCostRun[] = [
  {
    engine: 'webkit',
    label: 'WebKit, trail paint off',
    trailPaint: false,
    frames: {
      today: { idleMs: 84.7, walkMs: 94.0 },
      A: { idleMs: 55.3, walkMs: 66.1 },
      B: { idleMs: 76.9, walkMs: 85.9 },
      C: { idleMs: 67.1, walkMs: 76.7 }
    }
  },
  {
    engine: 'webkit',
    label: 'WebKit, trail paint on',
    trailPaint: true,
    frames: {
      today: { idleMs: 126.6, walkMs: 172.9 },
      A: { idleMs: 82.1, walkMs: 156.0 },
      B: { idleMs: 97.4, walkMs: 164.9 },
      C: { idleMs: 96.2, walkMs: 196.4 }
    }
  }
];

/** One line per run: this option's walk / idle next to Today's. */
export const describeBoardCostMeasurement = (id: BoardCostVariantId): string[] => {
  if (BOARD_COST_RUNS.length === 0) return ['not measured yet'];
  return BOARD_COST_RUNS.map((run) => {
    const own = run.frames[id];
    const today = run.frames.today;
    const pair = (key: keyof BoardCostFrame): string => (id === 'today'
      ? `${Math.round(today[key])}`
      : `${Math.round(own[key])} vs ${Math.round(today[key])}`);
    return `${run.label}: walk ${pair('walkMs')} ms, idle ${pair('idleMs')} ms`;
  });
};
