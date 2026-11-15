# Playbook notes (one file per change)

New Playbook notes are one file per change, named `YYYY-MM-DD-<slug>.md`, in this folder.

Each file uses the same format as `docs/PLAYBOOK_NOTES.md`:

- WHAT changed:
- WHY it changed:
- Rule:
- Evidence:
- Status:

Why: Playbook's `requireNotesOnChanges` rule (see `playbook.config.json`) requires a notes file to be touched for changes under `src/**`, `scripts/**` and `tests/**`. A single shared file made parallel PRs conflict. A new file per change cannot conflict.

The legacy `docs/PLAYBOOK_NOTES.md` stays as history. Do not append to it any more.
