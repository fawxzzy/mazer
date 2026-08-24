import { describe, expect, it, vi } from 'vitest';
import {
  createConfirmDialog,
  createMazerScrollArea,
  createMazerSegmentedControl,
  createMazerSlider,
  createMazerSwitch,
  createSettingRow,
  createSettingsSection,
  createStatusBanner
} from '../../src/ui/dom';

type Listener = (event: Event) => void;

interface ListenerRegistration {
  listener: Listener;
  capture: boolean;
}

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
  readonly listeners = new Map<string, ListenerRegistration[]>();
  checked = false;
  className = '';
  disabled: boolean | undefined;
  hidden = false;
  htmlFor = '';
  id = '';
  name = '';
  tabIndex = 0;
  textContent = '';
  type = '';
  value = '';

  constructor(readonly tagName: string, private readonly document: TestDocument) {
    this.disabled = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tagName)
      ? false
      : undefined;
  }

  get ownerDocument(): TestDocument {
    return this.document;
  }

  readonly classList = {
    add: (...names: string[]): void => {
      const existing = this.className.split(/\s+/).filter(Boolean);
      this.className = [...new Set([...existing, ...names])].join(' ');
    }
  };

  append(...children: TestElement[]): void {
    this.childNodes.push(...children);
  }

  contains(candidate: TestElement): boolean {
    return this === candidate || this.childNodes.some((child) => child.contains(candidate));
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(
    name: string,
    listener: Listener,
    options?: boolean | AddEventListenerOptions
  ): void {
    const capture = typeof options === 'boolean' ? options : options?.capture ?? false;
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), { listener, capture }]);
  }

  removeEventListener(
    name: string,
    listener: Listener,
    options?: boolean | EventListenerOptions
  ): void {
    const capture = typeof options === 'boolean' ? options : options?.capture ?? false;
    this.listeners.set(
      name,
      (this.listeners.get(name) ?? []).filter((entry) => (
        entry.listener !== listener || entry.capture !== capture
      ))
    );
  }

  focus(): void {
    this.document.activeElement = this;
  }

  fire(name: string, event: Record<string, unknown> = {}): void {
    let immediatePropagationStopped = false;
    const payload = {
      type: name,
      target: this,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(() => {
        immediatePropagationStopped = true;
      }),
      ...event
    } as unknown as Event;
    const registrations = [...(this.listeners.get(name) ?? [])]
      .sort((left, right) => Number(right.capture) - Number(left.capture));
    for (const { listener } of registrations) {
      if (immediatePropagationStopped) break;
      listener(payload);
    }
  }

  click(): void {
    if (this.disabled) return;
    const toggles = this.tagName === 'INPUT' && (this.type === 'checkbox' || this.type === 'radio');
    if (toggles) this.checked = this.type === 'radio' ? true : !this.checked;
    this.fire('click');
    if (toggles) this.fire('change');
  }

  remove(): void {}
}

const makeDocument = (): Document => new TestDocument() as unknown as Document;
const asElement = (value: unknown): TestElement => value as TestElement;

