import { designTokens, legacyPhaserAliases } from '../theme/tokens';

/**
 * MAZER-VIS-012: the ONE near-black canvas colour shared by the boot splash, the install gate, the in-game sign-in
 * (the opaque auth surface and the dark menu field under it) and the page itself. It is the registered
 * `legacy.color.bg.page` token (#02080f); the pre-game surfaces may not carry their own near-black.
 *
 * `bg.canvas` (#03070b) stays a separate token for the drawn board surface (see
 * tests/architecture/near-black-token-pin.test.ts) and is not touched here.
 */
export const SHARED_BACKDROP_HEX: string = designTokens.legacy.color['bg.page'].toLowerCase();
export const SHARED_BACKDROP_PHASER: number = legacyPhaserAliases['bg.page'];
