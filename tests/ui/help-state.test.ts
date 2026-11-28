import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HELP_CONTACT_EMAIL,
  HELP_CONTACT_HREF,
  HELP_COPY,
  HELP_FAQ_ROWS,
  HELP_MESSAGE_MAX,
  buildHelpPayload,
  canSendHelp,
  createHelpDraft,
  formatHelpRetryWait,
  isHelpEmailValid,
  reduceHelpDraft,
  resolveHelpFaqRows,
  resolveHelpResultNotice,
  resolveHelpViewModel,
  type HelpDraft,
  type HelpEvent,
  type HelpSubmitResult
} from '../../src/ui/help/helpState';

/**
 * Help screen (MAZER-ONB-001 family): the pure rules behind the sheet. The DOM side has no jsdom here, so every rule
 * lives in helpState.ts and is pinned against it; the popup/mount sources are pinned by text for the isolation rules.
 */

const ROOT = process.cwd();
const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf8').replace(/\r\n?/g, '\n');

const run = (events: readonly HelpEvent[], from: HelpDraft = createHelpDraft()): HelpDraft => (
  events.reduce((draft, event) => reduceHelpDraft(draft, event), from)
);
const filled = (): HelpDraft => run([
  { type: 'open-form' },
  { type: 'email', email: '  player@example.com ' },
  { type: 'message', message: '  The star will not open.  ' }
]);
const sending = (): HelpDraft => reduceHelpDraft(filled(), { type: 'submit' });

const ALL_RESULTS: readonly HelpSubmitResult[] = [
  { status: 'saved' },
  { retryAfterSeconds: 120, status: 'rate_limited' },
  { status: 'bad_email' },
  { status: 'message_empty' },
  { status: 'message_too_long' },
  { status: 'offline' },
  { status: 'failed' }
];

describe('help draft reducer', () => {
  it('starts on the answers with nothing pre-filled, and Contact us opens the form', () => {
    const draft = createHelpDraft();
    expect(draft).toEqual({ email: '', message: '', notice: null, phase: 'editing', view: 'answers' });
    expect(canSendHelp(draft)).toBe(false);
    expect(reduceHelpDraft(draft, { type: 'open-form' }).view).toBe('form');
  });

  it('Send stays off until the message has text (whitespace does not count)', () => {
    const open = run([{ type: 'open-form' }, { type: 'email', email: 'a@b.co' }]);
    expect(canSendHelp(open)).toBe(false);
    expect(canSendHelp(reduceHelpDraft(open, { type: 'message', message: '   ' }))).toBe(false);
    expect(canSendHelp(reduceHelpDraft(open, { type: 'message', message: 'hi' }))).toBe(true);
    // A submit while Send is off changes nothing.
    expect(reduceHelpDraft(open, { type: 'submit' })).toBe(open);
  });

  it('a bad email never reaches sending: it shows the email notice and keeps both fields', () => {
    const draft = run([{ type: 'open-form' }, { type: 'email', email: 'not an email' }, { type: 'message', message: 'hi' }]);
    const after = reduceHelpDraft(draft, { type: 'submit' });
    expect(after.phase).toBe('editing');
    expect(after.email).toBe('not an email');
    expect(after.message).toBe('hi');
    expect(after.notice).toEqual({ contact: false, message: HELP_COPY.badEmail, retry: false, tone: 'info' });
  });

  it('caps the message at the server cap (2000 characters, counted as code points)', () => {
    const open = run([{ type: 'open-form' }]);
    expect(reduceHelpDraft(open, { type: 'message', message: 'x'.repeat(HELP_MESSAGE_MAX + 50) }).message).toHaveLength(HELP_MESSAGE_MAX);
    const emoji = '\u{1F31F}'.repeat(HELP_MESSAGE_MAX + 1);
    expect(Array.from(reduceHelpDraft(open, { type: 'message', message: emoji }).message)).toHaveLength(HELP_MESSAGE_MAX);
    expect(HELP_MESSAGE_MAX).toBe(2000);
  });

  it('sending locks the fields and ignores Back, typing and a second submit', () => {
    const draft = sending();
    expect(draft.phase).toBe('sending');
    expect(reduceHelpDraft(draft, { type: 'back' })).toBe(draft);
    expect(reduceHelpDraft(draft, { type: 'email', email: 'x@y.zz' })).toBe(draft);
    expect(reduceHelpDraft(draft, { type: 'message', message: 'other' })).toBe(draft);
    expect(reduceHelpDraft(draft, { type: 'submit' })).toBe(draft);
    expect(resolveHelpViewModel(draft)).toMatchObject({ fieldsDisabled: true, sendDisabled: true, sendLabel: HELP_COPY.sending });
  });

  it('after a failed or offline send the Send button reads "Try again"; a rate limit or bad email keeps "Send"', () => {
    const result = (r: Parameters<typeof resolveHelpResultNotice>[0]) => reduceHelpDraft(sending(), { type: 'result', result: r });
    expect(resolveHelpViewModel(result({ status: 'failed' })).sendLabel).toBe(HELP_COPY.tryAgain);
    expect(resolveHelpViewModel(result({ status: 'offline' })).sendLabel).toBe(HELP_COPY.tryAgain);
    expect(resolveHelpViewModel(result({ retryAfterSeconds: 60, status: 'rate_limited' })).sendLabel).toBe(HELP_COPY.send);
    expect(resolveHelpViewModel(result({ status: 'bad_email' })).sendLabel).toBe(HELP_COPY.send);
  });

  it('saved clears both fields and shows the thank-you; Back then starts clean', () => {
    const sent = reduceHelpDraft(sending(), { type: 'result', result: { status: 'saved' } });
    expect(sent).toMatchObject({ email: '', message: '', phase: 'sent' });
    expect(sent.notice).toEqual({ contact: false, message: HELP_COPY.sent, retry: false, tone: 'success' });
    expect(resolveHelpViewModel(sent).formHidden).toBe(true);
    expect(reduceHelpDraft(sent, { type: 'back' })).toEqual(createHelpDraft());
  });

  it('every failure keeps the email and the message, so a retry loses nothing', () => {
    for (const result of ALL_RESULTS.filter((r) => r.status !== 'saved')) {
      const after = reduceHelpDraft(sending(), { type: 'result', result });
      expect(after.phase, result.status).toBe('editing');
      expect(after.email, result.status).toBe('  player@example.com ');
      expect(after.message, result.status).toBe('  The star will not open.  ');
    }
  });

  it('Back keeps what was typed (an accidental Back loses nothing) and clears the notice', () => {
    const failed = reduceHelpDraft(sending(), { type: 'result', result: { status: 'failed' } });
    const back = reduceHelpDraft(failed, { type: 'back' });
    expect(back).toMatchObject({ email: '  player@example.com ', message: '  The star will not open.  ', notice: null, view: 'answers' });
    expect(reduceHelpDraft(back, { type: 'open-form' }).message).toBe('  The star will not open.  ');
  });

  it('a result that arrives when nothing is sending is ignored', () => {
    const draft = filled();
    expect(reduceHelpDraft(draft, { type: 'result', result: { status: 'saved' } })).toBe(draft);
  });
});

