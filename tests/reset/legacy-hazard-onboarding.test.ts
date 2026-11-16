import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  HAZARD_INTRO_SCHEDULE,
  createEmptyHazardExposureRecord,
  type HazardExposureRecord
} from '../../src/mazer-core/hazards';
import { GEOMETRY_BUDGET_SATURATION_LEVEL } from '../../src/legacy-runtime/legacyGeometryBudget';
import { LEGACY_DEFAULTS } from '../../src/legacy-runtime/legacyDefaults';
import { pickLegacyGameTogglePreferences } from '../../src/legacy-runtime/legacyGameTogglePreferences';
import {
  LEGACY_GUIDE_HAZARD_ROWS,
  LEGACY_GUIDE_ROWS,
  buildLegacyGuideSheetModel
} from '../../src/legacy-runtime/legacyGuideContent';
import {
  HAZARD_EXPOSURE_STORAGE_KEY,
  HAZARD_ONBOARDING_LIVE_KINDS,
  createHazardOnboarding,
  readHazardExposureRecord,
  resolveHazardGuideKinds,
  resolveHazardLevelMoments,
  writeHazardExposureRecord,
  type HazardExposureStorage
} from '../../src/legacy-runtime/legacyHazardOnboarding';
import { HAZARD_AUDIO_EVENTS, resolveHazardAudioSound } from '../../src/legacy-runtime/legacyHazardAudioEvents';
import { LEGACY_SOUND_EFFECT_TONES } from '../../src/legacy-runtime/legacySoundEffects';
import {
  HAZARD_MOMENT_SIZES,
  resolveHazardMomentAlpha,
  resolveHazardMomentFrame
} from '../../src/render/hazardMomentRenderer';

const SATURATION = GEOMETRY_BUDGET_SATURATION_LEVEL;
const ALL_KINDS = ['pulseGate', 'sentry', 'hunter', 'shard'] as const;
const MANIFEST = JSON.parse(readFileSync(join(process.cwd(), 'docs/contracts/mazer-hazard-schedule.v1.json'), 'utf8')) as {
  contact: { consequence: string; hunterBurnoutContacts: number };
  kinds: { hunter: { speedDivisorAtIntro: number }; shard: { locksStar: boolean } };
};

const memoryStorage = (): HazardExposureStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    }
  };
};

const record = (patch: Partial<HazardExposureRecord> = {}): HazardExposureRecord => ({
  ...createEmptyHazardExposureRecord(),
  ...patch
});

describe('hazard Guide rows (slice H6, HAZ-008 copy source)', () => {
  test('one row per hazard kind, in the signed schedule order', () => {
    expect(LEGACY_GUIDE_HAZARD_ROWS.map((row) => row.kind)).toEqual(HAZARD_INTRO_SCHEDULE.map((entry) => entry.unit));
    expect(LEGACY_GUIDE_HAZARD_ROWS.map((row) => row.id)).toEqual(['hazard-gate', 'hazard-sentry', 'hazard-hunter', 'hazard-shard']);
    for (const row of LEGACY_GUIDE_HAZARD_ROWS) {
      expect(row.icon.glyph).toBe(row.id);
      expect(row.icon.status).toBe('guide-local');
      expect(row.heading.length, row.id).toBeLessThanOrEqual(12);
      expect(row.text.length, row.id).toBeLessThanOrEqual(90);
    }
  });

  test('the copy only claims what the signed manifest says', () => {
    const text = (kind: string): string => LEGACY_GUIDE_HAZARD_ROWS.find((row) => row.kind === kind)!.text;
    expect(MANIFEST.contact.consequence).toBe('rewind-to-last-trail-junction');
    expect(text('sentry')).toMatch(/back to your last junction/);
    expect(MANIFEST.contact.hunterBurnoutContacts).toBe(3);
    expect(text('hunter')).toMatch(/three catches/);
    expect(MANIFEST.kinds.hunter.speedDivisorAtIntro).toBeGreaterThan(1);
    expect(text('hunter')).toMatch(/slower than you/);
    expect(MANIFEST.kinds.shard.locksStar).toBe(true);
    expect(text('shard')).toMatch(/star stays locked/);
  });

  test('guide snapshot: rows with no hazard kinds are the unchanged LEGACY_GUIDE_ROWS (same array)', () => {
    expect(buildLegacyGuideSheetModel('menu').rows).toBe(LEGACY_GUIDE_ROWS);
    expect(buildLegacyGuideSheetModel('pause', { hazardKinds: [] }).rows).toBe(LEGACY_GUIDE_ROWS);
  });

  test('guide snapshot: met hazard kinds are appended after the base rows, in schedule order', () => {
    const rows = buildLegacyGuideSheetModel('menu', { hazardKinds: ['sentry', 'pulseGate'] }).rows;
    expect(rows.map((row) => row.id)).toEqual([...LEGACY_GUIDE_ROWS.map((row) => row.id), 'hazard-gate', 'hazard-sentry']);
    expect(rows.slice(-2).map((row) => [row.heading, row.text])).toMatchInlineSnapshot(`
      [
        [
          "Pulse Gate",
          "Gates open and shut on a beat. Wait for the gap, then go through.",
        ],
        [
          "Sentry",
          "Sentries pace a short route. A touch sends you back to your last junction.",
        ],
      ]
    `);
  });
});

