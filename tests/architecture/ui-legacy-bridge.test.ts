import { describe, expect, test, vi } from 'vitest';
import { UiLegacyBridge, type LegacyRuntimeFacts, type UiLegacyBridgeAdapter } from '../../src/state/uiLegacyBridge';

const baseFacts: LegacyRuntimeFacts = Object.freeze({
  mode: 'menu',
  overlay: 'none',
  overlayReturn: 'none',
  gamePhase: 'idle',
  authPhase: 'guest',
  connectionPhase: 'online',
  installPhase: 'hidden',
  controlMode: 'arrows',
  motionMode: 'system',
  effectsQuality: 'balanced',
  placeholderFields: ['connectionPhase', 'effectsQuality']
});

class FakeAdapter implements UiLegacyBridgeAdapter {
  facts: LegacyRuntimeFacts = baseFacts;
  calls: string[] = [];
  startRunAccepted = true;
  resumeRunAccepted = true;

  getFacts(): LegacyRuntimeFacts {
    return this.facts;
  }

  openSettings = (): boolean => { this.calls.push('openSettings'); this.facts = { ...this.facts, mode: 'menu', overlay: 'options' }; return true; };
  openAccount = (): boolean => { this.calls.push('openAccount'); this.facts = { ...this.facts, mode: 'menu', overlay: 'auth' }; return true; };
  openLeaderboard = (): boolean => { this.calls.push('openLeaderboard'); this.facts = { ...this.facts, mode: 'menu', overlay: 'leaderboard' }; return true; };
  openResetProgressConfirmation = (): boolean => {
    this.calls.push('openResetProgressConfirmation');
    this.facts = { ...this.facts, overlay: 'confirm-progression-reset', overlayReturn: this.facts.overlay };
    return true;
  };
  closeTopOverlay = (): boolean => { this.calls.push('closeTopOverlay'); this.facts = { ...this.facts, overlay: 'none' }; return true; };
  startRun = (): boolean => {
    this.calls.push('startRun');
    if (!this.startRunAccepted) return false;
    this.facts = { ...this.facts, mode: 'play', gamePhase: 'active' };
    return true;
  };
  pauseRun = (): boolean => { this.calls.push('pauseRun'); this.facts = { ...this.facts, overlay: 'pause', gamePhase: 'paused' }; return true; };
  resumeRun = (): boolean => {
    this.calls.push('resumeRun');
    if (!this.resumeRunAccepted) return false;
    this.facts = { ...this.facts, overlay: 'none', gamePhase: 'active' };
    return true;
  };
  resetRun = (): boolean => { this.calls.push('resetRun'); return true; };
  resetProgress = (): boolean => { this.calls.push('resetProgress'); this.facts = { ...this.facts, overlay: 'pause' }; return true; };
  returnHome = (): boolean => { this.calls.push('returnHome'); this.facts = { ...this.facts, mode: 'menu', overlay: 'none' }; return true; };
  setControlMode = (mode: LegacyRuntimeFacts['controlMode']): boolean => { this.calls.push(`setControlMode:${mode}`); this.facts = { ...this.facts, controlMode: mode }; return true; };
  logOut = (): boolean => { this.calls.push('logOut'); this.facts = { ...this.facts, authPhase: 'guest' }; return true; };
  installApp = (): boolean => { this.calls.push('installApp'); return true; };
  dismissInstall = (): boolean => { this.calls.push('dismissInstall'); return true; };
  dispatchDirectionalIntent = (intent: string, source: string): boolean => { this.calls.push(`dispatchDirectionalIntent:${intent}:${source}`); return true; };
}

