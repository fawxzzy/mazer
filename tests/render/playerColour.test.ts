import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { resolveBleedGlowColor } from '../../src/render/bleedGlow';
import {
  drawEdgeBeams,
  drawEdgeMarkers,
  resolveEdgeMarkerStates,
  resolveEdgeRingFills,
  resolveEdgeStations,
  type EdgeGraphics
} from '../../src/render/edgeMarkers';
import {
  getPlayerColourRevision,
  getPlayerColourSetting,
  isPlayerColourRainbow,
  resolvePlayerColour,
  resolveSharedBorderColor,
  resolveTrailPaletteBorderColor,
  samplePlayerColour,
  setPlayerColour
} from '../../src/render/playerColour';
import { createSparkMaterial, resolveSparkMaterial } from '../../src/render/sparkPlayerSkin';
import { sampleIridescentTrail as sampleTrailForDrawing } from '../../src/render/trailIridescence';
import {
  resolveSharedBorderColor as resolveRawRainbowBorderColor,
  sampleIridescentTrail as sampleRawRainbow,
  type IridescentTrailSample
} from '../../src/render/trailPalette';

const FLAT = 0xff2bd6;
const stations = resolveEdgeStations({ width: 390, height: 844 });
const head = { distanceTiles: 6.5, timeMs: 1234, animated: true };

afterEach(() => setPlayerColour(null));

interface Painted { fills: number[]; lines: number[] }

const makePainter = (): EdgeGraphics & Painted => {
  const painted: EdgeGraphics & Painted = {
    fills: [],
    lines: [],
    fillStyle(color: number) { painted.fills.push(color); },
    lineStyle(_width: number, color: number) { painted.lines.push(color); },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fillPath() {},
    strokePath() {},
    fillCircle() {},
    lineBetween() {}
  };
  return painted;
};

describe('player colour: the shifting rainbow today', () => {
  test('defaults to the rainbow and reads exactly the trail palette (the Spark / Star dust colour)', () => {
    expect(isPlayerColourRainbow()).toBe(true);
    expect(getPlayerColourSetting()).toBeNull();
    const rawSample: IridescentTrailSample = { core: 0, glow: 0, wave: 0, sheen: 0 };
    const ownSample: IridescentTrailSample = { core: 0, glow: 0, wave: 0, sheen: 0 };
    for (const [distance, time] of [[0, 0], [3.5, 900], [12, 2500], [40.25, 8000]] as const) {
      sampleRawRainbow(distance, time, false, rawSample);
      samplePlayerColour(distance, time, false, ownSample);
      expect(ownSample).toEqual(rawSample);
    }
    expect(resolvePlayerColour(head, 0, false)).toBe(resolveRawRainbowBorderColor(head, 0, false));
  });

  test('it really is a shifting rainbow: the colour changes with the clock', () => {
    const seen = new Set<number>();
    for (let ms = 0; ms < 8000; ms += 500) {
      seen.add(resolvePlayerColour(null, ms, false));
    }
    expect(seen.size).toBeGreaterThan(8);
  });
});

