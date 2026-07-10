export interface LegacyLinearColor {
  r: number;
  g: number;
  b: number;
}

export type LegacyControlMode = 'arrows' | 'stick';

export interface LegacySettings {
  scale: number;
  camScale: number;
  movementSpeed: number;
  pathColor: LegacyLinearColor;
  wallColor: LegacyLinearColor;
  darkMode: boolean;
  toggleCameraFollow: boolean;
  toggleTrailFade: boolean;
  toggleTrailPulse: boolean;
  toggleAnimatedBackdrop: boolean;
  controlMode: LegacyControlMode;
}

export const LEGACY_DEFAULTS: LegacySettings = {
  scale: 50,
  camScale: 0,
  movementSpeed: 0.3,
  pathColor: {
    r: 0.19099,
    g: 0.192708,
    b: 0.18769
  },
  wallColor: {
    r: 0.067708,
    g: 0.067708,
    b: 0.067708
  },
  darkMode: true,
  toggleCameraFollow: false,
  toggleTrailFade: false,
  toggleTrailPulse: true,
  toggleAnimatedBackdrop: true,
  controlMode: 'stick'
};

export const MAIN_MENU_BUTTONS = ['Start', 'Options'] as const;

export const clampNumber = (value: number, min: number, max: number): number => (
  Math.max(min, Math.min(max, value))
);

export const clampInteger = (value: number, min: number, max: number): number => (
  Math.max(min, Math.min(max, Math.round(value)))
);

export const clampUnit = (value: number): number => clampNumber(value, 0, 1);

export const linearChannelToSrgbByte = (value: number): number => {
  const normalized = clampUnit(value);
  const srgb = normalized <= 0.0031308
    ? normalized * 12.92
    : (1.055 * Math.pow(normalized, 1 / 2.4)) - 0.055;

  return clampInteger(Math.round(srgb * 255), 0, 255);
};

export const srgbByteToLinearChannel = (value: number): number => {
  const normalized = clampInteger(value, 0, 255) / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
};

export const linearColorToHex = (color: LegacyLinearColor): string => {
  const channels = [
    linearChannelToSrgbByte(color.r),
    linearChannelToSrgbByte(color.g),
    linearChannelToSrgbByte(color.b)
  ];

  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

export const linearColorToNumber = (color: LegacyLinearColor): number => (
  Number.parseInt(linearColorToHex(color).slice(1), 16)
);

export const copyLegacySettings = (settings: LegacySettings): LegacySettings => ({
  scale: settings.scale,
  camScale: settings.camScale,
  movementSpeed: settings.movementSpeed ?? LEGACY_DEFAULTS.movementSpeed,
  pathColor: { ...settings.pathColor },
  wallColor: { ...settings.wallColor },
  darkMode: settings.darkMode,
  toggleCameraFollow: settings.toggleCameraFollow,
  toggleTrailFade: settings.toggleTrailFade,
  toggleTrailPulse: settings.toggleTrailPulse ?? true,
  toggleAnimatedBackdrop: settings.toggleAnimatedBackdrop ?? LEGACY_DEFAULTS.toggleAnimatedBackdrop,
  controlMode: settings.controlMode
});
