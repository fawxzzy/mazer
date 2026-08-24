export type MazerButtonTone = 'primary' | 'secondary' | 'danger' | 'quiet';

export interface MazerButtonOptions {
  label: string;
  id?: string;
  className?: string;
  tone?: MazerButtonTone;
  disabled?: boolean;
  onPress?: (event: MouseEvent) => void;
}

export const createMazerButton = (
  options: MazerButtonOptions,
  ownerDocument: Document = document
): HTMLButtonElement => {
  const button = ownerDocument.createElement('button');
  const tone = options.tone ?? 'primary';
  button.type = 'button';
  button.className = [
    'mazer-button',
    `mazer-button--${tone}`,
    options.className
  ].filter(Boolean).join(' ');
  button.textContent = options.label;
  button.disabled = options.disabled ?? false;
  button.dataset.mazerComponent = 'MazerButton';

  if (options.id) {
    button.id = options.id;
  }
  if (options.onPress) {
    button.addEventListener('click', options.onPress);
  }

  return button;
};
