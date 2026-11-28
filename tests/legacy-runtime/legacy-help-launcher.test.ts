import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createLegacyHelpLauncher } from '../../src/legacy-runtime/legacyHelpLauncher';
import type { HelpMountHandle, HelpMountOptions } from '../../src/ui/help/helpMount';
import type { HelpSubmitPayload } from '../../src/ui/help/helpState';

/**
 * Help launcher (MAZER-ONB-001 family): the scene-facing seam. A fake mount stands in for the DOM sheet (no jsdom);
 * the submit seam is a mock, so nothing reaches the network.
 */

const ROOT = process.cwd();
const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf8').replace(/\r\n?/g, '\n');
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

const fakeMount = () => {
  const mounted: HelpMountOptions[] = [];
  const closes = vi.fn();
  const loadMount = vi.fn(async () => ({
    mountHelpPopup: (options: HelpMountOptions): HelpMountHandle => {
      mounted.push(options);
      let closed = false;
      return {
        close: () => { if (!closed) { closed = true; closes(); options.onClose(); } },
        isClosed: () => closed,
        popup: {} as HelpMountHandle['popup'],
        scrim: {} as HelpMountHandle['scrim']
      };
    }
  }));
  return { closes, loadMount, mounted };
};

describe('help launcher', () => {
  it('flag off: open() refuses and nothing loads', async () => {
    const mount = fakeMount();
    const launcher = createLegacyHelpLauncher({ isEnabled: () => false, loadMount: mount.loadMount, onClosed: vi.fn() });
    expect(launcher.isEnabled()).toBe(false);
    expect(launcher.open({ gameMode: 'menu', level: '3' })).toBe(false);
    await flush();
    expect(mount.loadMount).not.toHaveBeenCalled();
    expect(launcher.isOpen()).toBe(false);
  });

  it('the flag is read once per launcher life, and a throwing flag reads as off', () => {
    const isEnabled = vi.fn(() => true);
    const launcher = createLegacyHelpLauncher({ isEnabled, onClosed: vi.fn() });
    launcher.isEnabled();
    launcher.isEnabled();
    expect(isEnabled).toHaveBeenCalledTimes(1);
    const broken = createLegacyHelpLauncher({ isEnabled: () => { throw new Error('x'); }, onClosed: vi.fn() });
    expect(broken.isEnabled()).toBe(false);
  });

  it('opens once, hands the scene hooks to the sheet, and calls onClosed when it goes', async () => {
    const mount = fakeMount();
    const onClosed = vi.fn();
    const onAllTips = vi.fn();
    const launcher = createLegacyHelpLauncher({ isDarkTheme: () => true, isEnabled: () => true, loadMount: mount.loadMount, onClosed });
    expect(launcher.open({ gameMode: 'play', level: '12' }, { allTipsLabel: 'All tips', includeShards: true, onAllTips })).toBe(true);
    expect(launcher.isOpen()).toBe(true);
    expect(launcher.open({ gameMode: 'play', level: '12' })).toBe(false);
    await flush();
    expect(mount.mounted).toHaveLength(1);
    expect(mount.mounted[0]).toMatchObject({ allTipsLabel: 'All tips', includeShards: true, onAllTips, theme: 'dark' });
    mount.mounted[0]!.onClose();
    expect(launcher.isOpen()).toBe(false);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('submit sends the trimmed draft with the validated context (junk level becomes null)', async () => {
    const mount = fakeMount();
    const submit = vi.fn(async (_payload: HelpSubmitPayload) => ({ status: 'saved' as const }));
    const launcher = createLegacyHelpLauncher({ isEnabled: () => true, loadMount: mount.loadMount, onClosed: vi.fn(), submit });
    launcher.open({ gameMode: 'play', level: '12' });
    await flush();
    await mount.mounted[0]!.submit({ email: ' a@b.co ', message: ' hi ', notice: null, phase: 'sending', view: 'form' });
    expect(submit.mock.calls[0]![0]).toMatchObject({ p_email: 'a@b.co', p_game_mode: 'play', p_message: 'hi', p_player_level: 12 });

    const junk = createLegacyHelpLauncher({ isEnabled: () => true, loadMount: mount.loadMount, onClosed: vi.fn(), submit });
    junk.open({ gameMode: 'NOT A MODE!', level: 'abc' });
    await flush();
    await mount.mounted[1]!.submit({ email: 'a@b.co', message: 'hi', notice: null, phase: 'sending', view: 'form' });
    expect(submit.mock.calls[1]![0]).toMatchObject({ p_game_mode: null, p_player_level: null });
  });

  it('a failed chunk load (offline) closes cleanly and the game is untouched', async () => {
    const onClosed = vi.fn();
    const launcher = createLegacyHelpLauncher({
      isEnabled: () => true,
      loadMount: () => Promise.reject(new Error('chunk')),
      onClosed
    });
    expect(launcher.open({ gameMode: 'menu', level: '1' })).toBe(true);
    await flush();
    expect(launcher.isOpen()).toBe(false);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('destroy (scene shutdown) closes the sheet without calling onClosed; activate re-arms it', async () => {
    const mount = fakeMount();
    const onClosed = vi.fn();
    const launcher = createLegacyHelpLauncher({ isEnabled: () => true, loadMount: mount.loadMount, onClosed });
    launcher.open({ gameMode: 'menu', level: '1' });
    await flush();
    launcher.destroy();
    expect(mount.closes).toHaveBeenCalledTimes(1);
    expect(onClosed).not.toHaveBeenCalled();
    expect(launcher.open({ gameMode: 'menu', level: '1' })).toBe(false);
    launcher.activate();
    expect(launcher.open({ gameMode: 'menu', level: '1' })).toBe(true);
  });

  it('destroy while the chunk is still loading mounts nothing', async () => {
    const mount = fakeMount();
    const launcher = createLegacyHelpLauncher({ isEnabled: () => true, loadMount: mount.loadMount, onClosed: vi.fn() });
    launcher.open({ gameMode: 'menu', level: '1' });
    launcher.destroy();
    await flush();
    expect(mount.mounted).toHaveLength(0);
  });
});

describe('help stays out of the boot bundle (source pins)', () => {
  const launcher = read('src/legacy-runtime/legacyHelpLauncher.ts');
  const menu = read('src/scenes/MenuScene.ts');
  const main = read('src/boot/main.ts');

  it('only a dynamic import loads the sheet; the mount is imported as a type only', () => {
    expect(launcher).toContain("import('../ui/help/helpMount')");
    expect(launcher).toMatch(/import type \{[^}]*\} from '\.\.\/ui\/help\/helpMount'/);
    expect(launcher).not.toMatch(/^import \{[^}]*\} from '\.\.\/ui\/help\/(helpMount|helpPopup)'/m);
    expect(menu).not.toContain('ui/help');
    expect(main).not.toContain('ui/help');
  });

  it('the scene opens Help from both Menus and hides the pause surfaces while it is open', () => {
    expect(menu.match(/case 'help':\n\s+this\.openLegacyHelp\(\);/g)).toHaveLength(2);
    expect(menu).toMatch(/private buildPauseOverlay\(\): void \{\n\s+if \(this\.feedbackLauncher\.isOpen\(\)\) \{\n\s+return;\n\s+\}\n\s+if \(this\.helpLauncher\.isOpen\(\)\) \{\n\s+return;/);
    expect(menu).toContain('helpAvailable: this.helpLauncher.isEnabled()');
    // The rating prompt never mounts over Help.
    const idle = menu.slice(menu.indexOf('private isRatingPromptSurfaceIdle('), menu.indexOf('\n  }\n', menu.indexOf('private isRatingPromptSurfaceIdle(')));
    expect(idle).toContain('!this.helpLauncher.isOpen()');
  });

  it('Help is open to every player: no auth gate in the launcher', () => {
    expect(launcher).not.toMatch(/getAuthSnapshot|authenticated/);
  });

  it('Close and Escape never end a send in flight, and Escape never drops a typed draft (no duplicate rows)', () => {
    const mount = read('src/ui/help/helpMount.ts');
    expect(mount).toContain("if (popup.getDraft().phase !== 'sending') close();");
    expect(mount).toMatch(/onEscape: \(\) => \{[\s\S]*?draft\.phase !== 'sending' && !typed\) close\(\);/);
  });
});
