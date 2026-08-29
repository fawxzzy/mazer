export const MAZER_ICON_QUALITY_TARGET_VERSION = 'mazer-icon-quality-target-v2' as const;
export const MAZER_ICON_CACHE_VERSION = 'mazer-final-icon-v2' as const;
export const MAZER_ICON_SOURCE_SHA256 = 'ede90e596682795d10f97bed615071ca1f60e08e290eacf1ea143006df914d78' as const;

export const MAZER_ICON_QUALITY_TARGET = Object.freeze({
  version: MAZER_ICON_QUALITY_TARGET_VERSION,
  cacheVersion: MAZER_ICON_CACHE_VERSION,
  materialVersion: 'mazer-precision-arcade-material-v2',
  sourceMaster: Object.freeze({
    repositoryPath: 'src/brand/source-art/mazer-app-icon-master.png',
    width: 1024,
    height: 1024,
    bytes: 1_173_366,
    sha256: MAZER_ICON_SOURCE_SHA256
  }),
  generator: Object.freeze({
    repositoryPath: 'scripts/brand/generate-mazer-icons.mjs',
    command: 'npm run brand:icons',
    checkCommand: 'npm run brand:icons:check',
    implementation: 'sharp-lanczos3-fixed-png-and-png-ico-v1'
  }),
  canonicalAsset: Object.freeze({
    repositoryPath: 'public/icons/mazer-app-icon.png',
    publicUrl: `/icons/mazer-app-icon.png?v=${MAZER_ICON_CACHE_VERSION}`,
    width: 1024,
    height: 1024,
    bytes: 1_173_366,
    sha256: MAZER_ICON_SOURCE_SHA256,
    derivation: 'byte-identical-copy'
  }),
  deliveryAssets: Object.freeze([
    Object.freeze({
      role: 'browser-default-favicon',
      repositoryPath: 'public/favicon.ico',
      publicUrl: `/favicon.ico?v=${MAZER_ICON_CACHE_VERSION}`,
      sizes: '16x16 32x32 48x48 64x64 128x128 256x256',
      sha256: '050a42199c7762f21508df8d53d3cd40eaa8086543de448f3e0b3bc7ae1e43fc',
      derivation: 'lanczos3-png-ico'
    }),
    Object.freeze({
      role: 'windows-shortcut',
      repositoryPath: 'public/icons/mazer-app-icon.ico',
      publicUrl: `/icons/mazer-app-icon.ico?v=${MAZER_ICON_CACHE_VERSION}`,
      sizes: '16x16 32x32 48x48 64x64 128x128 256x256',
      sha256: '050a42199c7762f21508df8d53d3cd40eaa8086543de448f3e0b3bc7ae1e43fc',
      derivation: 'lanczos3-png-ico'
    }),
    Object.freeze({
      role: 'apple-touch',
      repositoryPath: 'public/icons/apple-touch-icon.png',
      publicUrl: `/icons/apple-touch-icon.png?v=${MAZER_ICON_CACHE_VERSION}`,
      sizes: '180x180',
      sha256: '337c61c2b6fd2c1dd6c2e67e92b5b596137e456e88605afc2edc510c66fc3395',
      derivation: 'lanczos3-resize'
    }),
    Object.freeze({
      role: 'pwa-standard',
      repositoryPath: 'public/icons/icon-192.png',
      publicUrl: `/icons/icon-192.png?v=${MAZER_ICON_CACHE_VERSION}`,
      sizes: '192x192',
      sha256: 'f7195a659b978ffb790202925a038b991194f69882dda99ebffb7f4b7b6e5279',
      derivation: 'lanczos3-resize'
    }),
    Object.freeze({
      role: 'pwa-standard',
      repositoryPath: 'public/icons/icon-512.png',
      publicUrl: `/icons/icon-512.png?v=${MAZER_ICON_CACHE_VERSION}`,
      sizes: '512x512',
      sha256: '50461c1f1b370f45f20492149ba3480c07be1d68abcfabe1050e064710f0d0c9',
      derivation: 'lanczos3-resize'
    }),
    Object.freeze({
      role: 'pwa-maskable',
      repositoryPath: 'public/icons/icon-192-maskable.png',
      publicUrl: `/icons/icon-192-maskable.png?v=${MAZER_ICON_CACHE_VERSION}`,
      sizes: '192x192',
      sha256: '1c134cc6ec2f8656f8af4d4e351ba65b491fed60ebbb2609c8ccf7bb56b78b80',
      derivation: 'lanczos3-resize-with-safe-padding'
    }),
    Object.freeze({
      role: 'pwa-maskable',
      repositoryPath: 'public/icons/icon-512-maskable.png',
      publicUrl: `/icons/icon-512-maskable.png?v=${MAZER_ICON_CACHE_VERSION}`,
      sizes: '512x512',
      sha256: 'c28062ea9de69856558be5cf499cc616fb1e90177df0ba966d90101ec9a8d102',
      derivation: 'lanczos3-resize-with-safe-padding'
    })
  ]),
  maskablePolicy: Object.freeze({
    background: '#000000',
    guaranteedSafeCircleDiameterRatio: 0.8,
    completeMasterFitsSafeCircle: true
  }),
  intentionalConsumers: Object.freeze([
    'browser-favicon',
    'pwa-install-metadata',
    'apple-touch',
    'windows-shortcut',
    'watch-pass-browser-metadata',
    'social-preview-existing-app-icon-consumer',
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
    }),
    Object.freeze({ path: 'public/icons/mazer-emblem.ico', authoritative: false }),
    Object.freeze({ path: 'public/icons/mazer-emblem.svg', authoritative: false })
  ]),
  visualRules: Object.freeze([
    'locked-final-master-no-redesign',
    'preserve-rainbow-frame-and-central-maze',
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
