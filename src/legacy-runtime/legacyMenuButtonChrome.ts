import { cyberArcadeMaterial } from '../render/cyberArcadeMaterial';

export interface LegacyMenuButtonChrome {
  baseAlpha: number;
  baseStroke: number;
  fillColor: number;
  fontSize: number;
  hoverFillColor: number;
  hoverAlpha: number;
  hoverLabelAlpha: number;
  hoverStroke: number;
  labelAlpha: number;
  strokeColor: number;
  strokeWidth: number;
  textColor: string;
}

interface ResolveLegacyMenuButtonChromeInput {
  height: number;
  isPrimary: boolean;
  textLength: number;
  width: number;
}

export const resolveLegacyMenuButtonChrome = (
  input: ResolveLegacyMenuButtonChromeInput
): LegacyMenuButtonChrome => {
  const { height, isPrimary, textLength, width } = input;
  const compact = height <= 44 || width <= 132;
  const fitSize = Math.floor((width * 1.4) / Math.max(4, textLength));
  const minimumFontSize = compact ? 16 : (isPrimary ? 24 : 20);
  const maximumFontSize = compact ? 20 : (isPrimary ? 40 : 32);
  const heightRatio = compact ? 0.46 : (isPrimary ? 0.58 : 0.52);
  const fontSize = Math.max(
    minimumFontSize,
    Math.min(
      maximumFontSize,
      Math.min(Math.round(height * heightRatio), fitSize)
    )
  );

  return {
    baseAlpha: isPrimary ? 0.34 : 0.3,
    baseStroke: isPrimary ? 0.72 : 0.52,
    fillColor: isPrimary ? cyberArcadeMaterial.substrate.playerPanel : cyberArcadeMaterial.substrate.panel,
    fontSize,
    hoverFillColor: isPrimary ? cyberArcadeMaterial.substrate.playerPanelActive : cyberArcadeMaterial.substrate.panelRaised,
    hoverAlpha: isPrimary ? 0.162 : 0.126,
    hoverLabelAlpha: 1,
    hoverStroke: isPrimary ? 0.92 : 0.8,
    labelAlpha: isPrimary ? 1 : 0.98,
    strokeColor: isPrimary ? cyberArcadeMaterial.signal.player : cyberArcadeMaterial.rail.cyan,
    strokeWidth: 2,
    textColor: isPrimary ? '#36ff7d' : '#ecfff5'
  };
};