describe('help notices', () => {
  it('every notice is calm: tone info or success only, never error or warning', () => {
    for (const result of ALL_RESULTS) {
      expect(['info', 'success'], result.status).toContain(resolveHelpResultNotice(result).tone);
    }
  });

  it('rate_limited ALWAYS shows Contact us with the support address, whatever the wait', () => {
    for (const seconds of [1, 60, 1500, 3600, 86_400, Number.NaN, -5, 0]) {
      const after = reduceHelpDraft(sending(), { type: 'result', result: { retryAfterSeconds: seconds, status: 'rate_limited' } });
      expect(after.notice?.contact, String(seconds)).toBe(true);
      const model = resolveHelpViewModel(after);
      expect(model.contactFallback, String(seconds)).toEqual({
        email: HELP_CONTACT_EMAIL,
        href: HELP_CONTACT_HREF,
        lede: HELP_COPY.contactFallbackLede
      });
    }
    expect(HELP_CONTACT_EMAIL).toBe('fawxzzy@gmail.com');
    expect(HELP_CONTACT_HREF).toBe('mailto:fawxzzy@gmail.com');
  });

  it('failed offers Try again plus the address; offline offers Try again only; field errors offer neither', () => {
    expect(resolveHelpResultNotice({ status: 'failed' })).toMatchObject({ contact: true, retry: true });
    expect(resolveHelpResultNotice({ status: 'offline' })).toMatchObject({ contact: false, retry: true });
    for (const status of ['bad_email', 'message_empty', 'message_too_long'] as const) {
      expect(resolveHelpResultNotice({ status }), status).toMatchObject({ contact: false, retry: false });
    }
  });

  it('the rate-limit wait reads in whole minutes (at least 1), hours past 90 minutes, singular for one', () => {
    expect(formatHelpRetryWait(1)).toBe('1 minute');
    expect(formatHelpRetryWait(60)).toBe('1 minute');
    expect(formatHelpRetryWait(61)).toBe('2 minutes');
    expect(formatHelpRetryWait(1500)).toBe('25 minutes');
    expect(formatHelpRetryWait(90 * 60)).toBe('90 minutes');
    expect(formatHelpRetryWait(90 * 60 + 1)).toBe('2 hours');
    expect(formatHelpRetryWait(86_400)).toBe('24 hours');
    expect(formatHelpRetryWait(Number.NaN)).toBe('1 minute');
    expect(HELP_COPY.rateLimited(1500)).toBe('You have sent a few messages already. Try again in 25 minutes.');
  });

  it('the address line shows only on the form and only when the notice asks for it', () => {
    const limited = reduceHelpDraft(sending(), { type: 'result', result: { retryAfterSeconds: 60, status: 'rate_limited' } });
    expect(resolveHelpViewModel({ ...limited, view: 'answers' }).contactFallback).toBeNull();
    const offline = reduceHelpDraft(sending(), { type: 'result', result: { status: 'offline' } });
    expect(resolveHelpViewModel(offline).contactFallback).toBeNull();
  });
});

