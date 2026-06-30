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
    baseAlpha: isPrimary ? 0.092 : 0.062,
    baseStroke: isPrimary ? 0.78 : 0.58,
    fontSize,
    hoverAlpha: isPrimary ? 0.15 : 0.112,
    hoverLabelAlpha: 1,
    hoverStroke: isPrimary ? 0.9 : 0.76,
    labelAlpha: isPrimary ? 0.96 : 0.9,
    strokeColor: isPrimary ? 0xc9c0d7 : 0xb4abc3,
    strokeWidth: 2,
    textColor: isPrimary ? '#1f9f2f' : '#188826'
  };
};
