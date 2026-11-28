# 2026-11-28 - FawxzzyWeb follow-up (written, NOT applied): list `mazer.mazer_help_requests.user_id` in the account-delete FK sweep

- WHAT changed:
  - Nothing in FawxzzyWeb. This note records a follow-up for that repo so it is not lost; no SQL was run and no file outside this repo was edited.
  - The follow-up: in FawxzzyWeb `supabase/proposed/20261116090000_account_delete_self_v2.sql`, add `mazer.mazer_help_requests.user_id:c` to the optional foreign-key list (the `:c` suffix = the FK cascades on its own, so the function does not delete those rows itself).
- WHY it changed:
  - `mazer.mazer_help_requests.user_id references auth.users(id) on delete cascade` went live 2026-11-27 (`docs/ops/sql-proposals/mazer-help-requests-20261126/README.md`, item 7 and follow-up 4). Account deletion already works: the cascade removes a deleted account's Help rows, and the live `delete_account_v2` body is unchanged.
  - But the proposed v2 file runs an unlisted-FK sweep at its own apply time. A future re-apply would fail on the new, unlisted FK to `auth.users` until the entry is added.
- Rule: every new table with an FK to `auth.users` gets a line in the account-delete FK list in the same week, even when the cascade already handles deletion; otherwise the next re-apply of the delete function fails its own sweep.
- Evidence:
  - FK and cascade: `docs/ops/sql-proposals/mazer-help-requests-20261126/apply.sql` (table definition) and README items 7 / follow-up 4.
  - Guest rows (`user_id` NULL) are not linked to any account and are not touched by account deletion, by design (README "Decided after review").
- Owner: FawxzzyWeb lane (a separate PR in `fawxzzy/FawxzzyWeb`, proposed SQL file only, no apply). Not done here because this lane is mazer-only and never touches the database.
- Status: written, not applied, no FawxzzyWeb PR opened.
