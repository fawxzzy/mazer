# Mazer Cosmetic Catalog Contract (v1)

Data model and validator for the `mazer-data-driven-cosmetic-theme-catalog` card. This is a foundation only: no UI,
no runtime wiring, no ownership/selection state, no shop, currency, or unlock-cost logic.

- Model: `src/domain/cosmetics/cosmeticCatalog.ts`
- Validator: `src/domain/cosmetics/validateCosmeticCatalog.ts` (`validateCosmeticCatalog(input, options)`)
- Asset references resolve against the asset manifest (`docs/assets/ASSET_IMPORT.md`, `buildAssetIndex`)
- Example data (tests only): `tests/fixtures/cosmetics/example-catalog.json`

## Shape

A catalog has `schemaVersion`, `catalogId`, `budget.maxEarnedItems`, `slots[]`, and `items[]`.

- Slot: `id`, `labelKey`, `acceptedAssetKinds`, `requiresAssets`, `defaultItemId`. Slots are data, so a new
  category (trail, pulse, path, coin, sound, ...) is a new slot entry, not a code branch.
- Item: `id`, `slotId`, `nameKey`, optional `descriptionKey`, `rarity`, `source`, `assetRefs` (render role to asset id).
  `source` is `{ "type": "default" }` or `{ "type": "earned", "unlockRuleId": "<id>" }`. The unlock rule is a
  reference to a rule owned elsewhere; this catalog stores no rule bodies, costs, or prices.
- Copy is by key (`labelKey`, `nameKey`), never display text.

Ownership, selected state, and rendering are separate concerns that consume the catalog by id.

## Validator rules

Violations are sorted by path, rule, then message (deterministic). Rules: `unsupported-schema-version`,
`unknown-field`, `invalid-id`, `duplicate-slot-id`, `duplicate-item-id`, `reserved-slot-id`,
`missing-required-slot`, `missing-default-item`, `default-item-wrong-slot`, `default-item-not-default-source`,
`multiple-default-items`, `unknown-slot`, `invalid-rarity`, `invalid-source`, `unresolved-unlock-rule`,
`missing-asset-ref`, `unresolved-asset`, `deprecated-asset`, `unapproved-asset`, `asset-kind-not-accepted`,
`missing-earned-cap`, `invalid-earned-cap`, `earned-budget-exceeded`, `missing-copy-key`, `invalid-asset-refs`.

"Slot map complete" means every declared slot has exactly one resolvable `default` item in that slot, every item
sits in a declared slot, and any `requiredSlotIds` the caller passes are present.

## Earned-cosmetic budget

The product budget (twelve earned cosmetics) is configuration, not a constant. The cap comes from
`budget.maxEarnedItems` in the catalog, or the `earnedCap` option, which wins. With neither the validator fails
(`missing-earned-cap`). The count is of `earned` items across the whole catalog.

## Single public theme rule

`docs/contracts/mazer-ui-rework-decision-registry.v1.json` decision `single-canonical-theme` allows exactly one
public player-facing theme, enforced by `scripts/check-decision-registry.mjs` over `themes.registry`. The catalog
is compatible by construction:

- There is no `theme` slot. Slot ids `theme`, `theme-*`, and `theme.*` are rejected (`reserved-slot-id`;
  override list: `reservedSlotIds`). The card's "theme" category is intentionally not representable here.
- The catalog never reads or writes `themes.registry`. Cosmetic items are non-theme items (player, trail,
  background, and similar); they do not change brand identity.
- Adding a second public theme would first require changing the decision registry and its checker, not this catalog.

Tests run `collectDecisionRegistryViolations` against the shipped registry alongside the catalog tests, and
`node -e "import('./scripts/check-decision-registry.mjs').then(m => m.checkDecisionRegistry())"` exercises the full check.
(The checker's own CLI entry guard compares `import.meta.url` to `file://` + `argv[1]`, which does not match on
Windows, so running it directly there prints nothing; that is a pre-existing quirk, unchanged here.)

## Not covered

- No production catalog exists yet; only the test fixture.
- No inventory rendering, visual proof, ownership or selection store, or unlock-rule registry.
- Whether the product budget is exactly twelve is a configuration decision for the real catalog, not this module.
