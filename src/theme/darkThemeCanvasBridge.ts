/**
 * MAZER-UI-102: the dark theme applied at the 2D-canvas boundary.
 *
 * Mazer renders with Phaser CANVAS, and most of today's colours are literals spread over MenuScene and the
 * src/render modules. To theme the whole app without touching every renderer, this bridge maps every colour as it is
 * handed to a CanvasRenderingContext2D (fillStyle, strokeStyle, shadowColor, gradient stops), to a Phaser Graphics
 * (fillStyle, lineStyle: the colour is recorded at call time) and to every bitmap drawn from a file (the HUD icon
 * sheet), through one function built ONLY from the theme tokens in ./themes.ts. It changes colours only: geometry,
 * alpha, timing and draw order are untouched.
 *
 * Cosmetics (player, trail, start/end marks, edge stars and beams) wrap their draw in `withCosmeticColours`
 * (cosmeticScope.ts); while that scope is open nothing here maps, so they keep the colours the game gives them.
 * A Graphics records colour numbers and replays them in renderCanvas: the replay is never remapped (the colour was
 * already decided, or exempted, when it was recorded).
 *
 * Installed only when the dark theme is selected at boot; with the default theme nothing here runs.
 */
import { isCosmeticColourScopeActive } from './cosmeticScope';
import { mazerThemes, sourceRoles, type MazerThemeTokens } from './themes';
import { listCssCustomProperties } from './tokens';

type Rgb = [number, number, number];

const hexToRgb = (hex: string): Rgb => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

const toHex = ([r, g, b]: Rgb): string => (
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
);

const mix = (a: Rgb, b: Rgb, t: number): Rgb => {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + ((b[0] - a[0]) * k), a[1] + ((b[1] - a[1]) * k), a[2] + ((b[2] - a[2]) * k)];
};

const lin = (c: number): number => {
  const n = c / 255;
  return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]: Rgb): number => (0.2126 * lin(r)) + (0.7152 * lin(g)) + (0.0722 * lin(b));

const hsl = ([r0, g0, b0]: Rgb): { s: number; l: number } => {
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return { s: 0, l };
  const d = mx - mn;
  return { s: l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn), l };
};

export interface ThemeColorMapper {
  mapRgb(rgb: Rgb): Rgb;
  mapCss(value: string): string;
}

