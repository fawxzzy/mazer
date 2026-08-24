export interface SettingRowDisableTransaction {
  /** Applies the prepared disabled state. Rollback already exists before this runs. */
  commit: () => void;
  /** Idempotently restores the exact state captured by prepareDisabled. */
  rollback: () => void;
}

export interface SettingRowDisableAdapter {
  getDisabled: () => boolean;
  /**
   * Prepares a non-mutating transaction. Returning null, throwing, or omitting a
   * callable rollback rejects the transition before any target commit runs.
   */
  prepareDisabled: (disabled: boolean) => SettingRowDisableTransaction | null;
}

export interface SettingRowInteractionTarget {
  element: HTMLElement;
  disableAdapter?: SettingRowDisableAdapter;
}

export interface SettingRowOptions {
  id: string;
  label: string;
  /** Visual control root placed in the row. It may contain arbitrarily nested controls. */
  control: HTMLElement;
  /**
   * Explicit semantic/interaction targets for composite controls. When omitted, control
   * must itself be a direct native button/input/select/textarea control.
   */
  interactionTargets?: readonly SettingRowInteractionTarget[];
  labelFor?: string;
  description?: string;
  status?: string;
  disabled?: boolean;
  className?: string;
}

export interface SettingRowElements {
  root: HTMLDivElement;
  label: HTMLElement;
  controlSlot: HTMLDivElement;
  interactionTargets: readonly HTMLElement[];
  /**
   * Returns false when a transition cannot finish. If an established undo is
   * temporarily unhealthy, the row stays mounted and safely disabled for retry.
   */
  setDisabled: (disabled: boolean) => boolean;
  /**
   * Restores target attributes/state and removes every listener owned by the row.
   * A failed custom undo leaves the row intact and safely disabled for a later retry.
   */
  destroy: () => boolean;
}

interface AttributeSnapshot {
  labelledBy: string | null;
  describedBy: string | null;
  ariaDisabled: string | null;
}

interface ResolvedInteractionTarget {
  element: HTMLElement;
  getDisabled: () => boolean;
  prepareDisabled: (disabled: boolean) => SettingRowDisableTransaction | null;
  initialDisabled: boolean;
  attributes: AttributeSnapshot;
  suppress: (event: Event) => void;
}

interface PreparedDisableTransaction extends SettingRowDisableTransaction {
  target: ResolvedInteractionTarget;
  beforeDisabled: boolean;
}

const NATIVE_DIRECT_CONTROL_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);
const SUPPRESSED_EVENTS = [
  'pointerdown',
  'pointerup',
  'pointercancel',
  'mousedown',
  'mouseup',
  'touchstart',
  'touchend',
  'keydown',
  'keypress',
  'keyup',
  'click',
  'dblclick',
  'auxclick',
  'beforeinput',
  'input',
  'change'
] as const;

const appendTokens = (current: string | null, tokens: readonly string[]): string => (
  [...new Set([...(current?.split(/\s+/).filter(Boolean) ?? []), ...tokens])].join(' ')
);

const restoreAttribute = (element: HTMLElement, name: string, value: string | null): void => {
  if (value === null) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
};

const isDirectNativeControl = (element: HTMLElement): element is HTMLElement & { disabled: boolean } => {
  try {
    return NATIVE_DIRECT_CONTROL_TAGS.has(element.tagName)
      && typeof (element as HTMLElement & { disabled?: unknown }).disabled === 'boolean';
  } catch {
    return false;
  }
};

const resolveDisableBoundary = (
  target: SettingRowInteractionTarget
): Pick<ResolvedInteractionTarget, 'getDisabled' | 'prepareDisabled' | 'initialDisabled'> | null => {
  const element = target.element;
  try {
    if (isDirectNativeControl(element)) {
      return {
        getDisabled: () => element.disabled,
        prepareDisabled: (disabled) => {
          const beforeDisabled = element.disabled;
          return {
            commit: () => {
              element.disabled = disabled;
            },
            rollback: () => {
              element.disabled = beforeDisabled;
            }
          };
        },
        initialDisabled: element.disabled
      };
    }
    const adapter = target.disableAdapter;
    if (
      !adapter
      || typeof adapter.getDisabled !== 'function'
      || typeof adapter.prepareDisabled !== 'function'
    ) {
      return null;
    }
    const initialDisabled = adapter.getDisabled();
    if (typeof initialDisabled !== 'boolean') return null;
    return {
      getDisabled: () => adapter.getDisabled(),
      prepareDisabled: (disabled) => adapter.prepareDisabled(disabled),
      initialDisabled
    };
  } catch {
    return null;
  }
};

