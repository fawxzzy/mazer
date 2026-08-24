import { createMazerIcon } from './MazerIcon';
import type { MazerIconName } from './icons';

export interface MazerIconButtonOptions {
  label: string;
  icon: MazerIconName;
  id?: string;
  className?: string;
  disabled?: boolean;
  pressed?: boolean;
  onPress?: (event: MouseEvent) => void;
}

export const createMazerIconButton = (
  options: MazerIconButtonOptions,
  ownerDocument: Document = document
): HTMLButtonElement => {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = ['mazer-icon-button', options.className].filter(Boolean).join(' ');
  button.disabled = options.disabled ?? false;
  button.setAttribute('aria-label', options.label);
  button.dataset.mazerComponent = 'MazerIconButton';

  if (options.id) {
    button.id = options.id;
  }
  if (options.pressed !== undefined) {
    button.setAttribute('aria-pressed', String(options.pressed));
  }
  if (options.onPress) {
    button.addEventListener('click', options.onPress);
  }

  button.append(createMazerIcon({ name: options.icon, size: 20 }, ownerDocument));
  return button;
};