describe('UiLegacyBridge', () => {
  test('projects the initial menu snapshot from real facts on installation', () => {
    const bridge = new UiLegacyBridge(new FakeAdapter());
    expect(bridge.getSnapshot()).toEqual(expect.objectContaining({
      primarySurface: 'home',
      modalSurface: 'none',
      gamePhase: 'idle'
    }));
    expect(bridge.getDiagnostics().installed).toBe(true);
    expect(bridge.getDiagnostics().projectionRevision).toBe(1);
    expect(bridge.getDiagnostics().placeholderFacts).toEqual(['connectionPhase', 'effectsQuality']);
  });

  test('active-play projection', () => {
    const adapter = new FakeAdapter();
    const bridge = new UiLegacyBridge(adapter);
    expect(bridge.dispatch({ type: 'START_RUN' })).toEqual({ ok: true });
    expect(bridge.getSnapshot()).toEqual(expect.objectContaining({ primarySurface: 'play', gamePhase: 'active' }));
  });

  test('pause projection', () => {
    const adapter = new FakeAdapter();
    const bridge = new UiLegacyBridge(adapter);
    bridge.dispatch({ type: 'START_RUN' });
    expect(bridge.dispatch({ type: 'PAUSE_RUN' })).toEqual({ ok: true });
    expect(bridge.getSnapshot()).toEqual(expect.objectContaining({ primarySurface: 'play', gamePhase: 'paused' }));
  });

  test('settings, account, and leaderboard projection via NAVIGATE', () => {
    const bridge = new UiLegacyBridge(new FakeAdapter());
    bridge.dispatch({ type: 'NAVIGATE', surface: 'settings' });
    expect(bridge.getSnapshot().primarySurface).toBe('settings');
    bridge.dispatch({ type: 'NAVIGATE', surface: 'account' });
    expect(bridge.getSnapshot().primarySurface).toBe('account');
    bridge.dispatch({ type: 'NAVIGATE', surface: 'leaderboard' });
    expect(bridge.getSnapshot().primarySurface).toBe('leaderboard');
  });

  test('OPEN_MODAL confirm-reset-progress opens the real confirmation from Account, not Account itself', () => {
    const adapter = new FakeAdapter();
    const bridge = new UiLegacyBridge(adapter);
    bridge.dispatch({ type: 'NAVIGATE', surface: 'account' });
    adapter.calls = [];
    expect(bridge.dispatch({ type: 'OPEN_MODAL', modal: 'confirm-reset-progress' })).toEqual({ ok: true });
    expect(adapter.calls).toEqual(['openResetProgressConfirmation']);
    expect(bridge.getSnapshot()).toEqual(expect.objectContaining({
      primarySurface: 'account',
      modalSurface: 'confirm-reset-progress'
    }));
  });

  test('OPEN_MODAL confirm-reset-progress opens the real confirmation from Pause', () => {
    const adapter = new FakeAdapter();
    const bridge = new UiLegacyBridge(adapter);
    bridge.dispatch({ type: 'START_RUN' });
    bridge.dispatch({ type: 'PAUSE_RUN' });
    adapter.calls = [];
    expect(bridge.dispatch({ type: 'OPEN_MODAL', modal: 'confirm-reset-progress' })).toEqual({ ok: true });
    expect(adapter.calls).toEqual(['openResetProgressConfirmation']);
    expect(bridge.getSnapshot()).toEqual(expect.objectContaining({
      primarySurface: 'play',
      modalSurface: 'confirm-reset-progress',
      gamePhase: 'paused'
    }));
  });

  test('OPEN_MODAL confirm-reset-progress rejects an invalid origin explicitly, without opening Account', () => {
    const adapter = new FakeAdapter();
    const bridge = new UiLegacyBridge(adapter);
    // Currently on the plain menu (overlay 'none') -- neither Account nor Pause.
    expect(bridge.dispatch({ type: 'OPEN_MODAL', modal: 'confirm-reset-progress' }))
      .toEqual({ ok: false, reason: 'confirm-reset-progress-invalid-origin' });
    expect(adapter.calls).toEqual([]);
    expect(bridge.getSnapshot().primarySurface).toBe('home');
  });

  test('CANCEL_GENERATION fails closed instead of closing an unrelated overlay', () => {
    const adapter = new FakeAdapter();
    const bridge = new UiLegacyBridge(adapter);
    expect(bridge.dispatch({ type: 'CANCEL_GENERATION' })).toEqual({ ok: false, reason: 'cancelGeneration-unsupported' });
    expect(adapter.calls).toEqual([]);
  });

  test('account-origin reset confirmation keeps the account surface, not home', () => {
    const adapter = new FakeAdapter();
    const bridge = new UiLegacyBridge(adapter);
    bridge.dispatch({ type: 'NAVIGATE', surface: 'account' });
    adapter.facts = { ...adapter.facts, overlay: 'confirm-progression-reset', overlayReturn: 'auth' };
    const snapshot = bridge.refreshProjection('test');
    expect(snapshot).toEqual(expect.objectContaining({ primarySurface: 'account', modalSurface: 'confirm-reset-progress' }));
  });

  test('pause-origin reset confirmation keeps the play surface and paused phase', () => {
    const adapter = new FakeAdapter();
    const bridge = new UiLegacyBridge(adapter);
    bridge.dispatch({ type: 'START_RUN' });
    bridge.dispatch({ type: 'PAUSE_RUN' });
    adapter.facts = { ...adapter.facts, overlay: 'confirm-progression-reset', overlayReturn: 'pause' };
    const snapshot = bridge.refreshProjection('test');
    expect(snapshot).toEqual(expect.objectContaining({
      primarySurface: 'play', modalSurface: 'confirm-reset-progress', gamePhase: 'paused'
    }));
  });

  test('start, pause, resume, home, reset, and navigation commands call the real adapter', () => {
    const adapter = new FakeAdapter();
    const bridge = new UiLegacyBridge(adapter);
    bridge.dispatch({ type: 'START_RUN' });
    bridge.dispatch({ type: 'PAUSE_RUN' });
    bridge.dispatch({ type: 'RESUME_RUN' });
    bridge.dispatch({ type: 'RESET_RUN' });
    bridge.dispatch({ type: 'RESET_PROGRESS' });
    bridge.dispatch({ type: 'RETURN_HOME' });
    bridge.dispatch({ type: 'NAVIGATE', surface: 'home' });
    expect(adapter.calls).toEqual([
      'startRun', 'pauseRun', 'resumeRun', 'resetRun', 'resetProgress', 'returnHome', 'returnHome'
    ]);
  });

  test('an adapter rejection (returns false) propagates as ok:false, not a false success', () => {
    const adapter = new FakeAdapter();
    adapter.startRunAccepted = false;
    const bridge = new UiLegacyBridge(adapter);
    expect(bridge.dispatch({ type: 'START_RUN' })).toEqual({ ok: false, reason: 'rejected' });
    expect(bridge.getSnapshot().primarySurface).toBe('home');

    const adapter2 = new FakeAdapter();
    const bridge2 = new UiLegacyBridge(adapter2);
    bridge2.dispatch({ type: 'START_RUN' });
    adapter2.resumeRunAccepted = false;
    bridge2.dispatch({ type: 'PAUSE_RUN' });
    expect(bridge2.dispatch({ type: 'RESUME_RUN' })).toEqual({ ok: false, reason: 'rejected' });
    expect(bridge2.getSnapshot().gamePhase).toBe('paused');
  });

  test('control-mode command dispatch reaches the adapter', () => {
    const adapter = new FakeAdapter();
    const bridge = new UiLegacyBridge(adapter);
    expect(bridge.dispatch({ type: 'SET_CONTROL_MODE', mode: 'stick' })).toEqual({ ok: true });
    expect(adapter.calls).toEqual(['setControlMode:stick']);
  });

  test('SET_PREFERENCE has no wired adapter method and fails closed rather than a false success', () => {
    const bridge = new UiLegacyBridge(new FakeAdapter());
    expect(bridge.dispatch({ type: 'SET_PREFERENCE', key: 'motionMode', value: 'reduced' }))
      .toEqual({ ok: false, reason: 'setPreference-unsupported' });
  });

  test('directional-intent dispatch reaches the adapter', () => {
    const adapter = new FakeAdapter();
    const bridge = new UiLegacyBridge(adapter);
    expect(bridge.dispatch({ type: 'DISPATCH_DIRECTIONAL_INTENT', intent: 'up', source: 'keyboard' })).toEqual({ ok: true });
    expect(adapter.calls).toEqual(['dispatchDirectionalIntent:up:keyboard']);
  });

  test('RELEASE_DIRECTIONAL_INTENT has no wired adapter method and fails closed', () => {
    const bridge = new UiLegacyBridge(new FakeAdapter());
    expect(bridge.dispatch({ type: 'RELEASE_DIRECTIONAL_INTENT', source: 'keyboard' }))
      .toEqual({ ok: false, reason: 'releaseDirectionalIntent-unsupported' });
  });

  test('unsupported command/surface combinations fail closed instead of silently no-op-ing', () => {
    const bridge = new UiLegacyBridge(new FakeAdapter());
    expect(bridge.dispatch({ type: 'NAVIGATE', surface: 'guide' })).toEqual({ ok: false, reason: 'surface:guide-unsupported' });
    expect(bridge.dispatch({ type: 'NAVIGATE', surface: 'result' })).toEqual({ ok: false, reason: 'surface:result-unsupported' });
    expect(bridge.dispatch({ type: 'not-a-real-command' })).toEqual({ ok: false, reason: 'invalid-command' });
    expect(bridge.getDiagnostics().commandFailureCount).toBe(3);
  });

  test('an adapter missing a method fails closed rather than throwing', () => {
    const adapter = new FakeAdapter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (adapter as any).installApp;
    const bridge = new UiLegacyBridge(adapter);
    expect(bridge.dispatch({ type: 'INSTALL_APP' })).toEqual({ ok: false, reason: 'installApp-unsupported' });
  });

  test('projection deduplicates unchanged facts without bumping revision', () => {
    const bridge = new UiLegacyBridge(new FakeAdapter());
    const before = bridge.getDiagnostics().projectionRevision;
    bridge.refreshProjection('no-op-tick');
    bridge.refreshProjection('no-op-tick');
    expect(bridge.getDiagnostics().projectionRevision).toBe(before);
    expect(bridge.getSnapshot()).toBe(bridge.getSnapshot());
  });

  test('getSnapshot() re-reads live facts even if a caller forgot to call refreshProjection()', () => {
    const adapter = new FakeAdapter();
    const bridge = new UiLegacyBridge(adapter);
    expect(bridge.getSnapshot().primarySurface).toBe('home');
    // Mutate facts directly, bypassing dispatch()/refreshProjection() entirely --
    // simulates a real transition whose call site forgot the notification hook.
    adapter.facts = { ...adapter.facts, mode: 'play', overlay: 'none', gamePhase: 'active' };
    expect(bridge.getSnapshot()).toEqual(expect.objectContaining({ primarySurface: 'play', gamePhase: 'active' }));
  });

  test('scene shutdown cleanup: destroy() marks diagnostics and rejects further use', () => {
    const bridge = new UiLegacyBridge(new FakeAdapter());
    bridge.destroy();
    expect(bridge.getDiagnostics().destroyed).toBe(true);
    expect(bridge.getDiagnostics().installed).toBe(false);
    expect(bridge.dispatch({ type: 'RETURN_HOME' })).toEqual({ ok: false, reason: 'destroyed' });
    // Post-destroy getSnapshot() still returns the last real snapshot rather than throwing.
    expect(bridge.getSnapshot().primarySurface).toBe('home');
  });

  test('diagnostics counters change through actual dispatch calls, proving the bridge is load-bearing', () => {
    const adapter = new FakeAdapter();
    const bridge = new UiLegacyBridge(adapter);
    expect(bridge.getDiagnostics().dispatchCount).toBe(0);
    bridge.dispatch({ type: 'START_RUN' });
    const diagnostics = bridge.getDiagnostics();
    expect(diagnostics.dispatchCount).toBe(1);
    expect(diagnostics.lastCommandType).toBe('START_RUN');
    expect(diagnostics.currentSnapshot).toEqual(bridge.getSnapshot());
    expect(diagnostics.visibleViewModelNames).toContain('gameplayHud');
  });

  test('a real listener call proves the bridge only emits commands it actually carried out', () => {
    const adapter = new FakeAdapter();
    const bridge = new UiLegacyBridge(adapter);
    const listener = vi.fn();
    bridge.subscribe(listener);
    bridge.dispatch({ type: 'NAVIGATE', surface: 'guide' }); // unsupported, must not emit
    expect(listener).not.toHaveBeenCalled();
    bridge.dispatch({ type: 'START_RUN' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'START_RUN' }));
  });
});