export const createThemeColorMapper = (tokens: MazerThemeTokens): ThemeColorMapper => {
  const t = Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, hexToRgb(v)])) as Record<keyof MazerThemeTokens, Rgb>;
  const exact = new Map<number, Rgb>();
  for (const [hex, role] of Object.entries(sourceRoles)) {
    const [r, g, b] = hexToRgb(hex);
    exact.set((r << 16) | (g << 8) | b, t[role]);
  }
  // Neutral tone ramp, keyed by source luminance: dark stays near-black, mid tones sink (everything else dark),
  // light tones become the lavender text colours so text keeps its contrast.
  const ramp: Array<[number, Rgb]> = [
    [0, t.void],
    [0.004, mix(t.void, t.shell, 0.6)],
    [0.012, t.shell],
    [0.03, t.panel],
    [0.08, t.elevated],
    // Pixel pass: help text (source luminance ~0.26) rendered 3.6:1, so mid tones now land at or above textDisabled.
    [0.12, mix(t.elevated, t.textDisabled, 0.5)],
    [0.2, t.textDisabled],
    [0.35, mix(t.textDisabled, t.textMuted, 0.5)],
    [0.55, t.textMuted],
    [0.8, mix(t.textMuted, t.text, 0.6)],
    [1, t.text]
  ];
  const tone = (y: number): Rgb => {
    for (let i = 1; i < ramp.length; i += 1) {
      if (y <= ramp[i][0]) {
        const [y0, c0] = ramp[i - 1];
        const [y1, c1] = ramp[i];
        return mix(c0, c1, (y - y0) / (y1 - y0));
      }
    }
    return t.text;
  };
  const accentRamp = (l: number): Rgb => {
    // Pixel pass: 11px section headers (teal, l~0.49) rendered 4.19:1 on the deep end, so full accent arrives by 0.46.
    if (l <= 0.46) return mix(t.accentDeep, t.accent, Math.max(0, (l - 0.22) / 0.24));
    if (l <= 0.78) return mix(t.accent, t.accentBright, (l - 0.46) / 0.32);
    return mix(t.accentBright, t.text, (l - 0.78) / 0.18);
  };
  const cache = new Map<number, Rgb>();
  const mapRgb = (rgb: Rgb): Rgb => {
    const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    const hit = exact.get(key) ?? cache.get(key);
    if (hit) return hit;
    const { s, l } = hsl(rgb);
    const out = (s >= 0.3 && l >= 0.18 && l <= 0.95) ? accentRamp(l) : tone(luminance(rgb));
    const rounded: Rgb = [Math.round(out[0]), Math.round(out[1]), Math.round(out[2])];
    if (cache.size > 50000) cache.clear();
    cache.set(key, rounded);
    return rounded;
  };
  const cssCache = new Map<string, string>();
  const mapCss = (value: string): string => {
    const hit = cssCache.get(value);
    if (hit !== undefined) return hit;
    const v = value.trim().toLowerCase();
    let rgb: Rgb | null = null;
    let alpha: number | null = null;
    let m: RegExpExecArray | null;
    if ((m = /^#([0-9a-f]{3,4})$/.exec(v))) {
      rgb = [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as Rgb;
      if (m[1].length === 4) alpha = parseInt(m[1][3] + m[1][3], 16) / 255;
    } else if ((m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(v))) {
      rgb = hexToRgb(m[1]);
      if (m[2]) alpha = parseInt(m[2], 16) / 255;
    } else if ((m = /^rgba?\(([^)]+)\)$/.exec(v))) {
      const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
        rgb = [parts[0], parts[1], parts[2]];
        if (parts.length >= 4 && Number.isFinite(parts[3])) alpha = parts[3];
      }
    } else if (v === 'white') {
      rgb = [255, 255, 255];
    } else if (v === 'black') {
      rgb = [0, 0, 0];
    }
    let out = value;
    if (rgb) {
      const [r, g, b] = mapRgb(rgb);
      out = alpha === null || alpha >= 1 ? toHex([r, g, b]) : `rgba(${r},${g},${b},${alpha})`;
    }
    if (cssCache.size > 50000) cssCache.clear();
    cssCache.set(value, out);
    return out;
  };
  return { mapRgb, mapCss };
};

