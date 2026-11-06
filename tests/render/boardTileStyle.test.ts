import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  BOARD_CHIP_DERIVATION,
  BOARD_CHIP_FILL,
  BOARD_TILE_STYLE_IDS,
  DEFAULT_BOARD_TILE_STYLE,
  boardMaterial,
  resolveBoardTileStyle,
  resolveBoardTileStyleId
} from '../../src/render/boardTileStyle';
import { NAVIGATION_CORE_TRAIL_ENERGY_STOPS } from '../../src/render/navigationCoreTrail';
import { cyberArcadeMaterial } from '../../src/render/cyberArcadeMaterial';
import { designTokens, phaserMaterialAliases } from '../../src/theme/tokens';
import { contrast } from './support/boardTileFixtures';

const stripComments = (source: string): string => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('path.chip is derived, not a free hex', () => {
  const hex = (token: keyof typeof designTokens.color): number => parseInt(designTokens.color[token].slice(1), 16);
  const channel = (value: number, shift: number): number => (value >> shift) & 255;

  test('equals mix(line.normal, bg.canvas, 0.35) recomputed independently from the token registry', () => {
    expect(BOARD_CHIP_DERIVATION).toMatchObject({ from: 'line.normal', toward: 'bg.canvas', amount: 0.35 });
    const from = hex('line.normal');
    const toward = hex('bg.canvas');
    const expected = [16, 8, 0].map((shift) => Math.round(channel(from, shift) + (channel(toward, shift) - channel(from, shift)) * 0.35));
    expect([16, 8, 0].map((shift) => channel(BOARD_CHIP_FILL, shift))).toEqual(expected);
    expect(boardMaterial.chip).toBe(BOARD_CHIP_FILL);
  });

  test('the derived chip is not equal to any registered token colour', () => {
    expect(Object.values(phaserMaterialAliases)).not.toContain(BOARD_CHIP_FILL);
  });

  test('style and bake sources carry no colour literals (all colours come from the registry)', () => {
    for (const file of ['src/render/boardTileStyle.ts', 'src/render/boardTileBake.ts']) {
      const code = stripComments(readFileSync(file, 'utf8'));
      expect(code, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(code, file).not.toMatch(/0x[0-9a-fA-F]{6}\b/);
    }
  });

  test('every other board colour is a registry token or a mix of registry tokens', () => {
    expect(boardMaterial.rim).toBe(phaserMaterialAliases['line.active']);
    expect(boardMaterial.void).toBe(phaserMaterialAliases['bg.canvas']);
    expect(boardMaterial.socket).toBe(phaserMaterialAliases['line.normal']);
    expect(boardMaterial.channel).toBe(phaserMaterialAliases['bg.shell']);
    expect(boardMaterial.channelBorder).toBe(phaserMaterialAliases['line.subtle']);
    expect(boardMaterial.glow).toBe(phaserMaterialAliases['semantic.info']);
    expect(boardMaterial.start).toBe(cyberArcadeMaterial.signal.start);
    expect(boardMaterial.goal).toBe(cyberArcadeMaterial.signal.goal);
    expect(boardMaterial.player).toBe(cyberArcadeMaterial.signal.player);
    expect(boardMaterial.playerEdge).toBe(phaserMaterialAliases['brand.mint']);
  });
});

describe('style ids', () => {
  test('chip is the default and unknown values fall back to it', () => {
    expect(DEFAULT_BOARD_TILE_STYLE).toBe('chip');
    expect(BOARD_TILE_STYLE_IDS).toEqual(['chip', 'trace']);
    expect(resolveBoardTileStyleId('trace')).toBe('trace');
    expect(resolveBoardTileStyleId('nope')).toBe('chip');
    expect(resolveBoardTileStyleId(undefined)).toBe('chip');
  });
});

describe('resolveBoardTileStyle device-pixel snapping', () => {
  const sizes = [8, 10, 14, 14.5, 18, 26, 40];

  test.each([1, 2, 3])('every line width is a whole number of device pixels, at least one, at DPR %i', (dpr) => {
    for (const style of ['chip', 'trace'] as const) {
      for (const size of sizes) {
        const s = resolveBoardTileStyle(style, size, dpr);
        const widths: number[] = [
          s.rimWidth, s.dock.gap, s.dock.lintel,
          s.trace.channelWidth, s.trace.channelBorderWidth, s.trace.coreWidth,
          s.trace.junctionRingWidth, s.trace.deadEndRingWidth, s.trace.dockStubWidth,
          ...s.trace.glowSteps.map((g) => g.width),
          s.marker.startWidth, s.marker.goalRingWidth, s.marker.playerEdge,
          s.marker.playerKeyline, s.marker.hairline
        ];
        for (const w of widths) {
          expect(w * dpr, `${style} T=${size} dpr=${dpr}`).toBeGreaterThanOrEqual(1 - 1e-9);
          expect(Math.abs(w * dpr - Math.round(w * dpr))).toBeLessThan(1e-9);
        }
      }
    }
  });

  test('chip rim is about 1.4 css px at 14 px tiles and corner radius is about 0.3 tile', () => {
    const s = resolveBoardTileStyle('chip', 14, 2);
    expect(s.rimWidth).toBeCloseTo(1.5, 5);
    expect(s.cornerRadius).toBeCloseTo(4, 0);
    expect(s.capRadius).toBeCloseTo(7, 5);
    expect(s.rimGlowBlurDevicePx).toBe(5);
  });

  test('clamps nonsense DPR into [1, 4] and nonsense tile sizes to a positive size', () => {
    expect(resolveBoardTileStyle('chip', 14, 0).dpr).toBe(1);
    expect(resolveBoardTileStyle('chip', 14, 9).dpr).toBe(4);
    expect(resolveBoardTileStyle('chip', Number.NaN, 2).tileSize).toBe(1);
  });
});

describe('marker contrast against the chip fill (WCAG, threshold 3:1)', () => {
  const chip = BOARD_CHIP_FILL;
  const table: Array<[string, number, number]> = [
    ['player core', boardMaterial.player, chip],
    ['start gold', boardMaterial.start, chip],
    ['trail reference (rail.cyan)', boardMaterial.trailReference, chip],
    ['goal badge (bg.canvas disc)', boardMaterial.void, chip],
    ['goal star on its badge', boardMaterial.goal, boardMaterial.void],
    ['goal lit ring', boardMaterial.rim, chip],
    ['player mint edge', boardMaterial.playerEdge, chip]
  ];

  test.each(table)('%s is at least 3:1', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  test('chip stays visibly above the board background', () => {
    expect(contrast(chip, boardMaterial.void)).toBeGreaterThanOrEqual(3);
  });

  test('KNOWN GAP (documented): raw goal red is below 3:1 on the chip, hence the dark badge', () => {
    expect(contrast(boardMaterial.goal, chip)).toBeLessThan(3);
  });

  test('KNOWN GAP (documented): some Navigation Core energy stops fall below 3:1 on the chip, so the trail needs an underlay or lift in the wiring packet', () => {
    const ratios = NAVIGATION_CORE_TRAIL_ENERGY_STOPS.map((stop) => contrast(stop, chip));
    expect(Math.min(...ratios)).toBeLessThan(3);
    expect(Math.max(...ratios)).toBeGreaterThan(3);
  });
});
