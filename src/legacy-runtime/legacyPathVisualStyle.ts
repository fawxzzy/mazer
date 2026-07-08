export type LegacyPathVisualStyle = 'corridor' | 'hybrid';

const LEGACY_PATH_VISUAL_STYLE_VALUES = new Set<LegacyPathVisualStyle>([
  'corridor',
  'hybrid'
]);

export const resolveLegacyPathVisualStyle = (
  search?: string | URLSearchParams
): LegacyPathVisualStyle => {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(
      typeof search === 'string' && search.startsWith('?')
        ? search.slice(1)
        : search
    );
  const rawStyle = params.get('pathStyle')?.trim().toLowerCase();

  return LEGACY_PATH_VISUAL_STYLE_VALUES.has(rawStyle as LegacyPathVisualStyle)
    ? rawStyle as LegacyPathVisualStyle
    : 'corridor';
};
