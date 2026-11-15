import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAZER_OAUTH_PENDING_TTL_MS } from '../../src/legacy-runtime/legacyAccountPortal';

/*
 * MAZER-QA-009: pins for the headless phone sweep (scripts/visual/phone-emulation-sweep.mjs) and the ordered
 * real-device checklist (docs/ops/MAZER-PHONE-CHECKLIST.md). Pure helpers only: no browser is launched.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

interface Sweep {
  ANDROID_UA: string;
  CANONICAL_ORIGIN: string;
  IPHONE_UA: string;
  OAUTH_PENDING_KEY: string;
  PENDING_TTL_MS: number;
  PROFILES: ReadonlyArray<{ dpr: number; height: number; id: string; width: number }>;
  buildPendingRecord: (state: string, ageMs: number, now?: number) => Record<string, unknown>;
  frameStats: (stamps: number[]) => { fps: number; frames: number; maxMs: number; p50Ms: number; p95Ms: number };
  makeState: (seed?: string) => string;
}

const loadSweep = async (): Promise<Sweep> => (
  // @ts-expect-error The script is plain .mjs without TS declarations.
  await import('../../scripts/visual/phone-emulation-sweep.mjs')
);

describe('phone emulation sweep helpers', () => {
  it('keeps the pending-window constant equal to the app constant', async () => {
    const sweep = await loadSweep();
    expect(sweep.PENDING_TTL_MS).toBe(MAZER_OAUTH_PENDING_TTL_MS);
    expect(sweep.CANONICAL_ORIGIN).toBe('https://mazer.fawxzzy.com');
  });

  it('covers the four requested phone profiles', async () => {
    const sweep = await loadSweep();
    const key = sweep.PROFILES.map((p) => `${p.width}x${p.height}@${p.dpr}`);
    expect(key).toEqual(['390x844@3', '360x740@3', '412x915@2.625', '393x851@2.75']);
    expect(sweep.ANDROID_UA).toContain('Android');
    expect(sweep.IPHONE_UA).toContain('iPhone');
  });

  it('builds a v2 pending record aged exactly as asked', async () => {
    const sweep = await loadSweep();
    const state = sweep.makeState('b');
    expect(state).toHaveLength(43);
    const rec = sweep.buildPendingRecord(state, 6 * 60_000, 1_000_000);
    expect(rec.version).toBe(2);
    expect(rec.state).toBe(state);
    expect(rec.createdAtEpochMs).toBe(1_000_000 - 360_000);
    expect(String(rec.codeVerifier).length).toBeGreaterThanOrEqual(43);
    expect(sweep.OAUTH_PENDING_KEY).toBe('mazer.auth.oauth-pending.v1');
  });

  it('computes frame statistics and tolerates an empty sample', async () => {
    const sweep = await loadSweep();
    expect(sweep.frameStats([]).frames).toBe(0);
    const stats = sweep.frameStats([0, 16, 32, 48, 64]);
    expect(stats.frames).toBe(4);
    expect(stats.fps).toBeCloseTo(62.5, 0);
    expect(stats.maxMs).toBe(16);
  });
});

describe('MAZER-PHONE-CHECKLIST.md', () => {
  const text = readFileSync(resolve(repoRoot, 'docs/ops/MAZER-PHONE-CHECKLIST.md'), 'utf8');
  const steps = text.split(/\r?\n/).filter((line) => /^\d+\. Step: /.test(line));

  it('numbers its steps 1..N without gaps', () => {
    expect(steps.length).toBeGreaterThanOrEqual(20);
    steps.forEach((line, index) => expect(line.startsWith(`${index + 1}. `)).toBe(true));
  });

  it('gives every step one expected result and the card it closes', () => {
    for (const line of steps) {
      expect(line, line).toMatch(/ Expected: /);
      expect(line, line).toMatch(/ Closes: [A-Z]+-\d+/);
    }
  });

  it('names every card the checklist is meant to close', () => {
    for (const card of ['ACCT-003', 'ACCT-013', 'MOTION-008', 'QA-001', 'VIS-018', 'MOTION-004', 'MOTION-005']) {
      expect(text).toContain(card);
    }
  });

  it('says nothing was checked on a real phone in the sweep record', () => {
    const record = readFileSync(resolve(repoRoot, 'docs/ops/MAZER-QA-009-HEADLESS-PHONE-SWEEP-2026-11-14.md'), 'utf8');
    expect(record).toContain('Nothing here was run on a real phone');
  });
});

describe('level checkpoint access (MAZER-QA-011)', () => {
  it('defaults to 60, 100 and 190 and parses an explicit list', async () => {
    const sweep = (await loadSweep()) as unknown as { parseCheckLevels: (raw?: unknown) => number[] };
    expect(sweep.parseCheckLevels(undefined)).toEqual([60, 100, 190]);
    expect(sweep.parseCheckLevels('5, 218')).toEqual([5, 218]);
  });

  it('rejects anything that is not a whole level 1-999', async () => {
    const sweep = (await loadSweep()) as unknown as { parseCheckLevels: (raw?: unknown) => number[] };
    for (const bad of ['0', '1000', '-3', '1.5', 'abc', '60,,100', '']) {
      expect(() => sweep.parseCheckLevels(bad), bad).toThrow(/--levels/);
    }
  });

  it('is documented in docs/ops', () => {
    const doc = readFileSync(resolve(repoRoot, 'docs/ops/MAZER-QA-LEVEL-ACCESS.md'), 'utf8');
    expect(doc).toContain('--levels 60,100,190');
    expect(doc).toContain('previewLevel');
  });
});
