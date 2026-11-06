# Handcrafted Asset Import

How to author a handcrafted Mazer asset (icon, image, material, animation, audio, font), describe it in a
manifest, and prove it with the validator. This is the source-of-truth workflow for the
`mazer-handcrafted-asset-authoring-import-workflow` card; it does not wire any asset into the runtime.

## Contract

- Schema: `docs/contracts/mazer-asset-manifest.v1.schema.json` (structure).
- Types: `src/domain/assets/assetManifest.ts`.
- Validator: `scripts/assets/validate-asset-manifest.mjs`.
- Example (tests only): `tests/fixtures/assets/example/`.

## Allowed kinds, formats, and limits

| Kind | Formats | Max bytes | Dimensions |
|---|---|---|---|
| `icon` | svg, png, webp | 262144 | required for raster formats |
| `image` | png, webp, jpg | 2097152 | required |
| `material` | png, webp, jpg | 4194304 | required |
| `animation` | webp, gif, png (sprite sheet), webm | 4194304 | required |
| `audio` | ogg, mp3, m4a | 1048576 | must be omitted |
| `font` | woff2, woff | 524288 | must be omitted |

Dimensions are capped at 4096 px per side. The authoritative table is `ASSET_KIND_RULES` in the validator;
raising a limit is a reviewed change there plus this table.

## Authoring and import steps

1. Create the asset in your own tool. Export at its final size; do not rely on runtime scaling. Prefer lossless
   sources and keep the original in your own archive.
2. Name the file in lowercase kebab-case with an extension that matches its format (`jpeg` is accepted for `jpg`).
   Place it in the directory the manifest lives in or below it (for example `icons/`, `materials/`).
3. Add one entry to the manifest with: `id` (lowercase, dot or dash separated, unique), `kind`, `path` (POSIX,
   relative to the manifest directory, no `..`), `format`, `bytes`, `sha256`, `dimensions` where required,
   `source` (`origin`, `reference`, `createdOn`), `license.id` (plus optional `holder`), `author`, and `status`.
4. Get the hash and size from the file itself (`sha256sum <file>` and the byte length), never from memory.
5. Run the validator and fix every reported violation:

   ```
   npm run assets:validate -- --manifest <path/to/manifest.json>
   ```

   Add `--json` for machine-readable output. Exit codes: `0` valid, `1` violations, `2` usage error.
   There is deliberately no default manifest, so an unconfigured run can never pass silently.
6. Move `status` from `draft` to `review` to `approved`. Only `approved` assets are intended to back shipped
   cosmetics; `deprecated` assets must not be referenced by a catalog (the cosmetic catalog validator enforces this).
7. Reference the asset by `id` from the cosmetic catalog (`src/domain/cosmetics/`). The catalog never embeds paths.

## What the validator checks

Missing or non-regular files, `sha256` and byte-size agreement with the file, per-kind allowed formats and size
ceilings, extension-versus-format agreement, magic-byte signature sniffing (catches renamed or truncated files),
PNG dimension agreement with the header, dimension requirements and caps, unsafe or absolute paths, duplicate
`id` and duplicate `path`, missing `license.id`, `author`, or `source`, unknown fields, and unsupported
`schemaVersion`. Output is sorted by path, rule, then message, so reruns are byte-identical.

It does not check visual quality, optimization beyond the byte ceilings, or runtime wiring. `ai-assisted` and
`third-party` origins are recorded, not blocked; review decides whether they are acceptable.

## Precedents this mirrors

- `docs/assets/mazer-vfx-source-provenance.md`: the manual provenance practice (copy byte-for-byte, record
  dimensions and SHA-256, never recompress originals). The manifest makes that table machine-checkable; the
  `source.reference` field plays the role of the "Source" column.
- `scripts/brand/generate-mazer-icons.mjs --check` (`npm run brand:icons:check`): the same deterministic
  verify-against-recorded-hash pattern (pinned SHA-256 and byte length, fail on drift). This validator is the
  generic per-asset form of that check; generated derivatives still belong to their own generator.

## Not yet covered

- No production manifest exists yet; the only manifest in the repo is the test fixture.
- Visual proof of an imported asset reference and a rendered catalog sample are separate follow-ups.
- Optimization tooling (recompression, sprite packing) and preview generation are not provided.
