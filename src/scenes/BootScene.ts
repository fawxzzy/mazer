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

// This project runs Phaser in Canvas mode (see phaserConfig.ts), not WebGL --
// and Phaser's Canvas renderer's Image/Sprite draw path (CanvasRenderer.
// batchSprite) never applies tint at all; tint is a WebGL-only feature in
// Phaser 3 for plain Image game objects. Image.setTint()/setTintFill() on
// the tile-font glyphs was silently a no-op (confirmed by reading the
// renderer source and by direct pixel testing -- every glyph rendered
// plain white regardless of the requested tint). Pre-baking N hue-rotated
// copies of the whole mask atlas here at boot (once, via an offscreen
// canvas + 'source-in' compositing -- the same "replace every opaque pixel
// with a solid color, keep the source alpha" operation setTintFill does on
// WebGL) and switching which baked texture a glyph draws from at render
// time is the actual working substitute: cheap (a texture-key swap, not a
// per-frame recolor) and correct under Canvas rendering. See
// resolveMazerTileFontRainbowTextureKey / MenuScene's
// drawLegacyTileFontWordTiled for the consuming side.
export const MAZER_TILE_FONT_RAINBOW_STEPS = 24;
export const resolveMazerTileFontRainbowTextureKey = (step: number): string => (
  `mazerTileFontAtlasRainbow${((step % MAZER_TILE_FONT_RAINBOW_STEPS) + MAZER_TILE_FONT_RAINBOW_STEPS) % MAZER_TILE_FONT_RAINBOW_STEPS}`
);

// The iridescent diamond/teleport VFX source art -- exact, unmodified PNGs
// (see docs/assets/mazer-vfx-source-provenance.md for hashes/provenance),
// the first non-font raster assets this game loads. Base filenames are kept
// identical to the supplied source so a hash check against the original
// bundle stays a trivial diff.
export const MAZER_VFX_DIAMOND_TEXTURE_KEY = 'mazerVfxEdgeDiamond';
export const MAZER_VFX_DIAMOND_ENERGY_CORE_TEXTURE_KEY = 'mazerVfxEdgeDiamondEnergyCore';
export const MAZER_VFX_DIAMOND_ABSORPTION_TEXTURE_KEY = 'mazerVfxEdgeDiamondAbsorption';
export const MAZER_VFX_TELEPORT_BEAM_TEXTURE_KEY = 'mazerVfxTeleportBeam';
// A second-pass diamond render with visible internal "energy" linework
// baked directly into the same source art -- used instead of compositing
// the separate energy-core image on top of MAZER_VFX_DIAMOND_TEXTURE_KEY.
// That composite (two independently-shaped diamond silhouettes stacked at
// nearly the same scale) was reported as "an extra diamond appearing over
// them... not pointing to mid" -- a real bug: edge-diamond-energy-core.png
// is its own symmetric diamond shape with no inherent "point toward
// center" orientation, so no rotation of it ever aligned with the outer
// shell's elongated shape. One single image with the energy already part
// of its own linework sidesteps the compositing problem entirely.
export const MAZER_VFX_DIAMOND_ENERGIZED_TEXTURE_KEY = 'mazerVfxEdgeDiamondEnergized';
const MAZER_VFX_ASSET_BASE_URL = '/assets/vfx/diamonds';
// See the cache-busting comment in preload() below.
const MAZER_VFX_ASSET_CACHE_BUST = 'v=20260829';

