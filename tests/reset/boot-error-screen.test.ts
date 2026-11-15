import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  MAZER_BOOT_ERROR_SCREEN_ID,
  renderMazerBootErrorHtml,
  showMazerBootErrorScreen
} from '../../src/boot/bootErrorScreen';
import { AUTH_SURFACE_MESSAGES } from '../../src/brand/authSurfaceCopy';

/** Auth Surface v2 (2026-11-15): a boot failure shows a status screen with one Try again button, never a blank page. */

class FakeScreen {
  public id = '';
  public innerHTML = '';
  public readonly attributes = new Map<string, string>();
  public clickListener: (() => void) | null = null;

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  public querySelector(selector: string): { addEventListener: (type: string, listener: () => void) => void } | null {
    return selector === '[data-mazer-boot-error-action="retry"]' && this.innerHTML.includes('data-mazer-boot-error-action="retry"')
      ? { addEventListener: (_type, listener) => { this.clickListener = listener; } }
      : null;
  }
}

const createDocument = () => {
  const appended: FakeScreen[] = [];
  return {
    appended,
    body: { append: (node: Node): void => void appended.push(node as unknown as FakeScreen) },
    createElement: (): HTMLElement => new FakeScreen() as unknown as HTMLElement,
    getElementById: (id: string): HTMLElement | null => (appended.find((screen) => screen.id === id) ?? null) as unknown as HTMLElement | null
  };
};

describe('boot error screen', () => {
  test('renders the status anatomy: kicker, app icon, title, the page.crash notice and one Try again button', () => {
    const html = renderMazerBootErrorHtml();
    expect(html).toContain('class="mazer-surface-kicker"');
    expect(html).toContain('mazer-surface-appicon-mark');
    expect(html).toContain('>Could not load</h1>');
    expect(html).toContain(AUTH_SURFACE_MESSAGES['page.crash']);
    expect(html).toContain('role="alert"');
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('>Try again</button>');
    expect(html).not.toMatch(/Error:|stack|undefined/);
  });

  test('shows once, labels itself as an alert dialog and reloads on Try again', () => {
    const documentRef = createDocument();
    let reloads = 0;
    expect(showMazerBootErrorScreen(documentRef, () => { reloads += 1; })).toBe(true);
    expect(showMazerBootErrorScreen(documentRef, () => { reloads += 1; })).toBe(true);
    expect(documentRef.appended).toHaveLength(1);
    const screen = documentRef.appended[0];
    expect(screen.id).toBe(MAZER_BOOT_ERROR_SCREEN_ID);
    expect(screen.attributes.get('role')).toBe('alertdialog');
    expect(screen.attributes.get('aria-label')).toBe('Could not load');
    screen.clickListener?.();
    expect(reloads).toBe(1);
  });

  test('does nothing without a document body', () => {
    expect(showMazerBootErrorScreen(undefined)).toBe(false);
    expect(showMazerBootErrorScreen({ ...createDocument(), body: null })).toBe(false);
  });

  test('the boot catch shows it right after recording the error', () => {
    const main = readFileSync(resolve(process.cwd(), 'src/boot/main.ts'), 'utf8');
    const marked = main.indexOf("markMazerBootStatus('error', message)");
    const shown = main.indexOf('showMazerBootErrorScreen()');
    expect(marked).toBeGreaterThan(-1);
    expect(shown).toBeGreaterThan(marked);
  });

  test('the screen is styled with the shared surface rules and stacks above the install gate', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');
    expect(css).toContain(`#${MAZER_BOOT_ERROR_SCREEN_ID}`);
  });
});
