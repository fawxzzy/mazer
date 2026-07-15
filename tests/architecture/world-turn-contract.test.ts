import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('world-turn architecture contract', () => {
  test('locks the central host, deterministic phase order, and clock boundary', () => {
    const contract = readFileSync(resolve(process.cwd(), 'docs/architecture/MAZER-WORLD-TURN-CONTRACT.md'), 'utf8');

    expect(contract).toContain('`WorldTurnHost` is the scene-consumable gameplay-mutation boundary');
    expect(contract).toContain('Timed mode is disabled by default.');
    expect(contract).toContain('Paused and stopped host states reject both command kinds');
    expect(contract).toContain('Handlers are registered once at host construction');
    expect(contract).toContain('Backdrop stars, HUD pulses, compass presentation, menu animation');
    expect(contract).toContain('maps non-play mode to stopped, overlays and lifecycle locks to paused');
  });
});
