import {
  MAZER_ICON_QUALITY_TARGET,
  MAZER_ICON_QUALITY_TARGET_VERSION
} from '../brand/mazerIconQualityTarget';

export const CYBER_ARCADE_MATERIAL_VERSION = 'mazer-cyber-arcade-material-v1' as const;
export const CYBER_ARCADE_ICON_TARGET = MAZER_ICON_QUALITY_TARGET.canonicalAsset.repositoryPath;

export const cyberArcadeMaterial = Object.freeze({
  substrate: Object.freeze({
    field: 0x07111d,
    fieldRaised: 0x0b1628,
    panel: 0x07131d,
    panelRaised: 0x0b1f2b,
    panelActive: 0x0d2b25,
    playerPanel: 0x06170f,
    playerPanelActive: 0x0a2a1a,
    shadow: 0x02070d
  }),
  rail: Object.freeze({
    edge: 0x0d3c4f,
    muted: 0x245263,
    mint: 0x72e0bf,
    cyan: 0xb7f2ff,
    white: 0xecfff5
  }),
  path: Object.freeze({
    core: 0xe7fff4,
    edge: 0x0d3c4f
  }),
  signal: Object.freeze({
    player: 0x36ff7d,
    playerAccent: 0xb6ffd0,
    playerHalo: 0x00b84a,
    start: 0xfff05a,
    startEdge: 0xffc629,
    goal: 0xff263f,
    goalEdge: 0xd81b2a,
    warning: 0xffd36a,
    warningEdge: 0xff7a3d,
    memory: 0x2de8ff,
    violet: 0xb87dff
  }),
  shine: Object.freeze({
    core: 0xffffff,
    edge: 0xe8fff5
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
