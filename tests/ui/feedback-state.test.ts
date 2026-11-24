import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FEEDBACK_COMMENT_MAX,
  FEEDBACK_COPY,
  buildFeedbackPayload,
  canSubmitFeedback,
  clampFeedbackComment,
  clampFeedbackRating,
  createFeedbackDraft,
  reduceFeedbackDraft,
  shouldOfferFeedbackAfterLevel
} from '../../src/ui/feedback/feedbackState';

const ROOT = resolve(import.meta.dirname, '../..');

describe('feedback popup state', () => {
  it('opens with no star selected and cannot submit', () => {
    const draft = createFeedbackDraft();
    expect(draft.rating).toBe(0);
    expect(draft.comment).toBe('');
    expect(canSubmitFeedback(draft)).toBe(false);
    expect(reduceFeedbackDraft(draft, { type: 'submit' })).toBe(draft);
  });

  it('accepts only whole stars 1 to 5', () => {
    expect(clampFeedbackRating(3)).toBe(3);
    for (const bad of [0, 6, -1, 2.5 + 4, Number.NaN, '4', null, undefined]) {
      expect(clampFeedbackRating(bad)).toBe(0);
    }
    expect(clampFeedbackRating(4.9)).toBe(4);
    let draft = createFeedbackDraft();
    draft = reduceFeedbackDraft(draft, { type: 'rate', rating: 9 });
    expect(draft.rating).toBe(0);
    draft = reduceFeedbackDraft(draft, { type: 'rate', rating: 2 });
    expect(draft.rating).toBe(2);
    expect(canSubmitFeedback(draft)).toBe(true);
  });

  it('caps the optional comment at the server cap, counting characters', () => {
    expect(Array.from(clampFeedbackComment('x'.repeat(600))).length).toBe(FEEDBACK_COMMENT_MAX);
    expect(Array.from(clampFeedbackComment('\u{1F600}'.repeat(600))).length).toBe(FEEDBACK_COMMENT_MAX);
    expect(clampFeedbackComment('short')).toBe('short');
  });

  it('builds the RPC payload: trimmed or null comment, no user id parameter', () => {
    let draft = reduceFeedbackDraft(createFeedbackDraft(), { type: 'rate', rating: 5 });
    expect(buildFeedbackPayload(draft, {}).p_comment).toBeNull();
    draft = reduceFeedbackDraft(draft, { type: 'comment', comment: '   ' });
    expect(buildFeedbackPayload(draft, {}).p_comment).toBeNull();
    draft = reduceFeedbackDraft(draft, { type: 'comment', comment: '  nice  ' });
    const payload = buildFeedbackPayload(draft, { buildId: 'abc1234', playerLevel: 12, gameMode: 'endless', source: 'post_level' });
    expect(payload).toEqual({
      p_rating: 5,
      p_comment: 'nice',
      p_build_id: 'abc1234',
      p_player_level: 12,
      p_game_mode: 'endless',
      p_source: 'post_level'
    });
    expect(Object.keys(payload).some((key) => /user|email|ip|device/i.test(key))).toBe(false);
  });

  it('keeps the draft on a failed, offline or rate-limited send and shows a calm notice', () => {
    let draft = reduceFeedbackDraft(createFeedbackDraft(), { type: 'rate', rating: 4 });
    draft = reduceFeedbackDraft(draft, { type: 'comment', comment: 'keep me' });
    for (const result of [
      { status: 'failed' } as const,
      { status: 'offline' } as const,
      { status: 'rate_limited', retryAfterSeconds: 1500 } as const
    ]) {
      const sending = reduceFeedbackDraft(draft, { type: 'submit' });
      expect(sending.phase).toBe('sending');
      expect(canSubmitFeedback(sending)).toBe(false);
      const back = reduceFeedbackDraft(sending, { type: 'result', result });
      expect(back.phase).toBe('editing');
      expect(back.rating).toBe(4);
      expect(back.comment).toBe('keep me');
      expect(back.notice?.tone).toBe('info');
      expect(back.notice?.message.length).toBeGreaterThan(10);
      expect(canSubmitFeedback(back)).toBe(true);
    }
    expect(FEEDBACK_COPY.rateLimitedNotice(1500)).toContain('25 min');
    expect(FEEDBACK_COPY.rateLimitedNotice(1)).toContain('1 min');
  });

  it('ends in sent on success and ignores later input', () => {
    let draft = reduceFeedbackDraft(createFeedbackDraft(), { type: 'rate', rating: 5 });
    draft = reduceFeedbackDraft(draft, { type: 'submit' });
    draft = reduceFeedbackDraft(draft, { type: 'result', result: { status: 'saved' } });
    expect(draft.phase).toBe('sent');
    expect(draft.notice?.tone).toBe('success');
    expect(reduceFeedbackDraft(draft, { type: 'rate', rating: 1 })).toBe(draft);
    expect(reduceFeedbackDraft(draft, { type: 'submit' })).toBe(draft);
  });

  it('ignores edits while sending and a stray result when not sending', () => {
    const rated = reduceFeedbackDraft(createFeedbackDraft(), { type: 'rate', rating: 3 });
    const sending = reduceFeedbackDraft(rated, { type: 'submit' });
    expect(reduceFeedbackDraft(sending, { type: 'rate', rating: 5 })).toBe(sending);
    expect(reduceFeedbackDraft(sending, { type: 'comment', comment: 'x' })).toBe(sending);
    expect(reduceFeedbackDraft(rated, { type: 'result', result: { status: 'saved' } })).toBe(rated);
  });

  it('never opens automatically during a run and respects the cooldown', () => {
    const base = { runActive: false, levelsCompletedSincePrompt: 10, lastPromptAtMs: null, nowMs: 1_000_000_000 };
    expect(shouldOfferFeedbackAfterLevel(base)).toBe(true);
    expect(shouldOfferFeedbackAfterLevel({ ...base, runActive: true })).toBe(false);
    expect(shouldOfferFeedbackAfterLevel({ ...base, levelsCompletedSincePrompt: 9 })).toBe(false);
    expect(shouldOfferFeedbackAfterLevel({ ...base, lastPromptAtMs: base.nowMs - 1000 })).toBe(false);
    expect(shouldOfferFeedbackAfterLevel({ ...base, lastPromptAtMs: base.nowMs - 8 * 24 * 3600 * 1000 })).toBe(true);
  });
});

