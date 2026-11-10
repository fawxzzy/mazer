import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  LEGACY_AUTH_MESSAGE_COPY,
  LEGACY_BOOT_MESSAGE_COPY,
  LEGACY_OVERLAY_MESSAGE_COPY,
  LEGACY_REMOTE_MESSAGE_COPY
} from '../../src/legacy-runtime/legacyPlayerMessage';

/**
 * Source-contract guard for the player-facing message inventory
 * (board card mazer-unified-player-message-system).
 *
 * The human-readable inventory is docs/ops/MAZER-PLAYER-MESSAGE-INVENTORY-2026-11-05.md.
 * This test reads the relevant source files as TEXT, parses them with the
 * TypeScript AST, and pins the set of player-facing status/notice/error
 * string literals. It is keyed on file + literal text (never on line
 * numbers), so unrelated edits cannot make it flaky.
 *
 * What it proves:
 *  1. A NEW raw player-facing string (one that is not in the pinned
 *     inventory, so was never classified) fails with a message that says how
 *     to route it through src/legacy-runtime/legacyPlayerMessage.ts.
 *  2. A pinned string that disappears fails, so the inventory cannot rot.
 *  3. The structural facts the inventory depends on (the message queue has no
 *     render surface yet, remote sync is deliberately silent, a few resolvers
 *     have no runtime consumer) are pinned. When a later wave changes one of
 *     them on purpose, this test fails and tells the author to update the
 *     inventory doc and the matching pin together.
 *
 * It does NOT change or assert runtime behaviour.
 */

type InventoryKind =
  /** Player-visible status/error text rendered directly, bypassing legacyPlayerMessage.ts. */
  | 'raw-status'
  /** Player-visible static informational / gate / empty-state / confirm copy (not a status event). */
  | 'raw-static'
  /** createLegacyPlayerMessage({ copy: '<literal>' }) at a call site (routed, but copy not in a table). */
  | 'routed-inline'
  /** A module-local friendly-error mapper that parallels legacyPlayerMessage.ts and renders raw. */
  | 'parallel-mapper'
  /** Provider-shaped or internal text that is mapped/never rendered; technical detail only. */
  | 'technical'
  /** Duplicate of a copy-table string on a path whose result text is never rendered. */
  | 'duplicate-unrendered'
  /** QA / diagnostics fixture text. */
  | 'fixture'
  /** Short eyebrow / column label, not a message. */
  | 'label'
  /** Static non-status copy: instructions, setting captions, a11y description, primitive tone labels. */
  | 'static';

interface InventoryEntry {
  readonly file: string;
  readonly literal: string;
  readonly kind: InventoryKind;
  readonly route: string;
}

const MENU = 'src/scenes/MenuScene.ts';

/**
 * The pinned inventory. `literal` is the exact string value; `{}` stands for a
 * template substitution. Add a row here AND in the inventory doc when a new
 * player-facing string is introduced, after deciding whether it must route
 * through legacyPlayerMessage.ts.
 */
