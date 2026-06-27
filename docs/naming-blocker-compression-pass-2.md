# Mazer Naming-Blocker Compression Pass 2

- Date: `2026-05-28`
- Repo: `fawxzzy-mazer`
- Mode: `owner-side local repo execution only`
- Scope: `mazer only`

## Objective

Reduce mazer's current naming blocker to one exact remaining blocker or make the repo candidate-ready for the next Atlas-owned repo naming execution cluster.

This pass does not:

- rename the repo
- touch ATLAS root docs
- touch any other repo
- perform any remote mutation

## Source Read

Reread before execution:

- `docs/naming-blocker-conversion-assessment-pass-1.md`

## Starting Blocker Class

Starting blocker class from pass 1:

- `blocked by active owner-side multi-worktree lane`

Starting active repo facts:

- active repo branch: `main`
- active repo commit: `021291d2b4f75379ab7e4c7891e302b54d4845c6`
- active repo dirty state: `clean`
- registered extra worktrees: `7`

## Work Performed

This pass collapsed the blocker with the smallest coherent owner-side slice:

1. confirmed the active repo root remained clean on local `main`
2. inspected all seven remaining worktrees and split them into:
   - clean residue
   - dirty active work
3. removed the three clean registered residue worktrees:
   - `<ATLAS_TMP>/mazer-before-head`
   - `<ATLAS_TMP>/mazer-w-three-shell`
   - `<ATLAS_TMP>/worktrees/fawxzzy-mazer-head-20260416-150909`
4. confirmed those three paths were fully removed, not just deregistered
5. compared the two `22f60e830c76991de925dd9814ca8e108156026f` worktrees and confirmed:
   - `codex/mazer-p-headless-runner` is a strict path-level subset of `codex/mazer-o-two-shell`
   - `codex/mazer-o-two-shell` carries the broader superset lane
6. repaired the active repo-local toolchain with `npm ci`
7. ran repo-local verification with `npm run verify`

No remote mutation was performed.

## Resulting Posture

Current active repo posture:

- active repo branch: `main`
- active repo commit: `021291d2b4f75379ab7e4c7891e302b54d4845c6`
- active repo dirty state: `clean`
- repo-local verification: `passed`

Remaining registered worktrees:

- `<ATLAS_TMP>/mazer-ak-v5`
- `<ATLAS_TMP>/mazer-o-two-shell`
- `<ATLAS_TMP>/mazer-p-headless-runner`
- `<ATLAS_TMP>/mazer-y-script-typing`

Removed residue:

- `<ATLAS_TMP>/mazer-before-head`
- `<ATLAS_TMP>/mazer-w-three-shell`
- `<ATLAS_TMP>/worktrees/fawxzzy-mazer-head-20260416-150909`

Remaining dirty work summary:

- `codex/mazer-ak-v5`: broad training and evaluation lane with tracked modifications plus untracked diagnostics surfaces
- `codex/mazer-o-two-shell`: broad future-runtime and eval/training lane
- `codex/mazer-p-headless-runner`: narrower overlapping subset of the `o-two-shell` lane
- `codex/mazer-y-script-typing`: smallest remaining lane, centered on script typing and package surface updates

## Exact Blocker Class After This Pass

Exact blocker class now:

- `blocked by active dirty training worktree family`

Why this is now one exact blocker class:

- the clean residue worktrees are gone
- the remaining pressure is no longer a mixed live-plus-stale worktree family
- the remaining blocker is only the set of four dirty active worktrees that still carry unpreserved owner-side changes

That means the blocker is no longer generic multi-worktree pressure.

It is one exact retained owner-side dirty worktree family.

## Safe-Next-Candidate Readiness

Safe-next-candidate ready:

- `no`

Why:

- the active repo root itself is clean and verified
- but four dirty owner-side worktrees still hold unpreserved active changes
- those lanes must be collapsed, preserved, or merged down before a bounded naming packet is honest

## Exact Next Owner-Side Step

- collapse the overlapping `22f60e8` pair first by preserving or closing out `codex/mazer-p-headless-runner` against the broader `codex/mazer-o-two-shell` lane, then rerun one exact mazer blocker-class recheck

Why this is the shortest next move:

- `codex/mazer-p-headless-runner` appears to be a strict subset of the broader `codex/mazer-o-two-shell` lane
- closing that duplicate-shaped pair is the fastest way to compress the remaining blocker family further without guessing at the larger `ak-v5` lane

## Verification

Repo-local repair and verification commands:

- `npm ci`
- `npm run verify`

Result:

- `passed`

## Rule

Blocked naming-family repos must be compressed to one exact unblock path before root reopens the family.

## Failure Mode

Mazer stays broadly blocked even after the clean residue worktrees are already gone and the remaining blocker is really just a smaller dirty training family.