const recolourImage = (mapper: ThemeColorMapper, source: CanvasImageSource): HTMLCanvasElement | null => {
  const w = (source as HTMLImageElement).naturalWidth || (source as ImageBitmap).width;
  const h = (source as HTMLImageElement).naturalHeight || (source as ImageBitmap).height;
  if (!w || !h) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  (rawDrawImage as (...a: unknown[]) => void).call(ctx, source, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const [r, g, b] = mapper.mapRgb([d[i], d[i + 1], d[i + 2]]);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

let rawDrawImage: CanvasRenderingContext2D['drawImage'] | null = null;

/** The slice of Phaser's Graphics prototype the bridge patches (passed in so this module never imports Phaser). */
export interface ThemeGraphicsPrototype {
  fillStyle: (this: unknown, color?: number, alpha?: number) => unknown;
  lineStyle: (this: unknown, lineWidth: number, color?: number, alpha?: number) => unknown;
  renderCanvas: (this: unknown, ...args: unknown[]) => unknown;
}

// While a Graphics replays its recorded commands its colours were already decided (mapped, or exempted as cosmetic).
let graphicsReplayDepth = 0;
const passThrough = (): boolean => graphicsReplayDepth > 0 || isCosmeticColourScopeActive();

/**
 * Map a Phaser Graphics' colours when they are RECORDED (fillStyle / lineStyle), and mark its canvas replay so the
 * 2D-context hooks leave the replayed (already decided) colours alone.
 */
export const patchThemedGraphicsPrototype = (
  graphicsProto: ThemeGraphicsPrototype,
  mapper: ThemeColorMapper
): void => {
  const mapNumber = (color: number | undefined): number | undefined => {
    if (typeof color !== 'number' || !Number.isFinite(color) || isCosmeticColourScopeActive()) return color;
    const [r, g, b] = mapper.mapRgb([(color >> 16) & 255, (color >> 8) & 255, color & 255]);
    return (r << 16) | (g << 8) | b;
  };
  const { fillStyle, lineStyle, renderCanvas } = graphicsProto;
  graphicsProto.fillStyle = function themedFillStyle(this: unknown, color?: number, alpha?: number) {
    return fillStyle.call(this, mapNumber(color), alpha);
  };
  graphicsProto.lineStyle = function themedLineStyle(this: unknown, lineWidth: number, color?: number, alpha?: number) {
    return lineStyle.call(this, lineWidth, mapNumber(color), alpha);
  };
  graphicsProto.renderCanvas = function replayGraphics(this: unknown, ...args: unknown[]) {
    graphicsReplayDepth += 1;
    try {
      return renderCanvas.apply(this, args);
    } finally {
      graphicsReplayDepth -= 1;
    }
  };
};

export const installDarkThemeCanvasBridge = (
  themeId: keyof typeof mazerThemes,
  graphicsProto?: ThemeGraphicsPrototype
): void => {
  const tokens = mazerThemes[themeId];
  const mapper = createThemeColorMapper(tokens);
  const proto = CanvasRenderingContext2D.prototype;
  if (graphicsProto) patchThemedGraphicsPrototype(graphicsProto, mapper);
  for (const prop of ['fillStyle', 'strokeStyle', 'shadowColor'] as const) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc?.set || !desc.get) continue;
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get() { return desc.get!.call(this); },
      set(value: unknown) { desc.set!.call(this, typeof value === 'string' && !passThrough() ? mapper.mapCss(value) : value); }
    });
  }
  const addColorStop = CanvasGradient.prototype.addColorStop;
  CanvasGradient.prototype.addColorStop = function addThemedColorStop(offset: number, color: string) {
    return addColorStop.call(this, offset, passThrough() ? color : mapper.mapCss(color));
  };
  rawDrawImage = proto.drawImage;
  const themed = new WeakMap<object, HTMLCanvasElement | null>();
  proto.drawImage = function drawThemedImage(this: CanvasRenderingContext2D, source: CanvasImageSource, ...rest: number[]) {
    let src: CanvasImageSource = source;
    const isFileBitmap = (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement && source.complete)
      || (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap);
    if (isFileBitmap && !passThrough()) {
      let canvas = themed.get(source as object);
      if (canvas === undefined) {
        try { canvas = recolourImage(mapper, source); } catch { canvas = null; }
        themed.set(source as object, canvas);
      }
      if (canvas) src = canvas;
    }
    return (rawDrawImage as (...a: unknown[]) => void).call(this, src, ...rest);
  } as CanvasRenderingContext2D['drawImage'];

  // DOM surfaces: the token custom properties, the page background and the browser chrome colour.
  const root = document.documentElement;
  root.dataset.mazerTheme = themeId;
  const css = listCssCustomProperties()
    .filter(({ name, value }) => name.includes('-color-') && value.startsWith('#'))
    .map(({ name, value }) => `${name}: ${mapper.mapCss(value)};`)
    .join(' ');
  const style = document.createElement('style');
  style.id = 'mazer-theme-dark';
  style.textContent = `:root { ${css} } html, body { background: ${tokens.void} !important; }`;
  document.head.appendChild(style);
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', tokens.void));
};
