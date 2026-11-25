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
import {
  drawPlayerLocator,
  resolvePlayerLocatorColour,
  type LocatorGraphics,
  type PlayerLocatorDrawInput
} from '../../src/render/playerLocator';
import { createPlayerMarkerFrame, drawPlayerMarker, resolvePlayerMarkerFrame } from '../../src/render/playerMarker';
import { createSparkMaterial, resolveSparkMaterial } from '../../src/render/sparkPlayerSkin';
import { isCosmeticColourScopeActive } from '../../src/theme/cosmeticScope';
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

/** Records every colour the locator paints: the glow (fills) and the ring, pings and keylines (strokes). */
interface LocatorPainted { fills: number[]; strokes: number[]; outsideScope: number }
const makeLocatorPainter = (): LocatorGraphics & LocatorPainted => {
  const painted: LocatorGraphics & LocatorPainted = {
    fills: [],
    strokes: [],
    outsideScope: 0,
    fillStyle(color: number) { painted.fills.push(color); if (!isCosmeticColourScopeActive()) painted.outsideScope += 1; },
    fillRoundedRect() {},
    lineStyle(_width: number, color: number) { painted.strokes.push(color); if (!isCosmeticColourScopeActive()) painted.outsideScope += 1; },
    strokeRoundedRect() {}
  };
  return painted;
};

const locatorInput = (over: Partial<PlayerLocatorDrawInput> = {}): PlayerLocatorDrawInput => ({
  centerX: 100,
  centerY: 80,
  tileSize: 20,
  devicePixelRatio: 2,
  coreHalfWidth: 6,
  coreHalfHeight: 6,
  coreCornerRadius: 1.5,
  coreReachCss: 6.4,
  alpha: 1,
  timeMs: 0,
  pingStartMs: 0,
  reducedMotion: false,
  ...over
});

const markerFrame = () => resolvePlayerMarkerFrame({
  centerX: 100, centerY: 80, tileSize: 20, devicePixelRatio: 2, timeMs: 0, reducedMotion: true, motionAmount: 0, headingX: 0, headingY: 0
}, createPlayerMarkerFrame());

describe('player colour: the locator ring and glow follow it (MAZER-VIS-062)', () => {
  test('a set player colour paints the glow, the ring and the ping; only the dark keylines keep another colour', () => {
    setPlayerColour(FLAT);
    const painted = makeLocatorPainter();
    drawPlayerLocator(painted, locatorInput({ timeMs: 120 }));
    expect(painted.fills.length).toBeGreaterThan(0);
    expect(painted.fills.every((colour) => colour === FLAT)).toBe(true);
    // the ring and the live ping rings are FLAT; every other stroke is the one dark keyline colour
    expect(painted.strokes[0]).toBe(FLAT);
    expect(painted.strokes.filter((colour) => colour === FLAT).length).toBeGreaterThanOrEqual(2);
    expect(new Set(painted.strokes).size).toBe(2);
    expect([...painted.fills, ...painted.strokes].includes(0x2bb868)).toBe(false);
  });

  test('rainbow: the ring and glow shift with the clock, the same colour the lasers and star fills read at that time', () => {
    expect(isPlayerColourRainbow()).toBe(true);
    const seen = new Set<number>();
    for (const timeMs of [0, 900, 2500, 5000]) {
      const shared = resolvePlayerColour(null, timeMs, false);
      const painted = makeLocatorPainter();
      drawPlayerLocator(painted, locatorInput({ timeMs, pingStartMs: -1 }));
      expect(painted.fills.every((colour) => colour === shared), `glow at ${timeMs}`).toBe(true);
      expect(painted.strokes[0], `ring at ${timeMs}`).toBe(shared);
      // the beams and star fills colour themselves from the same source at the same clock
      const beams = makePainter();
      drawEdgeBeams(beams, { direction: 'outward', focus: { x: 200, y: 400 }, laserProgress: 0, spawnPop: 0, stations, clockMs: 150, playerColour: shared });
      expect(beams.lines.includes(shared)).toBe(true);
      seen.add(shared);
    }
    expect(seen.size).toBeGreaterThan(2);
    // reduced motion freezes it exactly like every other consumer
    expect(resolvePlayerLocatorColour({ timeMs: 9000, reducedMotion: true })).toBe(resolvePlayerColour(null, 9000, true));
  });

  test('the Chip marker hands its core colour to the locator, so core, ring and glow are one colour', () => {
    const core = 0x44aaff;
    const painted = makeLocatorPainter();
    drawPlayerMarker(painted, markerFrame(), { tileSize: 20, devicePixelRatio: 2, alpha: 1, timeMs: 0, coreColor: core, pingStartMs: -1, reducedMotion: true });
    expect(painted.fills.filter((colour) => colour === core).length).toBeGreaterThan(1);
    expect(painted.strokes[0]).toBe(core);
    expect(resolvePlayerLocatorColour({ colour: core, timeMs: 0, reducedMotion: false })).toBe(core);
  });

  test('dark mode leaves them alone: every locator and marker colour is set inside the cosmetic scope (MAZER-UI-102)', () => {
    const locator = makeLocatorPainter();
    drawPlayerLocator(locator, locatorInput());
    expect(locator.fills.length + locator.strokes.length).toBeGreaterThan(3);
    expect(locator.outsideScope).toBe(0);
    const marker = makeLocatorPainter();
    drawPlayerMarker(marker, markerFrame(), { tileSize: 20, devicePixelRatio: 2, alpha: 1, timeMs: 0, coreColor: FLAT, pingStartMs: -1, reducedMotion: true });
    expect(marker.fills.length + marker.strokes.length).toBeGreaterThan(3);
    expect(marker.outsideScope).toBe(0);
    expect(isCosmeticColourScopeActive()).toBe(false);
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

  test('the lasers, the star fills, the Spark and the locator ring and glow do not use the static green token', () => {
    for (const name of ['edgeBeamArt.ts', 'edgeMarkers.ts', 'sparkPlayerSkin.ts', 'playerLocator.ts', 'playerMarker.ts']) {
      const source = readFileSync(resolve(root, 'render', name), 'utf8');
      expect(source, name).not.toMatch(/\bPLAYER_COLOR\b/);
      // boardMaterial.player / playerEdge is that same static green (MAZER-VIS-062): doc comments may name it, code may not
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, name).not.toMatch(/\bboardMaterial\.player(Edge)?\b/);
    }
    // the locator's colour comes from the shared source
    const locator = readFileSync(resolve(root, 'render', 'playerLocator.ts'), 'utf8');
    expect(locator).toMatch(/import \{ resolvePlayerColour \} from '\.\/playerColour';/);
  });

  test('the scene colours the lasers with the player colour', () => {
    const scene = readFileSync(resolve(root, 'scenes', 'MenuScene.ts'), 'utf8');
    expect(scene).toContain('resolvePlayerColour(this.trailPaletteHead, time, false)');
    expect(scene.match(/playerColour,\r?\n/g)?.length).toBe(2);
  });
});
