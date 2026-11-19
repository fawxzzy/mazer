import { describe, expect, it } from 'vitest';
import {
  CONTROLLER_HALO,
  CONTROLLER_HALO_SECTOR_NAMES,
  createControllerHaloState,
  drawControllerHaloGuideGlyph,
  resolveControllerHaloFrame,
  resolveControllerHaloLeashAlpha,
  resolveControllerHaloLeashBox,
  resolveControllerHaloNearPlayerScale,
  resolveControllerHaloNubBox,
  resolveControllerHaloRingBox,
  resolveControllerHaloSector,
  resolveControllerHaloSectorAngle,
  resolveControllerHaloSectorAxisRelation,
  stepControllerHaloFade,
  type ControllerHaloFrameInput
} from '../../src/render/controllerHaloLook';
import { resolveStickMovementIntent } from '../../src/input-human/touch';

const DEG = Math.PI / 180;

const input = (overrides: Partial<ControllerHaloFrameInput> = {}): ControllerHaloFrameInput => ({
  down: true,
  anchor: { x: 200, y: 600 },
  finger: { x: 240, y: 600 },
  engaged: true,
  leashPx: 90,
  player: null,
  nowMs: 0,
  reducedMotion: false,
  ...overrides
});

describe('controller halo look: 8 sectors', () => {
  it('names the 8 sectors clockwise from right in screen space (y down)', () => {
    expect(CONTROLLER_HALO_SECTOR_NAMES).toEqual(['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right']);
    expect(CONTROLLER_HALO.sectorCount).toBe(8);
  });

  it.each([
    [0, 0],
    [45, 1],
    [90, 2],
    [135, 3],
    [180, 4],
    [-180, 4],
    [225, 5],
    [-135, 5],
    [270, 6],
    [-90, 6],
    [315, 7],
    [-45, 7],
    [360, 0]
  ])('lights sector for a pull at %i degrees -> %i', (degrees, sector) => {
    expect(resolveControllerHaloSector(degrees * DEG, null)).toBe(sector);
  });

  it('lights each sector across its full 45 degree span with no previous sector', () => {
    for (let sector = 0; sector < 8; sector += 1) {
      const centre = sector * 45;
      for (const offset of [-22, -10, 0, 10, 22]) {
        expect(resolveControllerHaloSector((centre + offset) * DEG, null)).toBe(sector);
      }
    }
  });

  it('maps the drag vector the way the screen draws it (dy > 0 is down)', () => {
    expect(CONTROLLER_HALO_SECTOR_NAMES[resolveControllerHaloSector(Math.atan2(30, 30), null)!]).toBe('down-right');
    expect(CONTROLLER_HALO_SECTOR_NAMES[resolveControllerHaloSector(Math.atan2(-30, -30), null)!]).toBe('up-left');
    expect(CONTROLLER_HALO_SECTOR_NAMES[resolveControllerHaloSector(Math.atan2(-40, 2), null)!]).toBe('up');
  });

  it('returns null for a non-finite angle', () => {
    expect(resolveControllerHaloSector(Number.NaN, 3)).toBeNull();
    expect(resolveControllerHaloSector(Number.POSITIVE_INFINITY, null)).toBeNull();
  });

  it('centre angles are k * 45 degrees', () => {
    expect(resolveControllerHaloSectorAngle(0)).toBe(0);
    expect(resolveControllerHaloSectorAngle(2)).toBeCloseTo(Math.PI / 2);
    expect(resolveControllerHaloSectorAngle(7)).toBeCloseTo(7 * Math.PI / 4);
  });
});

describe('controller halo look: boundary hysteresis', () => {
  const band = CONTROLLER_HALO.sectorHysteresisRad / DEG;

  it('uses a small band (a few degrees)', () => {
    expect(band).toBeGreaterThan(2);
    expect(band).toBeLessThan(10);
  });

  it('keeps the lit sector just past its edge, then switches once past the band', () => {
    // right (0) lit; the edge with down-right is 22.5 degrees.
    expect(resolveControllerHaloSector((22.5 + (band / 2)) * DEG, 0)).toBe(0);
    expect(resolveControllerHaloSector((22.5 + band + 0.5) * DEG, 0)).toBe(1);
    // and back: down-right (1) lit, the thumb drifts toward right.
    expect(resolveControllerHaloSector((22.5 - (band / 2)) * DEG, 1)).toBe(1);
    expect(resolveControllerHaloSector((22.5 - band - 0.5) * DEG, 1)).toBe(0);
  });

  it('does not flicker when a thumb jitters on a boundary', () => {
    let sector: number | null = null;
    const lit: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      const jitter = (i % 2 === 0 ? 1 : -1) * (band / 3);
      sector = resolveControllerHaloSector((67.5 + jitter) * DEG, sector);
      lit.push(sector!);
    }
    expect(new Set(lit).size).toBe(1);
  });

  it('wraps across 0/360 (right <-> up-right)', () => {
    expect(resolveControllerHaloSector(-(22.5 + (band / 2)) * DEG, 0)).toBe(0);
    expect(resolveControllerHaloSector((337.5 - (band / 2)) * DEG, 0)).toBe(0);
    expect(resolveControllerHaloSector((337.5 - band - 1) * DEG, 0)).toBe(7);
  });

  it('ignores an invalid previous sector', () => {
    expect(resolveControllerHaloSector(10 * DEG, 9)).toBe(0);
    expect(resolveControllerHaloSector(10 * DEG, 1.5)).toBe(0);
  });

  it('jumps straight to a far sector (a flick is not slowed down)', () => {
    expect(resolveControllerHaloSector(180 * DEG, 0)).toBe(4);
  });
});

