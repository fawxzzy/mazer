export interface MazerSwitchOptions {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  className?: string;
  onChange?: (checked: boolean, event: Event) => void;
}

export interface MazerSwitchElements {
  root: HTMLLabelElement;
  input: HTMLInputElement;
  state: HTMLElement;
  setChecked: (checked: boolean) => void;
}

/** Builds a controlled native checkbox switch with visible, non-color-only state text. */
export const createMazerSwitch = (
  options: MazerSwitchOptions,
  ownerDocument: Document = document
): MazerSwitchElements => {
  const root = ownerDocument.createElement('label');
  const input = ownerDocument.createElement('input');
  const track = ownerDocument.createElement('span');
  const label = ownerDocument.createElement('span');
  const state = ownerDocument.createElement('span');
  let checked = options.checked;

  root.className = ['mazer-switch', options.className].filter(Boolean).join(' ');
  root.dataset.mazerComponent = 'MazerSwitch';
  input.id = options.id;
  input.className = 'mazer-switch__input';
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.disabled = options.disabled ?? false;
  track.className = 'mazer-switch__track';
  track.setAttribute('aria-hidden', 'true');
  label.className = 'mazer-switch__label';
  label.textContent = options.label;
  state.className = 'mazer-switch__state';

  const render = (): void => {
    input.checked = checked;
    input.setAttribute('aria-checked', String(checked));
    state.textContent = checked ? 'On' : 'Off';
    root.dataset.checked = String(checked);
  };
  const setChecked = (nextChecked: boolean): void => {
    checked = nextChecked;
    render();
  };
  input.addEventListener('change', (event) => {
    const requested = input.checked;
    render();
    options.onChange?.(requested, event);
  });
  render();
  root.append(input, track, label, state);
  return { root, input, state, setChecked };
};