describe('level moments: intro cards and tier pips', () => {
  test('flag off: no onboarding object, no moments, no Guide rows, no storage touched', () => {
    const storage = memoryStorage();
    let reads = 0;
    expect(createHazardOnboarding({ enabled: false, resolveStorage: () => { reads += 1; return storage; }, saturationLevel: SATURATION })).toBeNull();
    expect(reads).toBe(0);
    for (const level of [1, 10, 20, 35, 36, 51, 60, 200]) {
      const moments = resolveHazardLevelMoments({ enabled: false, level, record: record(), saturationLevel: SATURATION });
      expect(moments.introCard).toBeNull();
      expect(moments.tierPip).toBeNull();
      expect(moments.allocation).toBeNull();
    }
    expect(resolveHazardGuideKinds(record({ stage: 4, introsShown: [...ALL_KINDS] }), { enabled: false })).toEqual([]);
  });

  test('the card shows once on the intro level of a live kind and carries the Guide copy', () => {
    const onboarding = createHazardOnboarding({ enabled: true, resolveStorage: memoryStorage, saturationLevel: SATURATION });
    expect(onboarding).not.toBeNull();
    const storage = memoryStorage();
    const live = createHazardOnboarding({ enabled: true, resolveStorage: () => storage, saturationLevel: SATURATION })!;
    expect(live.levelStart(9).introCard).toBeNull();
    const first = live.levelStart(10);
    expect(first.introCard).toEqual({
      kind: 'pulseGate',
      glyph: 'hazard-gate',
      heading: LEGACY_GUIDE_HAZARD_ROWS[0]!.heading,
      text: LEGACY_GUIDE_HAZARD_ROWS[0]!.text
    });
    expect(live.record().introsShown).toEqual(['pulseGate']);
    expect(live.levelStart(10).introCard).toBeNull();
    expect(live.guideKinds()).toEqual(['pulseGate']);
  });

  test('kinds that are not drawn yet get no card and no Guide row, but the stage still advances on schedule', () => {
    const storage = memoryStorage();
    const live = createHazardOnboarding({ enabled: true, resolveStorage: () => storage, saturationLevel: SATURATION, liveKinds: ['pulseGate'] })!;
    for (let level = 1; level <= 61; level += 1) {
      live.levelStart(level);
      live.levelCleared(level);
    }
    expect(live.record().stage).toBe(4);
    expect(live.record().introsShown).toEqual(['pulseGate']);
    expect(live.guideKinds()).toEqual(['pulseGate']);
    const all = resolveHazardGuideKinds(live.record(), { enabled: true, liveKinds: [...ALL_KINDS] });
    expect(all).toEqual([...ALL_KINDS]);
  });

  test('a migrated player behind the schedule sees the card of the next kind they actually meet', () => {
    const moments = resolveHazardLevelMoments({
      enabled: true,
      level: 99,
      record: record({ stage: 1, introsShown: ['pulseGate'] }),
      saturationLevel: SATURATION,
      liveKinds: [...ALL_KINDS]
    });
    expect(moments.introCard?.kind).toBe('sentry');
    expect(moments.tierPip).toBeNull();
  });

  test('tier pips: at the 36/51 tail steps, only for a live unit, never twice, never on an intro', () => {
    const met = record({ stage: 4, introsShown: [...ALL_KINDS] });
    const at = (level: number, rec = met, liveKinds: readonly string[] = ['pulseGate']) => resolveHazardLevelMoments({
      enabled: true,
      level,
      record: rec,
      saturationLevel: SATURATION,
      liveKinds: liveKinds as typeof ALL_KINDS[number][]
    }).tierPip;
    expect(at(36)).toMatchObject({ level: 36, tier: 1, unit: 'gateTier', label: 'Gate tier up', glyph: 'hazard-gate' });
    expect(at(51)).toMatchObject({ level: 51, tier: 2, unit: 'gate', label: 'Gate +1' });
    // 66 lands a sentry tier: no pip while sentries are not drawn; with sentries live it is tier 3.
    expect(at(66)).toBeNull();
    expect(at(66, met, [...ALL_KINDS])).toMatchObject({ tier: 3, unit: 'sentryTier', glyph: 'hazard-sentry' });
    expect(at(37)).toBeNull();
    expect(at(50)).toBeNull();
    expect(at(51, record({ ...met, tierPipThrough: 51 }))).toBeNull();
    expect(at(SATURATION + 3)).toBeNull();
    const storage = memoryStorage();
    storage.setItem(HAZARD_EXPOSURE_STORAGE_KEY, JSON.stringify(met));
    const live = createHazardOnboarding({ enabled: true, resolveStorage: () => storage, saturationLevel: SATURATION })!;
    expect(live.levelStart(36).tierPip?.level).toBe(36);
    expect(live.levelStart(36).tierPip).toBeNull();
    expect(live.record().tierPipThrough).toBe(36);
  });

  test('a level-start model resolves well inside one frame (16 ms), even for a long-time player', () => {
    const rec = record({ stage: 4, introsShown: [...ALL_KINDS], tierPipThrough: 36 });
    const startedAt = performance.now();
    for (let index = 0; index < 200; index += 1) {
      resolveHazardLevelMoments({ enabled: true, level: 51, record: rec, saturationLevel: SATURATION });
      resolveHazardLevelMoments({ enabled: true, level: 10, record: record(), saturationLevel: SATURATION });
    }
    const perCall = (performance.now() - startedAt) / 400;
    expect(perCall).toBeLessThan(4);
  });
});

