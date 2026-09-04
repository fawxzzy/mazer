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
  effectsQuality: 'balanced'
});

class FakeAdapter implements UiLegacyBridgeAdapter {
  facts: LegacyRuntimeFacts = baseFacts;
  calls: string[] = [];

  getFacts(): LegacyRuntimeFacts {
    return this.facts;
  }

  openSettings = (): void => { this.calls.push('openSettings'); this.facts = { ...this.facts, mode: 'menu', overlay: 'options' }; };
  openAccount = (): void => { this.calls.push('openAccount'); this.facts = { ...this.facts, mode: 'menu', overlay: 'auth' }; };
  openLeaderboard = (): void => { this.calls.push('openLeaderboard'); this.facts = { ...this.facts, mode: 'menu', overlay: 'leaderboard' }; };
  closeTopOverlay = (): void => { this.calls.push('closeTopOverlay'); this.facts = { ...this.facts, overlay: 'none' }; };
  startRun = (): void => { this.calls.push('startRun'); this.facts = { ...this.facts, mode: 'play', gamePhase: 'active' }; };
  pauseRun = (): void => { this.calls.push('pauseRun'); this.facts = { ...this.facts, overlay: 'pause', gamePhase: 'paused' }; };
  resumeRun = (): void => { this.calls.push('resumeRun'); this.facts = { ...this.facts, overlay: 'none', gamePhase: 'active' }; };
  resetRun = (): void => { this.calls.push('resetRun'); };
  resetProgress = (): void => { this.calls.push('resetProgress'); this.facts = { ...this.facts, overlay: 'pause' }; };
  returnHome = (): void => { this.calls.push('returnHome'); this.facts = { ...this.facts, mode: 'menu', overlay: 'none' }; };
  setControlMode = (mode: LegacyRuntimeFacts['controlMode']): void => { this.calls.push(`setControlMode:${mode}`); this.facts = { ...this.facts, controlMode: mode }; };
  setPreference = (key: string, value: string): void => { this.calls.push(`setPreference:${key}:${value}`); };
  submitAuth = (intent: string): void => { this.calls.push(`submitAuth:${intent}`); };
  logOut = (): void => { this.calls.push('logOut'); this.facts = { ...this.facts, authPhase: 'guest' }; };
  installApp = (): void => { this.calls.push('installApp'); };
  dismissInstall = (): void => { this.calls.push('dismissInstall'); };
  applyUpdate = (): void => { this.calls.push('applyUpdate'); };
  retrySystemAction = (): void => { this.calls.push('retrySystemAction'); };
  dispatchDirectionalIntent = (intent: string, source: string): void => { this.calls.push(`dispatchDirectionalIntent:${intent}:${source}`); };
  releaseDirectionalIntent = (source: string): void => { this.calls.push(`releaseDirectionalIntent:${source}`); };
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

  test('preference and control-mode command dispatch reaches the adapter', () => {
    const adapter = new FakeAdapter();
    const bridge = new UiLegacyBridge(adapter);
    expect(bridge.dispatch({ type: 'SET_CONTROL_MODE', mode: 'stick' })).toEqual({ ok: true });
    expect(bridge.dispatch({ type: 'SET_PREFERENCE', key: 'motionMode', value: 'reduced' })).toEqual({ ok: true });
    expect(adapter.calls).toEqual(['setControlMode:stick', 'setPreference:motionMode:reduced']);
  });

  test('directional-intent dispatch and release reach the adapter', () => {
    const adapter = new FakeAdapter();
    const bridge = new UiLegacyBridge(adapter);
    expect(bridge.dispatch({ type: 'DISPATCH_DIRECTIONAL_INTENT', intent: 'up', source: 'keyboard' })).toEqual({ ok: true });
    expect(bridge.dispatch({ type: 'RELEASE_DIRECTIONAL_INTENT', source: 'keyboard' })).toEqual({ ok: true });
    expect(adapter.calls).toEqual(['dispatchDirectionalIntent:up:keyboard', 'releaseDirectionalIntent:keyboard']);
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

  test('scene shutdown cleanup: destroy() marks diagnostics and rejects further use', () => {
    const bridge = new UiLegacyBridge(new FakeAdapter());
    bridge.destroy();
    expect(bridge.getDiagnostics().destroyed).toBe(true);
    expect(bridge.getDiagnostics().installed).toBe(false);
    expect(bridge.dispatch({ type: 'RETURN_HOME' })).toEqual({ ok: false, reason: 'destroyed' });
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
