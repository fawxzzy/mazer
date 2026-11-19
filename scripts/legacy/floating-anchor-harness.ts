/**
 * MAZER-L9 tuning harness: prints anchor trajectories of the floating-anchor controller for scripted finger paths,
 * so the leash / ease can be judged (and re-tuned) without a phone.
 *
 *   npx vite-node scripts/legacy/floating-anchor-harness.ts [--leash-inches 1] [--ease-ms 140] [--dpr 3] [--fine]
 *
 * Units are CSS px; one inch is resolveCssPxPerInch (160 on a phone, 96 with --fine). Each path is sampled at 60 Hz
 * like a real pointer stream. "reversal cost" is how far the finger travels after turning around before the
 * finger-minus-anchor offset points the new way past the stick deadzone (what flips the movement direction).
 */
import {
  createFloatingAnchorController,
  resolveCssPxPerInch,
  resolveFloatingAnchorConfig,
  type FloatingAnchorConfig,
  type FloatingAnchorPoint
} from '../../src/legacy-runtime/legacyFloatingAnchor';

export interface HarnessSample {
  anchor: FloatingAnchorPoint;
  finger: FloatingAnchorPoint;
  timeMs: number;
}

export interface HarnessPath {
  name: string;
  note: string;
  /** Finger position at time t (ms), or null once the path has ended. Positions are in inches from the touch-down. */
  at(timeMs: number): FloatingAnchorPoint | null;
  durationMs: number;
}

const STEP_MS = 1000 / 60;

const lerp = (a: number, b: number, t: number): number => a + ((b - a) * Math.min(1, Math.max(0, t)));

const segmentPath = (
  name: string,
  note: string,
  legs: ReadonlyArray<{ toX: number; toY: number; ms: number }>
): HarnessPath => ({
  at(timeMs) {
    let start = 0;
    let fromX = 0;
    let fromY = 0;
    for (const leg of legs) {
      if (timeMs <= start + leg.ms) {
        const t = leg.ms === 0 ? 1 : (timeMs - start) / leg.ms;
        return { x: lerp(fromX, leg.toX, t), y: lerp(fromY, leg.toY, t) };
      }
      start += leg.ms;
      fromX = leg.toX;
      fromY = leg.toY;
    }
    return null;
  },
  durationMs: legs.reduce((sum, leg) => sum + leg.ms, 0),
  name,
  note
});

export const HARNESS_PATHS: readonly HarnessPath[] = [
  segmentPath('wiggle-inside-leash', 'stays under 1 inch: the anchor must not move at all', [
    { toX: 0.6, toY: 0, ms: 300 }, { toX: -0.6, toY: 0, ms: 500 }, { toX: 0, toY: 0.5, ms: 300 }
  ]),
  segmentPath('slow-drag-3in', '3 inches right at ~2 in/s, then rest', [
    { toX: 3, toY: 0, ms: 1500 }, { toX: 3, toY: 0, ms: 800 }
  ]),
  segmentPath('flick-3in', '3 inches right in 120 ms, then rest: fast far finger, anchor eases in', [
    { toX: 3, toY: 0, ms: 120 }, { toX: 3, toY: 0, ms: 900 }
  ]),
  segmentPath('quick-reversal', '2 in right, straight back 2 in left, no lift', [
    { toX: 2, toY: 0, ms: 500 }, { toX: -1, toY: 0, ms: 600 }, { toX: -1, toY: 0, ms: 300 }
  ]),
  segmentPath('right-then-up', '2 in right then 2 in up: the turn picks up the new axis', [
    { toX: 2, toY: 0, ms: 500 }, { toX: 2, toY: -2, ms: 500 }, { toX: 2, toY: -2, ms: 300 }
  ]),
  segmentPath('circle-1.5in-radius', 'one lap of a 1.5 in radius circle', (() => {
    const legs: Array<{ toX: number; toY: number; ms: number }> = [{ toX: 1.5, toY: 0, ms: 200 }];
    for (let i = 1; i <= 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      legs.push({ toX: 1.5 * Math.cos(angle), toY: 1.5 * Math.sin(angle), ms: 60 });
    }
    return legs;
  })())
];

export const simulateHarnessPath = (path: HarnessPath, config: FloatingAnchorConfig, cssPxPerInch: number): HarnessSample[] => {
  const controller = createFloatingAnchorController(config);
  const samples: HarnessSample[] = [];
  const start = path.at(0) ?? { x: 0, y: 0 };
  controller.down({ x: start.x * cssPxPerInch, y: start.y * cssPxPerInch }, 0);
  for (let timeMs = STEP_MS; timeMs <= path.durationMs + 1e-6; timeMs += STEP_MS) {
    const point = path.at(timeMs);
    if (point === null) {
      break;
    }
    const finger = { x: point.x * cssPxPerInch, y: point.y * cssPxPerInch };
    const anchor = controller.move(finger, timeMs) as FloatingAnchorPoint;
    samples.push({ anchor: { ...anchor }, finger, timeMs });
  }
  return samples;
};

export interface HarnessSummary {
  catchUpMs: number | null;
  finalLagInches: number;
  maxLagInches: number;
  maxAnchorSpeedInchesPerSec: number;
  name: string;
}