describe('help email check and payload', () => {
  it('matches the server rule: one @, a dotted domain, no spaces, 3..254 characters after trimming', () => {
    expect(isHelpEmailValid('a@b.co')).toBe(true);
    expect(isHelpEmailValid('  a@b.co  ')).toBe(true);
    for (const bad of ['', 'a@b', 'a b@c.de', 'a@@b.co', '@b.co', 'a@.co '.trim() + ' x', `${'x'.repeat(250)}@b.co`]) {
      expect(isHelpEmailValid(bad), bad).toBe(false);
    }
  });

  it('the payload is trimmed and carries only the RPC parameters (no user id: the server reads auth.uid())', () => {
    const payload = buildHelpPayload(filled(), { buildId: 'abc1234', gameMode: 'endless', playerLevel: 12 });
    expect(payload).toEqual({
      p_build_id: 'abc1234',
      p_email: 'player@example.com',
      p_game_mode: 'endless',
      p_message: 'The star will not open.',
      p_player_level: 12
    });
    expect(buildHelpPayload({ email: 'a@b.co', message: 'x' }, {})).toMatchObject({ p_build_id: null, p_game_mode: null, p_player_level: null });
  });
});

describe('help view model', () => {
  it('answers first, then the form titled Contact support', () => {
    expect(resolveHelpViewModel(createHelpDraft())).toMatchObject({ notice: null, title: HELP_COPY.title, view: 'answers' });
    expect(resolveHelpViewModel(filled()).title).toBe(HELP_COPY.formTitle);
  });

  it('the shard answer shows only while shards can appear', () => {
    expect(resolveHelpFaqRows().map((row) => row.id)).toEqual(['progress', 'sound']);
    expect(resolveHelpFaqRows({ includeShards: true }).map((row) => row.id)).toEqual(['progress', 'shards', 'sound']);
    expect(resolveHelpViewModel(createHelpDraft(), { includeShards: true }).faqRows).toBe(HELP_FAQ_ROWS);
  });

  it('"All tips" (moved from the Guide foot) shows only when the scene passes its label', () => {
    expect(resolveHelpViewModel(createHelpDraft()).allTips).toBeNull();
    expect(resolveHelpViewModel(createHelpDraft(), { allTipsLabel: null }).allTips).toBeNull();
    expect(resolveHelpViewModel(createHelpDraft(), { allTipsLabel: 'All tips' }).allTips).toEqual({ label: 'All tips', lede: HELP_COPY.allTipsLede });
  });

  it('the short answers name only things the game has (Profile, Sound, the Menu) and each fits two short lines', () => {
    for (const row of HELP_FAQ_ROWS) {
      expect(row.answer.length, row.id).toBeLessThanOrEqual(90);
      expect(row.question.length, row.id).toBeLessThanOrEqual(40);
      expect(row.answer, row.id).not.toMatch(/teleport|skill|rank|compass|feedback/i);
    }
  });
});

describe('help sheet isolation (source pins)', () => {
  const popup = read('src/ui/help/helpPopup.ts');
  const mount = read('src/ui/help/helpMount.ts');
  const css = read('src/ui/help/help.css');
  const state = read('src/ui/help/helpState.ts');
  const submit = read('src/legacy-runtime/legacyHelpSubmit.ts');

  it('uses the kit button, field and status banner, never red inline errors', () => {
    expect(popup).toContain('createMazerButton');
    expect(popup).toContain('createMazerField');
    expect(popup).toContain('createStatusBanner');
    expect(popup).not.toMatch(/tone:\s*'(error|warning)'/);
    expect(css).not.toMatch(/semantic-danger|semantic-warning|tone-error|#[0-9a-f]{3,8}\b/i);
  });

  it('the typed email and message are never logged or stored', () => {
    for (const [name, source] of [['popup', popup], ['mount', mount], ['state', state], ['submit', submit]] as const) {
      expect(source, name).not.toMatch(/console\.\w+\(|localStorage\.|sessionStorage\.|sendBeacon\(|recordTelemetry|trackEvent/);
    }
  });

  it('the message box carries the 2000 cap and every tap target is at least 44px', () => {
    expect(popup).toContain('maxLength = HELP_MESSAGE_MAX');
    expect(css).toMatch(/\.mazer-help__question\s*\{[\s\S]*?min-height:\s*var\(--mazer-token-touch-target-min, 44px\)/);
  });

  it('the sheet shares the rating popup scrim (z-index, key isolation) and restores focus on close', () => {
    expect(mount).toContain('FEEDBACK_SCRIM_CLASS');
    expect(mount).toContain('installFeedbackKeyIsolation');
    expect(mount).toMatch(/previousFocus\?\.focus\(/);
  });
});