const PINNED_INVENTORY: readonly InventoryEntry[] = [
  { file: MENU, literal: 'Signing you in…', kind: 'raw-status', route: 'LEGACY_AUTH_MESSAGE_COPY + message surface (auth gate loading)' },
  { file: MENU, literal: '{}\nManage your profile and account from the shared Fawxzzy account portal.', kind: 'raw-static', route: 'keep as screen helper copy' },
  { file: MENU, literal: 'Request timed out.', kind: 'raw-status', route: 'LEGACY_AUTH_MESSAGE_COPY.requestTimedOut, error tone (today diverges from the routed copy for the same event)' },
  { file: MENU, literal: 'Progression reset.', kind: 'routed-inline', route: 'move copy into LEGACY_PROGRESSION_MESSAGE_COPY; id progression.player.reset already routed' },
  { file: MENU, literal: 'Runtime diagnostics authenticated fixture.', kind: 'fixture', route: 'none (QA fixture)' },
  { file: 'src/boot/accessibilitySurface.ts', literal: 'Use Arrow keys or WASD to move through the maze. Press Enter to start, O for settings, P to pause or resume, and Escape to close a dialog.', kind: 'static', route: 'none (static a11y description)' },
  { file: 'src/boot/accessibilitySurface.ts', literal: 'Mazer is ready.', kind: 'static', route: 'static a11y live region; never updated today' },
  { file: 'src/boot/bootSplash.ts', literal: 'Loading…', kind: 'raw-status', route: 'boot splash neutral message (static markup in index.html, then updated by bootStatus); active pre-game surface; not routed through the message module' },
  { file: 'src/boot/bootSplash.ts', literal: 'Signing you in…', kind: 'raw-status', route: 'boot splash message shown only while an OAuth callback exchange is in progress; active pre-game surface; mirrors LEGACY_AUTH_MESSAGE_COPY wording' },
  { file: 'src/boot/installGate.ts', literal: 'Mazer only runs as an installed app, not in a browser tab.', kind: 'static', route: 'install gate subtitle (prompt-available and manual platform cards); active; gate copy, not a status event' },
  { file: 'src/boot/installGate.ts', literal: 'Press Install below.', kind: 'static', route: 'install gate step, prompt-available mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Confirm in your browser.', kind: 'static', route: 'install gate step, prompt-available mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Open Mazer from your home screen or desktop.', kind: 'static', route: 'install gate step, prompt-available mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Click the install icon at the end of the address bar, or open the browser menu and choose Install Mazer.', kind: 'static', route: 'install gate step, manual-desktop-chromium mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Confirm the install.', kind: 'static', route: 'install gate step, manual-desktop-chromium mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Open Mazer from your desktop or Start menu.', kind: 'static', route: 'install gate step, manual-desktop-chromium mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Open this page in Chrome or Edge. In Safari, choose File, then Add to Dock.', kind: 'static', route: 'install gate step, manual-desktop-other mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'In Chrome or Edge, click the install icon in the address bar.', kind: 'static', route: 'install gate step, manual-desktop-other mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Open Mazer from your desktop, Start menu or Dock.', kind: 'static', route: 'install gate step, manual-desktop-other mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Open this page in Chrome and tap the three-dot menu.', kind: 'static', route: 'install gate step, manual-android mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Choose Install app or Add to Home screen.', kind: 'static', route: 'install gate step, manual-android mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Open Mazer from your home screen.', kind: 'static', route: 'install gate step, manual-android and manual-ios modes (two source sites, one pin); active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Tap the Share button in Safari.', kind: 'static', route: 'install gate step, manual-ios mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Choose Add to Home Screen.', kind: 'static', route: 'install gate step, manual-ios mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Mazer only runs as an installed app, and in-app browsers cannot install it.', kind: 'static', route: 'install gate subtitle, in-app-browser mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Copy the link below.', kind: 'static', route: 'install gate step, in-app-browser mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Paste it into Safari or Chrome.', kind: 'static', route: 'install gate step, in-app-browser mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Install Mazer from there, then open it from your home screen.', kind: 'static', route: 'install gate step, in-app-browser mode; active; none (install instructions)' },
  { file: 'src/boot/installGate.ts', literal: 'Open it from your home screen or desktop.', kind: 'static', route: 'install gate subtitle, installed-open-app mode (post-install card); active; none (install instructions)' },
  { file: 'src/legacy-runtime/legacyAccountPortal.ts', literal: 'Account connection unavailable. Return to Mazer and try again.', kind: 'raw-status', route: 'LEGACY_AUTH_MESSAGE_COPY.accountConnectionUnavailable; today rendered directly in two places' },
  { file: 'src/legacy-runtime/legacyAuth.ts', literal: 'Account connected.', kind: 'raw-status', route: 'LEGACY_AUTH_MESSAGE_COPY.accountConnected (info is set on the snapshot with no render site)' },
  { file: 'src/legacy-runtime/legacyAuth.ts', literal: 'A previous password update is still pending. Please wait before trying a different password.', kind: 'technical', route: 'mapped by resolveLegacyPasswordRecoveryError; never rendered verbatim' },
  { file: 'src/legacy-runtime/legacyAuth.ts', literal: 'Failed to update password. Please try again.', kind: 'technical', route: 'mapped by resolveLegacyPasswordRecoveryError; never rendered verbatim' },
  { file: 'src/legacy-runtime/legacyAuth.ts', literal: 'Password update timed out.', kind: 'technical', route: 'mapped by resolveLegacyPasswordRecoveryError; never rendered verbatim' },
  { file: 'src/legacy-runtime/legacyAuth.ts', literal: 'That username is already taken.', kind: 'duplicate-unrendered', route: 'duplicate of LEGACY_AUTH_MESSAGE_COPY.usernameTaken; save result error is never rendered' },
  { file: 'src/legacy-runtime/legacyAuthPresentation.ts', literal: 'Checking your reset link…', kind: 'raw-status', route: 'password-recovery presentation helper; render through message surface' },
  { file: 'src/legacy-runtime/legacyAuthPresentation.ts', literal: 'Choose a new password.', kind: 'raw-status', route: 'password-recovery presentation helper; render through message surface' },
  { file: 'src/legacy-runtime/legacyAuthPresentation.ts', literal: 'Updating your password…', kind: 'raw-status', route: 'password-recovery presentation helper; render through message surface' },
  { file: 'src/legacy-runtime/legacyLeaderboard.ts', literal: 'The leaderboard is not available right now.', kind: 'parallel-mapper', route: 'fold into the message module (source system)' },
  { file: 'src/legacy-runtime/legacyLeaderboard.ts', literal: 'Could not reach the leaderboard. Check your connection and try again.', kind: 'parallel-mapper', route: 'fold into the message module (source system)' },
  { file: 'src/legacy-runtime/legacyLeaderboard.ts', literal: 'The leaderboard is not set up yet.', kind: 'parallel-mapper', route: 'fold into the message module (source system)' },
  { file: 'src/legacy-runtime/legacyOAuthRefresh.ts', literal: 'Account session refresh unavailable.', kind: 'technical', route: 'synthetic HTTP body consumed by the auth client; never rendered' },
  { file: 'src/ui/dom/MazerSwitch.ts', literal: 'On', kind: 'static', route: 'primitive state label' },
  { file: 'src/ui/dom/MazerSwitch.ts', literal: 'Off', kind: 'static', route: 'primitive state label' },
  { file: 'src/ui/dom/StatusBanner.ts', literal: 'Info', kind: 'static', route: 'primitive tone label' },
  { file: 'src/ui/dom/StatusBanner.ts', literal: 'Error', kind: 'static', route: 'primitive tone label' },
  { file: 'src/legacy-runtime/legacyAuthScreenView.ts', literal: 'Still opening. Continue in your browser or try again.', kind: 'duplicate-unrendered', route: 'auth-screen view-model copy table (rendered by the MenuScene Welcome screen); route through the message module when the render surface lands' },
  { file: 'src/legacy-runtime/legacyAuthScreenView.ts', literal: 'Opening…', kind: 'raw-status', route: 'dock label while the OAuth redirect is in flight; bounded to LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS (10 s), then Sign in + browser notice' },
  { file: 'src/legacy-runtime/legacyAuthScreenView.ts', literal: 'Loading…', kind: 'duplicate-unrendered', route: 'auth-screen view-model copy table (rendered by the MenuScene Welcome screen); route through the message module when the render surface lands' },
  { file: 'src/legacy-runtime/legacyAuthScreenView.ts', literal: 'Signing you in…', kind: 'duplicate-unrendered', route: 'auth-screen view-model copy table (rendered by the MenuScene Welcome screen); route through the message module when the render surface lands' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'Reach the star to clear the maze.', kind: 'static', route: 'Guide (How to play) sheet row copy; unrendered until the Settings wiring lane; updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'A play marker on a ringed tile shows where each maze begins.', kind: 'static', route: 'Guide (How to play) sheet row copy (Start row, added with the Chip board wiring); updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'You are the green rounded block inside a bright ring.', kind: 'static', route: 'Guide (How to play) sheet row copy; unrendered until the Settings wiring lane; updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'Touch and hold anywhere, then drag the way you want to go. Let go to stop.', kind: 'static', route: 'Guide (How to play) sheet row copy; unrendered until the Settings wiring lane; updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'A pulsing, colour-shifting line shows your route. {} in Settings fades old trail.', kind: 'static', route: 'Guide (How to play) sheet row copy; unrendered until the Settings wiring lane; updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'Some mazes wrap. Leave an open edge and you come out on the opposite side.', kind: 'static', route: 'Guide (How to play) sheet row copy; unrendered until the Settings wiring lane; updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'Each cleared maze raises your level. Mazes get harder as you climb.', kind: 'static', route: 'Guide (How to play) sheet row copy; unrendered until the Settings wiring lane; updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyProgressionResetFlow.ts', literal: 'Your level and leaderboard standing go back to Level 1. Your account, username and settings stay as they are. This can’t be undone.', kind: 'static', route: 'Reset progress confirm/status copy; rendered by the shared Settings reset card (MenuScene.buildProgressionResetConfirmationOverlay); fold into the message module later' },
  { file: 'src/legacy-runtime/legacyProgressionResetFlow.ts', literal: 'Connect to the internet to reset your account progress.', kind: 'static', route: 'Reset progress confirm/status copy; rendered by the shared Settings reset card (MenuScene.buildProgressionResetConfirmationOverlay); fold into the message module later' },
  { file: 'src/legacy-runtime/legacyProgressionResetFlow.ts', literal: 'Your account is still loading. Try again in a moment.', kind: 'static', route: 'Reset progress confirm/status copy; rendered by the shared Settings reset card (MenuScene.buildProgressionResetConfirmationOverlay); fold into the message module later' },
  { file: 'src/legacy-runtime/legacyProgressionResetFlow.ts', literal: 'Your level on this device goes back to Level 1. Your settings stay as they are. This can’t be undone.', kind: 'static', route: 'Reset progress confirm/status copy; rendered by the shared Settings reset card (MenuScene.buildProgressionResetConfirmationOverlay); fold into the message module later' },
  { file: 'src/legacy-runtime/legacyProgressionResetFlow.ts', literal: 'Progress reset. You are back at Level 1.', kind: 'static', route: 'Reset progress confirm/status copy; rendered by the shared Settings reset card (MenuScene.buildProgressionResetConfirmationOverlay); fold into the message module later' },
  { file: 'src/legacy-runtime/legacyProgressionResetFlow.ts', literal: 'Progress changed on another device. Nothing was reset. Check your level and try again.', kind: 'static', route: 'Reset progress confirm/status copy; rendered by the shared Settings reset card (MenuScene.buildProgressionResetConfirmationOverlay); fold into the message module later' },
  { file: 'src/legacy-runtime/legacyProgressionResetFlow.ts', literal: 'Could not reset your progress. Nothing was changed.', kind: 'static', route: 'Reset progress confirm/status copy; rendered by the shared Settings reset card (MenuScene.buildProgressionResetConfirmationOverlay); fold into the message module later' },
  { file: 'src/legacy-runtime/legacyProgressionResetFlow.ts', literal: 'Resetting…', kind: 'static', route: 'Reset progress working-state button label; rendered by the shared Settings reset card' },
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'Could not reach the leaderboard. Check your connection and try again.', kind: 'technical', route: 'source error string matched (never shown) so the leaderboard view-model can choose its designed state; the designed copy replaces it' },
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'The leaderboard is not set up yet.', kind: 'technical', route: 'source error string matched (never shown) so the leaderboard view-model can choose its designed state; the designed copy replaces it' },
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'Clear a maze to put your name on the board.', kind: 'raw-static', route: 'Leaderboard empty state body; rendered by the MenuScene leaderboard sheet; fold into the message module later' },
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'Something went wrong on our side. Try again in a moment.', kind: 'raw-static', route: 'Leaderboard failure state body (generic); rendered by the MenuScene leaderboard sheet; fold into the message module later' },
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'Loading the leaderboard…', kind: 'raw-static', route: 'Leaderboard loading status line; rendered by the MenuScene leaderboard sheet; fold into the message module later' },
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'Players appear on the leaderboard by username.', kind: 'raw-static', route: 'Leaderboard username-gate body; rendered by the MenuScene leaderboard sheet; fold into the message module later' },
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'It isn’t available yet. Check back soon.', kind: 'raw-static', route: 'Leaderboard not-set-up state body; rendered by the MenuScene leaderboard sheet; fold into the message module later' },
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'Reconnect to see the leaderboard. Your progress is saved on this device.', kind: 'raw-static', route: 'Leaderboard offline state body; rendered by the MenuScene leaderboard sheet; fold into the message module later' },
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'Loading your profile…', kind: 'raw-static', route: 'Leaderboard username-gate loading status line; rendered by the MenuScene leaderboard sheet; fold into the message module later' },
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'Check your connection and try again.', kind: 'raw-static', route: 'Leaderboard unreachable / profile-unavailable state body; rendered by the MenuScene leaderboard sheet; fold into the message module later' },
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'Sign in to see where you stand among other players.', kind: 'raw-static', route: 'Leaderboard signed-out state body; rendered by the MenuScene leaderboard sheet; fold into the message module later' },
  { file: 'src/legacy-runtime/legacyMazeFeatureRegistry.ts', literal: 'Checkpoint-chasing corridor carve that forms the base maze; every generated maze has it.', kind: 'technical', route: 'developer-facing feature registry description; never rendered to players' },
  { file: 'src/legacy-runtime/legacyMazeFeatureRegistry.ts', literal: 'Two or more checkpoint legs, so the route bends between waypoints instead of one straight leg.', kind: 'technical', route: 'developer-facing feature registry description; never rendered to players' },
  { file: 'src/legacy-runtime/legacyMazeFeatureRegistry.ts', literal: 'Heading-continuation bias that lengthens straight runs and reduces zig-zag.', kind: 'technical', route: 'developer-facing feature registry description; never rendered to players' },
  { file: 'src/legacy-runtime/legacyMazeFeatureRegistry.ts', literal: 'Disconnected-component pruning and goal rebasing so the playable graph is one connected component.', kind: 'technical', route: 'developer-facing feature registry description; never rendered to players' },
  { file: 'src/legacy-runtime/legacyMazeFeatureRegistry.ts', literal: 'Wall-bridge shortcuts that add loops and alternate routes.', kind: 'technical', route: 'developer-facing feature registry description; never rendered to players' },
  { file: 'src/legacy-runtime/legacyMazeFeatureRegistry.ts', literal: 'Left/right border openings paired across the board so the player can wrap horizontally.', kind: 'technical', route: 'developer-facing feature registry description; never rendered to players' },
  { file: 'src/legacy-runtime/legacyMazeFeatureRegistry.ts', literal: 'Top/bottom border openings paired across the board so the player can wrap vertically.', kind: 'technical', route: 'developer-facing feature registry description; never rendered to players' },
  { file: 'src/legacy-runtime/legacyMazeFeatureRegistry.ts', literal: 'Horizontal wrap pairing forced by a single-feeder, vertical-only wrap profile.', kind: 'technical', route: 'developer-facing feature registry description; never rendered to players' },
  { file: 'src/legacy-runtime/legacyMazeFeatureRegistry.ts', literal: 'Perimeter feeder spokes: single-tile border openings carved inward from each side.', kind: 'technical', route: 'developer-facing feature registry description; never rendered to players' },
  { file: 'src/legacy-runtime/legacyMazeFeatureRegistry.ts', literal: 'Opposite-border pairing pass that mirrors existing border openings onto the far side.', kind: 'technical', route: 'developer-facing feature registry description; never rendered to players' }
];