describe('exposure storage', () => {
  test('reads and writes are guarded: missing, throwing or garbage storage gives the empty record', () => {
    const throwing: HazardExposureStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); }
    };
    expect(readHazardExposureRecord(null)).toEqual(createEmptyHazardExposureRecord());
    expect(readHazardExposureRecord(throwing)).toEqual(createEmptyHazardExposureRecord());
    expect(writeHazardExposureRecord(throwing, record({ stage: 1 }))).toBe(false);
    expect(writeHazardExposureRecord(undefined, record({ stage: 1 }))).toBe(false);
    const garbage = memoryStorage();
    garbage.setItem(HAZARD_EXPOSURE_STORAGE_KEY, '{not json');
    expect(readHazardExposureRecord(garbage)).toEqual(createEmptyHazardExposureRecord());
    const live = createHazardOnboarding({ enabled: true, resolveStorage: () => throwing, saturationLevel: SATURATION })!;
    expect(() => live.levelStart(10)).not.toThrow();
    expect(() => live.levelCleared(10)).not.toThrow();
  });

  test('the record is written in canonical form under its own key', () => {
    const storage = memoryStorage();
    expect(writeHazardExposureRecord(storage, record({ stage: 1, introsShown: ['pulseGate'] }))).toBe(true);
    expect(storage.data.get(HAZARD_EXPOSURE_STORAGE_KEY)).toBe('{"v":1,"stage":1,"introsShown":["pulseGate"],"tierPipThrough":0}');
  });

  test('exposure is never part of the synced game-toggle settings', () => {
    const keys = Object.keys(pickLegacyGameTogglePreferences(LEGACY_DEFAULTS));
    expect(keys.some((key) => /hazard|exposure|intro|tier/i.test(key))).toBe(false);
    expect(Object.keys(LEGACY_DEFAULTS).some((key) => /hazard|exposure/i.test(key))).toBe(false);
  });

  test('the live kinds list only names real kinds', () => {
    for (const kind of HAZARD_ONBOARDING_LIVE_KINDS) {
      expect(ALL_KINDS).toContain(kind);
    }
  });
});

