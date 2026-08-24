export type MazerFieldInputType = 'email' | 'search' | 'tel' | 'text' | 'url';

export interface MazerFieldOptions {
  id: string;
  label: string;
  name?: string;
  type?: MazerFieldInputType;
  value?: string;
  placeholder?: string;
  autoComplete?: HTMLInputElement['autocomplete'];
  inputMode?: HTMLInputElement['inputMode'];
  description?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  onInput?: (event: Event) => void;
}

export interface MazerFieldElements {
  root: HTMLDivElement;
  label: HTMLLabelElement;
  input: HTMLInputElement;
  description: HTMLParagraphElement | null;
  error: HTMLParagraphElement | null;
}

const appendDescribedBy = (input: HTMLInputElement, id: string): void => {
  const ids = new Set((input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
  ids.add(id);
  input.setAttribute('aria-describedby', [...ids].join(' '));
};

export const createMazerField = (
  options: MazerFieldOptions,
  ownerDocument: Document = document
): MazerFieldElements => {
  const root = ownerDocument.createElement('div');
  const label = ownerDocument.createElement('label');
  const input = ownerDocument.createElement('input');
  root.className = ['mazer-field', options.className].filter(Boolean).join(' ');
  root.dataset.mazerComponent = 'MazerField';

  label.className = 'mazer-field__label';
  label.htmlFor = options.id;
  label.textContent = options.label;

  input.className = 'mazer-field__input';
  input.id = options.id;
  input.name = options.name ?? options.id;
  input.type = options.type ?? 'text';
  input.value = options.value ?? '';
  input.required = options.required ?? false;
  input.disabled = options.disabled ?? false;
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.autoComplete) input.autocomplete = options.autoComplete;
  if (options.inputMode) input.inputMode = options.inputMode;
  if (options.onInput) input.addEventListener('input', options.onInput);

  let description: HTMLParagraphElement | null = null;
  if (options.description) {
    description = ownerDocument.createElement('p');
    description.id = `${options.id}-description`;
    description.className = 'mazer-field__description';
    description.textContent = options.description;
    appendDescribedBy(input, description.id);
  }

  let error: HTMLParagraphElement | null = null;
  if (options.error) {
    error = ownerDocument.createElement('p');
    error.id = `${options.id}-error`;
    error.className = 'mazer-field__error';
    error.textContent = options.error;
    error.setAttribute('role', 'alert');
    input.setAttribute('aria-invalid', 'true');
    appendDescribedBy(input, error.id);
  }

  root.append(label, input);
  if (description) root.append(description);
  if (error) root.append(error);

  return { root, label, input, description, error };
};
