import type { AssetKind } from '../assets/assetManifest.ts';

// Cosmetic catalog v1: pure data model. No ownership, selection, rendering, shop, or currency logic lives here.
// Those concerns consume this catalog by id; they must not be encoded in it.

export const COSMETIC_CATALOG_SCHEMA_VERSION = 1;

export const COSMETIC_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type CosmeticRarity = (typeof COSMETIC_RARITIES)[number];

/**
 * Slot ids (and any `<id>-...` prefixed ids) that a catalog may never declare. The decision registry
 * (`single-canonical-theme`) allows exactly one public theme, so "theme" is not a cosmetic slot.
 */
export const DEFAULT_RESERVED_SLOT_IDS = ['theme'] as const;

export interface CosmeticSlot {
  readonly id: string;
  /** Copy key resolved by the presentation layer; never display text. */
  readonly labelKey: string;
  /** Asset kinds an item in this slot may reference. */
  readonly acceptedAssetKinds: readonly AssetKind[];
  /** When true every item in the slot must reference at least one asset. */
  readonly requiresAssets: boolean;
  /** The item every account owns and falls back to. Must be a `default`-source item in this slot. */
  readonly defaultItemId: string;
}

export interface DefaultCosmeticSource {
  readonly type: 'default';
}

export interface EarnedCosmeticSource {
  readonly type: 'earned';
  /** Reference to an unlock rule owned elsewhere. The catalog stores the reference, never the rule. */
  readonly unlockRuleId: string;
}

export type CosmeticSource = DefaultCosmeticSource | EarnedCosmeticSource;

export interface CosmeticItem {
  readonly id: string;
  readonly slotId: string;
  readonly nameKey: string;
  readonly descriptionKey?: string;
  readonly rarity: CosmeticRarity;
  readonly source: CosmeticSource;
  /** Render role (for example "primary") -> asset manifest id. Roles are free-form, ids must resolve. */
  readonly assetRefs: Readonly<Record<string, string>>;
}

export interface CosmeticCatalogBudget {
  /** Maximum number of `earned` items across the whole catalog. */
  readonly maxEarnedItems: number;
}

export interface CosmeticCatalog {
  readonly schemaVersion: typeof COSMETIC_CATALOG_SCHEMA_VERSION;
  readonly catalogId: string;
  readonly budget: CosmeticCatalogBudget;
  readonly slots: readonly CosmeticSlot[];
  readonly items: readonly CosmeticItem[];
}
