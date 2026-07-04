# Playbook Notes

Use this file to record meaningful Playbook-governed repo changes in a concise, reviewable format.

## 2026-07-04

- WHAT changed: Activated the repo-local Playbook install surface with `playbook.config.json`, a local verification gate, and Mazer-owned notes.
- WHY it changed: Mazer already had adoption evidence, but Playbook's local verification mode needs an explicit `verify:local` command and config surface.
- Evidence: `npm run verify:local`
