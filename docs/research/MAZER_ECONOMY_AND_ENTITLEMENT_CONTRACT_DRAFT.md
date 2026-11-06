# Mazer Economy and Entitlement Contract (Draft)

Status: DRAFT, unsigned
Date: 2026-11-05
Base: `origin/main` at the commit this branch was cut from (`1670c8af`)

Scope. This draft covers two board cards and notes a third:

- `mazer-shop-and-random-item-economy-contract` (earned-coin shop, random draws, duplicates, odds, fairness).
- `mazer-account-license-entitlement-contract` (the one-time $5 account-bound entitlement, restore, offline grace).
- `mazer-paid-account-checkout-and-access` is BLOCKED and PROVIDER-GATED. It is out of scope here and only noted in section 6.

**Execution boundary, stated first.** Payments, the Supabase schema, store billing, and any provider configuration are provider-gated and are NOT part of this document's execution. This document specifies policy and contracts. It writes no code, applies no migration, creates no checkout, and changes no environment. Each of those needs the owner's explicit approval in the live thread, named per project, under the ATLAS gates.

Labels used throughout, never merged:

- **DOCUMENTED FACT**: verified in this repository at the base above (or in the board file, named as such).
- **EXTERNAL EVIDENCE**: from outside the repo. Cited only where the repo's own docs cite it; otherwise marked "external, unverified".
- **PROPOSAL**: a recommended default, pending owner decision.

## 1. Inputs read for this draft

**DOCUMENTED FACT**

- Board cards (from the DiscordOS board file, archived outside this repo, last edited 2026-09-02; see `docs/ops/MAZER-BOARD-RECONCILIATION-2026-11-05.md`). Both target cards are `state: open`, 0 percent, "Planning admission".
  - Shop and random-item economy card: "Specify earned-coin shop, Crossy Road-style random draws, cosmetic inventory, and mystery-box pool upgrades without pay-to-win scoring." Status: coins are earned in Endless; the shop can award cosmetics and allowed upgrades; coin upgrades can expand mystery-box pools; AI assistance is optional, expensive or earned, and never required or a paid ranking advantage. Acceptance: every draw has a deterministic auditable result; cosmetic and gameplay effects are visibly distinct; no transaction directly changes rank or leaderboard authority. Proof plan: review seeded draw and duplicate fixtures before implementation. Next actions: choose initial draw and duplicate policy; set non-pay-to-win rules for assistance and competitive modes.
  - Entitlement card: "$5 paid-account model, entitlement state, restoration, offline grace, and server-authoritative access." Entitlement must not be trusted from client storage or conflated with browser installation. Acceptance: every access decision has an explicit entitlement source and failure mode; purchase restoration works across supported devices; offline behavior cannot mint permanent entitlement. Next actions: choose provider, territories/tax, refund/support policy, trial policy; review current auth/storage architecture.
  - Checkout card (`mazer-paid-account-checkout-and-access`): `state: backlog`; "Provider, jurisdiction/tax, refund/support, trial, and entitlement policy remain decisions; no payment code or production configuration is planned." Acceptance: no client-only flag grants paid access.
  - Related backlog cards: coin pickups (cosmetic-only currency; "cannot directly purchase rank or leaderboard authority"; collection must not affect difficulty, score, or AI pathing), customization inventory (replaces any standalone shop card; owned and selected cosmetics account-scoped; "direct and random unlock paths ... without assuming real-money purchase"), data-driven cosmetic catalog, mystery-box item system (coin upgrades expand box contents only through a versioned content manifest), AI-token assisted completion (optional, earned or expensive; never a paid leaderboard advantage).
