import { DARK_THEME_TOKENS, type MazerThemeTokens } from '../../theme/themes';

/**
 * Remaps the shared DOM design tokens to the device-local dark theme (neon purple) for the feedback popup. The
 * values come from DARK_THEME_TOKENS (the canvas bridge's source of truth), so this file holds no colour literal.
 * The default theme remaps nothing: tokens.css is the shipping look.
 */
export const feedbackDarkTokenMap = (tokens: MazerThemeTokens): Readonly<Record<string, string>> => ({
  '--mazer-token-color-bg-canvas': tokens.void,
  '--mazer-token-color-bg-shell': tokens.shell,
  '--mazer-token-color-bg-panel': tokens.panel,
  '--mazer-token-color-bg-elevated': tokens.elevated,
  '--mazer-token-color-line-subtle': tokens.line,
  '--mazer-token-color-line-normal': tokens.accentDeep,
  '--mazer-token-color-brand-mint': tokens.accent,
  '--mazer-token-color-text-primary': tokens.text,
  '--mazer-token-color-text-muted': tokens.textMuted,
  '--mazer-token-color-text-disabled': tokens.textDisabled,
  '--mazer-token-color-semantic-info': tokens.accentBright
});

export const applyFeedbackTheme = (target: HTMLElement, theme: 'default' | 'dark'): void => {
  target.dataset.mazerTheme = theme;
  if (theme !== 'dark') return;
  for (const [name, value] of Object.entries(feedbackDarkTokenMap(DARK_THEME_TOKENS))) {
    target.style.setProperty(name, value);
  }
};
