export interface MazerSegmentedOption<Value extends string = string> {
  value: Value;
  label: string;
  disabled?: boolean;
}

export interface MazerSegmentedControlOptions<Value extends string = string> {
  id: string;
  label: string;
  options: readonly MazerSegmentedOption<Value>[];
  selectedValue: Value;
  className?: string;
  onChange?: (value: Value, event: Event) => void;
}

export interface MazerSegmentedControlElements<Value extends string = string> {
  root: HTMLFieldSetElement;
  inputs: readonly HTMLInputElement[];
  setSelectedValue: (value: Value) => void;
}

/** Creates a controlled enum selector using radiogroup/radio semantics, never tabs. */
export const createMazerSegmentedControl = <Value extends string = string>(
  options: MazerSegmentedControlOptions<Value>,
  ownerDocument: Document = document
): MazerSegmentedControlElements<Value> => {
  const root = ownerDocument.createElement('fieldset');
  const legend = ownerDocument.createElement('legend');
  const controls = ownerDocument.createElement('div');
  let selectedValue = options.selectedValue;

  root.id = options.id;
  root.className = ['mazer-segmented-control', options.className].filter(Boolean).join(' ');
  root.dataset.mazerComponent = 'MazerSegmentedControl';
  root.setAttribute('role', 'radiogroup');
  legend.className = 'mazer-segmented-control__legend';
  legend.textContent = options.label;
  controls.className = 'mazer-segmented-control__options';

  const inputs = options.options.map((option, index) => {
    const optionLabel = ownerDocument.createElement('label');
    const input = ownerDocument.createElement('input');
    const text = ownerDocument.createElement('span');
    input.id = `${options.id}-${index}`;
    input.name = options.id;
    input.type = 'radio';
    input.value = option.value;
    input.disabled = option.disabled ?? false;
    input.className = 'mazer-segmented-control__input';
    optionLabel.className = 'mazer-segmented-control__option';
    text.className = 'mazer-segmented-control__text';
    text.textContent = option.label;
    optionLabel.append(input, text);
    controls.append(optionLabel);
    return input;
  });

  const enabledIndexes = (): number[] => inputs
    .map((input, index) => input.disabled ? -1 : index)
    .filter((index) => index >= 0);
  const render = (): void => {
    const enabled = enabledIndexes();
    const selectedIndex = inputs.findIndex((input) => input.value === selectedValue && !input.disabled);
    const fallbackFocusIndex = selectedIndex >= 0 ? selectedIndex : enabled[0];
    inputs.forEach((input) => {
      const selected = input.value === selectedValue;
      input.checked = selected;
      input.tabIndex = inputs.indexOf(input) === fallbackFocusIndex ? 0 : -1;
    });
  };
  const request = (index: number, event: Event): void => {
    const input = inputs[index];
    if (!input || input.disabled) return;
    input.focus();
    options.onChange?.(input.value as Value, event);
    render();
  };
  const setSelectedValue = (nextValue: Value): void => {
    if (!options.options.some((option) => option.value === nextValue && !option.disabled)) return;
    selectedValue = nextValue;
    render();
  };

  inputs.forEach((input, index) => {
    input.addEventListener('change', (event) => request(index, event));
    input.addEventListener('keydown', (event) => {
      const keyboardEvent = event as KeyboardEvent;
      const indexes = enabledIndexes();
      const current = indexes.indexOf(index);
      if (current < 0) return;
      let target: number | undefined;
      if (keyboardEvent.key === 'ArrowRight' || keyboardEvent.key === 'ArrowDown') {
        target = indexes[(current + 1) % indexes.length];
      } else if (keyboardEvent.key === 'ArrowLeft' || keyboardEvent.key === 'ArrowUp') {
        target = indexes[(current - 1 + indexes.length) % indexes.length];
      } else if (keyboardEvent.key === 'Home') {
        target = indexes[0];
      } else if (keyboardEvent.key === 'End') {
        target = indexes[indexes.length - 1];
      }
      if (target !== undefined) {
        keyboardEvent.preventDefault();
        request(target, keyboardEvent);
      }
    });
  });

  render();
  root.append(legend, controls);
  return { root, inputs, setSelectedValue };
};
