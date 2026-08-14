# PR #142 exact-head source-only review receipt

This is a draft-PR evidence package, not a deployment record.

## Scope

- Cache the operating-system reduced-motion preference in `MenuScene`, subscribe once to its change event, invalidate presentation state, settle active nonessential motion, and remove the listener during shutdown.
- Replace the player-visible cog hub literal with the existing Precision Arcade substrate material role.
- Publish the icon-only menu action as **Settings** while retaining the compatible internal `options` overlay identifier.
- Extend route-aware capture proof to open Settings from both guest and authenticated menus, use the visible Back control when returning from overlays, and verify live reduced-motion preference changes.

Gameplay, progression, generation, collision, input cadence, persistence, scoring, AI, and hazard rules are unchanged. Level 1 remains free of progression-gated hazards and collidable objects; decorative presentation remains outside occupancy and collision structures.

## Verification

| Gate | Result |
| --- | --- |
| Focused menu/progression/capture tests | 3 files, 82 tests passed |
| Full repository verification | 76 files, 596 tests passed |
| TypeScript | `tsc --noEmit` passed |
| Production build | 234 transformed modules passed |
| PWA | 34 precache entries passed |
| Browser matrix | 5 exact capture runs passed; zero console and page errors |
| Live OS preference event | `false -> true -> false` passed |
| Diff whitespace | `git diff --check` passed |

No GitHub Actions workflow exists in this repository, so no hosted check or workflow was triggered. This receipt and the manifest below are the retrievable source-only evidence for the exact draft-PR head.

## Review material

- [Visual manifest](PR142-EXACT-HEAD-VISUAL-MANIFEST.json)
- [Readable contact sheet](PR142-EXACT-HEAD-VISUAL-PROOF.png)

The PR body supplies the immutable final commit and tree that contain this receipt. The temporary raw captures remain outside the repository by design.
