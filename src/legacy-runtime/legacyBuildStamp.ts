import { resolveLegacyBuildId } from './legacyBuildId';

/**
 * MAZER-FLOW-019: the build stamp line at the foot of both Settings sheets, so a phone check can confirm which build
 * is running. Two parts, both from the build itself (no network call):
 *  - build: the hashed name of the main bundle the page loaded (`main-D4otmjLQ`), read from the page's own module
 *    script tag. It is the same id the release notes and board events record as the deployed build.
 *  - sha: the short commit sha injected at build time (`__MAZER_BUILD_ID__`, vite.config.ts define, shared with
 *    MAZER-FB-001's legacyBuildId.ts).
 * Dev servers load /src/main.ts, so the build part reads `dev`; a missing sha reads `no sha`.
 */

/** `main-<hash>` from a script URL like `/assets/main-D4otmjLQ.js` (absolute or relative, query ignored). */
const MAIN_BUNDLE_PATTERN = /(?:^|\/)assets\/(main-[A-Za-z0-9_-]{4,64})\.js(?:[?#].*)?$/;

/** Characters of the commit sha shown (the repo's `git log --oneline` width). */
export const LEGACY_BUILD_STAMP_SHA_CHARS = 8;

export const LEGACY_BUILD_STAMP_DEV_LABEL = 'dev';
export const LEGACY_BUILD_STAMP_NO_SHA_LABEL = 'no sha';

export interface LegacyBuildStamp {
  /** `main-<hash>` of the loaded bundle, or null (dev server / unknown page). */
  readonly bundleId: string | null;
  /** Short commit sha, or null when the build had none. */
  readonly shortSha: string | null;
}

/** First `main-<hash>` bundle id among the given script URLs, or null. */
export const resolveLegacyMainBundleId = (scriptUrls: readonly (string | null | undefined)[]): string | null => {
  for (const url of scriptUrls) {
    if (typeof url !== 'string') {
      continue;
    }
    const match = MAIN_BUNDLE_PATTERN.exec(url.trim());
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
};

export const toLegacyShortSha = (buildId: string | null): string | null => (
  buildId !== null && /^[0-9a-f]{7,64}$/i.test(buildId)
    ? buildId.slice(0, LEGACY_BUILD_STAMP_SHA_CHARS).toLowerCase()
    : null
);

/** The one line the sheet shows, e.g. `Build main-D4otmjLQ · 71757912`. */
export const formatLegacyBuildStamp = (stamp: LegacyBuildStamp): string => (
  `Build ${stamp.bundleId ?? LEGACY_BUILD_STAMP_DEV_LABEL} · ${stamp.shortSha ?? LEGACY_BUILD_STAMP_NO_SHA_LABEL}`
);

interface ScriptDocumentLike {
  querySelectorAll(selector: string): ArrayLike<{ getAttribute(name: string): string | null }>;
}

/** Reads the stamp from the running page (module script tags) and the build-time sha define. */
export const readLegacyBuildStamp = (
  doc: ScriptDocumentLike | null = typeof document === 'undefined' ? null : document,
  buildId: string | null = resolveLegacyBuildId()
): LegacyBuildStamp => {
  const urls: string[] = [];
  if (doc !== null) {
    const scripts = doc.querySelectorAll('script[src]');
    for (let index = 0; index < scripts.length; index += 1) {
      const src = scripts[index]?.getAttribute('src');
      if (src) {
        urls.push(src);
      }
    }
  }
  return {
    bundleId: resolveLegacyMainBundleId(urls),
    shortSha: toLegacyShortSha(buildId)
  };
};

let cachedLegacyBuildStampText: string | null = null;

/** The formatted line for the running page, computed once (the page and the build never change while it runs). */
export const resolveLegacyBuildStampText = (): string => {
  cachedLegacyBuildStampText ??= formatLegacyBuildStamp(readLegacyBuildStamp());
  return cachedLegacyBuildStampText;
};
