/**
 * First-time cards slice 9: the one signal from the DOM control hint (src/render/legacyControlHintOverlay.ts, in the
 * boot path) to the first-time card host (legacyFirstTimeHost.ts, which loads Phaser). No imports, so the hint
 * presenter stays loadable in node tests and never pulls the host in. The host registers itself when its module loads
 * (MenuScene imports it); before that, or with no host, the signal is dropped.
 */
export type LegacyFirstTimeHintListener = (scene: object) => void;

let listener: LegacyFirstTimeHintListener | null = null;

/** The host's handler (one at a time; a later call replaces it). Returns an unregister function. */
export const setLegacyFirstTimeHintListener = (next: LegacyFirstTimeHintListener | null): (() => void) => {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
};

/** The level-1 control hint card went away (Got it, the first move, or its timeout) while `?lab=firsttime` is on. */
export const emitLegacyFirstTimeControlHintDismissed = (scene: object | null): void => {
  if (scene !== null) listener?.(scene);
};
