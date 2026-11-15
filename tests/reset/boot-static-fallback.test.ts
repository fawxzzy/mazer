import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { AUTH_SURFACE_LABELS, AUTH_SURFACE_MESSAGES } from '../../src/brand/authSurfaceCopy';
import { MAZER_BOOT_STATUS_WINDOW_KEY } from '../../src/boot/bootStatus';

/**
 * Auth Surface v2: when the game bundle never runs (it or one of its modules failed to load, or the browser cannot
 * run it), index.html swaps the static splash for "Could not load" and a Try again button. The words are the boot
 * error screen's (src/boot/bootErrorScreen.ts), which a boot that runs and then fails shows instead.
 */

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8').replace(/\r\n?/g, '\n');
const inlineScripts = [...html.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].map((match) => match[1]);
const fallbackScript = inlineScripts.find((script) => script.includes('mazer-boot-fallback')) ?? '';
const fallbackMarkup = /<section id="mazer-boot-fallback"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';

type Listener = (event?: unknown) => void;

interface FakeElement {
  hidden: boolean;
  parentNode: { removeChild: (node: FakeElement) => void } | null;
  listeners: Map<string, Listener>;
  addEventListener: (type: string, listener: Listener) => void;
}

const fakeElement = (hidden = false): FakeElement => {
  const element: FakeElement = {
    hidden,
    parentNode: null,
    listeners: new Map(),
    addEventListener: (type, listener) => { element.listeners.set(type, listener); }
  };
  return element;
};

/** Runs the inline script against a fake page and returns its handles. */
const runFallbackScript = (bootStatus?: unknown) => {
  const splash = fakeElement();
  const removed: FakeElement[] = [];
  splash.parentNode = { removeChild: (node) => { removed.push(node); } };
  const fallback = fakeElement(true);
  const retry = fakeElement();
  const elements: Record<string, FakeElement> = {
    'mazer-boot-splash': splash,
    'mazer-boot-fallback': fallback,
    'mazer-boot-fallback-retry': retry
  };
  const windowListeners = new Map<string, Listener>();
  const documentListeners = new Map<string, Listener>();
  const fakeWindow: Record<string, unknown> = {
    addEventListener: (type: string, listener: Listener, capture?: boolean) => {
      expect(capture, 'resource errors do not bubble; the listener must capture').toBe(true);
      windowListeners.set(type, listener);
    }
  };
  if (bootStatus !== undefined) {
    fakeWindow[MAZER_BOOT_STATUS_WINDOW_KEY] = bootStatus;
  }
  const fakeDocument = {
    getElementById: (id: string) => elements[id] ?? null,
    addEventListener: (type: string, listener: Listener) => { documentListeners.set(type, listener); }
  };
  const reload = vi.fn();
  new Function('window', 'document', 'location', fallbackScript)(fakeWindow, fakeDocument, { reload });
  return { fallback, removed, retry, reload, splash, windowListeners, documentListeners };
};

describe('index.html static fallback when the game bundle never runs', () => {
  test('the markup holds the boot-error words from the copy module, hidden until needed', () => {
    expect(fallbackMarkup).toContain(' hidden>');
    expect(fallbackMarkup).toContain(`>${AUTH_SURFACE_LABELS.kicker}</p>`);
    expect(fallbackMarkup).toContain(`>${AUTH_SURFACE_LABELS.bootErrorTitle}</h1>`);
    expect(fallbackMarkup).toContain(`aria-label="${AUTH_SURFACE_LABELS.bootErrorTitle}"`);
    expect(fallbackMarkup).toContain(`role="alert">${AUTH_SURFACE_MESSAGES['page.crash']}</p>`);
    expect(fallbackMarkup).toContain(`>${AUTH_SURFACE_LABELS.tryAgain}</button>`);
    // The id selector sets display, so [hidden] needs its own rule or the fallback would always show.
    expect(html).toContain('#mazer-boot-fallback[hidden] { display: none; }');
  });

  test('the script sits after the splash and the fallback markup and before the game bundle', () => {
    expect(fallbackScript).not.toBe('');
    const scriptAt = html.indexOf(fallbackScript);
    expect(scriptAt).toBeGreaterThan(html.indexOf('id="mazer-boot-splash"'));
    expect(scriptAt).toBeGreaterThan(html.indexOf('<section id="mazer-boot-fallback"'));
    expect(scriptAt).toBeLessThan(html.indexOf('<script type="module" src="/src/boot/main.ts">'));
  });

  test('parsed with no boot status (the bundle never ran): the splash goes and the fallback shows', () => {
    const page = runFallbackScript();
    expect(page.fallback.hidden).toBe(true);
    page.documentListeners.get('DOMContentLoaded')?.();
    expect(page.fallback.hidden).toBe(false);
    expect(page.removed).toEqual([page.splash]);
  });

  test('the bundle ran (boot status present): nothing changes, its own screens own the page', () => {
    const page = runFallbackScript({ stage: 'boot-start' });
    page.documentListeners.get('DOMContentLoaded')?.();
    page.windowListeners.get('error')?.({ target: { tagName: 'SCRIPT' } });
    expect(page.fallback.hidden).toBe(true);
    expect(page.removed).toEqual([]);
  });

  test('a script that fails to load shows the fallback at once; other resource errors do not', () => {
    const image = runFallbackScript();
    image.windowListeners.get('error')?.({ target: { tagName: 'IMG' } });
    image.windowListeners.get('error')?.({ message: 'runtime error, no element target' });
    expect(image.fallback.hidden).toBe(true);

    const script = runFallbackScript();
    script.windowListeners.get('error')?.({ target: { tagName: 'SCRIPT' } });
    expect(script.fallback.hidden).toBe(false);
    // Showing twice is a no-op (one listener on the button, the splash removed once).
    script.documentListeners.get('DOMContentLoaded')?.();
    expect(script.removed).toHaveLength(1);
  });

  test('Try again reloads the page', () => {
    const page = runFallbackScript();
    page.documentListeners.get('DOMContentLoaded')?.();
    page.retry.listeners.get('click')?.();
    expect(page.reload).toHaveBeenCalledTimes(1);
  });
});
