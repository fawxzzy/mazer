/**
 * Frame times measured by scripts/analysis/trail-perf-options-bench.mjs (--set=variants), copied from its JSON
 * (docs/playbook-notes/2026-11-24-mazer-trail-cost-options.md). Mean rAF frame interval in ms, standing still (idle) and
 * walking one step every 139 ms, per option, on the same level-300 long trail. Each run measures every option back to
 * back, so compare an option with Today inside the same run: the machine was shared and absolute numbers moved by up
 * to 2x between runs.
 */
import type { TrailPerfVariantId } from './starDustTrailVariants';

export interface TrailPerfFrame {
  idleMs: number;
  walkMs: number;
}

export interface TrailPerfRun {
  engine: 'webkit' | 'chromium';
  label: string;
  /** Runs before the C + A pick have no 'CA' row. */
  frames: { shipped: TrailPerfFrame } & Partial<Record<TrailPerfVariantId, TrailPerfFrame>>;
}

export const TRAIL_PERF_SETUP = 'level 300, 390x844 at 3x, long trail; WebKit = Playwright WebKit on Windows (build 2311 '
  + 'for runs 1-2, 2395 for runs 3-7; a stand-in for Safari, not an iPhone); Chromium = Chrome with 4x CPU slowdown';

export const TRAIL_PERF_RUNS: readonly TrailPerfRun[] = [
  {
    engine: 'webkit',
    label: 'WebKit run 1',
    frames: {
      shipped: { idleMs: 303.2, walkMs: 326.6 },
      A: { idleMs: 257.3, walkMs: 249.7 },
      B: { idleMs: 153.3, walkMs: 273.6 },
      C: { idleMs: 165.7, walkMs: 221.7 }
    }
  },
  {
    engine: 'webkit',
    label: 'WebKit run 2',
    frames: {
      shipped: { idleMs: 143.4, walkMs: 212.5 },
      A: { idleMs: 133.2, walkMs: 174 },
      B: { idleMs: 156.3, walkMs: 309.6 },
      C: { idleMs: 113.7, walkMs: 108 }
    }
  },
  {
    engine: 'chromium',
    label: 'Chromium run 1',
    frames: {
      shipped: { idleMs: 156.2, walkMs: 202.5 },
      A: { idleMs: 96.9, walkMs: 155 },
      B: { idleMs: 63.4, walkMs: 146.6 },
      C: { idleMs: 15.1, walkMs: 34.1 }
    }
  },
  {
    engine: 'chromium',
    label: 'Chromium run 2',
    frames: {
      shipped: { idleMs: 141.8, walkMs: 172.7 },
      A: { idleMs: 65.5, walkMs: 124.1 },
      B: { idleMs: 53.1, walkMs: 186.5 },
      C: { idleMs: 13.3, walkMs: 58.8 }
    }
  },
  // MAZER-PERF-017 C + A shipped as the game's painter (2026-11-24); 'CA' is the game's own cached painter.
  { engine: 'webkit', label: 'WebKit run 3', frames: { shipped: { idleMs: 268.5, walkMs: 199.1 }, CA: { idleMs: 94.3, walkMs: 262.3 } } },
  {
    engine: 'webkit',
    label: 'WebKit run 4',
    frames: {
      shipped: { idleMs: 124.4, walkMs: 190.5 },
      A: { idleMs: 116.6, walkMs: 165.4 },
      C: { idleMs: 79.3, walkMs: 164.3 },
      CA: { idleMs: 80.7, walkMs: 165.6 }
    }
  },
  {
    engine: 'webkit',
    label: 'WebKit run 5',
    frames: {
      shipped: { idleMs: 124.8, walkMs: 189.4 },
      A: { idleMs: 120, walkMs: 173.7 },
      C: { idleMs: 89.3, walkMs: 109.5 },
      CA: { idleMs: 100.6, walkMs: 143.1 }
    }
  },
  { engine: 'webkit', label: 'WebKit run 6', frames: { shipped: { idleMs: 160, walkMs: 209.8 }, CA: { idleMs: 99.2, walkMs: 142.8 } } },
  { engine: 'webkit', label: 'WebKit run 7', frames: { shipped: { idleMs: 140.6, walkMs: 212.6 }, CA: { idleMs: 96.6, walkMs: 111.6 } } },
  {
    engine: 'chromium',
    label: 'Chromium run 3',
    frames: {
      shipped: { idleMs: 177.8, walkMs: 232.2 },
      A: { idleMs: 73.1, walkMs: 117.2 },
      C: { idleMs: 16.3, walkMs: 42.8 },
      CA: { idleMs: 13.2, walkMs: 59.8 }
    }
  },
  {
    engine: 'chromium',
    label: 'Chromium run 4',
    frames: {
      shipped: { idleMs: 117.8, walkMs: 380.5 },
      A: { idleMs: 114.3, walkMs: 216 },
      C: { idleMs: 31.7, walkMs: 203.6 },
      CA: { idleMs: 25.9, walkMs: 153.6 }
    }
  }
];

const range = (values: number[], digits: number): string => {
  const low = Math.min(...values).toFixed(digits);
  const high = Math.max(...values).toFixed(digits);
  return low === high ? low : `${low} to ${high}`;
};

/**
 * One line per engine. Before: its walk / idle frame range over every run. An option: its frame as a fraction of
 * Before's frame from the same run, low to high over the runs that measured it (a ratio, because absolute numbers moved
 * up to 2x between runs).
 */
export const describeTrailPerfMeasurement = (id: TrailPerfVariantId): string[] => (
  (['webkit', 'chromium'] as const).map((engine) => {
    const runs = TRAIL_PERF_RUNS.filter((run) => run.engine === engine && run.frames[id] !== undefined);
    const name = engine === 'webkit' ? 'WebKit' : 'Chromium 4x';
    const runsText = `${runs.length} run${runs.length === 1 ? '' : 's'}`;
    if (id === 'shipped') {
      const ms = (key: keyof TrailPerfFrame) => range(runs.map((run) => run.frames.shipped[key]), 0);
      return `${name}: walk ${ms('walkMs')} ms; idle ${ms('idleMs')} ms (${runsText})`;
    }
    const ratio = (key: keyof TrailPerfFrame) => range(runs.map((run) => run.frames[id]![key] / run.frames.shipped[key]), 2);
    return `${name}: walk ${ratio('walkMs')}x Before; idle ${ratio('idleMs')}x (${runsText})`;
  })
);
