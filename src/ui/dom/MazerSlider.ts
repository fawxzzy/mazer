export interface MazerSliderOptions {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  step?: number;
  name?: string;
  disabled?: boolean;
  className?: string;
  /** Initial accessible value text. Use formatValue when later input values need units. */
  valueText?: string;
  formatValue?: (value: number) => string;
  onInput?: (event: Event) => void;
}

export interface MazerSliderElements {
  root: HTMLDivElement;
  label: HTMLLabelElement;
  input: HTMLInputElement;
  output: HTMLOutputElement;
}

export const createMazerSlider = (
  options: MazerSliderOptions,
  ownerDocument: Document = document
): MazerSliderElements => {
  const root = ownerDocument.createElement('div');
  const label = ownerDocument.createElement('label');
  const input = ownerDocument.createElement('input');
  const output = ownerDocument.createElement('output');

  root.className = ['mazer-slider', options.className].filter(Boolean).join(' ');
  root.dataset.mazerComponent = 'MazerSlider';
  label.className = 'mazer-slider__label';
  label.htmlFor = options.id;
  label.textContent = options.label;

  input.className = 'mazer-slider__input';
  input.type = 'range';
  input.id = options.id;
  input.name = options.name ?? options.id;
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step ?? 1);
  input.value = String(options.value);
  input.disabled = options.disabled ?? false;

  output.className = 'mazer-slider__output';
  output.setAttribute('for', options.id);

  const synchronizePresentation = (initial = false): void => {
    const numericValue = Number(input.value);
    const formattedValue = initial && options.valueText !== undefined
      ? options.valueText
      : options.formatValue?.(numericValue) ?? input.value;
    output.value = formattedValue;
    input.setAttribute('aria-valuetext', formattedValue);
  };
  synchronizePresentation(true);
  input.addEventListener('input', (event) => {
    synchronizePresentation();
    options.onInput?.(event);
  });

  root.append(label, output, input);
  return { root, label, input, output };
};
