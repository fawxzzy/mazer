export interface SettingRowOptions {
  id: string;
  label: string;
  control: HTMLElement;
  labelFor?: string;
  description?: string;
  status?: string;
  disabled?: boolean;
  className?: string;
}

const appendToken = (current: string | null, token: string): string => (
  [...new Set([...(current?.split(/\s+/).filter(Boolean) ?? []), token])].join(' ')
);

/** Composes a non-interactive settings row while preserving explicit control relationships. */
export const createSettingRow = (
  options: SettingRowOptions,
  ownerDocument: Document = document
): HTMLElement => {
  const root = ownerDocument.createElement('div');
  const copy = ownerDocument.createElement('div');
  const label = options.labelFor
    ? ownerDocument.createElement('label')
    : ownerDocument.createElement('span');
  const labelId = `${options.id}-label`;

  root.id = options.id;
  root.className = ['mazer-setting-row', options.className].filter(Boolean).join(' ');
  root.dataset.mazerComponent = 'SettingRow';
  root.dataset.disabled = String(options.disabled ?? false);
  copy.className = 'mazer-setting-row__copy';
  label.className = 'mazer-setting-row__label';
  label.id = labelId;
  label.textContent = options.label;

  if (options.labelFor) {
    (label as HTMLLabelElement).htmlFor = options.labelFor;
  } else {
    options.control.setAttribute(
      'aria-labelledby',
      appendToken(options.control.getAttribute('aria-labelledby'), labelId)
    );
  }

  copy.append(label);
  if (options.description) {
    const description = ownerDocument.createElement('p');
    const descriptionId = `${options.id}-description`;
    description.id = descriptionId;
    description.className = 'mazer-setting-row__description';
    description.textContent = options.description;
    copy.append(description);
    options.control.setAttribute(
      'aria-describedby',
      appendToken(options.control.getAttribute('aria-describedby'), descriptionId)
    );
  }
  if (options.status) {
    const status = ownerDocument.createElement('p');
    const statusId = `${options.id}-status`;
    status.id = statusId;
    status.className = 'mazer-setting-row__status';
    status.textContent = options.status;
    copy.append(status);
    options.control.setAttribute(
      'aria-describedby',
      appendToken(options.control.getAttribute('aria-describedby'), statusId)
    );
  }

  if (options.disabled) {
    options.control.setAttribute('aria-disabled', 'true');
  }
  const controlSlot = ownerDocument.createElement('div');
  controlSlot.className = 'mazer-setting-row__control';
  controlSlot.append(options.control);
  root.append(copy, controlSlot);
  return root;
};
