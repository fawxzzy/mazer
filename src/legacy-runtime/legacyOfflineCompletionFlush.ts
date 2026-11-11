import {
  resolveLegacyOfflineSavedMessage,
  resolveLegacyOfflineSyncedMessage,
  type LegacyPlayerMessage
} from './legacyPlayerMessage';

/**
 * MAZER-FLOW-009: flush the completion outbox when the browser comes back
 * online, and tell the player once per outage that offline progress is saved.
 *
 * Pure of Phaser and Supabase: the scene injects the event target, the online
 * probe, the flush call and the notifier, so tests drive it with fakes.
 */
export interface LegacyOfflineFlushEventTarget {
  addEventListener(type: 'online', listener: () => void): void;
  removeEventListener(type: 'online', listener: () => void): void;
}

export interface LegacyOfflineFlushResult {
  error: string | null;
  pendingCompletionCount: number;
  synced: boolean;
}

export interface LegacyOfflineCompletionFlushOptions {
  /** Runs the existing outbox replay; null when nothing can be flushed now. */
  flush: () => Promise<LegacyOfflineFlushResult | null>;
  isOnline: () => boolean;
  notify: (message: LegacyPlayerMessage) => void;
  target: LegacyOfflineFlushEventTarget;
}

export interface LegacyOfflineCompletionFlush {
  dispose: () => void;
  /** Call with the result of every completion write. */
  noteCompletionResult: (result: Pick<LegacyOfflineFlushResult, 'pendingCompletionCount' | 'synced'>) => void;
}

export const createLegacyOfflineCompletionFlush = (
  options: LegacyOfflineCompletionFlushOptions
): LegacyOfflineCompletionFlush => {
  let outageNoticeShown = false;
  let flushing = false;
  let rerun = false;
  let disposed = false;

  const runFlush = async (): Promise<void> => {
    if (flushing) {
      rerun = true;
      return;
    }
    flushing = true;
    try {
      do {
        rerun = false;
        let result: LegacyOfflineFlushResult | null = null;
        try {
          result = await options.flush();
        } catch {
          // The outbox stays durable and retries on the next completion/boot.
          result = null;
        }
        if (disposed) {
          return;
        }
        if (result?.synced && result.pendingCompletionCount === 0 && outageNoticeShown) {
          outageNoticeShown = false;
          options.notify(resolveLegacyOfflineSyncedMessage());
        }
      } while (rerun && !disposed);
    } finally {
      flushing = false;
    }
  };

  const onOnline = (): void => {
    void runFlush();
  };
  options.target.addEventListener('online', onOnline);

  return {
    dispose: () => {
      disposed = true;
      options.target.removeEventListener('online', onOnline);
    },
    noteCompletionResult: (result) => {
      if (disposed || result.synced || result.pendingCompletionCount <= 0) {
        return;
      }
      if (options.isOnline() || outageNoticeShown) {
        return;
      }
      outageNoticeShown = true;
      options.notify(resolveLegacyOfflineSavedMessage());
    }
  };
};
