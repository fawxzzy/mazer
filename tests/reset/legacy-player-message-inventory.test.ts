import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  LEGACY_ACCOUNT_USERNAME_MESSAGE_COPY,
  LEGACY_AUTH_MESSAGE_COPY,
  LEGACY_BOOT_MESSAGE_COPY,
  LEGACY_OAUTH_FAILURE_MESSAGE_COPY,
  LEGACY_OFFLINE_MESSAGE_COPY,
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
// Auth Surface v2 (2026-11-15): the sign-in status screen, loader labels, boot splash, boot-error screen and install
// cards read every visible line from src/brand/authSurfaceCopy.ts (the approved copy matrix, outside the scan dirs),
// so they have no rows here; tests/reset/auth-surface-copy-lint.test.ts fails on any of their text outside it.
const PINNED_INVENTORY: readonly InventoryEntry[] = [
  { file: MENU, literal: 'Progression reset.', kind: 'routed-inline', route: 'move copy into LEGACY_PROGRESSION_MESSAGE_COPY; id progression.player.reset already routed' },
  { file: MENU, literal: 'Runtime diagnostics authenticated fixture.', kind: 'fixture', route: 'none (QA fixture)' },
  { file: 'src/boot/accessibilitySurface.ts', literal: 'Touch and drag anywhere to move through the maze. With a keyboard, use Arrow keys or WASD to move, Enter to start, O for settings, P to pause or resume, and Escape to close a dialog.', kind: 'static', route: 'none (static a11y description)' },
  { file: 'src/boot/accessibilitySurface.ts', literal: 'Mazer is ready.', kind: 'static', route: 'static a11y live region; never updated today' },
  { file: 'src/legacy-runtime/legacyAuth.ts', literal: 'Account connected.', kind: 'raw-status', route: 'LEGACY_AUTH_MESSAGE_COPY.accountConnected (info is set on the snapshot with no render site)' },
  { file: 'src/legacy-runtime/legacyLeaderboard.ts', literal: 'The leaderboard is not available right now.', kind: 'parallel-mapper', route: 'fold into the message module (source system)' },
  { file: 'src/legacy-runtime/legacyLeaderboard.ts', literal: 'Could not reach the leaderboard. Check your connection and try again.', kind: 'parallel-mapper', route: 'fold into the message module (source system)' },
  { file: 'src/legacy-runtime/legacyLeaderboard.ts', literal: 'The leaderboard is not set up yet.', kind: 'parallel-mapper', route: 'fold into the message module (source system)' },
  { file: 'src/legacy-runtime/legacyOAuthRefresh.ts', literal: 'Account session refresh unavailable.', kind: 'technical', route: 'synthetic HTTP body consumed by the auth client; never rendered' },
  { file: 'src/ui/dom/MazerSwitch.ts', literal: 'On', kind: 'static', route: 'primitive state label' },
  { file: 'src/ui/dom/MazerSwitch.ts', literal: 'Off', kind: 'static', route: 'primitive state label' },
  { file: 'src/ui/dom/StatusBanner.ts', literal: 'Info', kind: 'static', route: 'primitive tone label' },
  { file: 'src/ui/dom/StatusBanner.ts', literal: 'Error', kind: 'static', route: 'primitive tone label' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'The same menu pauses the run. Reset level restarts the maze, Main menu leaves it.', kind: 'static', route: 'Guide row copy (the In a maze row, pinned to the Guide data module)' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'Reach the spinning twin stars to clear the maze.', kind: 'static', route: 'Guide (How to play) sheet row copy; unrendered until the Settings wiring lane; updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'The spinning pinwheel on the first tile is where you set off.', kind: 'static', route: 'Guide (How to play) sheet row copy (Start row, added with the Chip board wiring; pinwheel wording MAZER-VIS-065); updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'You are the colour-shifting spark. It points the way you move.', kind: 'static', route: 'Guide (How to play) sheet row copy; unrendered until the Settings wiring lane; updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'Touch and drag anywhere to move. With a mouse, click and drag. Let go to stop.', kind: 'static', route: 'Guide (How to play) sheet row copy; unrendered until the Settings wiring lane; updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'Star dust marks your route; step back to wipe it. {} in Settings calms it.', kind: 'static', route: 'Guide (How to play) sheet row copy; unrendered until the Settings wiring lane; updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'Some mazes wrap around open edges. Edge stars fill with your colour as beams hit.', kind: 'static', route: 'Guide (How to play) sheet row copy; unrendered until the Settings wiring lane; updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'Later mazes hide a wrap behind a pale tile with a dashed ring. Walk onto it to open it.', kind: 'static', route: 'Guide (How to play) Wrap gate row copy (MAZER-L10 bleed gate); updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'The dot and number at the top left show how many players are online right now.', kind: 'static', route: 'Guide (How to play) sheet row copy for the menu online counter (MAZER-UI-024; no longer beside an icon since L6); updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'Top right: Settings (Dark mode), Guide, Sound, Profile, Leaderboard.', kind: 'static', route: 'Guide (How to play) sheet row copy for the main-menu dropdown button (L6; no Feedback row since 2026-11-25, the rating offers itself on main-menu entry); updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'Endless mode: clears show your time and level. Harder mazes add shortcuts and loops.', kind: 'static', route: 'Guide (How to play) sheet row copy; unrendered until the Settings wiring lane; updated with the game per docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md' },
  { file: 'src/legacy-runtime/legacyControlHint.ts', literal: 'Touch and drag anywhere to move.', kind: 'static', route: 'level-1 control hint (MAZER-FLOW-001); one-time, per device, non-blocking DOM line; copy follows the input actually used (touch, mouse, keys) and starts neutral on a computer; same wording as the Guide controls rows' },
  { file: 'src/legacy-runtime/legacyControlHint.ts', literal: 'Click and drag, or use arrows / WASD.', kind: 'static', route: 'level-1 control hint (MAZER-FLOW-001); one-time, per device, non-blocking DOM line; copy follows the input actually used (touch, mouse, keys) and starts neutral on a computer; same wording as the Guide controls rows' },
  { file: 'src/legacy-runtime/legacyControlHint.ts', literal: 'Arrow keys or WASD to move.', kind: 'static', route: 'level-1 control hint (MAZER-FLOW-001); one-time, per device, non-blocking DOM line; copy follows the input actually used (touch, mouse, keys) and starts neutral on a computer; same wording as the Guide controls rows' },
  { file: 'src/legacy-runtime/legacyControlHint.ts', literal: 'Drag anywhere, or use arrows / WASD.', kind: 'static', route: 'level-1 control hint (MAZER-FLOW-001); one-time, per device, non-blocking DOM line; copy follows the input actually used (touch, mouse, keys) and starts neutral on a computer; same wording as the Guide controls rows' },
  { file: 'src/legacy-runtime/legacyControlHint.ts', literal: 'Reach the star to clear the maze.', kind: 'static', route: 'level-1 control hint (MAZER-FLOW-001); one-time, per device, non-blocking DOM line; copy follows the input actually used (touch, mouse, keys) and starts neutral on a computer; same wording as the Guide controls rows' },
  { file: 'src/legacy-runtime/legacyFloatingAnchorPreference.ts', literal: 'When you drag far, your touch point follows your finger, so turning back is short. This device only.', kind: 'static', route: 'Settings sheet description under the Floating anchor row (MAZER-L9); device-local, default on (CTRL-003 option B); every setting row must carry one' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'Sound is on by default: soft ticks on steps, bumps and wins. Turn it off from the Menu.', kind: 'static', route: 'Guide row copy for the Sound effects setting (MAZER-AUDIO-003); instructions, guide-synced' },
  { file: 'src/legacy-runtime/legacyDarkModePreference.ts', literal: 'Dark look with neon purple accents. Your skins keep their colours. Reloads the game.', kind: 'static', route: 'Settings sheet description under the Dark mode row (MAZER-UI-102); device-local, default off; every setting row must carry one' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'Gates open and shut on a beat. Wait for the gap, then go through.', kind: 'static', route: 'Guide hazard row copy (slice H6), also the HAZ-008 intro card text; shown only while the hazard layer is on; guide-synced, claims pinned to the hazard manifest' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'Sentries pace a short route. A touch sends you back to your last junction.', kind: 'static', route: 'Guide hazard row copy (slice H6), also the HAZ-008 intro card text; shown only while the hazard layer is on; guide-synced, claims pinned to the hazard manifest' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'A Hunter chases you, slower than you move. It gives up after three catches.', kind: 'static', route: 'Guide hazard row copy (slice H6), also the HAZ-008 intro card text; shown only while the hazard layer is on; guide-synced, claims pinned to the hazard manifest' },
  { file: 'src/legacy-runtime/legacyGuideContent.ts', literal: 'Collect the shard first. The star stays locked until you do.', kind: 'static', route: 'Guide hazard row copy (slice H6), also the HAZ-008 intro card text; shown only while the hazard layer is on; guide-synced, claims pinned to the hazard manifest' },
  { file: 'src/legacy-runtime/legacySettingsSheetPlan.ts', literal: 'Buzzes on steps, wall bumps and wins. Silent with Reduce motion, and on iPhone.', kind: 'static', route: 'Settings sheet description under the Haptics row (MAZER-UI-026); every setting row must carry one' },
  { file: 'src/legacy-runtime/legacySettingsSheetPlan.ts', literal: 'Sets your level back to 1. Asks you to confirm first.', kind: 'static', route: 'Settings sheet description under the Reset progress row (MAZER-UI-026); every setting row must carry one' },
  { file: 'src/legacy-runtime/legacySettingsSheetPlan.ts', literal: 'Signs this device out. Your progress stays on your account.', kind: 'static', route: 'Settings sheet description under the Sign out row (MAZER-UI-026); every setting row must carry one' },
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
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'You have no position yet.', kind: 'raw-static', route: 'Pinned self row accessibility label (not painted); fold into the message module later' },
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'You are at position {}, level {}.', kind: 'raw-static', route: 'Pinned self row accessibility label (not painted); fold into the message module later' },
  { file: 'src/legacy-runtime/legacyGameModes.ts', literal: 'Highest level reached on the generated ladder.', kind: 'technical', route: 'registry metadata, never rendered (the Endless tab label is the registry label, painted by the leaderboard sheet); documented in docs/architecture/MAZER-GAME-MODES-PRODUCT-CONTRACT.md' },
  { file: 'src/legacy-runtime/legacyGameModes.ts', literal: 'Obstacles and enemies. Stay out of Endless; a separate mode with its own ladder and leaderboard tab. Nothing is built.', kind: 'technical', route: 'reserved future-mode slot note, never rendered; documented in docs/architecture/MAZER-GAME-MODES-PRODUCT-CONTRACT.md' },
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'Something went wrong on our side. Try again in a moment.', kind: 'raw-static', route: 'Leaderboard failure state body (generic); rendered by the MenuScene leaderboard sheet; fold into the message module later' },
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'Loading the leaderboard…', kind: 'raw-static', route: 'Leaderboard loading status line; rendered by the MenuScene leaderboard sheet; fold into the message module later' },
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'Choose it on the account site: open the menu and tap Profile.', kind: 'raw-static', route: 'Leaderboard username-gate body (MAZER-ACCT-047: names change on the account site); rendered by the MenuScene leaderboard sheet; fold into the message module later' },
  { file: 'src/legacy-runtime/legacyLeaderboardView.ts', literal: 'To change your name, open the menu and tap Profile.', kind: 'raw-static', route: 'Leaderboard You-row hint (MAZER-ACCT-047); rendered by the MenuScene leaderboard sheet; fold into the message module later' },
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

  test('MAZER-UI-030: only the offline cache warning is routed from the service worker to the toast', () => {
    const doc = readSource('docs/ops/MAZER-PLAYER-MESSAGE-INVENTORY-2026-11-05.md');
    expect(doc).toContain('`boot.service-worker-error`');
    expect(doc).toContain('serviceWorkerCacheWarning.ts');
    expect(readSource(MENU)).toContain('subscribeServiceWorkerCacheWarning(');
    const main = readSource('src/boot/main.ts');
    expect(main).toContain('reportServiceWorkerCacheWarning(');
    // Boot errors stay on the splash; remote sync stays silent.
    expect(readSource('src/boot/bootStatus.ts')).not.toContain('serviceWorkerCacheWarning');
    expect(readSource('src/legacy-runtime/legacyRemoteProgression.ts')).not.toContain('serviceWorkerCacheWarning');
    expect(LEGACY_BOOT_MESSAGE_COPY.serviceWorkerError).toBe('The offline cache could not update. The game can still run online.');
  });

  test('routed copy tables are player-safe (no provider or internal wording)', () => {
    const tables = {
      LEGACY_ACCOUNT_USERNAME_MESSAGE_COPY,
      LEGACY_AUTH_MESSAGE_COPY,
      LEGACY_BOOT_MESSAGE_COPY,
      LEGACY_OAUTH_FAILURE_MESSAGE_COPY,
      LEGACY_OFFLINE_MESSAGE_COPY,
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
      'LEGACY_ACCOUNT_USERNAME_MESSAGE_COPY',
      'LEGACY_AUTH_MESSAGE_COPY',
      'LEGACY_BOOT_MESSAGE_COPY',
      'LEGACY_OAUTH_FAILURE_MESSAGE_COPY',
      // MAZER-ACCT-044 transition table (previous generic spelling); delete with the shim.
      'LEGACY_OAUTH_PREVIOUS_COPY',
      'LEGACY_REMOTE_MESSAGE_COPY',
      'LEGACY_OFFLINE_MESSAGE_COPY',
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

  test('the message queue is drawn as a toast (MAZER-UI-018)', () => {
    // visibleMessages stays a diagnostics-only mirror (declared + filled); the
    // player-facing surface is the toast: MenuScene draws rows resolved by the
    // pure toast module, whose colours come from the tone table.
    const menu = srcText(MENU);
    expect(menu.match(/\bvisibleMessages\b/g)?.length ?? 0).toBe(2);
    expect(menu).toContain('private drawLegacyPlayerMessageToast(time: number): void');
    expect(menu).toContain('resolveLegacyPlayerMessageToastFrame(this.playerMessageQueue, time, width)');
    expect(
      menu.split('this.drawLegacyPlayerMessageToast(time);').length - 1,
      'The toast must be drawn in both the overlay and the menu/play update paths.'
    ).toBe(2);
    expect(
      consumersOf('resolveLegacyPlayerMessageColor', [MESSAGE_MODULE]),
      'The toast module is the only consumer of the tone colour resolver.'
    ).toEqual(['src/legacy-runtime/legacyPlayerMessageToast.ts']);
  });

  test('auth feedback is rendered from the raw snapshot, not from the resolved message', () => {
    const menu = srcText(MENU);
    // The failure fallback feeds the snapshot error into the status view-model once, through the player-safe
    // resolver (Auth Surface v2), and the status module then maps it onto a copy-matrix line.
    // The raw info line is gone with the Welcome screen (MAZER-ACCT-043): the fallback draws one status line only.
    expect(
      menu.split('errorMessage: resolveLegacyAuthFeedbackMessage(this.authSnapshot.error, null, this.authSnapshot.errorCode)?.copy ?? null,').length - 1,
      'The raw auth error render site changed. Update the inventory doc (section: raw render sites).'
    ).toBe(1);
    expect(
      menu.split('this.authSnapshot.info?.trim()').length - 1,
      'The raw auth info render site changed. Update the inventory doc (section: raw render sites).'
    ).toBe(0);
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
      { name: 'createStatusBanner', excluded: ['src/ui/dom/StatusBanner.ts', 'src/ui/dom/index.ts', 'src/ui/feedback/feedbackPopup.ts', 'src/ui/feedback/feedbackOptionsMain.ts'] }
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
