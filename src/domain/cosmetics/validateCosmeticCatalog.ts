import { ASSET_KINDS } from '../assets/assetManifest.ts';
import type { AssetIndex } from '../assets/assetManifest.ts';
import {
  COSMETIC_CATALOG_SCHEMA_VERSION,
  COSMETIC_RARITIES,
  DEFAULT_RESERVED_SLOT_IDS
} from './cosmeticCatalog.ts';
import type { CosmeticCatalog } from './cosmeticCatalog.ts';

export interface CosmeticCatalogViolation {
  readonly rule: string;
  readonly path: string;
  readonly message: string;
}

export interface CosmeticCatalogValidationOptions {
  /** Asset manifest ids the catalog may reference (see `buildAssetIndex`). Required: references must resolve. */
  readonly assetIndex: AssetIndex;
  /** Overrides `catalog.budget.maxEarnedItems`. The cap is data/config, never a constant in this module. */
  readonly earnedCap?: number;
  /** When provided, every earned item's `unlockRuleId` must be in this set. */
  readonly unlockRuleIds?: ReadonlySet<string>;
  /** Slot ids that must be declared. Defaults to none. */
  readonly requiredSlotIds?: readonly string[];
  /** Replaces DEFAULT_RESERVED_SLOT_IDS. */
  readonly reservedSlotIds?: readonly string[];
  /** When true, referenced assets must have status `approved` (otherwise only `deprecated` is rejected). */
  readonly requireApprovedAssets?: boolean;
}

export type CosmeticCatalogValidation =
  | { readonly ok: true; readonly catalog: CosmeticCatalog; readonly violations: readonly [] }
  | { readonly ok: false; readonly violations: readonly CosmeticCatalogViolation[] };

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const ROOT_KEYS = new Set(['schemaVersion', 'catalogId', 'budget', 'slots', 'items']);
const SLOT_KEYS = new Set(['id', 'labelKey', 'acceptedAssetKinds', 'requiresAssets', 'defaultItemId']);
const ITEM_KEYS = new Set(['id', 'slotId', 'nameKey', 'descriptionKey', 'rarity', 'source', 'assetRefs']);

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isId = (value: unknown): value is string => typeof value === 'string' && ID_PATTERN.test(value);
const v = (rule: string, path: string, message: string): CosmeticCatalogViolation => ({ rule, path, message });

const compare = (a: CosmeticCatalogViolation, b: CosmeticCatalogViolation): number => (
  a.path < b.path ? -1 : a.path > b.path ? 1
    : a.rule < b.rule ? -1 : a.rule > b.rule ? 1
      : a.message < b.message ? -1 : a.message > b.message ? 1 : 0
);

const isReserved = (id: string, reserved: readonly string[]): boolean => (
  reserved.some((entry) => id === entry || id.startsWith(`${entry}-`) || id.startsWith(`${entry}.`))
);

const countBy = (values: readonly string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
};

