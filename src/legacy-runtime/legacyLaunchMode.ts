export type LegacyLaunchMode = 'menu' | 'play';

const toSearchParams = (search: string | null | undefined): URLSearchParams => {
  if (typeof search !== 'string' || search.length === 0) {
    return new URLSearchParams();
  }

  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
};

export const resolveInitialRuntimeMode = (search: string | null | undefined): LegacyLaunchMode => (
  toSearchParams(search).get('mode') === 'play' ? 'play' : 'menu'
);
