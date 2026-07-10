import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const readRepoFile = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

const extractCurrentMarker = (markerDoc: string): number => {
  const match = markerDoc.match(/Current marker:\s*`(\d+)%`/);
  expect(match, 'marker doc must publish a current marker').not.toBeNull();
  return Number(match?.[1]);
};

const extractRetiredMarker = (markerDoc: string): number => {
  const match = markerDoc.match(/Retired marker:\s*`(\d+)%`/);
  expect(match, 'retired marker doc must publish a retired marker').not.toBeNull();
  return Number(match?.[1]);
};

const extractCurrentTotal = (markerDoc: string): number => {
  const match = markerDoc.match(/-\s*`(\d+)\s*\/\s*100`/);
  expect(match, 'marker doc must publish a current total').not.toBeNull();
  return Number(match?.[1]);
};

const extractWeightedTablePoints = (markerDoc: string): number[] => markerDoc
  .split('\n')
  .filter((line) => line.startsWith('| ') && !line.startsWith('| Segment') && !line.startsWith('| ---'))
  .map((line) => line.split('|').map((cell) => cell.trim()))
  .filter((cells) => cells.length >= 4)
  .map((cells) => {
    const pointsMatch = cells[3]?.match(/^`(\d+)`$/);
    expect(pointsMatch, `marker row must have numeric current points: ${cells[1]}`).not.toBeNull();
    return Number(pointsMatch?.[1]);
  });

