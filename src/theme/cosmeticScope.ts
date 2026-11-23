/**
 * MAZER-UI-102: the "cosmetics keep their own colours" scope.
 *
 * Dark mode recolours the UI (see darkThemeCanvasBridge.ts), but the player, the trail, the start/end marks and the
 * edge stars and beams are cosmetics: they keep the colours the game gives them (the shifting rainbow). Their draw
 * functions wrap their body in `withCosmeticColours`, and while that scope is open the theme leaves every colour alone.
 *
 * With the default theme nothing ever reads the depth counter, so this is a no-op around the draw call.
 */
let depth = 0;

export const isCosmeticColourScopeActive = (): boolean => depth > 0;

export const withCosmeticColours = <T>(draw: () => T): T => {
  depth += 1;
  try {
    return draw();
  } finally {
    depth -= 1;
  }
};
