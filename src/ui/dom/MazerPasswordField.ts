import { createMazerField, type MazerFieldElements, type MazerFieldOptions } from './MazerField';
import { createMazerIcon } from './MazerIcon';

export interface MazerPasswordFieldOptions extends Omit<MazerFieldOptions, 'type'> {
  revealed?: boolean;
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
  onRevealChange?: (revealed: boolean) => void;
}

export interface MazerPasswordFieldElements extends MazerFieldElements {
  revealButton: HTMLButtonElement;
  setRevealed: (revealed: boolean) => void;
}

/**
 * Password visibility is transient DOM presentation only. No credential,
 * account, store, network, or persistence state is retained by this primitive.
 */
export const createMazerPasswordField = (
  options: MazerPasswordFieldOptions,
  ownerDocument: Document = document
): MazerPasswordFieldElements => {
  const field = createMazerField({ ...options, type: 'text' }, ownerDocument);
  const revealButton = ownerDocument.createElement('button');
  const showLabel = options.showPasswordLabel ?? 'Show password';
  const hideLabel = options.hidePasswordLabel ?? 'Hide password';

  field.root.classList.add('mazer-field--password');
  field.root.dataset.mazerComponent = 'MazerPasswordField';
  revealButton.type = 'button';
  revealButton.className = 'mazer-icon-button mazer-field__reveal';
  revealButton.dataset.mazerComponent = 'MazerPasswordFieldReveal';

  const setRevealed = (revealed: boolean): void => {
    field.input.type = revealed ? 'text' : 'password';
    revealButton.setAttribute('aria-label', revealed ? hideLabel : showLabel);
    revealButton.setAttribute('aria-pressed', String(revealed));
    revealButton.replaceChildren(createMazerIcon({
      name: revealed ? 'eye-off' : 'eye',
      size: 20
    }, ownerDocument));
  };

  setRevealed(options.revealed ?? false);
  revealButton.addEventListener('click', () => {
    const revealed = field.input.type === 'password';
    setRevealed(revealed);
    options.onRevealChange?.(revealed);
  });
  field.root.append(revealButton);

  return { ...field, revealButton, setRevealed };
};