export const summarizeHarnessSamples = (name: string, samples: readonly HarnessSample[], cssPxPerInch: number): HarnessSummary => {
  let maxLag = 0;
  let maxSpeed = 0;
  let previous: HarnessSample | null = null;
  for (const sample of samples) {
    maxLag = Math.max(maxLag, Math.hypot(sample.finger.x - sample.anchor.x, sample.finger.y - sample.anchor.y));
    if (previous !== null) {
      const dt = (sample.timeMs - previous.timeMs) / 1000;
      maxSpeed = Math.max(maxSpeed, Math.hypot(sample.anchor.x - previous.anchor.x, sample.anchor.y - previous.anchor.y) / dt);
    }
    previous = sample;
  }
  const last = samples[samples.length - 1];
  const finalLag = last === undefined ? 0 : Math.hypot(last.finger.x - last.anchor.x, last.finger.y - last.anchor.y);
  // Catch-up: ms from the last finger movement to the anchor being within 5% of the leash of its final rest.
  let catchUpMs: number | null = null;
  if (last !== undefined) {
    let lastMoveIndex = 0;
    for (let i = samples.length - 1; i > 0; i -= 1) {
      const s = samples[i]!;
      const p = samples[i - 1]!;
      if (Math.hypot(s.finger.x - p.finger.x, s.finger.y - p.finger.y) > 0.01) {
        lastMoveIndex = i;
        break;
      }
    }
    for (let i = lastMoveIndex; i < samples.length; i += 1) {
      const s = samples[i]!;
      if (Math.hypot(s.anchor.x - last.anchor.x, s.anchor.y - last.anchor.y) <= 0.05 * cssPxPerInch * 0.2) {
        catchUpMs = s.timeMs - samples[lastMoveIndex]!.timeMs;
        break;
      }
    }
  }
  return {
    catchUpMs,
    finalLagInches: finalLag / cssPxPerInch,
    maxAnchorSpeedInchesPerSec: maxSpeed / cssPxPerInch,
    maxLagInches: maxLag / cssPxPerInch,
    name
  };
};

/**
 * Reversal cost for the quick-reversal path: finger travel (inches) from the turning point until the finger sits
 * `deadzoneInches` past the anchor on the new side (x < anchor.x - deadzone). Null if it never flips.
 */
export const measureReversalCostInches = (
  samples: readonly HarnessSample[],
  cssPxPerInch: number,
  deadzoneInches: number
): number | null => {
  let turnIndex = 0;
  let maxX = Number.NEGATIVE_INFINITY;
  samples.forEach((sample, index) => {
    if (sample.finger.x > maxX) {
      maxX = sample.finger.x;
      turnIndex = index;
    }
  });
  const turn = samples[turnIndex];
  if (turn === undefined) {
    return null;
  }
  for (let i = turnIndex; i < samples.length; i += 1) {
    const sample = samples[i]!;
    if (sample.finger.x < sample.anchor.x - (deadzoneInches * cssPxPerInch)) {
      return (turn.finger.x - sample.finger.x) / cssPxPerInch;
    }
  }
  return null;
};

const parseArgs = (argv: readonly string[]): { dpr: number; easeMs?: number; fine: boolean; leashInches?: number } => {
  const read = (flag: string): number | undefined => {
    const index = argv.indexOf(flag);
    const value = index >= 0 ? Number(argv[index + 1]) : Number.NaN;
    return Number.isFinite(value) ? value : undefined;
  };
  return { dpr: read('--dpr') ?? 3, easeMs: read('--ease-ms'), fine: argv.includes('--fine'), leashInches: read('--leash-inches') };
};

const main = (): void => {
  const args = parseArgs(process.argv.slice(2));
  const display = { coarsePointer: !args.fine, devicePixelRatio: args.dpr };
  const cssPxPerInch = resolveCssPxPerInch(display);
  const config = resolveFloatingAnchorConfig({ ...display, easeMs: args.easeMs, leashInches: args.leashInches });
  console.log(`floating anchor harness: leash ${(config.leashPx / cssPxPerInch).toFixed(2)} in = ${config.leashPx.toFixed(0)} css px `
    + `(${cssPxPerInch} css px/in, dpr ${args.dpr}), ease ${config.easeMs} ms`);
  for (const path of HARNESS_PATHS) {
    const samples = simulateHarnessPath(path, config, cssPxPerInch);
    const summary = summarizeHarnessSamples(path.name, samples, cssPxPerInch);
    console.log(`\n== ${path.name}: ${path.note}`);
    console.log(`   max lag ${summary.maxLagInches.toFixed(2)} in, final lag ${summary.finalLagInches.toFixed(2)} in, `
      + `max anchor speed ${summary.maxAnchorSpeedInchesPerSec.toFixed(1)} in/s, settle ${summary.catchUpMs === null ? 'n/a' : `${summary.catchUpMs.toFixed(0)} ms`}`);
    if (path.name === 'quick-reversal') {
      const cost = measureReversalCostInches(samples, cssPxPerInch, 0.1);
      console.log(`   reversal cost (finger travel back to flip direction): ${cost === null ? 'never flips' : `${cost.toFixed(2)} in`}`
        + ' (fixed anchor would need the full 2 in plus the deadzone)');
    }
    console.log('   t(ms)  finger(in)        anchor(in)        lag(in)');
    const every = Math.max(1, Math.round(100 / STEP_MS));
    samples.forEach((sample, index) => {
      if (index % every !== 0 && index !== samples.length - 1) {
        return;
      }
      const f = `${(sample.finger.x / cssPxPerInch).toFixed(2)},${(sample.finger.y / cssPxPerInch).toFixed(2)}`.padEnd(16);
      const a = `${(sample.anchor.x / cssPxPerInch).toFixed(2)},${(sample.anchor.y / cssPxPerInch).toFixed(2)}`.padEnd(16);
      const lag = Math.hypot(sample.finger.x - sample.anchor.x, sample.finger.y - sample.anchor.y) / cssPxPerInch;
      console.log(`   ${sample.timeMs.toFixed(0).padStart(5)}  ${f}  ${a}  ${lag.toFixed(2)}`);
    });
  }
};

if (typeof process !== 'undefined' && /vite-node/.test(process.argv[1] ?? '')) {
  main();
}
