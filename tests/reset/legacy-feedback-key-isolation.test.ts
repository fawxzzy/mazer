import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { installLegacyControlHint } from '../../src/render/legacyControlHintOverlay';
import {
  FEEDBACK_SCRIM_CLASS,
  installFeedbackKeyIsolation,
  isInsideFeedbackPopup
} from '../../src/ui/feedback/feedbackKeyIsolation';

/**
 * MAZER-FB-001: keys typed into the feedback note must never reach the game behind the popup. The repo has no DOM
 * test environment, so this file builds a tiny event tree (window > document > body > nodes) that runs the real
 * capture / target / bubble phases with stopPropagation, and drives the real listeners against it: the popup's key
 * isolation, the level-1 control hint (a capture-phase window listener), and stand-ins for the game's bubble-phase
 * handlers (Phaser's window keyboard, MenuScene's document key handlers).
 */

type Listener = { type: string; fn: (event: FakeEvent) => void; capture: boolean };

interface FakeEvent {
  readonly type: string;
  readonly key: string;
  readonly target: FakeNode;
  readonly isTrusted: boolean;
  readonly shiftKey: boolean;
  defaultPrevented: boolean;
  stopped: boolean;
  stopPropagation: () => void;
  preventDefault: () => void;
}

class FakeNode {
  parent: FakeNode | null = null;
  readonly children: FakeNode[] = [];
  readonly classes = new Set<string>();
  readonly listeners: Listener[] = [];
  readonly style: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  id = '';
  textContent = '';
  constructor(readonly name: string, classes: string[] = []) {
    for (const value of classes) this.classes.add(value);
  }
  addEventListener(type: string, fn: (event: FakeEvent) => void, options?: boolean | { capture?: boolean }): void {
    this.listeners.push({ capture: options === true || (typeof options === 'object' && options.capture === true), fn, type });
  }
  removeEventListener(type: string, fn: (event: FakeEvent) => void): void {
    const index = this.listeners.findIndex((entry) => entry.type === type && entry.fn === fn);
    if (index >= 0) this.listeners.splice(index, 1);
  }
  append(...nodes: FakeNode[]): void {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }
  remove(): void {
    if (this.parent === null) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
  closest(selector: string): FakeNode | null {
    const wanted = selector.replace(/^\./, '');
    for (let node: FakeNode | null = this; node !== null; node = node.parent) {
      if (node.classes.has(wanted)) return node;
    }
    return null;
  }
}

const dispatch = (target: FakeNode, type: string, key: string, shiftKey = false): FakeEvent => {
  const event: FakeEvent = {
    defaultPrevented: false,
    isTrusted: true,
    key,
    preventDefault: () => { event.defaultPrevented = true; },
    shiftKey,
    stopPropagation: () => { event.stopped = true; },
    stopped: false,
    target,
    type
  };
  const path: FakeNode[] = [];
  for (let node: FakeNode | null = target; node !== null; node = node.parent) path.unshift(node);
  const run = (node: FakeNode, phase: 'capture' | 'target' | 'bubble'): void => {
    for (const listener of [...node.listeners]) {
      if (listener.type !== type) continue;
      if (phase === 'capture' && !listener.capture) continue;
      if (phase === 'bubble' && listener.capture) continue;
      listener.fn(event);
    }
  };
  for (const node of path.slice(0, -1)) {
    run(node, 'capture');
    if (event.stopped) return event;
  }
  run(target, 'target');
  if (event.stopped) return event;
  for (const node of path.slice(0, -1).reverse()) {
    run(node, 'bubble');
    if (event.stopped) return event;
  }
  return event;
};

const buildPage = () => {
  const win = new FakeNode('window');
  const doc = new FakeNode('document');
  const body = new FakeNode('body');
  const canvas = new FakeNode('canvas');
  const scrim = new FakeNode('scrim', [FEEDBACK_SCRIM_CLASS, `${FEEDBACK_SCRIM_CLASS}--card`]);
  const card = new FakeNode('card');
  const note = new FakeNode('textarea');
  win.append(doc);
  doc.append(body);
  body.append(canvas, scrim);
  scrim.append(card);
  card.append(note);
  return { body, canvas, card, doc, note, scrim, win };
};

describe('MAZER-FB-001 keys typed into the feedback note never reach the game', () => {
  test('the popup target check finds the scrim from any node inside it, and nothing outside it', () => {
    const page = buildPage();
    expect(isInsideFeedbackPopup(page.note as never)).toBe(true);
    expect(isInsideFeedbackPopup(page.scrim as never)).toBe(true);
    expect(isInsideFeedbackPopup(page.canvas as never)).toBe(false);
    expect(isInsideFeedbackPopup(page.win as never)).toBe(false);
    expect(isInsideFeedbackPopup(null)).toBe(false);
    expect(isInsideFeedbackPopup({} as never)).toBe(false);
  });

  test('bubble-phase game handlers (window keyboard, document key handlers) never fire for keys typed in the note', () => {
    const page = buildPage();
    const windowKeys = vi.fn();
    const documentKeys = vi.fn();
    for (const type of ['keydown', 'keyup', 'keypress']) {
      page.win.addEventListener(type, windowKeys);
      page.doc.addEventListener(type, documentKeys);
    }
    const onEscape = vi.fn();
    const onTab = vi.fn();
    installFeedbackKeyIsolation(page.scrim as never, { onEscape, onTab });

    for (const key of [' ', 'p', 'P', 'Enter', 'ArrowUp', 'w', 'o', 'Escape', 'Tab']) {
      for (const type of ['keydown', 'keyup', 'keypress']) {
        dispatch(page.note, type, key);
      }
    }
    expect(windowKeys).not.toHaveBeenCalled();
    expect(documentKeys).not.toHaveBeenCalled();
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onTab).toHaveBeenCalledTimes(1);

    // The same keys on the game canvas still reach the game.
    dispatch(page.canvas, 'keydown', 'ArrowUp');
    dispatch(page.canvas, 'keyup', 'ArrowUp');
    expect(windowKeys).toHaveBeenCalledTimes(2);
    expect(documentKeys).toHaveBeenCalledTimes(2);
  });

  test('Escape closes with the default prevented; Tab is handed to the focus trap; other keys keep their default', () => {
    const page = buildPage();
    const onEscape = vi.fn();
    const onTab = vi.fn();
    installFeedbackKeyIsolation(page.scrim as never, { onEscape, onTab });
    expect(dispatch(page.note, 'keydown', 'Escape').defaultPrevented).toBe(true);
    expect(onEscape).toHaveBeenCalledTimes(1);
    dispatch(page.note, 'keydown', 'Tab', true);
    expect(onTab).toHaveBeenCalledTimes(1);
    expect(onTab.mock.calls[0][0]).toMatchObject({ key: 'Tab', shiftKey: true });
    // Typing must still type: a letter or Space is never default-prevented by the isolation.
    expect(dispatch(page.note, 'keydown', ' ').defaultPrevented).toBe(false);
    expect(dispatch(page.note, 'keydown', 'w').defaultPrevented).toBe(false);
  });

  test('the capture-phase control hint ignores a move key typed in the note, and still hides on a real move key', () => {
    const page = buildPage();
    installFeedbackKeyIsolation(page.scrim as never, { onEscape: vi.fn(), onTab: vi.fn() });
    const stored = new Map<string, string>();
    const storage = {
      getItem: (key: string) => stored.get(key) ?? null,
      removeItem: (key: string) => { stored.delete(key); },
      setItem: vi.fn((key: string, value: string) => { stored.set(key, value); })
    };
    let tick: () => void = () => undefined;
    const win = Object.assign(page.win, {
      clearInterval: vi.fn(),
      document: Object.assign(page.doc, { body: page.body, createElement: (name: string) => new FakeNode(name) }),
      localStorage: storage,
      matchMedia: () => ({ matches: false }),
      navigator: { maxTouchPoints: 0, userAgent: 'test' },
      performance: { now: () => 0 },
      requestAnimationFrame: (fn: () => void) => { fn(); return 1; },
      setInterval: (fn: () => void) => { tick = fn; return 1; },
      setTimeout: (fn: () => void) => { fn(); return 1; }
    });
    const scene = { mode: 'play', overlay: 'none', progressionState: { tracks: { player: { level: '1' } } } };
    const dispose = installLegacyControlHint(win as never, { scene: { getScene: () => scene } });
    tick();
    const hint = () => page.body.children.find((node) => node.id === 'mazer-control-hint');
    expect(hint()).toBeDefined();

    for (const key of ['ArrowUp', 'w', 'a', 's', 'd']) dispatch(page.note, 'keydown', key);
    expect(hint()).toBeDefined();
    expect(storage.setItem).not.toHaveBeenCalled();

    dispatch(page.canvas, 'keydown', 'ArrowUp');
    expect(hint()).toBeUndefined();
    expect(storage.setItem).toHaveBeenCalled();
    dispose();
  });

  test('the always-loaded control hint imports only the dependency-free key module, never the popup or its CSS', () => {
    const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
    const overlay = read('src/render/legacyControlHintOverlay.ts');
    expect(overlay).toContain("from '../ui/feedback/feedbackKeyIsolation.ts'");
    expect(overlay).not.toMatch(/ui\/feedback\/(feedbackMount|feedbackPopup)/);
    expect(read('src/ui/feedback/feedbackKeyIsolation.ts')).not.toMatch(/^import /m);
    expect(read('src/ui/feedback/feedbackMount.ts')).toContain('installFeedbackKeyIsolation(scrim,');
  });
});
