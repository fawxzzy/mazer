// Types for the Mazer handcrafted-asset manifest (docs/contracts/mazer-asset-manifest.v1.schema.json).
// File-level validation (existence, hashes, sizes) lives in scripts/assets/validate-asset-manifest.mjs;
// this module only describes the shape and offers a pure id index for consumers such as the cosmetic catalog.

export const ASSET_MANIFEST_SCHEMA_VERSION = 1;

export const ASSET_KINDS = ['icon', 'image', 'material', 'animation', 'audio', 'font'] as const;
export const ASSET_FORMATS = ['svg', 'png', 'webp', 'jpg', 'gif', 'webm', 'ogg', 'mp3', 'm4a', 'woff2', 'woff'] as const;
export const ASSET_STATUSES = ['draft', 'review', 'approved', 'deprecated'] as const;
export const ASSET_ORIGINS = ['handcrafted', 'ai-assisted', 'third-party'] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];
export type AssetFormat = (typeof ASSET_FORMATS)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type AssetOrigin = (typeof ASSET_ORIGINS)[number];

export interface AssetDimensions {
  readonly width: number;
  readonly height: number;
}

export interface AssetSource {
  readonly origin: AssetOrigin;
  readonly reference: string;
  /** ISO calendar date, YYYY-MM-DD. */
  readonly createdOn: string;
}

export interface AssetLicense {
  readonly id: string;
  readonly holder?: string;
}

export interface AssetManifestEntry {
  readonly id: string;
  readonly kind: AssetKind;
  /** POSIX relative path from the manifest directory. */
  readonly path: string;
  readonly format: AssetFormat;
  readonly bytes: number;
  readonly sha256: string;
  readonly dimensions?: AssetDimensions;
  readonly source: AssetSource;
  readonly license: AssetLicense;
  readonly author: string;
  readonly status: AssetStatus;
}

export interface AssetManifest {
  readonly schemaVersion: typeof ASSET_MANIFEST_SCHEMA_VERSION;
  readonly manifestId?: string;
  readonly assets: readonly AssetManifestEntry[];
}

/** The slice of a manifest entry that consumers need to resolve a reference. */
export interface AssetIndexEntry {
  readonly id: string;
  readonly kind: AssetKind;
  readonly status: AssetStatus;
}

export type AssetIndex = ReadonlyMap<string, AssetIndexEntry>;

/** Builds an id -> {kind,status} index. Assumes the manifest already passed the validator (ids are unique). */
export const buildAssetIndex = (manifest: Pick<AssetManifest, 'assets'>): AssetIndex => new Map(
  manifest.assets.map((asset) => [asset.id, { id: asset.id, kind: asset.kind, status: asset.status }] as const)
);