/**
 * Files whose literals are all provider/internal diagnostics that are folded
 * into technicalDetail by resolveLegacyRemoteSyncMessage and replaced with
 * LEGACY_REMOTE_MESSAGE_COPY before any player could see them. They are not
 * pinned one by one (there are ~23 and they are intentionally free-form);
 * the routing is pinned structurally instead (see the last describe block).
 */
const TECHNICAL_ONLY_FILES: readonly string[] = ['src/legacy-runtime/legacyRemoteProgression.ts'];

/**
 * Files deliberately not scanned. legacyPlayerMessage.ts is the sanctioned
 * home for player copy. legacyEndlessProgression.ts holds developer-facing
 * tuning descriptions that no screen renders.
 */
const UNSCANNED_FILES: readonly string[] = [
  'src/legacy-runtime/legacyPlayerMessage.ts',
  'src/legacy-runtime/legacyEndlessProgression.ts'
];

const SCAN_DIRS: readonly string[] = ['src/boot', 'src/legacy-runtime', 'src/ui/dom'];
const SINK_CALLS: ReadonlySet<string> = new Set(['createAuthInfoText', 'createAuthAccountSummaryCard', 'setText']);
const MESSAGE_PROPERTY_NAMES: ReadonlySet<string> = new Set(['error', 'info', 'copy', 'helper', 'message']);
const TEXT_SINK_MEMBERS: ReadonlySet<string> = new Set(['textContent', 'innerText']);
const SENTENCE = /^[A-Z][^\n]*\s[^\n]*\s[^\n]*[A-Za-z0-9}][.!?…]$/;

