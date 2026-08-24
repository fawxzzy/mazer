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
  valueText?: string;
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
  if (options.valueText) input.setAttribute('aria-valuetext', options.valueText);
  if (options.onInput) input.addEventListener('input', options.onInput);

  output.className = 'mazer-slider__output';
  output.setAttribute('for', options.id);
  output.value = options.valueText ?? String(options.value);

  root.append(label, output, input);
  return { root, label, input, output };
};