describe('hazard audio events', () => {
  test('every event maps to an existing, gentle sound kind', () => {
    expect(Object.keys(HAZARD_AUDIO_EVENTS).sort()).toEqual([
      'hazard.contact',
      'hazard.gate.closing',
      'hazard.hunter.burnout',
      'hazard.intro',
      'hazard.shard.collected',
      'hazard.tier'
    ]);
    for (const event of Object.keys(HAZARD_AUDIO_EVENTS) as Array<keyof typeof HAZARD_AUDIO_EVENTS>) {
      const tones = LEGACY_SOUND_EFFECT_TONES[resolveHazardAudioSound(event)];
      expect(tones.length, event).toBeGreaterThan(0);
      expect(Math.max(...tones.map((tone) => tone.gain)), event).toBeLessThanOrEqual(0.03);
    }
  });
});

describe('moment frame (pure)', () => {
  const base = { viewWidth: 390, viewHeight: 844, safeTop: 0, footerY: 826, cardHeight: 60, pipHeight: 26 };

  test('the card sits in the half away from the player, whole pixels, clear of the gear and the footer', () => {
    const top = resolveHazardMomentFrame({ ...base, playerY: 700 });
    expect(top.side).toBe('top');
    expect(top.cardTop).toBe(HAZARD_MOMENT_SIZES.topInset);
    expect(top.pipTop).toBe(top.cardTop + 60 + HAZARD_MOMENT_SIZES.pipGap);
    const bottom = resolveHazardMomentFrame({ ...base, playerY: 100 });
    expect(bottom.side).toBe('bottom');
    expect(bottom.pipTop + 26).toBe(826 - HAZARD_MOMENT_SIZES.bottomInset);
    expect(bottom.cardTop + 60).toBe(bottom.pipTop - HAZARD_MOMENT_SIZES.pipGap);
    for (const frame of [top, bottom]) {
      expect(frame.cardWidth).toBe(340);
      expect(frame.cardLeft).toBe(25);
      for (const value of Object.values(frame)) {
        if (typeof value === 'number') expect(Number.isInteger(value)).toBe(true);
      }
    }
    expect(resolveHazardMomentFrame({ ...base, viewWidth: 1280, viewHeight: 720, footerY: 702, playerY: 100 }).cardWidth).toBe(340);
    // A narrow phone keeps a 16 px side margin.
    expect(resolveHazardMomentFrame({ ...base, viewWidth: 320, playerY: 100 })).toMatchObject({ cardWidth: 288, cardLeft: 16 });
  });

  test('alpha holds at 1, fades over the last 300 ms, and is instant under reduced motion', () => {
    expect(resolveHazardMomentAlpha(0, 0, 4500, false)).toBe(1);
    expect(resolveHazardMomentAlpha(4350, 0, 4500, false)).toBeCloseTo(0.5);
    expect(resolveHazardMomentAlpha(4350, 0, 4500, true)).toBe(1);
    expect(resolveHazardMomentAlpha(4500, 0, 4500, false)).toBe(0);
  });
});