describe('controller halo look: lit sector vs the axis the game resolves', () => {
  it('a cardinal sector always matches the game primary axis; a diagonal sector holds the primary axis as one of its two', () => {
    for (let degrees = -179; degrees <= 180; degrees += 1) {
      const angle = degrees * DEG;
      const sector = resolveControllerHaloSector(angle, null)!;
      const movement = resolveStickMovementIntent(angle).movement;
      const relation = resolveControllerHaloSectorAxisRelation(sector, movement);
      expect(relation === 'same' || relation === 'diagonal-component').toBe(true);
      expect(relation === 'same').toBe(sector % 2 === 0);
    }
  });

  it('only differs inside the hysteresis band right at a sector edge', () => {
    // Right (0) still lit 2 degrees into down-right's sector; the game moves right there too, so it is 'same'.
    expect(resolveControllerHaloSectorAxisRelation(resolveControllerHaloSector(24.5 * DEG, 0), resolveStickMovementIntent(24.5 * DEG).movement)).toBe('same');
    // Down-right (1) still lit at 68.5 degrees (past its edge); the game moves down: a component, never opposite.
    expect(resolveControllerHaloSectorAxisRelation(resolveControllerHaloSector(68.5 * DEG, 1), resolveStickMovementIntent(68.5 * DEG).movement)).toBe('diagonal-component');
    // A hand-made mismatch is reported as such.
    expect(resolveControllerHaloSectorAxisRelation(0, 'move_left')).toBe('differs');
    expect(resolveControllerHaloSectorAxisRelation(null, 'move_left')).toBe('none');
  });
});

describe('controller halo look: zero-length drag and the dead zone', () => {
  it('a finger down with no pull shows the ring and nub at the anchor but lights no sector', () => {
    const state = createControllerHaloState();
    const frame = resolveControllerHaloFrame(input({ finger: { x: 200, y: 600 }, engaged: false, reducedMotion: true }), state);
    expect(frame.visible).toBe(true);
    expect(frame.sector).toBeNull();
    expect(frame.sectorName).toBeNull();
    expect(frame.litAlpha).toBe(0);
    expect(frame.nubX).toBe(200);
    expect(frame.nubY).toBe(600);
    expect(frame.leashAlpha).toBe(0);
    expect(Number.isFinite(frame.leashRotationRad)).toBe(true);
  });

  it('a pull inside the game dead zone (not engaged) lights nothing even though the finger moved', () => {
    const state = createControllerHaloState();
    const frame = resolveControllerHaloFrame(input({ finger: { x: 205, y: 600 }, engaged: false, reducedMotion: true }), state);
    expect(frame.sector).toBeNull();
    expect(frame.nubX).toBe(205);
  });

  it('engaged with an exactly zero-length vector still lights nothing (no NaN angle)', () => {
    const state = createControllerHaloState();
    const frame = resolveControllerHaloFrame(input({ finger: { x: 200, y: 600 }, engaged: true, reducedMotion: true }), state);
    expect(frame.sector).toBeNull();
    expect(Number.isNaN(frame.nubX)).toBe(false);
  });
});

