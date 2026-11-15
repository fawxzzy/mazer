# 2026-11-15 MAZER-UI-056 online counter readable on the menu

- WHAT changed: the main-menu "7 online" text is now `designTokens`-bright (`cyberArcadeMaterial.rail.white`, #F1FAF6) instead of the muted #94AAA8, carries a 3 px dark outline (`LEGACY_PRESENCE_TEXT_STROKE_PX`, colour `bg.canvas`) via a new required `strokeColor` field on `PresenceCounterViewStyle`, and is drawn at 12 px (`LEGACY_PRESENCE_FONT_PX` 13 to 12). Layout fit tiers, dot size, glow and placement are unchanged (the text is narrower, so fit only gets easier).
- WHY it changed: owner, 2026-11-15: the online-users text is hard to see or read; improve it a little and reduce the size slightly.
- Rule: small UI text that sits over the starfield and board glow needs both a high-contrast token and an outline; muted tokens are for text on solid panels. The outline colour comes from the canvas token, never a literal.
- Evidence: Chromium DPR3 touch captures of the header at 390 and 320 wide with the QA count set to 7, before (origin/main) and after, in the PR. `verify-menu-online-counter.mjs` passes at phone-390, phone-360 and desktop-1280. The text still looks soft because Phaser text resolution is held at the baseline (render/textCrispness.ts); that is unchanged and a separate question.
- Status: headless only; nothing checked on a real phone (checklist item 24: online counter readability).
