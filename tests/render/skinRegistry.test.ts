import { describe, expect, test } from 'vitest';
import {
  DEFAULT_PLAYER_SKIN,
  DEFAULT_TRAIL_SKIN,
  PLAYER_SKINS,
  TRAIL_SKINS,
  resolvePlayerSkin,
  resolveTrailSkin
} from '../../src/render/skinRegistry';

describe('skin registry (L7 owner picks)', () => {
  test('Spark and Star dust are the defaults, built and selectable', () => {
    expect(DEFAULT_PLAYER_SKIN).toBe('spark');
    expect(DEFAULT_TRAIL_SKIN).toBe('star-dust');
    expect(resolvePlayerSkin()).toMatchObject({ id: 'spark', built: true, selectable: true, ping: 'kite', facesTravel: true });
    expect(resolveTrailSkin()).toMatchObject({ id: 'star-dust', built: true, selectable: true });
  });

  test('only the defaults are selectable; every other design is a non-selectable data stub', () => {
    expect(PLAYER_SKINS.filter((skin) => skin.selectable).map((skin) => skin.id)).toEqual(['spark']);
    expect(TRAIL_SKINS.filter((skin) => skin.selectable).map((skin) => skin.id)).toEqual(['star-dust']);
    // the pre-L7 looks keep their draw code, so they are built (but still not selectable)
    expect(PLAYER_SKINS.filter((skin) => skin.built).map((skin) => skin.id).sort()).toEqual(['chip', 'spark']);
    expect(TRAIL_SKINS.filter((skin) => skin.built).map((skin) => skin.id).sort()).toEqual(['neon-tube', 'star-dust']);
  });

  test('ids are unique and every entry is frozen with a name and description', () => {
    for (const skins of [PLAYER_SKINS, TRAIL_SKINS] as const) {
      const ids = skins.map((skin) => skin.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const skin of skins) {
        expect(Object.isFrozen(skin)).toBe(true);
        expect(skin.name.length).toBeGreaterThan(0);
        expect(skin.description.length).toBeGreaterThan(0);
      }
    }
    expect(Object.isFrozen(PLAYER_SKINS)).toBe(true);
    expect(Object.isFrozen(TRAIL_SKINS)).toBe(true);
  });

  test('resolvers never return a stub: unknown, unselectable or empty ids fall back to the default', () => {
    for (const id of ['chip', 'ghost', 'ufo', 'nope', '', null, undefined]) {
      expect(resolvePlayerSkin(id).id).toBe('spark');
    }
    for (const id of ['neon-tube', 'double-helix', 'nope', '', null, undefined]) {
      expect(resolveTrailSkin(id).id).toBe('star-dust');
    }
    expect(resolvePlayerSkin('spark').id).toBe('spark');
    expect(resolveTrailSkin('star-dust').id).toBe('star-dust');
  });
});