- `docs/research/MAZER_WEB_V1_CYBERDECK_CANONICAL_DEEP_RESEARCH.md` (imported 2026-07-27, "canonical planning input, not an implementation packet"): the Web v1 planning budget is one single-player mode, three enemy archetypes, four item types, one earned currency, twelve earned cosmetics. "The planned one-time USD $5 entitlement is tied to immutable shared user identity, never to a mutable email string. These are product contracts only; they do not authorize payment, provider, database, or production changes." It also records that progression persistence, reset commands, and entitlements "require separately admitted contracts" and that PWA work may proceed without Supabase or provider mutation.
- `docs/MAZER_SUPABASE_STORAGE.md`:
  - Mazer data lives in the custom `mazer` schema of the master Supabase project; do not store Mazer account, progression, AI, cycle, or license data in the Fitness namespace.
  - "Deferred Stripe/payment-wall tables" are named (`mazer.mazer_license_accounts`, `mazer.mazer_license_entitlements`, `mazer.mazer_license_events`): server-owned, written only through `service_role` from verified Stripe events; authenticated users could only read their own rows; "never trust client-written profile/settings data for paid access". The doc's "Stripe Boundary" says future license work should use Stripe Checkout/Billing and write entitlement state from verified server-side events.
  - Those tables are documentation only: no migration under `supabase/migrations/` and no source or test references `mazer_license`. They do not exist in source.
  - The doc and the board disagree on provider status: the doc names Stripe as the intended boundary, while the board card still lists "choose provider" as an open action. Treat the provider as undecided until the owner confirms.
- Watch-pass stub (`src/watch-pass-paywall/main.ts`, `watch-pass-paywall.html`, `watch-pass-preview.html`, `watch-pass-setup.html`; registered as extra Vite inputs in `vite.config.ts`): a proof-surface preview with monthly, yearly, and not-now plan options persisted in the browser under `mazer.watch-pass.preferences.v1` (`src/settings/preferences.ts`). Its own text says "No billing SDK is installed. Purchase is a stubbed entitlement transition only." It models a subscription-style "Watch Pass" for a spectator surface, not the one-time $5 account entitlement, and nothing in it is authoritative. It must not be reused as an access check.
- `docs/mobile-plan.md` (April 2026): PWA installability is wired through the manifest and `vite-plugin-pwa`; a Capacitor / app-store path is "later", to be shipped "only after parity checks against the web build". It states no store-billing policy.
- Current code: no coin, inventory, shop, or entitlement logic exists in the shipping runtime (a search of `src/` finds only the unused `mazer-core` "Inventory" intent speaker and the watch-pass stub). `src/mazer-core/items/` is a non-live item-topology ledger.
- Server posture today (`docs/MAZER_SUPABASE_STORAGE.md`): forced RLS; authenticated owner-only access; progression revision columns as a monotonic optimistic-concurrency guard. Whether the documented migrations are applied in the live project is UNKNOWN from the repo alone.

## 2. Principles

**PROPOSAL**

1. Coins are earned only by play. They are never sold for money, and no real-money path buys coins, draws, or items.
2. Currency is cosmetic-only in effect: it buys cosmetics and, where the owner approves, optional non-required tools. It never changes rank, score, leaderboard authority, difficulty, or AI pathing.
3. Non-pay-to-win rule (hard): no item, cosmetic, or boost is ever required to solve a level, and nothing in the economy is tied to entitlement. Every level must be solvable with an empty inventory (this also matches fairness rule 2 in the hazard contract, `docs/research/MAZER_ENDLESS_HAZARD_PRODUCT_CONTRACT_DRAFT.md`). The $5 entitlement grants access to the game, not advantages inside it.
4. Economy state is account-scoped and local-first (consistent with `docs/architecture/MAZER-OFFLINE-SYNC-CONTRACT.md`), with the server authoritative once a server contract exists.
5. Every grant and spend produces an auditable event with a stable idempotency key.

## 3. Earned-coin economy (proposal)

### 3.1 Sources and sinks

- Source: coin pickups on valid maze tiles in Endless play (per the coin pickup card). Pickup placement is a pure function of (level seed, level), deterministic where replay and testing require it, and never alters the solution path or difficulty.
- Optional fixed bonus per clear. Rate and balance numbers are UNKNOWN and need a tuning pass; this draft proposes no figures.
- Sinks: shop purchases, draws, and optional tool upgrades. A sink must exist for every source or the economy inflates.
- Account-scoped balance that never goes negative; spends are rejected, not clamped.

### 3.2 Shop

