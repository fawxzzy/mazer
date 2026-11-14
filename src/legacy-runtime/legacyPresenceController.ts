/**
 * MAZER-UI-024: owns the presence session and the calm display model for the menu counter, so
 * MenuScene only asks two questions per frame ("signed in?" and "what do I draw?").
 *
 * - No session, and therefore no extra network, while signed out.
 * - The session is created lazily (the Realtime library loads on demand) and torn down on sign-out.
 * - When Supabase is not configured for this build, or this is not the production origin, the
 *   session is inert and the counter simply never appears (no error, no toast).
 * - `setQaCount` lets runtime diagnostics force a count for screenshots; it never touches the network.
 */
import { resolveLegacyAuthConfig } from './legacyAuth';
import { resolveLegacySupabaseSchemaForUrl } from './legacySupabaseSchemaBinding';
import {
  createBrowserPresenceDeps,
  startMazerPresenceSession,
  type PresenceSessionDeps,
  type PresenceSessionHandle
} from './legacyPresenceClient';
import {
  advancePresenceDisplay,
  createPresenceDisplayState,
  pushPresenceSample,
  resolvePresenceDisplayFrame,
  type PresenceDisplayFrame,
  type PresenceDisplayState
} from './legacyPresenceDisplay';

export interface LegacyPresenceControllerOptions {
  readonly now: () => number;
  /** Test seams. */
  readonly resolveConfig?: () => { url: string; anonKey: string } | null;
  readonly createDeps?: () => PresenceSessionDeps;
}

const HIDDEN_FRAME: PresenceDisplayFrame = { alpha: 0, animating: false, value: null, visible: false };

export class LegacyPresenceController {
  private state: PresenceDisplayState = createPresenceDisplayState();
  private session: PresenceSessionHandle | null = null;
  private signedIn = false;
  private qaOverride = false;
  private dirty = false;

  public constructor(private readonly options: LegacyPresenceControllerOptions) {}

  /** Idempotent; call every frame. Starts the session on sign-in, stops it (and clears the number) on sign-out. */
  public setSignedIn(signedIn: boolean): void {
    if (signedIn === this.signedIn) {
      return;
    }
    this.signedIn = signedIn;
    if (!signedIn) {
      this.stopSession();
      if (!this.qaOverride) {
        this.state = createPresenceDisplayState();
      }
      this.dirty = true;
      return;
    }
    this.startSession();
  }

  public isSessionActive(): boolean {
    return this.session !== null;
  }

  /** Force a count (or null = unknown) without any network; runtime diagnostics only. */
  public setQaCount(count: number | null | undefined): void {
    this.qaOverride = count !== undefined;
    if (count === undefined) {
      this.state = createPresenceDisplayState();
    } else {
      this.stopSession();
      this.state = pushPresenceSample(this.state, count, this.options.now());
    }
    this.dirty = true;
  }

  /** The text-bearing frame to draw now; hidden while signed out. */
  public frame(nowMs: number, reducedMotion: boolean): PresenceDisplayFrame {
    if (!this.signedIn && !this.qaOverride) {
      return HIDDEN_FRAME;
    }
    const advanced = advancePresenceDisplay(this.state, nowMs);
    if (advanced !== this.state) {
      this.state = advanced;
    }
    return resolvePresenceDisplayFrame(this.state, nowMs, reducedMotion);
  }

  /** True when the scene must redraw (a sample arrived, or something is still easing). */
  public needsRedraw(nowMs: number, reducedMotion: boolean): boolean {
    const wasDirty = this.dirty;
    this.dirty = false;
    return wasDirty || this.frame(nowMs, reducedMotion).animating;
  }

  public stop(): void {
    this.stopSession();
    this.signedIn = false;
    this.state = createPresenceDisplayState();
  }

  private startSession(): void {
    if (this.session !== null || this.qaOverride) {
      return;
    }
    const config = (this.options.resolveConfig ?? resolveLegacyAuthConfig)();
    // Same fail-closed rule as the sign-in client: an unrecognised project means "do not connect".
    if (config === null || resolveLegacySupabaseSchemaForUrl(config.url) === null) {
      return;
    }
    const deps = (this.options.createDeps ?? createBrowserPresenceDeps)();
    this.session = startMazerPresenceSession(
      {
        onCount: (count) => {
          this.state = pushPresenceSample(this.state, count, this.options.now());
          this.dirty = true;
        },
        publicKey: config.anonKey,
        supabaseUrl: config.url
      },
      deps
    );
  }

  private stopSession(): void {
    this.session?.stop();
    this.session = null;
  }
}
