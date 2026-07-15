export const MAZER_ICON_QUALITY_TARGET_VERSION = 'mazer-icon-quality-target-v1' as const;
export const MAZER_ICON_SOURCE_SHA256 = '55677db4dff3896979d3e00e1b9ebcb85fd9fc04f106d5a67701cee61ea467d1' as const;

export const MAZER_ICON_QUALITY_TARGET = Object.freeze({
  version: MAZER_ICON_QUALITY_TARGET_VERSION,
  materialVersion: 'mazer-cyber-arcade-material-v1',
  canonicalAsset: Object.freeze({
    repositoryPath: 'public/icons/mazer-app-icon.png',
    publicUrl: '/icons/mazer-app-icon.png',
    width: 1024,
    height: 1024,
    sha256: '91764e546b8c1488b3d48baeda927ae18600b088178e190244fb9d8ce35e2440'
  }),
  atlasSourceReferences: Object.freeze([
    Object.freeze({
      path: 'data/atlas/brand/mazer/mazer-app-icon-2026-07-09-source.png',
      sha256: MAZER_ICON_SOURCE_SHA256
    }),
    Object.freeze({
      path: 'data/atlas/ui-visual-proof/mazer/app-icon-2026-07-09/reference.png',
      sha256: MAZER_ICON_SOURCE_SHA256
    })
  ]),
  deliveryAssets: Object.freeze([
    Object.freeze({
      role: 'browser-favicon',
      repositoryPath: 'public/icons/mazer-app-icon.ico',
      publicUrl: '/icons/mazer-app-icon.ico',
      sizes: 'any',
      sha256: 'b21db31a595c828e9b8bb117f4712c8fde0a9567b9b2b65b96b6b472f708bf3d'
    }),
    Object.freeze({
      role: 'apple-touch',
      repositoryPath: 'public/icons/apple-touch-icon.png',
      publicUrl: '/icons/apple-touch-icon.png',
      sizes: '180x180',
      sha256: '10dbf07a3946d856ed9159009805e3f8bb4eb3eb2b84f3d1e0530c92ee786204'
    }),
    Object.freeze({
      role: 'pwa-standard',
      repositoryPath: 'public/icons/icon-192.png',
      publicUrl: '/icons/icon-192.png',
      sizes: '192x192',
      sha256: '8af1e22902e14098c9aff472e706384edcab472e0627631f80a530cd8dc5644e'
    }),
    Object.freeze({
      role: 'pwa-standard',
      repositoryPath: 'public/icons/icon-512.png',
      publicUrl: '/icons/icon-512.png',
      sizes: '512x512',
      sha256: '744b72e75642b07f1185a898803f5b173713a5de1684773eb6f31f6c949116ab'
    }),
    Object.freeze({
      role: 'pwa-maskable',
      repositoryPath: 'public/icons/icon-192-maskable.png',
      publicUrl: '/icons/icon-192-maskable.png',
      sizes: '192x192',
      sha256: '8af1e22902e14098c9aff472e706384edcab472e0627631f80a530cd8dc5644e'
    }),
    Object.freeze({
      role: 'pwa-maskable',
      repositoryPath: 'public/icons/icon-512-maskable.png',
      publicUrl: '/icons/icon-512-maskable.png',
      sizes: '512x512',
      sha256: '744b72e75642b07f1185a898803f5b173713a5de1684773eb6f31f6c949116ab'
    })
  ]),
  visualRules: Object.freeze([
    'deep-navy-substrate',
    'hard-cyan-and-mint-rails',
    'green-player-signal',
    'red-goal-and-direction-signal',
    'sparse-white-shine',
    'bounded-glow-with-crisp-pixel-edges'
  ])
} as const);

export const summarizeMazerIconQualityTarget = () => ({
  version: MAZER_ICON_QUALITY_TARGET.version,
  materialVersion: MAZER_ICON_QUALITY_TARGET.materialVersion,
  canonicalAsset: { ...MAZER_ICON_QUALITY_TARGET.canonicalAsset },
  atlasSourceReferences: MAZER_ICON_QUALITY_TARGET.atlasSourceReferences.map((source) => ({ ...source })),
  deliveryAssets: MAZER_ICON_QUALITY_TARGET.deliveryAssets.map((asset) => ({ ...asset })),
  visualRules: [...MAZER_ICON_QUALITY_TARGET.visualRules]
});
