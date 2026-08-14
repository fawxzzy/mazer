import {
  MAZER_ICON_QUALITY_TARGET,
  MAZER_ICON_QUALITY_TARGET_VERSION
} from '../brand/mazerIconQualityTarget';
import { phaserMaterialAliases } from '../theme/tokens';

/**
 * The live Phaser material is deliberately fed from the same token registry as
 * the shell work. Keeping the historical export name avoids a renderer-wide
 * rename while the visual system moves to the single Precision Arcade theme.
 */
export const PRECISION_ARCADE_MATERIAL_VERSION = 'mazer-precision-arcade-material-v2' as const;
export const CYBER_ARCADE_MATERIAL_VERSION = PRECISION_ARCADE_MATERIAL_VERSION;
export const CYBER_ARCADE_ICON_TARGET = MAZER_ICON_QUALITY_TARGET.canonicalAsset.repositoryPath;

const color = phaserMaterialAliases;

export const cyberArcadeMaterial = Object.freeze({
  substrate: Object.freeze({
    field: color['bg.canvas'],
    fieldRaised: color['bg.shell'],
    panel: color['bg.panel'],
    panelRaised: color['bg.elevated'],
    panelActive: color['bg.elevated'],
    playerPanel: color['bg.shell'],
    playerPanelActive: color['bg.elevated'],
    shadow: color['bg.canvas']
  }),
  rail: Object.freeze({
    edge: color['line.subtle'],
    muted: color['text.muted'],
    mint: color['brand.mint'],
    cyan: color['semantic.info'],
    white: color['text.primary']
  }),
  path: Object.freeze({
    core: color['world.pathCore'],
    edge: color['line.normal']
  }),
  signal: Object.freeze({
    player: color['semantic.energy'],
    playerAccent: color['brand.mint'],
    playerHalo: color['line.active'],
    start: color['semantic.reward'],
    startEdge: color['semantic.reward'],
    goal: color['semantic.danger'],
    goalEdge: color['semantic.danger'],
    warning: color['semantic.reward'],
    warningEdge: color['semantic.danger'],
    memory: color['semantic.info'],
    violet: color['semantic.anomaly']
  }),
  shine: Object.freeze({
    core: color['text.primary'],
    edge: color['world.pathCore']
  }),
  geometry: Object.freeze({
    fillAlignment: 'integer-logical-pixels',
    strokeAlignment: 'half-pixel-centered',
    backingScale: 'dpr-aware-capped-2'
  })
} as const);

export interface CyberArcadeRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export const snapCyberArcadeCoordinate = (value: number): number => (
  Number.isFinite(value) ? Math.round(value) : 0
);

export const snapCyberArcadeStrokeCoordinate = (value: number): number => (
  snapCyberArcadeCoordinate(value) + 0.5
);

export const toCyberArcadeCssHex = (value: number): string => (
  `#${Math.max(0, Math.min(0xffffff, Math.round(value))).toString(16).padStart(6, '0')}`
);

export const snapCyberArcadeRect = (
  rect: CyberArcadeRect,
  minimumSize = 1
): CyberArcadeRect => {
  const safeMinimum = Math.max(1, Math.round(minimumSize));
  const left = snapCyberArcadeCoordinate(rect.left);
  const top = snapCyberArcadeCoordinate(rect.top);
  const right = Math.max(left + safeMinimum, snapCyberArcadeCoordinate(rect.left + rect.width));
  const bottom = Math.max(top + safeMinimum, snapCyberArcadeCoordinate(rect.top + rect.height));

  return {
    left,
    top,
    width: right - left,
    height: bottom - top
  };
};

export const isCyberArcadeRectPixelAligned = (rect: CyberArcadeRect): boolean => (
  Number.isInteger(rect.left)
  && Number.isInteger(rect.top)
  && Number.isInteger(rect.width)
  && Number.isInteger(rect.height)
  && rect.width > 0
  && rect.height > 0
);

export const CYBER_ARCADE_MATERIAL_SURFACE_ROLES = Object.freeze([
  'background',
  'maze',
  'path',
  'trail',
  'player',
  'title',
  'border',
  'button',
  'compass',
  'overlay'
] as const);

export const summarizeCyberArcadeMaterial = () => ({
  version: CYBER_ARCADE_MATERIAL_VERSION,
  iconTarget: CYBER_ARCADE_ICON_TARGET,
  iconTargetSha256: MAZER_ICON_QUALITY_TARGET.canonicalAsset.sha256,
  iconQualityTargetVersion: MAZER_ICON_QUALITY_TARGET_VERSION,
  surfaceRoles: [...CYBER_ARCADE_MATERIAL_SURFACE_ROLES],
  geometry: { ...cyberArcadeMaterial.geometry }
});
