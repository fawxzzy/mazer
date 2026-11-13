# Loader study and design (MAZER-VIS-039, 2026-11-13)

Owner request: Mazer's loading screen looked odd; copy the way the Fitness app does it, but smoother (the Fitness one glitches): blend in, blend out.

## Fitness loader, read-only study

Repo `fawxzzy/fawxzzy-fitness`, read from `origin/main` (the local checkout is 142 commits behind; nothing was run or edited there).

Pieces: `src/app/loading.tsx` and one `loading.tsx` per route segment render `RouteLoading` (`src/components/RouteLoading.tsx`), which renders `FawxzzySigilLoader` (`src/components/ui/FawxzzySigilLoader.tsx`) over a field of animated layers styled in `src/app/globals.css` (`.route-loading__*`). Timing lives in `src/lib/route-loading.ts` (boot 140 ms, route 260 ms delay).

What it does well (kept): a delay before showing, one calm centred mark, a sigil with a ring and a pulse, a `role="status"` text.

Why it glitches (read from the code; not reproduced in a browser, so each is a likely cause, not a confirmed one):

1. Pop in. After the delay `RouteLoading` goes from `return null` to a full-opacity `<section>`: there is no fade-in, so the whole overlay (grid, scan band, glows, particles, sigil) appears in one frame.
2. Abrupt unmount. When the route resolves, Next unmounts the `loading.tsx` tree; there is no exit transition, so it vanishes in one frame. The page behind then pops in on its own.
3. No minimum hold. A route that resolves 30 ms after the delay shows the overlay for 30 ms: a flash. The delay is per mounted instance, so every route segment re-arms its own timer and the loader can re-trigger on each navigation.
4. Chrome flicker. `shouldHideRouteLoadingChrome` returns true for the boot variant before the overlay is even visible, and `setRouteLoadingChromeHidden` sets `html[data-route-loading]`, which fades the app edge frame to 0 over 120 ms. The frame disappears 140 ms before the loader appears and returns the moment it leaves.
5. Image pop-in and decode cost. The sigil is a 1024 x 1024 PNG (`/app/loader-sigil.png`) shown at about 100 px through `next/image`, mounted only after the delay, so it can paint late or decode on the main thread right as the overlay appears. It also uses `mix-blend-mode: screen` and a radial `mask-image`.
6. Heavy compositing. Six always-running full-screen layers (a drifting grid, a scan band with `mix-blend-mode: screen` that translates across 124% of the screen, two `blur(42px)` glows, six particles, plus the sigil's own `blur(20px)` glow and two `animate-spin` rings and `animate-pulse`) run on 15 to 34 s loops. Blend modes and large blurs defeat layer promotion, so the loader costs frames exactly when the app is busy loading.
7. Effect churn. The diagnostics gate effect lists `blockingReason`, `detail`, `label` and `variant` as dependencies, and a second effect re-reports on every visibility change, so state is touched while the loader is appearing.

By reading, not a cause: layout jump (the section is `fixed inset-0`). Not checked: flash of unstyled content and double mount (they depend on Next streaming and React dev behaviour, which needs a browser run).

## Mazer before

- Static HTML splash in `index.html`: the word MAZER, a 10 px pulsing dot, "Loading...". Painted at once at full opacity (a pop), removed by `bootSplash.ts` with a 300 ms fade (MAZER-MOTION-002) the moment the menu scene existed, however briefly the splash had been up.
- In-game cover: `MenuScene.syncLegacyAuthGateLoadingScreen`, shown only while a stored sign-in is being restored. A full-screen rectangle at 96% opacity and a pulsing diamond, both rebuilt every frame (`Graphics.clear()` plus a fill, path and stroke); on and off in one frame (`setVisible(false)`), with the diamond a different mark from the splash's dot.
- No other between-screen loading state exists (overlays open and close by crossfade, MAZER-MOTION-002).

## Mazer after

One loader: the app image (see `MAZER-APP-IMAGE-SOURCE-2026-11-13.md`) centred on `#02080f`, a soft ring that grows and fades once per beat, a 3% icon breath, the existing label under it.

- Pure timeline `src/render/appLoader.ts` (unit-tested in `tests/render/app-loader.test.ts`): a wait shorter than 150 ms never shows; once visible it fades in over the base step (200 ms), holds at least 350 ms from the first visible frame, then fades out over the slow step (300 ms). A new wait during the fade-out turns around from the current opacity, so opacity is continuous in every case (asserted frame by frame at 8 and 16 ms steps). Lengths come from `MOTION_DURATION_MS` and `MOTION_LOOP_MS`; the 150 ms and 350 ms are named policy thresholds, not new motion steps.
- Reduced Motion: both fades become the one 200 ms crossfade; the icon holds still and the ring is a still halo; delay and hold are unchanged.
- HTML splash (`index.html`, `src/boot/bootSplash.ts`): the root is opaque dark from the first paint (same colour as the page, nothing flashes); only the stage (icon, ring, label) fades in, by CSS, after 150 ms; the exit reads the stage animation's `currentTime` and, if the icon has shown, waits out the rest of the 350 ms hold before the 300 ms root fade. The icon is an inline WebP data URI with width and height reserved: no request, no pop-in, no layout jump. The label is positioned out of flow so a text change never moves the icon.
- Phaser cover (`src/render/appLoaderOverlay.ts`): the same icon (same data URI), ring and backdrop as three Image/Rectangle objects; per frame only alpha, scale and position are set (no Graphics redraw). While the HTML splash is still up, the cover starts opaque so the splash fades out over an identical frame, then the cover fades out over the live menu.
- The iOS launch images use the same image at the same size and place, so launch image, splash and cover read as one continuous screen.