describe('feedback popup isolation', () => {
  const popupSource = readFileSync(resolve(ROOT, 'src/ui/feedback/feedbackPopup.ts'), 'utf8');
  const css = readFileSync(resolve(ROOT, 'src/ui/feedback/feedbackPopup.css'), 'utf8');
  const vite = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf8');

  it('uses the kit button and status banner, never red inline errors', () => {
    expect(popupSource).toContain('createMazerButton');
    expect(popupSource).toContain('createStatusBanner');
    expect(popupSource).not.toMatch(/tone:\s*'error'|'warning'/);
    expect(css).not.toMatch(/semantic-danger|tone-error|#ff405d|#ff7d7d/i);
  });

  it('keeps every tap target at 44px or more', () => {
    expect(css).toMatch(/\.mazer-feedback__star\s*\{[\s\S]*?height:\s*52px/);
    expect(css).toMatch(/\.mazer-feedback__submit,\s*\.mazer-feedback__dismiss\s*\{[\s\S]*?min-height:\s*48px/);
    expect(css).toMatch(/--compact \.mazer-feedback__star\s*\{[\s\S]*?height:\s*44px/);
  });

  it('MAZER-FB-001: the options page is still not a build entry, and the popup stays out of the boot bundle (only a dynamic import loads it)', () => {
    expect(vite).not.toContain('feedback-options');
    const mainSource = readFileSync(resolve(ROOT, 'src/boot/main.ts'), 'utf8');
    const menuSource = readFileSync(resolve(ROOT, 'src/scenes/MenuScene.ts'), 'utf8');
    const launcherSource = readFileSync(resolve(ROOT, 'src/legacy-runtime/legacyFeedbackLauncher.ts'), 'utf8');
    expect(mainSource).not.toContain('ui/feedback');
    expect(menuSource).not.toContain('ui/feedback');
    // The launcher imports the DOM mount only as a type and through import(); the state module is the only static value import.
    expect(launcherSource).toContain("import('../ui/feedback/feedbackMount')");
    expect(launcherSource).toMatch(/import type \{[^}]*\} from '\.\.\/ui\/feedback\/feedbackMount'/);
    expect(launcherSource).not.toMatch(/^import \{[^}]*\} from '\.\.\/ui\/feedback\/(feedbackMount|feedbackPopup)'/m);
  });

  it('signed_out is a calm in-flow notice that keeps the draft', () => {
    const sending = reduceFeedbackDraft({ ...createFeedbackDraft(), rating: 4, comment: 'hi' }, { type: 'submit' });
    const back = reduceFeedbackDraft(sending, { type: 'result', result: { status: 'signed_out' } });
    expect(back).toMatchObject({ comment: 'hi', phase: 'editing', rating: 4 });
    expect(back.notice).toEqual({ message: FEEDBACK_COPY.signedOutNotice, tone: 'info' });
  });
});
