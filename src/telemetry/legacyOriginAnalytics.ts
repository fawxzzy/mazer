export const MAZER_LEGACY_COMPATIBILITY_SOURCE = 'mazer_legacy_origin' as const;

export const buildMazerLegacyOriginAnalyticsPayload = () => ({
  compatibility: MAZER_LEGACY_COMPATIBILITY_SOURCE,
  event: 'compatibility_visit',
  product: 'mazer',
  route: 'app'
} as const);

export const consumeMazerLegacyOriginMarker = (value: string) => {
  const url = new URL(value);
  const matched = url.searchParams.get('compatibility') === MAZER_LEGACY_COMPATIBILITY_SOURCE;
  if (matched) {
    url.searchParams.delete('compatibility');
  }
  return {
    matched,
    replacement: `${url.pathname}${url.search}${url.hash}`
  };
};

export const installLegacyOriginAnalytics = (): void => {
  const marker = consumeMazerLegacyOriginMarker(window.location.href);
  if (!marker.matched) {
    return;
  }

  window.history.replaceState(null, '', marker.replacement);
  const endpoint = import.meta.env.VITE_FAWXZZY_ANALYTICS_URL?.trim();
  if (!endpoint) {
    return;
  }

  const body = JSON.stringify(buildMazerLegacyOriginAnalyticsPayload());
  if (navigator.sendBeacon) {
    navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
    return;
  }

  void fetch(endpoint, {
    body,
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    method: 'POST',
    mode: 'cors'
  });
};
