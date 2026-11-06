/**
 * Bounded wait for the self-hosted UI font (Space Grotesk, see
 * public/fonts/space-grotesk/). Phaser measures and rasterizes a Text object
 * once, with whatever face the canvas context resolves at that moment, and
 * never re-renders it when a web font arrives later. So the font has to be
 * loaded before the first Text is created. The wait is capped: a slow or
 * failing font fetch must never delay or block game creation, it only falls
 * back to the system stack declared after it.
 */

export const MAZER_UI_FONT_FAMILY = 'Space Grotesk';
/** Upper bound on how long boot may wait for the UI font. */
export const MAZER_FONT_READY_TIMEOUT_MS = 1_500;
/** Weights the game draws: 400/500/600 in DOM CSS, normal + bold (700) in Phaser canvas text. */
export const MAZER_UI_FONT_WEIGHTS = [400, 500, 600, 700] as const;

export type MazerFontReadyResult = 'loaded' | 'timeout' | 'error' | 'unsupported';

export interface MazerFontFaceSetLike {
  load(font: string, text?: string): Promise<unknown>;
}

export interface MazerFontReadyOptions {
  fonts?: MazerFontFaceSetLike | null;
  timeoutMs?: number;
  setTimeoutFn?: (callback: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

export const buildMazerUiFontLoadDescriptors = (): string[] => (
  MAZER_UI_FONT_WEIGHTS.map((weight) => `${weight} 16px "${MAZER_UI_FONT_FAMILY}"`)
);

export const waitForMazerUiFonts = async (options: MazerFontReadyOptions = {}): Promise<MazerFontReadyResult> => {
  const fonts = options.fonts !== undefined
    ? options.fonts
    : (typeof document === 'undefined' ? null : (document.fonts as MazerFontFaceSetLike | undefined) ?? null);
  if (!fonts || typeof fonts.load !== 'function') {
    return 'unsupported';
  }

  const setTimer = options.setTimeoutFn ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const clearTimer = options.clearTimeoutFn ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const timeoutMs = options.timeoutMs ?? MAZER_FONT_READY_TIMEOUT_MS;

  let timer: unknown;
  const timeout = new Promise<MazerFontReadyResult>((resolve) => {
    timer = setTimer(() => resolve('timeout'), timeoutMs);
  });
  const loaded = (async (): Promise<MazerFontReadyResult> => {
    try {
      await Promise.all(buildMazerUiFontLoadDescriptors().map((descriptor) => fonts.load(descriptor)));
      return 'loaded';
    } catch {
      return 'error';
    }
  })();

  try {
    return await Promise.race([loaded, timeout]);
  } finally {
    clearTimer(timer);
  }
};