describe('controller halo look: frames', () => {
  it('nub slides toward the pull, at most nubThrowPx, at whole css px', () => {
    const state = createControllerHaloState();
    const frame = resolveControllerHaloFrame(input({ anchor: { x: 200.4, y: 600.6 }, finger: { x: 300, y: 700 }, reducedMotion: true }), state);
    expect(Number.isInteger(frame.anchorX)).toBe(true);
    expect(Number.isInteger(frame.anchorY)).toBe(true);
    expect(Number.isInteger(frame.nubX)).toBe(true);
    expect(Number.isInteger(frame.nubY)).toBe(true);
    expect(Math.hypot(frame.nubX - 200.4, frame.nubY - 600.6)).toBeLessThanOrEqual(CONTROLLER_HALO.nubThrowPx + 1);
    expect(frame.sectorName).toBe('down-right');
    expect(frame.litRotationRad).toBeCloseTo(Math.PI / 4);
  });

  it('lights all 8 directions from 8 drags', () => {
    const seen: string[] = [];
    for (let k = 0; k < 8; k += 1) {
      const angle = k * Math.PI / 4;
      const state = createControllerHaloState();
      const frame = resolveControllerHaloFrame(input({ finger: { x: 200 + (Math.cos(angle) * 50), y: 600 + (Math.sin(angle) * 50) }, reducedMotion: true }), state);
      seen.push(frame.sectorName!);
    }
    expect(seen).toEqual([...CONTROLLER_HALO_SECTOR_NAMES]);
  });

  it('carries hysteresis between frames through the state', () => {
    const state = createControllerHaloState();
    const at = (deg: number, nowMs: number) => resolveControllerHaloFrame(
      input({ finger: { x: 200 + (Math.cos(deg * DEG) * 60), y: 600 + (Math.sin(deg * DEG) * 60) }, nowMs }), state);
    expect(at(10, 0).sectorName).toBe('right');
    expect(at(24, 16).sectorName).toBe('right');
    expect(at(40, 32).sectorName).toBe('down-right');
    expect(at(21, 48).sectorName).toBe('down-right');
  });

  it('idle (no finger ever down) draws nothing', () => {
    const frame = resolveControllerHaloFrame(input({ down: false, anchor: null, finger: null }), createControllerHaloState());
    expect(frame.visible).toBe(false);
    expect(frame.sector).toBeNull();
  });
});

describe('controller halo look: fade and reduced motion', () => {
  it('fades in over fadeInMs and out over fadeOutMs', () => {
    expect(stepControllerHaloFade(0, true, 45, false)).toBeCloseTo(0.5);
    expect(stepControllerHaloFade(0.5, true, 45, false)).toBeCloseTo(1);
    expect(stepControllerHaloFade(1, true, 16, false)).toBe(1);
    expect(stepControllerHaloFade(1, false, 90, false)).toBeCloseTo(0.5);
    expect(stepControllerHaloFade(0.5, false, 90, false)).toBeCloseTo(0);
    expect(stepControllerHaloFade(0, false, 16, false)).toBe(0);
  });

  it('caps a single step (a stalled tab does not pop the ring in)', () => {
    expect(stepControllerHaloFade(0, true, 5000, false)).toBeLessThanOrEqual(CONTROLLER_HALO.maxStepMs / CONTROLLER_HALO.fadeInMs);
    expect(stepControllerHaloFade(0, true, Number.NaN, false)).toBe(0);
  });

  it('reduced motion: no animated fade, the target at once', () => {
    expect(stepControllerHaloFade(0, true, 0, true)).toBe(1);
    expect(stepControllerHaloFade(1, false, 0, true)).toBe(0);
  });

  it('reduced motion still lights the direction on the very first frame', () => {
    const frame = resolveControllerHaloFrame(input({ finger: { x: 200, y: 540 }, reducedMotion: true }), createControllerHaloState());
    expect(frame.alpha).toBe(1);
    expect(frame.sectorName).toBe('up');
    expect(frame.litAlpha).toBeCloseTo(CONTROLLER_HALO.litAlpha);
    expect(frame.nubGlow).toBe(false);
  });

  it('without reduced motion the first frame starts transparent and fades in; the glow is on', () => {
    const state = createControllerHaloState();
    const first = resolveControllerHaloFrame(input({ nowMs: 1000 }), state);
    expect(first.alpha).toBe(0);
    expect(first.nubGlow).toBe(true);
    const later = resolveControllerHaloFrame(input({ nowMs: 1045 }), state);
    expect(later.alpha).toBeCloseTo(0.5);
    expect(later.sectorName).toBe('right');
  });

  it('on release it fades out at the last anchor, then forgets it; reduced motion hides at once', () => {
    const state = createControllerHaloState();
    resolveControllerHaloFrame(input({ nowMs: 0, reducedMotion: true }), state);
    const fading = resolveControllerHaloFrame(input({ down: false, anchor: null, finger: null, nowMs: 90 }), state);
    expect(fading.visible).toBe(true);
    expect(fading.anchorX).toBe(200);
    expect(fading.sector).toBeNull();
    expect(fading.leashAlpha).toBe(0);
    const gone = resolveControllerHaloFrame(input({ down: false, anchor: null, finger: null, nowMs: 200 }), state);
    expect(gone.visible).toBe(false);
    expect(state.anchor).toBeNull();

    const rm = createControllerHaloState();
    resolveControllerHaloFrame(input({ reducedMotion: true }), rm);
    expect(resolveControllerHaloFrame(input({ down: false, anchor: null, finger: null, nowMs: 16, reducedMotion: true }), rm).visible).toBe(false);
  });
});

