import { describe, expect, it, vi } from 'vitest';
import {
  createConfirmDialog,
  createMazerScrollArea,
  createMazerSegmentedControl,
  createMazerSwitch,
  createSettingRow,
  createSettingsSection,
  createStatusBanner
} from '../../src/ui/dom';

type Listener = (event: Event) => void;

class TestDocument {
  activeElement: TestElement | null = null;

  createElement(tagName: string): TestElement {
    return new TestElement(tagName.toUpperCase(), this);
  }
}

class TestElement {
  readonly attributes = new Map<string, string>();
  readonly childNodes: TestElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Listener[]>();
  checked = false;
  className = '';
  disabled = false;
  hidden = false;
  htmlFor = '';
  id = '';
  name = '';
  tabIndex = 0;
  textContent = '';
  type = '';
  value = '';

  constructor(readonly tagName: string, private readonly document: TestDocument) {}

  readonly classList = {
    add: (...names: string[]): void => {
      const existing = this.className.split(/\s+/).filter(Boolean);
      this.className = [...new Set([...existing, ...names])].join(' ');
    }
  };

  append(...children: TestElement[]): void {
    this.childNodes.push(...children);
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

  removeEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((entry) => entry !== listener));
  }

  focus(): void {
    this.document.activeElement = this;
  }

  fire(name: string, event: Record<string, unknown> = {}): void {
    const payload = {
      type: name,
      target: this,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...event
    } as unknown as Event;
    for (const listener of this.listeners.get(name) ?? []) listener(payload);
  }

  click(): void {
    this.fire('click');
  }
}

const makeDocument = (): Document => new TestDocument() as unknown as Document;
const asElement = (value: unknown): TestElement => value as TestElement;