// Starfield background, floor tile, and bleed-off path strip -- see
// docs/assets/mazer-vfx-source-provenance.md for provenance/hashes.
export const MAZER_STARFIELD_TEXTURE_KEY = 'mazerStarfieldTile';
export const MAZER_FLOOR_TILE_TEXTURE_KEY = 'mazerFloorTile';
export const MAZER_BLEED_PATH_TEXTURE_KEY = 'mazerBleedPathStrip';
export const MAZER_PLAYER_TRAIL_TEXTURE_KEY = 'mazerPlayerTrail';

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
    // MAZER_VFX_ASSET_CACHE_BUST query suffix: this project's PWA service
    // worker (vite-plugin-pwa generateSW, see vite.config.ts) precaches
    // every built asset by bare URL. If a device already had an older
    // build's service worker installed and its cache/update cycle didn't
    // pick up a same-filename asset swap for any reason, the SW's
    // cache-first fetch handler serves the stale bytes forever regardless
    // of this server's own Cache-Control headers (which do correctly
    // revalidate -- verified live: fresh fetch, matching etag/content-
    // length/last-modified for the current file). Appending a query string
    // makes the actual runtime request URL one the old precache manifest
    // never had an entry for, so it always falls through to a real network
    // fetch. Bump the suffix whenever one of these specific files' content
    // changes again.
    this.load.image(MAZER_VFX_DIAMOND_ENERGIZED_TEXTURE_KEY, `${MAZER_VFX_ASSET_BASE_URL}/edge-diamond-energized.png?${MAZER_VFX_ASSET_CACHE_BUST}`);
    this.load.image(MAZER_STARFIELD_TEXTURE_KEY, `/assets/vfx/starfield/mazer-starfield-tile.png?${MAZER_VFX_ASSET_CACHE_BUST}`);
    this.load.image(MAZER_FLOOR_TILE_TEXTURE_KEY, `/assets/tiles/mazer-floor-tile.png?${MAZER_VFX_ASSET_CACHE_BUST}`);
    this.load.image(MAZER_BLEED_PATH_TEXTURE_KEY, `/assets/tiles/mazer-bleed-path-strip.png?${MAZER_VFX_ASSET_CACHE_BUST}`);
    this.load.image(MAZER_PLAYER_TRAIL_TEXTURE_KEY, `/assets/vfx/trail/mazer-player-trail.png?${MAZER_VFX_ASSET_CACHE_BUST}`);
  }

  public create(): void {
    this.registerMazerTileFontFrames(MAZER_TILE_FONT_TEXTURE_KEY);
    this.generateMazerTileFontRainbowVariants();
    this.scene.start('MenuScene');
  }

  // Registers each glyph (and its lowercase alias) as a named sub-frame on
  // the given already-loaded texture, using this project's own JSON frame
  // data directly (Texture.add) instead of relying on Phaser's atlas-JSON
  // parser. Textures are global to the Game instance, not per-Scene, so
  // frames registered here are available to MenuScene once it starts.
  // Silently no-ops (leaving the tile font unavailable, callers fall back
  // to their own procedural glyph rendering) if either the base data or the
  // given texture is missing -- a missing/broken font asset must never be
  // fatal to booting the game. Called once for the base white texture and
  // again for each of generateMazerTileFontRainbowVariants' baked copies,
  // since every one of them needs the identical set of named sub-frames.
  private registerMazerTileFontFrames(textureKey: string): void {
    if (!this.textures.exists(textureKey) || !this.cache.json.has(MAZER_TILE_FONT_DATA_KEY)) {
      return;
    }
    const data = this.cache.json.get(MAZER_TILE_FONT_DATA_KEY) as MazerTileFontAtlasJson | undefined;
    if (!data?.frames) {
      return;
    }
    const texture = this.textures.get(textureKey);
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

  // See this file's own header comment on MAZER_TILE_FONT_RAINBOW_STEPS for
  // why this exists. Draws the base white-on-transparent mask atlas to an
  // offscreen canvas per hue step, then uses 'source-in' compositing (fill
  // the canvas with a solid color, keeping only where the source was
  // already opaque) to recolor every glyph in one pass -- the manual-canvas
  // equivalent of WebGL's setTintFill, since Canvas-mode Phaser doesn't
  // apply tint at all. Silently leaves whichever step(s) failed
  // unregistered -- MenuScene's own render call already checks
  // MAZER_TILE_FONT_TEXTURE_KEY (the base texture) before attempting any of
  // this, so a partially- or fully-failed bake here degrades to plain white
  // glyphs, never a broken boot.
  private generateMazerTileFontRainbowVariants(): void {
    if (!this.textures.exists(MAZER_TILE_FONT_TEXTURE_KEY)) {
      return;
    }
    const sourceImage = this.textures.get(MAZER_TILE_FONT_TEXTURE_KEY).getSourceImage();
    const width = 'width' in sourceImage ? sourceImage.width : 0;
    const height = 'height' in sourceImage ? sourceImage.height : 0;
    if (!width || !height) {
      return;
    }
    for (let step = 0; step < MAZER_TILE_FONT_RAINBOW_STEPS; step += 1) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          continue;
        }
        ctx.drawImage(sourceImage as CanvasImageSource, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        const rgb = Phaser.Display.Color.HSVToRGB(step / MAZER_TILE_FONT_RAINBOW_STEPS, 0.8, 1) as { r: number; g: number; b: number };
        ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        ctx.fillRect(0, 0, width, height);
        const key = resolveMazerTileFontRainbowTextureKey(step);
        if (this.textures.exists(key)) {
          this.textures.remove(key);
        }
        this.textures.addCanvas(key, canvas);
        this.registerMazerTileFontFrames(key);
      } catch {
        // Canvas 2D unavailable/erroring on this step -- leave it
        // unregistered, see this method's own header comment.
      }
    }
  }
}