describe('controller halo look: leash cue', () => {
  it('appears past 70% of the leash and reaches its max at the leash', () => {
    expect(resolveControllerHaloLeashAlpha(60, 90)).toBe(0);
    expect(resolveControllerHaloLeashAlpha(63, 90)).toBe(0);
    expect(resolveControllerHaloLeashAlpha(76.5, 90)).toBeCloseTo(CONTROLLER_HALO.leashMaxAlpha / 2);
    expect(resolveControllerHaloLeashAlpha(90, 90)).toBeCloseTo(CONTROLLER_HALO.leashMaxAlpha);
    expect(resolveControllerHaloLeashAlpha(200, 90)).toBeCloseTo(CONTROLLER_HALO.leashMaxAlpha);
  });

  it('no cue with a fixed anchor (null leash) or a bad input', () => {
    expect(resolveControllerHaloLeashAlpha(200, null)).toBe(0);
    expect(resolveControllerHaloLeashAlpha(200, 0)).toBe(0);
    expect(resolveControllerHaloLeashAlpha(Number.NaN, 90)).toBe(0);
  });
});

describe('controller halo look: never covers the player', () => {
  it('full strength when the player is far, dims to the floor as it nears the ring or the thumb', () => {
    const anchor = { x: 200, y: 600 };
    const finger = { x: 240, y: 600 };
    expect(resolveControllerHaloNearPlayerScale(anchor, finger, null)).toBe(1);
    expect(resolveControllerHaloNearPlayerScale(anchor, finger, { x: 200, y: 300 })).toBe(1);
    expect(resolveControllerHaloNearPlayerScale(anchor, finger, { x: 200, y: 600 })).toBe(CONTROLLER_HALO.nearPlayer.minAlpha);
    expect(resolveControllerHaloNearPlayerScale(anchor, finger, { x: 240, y: 605 })).toBe(CONTROLLER_HALO.nearPlayer.minAlpha);
    const mid = resolveControllerHaloNearPlayerScale(anchor, finger, { x: 200, y: 540 });
    expect(mid).toBeGreaterThan(CONTROLLER_HALO.nearPlayer.minAlpha);
    expect(mid).toBeLessThan(1);
  });

  it('the frame alpha includes the near-player dimming', () => {
    const frame = resolveControllerHaloFrame(input({ player: { x: 200, y: 600 }, reducedMotion: true }), createControllerHaloState());
    expect(frame.alpha).toBeCloseTo(CONTROLLER_HALO.nearPlayer.minAlpha);
    expect(frame.ringAlpha).toBeCloseTo(CONTROLLER_HALO.ringAlpha * CONTROLLER_HALO.nearPlayer.minAlpha);
  });
});

describe('controller halo look: bake boxes and guide glyph', () => {
  it('bake boxes are even css sizes with the anchor on a whole css px', () => {
    for (const box of [resolveControllerHaloRingBox(), resolveControllerHaloNubBox(), resolveControllerHaloLeashBox(90), resolveControllerHaloLeashBox(53.7)]) {
      expect(box.widthCss % 2).toBe(0);
      expect(box.heightCss % 2).toBe(0);
      expect(Number.isInteger(box.originXCss)).toBe(true);
      expect(Number.isInteger(box.originYCss)).toBe(true);
    }
    const ring = resolveControllerHaloRingBox();
    expect(ring.widthCss).toBeGreaterThanOrEqual((CONTROLLER_HALO.ringRadiusPx * 2) + CONTROLLER_HALO.litLineWidthPx);
  });

  it('lit arc span stays inside one 45 degree sector with a visible gap', () => {
    expect(CONTROLLER_HALO.litHalfSpanRad * 2).toBeLessThan(Math.PI / 4);
  });

  it('the guide glyph draws a ring, a lit diagonal and a nub', () => {
    const calls: string[] = [];
    const g = new Proxy({}, { get: (_t, name: string) => (..._args: unknown[]) => { calls.push(name); return g; } });
    drawControllerHaloGuideGlyph(g as never, 10, 10, 8);
    expect(calls).toContain('strokeCircle');
    expect(calls).toContain('arc');
    expect(calls).toContain('strokePath');
    expect(calls.filter((name) => name === 'fillCircle')).toHaveLength(2);
  });
});