describe('Wave 2A.1 settings DOM primitives', () => {
  it('associates setting labels, helper text, status, and controls without nesting the control', () => {
    const document = makeDocument();
    const control = asElement(document.createElement('button'));
    const row = asElement(createSettingRow({
      id: 'motion-row',
      label: 'Reduced motion',
      description: 'Limits decorative travel.',
      status: 'Saved locally',
      control: control as unknown as HTMLElement,
      disabled: true
    }, document));

    expect(row.tagName).toBe('DIV');
    expect(row.dataset.disabled).toBe('true');
    expect(control.getAttribute('aria-labelledby')).toBe('motion-row-label');
    expect(control.getAttribute('aria-describedby')).toBe('motion-row-description motion-row-status');
    expect(control.getAttribute('aria-disabled')).toBe('true');
    expect(row.childNodes[1].childNodes).toEqual([control]);
  });

  it('groups settings with a unique heading and optional description', () => {
    const document = makeDocument();
    const child = document.createElement('div');
    const section = asElement(createSettingsSection({
      id: 'accessibility',
      title: 'Accessibility',
      description: 'Visual and motion controls.',
      children: [child]
    }, document));

    expect(section.tagName).toBe('SECTION');
    expect(section.getAttribute('aria-labelledby')).toBe('accessibility-title');
    expect(section.getAttribute('aria-describedby')).toBe('accessibility-description');
    expect(section.childNodes.at(-1)).toBe(child);
  });

  it('uses a controlled native checkbox switch with visible non-color state', () => {
    const onChange = vi.fn();
    const result = createMazerSwitch({
      id: 'guide-trail',
      label: "Guide's Trail",
      checked: true,
      onChange
    }, makeDocument());
    const input = asElement(result.input);

    expect(input).toMatchObject({ tagName: 'INPUT', type: 'checkbox', checked: true });
    expect(input.getAttribute('role')).toBe('switch');
    expect(input.getAttribute('aria-checked')).toBe('true');
    expect(asElement(result.state).textContent).toBe('On');

    input.checked = false;
    input.fire('change');
    expect(onChange).toHaveBeenCalledWith(false, expect.anything());
    expect(input.checked).toBe(true);
    result.setChecked(false);
    expect(input.checked).toBe(false);
    expect(input.getAttribute('aria-checked')).toBe('false');
    expect(asElement(result.state).textContent).toBe('Off');
  });

  it('uses radio semantics with deterministic roving focus and skips disabled segments', () => {
    const document = makeDocument();
    const onChange = vi.fn();
    const control = createMazerSegmentedControl({
      id: 'effects-quality',
      label: 'Effects quality',
      selectedValue: 'low',
      options: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium', disabled: true },
        { value: 'high', label: 'High' }
      ],
      onChange
    }, document);
    const [low, medium, high] = control.inputs.map(asElement);

    expect(asElement(control.root).tagName).toBe('FIELDSET');
    expect(asElement(control.root).getAttribute('role')).toBe('radiogroup');
    expect(low).toMatchObject({ type: 'radio', checked: true, tabIndex: 0 });
    expect(medium.disabled).toBe(true);
    low.fire('keydown', { key: 'ArrowRight' });
    expect((document as unknown as TestDocument).activeElement).toBe(high);
    expect(onChange).toHaveBeenLastCalledWith('high', expect.anything());
    expect(low.checked).toBe(true);

    control.setSelectedValue('high');
    expect(high).toMatchObject({ checked: true, tabIndex: 0 });
    expect(low).toMatchObject({ checked: false, tabIndex: -1 });
    high.fire('keydown', { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('low', expect.anything());
  });

  it('keeps a named native scroll region focusable without owning page state', () => {
    const child = makeDocument().createElement('div');
    const area = asElement(createMazerScrollArea({
      id: 'settings-scroll',
      label: 'Settings controls',
      children: [child]
    }, makeDocument()));

    expect(area.getAttribute('role')).toBe('region');
    expect(area.getAttribute('aria-label')).toBe('Settings controls');
    expect(area.tabIndex).toBe(0);
    expect(area.childNodes).toEqual([child]);
  });

  it('creates polite nonblocking status by default and explicit urgent alerts', () => {
    const action = vi.fn();
    const status = asElement(createStatusBanner({
      message: 'Back online',
      tone: 'success',
      actionLabel: 'Retry',
      onAction: action
    }, makeDocument()));
    const alert = asElement(createStatusBanner({ message: 'Reset failed', urgent: true }, makeDocument()));

    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.childNodes[0].textContent).toBe('Success');
    expect(status.childNodes[2].tagName).toBe('BUTTON');
    status.childNodes[2].click();
    expect(action).toHaveBeenCalledTimes(1);
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.getAttribute('aria-live')).toBe('assertive');
  });

  it('traps dialog focus, starts safely, restores the invoker, and never confirms implicitly', () => {
    const document = makeDocument();
    const invoker = asElement(document.createElement('button'));
    invoker.focus();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const first = createConfirmDialog({
      id: 'reset-dialog',
      title: 'Reset progress?',
      description: 'This cannot be undone.',
      confirmLabel: 'Reset',
      danger: true,
      invoker: invoker as unknown as HTMLElement,
      onConfirm,
      onCancel
    }, document);
    const second = createConfirmDialog({
      id: 'leave-dialog',
      title: 'Leave run?',
      description: 'The run will end.',
      confirmLabel: 'Leave',
      onConfirm: vi.fn()
    }, document);

    expect(first.open()).toBe(true);
    expect(asElement(first.root).hidden).toBe(false);
    expect((document as unknown as TestDocument).activeElement).toBe(first.cancelButton);
    expect(second.open(invoker as unknown as HTMLElement)).toBe(false);

    asElement(first.dialog).fire('keydown', { key: 'Tab', shiftKey: true });
    expect((document as unknown as TestDocument).activeElement).toBe(first.confirmButton);
    asElement(first.confirmButton).click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(asElement(first.root).hidden).toBe(false);

    asElement(first.dialog).fire('keydown', { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledWith('escape');
    expect(asElement(first.root).hidden).toBe(true);
    expect((document as unknown as TestDocument).activeElement).toBe(invoker);
    expect(second.open(invoker as unknown as HTMLElement)).toBe(true);
    second.close();
    first.destroy();
    second.destroy();
  });

  it('captures and restores the owner-document active element without the host HTMLElement realm', () => {
    const alternateDocument = makeDocument();
    const alternateInvoker = asElement(alternateDocument.createElement('button'));
    alternateInvoker.focus();
    const dialog = createConfirmDialog({
      id: 'alternate-realm-dialog',
      title: 'Leave run?',
      description: 'The run will end.',
      confirmLabel: 'Leave',
      onConfirm: vi.fn()
    }, alternateDocument);

    expect(() => dialog.open()).not.toThrow();
    expect((alternateDocument as unknown as TestDocument).activeElement).toBe(dialog.cancelButton);
    dialog.close();
    expect((alternateDocument as unknown as TestDocument).activeElement).toBe(alternateInvoker);
    dialog.destroy();
  });

  it('opens without throwing when the owner document has no focusable active element', () => {
    const alternateDocument = makeDocument();
    (alternateDocument as unknown as TestDocument).activeElement = {} as TestElement;
    const dialog = createConfirmDialog({
      id: 'no-focus-target-dialog',
      title: 'Reset run?',
      description: 'Current progress will be cleared.',
      confirmLabel: 'Reset',
      onConfirm: vi.fn()
    }, alternateDocument);

    expect(() => dialog.open()).not.toThrow();
    expect((alternateDocument as unknown as TestDocument).activeElement).toBe(dialog.cancelButton);
    expect(() => dialog.close()).not.toThrow();
    dialog.destroy();
  });
});
