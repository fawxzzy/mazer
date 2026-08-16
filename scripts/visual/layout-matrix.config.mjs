export const LAYOUT_MATRIX_VIEWPORTS = Object.freeze({
  'phone-portrait': Object.freeze({ id: 'phone-portrait', label: 'Phone Portrait', width: 390, height: 844 }),
  'phone-tall': Object.freeze({ id: 'phone-tall', label: 'Phone Tall', width: 430, height: 932 }),
  'phone-landscape': Object.freeze({ id: 'phone-landscape', label: 'Phone Landscape', width: 844, height: 390 }),
  'tablet-portrait': Object.freeze({ id: 'tablet-portrait', label: 'Tablet Portrait', width: 768, height: 1024 }),
  'tablet-landscape': Object.freeze({ id: 'tablet-landscape', label: 'Tablet Landscape', width: 1024, height: 768 }),
  laptop: Object.freeze({ id: 'laptop', label: 'Laptop', width: 1366, height: 768 }),
  desktop: Object.freeze({ id: 'desktop', label: 'Desktop', width: 1440, height: 900 }),
  'desktop-wide': Object.freeze({ id: 'desktop-wide', label: 'Desktop Wide', width: 1920, height: 1080 }),
  ultrawide: Object.freeze({ id: 'ultrawide', label: 'Ultrawide', width: 2560, height: 1080 }),
  'short-desktop': Object.freeze({ id: 'short-desktop', label: 'Short Desktop', width: 1280, height: 720 }),
  'iphone-dynamic-island': Object.freeze({ id: 'iphone-dynamic-island', label: 'iPhone Dynamic Island', width: 393, height: 852 }),
  'android-cutout': Object.freeze({ id: 'android-cutout', label: 'Android Cutout', width: 412, height: 915 }),
  'macos-browser': Object.freeze({ id: 'macos-browser', label: 'macOS Browser', width: 1440, height: 900 }),
  'windows-browser': Object.freeze({ id: 'windows-browser', label: 'Windows Browser', width: 1365, height: 768 })
});

export const LAYOUT_MATRIX_PRESET_GROUPS = Object.freeze({
  core: Object.freeze([
    'phone-portrait',
    'phone-tall',
    'phone-landscape',
    'tablet-portrait',
    'tablet-landscape',
    'laptop',
    'desktop',
    'desktop-wide'
  ]),
  extended: Object.freeze([
    'ultrawide',
    'short-desktop'
  ]),
  platform: Object.freeze([
    'iphone-dynamic-island',
    'android-cutout',
    'macos-browser',
    'windows-browser'
  ])
});

const appendQueryParam = (route, key, value) => {
  const normalizedRoute = typeof route === 'string' && route.trim().length > 0
    ? route.trim()
    : '/';
  const url = new URL(normalizedRoute.startsWith('/') ? normalizedRoute : `/${normalizedRoute}`, 'https://mazer.local');
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
};

export const resolveLayoutMatrixViewports = (presetGroup = 'core') => {
  const normalizedPresetGroup = typeof presetGroup === 'string' ? presetGroup.trim().toLowerCase() : 'core';
  const selectedIds = normalizedPresetGroup === 'all'
    ? [...LAYOUT_MATRIX_PRESET_GROUPS.core, ...LAYOUT_MATRIX_PRESET_GROUPS.extended, ...LAYOUT_MATRIX_PRESET_GROUPS.platform]
    : LAYOUT_MATRIX_PRESET_GROUPS[normalizedPresetGroup] ?? LAYOUT_MATRIX_PRESET_GROUPS.core;

  return selectedIds.map((id) => {
    const viewport = LAYOUT_MATRIX_VIEWPORTS[id];
    if (!viewport) {
      throw new Error(`Unknown layout matrix viewport preset: ${id}`);
    }

    return viewport;
  });
};

export const resolveLayoutMatrixRoute = (viewport, explicitRoute, options = {}) => {
  const design = typeof options?.design === 'string' ? options.design.trim().toLowerCase() : null;

  if (typeof explicitRoute === 'string' && explicitRoute.trim().length > 0) {
    const route = explicitRoute.trim();
    return design === 'recovery'
      ? appendQueryParam(route, 'design', 'recovery')
      : route;
  }

  if (!viewport || typeof viewport.id !== 'string') {
    return design === 'recovery'
      ? appendQueryParam('/', 'design', 'recovery')
      : '/';
  }

  if (
    viewport.id.startsWith('phone-')
    || viewport.id.startsWith('tablet-')
    || viewport.id === 'iphone-dynamic-island'
    || viewport.id === 'android-cutout'
  ) {
    const route = '/?profile=mobile&theme=aurora';
    return design === 'recovery'
      ? appendQueryParam(route, 'design', 'recovery')
      : route;
  }

  if (
    viewport.id === 'desktop-wide'
    || viewport.id === 'ultrawide'
  ) {
    const route = '/?profile=tv&theme=noir';
    return design === 'recovery'
      ? appendQueryParam(route, 'design', 'recovery')
      : route;
  }

  return design === 'recovery'
    ? appendQueryParam('/', 'design', 'recovery')
    : '/';
};
