export const MAZER_ICON_QUALITY_TARGET_VERSION = 'mazer-icon-quality-target-v3' as const;
export const MAZER_ICON_CACHE_VERSION = 'mazer-site-icon-v1' as const;
export const MAZER_ICON_SOURCE_SHA256 = '91764e546b8c1488b3d48baeda927ae18600b088178e190244fb9d8ce35e2440' as const;

export const MAZER_ICON_QUALITY_TARGET = Object.freeze({
  version: MAZER_ICON_QUALITY_TARGET_VERSION,
  cacheVersion: MAZER_ICON_CACHE_VERSION,
  materialVersion: 'mazer-precision-arcade-material-v2',
  sourceMaster: Object.freeze({
    repositoryPath: 'src/brand/source-art/mazer-app-icon-master.png',
    width: 1024,
    height: 1024,
    bytes: 934_398,
    sha256: MAZER_ICON_SOURCE_SHA256
  }),
  generator: Object.freeze({
    repositoryPath: 'scripts/brand/generate-mazer-icons.mjs',
    command: 'npm run brand:icons',
    checkCommand: 'npm run brand:icons:check',
    implementation: 'sharp-lanczos3-site-icon-png-and-png-ico-v2'
  }),
  canonicalAsset: Object.freeze({
    repositoryPath: 'public/icons/mazer-app-icon.png',
    publicUrl: `/icons/mazer-app-icon.png?v=${MAZER_ICON_CACHE_VERSION}`,
    width: 1024,
    height: 1024,
    bytes: 934_398,
    sha256: MAZER_ICON_SOURCE_SHA256,
    derivation: 'byte-identical-copy'
  }),
  deliveryAssets: Object.freeze([
    Object.freeze({
      role: 'browser-default-favicon',
      repositoryPath: 'public/favicon.ico',
      publicUrl: `/favicon.ico?v=${MAZER_ICON_CACHE_VERSION}`,
      sizes: '16x16 32x32 48x48',
      sha256: 'ab605e8596246087a1dae114c12ab360136c364bf57d50b24a7efdd80d3b11ba',
      derivation: 'cropped-rounded-lanczos3-png-ico'
    }),
    Object.freeze({
      role: 'windows-shortcut',
      repositoryPath: 'public/icons/mazer-app-icon.ico',
      publicUrl: `/icons/mazer-app-icon.ico?v=${MAZER_ICON_CACHE_VERSION}`,
      sizes: '16x16 32x32 48x48',
      sha256: 'ab605e8596246087a1dae114c12ab360136c364bf57d50b24a7efdd80d3b11ba',
      derivation: 'cropped-rounded-lanczos3-png-ico'
    }),
    Object.freeze({
      role: 'apple-touch',
      repositoryPath: 'public/icons/apple-touch-icon.png',
      publicUrl: `/icons/apple-touch-icon.png?v=${MAZER_ICON_CACHE_VERSION}`,
      sizes: '180x180',
      sha256: '75029cc71bb2fefbcae636f2496fe99a3b229fc42223107d2d1834710c834c45',
      derivation: 'lanczos3-resize'
    }),
    Object.freeze({
      role: 'pwa-standard',
      repositoryPath: 'public/icons/icon-192.png',
      publicUrl: `/icons/icon-192.png?v=${MAZER_ICON_CACHE_VERSION}`,
      sizes: '192x192',
      sha256: 'cf8f46d880655b987bd10d9d371117525043cf842d7cb10270e741a653f30785',
      derivation: 'lanczos3-resize'
    }),
    Object.freeze({
      role: 'pwa-standard',
      repositoryPath: 'public/icons/icon-512.png',
      publicUrl: `/icons/icon-512.png?v=${MAZER_ICON_CACHE_VERSION}`,
      sizes: '512x512',
      sha256: '2accb4caf909e8a85e47ddda4611f4b350588ee6b4ebe50b999ea2026bed767a',
      derivation: 'lanczos3-resize'
    }),
    Object.freeze({
      role: 'pwa-maskable',
      repositoryPath: 'public/icons/icon-192-maskable.png',
      publicUrl: `/icons/icon-192-maskable.png?v=${MAZER_ICON_CACHE_VERSION}`,
      sizes: '192x192',
      sha256: '19bc5c22e17ba4bef417776182381776537fa6b962285f2f392058256cc17c38',
      derivation: 'lanczos3-resize-with-safe-padding'
    }),
    Object.freeze({
      role: 'pwa-maskable',
      repositoryPath: 'public/icons/icon-512-maskable.png',
      publicUrl: `/icons/icon-512-maskable.png?v=${MAZER_ICON_CACHE_VERSION}`,
      sizes: '512x512',
      sha256: '2b403b4d1375ec453b36c05113b11a4cf071d7cbf0e1e4ea1178dcab7fdde9ad',
      derivation: 'lanczos3-resize-with-safe-padding'
    })
  ]),
  maskablePolicy: Object.freeze({
    background: '#000000',
    guaranteedSafeCircleDiameterRatio: 0.8,
    completeVisibleArtFitsSafeCircle: true
  }),
  intentionalConsumers: Object.freeze([
    'browser-favicon',
    'pwa-install-metadata',
    'apple-touch',
    'windows-shortcut',
    'watch-pass-browser-metadata',
    'social-preview-app-image-composition',
    'boot-loader-inline-icon',
    'ios-launch-art',
    'workbox-precache'
  ]),
  supersededEvidence: Object.freeze([
    Object.freeze({
      path: 'data/atlas/brand/mazer/mazer-app-icon-2026-07-09-source.png',
      sha256: '55677db4dff3896979d3e00e1b9ebcb85fd9fc04f106d5a67701cee61ea467d1',
      authoritative: false
    }),
    Object.freeze({
      path: 'data/atlas/ui-visual-proof/mazer/app-icon-2026-07-09/reference.png',
      sha256: '55677db4dff3896979d3e00e1b9ebcb85fd9fc04f106d5a67701cee61ea467d1',
      authoritative: false
    })
  ]),
  visualRules: Object.freeze([
    'site-app-image-is-the-only-master',
    'preserve-frame-maze-and-wordmark',
    'high-quality-lanczos3-downsampling',
    'maskable-safe-zone-padding',
    'no-competing-authoritative-artwork'
  ])
} as const);

export const summarizeMazerIconQualityTarget = () => ({
  version: MAZER_ICON_QUALITY_TARGET.version,
  cacheVersion: MAZER_ICON_QUALITY_TARGET.cacheVersion,
  materialVersion: MAZER_ICON_QUALITY_TARGET.materialVersion,
  sourceMaster: { ...MAZER_ICON_QUALITY_TARGET.sourceMaster },
  generator: { ...MAZER_ICON_QUALITY_TARGET.generator },
  canonicalAsset: { ...MAZER_ICON_QUALITY_TARGET.canonicalAsset },
  deliveryAssets: MAZER_ICON_QUALITY_TARGET.deliveryAssets.map((asset) => ({ ...asset })),
  maskablePolicy: { ...MAZER_ICON_QUALITY_TARGET.maskablePolicy },
  intentionalConsumers: [...MAZER_ICON_QUALITY_TARGET.intentionalConsumers],
  supersededEvidence: MAZER_ICON_QUALITY_TARGET.supersededEvidence.map((asset) => ({ ...asset })),
  visualRules: [...MAZER_ICON_QUALITY_TARGET.visualRules]
});
