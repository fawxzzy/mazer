const IGNORED_QUERY_PARAMS = new Set([
  'runtimeDiagnostics',
  'v'
]);

const parseRouteUrl = (value) => {
  const raw = typeof value === 'string' && value.trim().length > 0 ? value.trim() : '/';
  return new URL(raw.startsWith('http') ? raw : raw.startsWith('/') ? raw : `/${raw}`, 'https://mazer.local');
};

const normalizeOverlay = (value) => {
  const normalized = typeof value === 'string' && value.trim().length > 0
    ? value.trim().toLowerCase()
    : 'none';
  return normalized;
};

const resolveExpectedMode = (routeUrl) => (
  routeUrl.searchParams.get('mode') === 'play' ? 'play' : 'menu'
);

const resolveExpectedOverlay = (routeUrl) => (
  normalizeOverlay(routeUrl.searchParams.get('overlay'))
);

const collectExpectedParams = (routeUrl) => {
  const params = [];
  routeUrl.searchParams.forEach((value, key) => {
    if (!IGNORED_QUERY_PARAMS.has(key)) {
      params.push({ key, value });
    }
  });
  return params;
};

const readDiagnosticsMode = (diagnostics) => (
  diagnostics?.runtime?.mode
  ?? diagnostics?.surface?.mode
  ?? null
);

const readDiagnosticsOverlay = (diagnostics) => (
  diagnostics?.runtime?.overlay
  ?? diagnostics?.surface?.overlay
  ?? null
);

const readViewportWidth = (viewport) => (
  Number.isFinite(viewport?.width) ? Number(viewport.width) : null
);

const readViewportHeight = (viewport) => (
  Number.isFinite(viewport?.height) ? Number(viewport.height) : null
);

export const buildVisualScreenContract = ({
  expectedRoute,
  actualUrl,
  viewport,
  diagnostics,
  expectedMode,
  expectedOverlay
} = {}) => {
  const expectedRouteUrl = parseRouteUrl(expectedRoute);
  const actualRouteUrl = parseRouteUrl(actualUrl);
  const resolvedExpectedMode = typeof expectedMode === 'string' && expectedMode.length > 0
    ? expectedMode
    : resolveExpectedMode(expectedRouteUrl);
  const resolvedExpectedOverlay = typeof expectedOverlay === 'string' && expectedOverlay.length > 0
    ? normalizeOverlay(expectedOverlay)
    : resolveExpectedOverlay(expectedRouteUrl);
  const expectedParams = collectExpectedParams(expectedRouteUrl);
  const actualMode = readDiagnosticsMode(diagnostics);
  const actualOverlay = normalizeOverlay(readDiagnosticsOverlay(diagnostics));
  const expectedViewportWidth = readViewportWidth(viewport);
  const expectedViewportHeight = readViewportHeight(viewport);
  const actualViewportWidth = readViewportWidth(diagnostics?.viewport);
  const actualViewportHeight = readViewportHeight(diagnostics?.viewport);
  const failures = [];

  if (actualRouteUrl.pathname !== expectedRouteUrl.pathname) {
    failures.push({
      code: 'screen_path_mismatch',
      expected: expectedRouteUrl.pathname,
      actual: actualRouteUrl.pathname
    });
  }

  for (const { key, value } of expectedParams) {
    if (actualRouteUrl.searchParams.get(key) !== value) {
      failures.push({
        code: 'screen_query_mismatch',
        key,
        expected: value,
        actual: actualRouteUrl.searchParams.get(key)
      });
    }
  }

  if (actualMode !== resolvedExpectedMode) {
    failures.push({
      code: 'screen_mode_mismatch',
      expected: resolvedExpectedMode,
      actual: actualMode
    });
  }

  if (actualOverlay !== resolvedExpectedOverlay) {
    failures.push({
      code: 'screen_overlay_mismatch',
      expected: resolvedExpectedOverlay,
      actual: actualOverlay
    });
  }

  if (
    expectedViewportWidth !== null
    && actualViewportWidth !== null
    && expectedViewportWidth !== actualViewportWidth
  ) {
    failures.push({
      code: 'screen_viewport_width_mismatch',
      expected: expectedViewportWidth,
      actual: actualViewportWidth
    });
  }

  if (
    expectedViewportHeight !== null
    && actualViewportHeight !== null
    && expectedViewportHeight !== actualViewportHeight
  ) {
    failures.push({
      code: 'screen_viewport_height_mismatch',
      expected: expectedViewportHeight,
      actual: actualViewportHeight
    });
  }

  return {
    pass: failures.length === 0,
    expected: {
      route: `${expectedRouteUrl.pathname}${expectedRouteUrl.search}`,
      mode: resolvedExpectedMode,
      overlay: resolvedExpectedOverlay,
      viewport: viewport ?? null
    },
    actual: {
      url: actualUrl ?? null,
      path: actualRouteUrl.pathname,
      mode: actualMode,
      overlay: actualOverlay,
      viewport: diagnostics?.viewport ?? null
    },
    failures
  };
};

export const assertVisualScreenContract = (contract) => {
  if (contract?.pass === true) {
    return contract;
  }

  const failures = Array.isArray(contract?.failures)
    ? contract.failures.map((failure) => `${failure.code}:${failure.expected ?? failure.key}->${failure.actual ?? 'missing'}`).join(', ')
    : 'unknown';
  const error = new Error(`Visual capture screen contract failed: ${failures}`);
  error.screenContract = contract;
  throw error;
};
