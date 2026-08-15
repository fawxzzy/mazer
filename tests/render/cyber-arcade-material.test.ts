import { describe, expect, test } from 'vitest';
import {
  CYBER_ARCADE_ICON_TARGET,
  CYBER_ARCADE_MATERIAL_SURFACE_ROLES,
  CYBER_ARCADE_MATERIAL_VERSION,
  cyberArcadeMaterial,
  isCyberArcadeRectPixelAligned,
  snapCyberArcadeRect,
  snapCyberArcadeStrokeCoordinate,
  summarizeCyberArcadeMaterial
} from '../../src/render/cyberArcadeMaterial';
import { MAZER_ICON_QUALITY_TARGET } from '../../src/brand/mazerIconQualityTarget';
import { phaserMaterialAliases } from '../../src/theme/tokens';

describe('cyber arcade material', () => {
  test('publishes the approved icon target and every shared runtime surface role', () => {
    const summary = summarizeCyberArcadeMaterial();

    expect(summary.version).toBe(CYBER_ARCADE_MATERIAL_VERSION);
    expect(summary.iconTarget).toBe(CYBER_ARCADE_ICON_TARGET);
    expect(summary.iconQualityTargetVersion).toBe(MAZER_ICON_QUALITY_TARGET.version);
    expect(summary.iconTargetSha256).toBe(MAZER_ICON_QUALITY_TARGET.canonicalAsset.sha256);
    expect(summary.surfaceRoles).toEqual(CYBER_ARCADE_MATERIAL_SURFACE_ROLES);
    expect(summary.surfaceRoles).toEqual(expect.arrayContaining([
      'background', 'maze', 'path', 'trail', 'player', 'title', 'border', 'button', 'compass', 'overlay'
    ]));
  });

  test('binds the live material to the canonical Precision Arcade token vocabulary', () => {
    expect(cyberArcadeMaterial.substrate.field).toBe(phaserMaterialAliases['bg.canvas']);
    expect(cyberArcadeMaterial.substrate.panel).toBe(phaserMaterialAliases['bg.panel']);
    expect(cyberArcadeMaterial.path).toEqual({
      core: phaserMaterialAliases['world.pathCore'],
      edge: phaserMaterialAliases['line.normal']
    });
    expect(cyberArcadeMaterial.rail.mint).toBe(phaserMaterialAliases['brand.mint']);
    expect(cyberArcadeMaterial.rail.cyan).toBe(phaserMaterialAliases['semantic.info']);
    expect(cyberArcadeMaterial.signal.player).toBe(phaserMaterialAliases['semantic.energy']);
    expect(cyberArcadeMaterial.shine).toEqual({
      core: phaserMaterialAliases['text.primary'],
      edge: phaserMaterialAliases['world.pathCore']
    });
  });

  test('snaps shared fill geometry to integer logical pixels without cumulative edge drift', () => {
    const snapped = snapCyberArcadeRect({ left: 10.4, top: 20.6, width: 99.4, height: 40.8 });

    expect(snapped).toEqual({ left: 10, top: 21, width: 100, height: 40 });
    expect(isCyberArcadeRectPixelAligned(snapped)).toBe(true);
    expect(snapCyberArcadeRect({ left: Number.NaN, top: 2.2, width: -4, height: 0 }, 2)).toEqual({
      left: 0,
      top: 2,
      width: 2,
      height: 2
    });
    expect(snapCyberArcadeStrokeCoordinate(12.28)).toBe(12.5);
  });
});
