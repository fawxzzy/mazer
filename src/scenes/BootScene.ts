import Phaser from 'phaser';

// The Mazer tile-font asset: a real raster atlas (5x7 dot-matrix glyphs,
// white-on-transparent so it can be tinted per-character at runtime), the
// first actual image/texture asset this game loads -- every other visual
// element in MenuScene is drawn procedurally via Graphics. Loaded here,
// once, before MenuScene starts, and registered as named sub-frames
// (mazerTileFontRegisterFrames) using this project's own JSON contract
// rather than Phaser's atlas-JSON loader, since the asset's JSON shape
// (frames.<char>.frame/{x,y,w,h}) doesn't fully match TexturePacker's
// format (no rotated/trimmed fields) that this.load.atlas expects.
export const MAZER_TILE_FONT_TEXTURE_KEY = 'mazerTileFontAtlas';
const MAZER_TILE_FONT_DATA_KEY = 'mazerTileFontAtlasData';
const MAZER_TILE_FONT_IMAGE_URL = '/fonts/mazer-tile-font/mazer-font-atlas-mask.png';
const MAZER_TILE_FONT_JSON_URL = '/fonts/mazer-tile-font/mazer-font-atlas.json';

// The iridescent diamond/teleport VFX source art -- exact, unmodified PNGs
// (see docs/assets/mazer-vfx-source-provenance.md for hashes/provenance),
// the first non-font raster assets this game loads. Base filenames are kept
// identical to the supplied source so a hash check against the original
// bundle stays a trivial diff.
export const MAZER_VFX_DIAMOND_TEXTURE_KEY = 'mazerVfxEdgeDiamond';
export const MAZER_VFX_DIAMOND_ENERGY_CORE_TEXTURE_KEY = 'mazerVfxEdgeDiamondEnergyCore';
export const MAZER_VFX_DIAMOND_ABSORPTION_TEXTURE_KEY = 'mazerVfxEdgeDiamondAbsorption';
export const MAZER_VFX_TELEPORT_BEAM_TEXTURE_KEY = 'mazerVfxTeleportBeam';
const MAZER_VFX_ASSET_BASE_URL = '/assets/vfx/diamonds';

interface MazerTileFontFrameEntry {
  frame: { x: number; y: number; w: number; h: number };
  advance?: number;
}

interface MazerTileFontAtlasJson {
  frames: Record<string, MazerTileFontFrameEntry>;
  aliases?: Record<string, string>;
}

export class BootScene extends Phaser.Scene {
  public constructor() {
    super('BootScene');
  }

  public preload(): void {
    this.load.image(MAZER_TILE_FONT_TEXTURE_KEY, MAZER_TILE_FONT_IMAGE_URL);
    this.load.json(MAZER_TILE_FONT_DATA_KEY, MAZER_TILE_FONT_JSON_URL);
    this.load.image(MAZER_VFX_DIAMOND_TEXTURE_KEY, `${MAZER_VFX_ASSET_BASE_URL}/edge-diamond-iridescent.png`);
    this.load.image(MAZER_VFX_DIAMOND_ENERGY_CORE_TEXTURE_KEY, `${MAZER_VFX_ASSET_BASE_URL}/edge-diamond-energy-core.png`);
    this.load.image(MAZER_VFX_DIAMOND_ABSORPTION_TEXTURE_KEY, `${MAZER_VFX_ASSET_BASE_URL}/edge-diamond-energy-absorption-state.png`);
    this.load.image(MAZER_VFX_TELEPORT_BEAM_TEXTURE_KEY, `${MAZER_VFX_ASSET_BASE_URL}/teleport-beam-iridescent.png`);
  }

  public create(): void {
    this.registerMazerTileFontFrames();
    this.scene.start('MenuScene');
  }

  // Registers each glyph (and its lowercase alias) as a named sub-frame on
  // the already-loaded base texture, using this project's own JSON frame
  // data directly (Texture.add) instead of relying on Phaser's atlas-JSON
  // parser. Textures are global to the Game instance, not per-Scene, so
  // frames registered here are available to MenuScene once it starts.
  // Silently no-ops (leaving the tile font unavailable, callers fall back
  // to their own procedural glyph rendering) if either asset failed to
  // load -- a missing/broken font asset must never be fatal to booting the
  // game.
  private registerMazerTileFontFrames(): void {
    if (!this.textures.exists(MAZER_TILE_FONT_TEXTURE_KEY) || !this.cache.json.has(MAZER_TILE_FONT_DATA_KEY)) {
      return;
    }
    const data = this.cache.json.get(MAZER_TILE_FONT_DATA_KEY) as MazerTileFontAtlasJson | undefined;
    if (!data?.frames) {
      return;
    }
    const texture = this.textures.get(MAZER_TILE_FONT_TEXTURE_KEY);
    for (const [key, entry] of Object.entries(data.frames)) {
      const { x, y, w, h } = entry.frame;
      if (!texture.has(key)) {
        texture.add(key, 0, x, y, w, h);
      }
    }
    for (const [alias, target] of Object.entries(data.aliases ?? {})) {
      if (!texture.has(alias) && texture.has(target)) {
        const targetFrame = texture.get(target);
        texture.add(alias, 0, targetFrame.cutX, targetFrame.cutY, targetFrame.cutWidth, targetFrame.cutHeight);
      }
    }
  }
}
