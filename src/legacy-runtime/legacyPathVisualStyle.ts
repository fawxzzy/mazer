export type LegacyPathVisualStyle = 'corridor';

export const resolveLegacyPathVisualStyle = (
  _search?: string | URLSearchParams
): LegacyPathVisualStyle => {
  // The shipped maze material is locked to connected corridors. Alternate
  // URL-driven path styles made cached/debug sessions visibly regress to
  // blockier tile reads.
  return 'corridor';
};
