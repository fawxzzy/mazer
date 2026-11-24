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
  frames: Record<TrailPerfVariantId, TrailPerfFrame>;
}

export const TRAIL_PERF_SETUP = 'level 300, 390x844 at 3x, long trail; WebKit = Playwright WebKit 2311 on Windows (a '
  + 'stand-in for Safari, not an iPhone); Chromium = Chrome with 4x CPU slowdown';

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
  }
];

/** One line per engine: this option's walk / idle frame next to Today's from the same run, for every run. */
export const describeTrailPerfMeasurement = (id: TrailPerfVariantId): string[] => (
  (['webkit', 'chromium'] as const).map((engine) => {
    const runs = TRAIL_PERF_RUNS.filter((run) => run.engine === engine);
    const name = engine === 'webkit' ? 'WebKit' : 'Chromium 4x';
    const part = (key: keyof TrailPerfFrame) => runs
      .map((run) => (id === 'shipped'
        ? `${Math.round(run.frames.shipped[key])}`
        : `${Math.round(run.frames[id][key])} vs ${Math.round(run.frames.shipped[key])}`))
      .join(', ');
    return `${name}: walk ${part('walkMs')} ms; idle ${part('idleMs')} ms`;
  })
);