const root = process.cwd();
const normalize = (source: string): string => source.replace(/\r\n?/g, '\n');
const readSource = (path: string): string => normalize(readFileSync(resolve(root, path), 'utf8'));

const listTsFiles = (dir: string): string[] => readdirSync(resolve(root, dir))
  .filter((name) => name.endsWith('.ts'))
  .sort()
  .map((name) => `${dir}/${name}`);

const SCAN_FILES: readonly string[] = [
  MENU,
  ...SCAN_DIRS.flatMap(listTsFiles).filter((file) => !UNSCANNED_FILES.includes(file))
];

interface FoundLiteral {
  readonly file: string;
  readonly line: number;
  readonly literal: string;
  readonly context: string;
}

const literalText = (node: ts.Node): string | null => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((span) => `{}${span.literal.text}`).join('');
  }
  return null;
};

const findAncestor = (node: ts.Node, predicate: (candidate: ts.Node) => boolean): ts.Node | null => {
  for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
    if (predicate(parent)) {
      return parent;
    }
  }
  return null;
};

const calleeName = (call: ts.CallExpression | ts.NewExpression): string | null => {
  const expression = call.expression;
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return expression.kind === ts.SyntaxKind.SuperKeyword ? 'super' : null;
};

const isConsoleCall = (call: ts.CallExpression | ts.NewExpression): boolean => (
  ts.isCallExpression(call)
  && ts.isPropertyAccessExpression(call.expression)
  && call.expression.expression.getText() === 'console'
);

