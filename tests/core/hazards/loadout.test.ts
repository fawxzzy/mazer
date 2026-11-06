import { describe, expect, test } from 'vitest';
import {
  GATE_TIERS,
  HAZARD_FIRST_LEVEL,
  HAZARD_UNLOCK_LEVELS,
  HAZARD_UNLOCK_SPACING,
  PATROL_ROUTE_LENGTHS,
  countLoadoutHazards,
  findLoadoutCeilingLevel,
  resolveHazardLoadout,
  type HazardLoadout
} from '../../../src/mazer-core/hazards/loadout';

const tapeUnits = (loadout: HazardLoadout): number => (
  loadout.blockers + loadout.timedGates + loadout.patrols + loadout.rawGateTier + loadout.rawPatrolTier
);

const tuple = (loadout: HazardLoadout) => [
  loadout.points,
  loadout.blockers,
  loadout.timedGates,
  loadout.patrols,
  loadout.gateTier,
  loadout.patrolTier,
  loadout.unit,
  loadout.idle
];

describe('hazard loadout schedule (DRAFT)', () => {
  test('unlock constants: blockers at 6, gates at 11, patrols at 16, spaced by 5', () => {
    expect(HAZARD_UNLOCK_LEVELS).toEqual({ blocker: 6, timedGate: 11, patrol: 16 });
    expect(HAZARD_FIRST_LEVEL).toBe(6);
    expect(HAZARD_UNLOCK_SPACING).toBe(5);
    expect(HAZARD_UNLOCK_LEVELS.timedGate - HAZARD_UNLOCK_LEVELS.blocker).toBe(HAZARD_UNLOCK_SPACING);
    expect(HAZARD_UNLOCK_LEVELS.patrol - HAZARD_UNLOCK_LEVELS.timedGate).toBe(HAZARD_UNLOCK_SPACING);
  });

  test('levels 1-5 carry no hazard and no points', () => {
    for (let level = 1; level <= 5; level += 1) {
      const loadout = resolveHazardLoadout(level);
      expect(countLoadoutHazards(loadout), `level ${level}`).toBe(0);
      expect(loadout.points).toBe(0);
      expect(loadout.unit).toBeNull();
      expect(loadout.gate).toBeNull();
      expect(loadout.patrolRouteLength).toBeNull();
      expect(loadout.firstEncounter).toEqual({ blocker: false, timedGate: false, patrol: false });
    }
  });

  test('each kind is introduced alone: count 1 on its unlock level, absent before', () => {
    const six = resolveHazardLoadout(6);
    expect([six.blockers, six.timedGates, six.patrols]).toEqual([1, 0, 0]);
    expect(six.firstEncounter).toEqual({ blocker: true, timedGate: false, patrol: false });

    const eleven = resolveHazardLoadout(11);
    const ten = resolveHazardLoadout(10);
    expect(ten.timedGates).toBe(0);
    expect(eleven.timedGates).toBe(1);
    expect(eleven.patrols).toBe(0);
    expect(eleven.firstEncounter).toEqual({ blocker: false, timedGate: true, patrol: false });
    expect(eleven.gate).toEqual(GATE_TIERS[0]);

    const fifteen = resolveHazardLoadout(15);
    const sixteen = resolveHazardLoadout(16);
    expect(fifteen.patrols).toBe(0);
    expect(sixteen.patrols).toBe(1);
    expect(sixteen.firstEncounter).toEqual({ blocker: false, timedGate: false, patrol: true });

    for (let level = 1; level <= 1000; level += 1) {
      const loadout = resolveHazardLoadout(level);
      expect(loadout.firstEncounter.blocker).toBe(level === 6);
      expect(loadout.firstEncounter.timedGate).toBe(level === 11);
      expect(loadout.firstEncounter.patrol).toBe(level === 16);
      if (level < 11) {
        expect(loadout.timedGates).toBe(0);
      }
      if (level < 16) {
        expect(loadout.patrols).toBe(0);
      }
    }
  });

  test('hazard points are strictly monotone over levels 1..1000 and grow by exactly 1 from level 6', () => {
    let previous = resolveHazardLoadout(1);
    for (let level = 2; level <= 1000; level += 1) {
      const loadout = resolveHazardLoadout(level);
      if (level <= 5) {
        expect(loadout.points).toBe(0);
      } else {
        expect(loadout.points, `level ${level}`).toBe(previous.points + 1);
        expect(loadout.points).toBe(level - 5);
        expect(tapeUnits(loadout)).toBe(loadout.points);
      }
      previous = loadout;
    }
  });

  test('the allocation is a nested tape: level N+1 is level N plus exactly one unit', () => {
    let previous = resolveHazardLoadout(5);
    for (let level = 6; level <= 1000; level += 1) {
      const loadout = resolveHazardLoadout(level);
      const delta = [
        loadout.blockers - previous.blockers,
        loadout.timedGates - previous.timedGates,
        loadout.patrols - previous.patrols,
        loadout.rawGateTier - previous.rawGateTier,
        loadout.rawPatrolTier - previous.rawPatrolTier
      ];
      expect(delta.every((value) => value === 0 || value === 1), `level ${level}`).toBe(true);
      expect(delta.reduce((sum, value) => sum + value, 0), `level ${level}`).toBe(1);
      previous = loadout;
    }
  });

  test('total hazards never decrease and keep rising with no capacity (strictly harder forever)', () => {
    let previousTotal = 0;
    let previousSignature = '';
    for (let level = 6; level <= 1000; level += 1) {
      const loadout = resolveHazardLoadout(level);
      const total = countLoadoutHazards(loadout);
      expect(total).toBeGreaterThanOrEqual(previousTotal);
      const signature = JSON.stringify([loadout.blockers, loadout.timedGates, loadout.patrols, loadout.gateTier, loadout.patrolTier]);
      // Without a capacity every level changes the effective requirement.
      expect(signature, `level ${level}`).not.toBe(previousSignature);
      expect(loadout.idle).toBe(false);
      previousTotal = total;
      previousSignature = signature;
    }
  });

  test('golden loadouts for levels 6, 11, 16, 30, 100, 1000', () => {
    expect(tuple(resolveHazardLoadout(6))).toEqual([1, 1, 0, 0, 0, 0, 'blocker', false]);
    expect(tuple(resolveHazardLoadout(11))).toEqual([6, 5, 1, 0, 0, 0, 'timedGate', false]);
    expect(tuple(resolveHazardLoadout(16))).toEqual([11, 5, 3, 1, 2, 0, 'patrol', false]);
    expect(tuple(resolveHazardLoadout(30))).toEqual([25, 8, 5, 5, 4, 3, 'patrol', false]);
    expect(tuple(resolveHazardLoadout(100))).toEqual([95, 38, 27, 22, 4, 4, 'blocker', false]);
    expect(tuple(resolveHazardLoadout(1000))).toEqual([995, 432, 305, 250, 4, 4, 'patrol', false]);
    expect(resolveHazardLoadout(16).gate).toEqual({ period: 5, openFor: 3 });
    expect(resolveHazardLoadout(16).patrolRouteLength).toBe(3);
    expect(resolveHazardLoadout(30).patrolRouteLength).toBe(6);
    expect(resolveHazardLoadout(1000).gate).toEqual({ period: 6, openFor: 3 });
    expect(resolveHazardLoadout(1000).patrolRouteLength).toBe(7);
  });

  test('is deterministic: equal levels give byte-identical loadouts', () => {
    for (const level of [1, 6, 11, 16, 30, 100, 1000]) {
      expect(JSON.stringify(resolveHazardLoadout(level))).toBe(JSON.stringify(resolveHazardLoadout(level)));
    }
  });

  test('tier tables stay inside the documented limits', () => {
    for (const tier of GATE_TIERS) {
      expect(tier.period).toBeGreaterThanOrEqual(3);
      expect(tier.period).toBeLessThanOrEqual(6);
      expect(tier.openFor / tier.period).toBeGreaterThanOrEqual(0.5);
    }
    // Tiers are ordered easiest to hardest: the open fraction never rises, and ties wait longer.
    for (let i = 1; i < GATE_TIERS.length; i += 1) {
      const before = GATE_TIERS[i - 1]!;
      const after = GATE_TIERS[i]!;
      const harder = after.openFor / after.period < before.openFor / before.period
        || (after.openFor / after.period === before.openFor / before.period
          && after.period - after.openFor > before.period - before.openFor);
      expect(harder, `gate tier ${i}`).toBe(true);
    }
    expect(PATROL_ROUTE_LENGTHS).toEqual([3, 4, 5, 6, 7]);
    // First encounter configuration: wait at most one turn.
    expect(GATE_TIERS[0]!.period - GATE_TIERS[0]!.openFor).toBeLessThanOrEqual(1);
  });

  test('a capacity stops count units, buys remaining tiers, then goes idle (feasibility ceiling)', () => {
    const capacity = 22;
    const ceiling = findLoadoutCeilingLevel(capacity);
    expect(ceiling).toBe(36);
    for (let level = 6; level <= 120; level += 1) {
      const loadout = resolveHazardLoadout(level, { capacity });
      expect(loadout.idle, `level ${level}`).toBe(level >= ceiling!);
      expect(countLoadoutHazards(loadout)).toBeLessThanOrEqual(capacity);
    }
    const atCeiling = resolveHazardLoadout(ceiling!, { capacity });
    expect(atCeiling.unit).toBe('none');
    const before = resolveHazardLoadout(ceiling! - 1, { capacity });
    expect([atCeiling.blockers, atCeiling.timedGates, atCeiling.patrols, atCeiling.gateTier, atCeiling.patrolTier])
      .toEqual([before.blockers, before.timedGates, before.patrols, before.gateTier, before.patrolTier]);
    // With no capacity there is no ceiling.
    expect(findLoadoutCeilingLevel(Number.POSITIVE_INFINITY, 1500)).toBeNull();
  });

  test('rejects levels outside 1..1_000_000 and non-integers', () => {
    expect(() => resolveHazardLoadout(0)).toThrow(RangeError);
    expect(() => resolveHazardLoadout(1.5)).toThrow(RangeError);
    expect(() => resolveHazardLoadout(Number.NaN)).toThrow(RangeError);
    expect(() => resolveHazardLoadout(1_000_001)).toThrow(RangeError);
    expect(() => resolveHazardLoadout(6, { capacity: -1 })).toThrow(RangeError);
  });
});
