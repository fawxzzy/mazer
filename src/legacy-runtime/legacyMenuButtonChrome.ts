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
  const fitSize = Math.floor((width * 1.4) / Math.max(4, textLength));
  const fontSize = Math.max(
    isPrimary ? 24 : 20,
    Math.min(
      isPrimary ? 40 : 32,
      Math.min(Math.round(height * (isPrimary ? 0.58 : 0.52)), fitSize)
    )
  );

  return {
    baseAlpha: isPrimary ? 0.34 : 0.3,
    baseStroke: isPrimary ? 0.72 : 0.52,
    fillColor: isPrimary ? 0x06170f : 0x0d0715,
    fontSize,
    hoverFillColor: isPrimary ? 0x0a2a1a : 0x151021,
    hoverAlpha: isPrimary ? 0.162 : 0.126,
    hoverLabelAlpha: 1,
    hoverStroke: isPrimary ? 0.92 : 0.8,
    labelAlpha: isPrimary ? 1 : 0.98,
    strokeColor: isPrimary ? 0x36ff7d : 0xc2b8d1,
    strokeWidth: 2,
    textColor: isPrimary ? '#36ff7d' : '#ecfff5'
  };
};
