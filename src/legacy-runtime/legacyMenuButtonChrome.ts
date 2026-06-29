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
    isPrimary ? 26 : 22,
    Math.min(
      isPrimary ? 46 : 36,
      Math.min(Math.round(height * (isPrimary ? 0.66 : 0.58)), fitSize)
    )
  );

  return {
    baseAlpha: isPrimary ? 0.105 : 0.08,
    baseStroke: isPrimary ? 0.86 : 0.72,
    fontSize,
    hoverAlpha: isPrimary ? 0.18 : 0.135,
    hoverLabelAlpha: 1,
    hoverStroke: isPrimary ? 0.98 : 0.86,
    labelAlpha: isPrimary ? 1 : 0.965,
    strokeColor: isPrimary ? 0xc9c0d7 : 0xb4abc3,
    strokeWidth: 2,
    textColor: isPrimary ? '#1f9f2f' : '#188826'
  };
};