describe('player colour: one setter recolours every consumer', () => {
  test('the setter takes a flat colour, a revision bump, and null puts the rainbow back; bad input is the rainbow', () => {
    const before = getPlayerColourRevision();
    setPlayerColour(FLAT);
    expect(getPlayerColourSetting()).toBe(FLAT);
    expect(isPlayerColourRainbow()).toBe(false);
    expect(getPlayerColourRevision()).toBe(before + 1);
    setPlayerColour(FLAT);
    expect(getPlayerColourRevision()).toBe(before + 1);
    setPlayerColour(Number.NaN);
    expect(isPlayerColourRainbow()).toBe(true);
    setPlayerColour(0x1ffffff);
    expect(getPlayerColourSetting()).toBe(0xffffff);
  });

  test('player (Spark), trail, border, bleed glow: every colour read follows the setting', () => {
    setPlayerColour(FLAT);
    const material = resolveSparkMaterial(head, 500, false, createSparkMaterial());
    expect(material.core).toBe(FLAT);
    expect(material.rear).toBe(FLAT);
    expect(sampleTrailForDrawing(3, 700, false, { core: 0, glow: 0, wave: 0, sheen: 0 }).core).toBe(FLAT);
    expect(samplePlayerColour(3, 700, false).core).toBe(FLAT);
    expect(resolvePlayerColour(head, 0, false)).toBe(FLAT);
    expect(resolveSharedBorderColor(head, 0, false)).toBe(FLAT);
    expect(resolveSharedBorderColor(null, 0, true)).toBe(FLAT);
    expect(resolveTrailPaletteBorderColor(2, 100, false)).toBe(FLAT);
    expect(resolveBleedGlowColor(head, 0, false)).toBe(FLAT);
  });

  test('lasers, star fills and star borders read it too (no fixed green left)', () => {
    setPlayerColour(FLAT);
    const full = resolveEdgeMarkerStates({ reducedMotion: false, fills: resolveEdgeRingFills({ direction: 'inward', clockMs: -1, ringFill: 1 }), timeMs: 0 });
    const markers = makePainter();
    drawEdgeMarkers(markers, stations, full);
    expect(markers.fills).toEqual(Array.from({ length: 8 }, () => FLAT));
    expect(markers.lines).toEqual(Array.from({ length: 8 }, () => FLAT));

    const beams = makePainter();
    drawEdgeBeams(beams, { direction: 'outward', focus: { x: 200, y: 400 }, laserProgress: 0, spawnPop: 0, stations, clockMs: 150, playerColour: resolvePlayerColour(null, 0, false) });
    const allowed = new Set([FLAT]);
    const colours = [...beams.fills, ...beams.lines];
    expect(colours.length).toBeGreaterThan(20);
    // Every colour is the player colour or its mix toward white (the hot head / stream): none is the old green.
    const green = 0x2bb868;
    expect(colours.includes(green)).toBe(false);
    expect(colours.filter((colour) => allowed.has(colour)).length).toBeGreaterThan(colours.length / 2);
    // A beam drawn with no explicit colour also reads the setting.
    const implicit = makePainter();
    drawEdgeBeams(implicit, { direction: 'outward', focus: { x: 200, y: 400 }, laserProgress: 0, spawnPop: 0, stations, clockMs: 150 });
    expect(implicit.lines.includes(FLAT)).toBe(true);
  });

  test('the colour changes between frames: the beams follow the clock while it is the rainbow', () => {
    const a = makePainter();
    const b = makePainter();
    drawEdgeBeams(a, { direction: 'outward', focus: { x: 200, y: 400 }, laserProgress: 0, spawnPop: 0, stations, clockMs: 150, playerColour: resolvePlayerColour(head, 0, false) });
    drawEdgeBeams(b, { direction: 'outward', focus: { x: 200, y: 400 }, laserProgress: 0, spawnPop: 0, stations, clockMs: 150, playerColour: resolvePlayerColour({ ...head, timeMs: 5000 }, 0, false) });
    expect(a.lines).not.toEqual(b.lines);
  });
});

/** Every src file except the palette itself and the player colour module. */
const listSourceFiles = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? listSourceFiles(path) : (name.endsWith('.ts') ? [path] : []);
});

describe('player colour: no consumer can bypass the shared source', () => {
  const root = resolve(process.cwd(), 'src');
  const files = listSourceFiles(root).filter((file) => !/render[\\/](trailPalette|playerColour)\.ts$/.test(file));

  test('nothing but playerColour.ts imports the colour-sampling functions from trailPalette', () => {
    const banned = ['sampleIridescentTrail', 'resolveSharedBorderColor', 'resolveTrailPaletteBorderColor'];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'[^']*trailPalette'/g)) {
        for (const name of banned) {
          expect(match[1], `${file} imports ${name} from trailPalette (use playerColour.ts)`).not.toMatch(new RegExp(`\\b${name}\\b`));
        }
      }
    }
  });

  test('the lasers, the star fills and the Spark do not use the static green token', () => {
    for (const name of ['edgeBeamArt.ts', 'edgeMarkers.ts', 'sparkPlayerSkin.ts']) {
      const source = readFileSync(resolve(root, 'render', name), 'utf8');
      expect(source, name).not.toMatch(/\bPLAYER_COLOR\b/);
    }
  });

  test('the scene colours the lasers with the player colour', () => {
    const scene = readFileSync(resolve(root, 'scenes', 'MenuScene.ts'), 'utf8');
    expect(scene).toContain('resolvePlayerColour(this.trailPaletteHead, time, false)');
    expect(scene.match(/playerColour,\r?\n/g)?.length).toBe(2);
  });
});