describe('Wave 2A.1 settings DOM primitives', () => {
  it('targets a direct native control, preserves tokens and labelFor, and restores row-owned state', () => {
    const document = makeDocument();
    const control = asElement(document.createElement('button'));
    const onClick = vi.fn();
    control.id = 'motion-button';
    control.setAttribute('aria-labelledby', 'existing-label motion-row-label');
    control.setAttribute('aria-describedby', 'existing-help motion-row-description');
    control.setAttribute('aria-disabled', 'false');
    control.addEventListener('click', onClick);
    const result = createSettingRow({
      id: 'motion-row',
      label: 'Reduced motion',
      labelFor: 'motion-button',
      description: 'Limits decorative travel.',
      status: 'Saved locally',
      control: control as unknown as HTMLElement,
      disabled: true
    }, document);
    expect(result).not.toBeNull();
    const row = asElement(result!.root);

    expect(row.tagName).toBe('DIV');
    expect(row.dataset.disabled).toBe('true');
    expect(asElement(result!.label).htmlFor).toBe('motion-button');
    expect(control.getAttribute('aria-labelledby')).toBe('existing-label motion-row-label');
    expect(control.getAttribute('aria-describedby')).toBe(
      'existing-help motion-row-description motion-row-status'
    );
    expect(control.getAttribute('aria-disabled')).toBe('true');
    expect(control.disabled).toBe(true);
    expect(row.childNodes[1].childNodes).toEqual([control]);
    control.click();
    expect(onClick).not.toHaveBeenCalled();

    expect(result!.setDisabled(false)).toBe(true);
    expect(control.disabled).toBe(false);
    expect(control.getAttribute('aria-disabled')).toBe('false');
    expect(row.dataset.disabled).toBe('false');
    expect(onClick).not.toHaveBeenCalled();
    control.click();
    expect(onClick).toHaveBeenCalledTimes(1);

    result!.destroy();
    expect(control.getAttribute('aria-labelledby')).toBe('existing-label motion-row-label');
    expect(control.getAttribute('aria-describedby')).toBe('existing-help motion-row-description');
    expect(control.getAttribute('aria-disabled')).toBe('false');
    expect(control.disabled).toBe(false);
    control.click();
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('targets arbitrarily nested switch and slider inputs without mutating their visual roots', () => {
    const document = makeDocument();
    const switchChange = vi.fn();
    const sliderInput = vi.fn();
    const switchControl = createMazerSwitch({
      id: 'nested-switch',
      label: 'Guide trail',
      checked: false,
      onChange: switchChange
    }, document);
    const sliderControl = createMazerSlider({
      id: 'nested-slider',
      label: 'Board zoom',
      min: 50,
      max: 150,
      value: 100,
      onInput: sliderInput
    }, document);
    const switchVisualRoot = asElement(document.createElement('div'));
    const switchInner = asElement(document.createElement('div'));
    switchInner.append(asElement(switchControl.root));
    switchVisualRoot.append(switchInner);
    const sliderVisualRoot = asElement(document.createElement('div'));
    const sliderInner = asElement(document.createElement('div'));
    sliderInner.append(asElement(sliderControl.root));
    sliderVisualRoot.append(sliderInner);

    const switchRow = createSettingRow({
      id: 'switch-row',
      label: 'Trail',
      description: 'Shows the solved route.',
      control: switchVisualRoot as unknown as HTMLElement,
      interactionTargets: [{ element: switchControl.input }]
    }, document);
    const sliderRow = createSettingRow({
      id: 'slider-row',
      label: 'Zoom',
      status: '100 percent',
      control: sliderVisualRoot as unknown as HTMLElement,
      interactionTargets: [{ element: sliderControl.input }]
    }, document);

    expect(switchRow).not.toBeNull();
    expect(sliderRow).not.toBeNull();
    expect(asElement(switchControl.root).getAttribute('aria-describedby')).toBeNull();
    expect(asElement(switchControl.input).getAttribute('aria-describedby')).toBe('switch-row-description');
    expect(asElement(sliderControl.root).getAttribute('aria-describedby')).toBeNull();
    expect(asElement(sliderControl.input).getAttribute('aria-describedby')).toBe('slider-row-status');
    expect(switchRow!.setDisabled(true)).toBe(true);
    expect(sliderRow!.setDisabled(true)).toBe(true);
    asElement(switchControl.input).click();
    asElement(sliderControl.input).fire('input');
    expect(switchChange).not.toHaveBeenCalled();
    expect(sliderInput).not.toHaveBeenCalled();

    expect(switchRow!.setDisabled(false)).toBe(true);
    expect(sliderRow!.setDisabled(false)).toBe(true);
    asElement(switchControl.input).click();
    asElement(sliderControl.input).fire('input');
    expect(switchChange).toHaveBeenCalledTimes(1);
    expect(sliderInput).toHaveBeenCalledTimes(1);
  });

  it('targets every radio, preserves pre-disabled state, and restores all semantics on destroy', () => {
    const document = makeDocument();
    const control = asElement(document.createElement('div'));
    const nested = asElement(document.createElement('div'));
    const radios = [0, 1, 2].map((index) => {
      const radio = asElement(document.createElement('input'));
      radio.id = `mode-${index}`;
      radio.type = 'radio';
      radio.setAttribute('aria-labelledby', `existing-label-${index}`);
      radio.setAttribute('aria-describedby', `existing-help-${index}`);
      nested.append(radio);
      return radio;
    });
    radios[1].disabled = true;
    control.append(nested);
    const row = createSettingRow({
      id: 'mode-row',
      label: 'Mode',
      labelFor: 'mode-0',
      description: 'Choose a mode.',
      status: 'Classic selected',
      control: control as unknown as HTMLElement,
      interactionTargets: radios.map((element) => ({ element: element as unknown as HTMLElement }))
    }, document);

    expect(row).not.toBeNull();
    expect(asElement(row!.label).htmlFor).toBe('mode-0');
    radios.forEach((radio, index) => {
      expect(radio.getAttribute('aria-labelledby')).toBe(`existing-label-${index} mode-row-label`);
      expect(radio.getAttribute('aria-describedby')).toBe(
        `existing-help-${index} mode-row-description mode-row-status`
      );
    });
    expect(row!.setDisabled(true)).toBe(true);
    expect(radios.map(({ disabled }) => disabled)).toEqual([true, true, true]);
    expect(row!.setDisabled(false)).toBe(true);
    expect(radios.map(({ disabled }) => disabled)).toEqual([false, true, false]);

    row!.destroy();
    radios.forEach((radio, index) => {
      expect(radio.getAttribute('aria-labelledby')).toBe(`existing-label-${index}`);
      expect(radio.getAttribute('aria-describedby')).toBe(`existing-help-${index}`);
      expect(radio.getAttribute('aria-disabled')).toBeNull();
    });
    expect(radios.map(({ disabled }) => disabled)).toEqual([false, true, false]);
  });

  it('requires an explicit adapter for custom targets and suppresses activation reversibly', () => {
    const document = makeDocument();
    const customTarget = asElement(document.createElement('div'));
    const control = asElement(document.createElement('div'));
    const activation = vi.fn();
    let customDisabled = false;
    customTarget.tabIndex = 0;
    customTarget.setAttribute('role', 'button');
    customTarget.addEventListener('click', activation);
    control.append(customTarget);
    const row = createSettingRow({
      id: 'custom-row',
      label: 'Custom action',
      control: control as unknown as HTMLElement,
      interactionTargets: [{
        element: customTarget as unknown as HTMLElement,
        disableAdapter: {
          getDisabled: () => customDisabled,
          setDisabled: (disabled) => {
            customDisabled = disabled;
            customTarget.tabIndex = disabled ? -1 : 0;
          }
        }
      }]
    }, document);

    expect(row).not.toBeNull();
    expect(activation).not.toHaveBeenCalled();
    expect(row!.setDisabled(true)).toBe(true);
    expect(customDisabled).toBe(true);
    expect(customTarget.tabIndex).toBe(-1);
    customTarget.click();
    expect(activation).not.toHaveBeenCalled();
    expect(row!.setDisabled(false)).toBe(true);
    expect(customDisabled).toBe(false);
    expect(customTarget.tabIndex).toBe(0);
    customTarget.click();
    expect(activation).toHaveBeenCalledTimes(1);
    row!.destroy();
    customTarget.click();
    expect(activation).toHaveBeenCalledTimes(2);
  });

  it('fails closed without guessing descendants or accepting non-disable-capable targets', () => {
    const document = makeDocument();
    const composite = asElement(document.createElement('div'));
    const nestedButton = asElement(document.createElement('button'));
    const customTarget = asElement(document.createElement('div'));
    const outsideButton = asElement(document.createElement('button'));
    composite.append(nestedButton, customTarget);

    expect(() => createSettingRow({
      id: 'implicit-composite-row',
      label: 'Implicit composite',
      control: composite as unknown as HTMLElement
    }, document)).not.toThrow();
    expect(createSettingRow({
      id: 'implicit-composite-row',
      label: 'Implicit composite',
      control: composite as unknown as HTMLElement
    }, document)).toBeNull();
    expect(createSettingRow({
      id: 'empty-target-row',
      label: 'Empty targets',
      control: composite as unknown as HTMLElement,
      interactionTargets: []
    }, document)).toBeNull();
    expect(createSettingRow({
      id: 'custom-without-adapter-row',
      label: 'Custom without adapter',
      control: composite as unknown as HTMLElement,
      interactionTargets: [{ element: customTarget as unknown as HTMLElement }]
    }, document)).toBeNull();
    expect(createSettingRow({
      id: 'outside-target-row',
      label: 'Outside target',
      control: composite as unknown as HTMLElement,
      interactionTargets: [{ element: outsideButton as unknown as HTMLElement }]
    }, document)).toBeNull();
    expect(customTarget.getAttribute('aria-labelledby')).toBeNull();
    expect(nestedButton.getAttribute('aria-labelledby')).toBeNull();
  });

  it('rolls back every target when a disable adapter fails', () => {
    const document = makeDocument();
    const control = asElement(document.createElement('div'));
    const native = asElement(document.createElement('button'));
    const custom = asElement(document.createElement('div'));
    control.append(native, custom);
    const row = createSettingRow({
      id: 'rollback-row',
      label: 'Rollback',
      control: control as unknown as HTMLElement,
      interactionTargets: [
        { element: native as unknown as HTMLElement },
        {
          element: custom as unknown as HTMLElement,
          disableAdapter: {
            getDisabled: () => false,
            setDisabled: () => {
              throw new Error('adapter failed');
            }
          }
        }
      ]
    }, document);

    expect(row).not.toBeNull();
    expect(row!.setDisabled(true)).toBe(false);
    expect(native.disabled).toBe(false);
    expect(native.getAttribute('aria-disabled')).toBeNull();
    expect(asElement(row!.root).dataset.disabled).toBe('false');
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
