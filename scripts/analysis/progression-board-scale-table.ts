// MAZER-PROG-020 S0: what a board scale means on a phone, measured with the REAL layout code.
//
// Part 1 (fast, default): for each reference viewport and each scale, the cell grid the game would
// build (planLegacyBoard runs the same aspect -> grid -> layout sequence MenuScene does) and the CSS
// px per tile, on the menu and play surfaces. Flags the 10 px floor (LEGACY_BOARD_MIN_TILE_PX).
// Part 2 (--capacity, minutes): per scale, the felt CEILING and fringe cap the calibration measures
// (the same pass generate-geometry-budget-targets.ts runs, with the scale as a parameter), and the
// ladder level where the felt schedule saturates. The baked ceiling was measured at scale 35.
//
//   npx vite-node scripts/analysis/progression-board-scale-table.ts
//   npx vite-node scripts/analysis/progression-board-scale-table.ts --scales=35,38,40 --capacity
//   npx vite-node scripts/analysis/progression-board-scale-table.ts --json
import { planLegacyBoard, type LegacyBoardPlanViewport } from '../../src/legacy-runtime/legacyBoardPlan';
import { LEGACY_BOARD_MIN_TILE_PX } from '../../src/legacy-runtime/legacyBoardScale';
import { resolveGeometryBudgetSchedule } from '../../src/legacy-runtime/legacyGeometryBudget';

// Reference phones. Safe areas are typical values (no notch on the SE class, notch/island + home
// indicator on the others); a real device can differ by a few px.
export const BOARD_SCALE_REFERENCE_VIEWPORTS: ReadonlyArray<LegacyBoardPlanViewport & { name: string }> = [
  { name: '320x568', width: 320, height: 568, safeArea: { top: 0, bottom: 0 } },
  { name: '360x780', width: 360, height: 780, safeArea: { top: 32, bottom: 0 } },
  { name: '375x667', width: 375, height: 667, safeArea: { top: 0, bottom: 0 } },
  { name: '390x844', width: 390, height: 844, safeArea: { top: 47, bottom: 34 } },
  { name: '430x932', width: 430, height: 932, safeArea: { top: 59, bottom: 34 } }
];

export const BOARD_SCALE_TABLE_DEFAULT_SCALES: readonly number[] = [35, 36, 37, 38, 39, 40, 42, 44, 46, 48, 50, 52];

const parseScales = (): number[] => {
  const arg = process.argv.find((value) => value.startsWith('--scales='));
  if (arg) {
    return arg.slice('--scales='.length).split(',').map(Number).filter((value) => Number.isFinite(value));
  }
  return [...BOARD_SCALE_TABLE_DEFAULT_SCALES];
};

const feltSaturationLevelForCeiling = (ceiling: number): number => {
  let level = 2;
  while (resolveGeometryBudgetSchedule(level + 1) <= ceiling) { level += 1; }
  return level;
};

const main = async (): Promise<void> => {
  const scales = parseScales();
  const asJson = process.argv.includes('--json');
  const rows = BOARD_SCALE_REFERENCE_VIEWPORTS.map((viewport) => ({
    viewport: viewport.name,
    scales: scales.map((scale) => {
      const menu = planLegacyBoard(viewport, scale, 'menu');
      const play = planLegacyBoard(viewport, scale, 'play');
      return { scale, cells: `${menu.width}x${menu.height}`, menuTilePx: Number(menu.tileSize.toFixed(2)), playCells: `${play.width}x${play.height}`, playTilePx: Number(play.tileSize.toFixed(2)) };
    })
  }));
  // Imported only for --capacity (the module's own main() is switched off by the flag).
  process.env.MAZER_CALIBRATION_NO_MAIN = '1';
  const calibration = process.argv.includes('--capacity') ? await import('./generate-geometry-budget-targets') : null;
  const capacity = calibration
    ? scales.map((scale) => {
      const result = calibration.computeGeometryBudgetCalibration(scale);
      const fringe = calibration.computeGeometryBudgetFringeCalibration(result.ceiling, scale);
      return {
        scale,
        ceiling: result.ceiling,
        feltSaturationLevel: feltSaturationLevelForCeiling(result.ceiling),
        fringeCap: fringe.fringeCap,
        capacityMedian: result.capacityMedian,
        perBoardQuantile: result.perBoardQuantile
      };
    })
    : null;

  if (asJson) {
    console.log(JSON.stringify({ minTilePx: LEGACY_BOARD_MIN_TILE_PX, rows, capacity }, null, 1));
    return;
  }
  console.log(`tile px per scale (menu surface; play in brackets). Floor ${LEGACY_BOARD_MIN_TILE_PX} px; '!' = below the floor.`);
  console.log(['viewport'.padEnd(9), ...scales.map((scale) => `s${scale}`.padEnd(24))].join(' '));
  for (const row of rows) {
    console.log([row.viewport.padEnd(9), ...row.scales.map((entry) => `${entry.cells} @${entry.menuTilePx.toFixed(1)}${entry.menuTilePx < LEGACY_BOARD_MIN_TILE_PX ? '!' : ' '}[${entry.playTilePx.toFixed(1)}${entry.playTilePx < LEGACY_BOARD_MIN_TILE_PX ? '!' : ''}]`.padEnd(24))].join(' '));
  }
  if (capacity) {
    console.log('\nfelt ceiling and fringe capacity per scale (baked ceiling measured at scale 35):');
    for (const entry of capacity) {
      console.log(`  s${entry.scale}: ceiling ${entry.ceiling}, felt saturation level ${entry.feltSaturationLevel}, fringe cap ${entry.fringeCap}, base capacity median ${entry.capacityMedian}, per-board p25 ${entry.perBoardQuantile.join('/')}`);
    }
  }
};

if (/vite-node/.test(process.argv[1] ?? '')) {
  void main();
}
