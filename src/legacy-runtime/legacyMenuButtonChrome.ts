export interface LegacyMenuButtonChrome {
  baseAlpha: number;
  baseStroke: number;
  fontSize: number;
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
    baseAlpha: isPrimary ? 0.1 : 0.074,
    baseStroke: isPrimary ? 0.84 : 0.68,
    fontSize,
    hoverAlpha: isPrimary ? 0.162 : 0.126,
    hoverLabelAlpha: 1,
    hoverStroke: isPrimary ? 0.92 : 0.8,
    labelAlpha: isPrimary ? 0.98 : 0.94,
    strokeColor: isPrimary ? 0xd3cae0 : 0xc2b8d1,
    strokeWidth: 2,
    textColor: isPrimary ? '#22a533' : '#1d9230'
  };
};
