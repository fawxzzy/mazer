import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { WORLD_TURN_PHASES } from '../../src/mazer-core/world/types';

// Normalise CRLF so checkouts with core.autocrlf behave like CI.
const readRepoFile = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const LIVE_PHASES = ['player-movement'] as const;

const parsePhaseStatusTable = (contract: string): Array<{ phase: string; status: string }> => {
  const section = contract.split('\n## Phase Status\n')[1]?.split('\n## ')[0] ?? '';
  return section
    .split('\n')
    .map((line) => /^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|\s*([A-Z]+)\s*\|/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ phase: match[1], status: match[2] }));
};

describe('world-turn architecture contract', () => {
  test('locks the central host, deterministic phase order, and clock boundary', () => {
    const contract = readRepoFile('docs/architecture/MAZER-WORLD-TURN-CONTRACT.md');

    expect(contract).toContain('`WorldTurnHost` is the scene-consumable gameplay-mutation boundary');
    expect(contract).toContain('Timed mode is disabled by default.');
    expect(contract).toContain('Paused and stopped host states reject both command kinds');
    expect(contract).toContain('Handlers are registered once at host construction');
    expect(contract).toContain('Backdrop stars, HUD pulses, compass presentation, menu animation');
    expect(contract).toContain('maps non-play mode to stopped, overlays and lifecycle locks to paused');
  });

  test('phase status table lists exactly WORLD_TURN_PHASES in order, with only player-movement live', () => {
    const rows = parsePhaseStatusTable(readRepoFile('docs/architecture/MAZER-WORLD-TURN-CONTRACT.md'));

    expect(rows.map((row) => row.phase)).toEqual([...WORLD_TURN_PHASES]);
    for (const row of rows) {
      expect(row.status).toBe((LIVE_PHASES as readonly string[]).includes(row.phase) ? 'LIVE' : 'DEFERRED');
    }
    expect(rows.filter((row) => row.status === 'LIVE').map((row) => row.phase)).toEqual([...LIVE_PHASES]);
    expect(rows.filter((row) => row.status === 'DEFERRED')).toHaveLength(WORLD_TURN_PHASES.length - 1);
  });

  test('deferred phases stay gated on the unsigned hazards contract', () => {
    const contract = readRepoFile('docs/architecture/MAZER-WORLD-TURN-CONTRACT.md');
    const section = contract.split('\n## Phase Status\n')[1]?.split('\n## ')[0] ?? '';

    expect(section).toContain('MAZER-HAZ-002');
    expect(section).toContain('stay held until');
  });

  test('MenuScene registers only the player-movement phase handler', () => {
    const source = readRepoFile('src/scenes/MenuScene.ts');

    // Exactly one host construction, so the registration below is the whole story.
    expect(source.match(/new WorldTurnHost\(/g) ?? []).toHaveLength(1);

    const construction = /new WorldTurnHost\(\{([\s\S]*?)\}\s*,\s*\{/.exec(source);
    expect(construction).not.toBeNull();
    const registered = [...(construction?.[1] ?? '').matchAll(/['"]([a-z-]+)['"]\s*:/g)].map((match) => match[1]);

    expect(registered).toEqual([...LIVE_PHASES]);
    for (const phase of WORLD_TURN_PHASES) {
      if (!(LIVE_PHASES as readonly string[]).includes(phase)) {
        expect(construction?.[1]).not.toContain(phase);
      }
    }
  });
});
