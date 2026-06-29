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
  const fitSize = Math.floor((width * 1.22) / Math.max(4, textLength));
  const fontSize = Math.max(
    isPrimary ? 22 : 18,
    Math.min(
      isPrimary ? 38 : 30,
      Math.min(Math.round(height * (isPrimary ? 0.58 : 0.5)), fitSize)
    )
  );

  return {
    baseAlpha: isPrimary ? 0.055 : 0.042,
    baseStroke: isPrimary ? 0.56 : 0.46,
    fontSize,
    hoverAlpha: isPrimary ? 0.12 : 0.09,
    hoverLabelAlpha: 0.98,
    hoverStroke: isPrimary ? 0.66 : 0.54,
    labelAlpha: isPrimary ? 0.96 : 0.9,
    strokeColor: isPrimary ? 0xbdb5c9 : 0xa59db4,
    strokeWidth: 1,
    textColor: isPrimary ? '#1a942a' : '#157f20'
  };
};
