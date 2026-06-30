export type LegacyExitActionKind = 'window-close' | 'replace-about-blank';

export interface LegacyExitWindowLike {
  close?: () => void;
  location?: {
    replace?: (url: string) => void;
  };
}

export interface LegacyExitAction {
  kind: LegacyExitActionKind;
  targetUrl: string | null;
}

export const resolveLegacyExitAction = (): LegacyExitAction => ({
  kind: 'replace-about-blank',
  targetUrl: 'about:blank'
});

export const performLegacyBrowserSafeExit = (
  runtime: LegacyExitWindowLike | undefined
): LegacyExitAction => {
  const action = resolveLegacyExitAction();

  try {
    runtime?.close?.();
  } catch {
    // Browser close is best-effort only; the navigation fallback is the durable contract.
  }

  if (action.kind === 'replace-about-blank') {
    runtime?.location?.replace?.(action.targetUrl ?? 'about:blank');
  }

  return action;
};
