/**
 * Guide redesign OPTIONS (2026-11-23): `?guideOptions=..&dark=1|0` writes the app's own Dark mode preference before the
 * theme boots (imported first by src/boot/main.ts). No-op on every route without `guideOptions`. Kept import-free so
 * nothing theme-dependent evaluates before the theme is chosen.
 */
if (typeof window !== 'undefined') {
  try {
    const params = new URLSearchParams(window.location.search);
    const dark = params.get('dark');
    if (params.has('guideOptions') && dark !== null) {
      window.localStorage.setItem('mazer.dark-mode.v1', dark === '1' ? 'on' : 'off');
    }
  } catch {
    // Storage blocked: the picker still works in the current theme.
  }
}
export {};