/** Pure, deterministic validation of an unknown value as a cosmetic catalog. Violations are sorted. */
export const validateCosmeticCatalog = (
  input: unknown,
  options: CosmeticCatalogValidationOptions
): CosmeticCatalogValidation => {
  const violations: CosmeticCatalogViolation[] = [];
  if (!isObject(input)) {
    return { ok: false, violations: [v('invalid-catalog', '$', 'catalog must be an object.')] };
  }

  for (const key of Object.keys(input)) {
    if (!ROOT_KEYS.has(key)) violations.push(v('unknown-field', '$', `unknown field "${key}".`));
  }
  if (input.schemaVersion !== COSMETIC_CATALOG_SCHEMA_VERSION) {
    violations.push(v('unsupported-schema-version', 'schemaVersion', `schemaVersion must be ${COSMETIC_CATALOG_SCHEMA_VERSION}.`));
  }
  if (!isId(input.catalogId)) violations.push(v('invalid-id', 'catalogId', 'catalogId must be a lowercase dot/dash id.'));

  const budget = input.budget;
  const declaredCap = isObject(budget) ? budget.maxEarnedItems : undefined;
  const cap = options.earnedCap ?? declaredCap;
  if (options.earnedCap === undefined && !isObject(budget)) {
    violations.push(v('missing-earned-cap', 'budget', 'budget.maxEarnedItems is required unless the earnedCap option is supplied.'));
  } else if (typeof cap !== 'number' || !Number.isInteger(cap) || cap < 0) {
    violations.push(v('invalid-earned-cap', 'budget.maxEarnedItems', 'earned cap must be a non-negative integer.'));
  }

  const rawSlots = input.slots;
  const rawItems = input.items;
  if (!Array.isArray(rawSlots)) violations.push(v('invalid-slots', 'slots', 'slots must be an array.'));
  if (!Array.isArray(rawItems)) violations.push(v('invalid-items', 'items', 'items must be an array.'));
  if (!Array.isArray(rawSlots) || !Array.isArray(rawItems)) return { ok: false, violations: violations.sort(compare) };

  const reserved = options.reservedSlotIds ?? DEFAULT_RESERVED_SLOT_IDS;
  const slotObjects = rawSlots.filter(isObject);
  const itemObjects = rawItems.filter(isObject);
  rawSlots.forEach((slot, index) => { if (!isObject(slot)) violations.push(v('invalid-slot', `slots[${index}]`, 'slot must be an object.')); });
  rawItems.forEach((item, index) => { if (!isObject(item)) violations.push(v('invalid-item', `items[${index}]`, 'item must be an object.')); });

  const slotCounts = countBy(slotObjects.filter((slot) => isText(slot.id)).map((slot) => slot.id as string));
  const itemCounts = countBy(itemObjects.filter((item) => isText(item.id)).map((item) => item.id as string));
  const slotsById = new Map<string, Json>();
  const itemsById = new Map<string, Json>();
  for (const slot of slotObjects) if (isText(slot.id) && !slotsById.has(slot.id)) slotsById.set(slot.id, slot);
  for (const item of itemObjects) if (isText(item.id) && !itemsById.has(item.id)) itemsById.set(item.id, item);

  for (const required of options.requiredSlotIds ?? []) {
    if (!slotsById.has(required)) violations.push(v('missing-required-slot', 'slots', `required slot "${required}" is not declared.`));
  }

  slotObjects.forEach((slot, index) => {
    const at = `slots[${isText(slot.id) ? slot.id : index}]`;
    for (const key of Object.keys(slot)) if (!SLOT_KEYS.has(key)) violations.push(v('unknown-field', at, `unknown field "${key}".`));
    if (!isId(slot.id)) violations.push(v('invalid-id', at, 'slot id must be a lowercase dot/dash id.'));
    else {
      if ((slotCounts.get(slot.id) ?? 0) > 1) violations.push(v('duplicate-slot-id', at, `slot id "${slot.id}" is declared ${slotCounts.get(slot.id)} times.`));
      if (isReserved(slot.id, reserved)) {
        violations.push(v('reserved-slot-id', at, `slot id "${slot.id}" is reserved; cosmetics must not introduce a public theme (decision single-canonical-theme).`));
      }
    }
    if (!isText(slot.labelKey)) violations.push(v('missing-copy-key', at, 'labelKey is required.'));
    if (typeof slot.requiresAssets !== 'boolean') violations.push(v('invalid-slot', at, 'requiresAssets must be a boolean.'));
    const kinds = slot.acceptedAssetKinds;
    if (!Array.isArray(kinds) || kinds.length === 0 || kinds.some((kind) => !(ASSET_KINDS as readonly unknown[]).includes(kind))) {
      violations.push(v('invalid-slot', at, `acceptedAssetKinds must be a non-empty array of ${ASSET_KINDS.join(', ')}.`));
    }

    const defaultItem = isText(slot.defaultItemId) ? itemsById.get(slot.defaultItemId) : undefined;
    if (!defaultItem) {
      violations.push(v('missing-default-item', at, `defaultItemId "${String(slot.defaultItemId)}" does not resolve to an item.`));
    } else {
      if (defaultItem.slotId !== slot.id) violations.push(v('default-item-wrong-slot', at, `default item "${String(slot.defaultItemId)}" belongs to slot "${String(defaultItem.slotId)}".`));
      if (!isObject(defaultItem.source) || defaultItem.source.type !== 'default') {
        violations.push(v('default-item-not-default-source', at, `default item "${String(slot.defaultItemId)}" must have source.type "default".`));
      }
    }
    if (isText(slot.id)) {
      const defaults = itemObjects.filter((item) => item.slotId === slot.id && isObject(item.source) && item.source.type === 'default');
      if (defaults.length > 1) violations.push(v('multiple-default-items', at, `slot "${slot.id}" has ${defaults.length} default-source items; exactly one is allowed.`));
    }
  });

  let earnedCount = 0;
  itemObjects.forEach((item, index) => {
    const at = `items[${isText(item.id) ? item.id : index}]`;
    for (const key of Object.keys(item)) if (!ITEM_KEYS.has(key)) violations.push(v('unknown-field', at, `unknown field "${key}".`));
    if (!isId(item.id)) violations.push(v('invalid-id', at, 'item id must be a lowercase dot/dash id.'));
    else if ((itemCounts.get(item.id) ?? 0) > 1) violations.push(v('duplicate-item-id', at, `item id "${item.id}" is declared ${itemCounts.get(item.id)} times.`));
    if (!isText(item.nameKey)) violations.push(v('missing-copy-key', at, 'nameKey is required.'));
    if (item.descriptionKey !== undefined && !isText(item.descriptionKey)) violations.push(v('missing-copy-key', at, 'descriptionKey, when present, must be non-empty.'));
    if (!(COSMETIC_RARITIES as readonly unknown[]).includes(item.rarity)) violations.push(v('invalid-rarity', at, `rarity must be one of ${COSMETIC_RARITIES.join(', ')}.`));

    const source = item.source;
    if (!isObject(source) || (source.type !== 'default' && source.type !== 'earned')) {
      violations.push(v('invalid-source', at, 'source.type must be "default" or "earned".'));
    } else if (source.type === 'earned') {
      earnedCount += 1;
      if (!isText(source.unlockRuleId)) violations.push(v('invalid-source', at, 'earned items require source.unlockRuleId.'));
      else if (options.unlockRuleIds && !options.unlockRuleIds.has(source.unlockRuleId)) {
        violations.push(v('unresolved-unlock-rule', at, `unlockRuleId "${source.unlockRuleId}" does not resolve.`));
      }
      for (const key of Object.keys(source)) if (key !== 'type' && key !== 'unlockRuleId') violations.push(v('invalid-source', at, `unknown source field "${key}".`));
    } else if (Object.keys(source).length !== 1) {
      violations.push(v('invalid-source', at, 'default source must be exactly {"type":"default"}.'));
    }

    const slot = isText(item.slotId) ? slotsById.get(item.slotId) : undefined;
    if (!slot) violations.push(v('unknown-slot', at, `slotId "${String(item.slotId)}" does not resolve to a declared slot.`));

    const refs = item.assetRefs;
    if (!isObject(refs)) {
      violations.push(v('invalid-asset-refs', at, 'assetRefs must be an object of role -> asset id (use {} for none).'));
      return;
    }
    const entries = Object.entries(refs);
    if (slot && slot.requiresAssets === true && entries.length === 0) {
      violations.push(v('missing-asset-ref', at, `slot "${String(slot.id)}" requires at least one asset reference.`));
    }
    for (const [role, assetId] of entries) {
      const refAt = `${at}.assetRefs.${role}`;
      if (!isText(role)) violations.push(v('invalid-asset-refs', refAt, 'role must be non-empty.'));
      if (!isText(assetId)) {
        violations.push(v('invalid-asset-refs', refAt, 'asset id must be a non-empty string.'));
        continue;
      }
      const asset = options.assetIndex.get(assetId);
      if (!asset) {
        violations.push(v('unresolved-asset', refAt, `asset id "${assetId}" is not in the asset manifest.`));
        continue;
      }
      if (asset.status === 'deprecated') violations.push(v('deprecated-asset', refAt, `asset "${assetId}" is deprecated.`));
      else if (options.requireApprovedAssets === true && asset.status !== 'approved') {
        violations.push(v('unapproved-asset', refAt, `asset "${assetId}" has status "${asset.status}"; approved is required.`));
      }
      if (slot && Array.isArray(slot.acceptedAssetKinds) && !slot.acceptedAssetKinds.includes(asset.kind)) {
        violations.push(v('asset-kind-not-accepted', refAt, `asset "${assetId}" is kind "${asset.kind}", not accepted by slot "${String(slot.id)}".`));
      }
    }
  });

  if (typeof cap === 'number' && Number.isInteger(cap) && cap >= 0 && earnedCount > cap) {
    violations.push(v('earned-budget-exceeded', 'items', `${earnedCount} earned items exceed the earned cap of ${cap}.`));
  }

  if (violations.length > 0) return { ok: false, violations: violations.sort(compare) };
  return { ok: true, catalog: input as unknown as CosmeticCatalog, violations: [] };
};