/**
 * Composes one controlled settings row. Composite controls must explicitly name every
 * interactive target; this function never guesses at a descendant.
 */
export const createSettingRow = (
  options: SettingRowOptions,
  ownerDocument: Document = document
): SettingRowElements | null => {
  const resolved: ResolvedInteractionTarget[] = [];
  let root: HTMLDivElement | undefined;
  let rowDisabled = false;
  let destroyed = false;
  let activeDisableTransactions: PreparedDisableTransaction[] | null = null;

  const restoreTargets = (): void => {
    for (const target of resolved) {
      try {
        restoreAttribute(target.element, 'aria-labelledby', target.attributes.labelledBy);
        restoreAttribute(target.element, 'aria-describedby', target.attributes.describedBy);
        restoreAttribute(target.element, 'aria-disabled', target.attributes.ariaDisabled);
      } catch {
        // Best-effort cleanup must continue across every target.
      }
      for (const eventName of SUPPRESSED_EVENTS) {
        try {
          target.element.removeEventListener(eventName, target.suppress, true);
        } catch {
          // Best-effort cleanup must continue across every target.
        }
      }
    }
  };

  const prepareDisableTransactions = (): PreparedDisableTransaction[] | null => {
    const prepared: PreparedDisableTransaction[] = [];
    try {
      for (const target of resolved) {
        const beforeDisabled = target.getDisabled();
        if (typeof beforeDisabled !== 'boolean' || beforeDisabled !== target.initialDisabled) {
          return null;
        }
        const candidate = target.prepareDisabled(true);
        if (!candidate || typeof candidate !== 'object') return null;
        const commit = candidate.commit;
        const rollback = candidate.rollback;
        if (typeof commit !== 'function' || typeof rollback !== 'function') return null;

        // Prove the already-established undo is callable and leaves the captured
        // preimage exact before any commit in the target set is allowed to run.
        rollback();
        if (target.getDisabled() !== beforeDisabled) return null;
        prepared.push({ target, beforeDisabled, commit, rollback });
      }
      return prepared;
    } catch {
      return null;
    }
  };

  const restoreActiveDisable = (): boolean => {
    const transactions = activeDisableTransactions;
    if (!transactions) return true;
    let restored = true;
    for (let index = transactions.length - 1; index >= 0; index -= 1) {
      const transaction = transactions[index];
      try {
        transaction.rollback();
      } catch {
        restored = false;
      }
      try {
        if (transaction.target.getDisabled() !== transaction.beforeDisabled) restored = false;
      } catch {
        restored = false;
      }
    }
    if (restored) activeDisableTransactions = null;
    return restored;
  };

  const setDisabledPresentation = (disabled: boolean): boolean => {
    try {
      for (const target of resolved) {
        if (disabled) {
          target.element.setAttribute('aria-disabled', 'true');
        } else {
          restoreAttribute(target.element, 'aria-disabled', target.attributes.ariaDisabled);
        }
      }
      root!.dataset.disabled = String(disabled);
      return true;
    } catch {
      return false;
    }
  };

  try {
    const control = options.control;
    const explicitTargets = options.interactionTargets;
    const targetOptions: readonly SettingRowInteractionTarget[] = explicitTargets === undefined
      ? [{ element: control }]
      : explicitTargets;
    if (!control || !Array.isArray(targetOptions) || targetOptions.length === 0) return null;
    if (explicitTargets === undefined && !isDirectNativeControl(control)) return null;

    const uniqueElements = new Set<HTMLElement>();
    for (const targetOption of targetOptions) {
      if (!targetOption || typeof targetOption !== 'object') return null;
      const element = targetOption.element;
      if (!element || typeof element !== 'object' || uniqueElements.has(element)) return null;
      if (element !== control && !control.contains(element)) return null;
      if (
        typeof element.getAttribute !== 'function'
        || typeof element.setAttribute !== 'function'
        || typeof element.removeAttribute !== 'function'
        || typeof element.addEventListener !== 'function'
        || typeof element.removeEventListener !== 'function'
      ) {
        return null;
      }
      const disableBoundary = resolveDisableBoundary(targetOption);
      if (!disableBoundary) return null;
      uniqueElements.add(element);
      resolved.push({
        element,
        ...disableBoundary,
        attributes: {
          labelledBy: element.getAttribute('aria-labelledby'),
          describedBy: element.getAttribute('aria-describedby'),
          ariaDisabled: element.getAttribute('aria-disabled')
        },
        suppress: () => undefined
      });
    }

    root = ownerDocument.createElement('div');
    const copy = ownerDocument.createElement('div');
    const label = options.labelFor
      ? ownerDocument.createElement('label')
      : ownerDocument.createElement('span');
    const labelId = `${options.id}-label`;
    const descriptionTokens: string[] = [];

    root.id = options.id;
    root.className = ['mazer-setting-row', options.className].filter(Boolean).join(' ');
    root.dataset.mazerComponent = 'SettingRow';
    root.dataset.disabled = 'false';
    copy.className = 'mazer-setting-row__copy';
    label.className = 'mazer-setting-row__label';
    label.id = labelId;
    label.textContent = options.label;

    if (options.labelFor) {
      (label as HTMLLabelElement).htmlFor = options.labelFor;
    }

    copy.append(label);
    if (options.description) {
      const description = ownerDocument.createElement('p');
      const descriptionId = `${options.id}-description`;
      description.id = descriptionId;
      description.className = 'mazer-setting-row__description';
      description.textContent = options.description;
      copy.append(description);
      descriptionTokens.push(descriptionId);
    }
    if (options.status) {
      const status = ownerDocument.createElement('p');
      const statusId = `${options.id}-status`;
      status.id = statusId;
      status.className = 'mazer-setting-row__status';
      status.textContent = options.status;
      copy.append(status);
      descriptionTokens.push(statusId);
    }

    for (const target of resolved) {
      target.element.setAttribute(
        'aria-labelledby',
        appendTokens(target.attributes.labelledBy, [labelId])
      );
      if (descriptionTokens.length > 0) {
        target.element.setAttribute(
          'aria-describedby',
          appendTokens(target.attributes.describedBy, descriptionTokens)
        );
      }
      target.suppress = (event: Event): void => {
        if (!rowDisabled || destroyed) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
      };
      for (const eventName of SUPPRESSED_EVENTS) {
        target.element.addEventListener(eventName, target.suppress, true);
      }
    }

    const controlSlot = ownerDocument.createElement('div');
    controlSlot.className = 'mazer-setting-row__control';
    controlSlot.append(control);
    root.append(copy, controlSlot);

    const setDisabled = (disabled: boolean): boolean => {
      if (destroyed || typeof disabled !== 'boolean') return false;
      if (disabled === rowDisabled) return true;
      if (!disabled) {
        if (!restoreActiveDisable()) return false;
        if (!setDisabledPresentation(false)) return false;
        rowDisabled = false;
        return true;
      }

      const prepared = prepareDisableTransactions();
      if (!prepared) return false;
      activeDisableTransactions = prepared;
      let committed = true;
      for (const transaction of prepared) {
        try {
          transaction.commit();
          if (transaction.target.getDisabled() !== true) committed = false;
        } catch {
          committed = false;
        }
        if (!committed) break;
      }

      if (!committed || !setDisabledPresentation(true)) {
        if (restoreActiveDisable()) {
          setDisabledPresentation(false);
          rowDisabled = false;
        } else {
          // The row stays mounted, marked disabled, and capture-suppressed. The
          // caller can retry setDisabled(false) or destroy once undo is healthy.
          setDisabledPresentation(true);
          rowDisabled = true;
        }
        return false;
      }

      rowDisabled = true;
      return true;
    };

    const destroy = (): boolean => {
      if (destroyed) return true;
      if (rowDisabled && !setDisabled(false)) return false;
      destroyed = true;
      restoreTargets();
      try {
        root?.remove();
      } catch {
        // A detached or hostile host must not make cleanup throw.
      }
      return true;
    };

    if ((options.disabled ?? false) && !setDisabled(true)) {
      if (rowDisabled) {
        // A failed undo must keep the recoverable disabled row reachable instead
        // of removing its suppression boundary and stranding the custom target.
        return {
          root,
          label,
          controlSlot,
          interactionTargets: resolved.map(({ element }) => element),
          setDisabled,
          destroy
        };
      }
      destroy();
      return null;
    }

    return {
      root,
      label,
      controlSlot,
      interactionTargets: resolved.map(({ element }) => element),
      setDisabled,
      destroy
    };
  } catch {
    restoreActiveDisable();
    destroyed = true;
    restoreTargets();
    try {
      root?.remove();
    } catch {
      // Fail closed without exposing a partial row.
    }
    return null;
  }
};
