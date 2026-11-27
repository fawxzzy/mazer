/**
 * Host for the reusable in-flow notice (src/ui/notice/inFlowNotice.ts): loads the DOM module on first use, keeps at
 * most one notice up (a new one replaces the old), and closes it on scene shutdown. Pure glue, no copy; the scene
 * passes the props. Never in the boot bundle: the import is dynamic.
 */
import type { InFlowNoticeHandle, InFlowNoticeProps } from '../ui/notice/inFlowNotice';

export interface LegacyInFlowNoticeHostDeps {
  readonly loadMount?: () => Promise<{ mountInFlowNotice: (props: InFlowNoticeProps) => InFlowNoticeHandle }>;
}

export interface LegacyInFlowNoticeHost {
  /** Shows `props` (replacing any open notice). `key` names it so `close(key)` only closes that one. */
  show(key: string, props: InFlowNoticeProps): void;
  /** Closes the open notice; with a key, only if it is that one. */
  close(key?: string): void;
  isOpen(key?: string): boolean;
  destroy(): void;
}

export const createLegacyInFlowNoticeHost = (deps: LegacyInFlowNoticeHostDeps = {}): LegacyInFlowNoticeHost => {
  const loadMount = deps.loadMount ?? (() => import('../ui/notice/inFlowNotice'));
  let current: { key: string; handle: InFlowNoticeHandle } | null = null;
  let pendingKey: string | null = null;
  let token = 0;
  let destroyed = false;

  const close = (key?: string): void => {
    if (key !== undefined && pendingKey === key) {
      pendingKey = null;
      token += 1;
    }
    if (current === null || (key !== undefined && current.key !== key)) return;
    const open = current;
    current = null;
    open.handle.close('closed');
  };

  return {
    show: (key, props) => {
      if (destroyed) return;
      const mine = ++token;
      pendingKey = key;
      void loadMount().then(({ mountInFlowNotice }) => {
        if (destroyed || mine !== token) return;
        pendingKey = null;
        if (current !== null) {
          const old = current;
          current = null;
          old.handle.close('replaced');
        }
        const handle = mountInFlowNotice({
          ...props,
          onDismiss: (reason) => {
            if (current?.handle === handle) current = null;
            props.onDismiss?.(reason);
          }
        });
        current = { key, handle };
      }).catch(() => {
        // A chunk that fails to load drops the notice; the game never depends on it.
        if (mine === token) pendingKey = null;
      });
    },
    close,
    isOpen: (key) => (current !== null && (key === undefined || current.key === key)) || (pendingKey !== null && (key === undefined || pendingKey === key)),
    destroy: () => {
      destroyed = true;
      token += 1;
      pendingKey = null;
      close();
    }
  };
};
