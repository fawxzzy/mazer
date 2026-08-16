export const LEGACY_BROWSER_MOBILE_PARITY_MIN_WIDTH = 431;
export const LEGACY_BROWSER_MOBILE_PARITY_MAX_WIDTH = 600;

export interface LegacyBrowserMobileParityRuntime {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: { maxTouchPoints?: number };
}

export const shouldUseLegacyBrowserMobileParity = (
  viewport: { height: number; width: number },
  runtime: LegacyBrowserMobileParityRuntime | undefined = typeof window === 'undefined' ? undefined : window
): boolean => {
  if (
    viewport.height <= viewport.width
    || viewport.width < LEGACY_BROWSER_MOBILE_PARITY_MIN_WIDTH
    || viewport.width > LEGACY_BROWSER_MOBILE_PARITY_MAX_WIDTH
  ) {
    return false;
  }

  const hasTouchPoints = (runtime?.navigator?.maxTouchPoints ?? 0) > 0;
  let hasCoarsePointer = false;
  try {
    hasCoarsePointer = runtime?.matchMedia?.('(pointer: coarse)').matches ?? false;
  } catch {
    hasCoarsePointer = false;
  }

  return !hasTouchPoints && !hasCoarsePointer;
};
