# Playbook notes become one file per change

- WHAT changed: `playbook.config.json` `requireNotesOnChanges.mustTouch` now also accepts `docs/playbook-notes/**`. Added `docs/playbook-notes/README.md`, `.gitattributes` `merge=union` for the legacy `docs/PLAYBOOK_NOTES.md`, and a `.vercelignore` entry for the new folder.
- WHY it changed: Every code PR appended to the single `docs/PLAYBOOK_NOTES.md`, so parallel PRs conflicted on it (twice on PR 578) and 4 post-wiring CI failures were this rule.
- Rule: New notes are one file per change, `docs/playbook-notes/YYYY-MM-DD-<slug>.md`. The legacy file is history only.
- Evidence: `npm run playbook:verify` passes on this change through the new glob, plus a scratch-commit proof that a `src/` change with only a `docs/playbook-notes/` file passes.
- Status: Applied (review), source proof only.