const scanFile = (file: string): FoundLiteral[] => {
  const source = readSource(file);
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
  const found: FoundLiteral[] = [];

  const visit = (node: ts.Node): void => {
    const value = literalText(node);
    if (value !== null && !ts.isTemplateExpression(node.parent) && !ts.isTemplateSpan(node.parent)) {
      const call = findAncestor(
        node,
        (candidate) => ts.isCallExpression(candidate) || ts.isNewExpression(candidate)
      ) as ts.CallExpression | ts.NewExpression | null;
      const name = call ? calleeName(call) : null;
      const isErrorOrLog = call !== null && (
        (name !== null && (/Error$/.test(name) || name === 'super')) || isConsoleCall(call)
      );
      const isThrown = findAncestor(node, ts.isThrowStatement) !== null;

      let context: string | null = null;
      if (call && name && SINK_CALLS.has(name)) {
        context = `sink:${name}`;
      }
      const property = findAncestor(node, ts.isPropertyAssignment) as ts.PropertyAssignment | null;
      if (!context && property && ts.isIdentifier(property.name) && MESSAGE_PROPERTY_NAMES.has(property.name.text)) {
        context = `prop:${property.name.text}`;
      }
      const assignment = findAncestor(
        node,
        (candidate) => ts.isBinaryExpression(candidate)
          && candidate.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) as ts.BinaryExpression | null;
      if (
        !context
        && assignment
        && ts.isPropertyAccessExpression(assignment.left)
        && TEXT_SINK_MEMBERS.has(assignment.left.name.text)
      ) {
        context = 'text-sink';
      }

      const looksLikeText = /[A-Za-z]/.test(value)
        && !/^#[0-9a-fA-F]{3,8}$/.test(value)
        && (/\s/.test(value) || /^[A-Z]/.test(value) || /(…|\.\.\.)$/.test(value));
      const looksLikeSentence = SENTENCE.test(value)
        || (/(…|\.\.\.)$/.test(value) && /^[A-Z]/.test(value));

      if (!isErrorOrLog && !isThrown && ((context !== null && looksLikeText) || looksLikeSentence)) {
        found.push({
          context: context ?? 'sentence',
          file,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          literal: value
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
};

// AST parsing of MenuScene.ts is CPU-bound; give it headroom when the whole suite runs in parallel.
const GUARD_TIMEOUT_MS = 30_000;

const keyOf = (file: string, literal: string): string => `${file}\u0000${literal}`;

const allSrcFiles = ((): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
      const child = join(dir, entry.name).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        walk(child);
      } else if (/\.(ts|mts|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts') && !entry.name.endsWith('.d.mts')) {
        out.push(child);
      }
    }
  };
  walk('src');
  return out.sort();
})();

const srcCache = new Map<string, string>();
const srcText = (file: string): string => {
  const cached = srcCache.get(file);
  if (cached !== undefined) {
    return cached;
  }
  const text = readSource(file);
  srcCache.set(file, text);
  return text;
};

/** Files under src that mention `name` as a whole word, minus the excluded ones. */
const consumersOf = (name: string, excluded: readonly string[]): string[] => {
  const pattern = new RegExp(`\\b${name}\\b`);
  return allSrcFiles.filter((file) => !excluded.includes(file) && pattern.test(srcText(file)));
};

describe('player-facing message inventory (source contract)', { timeout: GUARD_TIMEOUT_MS }, () => {
  const scanned = SCAN_FILES.flatMap((file) => scanFile(file));
  const pinnedKeys = new Set(PINNED_INVENTORY.map((entry) => keyOf(entry.file, entry.literal)));
  const technicalOnlyFound = scanned.filter((entry) => TECHNICAL_ONLY_FILES.includes(entry.file));
  const nonTechnical = scanned.filter((entry) => !TECHNICAL_ONLY_FILES.includes(entry.file));

  test('every scanned player-facing literal is classified in the pinned inventory', () => {
    const unclassified = nonTechnical.filter((entry) => !pinnedKeys.has(keyOf(entry.file, entry.literal)));
    const report = unclassified
      .map((entry) => `  - ${entry.file}:${entry.line} [${entry.context}] ${JSON.stringify(entry.literal)}`)
      .join('\n');
    expect(
      unclassified,
      `New player-facing string(s) are not in the message inventory:\n${report}\n`
      + 'Player-facing status, notice, and error text must route through '
      + 'src/legacy-runtime/legacyPlayerMessage.ts (copy table + createLegacyPlayerMessage/resolve*), '
      + 'not be written inline. If the string is genuinely static copy (instructions, a gate, an empty state), '
      + 'add a row to PINNED_INVENTORY in tests/reset/legacy-player-message-inventory.test.ts and to '
      + 'docs/ops/MAZER-PLAYER-MESSAGE-INVENTORY-2026-11-05.md with its kind and routing decision.'
    ).toEqual([]);
  });

  test('every pinned inventory row still exists in source (no stale inventory)', () => {
    const foundKeys = new Set(nonTechnical.map((entry) => keyOf(entry.file, entry.literal)));
    const stale = PINNED_INVENTORY.filter((entry) => !foundKeys.has(keyOf(entry.file, entry.literal)));
    const report = stale.map((entry) => `  - ${entry.file} ${JSON.stringify(entry.literal)} (${entry.kind})`).join('\n');
    expect(
      stale,
      `Pinned inventory row(s) no longer match source:\n${report}\n`
      + 'The string was changed, moved, or removed. Update PINNED_INVENTORY and '
      + 'docs/ops/MAZER-PLAYER-MESSAGE-INVENTORY-2026-11-05.md together (if it was routed through '
      + 'legacyPlayerMessage.ts, delete the row and record the new routing in the doc).'
    ).toEqual([]);
  });

  test('pinned inventory has unique rows and every scanned file exists', () => {
    expect(pinnedKeys.size).toBe(PINNED_INVENTORY.length);
    for (const file of [...SCAN_FILES, ...TECHNICAL_ONLY_FILES, ...UNSCANNED_FILES]) {
      expect(existsSync(resolve(root, file)), file).toBe(true);
    }
    expect(SCAN_FILES).toContain('src/legacy-runtime/legacyAuth.ts');
    expect(SCAN_FILES).toContain('src/legacy-runtime/legacyLeaderboard.ts');
    expect(SCAN_FILES).toContain('src/boot/bootStatus.ts');
  });

  test('inventory doc lists every pinned literal and names this guard', () => {
    const docPath = 'docs/ops/MAZER-PLAYER-MESSAGE-INVENTORY-2026-11-05.md';
    expect(existsSync(resolve(root, docPath)), docPath).toBe(true);
    const doc = readSource(docPath);
    expect(doc).toContain('tests/reset/legacy-player-message-inventory.test.ts');
    expect(doc).toContain('tests/reset/legacy-rank-vocabulary-guard.test.ts');
    const missing = PINNED_INVENTORY.filter((entry) => {
      const needle = entry.literal
        .split(/\{\}|\n/)
        .map((segment) => segment.trim())
        .sort((left, right) => right.length - left.length)[0] ?? '';
      return !doc.includes(needle);
    });
    expect(
      missing.map((entry) => `${entry.file} ${JSON.stringify(entry.literal)}`),
      'Inventory doc is missing pinned row(s); add them to the doc table.'
    ).toEqual([]);
  });

  test('routed copy tables are player-safe (no provider or internal wording)', () => {
    const tables = {
      LEGACY_AUTH_MESSAGE_COPY,
      LEGACY_BOOT_MESSAGE_COPY,
      LEGACY_OVERLAY_MESSAGE_COPY,
      LEGACY_REMOTE_MESSAGE_COPY
    } as const;
    const technical = /\b(failed to fetch|supabase|rpc|jwt|oauth|http|https|exception|stack|undefined|null|nan)\b/i;
    for (const [tableName, table] of Object.entries(tables)) {
      for (const [key, copy] of Object.entries(table as Record<string, string>)) {
        expect(copy.trim().length, `${tableName}.${key} is empty`).toBeGreaterThan(0);
        expect(copy, `${tableName}.${key} must end as a sentence`).toMatch(/[.!?…]$/);
        expect(technical.test(copy), `${tableName}.${key} leaks technical wording: ${copy}`).toBe(false);
      }
    }
  });

  test('legacyPlayerMessage.ts does not grow new inline player sentences outside its copy tables', () => {
    const file = 'src/legacy-runtime/legacyPlayerMessage.ts';
    const source = readSource(file);
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
    const tableNames = new Set([
      'LEGACY_AUTH_MESSAGE_COPY',
      'LEGACY_BOOT_MESSAGE_COPY',
      'LEGACY_REMOTE_MESSAGE_COPY',
      'LEGACY_OVERLAY_MESSAGE_COPY'
    ]);
    const inline: string[] = [];
    const visit = (node: ts.Node): void => {
      const value = literalText(node);
      if (value !== null && /^[A-Z][^\n]*\s[^\n]*[.!?]$/.test(value) && !/\$\{/.test(value)) {
        const declaration = findAncestor(node, ts.isVariableDeclaration) as ts.VariableDeclaration | null;
        const inTable = declaration !== null
          && ts.isIdentifier(declaration.name)
          && tableNames.has(declaration.name.text);
        if (!inTable) {
          inline.push(value);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    // Ratchet. Today three auth strings (invalid credentials, email not
    // confirmed, rate limit) are inline in resolveLegacyAuthFeedbackMessage.
    // Moving them into LEGACY_AUTH_MESSAGE_COPY lowers this number; adding more
    // inline copy must not raise it.
    expect(inline.length, `Inline sentences outside copy tables: ${JSON.stringify(inline)}`).toBeLessThanOrEqual(3);
  });
});

describe('message-system structure the inventory depends on', { timeout: GUARD_TIMEOUT_MS }, () => {
  const MESSAGE_MODULE = 'src/legacy-runtime/legacyPlayerMessage.ts';

  test('the message queue has no render surface yet (diagnostics-only)', () => {
    // visibleMessages is declared in the diagnostics type and filled in the
    // diagnostics payload, and nothing draws it. If a renderer is added
    // (the card's goal), this pin must flip and the inventory doc be updated.
    const menu = srcText(MENU);
    expect(menu.match(/\bvisibleMessages\b/g)?.length ?? 0).toBe(2);
    expect(
      consumersOf('resolveLegacyPlayerMessageColor', [MESSAGE_MODULE]),
      'A tone-colour consumer exists: a message render surface was added. Update the inventory doc and flip this pin.'
    ).toEqual([]);
    expect(
      consumersOf('LEGACY_PLAYER_MESSAGE_COLORS', [MESSAGE_MODULE]),
      'A tone-colour consumer exists: a message render surface was added. Update the inventory doc and flip this pin.'
    ).toEqual([]);
  });

  test('auth feedback is rendered from the raw snapshot, not from the resolved message', () => {
    const menu = srcText(MENU);
    // The Welcome screen feeds the raw snapshot into the auth-screen view-model
    // (error) and draws the optional info line; each raw site appears once.
    expect(
      menu.split('errorMessage: this.authSnapshot.error,').length - 1,
      'The raw auth error render site changed. Update the inventory doc (section: raw render sites).'
    ).toBe(1);
    expect(
      menu.split('this.authSnapshot.info?.trim()').length - 1,
      'The raw auth info render site changed. Update the inventory doc (section: raw render sites).'
    ).toBe(1);
  });

  test('remote sync results are deliberately silent for players', () => {
    const sourceFile = ts.createSourceFile(MENU, srcText(MENU), ts.ScriptTarget.ES2022, true);
    let bodyIdentifiers: string[] | null = null;
    const visit = (node: ts.Node): void => {
      if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'publishLegacyRemoteSyncResult') {
        const names: string[] = [];
        const collect = (child: ts.Node): void => {
          if (ts.isIdentifier(child)) {
            names.push(child.text);
          }
          ts.forEachChild(child, collect);
        };
        collect(node.body!);
        bodyIdentifiers = names;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    expect(bodyIdentifiers, 'publishLegacyRemoteSyncResult was not found in MenuScene.ts').not.toBeNull();
    for (const forbidden of ['pushLegacyPlayerMessage', 'setLatestOverlayMessage', 'createLegacyPlayerMessage']) {
      expect(
        bodyIdentifiers!.includes(forbidden),
        `publishLegacyRemoteSyncResult now calls ${forbidden}: sync outcomes became player-visible. Update the inventory doc.`
      ).toBe(false);
    }
  });

  test('remote-sync technical strings are replaced by routed copy before reaching a player', () => {
    for (const file of TECHNICAL_ONLY_FILES) {
      const source = srcText(file);
      expect(source).toContain('playerMessage: resolveLegacyRemoteSyncMessage(context, result)');
    }
    // The rule only matters while the file still carries free-form technical literals.
    const technicalLiterals = TECHNICAL_ONLY_FILES.flatMap((file) => scanFile(file));
    expect(technicalLiterals.length).toBeGreaterThan(0);
  });

  test('message resolvers with no runtime consumer stay documented as dormant', () => {
    const dormant: Array<{ name: string; excluded: string[] }> = [
      { name: 'resolveLegacyOverlayToggleMessage', excluded: [MESSAGE_MODULE] },
      { name: 'resolveLegacyOverlayMovementSpeedMessage', excluded: [MESSAGE_MODULE] },
      { name: 'resolveLegacyOverlayFieldCommitMessage', excluded: [MESSAGE_MODULE] },
      { name: 'LEGACY_OVERLAY_MESSAGE_COPY', excluded: [MESSAGE_MODULE] },
      { name: 'resolveLegacyAuthBottomFeedbackLabel', excluded: ['src/legacy-runtime/legacyAuthPresentation.ts'] },
      { name: 'createStatusBanner', excluded: ['src/ui/dom/StatusBanner.ts', 'src/ui/dom/index.ts'] }
    ];
    for (const { name, excluded } of dormant) {
      expect(
        consumersOf(name, excluded),
        `${name} gained a runtime consumer. Update the inventory doc (dormant resolvers) and drop it from this pin.`
      ).toEqual([]);
    }
  });

  test('boot errors reach the player only through the diagnostics window status', () => {
    const consumers = consumersOf('playerMessage', [MESSAGE_MODULE, 'src/boot/bootStatus.ts']);
    expect(
      consumers.sort(),
      'bootStatus playerMessage gained a consumer other than remote sync. Update the inventory doc.'
    ).toEqual(['src/legacy-runtime/legacyRemoteProgression.ts', 'src/scenes/MenuScene.ts']);
    expect(srcText('src/boot/main.ts')).toContain("markMazerBootStatus('error', message)");
  });
});