describe('Mazer completion markers', () => {
  test('keeps the active mechanics/mobile marker arithmetic and current truth synchronized', () => {
    const markerDoc = readRepoFile('docs/research/MAZER_MECHANICS_MOBILE_COMPLETION_MARKER.md');
    const currentTruth = readRepoFile('docs/current-truth.md');
    const agentRules = readRepoFile('AGENTS.md');

    const currentMarker = extractCurrentMarker(markerDoc);
    const currentTotal = extractCurrentTotal(markerDoc);
    const weightedPoints = extractWeightedTablePoints(markerDoc);

    expect(weightedPoints.reduce((sum, points) => sum + points, 0)).toBe(currentTotal);
    expect(currentTotal).toBe(currentMarker);
    expect(currentTruth).toContain(`- \`${currentMarker}%\``);
    expect(markerDoc).toContain('This is the active completion marker for the current Mazer direction.');
    expect(markerDoc).toContain('Do not ratchet the retired legacy visual 1:1 marker from this lane.');
    expect(currentTruth).toContain('legacy visual 1:1 marker is retired');
    expect(currentTruth).toContain('bounded extreme scale-`149` smoke');
    expect(markerDoc).toContain('`99% -> 100%`');
    expect(markerDoc).toContain('scale-`149`');
    expect(agentRules).toContain('use `docs/research/MAZER_MECHANICS_MOBILE_COMPLETION_MARKER.md` as the active percent marker');
  });

  test('keeps the active proof spine explicit and aligned with repo verify scripts', () => {
    const currentTruth = readRepoFile('docs/current-truth.md');
    const systemMap = readRepoFile('docs/system-map.md');
    const packageJson = readRepoFile('package.json');
    const verifyScript = readRepoFile('scripts/verify/run-verify.mjs');

    expect(packageJson).toContain('"verify": "node ./scripts/verify/run-verify.mjs"');
    expect(packageJson).toContain('"test:verify": "vitest run tests/reset tests/ai/demo-walker.test.ts tests/scenes/menu-render-frame.test.ts tests/analysis/maze-cycle-telemetry-report.test.mjs --maxWorkers 1"');
    expect(verifyScript).toContain("runNpm(['run', 'test:verify'])");
    expect(verifyScript).toContain("runNpm(['run', 'build'])");
    expect(currentTruth).toContain('Current `verify` means:');
    expect(currentTruth).toContain('- `npm run test:verify`');
    expect(currentTruth).toContain('- `npm run build`');
    expect(currentTruth).toContain('Current `test:verify` means:');
    expect(currentTruth).toContain('- `tests/reset`');
    expect(currentTruth).toContain('- `tests/ai/demo-walker.test.ts`');
    expect(currentTruth).toContain('- `tests/scenes/menu-render-frame.test.ts`');
    expect(currentTruth).toContain('- `tests/analysis/maze-cycle-telemetry-report.test.mjs`');
    expect(currentTruth).toContain('- `--maxWorkers 1`');
    expect(currentTruth).toContain('npm run lint');
    expect(systemMap).toContain('docs/research/MAZER_MECHANICS_MOBILE_COMPLETION_MARKER.md');
    expect(systemMap).toContain('docs/current-truth.md');
    expect(systemMap).toContain('- `npm run test:verify`');
    expect(systemMap).toContain('- `npm run build`');
    expect(systemMap).toContain('- `tests/reset`');
    expect(systemMap).toContain('- `tests/ai/demo-walker.test.ts`');
    expect(systemMap).toContain('- `tests/scenes/menu-render-frame.test.ts`');
    expect(systemMap).toContain('- `tests/analysis/maze-cycle-telemetry-report.test.mjs`');
    expect(systemMap).toContain('- `--maxWorkers 1`');
    expect(systemMap).toContain('scale-`149` smoke');
  });

  test('keeps the level/rank/complexity progression contract tracked', () => {
    const markerDoc = readRepoFile('docs/research/MAZER_AUTH_AI_VISUAL_COMPLETION_MARKER.md');
    const contractDoc = readRepoFile('docs/research/MAZER_LEVEL_RANK_COMPLEXITY_CONTRACT.md');

    expect(markerDoc).toContain('| Player-facing auth gate | 94% |');
    expect(markerDoc).toContain('fitness-app persistent-login pattern');
    expect(markerDoc).toContain('remembered identity is now a JSON state');
    expect(markerDoc).toContain('sign-out is local-only');
    expect(markerDoc).toContain('| Auth QA and production readiness | 89% |');
    expect(markerDoc).toContain('token-free remembered identity storage');
    expect(markerDoc).toContain('Runtime diagnostics now expose a safe auth proof block');
    expect(markerDoc).toContain('Runtime auth diagnostics proof');
    expect(markerDoc).toContain('Runtime auth browser proof');
    expect(markerDoc).toContain('auth.rememberedIdentity.sessionState = "ready"');
    expect(markerDoc).toContain('| Level/rank/complexity contract | 56% |');
    expect(markerDoc).toContain('| Player-facing Options info guide | 52% |');
    expect(markerDoc).toContain('Compass, Start, End, and Player');
    expect(markerDoc).toContain('the played-game pause overlay now renders `PLAYER GUIDE` before `Game Toggles` and `Move Speed`');
    expect(markerDoc).toContain('menu explains AI Level, Score, Time, and run cycles');
    expect(markerDoc).toContain('played-game pause explains Player Level/Rank and Runs');
    expect(markerDoc).toContain('played-game badge no longer falls back to the compact `Lv` label');
    expect(markerDoc).toContain('| DiscordOS Mazer feedback board | 85% |');
    expect(markerDoc).toContain('| Visual proof verification discipline | 90% |');
    expect(markerDoc).toContain('| AI/playbook progression contracts | 70% |');
    expect(markerDoc).toContain('removes the remaining visual-goal inference fallback');
    expect(markerDoc).toContain('cached wrapped-topology goal-distance scoring');
    expect(markerDoc).toContain('fails if the visible memory target leaks an unseen end tile');
    expect(markerDoc).toContain('| Play-mode completion lifecycle | 60% |');
    expect(markerDoc).toContain('the play timer restarts at construction release instead of counting build time');
    expect(markerDoc).toContain('mazer.cycle-learning.consumer.v1');
    expect(markerDoc).toContain('shortestViablePathLength');
    expect(markerDoc).toContain('routeOverrunRatio');
    expect(markerDoc).toContain('Fresh player-maze generation proof');
    expect(markerDoc).toContain('target complexity, completed cycles, level, and score');
    expect(markerDoc).toContain('first-pass numeric run-quality score');
    expect(markerDoc).toContain('route waste can now force `ease`');
    expect(markerDoc).toContain('Run-quality progression proof');
    expect(markerDoc).toContain('unsafe frame timing holds difficulty without punishing the player');
    expect(markerDoc).toContain('play input locks');
    expect(markerDoc).toContain('the handoff burst also renders in play mode');
    expect(markerDoc).toContain('a fresh `play-goal-reset` generation request is queued after the handoff');
    expect(markerDoc).toContain('the player marker stays hidden while building');
    expect(markerDoc).toContain('Play-mode generation now keeps maze data creation full-stage but row-slices the visual Draw stage');
    expect(markerDoc).toContain('Browser scene proof drove the player to the goal, observed `reason: goal`, then verified play mode settled on a new seed.');
    expect(markerDoc).toContain('runtime-diagnostics-only `qa` movement bridge');
    expect(markerDoc).toContain('records per-step QA acceptance/lock reasons');
    expect(markerDoc).toContain('Live play lifecycle proof');
    expect(markerDoc).toContain('window.__MAZER_QA__');
    expect(markerDoc).toContain('postGoalLifecycle.pass = true');
    expect(markerDoc).toContain('settledFreshSeed = true');
    expect(markerDoc).toContain('Stick-control lifecycle proof');
    expect(markerDoc).toContain('AI unseen-goal target proof');
    expect(markerDoc).toContain('short below-repeat-threshold stick drag');
    expect(markerDoc).toContain('executedMoveCount = 152');
    expect(markerDoc).toContain('noAutoTuningWithoutValidator');
    expect(markerDoc).toContain('--atlas-consumer-root');
    expect(markerDoc).toContain('screenContract.pass');
    expect(contractDoc).toContain('`targetComplexity` remains the only numeric source of truth for level and rank.');
    expect(contractDoc).toContain('Player and AI progression are separate.');
    expect(contractDoc).toContain('AI-runner performance acts as the tuning test dummy');
    expect(contractDoc).toContain('edgeWrapScore');
    expect(contractDoc).toContain('edgeWrapReliefScore');
    expect(contractDoc).toContain('splitScore');
    expect(contractDoc).toContain('deadEndPressureScore');
    expect(contractDoc).toContain('weightedSplitPressureScore');
    expect(contractDoc).toContain('weightedDeadEndPressureScore');
    expect(contractDoc).toContain('routeEfficiencyPressureScore');
    expect(contractDoc).toContain('renderSafetyPenaltyScore');
    expect(contractDoc).toContain('fillQualityScore');
    expect(contractDoc).toContain('recentSignals');
    expect(contractDoc).toContain('first smoothing window records the last six signals');
    expect(contractDoc).toContain('numeric run-quality score');
    expect(contractDoc).toContain('Route waste can force an `ease` signal');
    expect(contractDoc).toContain('Unsafe frame timing forces `hold`');
    expect(contractDoc).toContain('AI completed cycles can increase while visible level/rank do not move yet');
    expect(contractDoc).toContain('Play-mode maze seeds are fresh per player run.');
    expect(contractDoc).toContain('An explicit `mazeSeed`/`seed` URL can pin the initial proof route');
    expect(contractDoc).toContain('Every new player maze should receive a fresh procedural seed');
    expect(contractDoc).toContain('AI Skill level/rank, run count, current time, and score');
    expect(contractDoc).toContain('Target-complexity pressure and challenge/hold/ease signals remain available in runtime diagnostics');
    expect(contractDoc).toContain('with no debug shorthand bleeding into the public skill box');
    expect(contractDoc).toContain("actorTrack: 'player' | 'ai-runner'");
    expect(contractDoc).toContain('Diagonal tiles, rooms, enemies, traps, and obstacles require one shared graph contract');
    expect(contractDoc).toContain('pressureScore');
    expect(contractDoc).toContain('optionalRetargetCount');
    expect(contractDoc).toContain('validateMazeCycleTelemetryAtlasReport(report)');
    expect(contractDoc).toContain('createMazeCycleTelemetryAtlasConsumerReceipt(report)');
    expect(contractDoc).toContain('canConsumeForTuning');
    expect(contractDoc).toContain('blocked-validation');
    expect(contractDoc).toContain('noAutoTuningWithoutValidator = true');
  });

  test('keeps the shifting player and trail material lane tracked', () => {
    const markerDoc = readRepoFile('docs/research/MAZER_AUTH_AI_VISUAL_COMPLETION_MARKER.md');

    expect(markerDoc).toContain('| Icon-quality 2026 visual target | 5% |');
    expect(markerDoc).toContain('matching the supplied app icon');
    expect(markerDoc).toContain('data/atlas/brand/mazer/mazer-app-icon-2026-07-09-source.png');
    expect(markerDoc).toContain('| Shifting color player/trail/pulse material | 50% |');
    expect(markerDoc).toContain('| Diagonal paths and true diagonal travel | 8% |');
    expect(markerDoc).toContain('| Unified player-facing message system | 78% |');
    expect(markerDoc).toContain('not a true diagonal topology');
    expect(markerDoc).toContain('diagonal neighbor legality');
    expect(markerDoc).toContain('Runtime material helper is implemented');
    expect(markerDoc).toContain('player core is locked to the green readability anchor');
    expect(markerDoc).toContain('trail tiles vary by trail position/time');
    expect(markerDoc).toContain('pulse tiles use a stronger iridescent crest');
    expect(markerDoc).toContain('Runtime/visual diagnostics now expose compact shifted material samples');
    expect(markerDoc).toContain('The played-game player and main-menu AI runner now share the green anchor as a louder beacon treatment');
    expect(markerDoc).toContain('main-menu AI runner now share the green anchor as a louder beacon treatment');
    expect(markerDoc).toContain('explicit advanced field commits now enter the same compact cyber message-card queue');
    expect(markerDoc).toContain('Bulk overlay field commits stay silent');
  });

  test('keeps the legacy visual one-to-one marker retired unless screenshot parity is reopened', () => {
    const retiredMarkerDoc = readRepoFile('docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md');
    const currentTruth = readRepoFile('docs/current-truth.md');
    const agentRules = readRepoFile('AGENTS.md');

    const retiredMarker = extractRetiredMarker(retiredMarkerDoc);

    expect(retiredMarker).toBe(93);
    expect(retiredMarkerDoc).toContain('Status: retired / archival');
    expect(retiredMarkerDoc).toContain('Do not ratchet it during mechanics-first or mobile-clean work.');
    expect(currentTruth).toContain(`retired at \`${retiredMarker}%\``);
    expect(agentRules).toContain('explicitly reopened legacy screenshot 1:1 passes only');
  });
});
