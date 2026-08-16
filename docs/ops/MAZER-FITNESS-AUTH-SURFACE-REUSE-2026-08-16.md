# Mazer Fitness Auth-Surface Reuse Contract

## Purpose

Mazer keeps its Phaser/canvas implementation, but its account experience follows
the existing Fitness account-surface contract rather than inventing a separate
visual language. This is a source-only UI and account-hydration change: it does
not alter Supabase Auth configuration, live account records, gameplay, or
progression rules.

## Canonical source patterns

The reusable Fitness sources are:

- `fawxzzy-fitness/src/components/ui/LabeledEditorField.tsx`
- `fawxzzy-fitness/src/components/ui/PasswordInput.tsx`

Mazer cannot directly import those React components, so `src/scenes/MenuScene.ts`
implements the same interaction and layout contract using its existing native
browser-input bridge and Phaser rendering:

| Fitness contract | Mazer account-surface implementation |
| --- | --- |
| Opaque account surface | The auth overlay is fully opaque; the maze never shows through credential or account content. |
| Floating, uppercase field label inside a bordered shell | Every email, password, and display-name input uses an in-field label with focused mint border treatment. |
| Password field reserves right-hand control space | Native password input width reserves a touch target for the visibility control. |
| Eye toggle with hidden-by-default password | The canvas eye changes the native input between `password` and `text`; the value is never copied into a message surface. |
| Semantic primary, secondary, and destructive actions | Mazer uses explicit primary, secondary, and danger button tones for submit, navigation, and sign-out. |
| Mobile-safe field targets | Account fields and action buttons retain at least a 46px high target. |

Settings always opens the Account surface for both guest and signed-in players.
Sign-out is available only as the dedicated destructive action inside that
surface; it is never the implicit Settings action.

## Account authority after sign-in

`hydrateLegacyRemoteAccountState()` is the post-login authority boundary.

1. It reads only the authenticated account's existing remote progression and
   profile values.
2. It replaces the account-scoped browser cache when a valid remote progression
   row is present; it never merges guest progress into the account.
3. It does not update, insert, upsert, or otherwise mutate the provider.
4. It applies the refreshed state only if the same authentication session is
   still active when the read returns.
5. It deliberately does not show a sync toast or player-facing message.

The one-time first-contact bootstrap remains separate. It is not used when a
user signs in during an active guest session, so historical guest state cannot
win a later account refresh.

## Menu progression presentation

The main menu renders the independent menu-AI level only. The signed-in player's
level glyph is reserved for active play, preventing the animated demo board from
being mistaken for the player's current maze difficulty.

## Regression obligations

- A remote account progression row wins over a higher guest/account-cache level
  after sign-in, with no remote write path available to the hydration client.
- Menu source contracts assert that the player level badge is cleared in menu
  mode and that the AI level occupies the leading control slot.
- Account-screen source contracts assert the opaque overlay, in-field labels,
  password visibility toggle, native input reservation, and semantic buttons.
- A signed-in fixture reaches the Account surface through Settings and exposes
  separate `Log out` and `Done` actions without credential entry.
- The standard focused, canonical, TypeScript, production-build, diff/scope,
  and mobile UI-surface checks must all pass before publication.

## Non-goals

- No shared React component import into Phaser.
- No UI message for cloud/local synchronization.
- No Auth provider, credential, redirect, database, or production mutation.
- No change to progression scoring, maze complexity, AI behavior, or gameplay.
