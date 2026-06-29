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
  const fitSize = Math.floor((width * 1.34) / Math.max(4, textLength));
  const fontSize = Math.max(
    isPrimary ? 24 : 20,
    Math.min(
      isPrimary ? 42 : 32,
      Math.min(Math.round(height * (isPrimary ? 0.62 : 0.54)), fitSize)
    )
  );

  return {
    baseAlpha: isPrimary ? 0.09 : 0.068,
    baseStroke: isPrimary ? 0.82 : 0.68,
    fontSize,
    hoverAlpha: isPrimary ? 0.16 : 0.12,
    hoverLabelAlpha: 1,
    hoverStroke: isPrimary ? 0.96 : 0.82,
    labelAlpha: isPrimary ? 0.99 : 0.95,
    strokeColor: isPrimary ? 0xc9c0d7 : 0xb4abc3,
    strokeWidth: 2,
    textColor: isPrimary ? '#1f9f2f' : '#188826'
  };
};
