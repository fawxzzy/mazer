# Mazer Account Sync and Browser-Mobile Parity Packet

## Outcome

Authenticated devices now load one canonical account progression/settings state before the first maze is generated. Narrow fine-pointer portrait browser panes reuse the mobile maze and controller composition without changing the existing phone branch.

## Root causes

1. Remote progression was write-only. On boot, the scene reloaded an account-scoped local-storage cache and never selected the Mazer progression row.
2. Player-facing settings were scoped locally even though `mazer_profiles.settings` already existed for cross-device preferences.
3. The clean phone maze cadence and phone controller layout stopped at `420/430px`, so the maintained `499x958` browser pane took a different branch from the `390x844` phone.

## Contracts landed

- Boot waits for the persisted Supabase session and canonical account hydration before constructing Phaser.
- Existing remote rows win when the local cache matches its last sync envelope.
- First-contact or offline advancement merges forward per player/AI track; it cannot lower a newer remote track.
- Progression and profile writes compare a monotonic `revision` and increment only on a matching row.
- A stale normal advancement gets one forward-only rebase/retry. A stale reset never overwrites the newer row.
- Settings writes are debounced and serialized so slider movement cannot race multiple revisions.
- Browser-mobile parity is limited to portrait `431..600px` fine-pointer panes. Touch points or a coarse pointer disable the override.
- Existing `390x844` menu/control outputs are asserted unchanged.

## Data safety

The live migration adds only `revision bigint not null default 0` to `mazer_progression_states` and `mazer_profiles`. It deletes no rows and changes no existing progression payload. Post-migration readback found three preserved progression rows at revision `0` and zero profile rows.

## Verification

- Focused account/browser packet: `4` files / `41` tests passed.
- Fast verification: TypeScript plus `13` files / `184` tests passed.
- Architecture verification: `5` files / `18` tests passed.
- Lint passed.
- Production-mode build passed.
- The aggregate verification run passed `49` files / `374` tests. Three expensive seed-family tests timed out only when accumulated in that serial run; each affected seed-family contract passed within its explicit `20s` limit when rerun in isolation.
- Supabase security advisor retained one pre-existing Auth password-protection warning; this packet introduced no RLS, grant, or advisor regression.
- Local route-aware proof passed at `390x844` and `499x958` in menu and play. Both surfaces rendered one canvas, produced no browser errors, and reported zero off-screen or overlap violations.
- The `390x844` phone layout retained its existing edge-tight maze, HUD, pause control, and lower joystick composition.
- The `499x958` fine-pointer browser layout used that same mobile play composition, including a `483px` board inside the `499px` viewport and the compact lower joystick.
- Vercel Preview `5ELdb6fPuktXuPBJNUsVKvfgmVK3` built successfully from commit `e51db087765a17e7a249b4054e6c25fead4f5d91`.
- Route-aware Preview proof repeated menu/play checks at `390x844` and `499x958`. The phone branch remained unchanged; the fine-pointer browser branch rendered the same mobile composition with a `483px` board inside the `499px` viewport, a compact lower joystick, zero off-screen/overlap violations, and no console errors.
- Preview URL: `https://fawxzzy-mazer-cgb93h4sk-fawxzzy.vercel.app`
- Production was not changed by this packet.
