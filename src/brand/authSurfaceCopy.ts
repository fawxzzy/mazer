/**
 * Auth Surface v2 (owner-approved design, 2026-11-15): every word Mazer shows on its sign-in status screen, its
 * loaders, the boot splash, the boot-error screen and the install gate. The message rows are copied verbatim from
 * the shared copy matrix (mazer.* and signin.* / page.* ids) so Mazer, Fitness and the account site say the same
 * thing for the same failure; labels match the button the player actually sees ("Sign in").
 *
 * tests/reset/auth-surface-copy-lint.test.ts fails when a sentence on those screens is not in this module, and when
 * one of the retired phrases (Working…, Log In, Choose Sign in, Something went wrong, a "Code:" line, ...) comes back.
 * Keep this file free of imports: the boot splash, the install gate and the Phaser scene all read it.
 */

/** Matrix message rows (id -> text). All of them are error-tone notices. */
export const AUTH_SURFACE_MESSAGES = Object.freeze({
  'mazer.cancelled': 'Sign-in did not finish. Tap Sign in to try again.',
  'mazer.timeout': 'Sign-in took too long. Tap Sign in to try again.',
  'mazer.storage': 'This browser is blocking site data. Allow it, then tap Sign in.',
  'signin.unavailable': 'Sign-in is unavailable right now. Try again in a minute.',
  'signin.callback': 'We could not finish signing you in. Sign in again.',
  'signin.session': 'Your session ended. Sign in again to continue.',
  'signin.offline': 'No connection. Check your internet and try again.',
  'page.crash': 'Check your connection and try again.',
  'page.offline': 'You are offline. We will reconnect when you are back.'
} as const);

export type AuthSurfaceMessageId = keyof typeof AUTH_SURFACE_MESSAGES;

/** Labels, titles and leads. Sentence case; working labels end with an ellipsis character. */
export const AUTH_SURFACE_LABELS = Object.freeze({
  appName: 'Mazer',
  kicker: 'MAZER',
  signIn: 'Sign in',
  signingIn: 'Signing in…',
  opening: 'Opening Mazer…',
  signInLead: 'Sign in to play.',
  tryAgain: 'Try again',
  bootErrorTitle: 'Could not load',
  install: 'Install',
  copyLink: 'Copy link',
  privacy: 'Privacy',
  terms: 'Terms',
  legalNav: 'Legal'
} as const);

/** Install gate. Step text may carry one inline icon token: {share}, {add} or {dots}. */
export const AUTH_SURFACE_INSTALL_COPY = Object.freeze({
  title: 'Install Mazer',
  installedTitle: 'Mazer is installed',
  installedLead: 'Open it from your home screen.',
  installedDesktopLead: 'Open it from your desktop, Start menu or Dock.',
  leadPrompt: 'Install it for quick access, even offline.',
  leadHomeScreen: 'Add it to your home screen to use it as an app.',
  leadDesktop: 'Install it to use it as an app on this computer.',
  leadDesktopOther: 'This browser cannot install apps. Open this page in Chrome or Edge.',
  leadInAppIos: 'Open this page in Safari to install.',
  leadInAppAndroid: 'Open this page in Chrome to install.',
  stepsIos: ['Tap Share {share} in Safari.', 'Choose Add to Home Screen {add}.', 'Open the app from your home screen.'],
  stepsAndroid: ['Tap {dots} in your browser.', 'Choose Install app.', 'Open the app from your home screen.'],
  stepsInAppIos: ['Tap {dots} then Open in Safari.', 'Tap Share {share}, then Add to Home Screen.'],
  stepsInAppAndroid: ['Tap {dots} then Open in Chrome.', 'Tap {dots}, then Install app.'],
  stepsDesktopChromium: [
    'Click the install icon at the end of the address bar.',
    'Choose Install.',
    'Open the app from your desktop or Start menu.'
  ],
  stepsDesktopOther: [
    'Copy the link and open it in Chrome or Edge.',
    'Click the install icon in the address bar.',
    'Open the app from your desktop or Start menu.'
  ],
  copied: 'Link copied. Paste it into Safari or Chrome.',
  copyFailed: 'Could not copy the link. Copy the address from your browser instead.'
} as const);

/** Phrases the approved matrix retires. The lint test keeps them off every auth and install surface. */
export const AUTH_SURFACE_RETIRED_PHRASES = Object.freeze([
  'Working…',
  'Could not create account',
  'Something went wrong',
  'Wrong details',
  'Log In',
  'Create Account',
  'Choose Sign in',
  'Code: ',
  'shows on the Mazer leaderboard',
  'Signing you in'
] as const);

const collect = (value: unknown, out: string[]): void => {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((entry) => collect(entry, out));
  } else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((entry) => collect(entry, out));
  }
};

/** Every sentence and label in this module (used by the copy lint test). */
export const listAuthSurfaceStrings = (): string[] => {
  const out: string[] = [];
  collect([AUTH_SURFACE_MESSAGES, AUTH_SURFACE_LABELS, AUTH_SURFACE_INSTALL_COPY], out);
  return out;
};
