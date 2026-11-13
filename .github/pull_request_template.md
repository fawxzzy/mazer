## Summary

<!-- What changed and why. -->

## Checklist

- [ ] Guide updated in the same PR if this changes controls, tiles/markers, wrap/diamonds, levels/ranks, settings or pause (`src/legacy-runtime/legacyGuideContent.ts`; drift test `tests/reset/legacy-guide-content-drift.test.ts`). Otherwise: N/A.
- [ ] Visual change: evidence path (see `docs/PLAYBOOK_VISUAL_EVIDENCE.md`; screenshots/metadata under `tmp/`, cite the metadata path), or N/A.
- [ ] `npm run lint` and the tests for the touched area pass.
- [ ] SQL change (a file under `supabase/migrations/` or a SQL proposal): the checklist in `docs/ops/MAZER-SQL-CHANGE-PROCESS.md` is done (live preimage, scratch PostgreSQL 17 apply + rollback, guard pins the LIVE body md5, independent review). Otherwise: N/A.
