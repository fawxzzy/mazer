import { createMazerButton } from './MazerButton';

export interface ConfirmDialogOptions {
  id: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  className?: string;
  invoker?: HTMLElement;
  onConfirm: (event: MouseEvent) => void;
  onCancel?: (reason: 'cancel' | 'escape') => void;
}

export interface ConfirmDialogElements {
  root: HTMLElement;
  dialog: HTMLElement;
  cancelButton: HTMLButtonElement;
  confirmButton: HTMLButtonElement;
  open: (invoker?: HTMLElement) => boolean;
  close: () => void;
  destroy: () => void;
}

const activeDialogs = new WeakMap<Document, HTMLElement>();

interface FocusTarget {
  focus(): void;
}

const resolveFocusTarget = (value: unknown): FocusTarget | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  try {
    return typeof (value as { focus?: unknown }).focus === 'function'
      ? value as FocusTarget
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Creates an unmounted, caller-controlled confirmation dialog.
 * Confirm never closes or mutates state implicitly; only the explicit callback runs.
 */
export const createConfirmDialog = (
  options: ConfirmDialogOptions,
  ownerDocument: Document = document
): ConfirmDialogElements => {
  const root = ownerDocument.createElement('div');
  const dialog = ownerDocument.createElement('section');
  const title = ownerDocument.createElement('h2');
  const description = ownerDocument.createElement('p');
  const actions = ownerDocument.createElement('div');
  const cancelButton = createMazerButton({
    label: options.cancelLabel ?? 'Cancel',
    tone: 'secondary'
  }, ownerDocument);
  const confirmButton = createMazerButton({
    label: options.confirmLabel,
    tone: options.danger ? 'danger' : 'primary',
    onPress: options.onConfirm
  }, ownerDocument);
  const titleId = `${options.id}-title`;
  const descriptionId = `${options.id}-description`;
  let restoreTarget: FocusTarget | undefined;

  root.id = options.id;
  root.className = ['mazer-dialog-layer', options.className].filter(Boolean).join(' ');
  root.dataset.mazerComponent = 'ConfirmDialog';
  root.dataset.open = 'false';
  root.hidden = true;
  dialog.className = 'mazer-confirm-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.setAttribute('aria-describedby', descriptionId);
  title.id = titleId;
  title.className = 'mazer-confirm-dialog__title';
  title.textContent = options.title;
  description.id = descriptionId;
  description.className = 'mazer-confirm-dialog__description';
  description.textContent = options.description;
  actions.className = 'mazer-confirm-dialog__actions';
  cancelButton.classList.add('mazer-confirm-dialog__cancel');
  confirmButton.classList.add('mazer-confirm-dialog__confirm');
  actions.append(cancelButton, confirmButton);
  dialog.append(title, description, actions);
  root.append(dialog);

  const close = (): void => {
    if (activeDialogs.get(ownerDocument) === root) activeDialogs.delete(ownerDocument);
    root.hidden = true;
    root.dataset.open = 'false';
    const target = restoreTarget;
    restoreTarget = undefined;
    target?.focus();
  };
  const cancel = (reason: 'cancel' | 'escape'): void => {
    options.onCancel?.(reason);
    close();
  };
  const onCancelClick = (): void => cancel('cancel');
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel('escape');
      return;
    }
    if (event.key !== 'Tab') return;
    if (event.shiftKey && ownerDocument.activeElement === cancelButton) {
      event.preventDefault();
      confirmButton.focus();
    } else if (!event.shiftKey && ownerDocument.activeElement === confirmButton) {
      event.preventDefault();
      cancelButton.focus();
    }
  };
  cancelButton.addEventListener('click', onCancelClick);
  dialog.addEventListener('keydown', onKeyDown);

  const open = (invoker = options.invoker): boolean => {
    const active = activeDialogs.get(ownerDocument);
    if (active && active !== root) return false;
    if (active === root) return true;
    restoreTarget = resolveFocusTarget(invoker) ?? resolveFocusTarget(ownerDocument.activeElement);
    activeDialogs.set(ownerDocument, root);
    root.hidden = false;
    root.dataset.open = 'true';
    cancelButton.focus();
    return true;
  };
  const destroy = (): void => {
    close();
    cancelButton.removeEventListener('click', onCancelClick);
    dialog.removeEventListener('keydown', onKeyDown);
  };

  return { root, dialog, cancelButton, confirmButton, open, close, destroy };
};