- Direct purchase: fixed price for named cosmetics (so players are never forced to gamble).
- Random draw: a priced draw from a published pool (section 3.3).
- Inventory surface is the same surface as the customization inventory card; no standalone shop card.
- Cosmetic and gameplay items live in separate pools with visibly distinct presentation. A draw never mixes them.

### 3.3 Deterministic seeded draws

- A draw result is a pure function: `result = f(accountId, drawCounter, poolVersion)` through a documented hash and weighted pick. No unseeded randomness and no wall-clock input.
- `drawCounter` is a persisted per-account monotonic integer, advanced exactly once per draw. The draw event stores `(drawCounter, poolVersion, result, priceSpent, balanceAfter, idempotencyKey)`.
- A draw requires a successful spend event. If the spend fails, no counter advance, no result.
- The same inputs always give the same result, so seeded fixtures can pin it (the card's proof plan). The same property means a client could precompute future draws, which is acceptable only because the pools are cosmetic-only. If a pool ever contains an item with gameplay effect, the draw must move server-side first (PROVIDER-GATED).
- Pools are versioned content manifests. Coin upgrades expand mystery-box contents only through a new manifest version, never by editing one in place.

### 3.4 Duplicate policy

- Default: a duplicate cosmetic converts to a fixed coin refund (proposal: a fraction of the draw price, set per rarity), so every draw has value and the sink is partial rather than total. The refund is itself a recorded event.
- Alternative: duplicates stack toward a pity counter that guarantees a new item after N draws. Needs a decision.
- Either way the rule is shown before the draw and is not changed retroactively.

### 3.5 Odds disclosure

- Before any draw the UI shows the pool contents, each item's exact probability, the duplicate rule, and the price. The shown values are generated from the same manifest the draw uses, so display and behavior cannot drift.
- After a draw, the audit record shows the manifest version and counter used.
- **EXTERNAL EVIDENCE: external, unverified in this session**: some app stores and some jurisdictions require disclosed odds for randomized purchases. The repo's own docs do not cite any store rule. Since this design involves no real-money random purchase, those rules likely do not bind it, but that conclusion must be confirmed from primary sources before any store submission.

### 3.6 Anti-tamper and refunds

- Local balances are a cache until server reconciliation exists. Coin and inventory conflict handling is defined in `docs/architecture/MAZER-OFFLINE-SYNC-CONTRACT.md` (grants and spends are events, not absolute balances).
- Because no transaction changes rank or leaderboard authority, tampering with coins cannot corrupt competitive integrity; it can only affect personal cosmetics. This is why a client-first design is acceptable at the start.
- "Refund" here means reversing a coin spend event (support action), never a money refund. Money refunds belong to section 5.

## 4. One-time $5 account entitlement (proposal, policy only)

### 4.1 Model

- One product: a one-time purchase, USD $5, bound to the shared account identity (the immutable user id of the shared auth system, never the email string). This follows the canonical research doc.
- Entitlement state machine (server-owned): `none` -> `pending` -> `active` -> (`revoked` | `refunded`); `error` is a distinct, retryable state that never grants access. Every access decision records its source (server entitlement, offline grace, or guest/demo) and failure mode, as the card requires.
- Granted access unlocks the game; it does not touch progression, rank, coins, or inventory ownership. Revocation hides paid access but never deletes earned progress.
- Free/demo/guest behavior (what a logged-out or unpaid player can do) is a policy decision; the board lists trial/demo as undecided. The animated menu for signed-out users already exists today (per the auth-gate card).

### 4.2 Server authority and restore

- The server is the only source of truth. A client-held flag (including local storage and the watch-pass preference key) never grants access.
- Provider events (if a hosted checkout is later approved) are verified server-side, deduplicated by event id in a server-only ledger, and write the entitlement row. The browser can read its own row; it can never write it. This is the shape already described in `docs/MAZER_SUPABASE_STORAGE.md`.
- Restore: sign in with the same account on any device and read the entitlement row. No receipt-pasting flow is needed for web. A store build, if one is later pursued, would need a separate platform-receipt restore path (external, unverified).
- Support: an admin-only path to grant, revoke, and annotate entitlements, with every action in the events ledger.

### 4.3 Offline grace

- On each successful online verification, the client caches a signed, server-issued entitlement lease with an expiry. Proposed default: a bounded grace window (value UNKNOWN; owner decides, for example several days) during which offline play is allowed from the cached lease.
- Offline play never mints or extends a lease; only a successful online check does. Clock tampering is mitigated by storing the last server time seen and refusing a lease whose local clock has moved backward past it.
- When the grace window ends offline, the player lands in a clear "reconnect to continue" state. Earned local progress remains stored and syncs after reconnect (see the offline-sync contract). Nothing is deleted.
- Acceptance matches the card: offline behavior cannot create a permanent entitlement.

### 4.4 Interaction with install and PWA

- The browser install prompt cannot be reliably blocked by entitlement (board card text). The shell therefore stays installable and access is enforced by the app and server entitlement, not by install control. See `docs/architecture/MAZER-PWA-STRATEGY-AND-BROWSER-MATRIX.md`.

## 5. Provider-gated items (NOT part of this document's execution)

These need explicit owner approval, named per project, before any work, and none are started or authorized by this draft:

- Choice of payment provider; territories, tax, and refund/support policy; trial policy.
- Creating `mazer_license_*` tables, RPCs, webhooks, or any Supabase migration or apply.
- Any Stripe (or other provider) account, keys, products, prices, or webhooks. Secrets are never committed or requested in chat.
- Any store billing (Apple, Google), Capacitor shell, or store listing.
- Any Vercel environment or production change.
- Server-side draw or balance authority (needed only if a gameplay-effect pool is ever introduced).

**Platform constraints.** The repo's own docs cite no store or payment-provider policy URLs (`docs/mobile-plan.md` and `docs/research/MAZER_INSTALL_SURFACES.md` mention the app-store path only as a future option). Therefore every platform-policy statement about store billing, in-app purchase obligations, odds disclosure, refunds, tax, or consumer-protection law is **external, unverified in this session** and must be confirmed from primary sources by the owner or a research packet before any decision depends on it.

## 6. Relationship to other cards and docs

- `mazer-paid-account-checkout-and-access`: BLOCKED on this contract plus provider, jurisdiction/tax, refund/support and trial decisions. It stays in backlog.
- Offline sync and conflict hierarchy: `docs/architecture/MAZER-OFFLINE-SYNC-CONTRACT.md`.
- Hazard and item rules: `docs/research/MAZER_ENDLESS_HAZARD_PRODUCT_CONTRACT_DRAFT.md` (items never required to solve a level; item supply independent of entitlement).
- Board status: `docs/ops/MAZER-BOARD-RECONCILIATION-2026-11-05.md`.

## Decisions needed from the owner

1. Approve, amend, or reject principles 1 to 5 in section 2, especially the non-pay-to-win rule.
2. Initial draw policy: direct purchase only, draws only, or both; draw price units.
3. Duplicate policy: coin refund fraction per rarity, or pity counter.
4. Whether any gameplay-effect item pool will ever exist (this forces server-side draw authority, which is PROVIDER-GATED).
5. Odds-disclosure presentation (inline pool view versus separate screen) and who owns the first manifest.
6. Entitlement: confirm one-time USD $5 per shared account, trial/demo/guest policy, and the offline grace duration.
7. Payment provider (the storage doc names Stripe; the board says undecided), territories and tax, refund and support policy.
8. Whether and when to unlock any provider-gated work, as a separate approval, outside this document.
9. Whether the 12 cosmetics and 4 item types from the canonical research doc remain the plan.

## UNKNOWN

- Whether any `mazer_license_*` objects exist in the live Supabase project (none exist in source).
- Any numeric economy values (coin yield, prices, refund fractions, pity count); this draft proposes none.
- Offline grace duration.
- Provider choice and every platform/store/legal constraint (all external, unverified).
- Whether the canonical architecture synthesis referenced by the research doc (`docs/MAZER-MULTI-TARGET-DEPLOYMENT-ARCHITECTURE.md`) exists anywhere; it is not in this repository.
- Live board state: the card text above is from a file last edited 2026-09-02 in an archived repo, and the live board was not consulted.
- Whether the shared account identity exposes an immutable id suitable for the binding in section 4.1 (not inspected in this packet).
