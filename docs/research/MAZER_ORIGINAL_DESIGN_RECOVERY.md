# Mazer Original Design Recovery

Date: 2026-06-27
Status: docs-only recovery packet
Repo: `fawxzzy/mazer`
Branch: `codex/mazer-original-design-recovery`

## Purpose

Recover the intended Mazer direction before changing runtime code.

This packet exists to slow the rebuild down, separate the current shipping product from the larger original concept, and choose the smallest first build slice without creating another Mazer app identity.

## Canonical identity

Current canonical surfaces:

- GitHub repo: `fawxzzy/mazer`
- Atlas app identity: `mazer`
- Atlas local path: `repos/mazer`
- Vercel project name: `fawxzzy-mazer`
- Vercel project id: `prj_t3zothbtj9DExrh3FjMsH98hwwSZ`
- Supabase project: none required or created for this recovery pass

Identity rule:

- Keep one canonical Mazer.
- Do not create `mazer-v2`, `new-mazer`, duplicate Supabase projects, or duplicate Vercel projects while design recovery is still open.
- If a later implementation branch needs a temporary proof surface, it must point back to the canonical repo and be documented as temporary.

## Source docs to read first

Read in this order before coding:

1. `docs/current-truth.md`
2. `docs/architecture.md`
3. `docs/roadmap.md`
4. `docs/research/MAZER_PIXEL_ART_VISUAL_LANGUAGE.md`
5. `docs/research/MAZER_ROTATING_PLANET_MAZE_MASTER_PLAN.md`
6. `docs/research/MAZER_MUSIC_LANGUAGE.md`

Precedence rule:

- Current visual proof and `docs/current-truth.md` override older prose for the active shipping app.
- Future-facing research docs can guide recovery, but they do not become present-tense product truth until a scoped prototype proves them.

## Two-lane decision

Mazer recovery has two valid lanes. They must not be blended accidentally.

### Lane A: 2D product correction

Goal:

- Keep the existing Vite + TypeScript + Phaser app.
- Reshape it toward the intended Mazer feel.
- Improve clarity, composition, atmosphere, and small interaction truth without reopening broad engine or app identity churn.

Use this lane when the next change can be expressed inside the current 2D shell.

Likely work:

- simplify the shell around the board-first identity
- strengthen player, trail, start, goal, and maze readability
- preserve the current Phaser runtime and repo-owned verification path
- reduce decorative noise that weakens the maze as the hero
- keep install, preview, and proof surfaces attached to the canonical app

### Lane B: original concept revival

Goal:

- Explore the larger graph-first rotating planet / concentric shell maze concept.
- Keep it isolated until it proves orientation, readability, and topology clarity.

Use this lane only when the work cannot honestly fit inside the 2D shipping shell.

Required staging:

1. design brief
2. topology sandbox
3. isolated prototype
4. later integration decision

Non-goals for the first revival pass:

- no production replacement
- no multi-shell runtime claim
- no new app identity
- no Vercel or Supabase duplication
- no broad rewrite before the topology rules are understandable in a small proof

## Recovered design pillars

Mazer should feel like:

- a maze-first experience where the board is the hero
- readable before it is decorative
- mysterious, weather-touched, ancient, and restrained
- graph-first rather than spectacle-first
- ambient when watching, deliberate when playing
- small enough to understand locally, but suggestive of a larger system

Hard rules:

- Readability is design truth, not late polish.
- Confusion is allowed only when it resolves into learnable orientation.
- The player must remain the dominant local signal.
- Trail, player, start, and goal need clear semantic separation.
- Future 3D or planet work must prove bearings and orientation recovery before integration.

## Smallest first build slice

Recommended first build slice: **2D product correction / design recovery pass 1**.

Scope:

- stay in the current Phaser shell
- create a single route/profile for recovered-design inspection, probably a URL flag rather than a new app
- tighten the board-first composition and reduce non-maze chrome pressure
- tune semantic role separation for player, trail, start, goal, wall, and floor
- preserve the existing proof path before and after the change

Why this is first:

- it improves the live canonical Mazer without duplicating infrastructure
- it uses the app that already exists instead of starting a parallel app
- it gives an immediate visual baseline for judging whether the original feel is being recovered
- it keeps the planet/shell concept available as a separate sandbox instead of forcing it into production too early

Out of scope for pass 1:

- Supabase setup
- Vercel project creation
- repo rename or duplicate repo creation
- full runtime rewrite
- 3D planet implementation
- production deploy

## Acceptance checks for the first slice

The first build slice is acceptable only if:

- `npm run verify` still passes
- the existing visual/proof path remains the authority for the active 2D app
- the recovered-design route/profile does not fork maze generation truth
- Mazer still has one repo, one Atlas app identity, and one Vercel project
- any temporary proof surface is documented as temporary and attached to the canonical app

## Follow-up decision after pass 1

After the first 2D correction pass, decide whether the recovered feel is close enough to continue inside the existing app.

If not, open a separate original-concept revival packet for a topology sandbox only. That packet should not replace the 2D app until it proves graph rules, landmarks, objective visibility, orientation recovery, and rotation-state clarity in isolation.
