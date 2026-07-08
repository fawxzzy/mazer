const TRUE_QUERY_VALUES = new Set(['1', 'true', 'yes', 'on']);

const toSearchParams = (search?: string | URLSearchParams): URLSearchParams => {
  if (search instanceof URLSearchParams) {
    return search;
  }

  if (typeof search !== 'string' || search.length === 0) {
    return new URLSearchParams();
  }

  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
};

const isTruthyQueryValue = (value: string | null): boolean => (
  value !== null && TRUE_QUERY_VALUES.has(value.trim().toLowerCase())
);

export const resolveLegacyAdvancedOptionsVisible = (
  search?: string | URLSearchParams
): boolean => {
  const params = toSearchParams(search);

  return isTruthyQueryValue(params.get('advancedOptions'))
    || isTruthyQueryValue(params.get('devOptions'));
};
