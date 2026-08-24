export interface SettingsSectionOptions {
  id: string;
  title: string;
  description?: string;
  children?: readonly Node[];
  className?: string;
}

/** Creates a named settings group without owning any setting or application state. */
export const createSettingsSection = (
  options: SettingsSectionOptions,
  ownerDocument: Document = document
): HTMLElement => {
  const root = ownerDocument.createElement('section');
  const title = ownerDocument.createElement('h2');
  const titleId = `${options.id}-title`;
  root.id = options.id;
  root.className = ['mazer-settings-section', options.className].filter(Boolean).join(' ');
  root.dataset.mazerComponent = 'SettingsSection';
  root.setAttribute('aria-labelledby', titleId);
  title.id = titleId;
  title.className = 'mazer-settings-section__title';
  title.textContent = options.title;
  root.append(title);

  if (options.description) {
    const description = ownerDocument.createElement('p');
    const descriptionId = `${options.id}-description`;
    description.id = descriptionId;
    description.className = 'mazer-settings-section__description';
    description.textContent = options.description;
    root.setAttribute('aria-describedby', descriptionId);
    root.append(description);
  }
  if (options.children) {
    root.append(...options.children);
  }
  return root;
};
