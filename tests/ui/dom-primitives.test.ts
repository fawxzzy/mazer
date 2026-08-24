import { describe, expect, it, vi } from 'vitest';
import {
  createAppShell,
  createMazerButton,
  createMazerField,
  createMazerIcon,
  createMazerIconButton,
  createMazerPanel,
  createMazerPasswordField,
  createMazerSlider,
  createStageShell,
  getMazerIconDefinition,
  mazerIcons
} from '../../src/ui/dom';

type Listener = (event: Event) => void;

class TestElement {
  readonly attributes = new Map<string, string>();
  readonly childNodes: TestElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Listener[]>();
  className = '';
  disabled = false;
  id = '';
  name = '';
  required = false;
  textContent = '';
  type = '';
  value = '';
  min = '';
  max = '';
  step = '';
  placeholder = '';
  autocomplete = '';
  inputMode = '';
  htmlFor = '';

  constructor(readonly tagName: string) {}

  readonly classList = {
    add: (...names: string[]): void => {
      const existing = this.className.split(/\s+/).filter(Boolean);
      this.className = [...new Set([...existing, ...names])].join(' ');
    }
  };

  append(...children: TestElement[]): void {
    this.childNodes.push(...children);
  }

  replaceChildren(...children: TestElement[]): void {
    this.childNodes.splice(0, this.childNodes.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  click(): void {
    for (const listener of this.listeners.get('click') ?? []) {
      listener({ type: 'click' } as Event);
    }
  }
}

class TestDocument {
  createElement(tagName: string): TestElement {
    return new TestElement(tagName.toUpperCase());
  }

  createElementNS(_namespace: string, tagName: string): TestElement {
    return new TestElement(tagName.toLowerCase());
  }
}

const makeDocument = (): Document => new TestDocument() as unknown as Document;
const asTestElement = (value: unknown): TestElement => value as TestElement;

describe('Wave 2A DOM primitives', () => {
  it('constructs semantic, unmounted shell and opaque panel elements', () => {
    const ownerDocument = makeDocument();
    const panel = createMazerPanel({ label: 'Account' }, ownerDocument);
    const stage = createStageShell({ label: 'Mazer application', children: [panel] }, ownerDocument);
    const app = createAppShell({ id: 'mazer-app', children: [stage] }, ownerDocument);

    expect(asTestElement(panel)).toMatchObject({ tagName: 'SECTION' });
    expect(asTestElement(panel).getAttribute('aria-label')).toBe('Account');
    expect(asTestElement(stage)).toMatchObject({ tagName: 'MAIN' });
    expect(asTestElement(app)).toMatchObject({ tagName: 'DIV', id: 'mazer-app' });
    expect(asTestElement(app).childNodes).toEqual([stage]);
  });

  it('uses native buttons, names icon-only actions, and preserves disabled state', () => {
    const ownerDocument = makeDocument();
    const onPress = vi.fn();
    const button = createMazerButton({ label: 'Continue', disabled: true }, ownerDocument);
    const iconButton = createMazerIconButton({
      label: 'Open settings',
      icon: 'settings',
      onPress
    }, ownerDocument);

    expect(asTestElement(button)).toMatchObject({ tagName: 'BUTTON', type: 'button', disabled: true });
    expect(asTestElement(iconButton)).toMatchObject({ tagName: 'BUTTON', type: 'button' });
    expect(asTestElement(iconButton).getAttribute('aria-label')).toBe('Open settings');
    expect(asTestElement(iconButton).childNodes).toHaveLength(1);
    asTestElement(iconButton).click();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('builds labelled native fields with description and error relationships', () => {
    const ownerDocument = makeDocument();
    const field = createMazerField({
      id: 'username',
      label: 'Username',
      autoComplete: 'username',
      description: '2 to 15 characters',
      error: 'Username is required',
      required: true
    }, ownerDocument);

    expect(asTestElement(field.label)).toMatchObject({ tagName: 'LABEL', htmlFor: 'username' });
    expect(asTestElement(field.input)).toMatchObject({
      tagName: 'INPUT',
      id: 'username',
      autocomplete: 'username',
      required: true
    });
    expect(asTestElement(field.input).getAttribute('aria-describedby')).toBe('username-description username-error');
    expect(asTestElement(field.input).getAttribute('aria-invalid')).toBe('true');
    expect(asTestElement(field.error).getAttribute('role')).toBe('alert');
  });

  it('keeps password reveal transient, accessible, and value-preserving', () => {
    const ownerDocument = makeDocument();
    const onRevealChange = vi.fn();
    const field = createMazerPasswordField({
      id: 'password',
      label: 'Password',
      value: 'kept-locally-only',
      onRevealChange
    }, ownerDocument);

    expect(asTestElement(field.input)).toMatchObject({ type: 'password', value: 'kept-locally-only' });
    expect(asTestElement(field.revealButton)).toMatchObject({ tagName: 'BUTTON', type: 'button' });
    expect(asTestElement(field.revealButton).getAttribute('aria-label')).toBe('Show password');
    expect(asTestElement(field.revealButton).getAttribute('aria-pressed')).toBe('false');

    asTestElement(field.revealButton).click();
    expect(asTestElement(field.input)).toMatchObject({ type: 'text', value: 'kept-locally-only' });
    expect(asTestElement(field.revealButton).getAttribute('aria-label')).toBe('Hide password');
    expect(asTestElement(field.revealButton).getAttribute('aria-pressed')).toBe('true');
    expect(onRevealChange).toHaveBeenCalledWith(true);
  });

  it('binds a native range control to its label and output', () => {
    const slider = createMazerSlider({
      id: 'board-zoom',
      label: 'Board zoom',
      min: 50,
      max: 150,
      step: 10,
      value: 100,
      valueText: '100 percent'
    }, makeDocument());

    expect(asTestElement(slider.label)).toMatchObject({ tagName: 'LABEL', htmlFor: 'board-zoom' });
    expect(asTestElement(slider.input)).toMatchObject({
      tagName: 'INPUT', type: 'range', min: '50', max: '150', step: '10', value: '100'
    });
    expect(asTestElement(slider.input).getAttribute('aria-valuetext')).toBe('100 percent');
    expect(asTestElement(slider.output).getAttribute('for')).toBe('board-zoom');
  });

  it('renders immutable line-only 20px icon definitions', () => {
    const icon = createMazerIcon({ name: 'eye' }, makeDocument());
    const element = asTestElement(icon);

    expect(Object.keys(mazerIcons)).toEqual(['back', 'eye', 'eye-off', 'home', 'leaderboard', 'settings']);
    expect(element.getAttribute('viewBox')).toBe('0 0 20 20');
    expect(element.getAttribute('width')).toBe('20');
    expect(element.getAttribute('height')).toBe('20');
    expect(element.getAttribute('fill')).toBe('none');
    expect(element.getAttribute('stroke')).toBe('currentColor');
    expect(element.getAttribute('aria-hidden')).toBe('true');
    expect(() => (mazerIcons.eye.shapes as unknown[]).push({})).toThrow();
    expect(() => {
      (mazerIcons.eye.shapes[0] as unknown as { d: string }).d = 'MUTATED';
    }).toThrow();
    expect(getMazerIconDefinition('eye')?.shapes[0]).toMatchObject({
      element: 'path',
      d: 'M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z'
    });
  });

  it('fails closed without throwing for noncanonical runtime icon inputs', () => {
    const ownerDocument = makeDocument();
    const throwingProxy = new Proxy({}, {
      getPrototypeOf: () => { throw new Error('hostile prototype trap'); }
    });
    const inherited = Object.create({ name: 'eye' });
    const accessor = Object.defineProperty({}, 'name', {
      get: () => { throw new Error('hostile name accessor'); }
    });

    expect(getMazerIconDefinition('constructor')).toBeNull();
    expect(getMazerIconDefinition(Symbol('eye'))).toBeNull();
    expect(() => createMazerIcon({ name: 'not-an-icon' } as unknown, ownerDocument)).not.toThrow();
    expect(createMazerIcon({ name: 'not-an-icon' } as unknown, ownerDocument)).toBeNull();
    expect(createMazerIcon(inherited as unknown, ownerDocument)).toBeNull();
    expect(createMazerIcon(accessor as unknown, ownerDocument)).toBeNull();
    expect(createMazerIcon(throwingProxy as unknown, ownerDocument)).toBeNull();

    const valid = createMazerIcon({ name: 'eye' }, ownerDocument);
    expect(asTestElement(valid).childNodes).toHaveLength(2);
  });
});
