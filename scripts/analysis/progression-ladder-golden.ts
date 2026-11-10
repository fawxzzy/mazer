// Regenerates tests/fixtures/progression-ladder-golden.v1.json: a fingerprint of
// the generated maze of every level 1..300 on the frozen phone and desktop boards
// at one fixed seed. tests/reset/legacy-progression-ladder.test.ts compares fresh
// generation against it, so a change to the generators, the tape, the tuner or the
// calibration cannot silently reshuffle the ladder. (Regenerated for the felt-difficulty ladder:
// every level 2+ changed because the tuner, the schedule, the style bands and the
// ceiling all changed; level 1, the corridor, is unchanged. Regenerated again for the fringe past
// level 198: exactly levels 199-300 changed on both boards, levels 1-198 did not.)
//
//   npx vite-node scripts/analysis/progression-ladder-golden.ts --write
//   (omit --write to print a diff summary instead)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LADDER_BOARDS, generateLadderMaze, hashLadderMaze } from './lib/progressionLadderSampling';

export const GOLDEN_SEED = 20261106;
const fixturePath = fileURLToPath(new URL('../../tests/fixtures/progression-ladder-golden.v1.json', import.meta.url));

const golden: Record<string, Record<string, string>> = {};
for (const board of LADDER_BOARDS) {
  const hashes: Record<string, string> = {};
  for (let level = 1; level <= 300; level += 1) {
    hashes[String(level)] = hashLadderMaze(generateLadderMaze(level, board, GOLDEN_SEED + level));
  }
  golden[board.name] = hashes;
}
const document = { version: 1, seed: GOLDEN_SEED, scale: 35, levels: 300, hashes: golden };
if (process.argv.includes('--write')) {
  writeFileSync(fixturePath, `${JSON.stringify(document, null, 1)}\n`);
  console.log(`wrote ${fixturePath}`);
} else {
  const existing = JSON.parse(readFileSync(fixturePath, 'utf8')) as typeof document;
  let changed = 0;
  for (const name of Object.keys(golden)) {
    for (const level of Object.keys(golden[name]!)) {
      if (existing.hashes[name]?.[level] !== golden[name]![level]) { changed += 1; }
    }
  }
  console.log(changed === 0 ? 'golden fixture is current' : `${changed} level hashes differ from the fixture`);
  if (changed > 0) { process.exitCode = 1; }
}
