import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { LEGACY_USERNAME_PATTERN } from '../../src/legacy-runtime/legacyAuth';
import {
  CLOSED_LEGACY_USERNAME_EDITOR_STATE,
  LEGACY_USERNAME_EDITOR_AUTOFILL_OPT_OUT,
  LEGACY_USERNAME_EDITOR_COPY,
  LEGACY_USERNAME_EDITOR_INPUT_ATTRIBUTES,
  LEGACY_USERNAME_EDITOR_MAX_LENGTH,
  buildLegacyUsernameEditorPlan,
  buildLegacyUsernameEditorViewModel,
  cancelLegacyUsernameEditor,
  changeLegacyUsernameEditorDraft,
  createLegacyUsernameEditorFixtureServices,
  finishLegacyUsernameEditor,
  isLegacyUsernameDraftInvalid,
  limitLegacyUsernameDraft,
  openLegacyUsernameEditor,
  resolveLegacyUsernameEditorVerdict,
  submitLegacyUsernameEdit,
  submitLegacyUsernameEditor,
  type LegacyUsernameEditorServices
} from '../../src/legacy-runtime/legacyLeaderboardUsernameEditor';
import { LEGACY_LEADERBOARD_PLAN_VIEWPORTS, buildLegacyLeaderboardOverlayPlan } from '../../src/legacy-runtime/legacyLeaderboardOverlayPlan';
import { buildLegacyLeaderboardViewModel, type LegacyLeaderboardViewState } from '../../src/legacy-runtime/legacyLeaderboardView';
import { resolveLegacyUsernameSaveFailureMessage } from '../../src/legacy-runtime/legacyPlayerMessage';
import { LEGACY_UI_MIN_TOUCH_TARGET } from '../../src/legacy-runtime/legacyUiStandards';

const services = (patch: Partial<LegacyUsernameEditorServices> = {}): LegacyUsernameEditorServices & {
  checkAvailable: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
} => ({
  checkAvailable: vi.fn(async () => ({ available: true, error: null })),
  save: vi.fn(async () => ({ error: null, failure: null, ok: true })),
  ...patch
}) as never;

describe('username editor: the one validator is reused', () => {
  test('the verdict is LEGACY_USERNAME_PATTERN (2-15 letters, numbers, . _ -), not a copy of it', () => {
    const accepted = ['ab', 'Mazer-123456', 'a.b_c-d', 'A'.repeat(15)];
    const rejected = ['', 'a', 'A'.repeat(16), 'has space', 'émile', 'semi;colon', 'a/b'];
    for (const name of accepted) {
      expect(LEGACY_USERNAME_PATTERN.test(name)).toBe(true);
      expect(resolveLegacyUsernameEditorVerdict(name, 'other').kind).toBe('ready');
    }
    for (const name of rejected) {
      expect(LEGACY_USERNAME_PATTERN.test(name)).toBe(false);
      expect(resolveLegacyUsernameEditorVerdict(name, 'other').kind).toBe('invalid');
    }
    const source = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyLeaderboardUsernameEditor.ts'), 'utf8');
    expect(source).toContain("import { LEGACY_USERNAME_PATTERN } from './legacyAuth';");
    expect(source).not.toMatch(/=\s*\/\^\[/);
  });

  test('maxlength is the pattern ceiling, drafts are limited but never re-cased', () => {
    expect(LEGACY_USERNAME_EDITOR_MAX_LENGTH).toBe(15);
    expect(LEGACY_USERNAME_PATTERN.test('a'.repeat(LEGACY_USERNAME_EDITOR_MAX_LENGTH))).toBe(true);
    expect(LEGACY_USERNAME_PATTERN.test('a'.repeat(LEGACY_USERNAME_EDITOR_MAX_LENGTH + 1))).toBe(false);
    expect(limitLegacyUsernameDraft('abcdefghijklmnopqrst')).toBe('abcdefghijklmno');
    expect(limitLegacyUsernameDraft('lower UPPER')).toBe('lower UPPER');
  });

  test('whitespace is trimmed before validating and saving', () => {
    expect(resolveLegacyUsernameEditorVerdict('  nova  ', 'old')).toEqual({ candidate: 'nova', caseOnlyRename: false, kind: 'ready' });
    expect(resolveLegacyUsernameEditorVerdict('   ', 'old').kind).toBe('invalid');
    expect(isLegacyUsernameDraftInvalid('  ')).toBe(false);
    expect(isLegacyUsernameDraftInvalid('a')).toBe(true);
    expect(isLegacyUsernameDraftInvalid('ok_name')).toBe(false);
  });

  test('the exact current name is unchanged; a case-only rename is ready and skips availability', () => {
    expect(resolveLegacyUsernameEditorVerdict('Nova', 'Nova').kind).toBe('unchanged');
    expect(resolveLegacyUsernameEditorVerdict('nova', 'Nova')).toEqual({ candidate: 'nova', caseOnlyRename: true, kind: 'ready' });
  });

  test('the native input never auto-capitalises, corrects, spell-checks or autofills', () => {
    expect(LEGACY_USERNAME_EDITOR_INPUT_ATTRIBUTES).toMatchObject({
      autocapitalize: 'none',
      autocomplete: 'off',
      autocorrect: 'off',
      inputMode: 'text',
      maxLength: 15,
      spellcheck: false,
      type: 'text'
    });
    expect(LEGACY_USERNAME_EDITOR_AUTOFILL_OPT_OUT).toMatchObject({ 'data-1p-ignore': 'true', 'data-lpignore': 'true' });
  });
});

describe('username editor: state machine', () => {
  test('open starts from the saved name (empty on the gate); typing limits to 15', () => {
    expect(openLegacyUsernameEditor('Mazer-123456')).toEqual({ draft: 'Mazer-123456', phase: 'editing', savedValue: 'Mazer-123456' });
    expect(openLegacyUsernameEditor('')).toEqual({ draft: '', phase: 'editing', savedValue: '' });
    const typed = changeLegacyUsernameEditorDraft(openLegacyUsernameEditor('x'), 'abcdefghijklmnopqrstuvwxyz');
    expect(typed.draft).toBe('abcdefghijklmno');
    expect(changeLegacyUsernameEditorDraft(CLOSED_LEGACY_USERNAME_EDITOR_STATE, 'abc')).toBe(CLOSED_LEGACY_USERNAME_EDITOR_STATE);
  });

  test('cancel closes from editing and from saving', () => {
    expect(cancelLegacyUsernameEditor()).toBe(CLOSED_LEGACY_USERNAME_EDITOR_STATE);
    const saving = submitLegacyUsernameEditor({ draft: 'fresh_name', phase: 'editing', savedValue: 'old' });
    expect(saving.kind).toBe('save');
    expect(saving.state.phase).toBe('saving');
  });

  test('1 character is invalid: the editor stays open with the draft kept', () => {
    const state = { draft: 'a', phase: 'editing', savedValue: 'old' } as const;
    expect(submitLegacyUsernameEditor(state)).toEqual({ kind: 'invalid', state });
  });

  test('the same name just closes; a second Save while saving is ignored', () => {
    expect(submitLegacyUsernameEditor({ draft: ' old ', phase: 'editing', savedValue: 'old' }))
      .toEqual({ kind: 'unchanged', state: CLOSED_LEGACY_USERNAME_EDITOR_STATE });
    const saving = { draft: 'fresh', phase: 'saving', savedValue: 'old' } as const;
    expect(submitLegacyUsernameEditor(saving)).toEqual({ kind: 'ignored', state: saving });
    expect(submitLegacyUsernameEditor(CLOSED_LEGACY_USERNAME_EDITOR_STATE).kind).toBe('ignored');
  });

  test('a saved outcome closes the editor; a failed one returns to editing with the draft', () => {
    const saving = { draft: 'fresh', phase: 'saving', savedValue: 'old' } as const;
    expect(finishLegacyUsernameEditor(saving, { kind: 'saved', username: 'fresh' })).toBe(CLOSED_LEGACY_USERNAME_EDITOR_STATE);
    expect(finishLegacyUsernameEditor(saving, { failure: 'taken', kind: 'failed', technicalDetail: null }))
      .toEqual({ draft: 'fresh', phase: 'editing', savedValue: 'old' });
    const closed = CLOSED_LEGACY_USERNAME_EDITOR_STATE;
    expect(finishLegacyUsernameEditor(closed, { kind: 'saved', username: 'fresh' })).toBe(closed);
  });
});

describe('username editor: save orchestration', () => {
  const input = { candidate: 'fresh_name', caseOnlyRename: false, userId: 'user-1' };

  test('success checks availability, saves through the hardened save and reports the new name', async () => {
    const svc = services();
    await expect(submitLegacyUsernameEdit(input, svc)).resolves.toEqual({ kind: 'saved', username: 'fresh_name' });
    expect(svc.checkAvailable).toHaveBeenCalledWith('fresh_name');
    expect(svc.save).toHaveBeenCalledWith('user-1', 'fresh_name');
  });

  test('a taken name never reaches the save and maps to the existing taken toast', async () => {
    const svc = services({ checkAvailable: vi.fn(async () => ({ available: false, error: null })) });
    const outcome = await submitLegacyUsernameEdit(input, svc);
    expect(outcome).toEqual({ failure: 'taken', kind: 'failed', technicalDetail: null });
    expect(svc.save).not.toHaveBeenCalled();
    if (outcome.kind === 'failed') {
      expect(resolveLegacyUsernameSaveFailureMessage(outcome.failure).copy).toBe('That username is already taken.');
    }
  });

  test('a save that loses the race (unique index) is reported as taken from the save result', async () => {
    const svc = services({ save: vi.fn(async () => ({ error: 'That username is already taken.', failure: 'taken', ok: false })) });
    await expect(submitLegacyUsernameEdit(input, svc)).resolves.toEqual({
      failure: 'taken',
      kind: 'failed',
      technicalDetail: 'That username is already taken.'
    });
  });

  test('an availability error or a thrown request is try-again, and the provider text stays technical', async () => {
    const check = services({ checkAvailable: vi.fn(async () => ({ available: null, error: 'fetch failed' })) });
    await expect(submitLegacyUsernameEdit(input, check)).resolves.toEqual({
      failure: 'try-again',
      kind: 'failed',
      technicalDetail: 'fetch failed'
    });
    expect(check.save).not.toHaveBeenCalled();
    const thrown = services({ save: vi.fn(async () => { throw new Error('socket closed'); }) });
    await expect(submitLegacyUsernameEdit(input, thrown)).resolves.toMatchObject({ failure: 'try-again', kind: 'failed', technicalDetail: 'socket closed' });
  });

  test('a save with no failure kind falls back to the generic failure', async () => {
    const svc = services({ save: vi.fn(async () => ({ error: 'boom', failure: null, ok: false })) });
    await expect(submitLegacyUsernameEdit(input, svc)).resolves.toMatchObject({ failure: 'failed', kind: 'failed' });
  });

  test('a case-only rename skips the availability gate (it would match the caller own row)', async () => {
    const svc = services({ checkAvailable: vi.fn(async () => ({ available: false, error: null })) });
    await expect(submitLegacyUsernameEdit({ ...input, candidate: 'Nova', caseOnlyRename: true }, svc))
      .resolves.toEqual({ kind: 'saved', username: 'Nova' });
    expect(svc.checkAvailable).not.toHaveBeenCalled();
  });

  test('the QA fixture services are local: free unless the name is taken', async () => {
    const fixture = createLegacyUsernameEditorFixtureServices();
    await expect(submitLegacyUsernameEdit(input, fixture)).resolves.toEqual({ kind: 'saved', username: 'fresh_name' });
    await expect(submitLegacyUsernameEdit({ ...input, candidate: 'Taken' }, fixture)).resolves.toMatchObject({ failure: 'taken' });
  });
});

describe('username editor: view-model', () => {
  test('editing: labels, hint, enabled Save; an invalid draft turns the field and hint red', () => {
    const ok = buildLegacyUsernameEditorViewModel(openLegacyUsernameEditor('nova'));
    expect(ok).toMatchObject({
      busy: false,
      cancel: { label: 'Cancel' },
      fieldInvalid: false,
      fieldValue: 'nova',
      hintTone: 'muted',
      save: { enabled: true, label: 'Save' },
      title: 'Edit name'
    });
    const bad = buildLegacyUsernameEditorViewModel(changeLegacyUsernameEditorDraft(openLegacyUsernameEditor('nova'), 'a b'));
    expect(bad).toMatchObject({ fieldInvalid: true, hintTone: 'error', save: { enabled: true } });
  });

  test('saving: busy, Save disabled and relabelled', () => {
    const saving = submitLegacyUsernameEditor({ draft: 'fresh', phase: 'editing', savedValue: 'old' }).state;
    expect(buildLegacyUsernameEditorViewModel(saving)).toMatchObject({ busy: true, save: { enabled: false, label: 'Saving' } });
  });

  test('no new player-facing sentence: copy is labels plus one non-sentence hint', () => {
    for (const value of Object.values(LEGACY_USERNAME_EDITOR_COPY)) {
      expect(value).not.toMatch(/[.!?…]$/);
    }
  });
});

describe('username editor: layout plan (Chip sheet, 44 px, keyboard-safe)', () => {
  const view = buildLegacyUsernameEditorViewModel(openLegacyUsernameEditor('nova'));
  const FLOOR = LEGACY_UI_MIN_TOUCH_TARGET;

  test.each([...LEGACY_LEADERBOARD_PLAN_VIEWPORTS])('$width x $height: controls >= 44 px and inside the card and the screen', ({ height, width }) => {
    const plan = buildLegacyUsernameEditorPlan(view, width, height);
    for (const rect of [plan.field, plan.save, plan.cancel]) {
      expect(rect.height).toBeGreaterThanOrEqual(FLOOR);
      expect(rect.width).toBeGreaterThanOrEqual(FLOOR);
      expect(rect.left).toBeGreaterThanOrEqual(plan.card.left);
      expect(rect.left + rect.width).toBeLessThanOrEqual(plan.card.left + plan.card.width);
      expect(rect.top + rect.height).toBeLessThanOrEqual(plan.card.top + plan.card.height);
    }
    expect(plan.cancel.left + plan.cancel.width).toBeLessThan(plan.save.left);
    expect(plan.card.top).toBeGreaterThanOrEqual(0);
    expect(plan.card.top + plan.card.height).toBeLessThanOrEqual(height);
  });

  test.each([
    { height: 568, width: 320 },
    { height: 844, width: 390 }
  ])('$width x $height phone: field and both buttons stay in the top half, above a soft keyboard', ({ height, width }) => {
    const plan = buildLegacyUsernameEditorPlan(view, width, height);
    expect(plan.compact).toBe(true);
    expect(plan.controlsBottom).toBeLessThanOrEqual(Math.round(height * 0.5));
    expect(plan.card.top).toBeLessThanOrEqual(16);
  });

  test('a smaller visible height (keyboard shrinks the layout) still keeps the controls on screen', () => {
    const plan = buildLegacyUsernameEditorPlan(view, 320, 300);
    expect(plan.controlsBottom).toBeLessThanOrEqual(300);
  });

  test('desktop centres the card', () => {
    const plan = buildLegacyUsernameEditorPlan(view, 1280, 720);
    expect(plan.compact).toBe(false);
    const centre = plan.card.top + (plan.card.height / 2);
    expect(Math.abs(centre - 360)).toBeLessThanOrEqual(2);
  });
});

describe('leaderboard: Edit name is on the player row and on the gate', () => {
  const base: LegacyLeaderboardViewState = {
    entries: [
      { isRequestingUser: true, playerLevel: '68', rank: '1', username: 'nova' },
      { isRequestingUser: false, playerLevel: '60', rank: '2', username: 'kestrel' }
    ],
    errorMessage: null,
    online: true,
    selfRank: { hasUsername: true, playerLevel: '68', rank: '1' },
    selfUsername: 'nova',
    signedIn: true,
    status: 'ready',
    usernameGate: 'ok'
  };

  test('the pinned You row carries the Edit name label and a >= 44 px hit target at every audit viewport', () => {
    const view = buildLegacyLeaderboardViewModel(base);
    expect(view.selfRow?.editLabel).toBe('Edit name');
    for (const { height, width } of LEGACY_LEADERBOARD_PLAN_VIEWPORTS) {
      const plan = buildLegacyLeaderboardOverlayPlan(view, width, height);
      expect(plan.selfRow).not.toBeNull();
      const hit = plan.selfRow!.editHit;
      expect(hit.height).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
      expect(hit.width).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
      expect(hit).toEqual(plan.selfRow!.rect);
    }
  });

  test('the Choose a username gate offers Edit name (it used to point at an Account editor that no longer exists)', () => {
    const view = buildLegacyLeaderboardViewModel({ ...base, usernameGate: 'needs-username' });
    expect(view.state).toMatchObject({ action: { id: 'edit-username', label: 'Edit name' }, heading: 'Choose a username' });
  });
});

describe('MenuScene wiring (source contract)', () => {
  const menu = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n?/g, '\n');

  test('Edit name opens the editor from the row hit and the gate action', () => {
    expect(menu).toContain('this.uiButtons.push(this.createLegacyLeaderboardEditNameHit(plan.selfRow));');
    expect(menu).toContain("case 'edit-username':\n        this.openLeaderboardUsernameEditor();");
    expect(menu).toContain("background.on('pointerdown', () => this.openLeaderboardUsernameEditor());");
  });

  test('cancel: Back (Escape, the scrim tap and Cancel all route through it) closes the editor before the sheet', () => {
    const back = menu.slice(menu.indexOf('private handleBackAction(): void {'), menu.indexOf('const action = resolveLegacyOverlayBackAction({'));
    expect(back).toContain("this.overlay === 'leaderboard' && this.leaderboardUsernameEditor.phase !== 'closed'");
    expect(back).toContain('this.closeLeaderboardUsernameEditor();');
    expect(menu).toContain("view.cancel.label,\n      () => this.handleBackAction(),");
    expect(menu).toContain("this.overlay !== 'options' && this.overlay !== 'leaderboard'");
    expect(menu).toContain("if (previousOverlay === 'leaderboard' && kind !== 'leaderboard') {\n      this.closeLeaderboardUsernameEditor();");
  });

  test('save success refreshes the leaderboard row and closes the editor; failure toasts with the draft kept', () => {
    const submit = menu.slice(menu.indexOf('private submitLeaderboardUsernameEditor(): void {'), menu.indexOf('private handleLeaderboardUsernameEditorKey('));
    expect(submit).toContain('this.accountUsernameSavedValue = outcome.username;');
    expect(submit).toContain('void this.loadLeaderboard({ keepRows: true });');
    expect(submit).toContain('finishLegacyUsernameEditor(this.leaderboardUsernameEditor, outcome)');
    expect(submit).toContain('this.reportAccountUsernameSaveFailure(outcome.failure, outcome.technicalDetail);');
    expect(submit).toContain("this.reportAccountUsernameSaveFailure('invalid', null);");
    expect(submit).toContain('save: saveLegacyAccountUsername');
  });

  test('the shadow input is built from the shared attribute set (no auto-capitalise, maxlength 15)', () => {
    const sync = menu.slice(menu.indexOf('private syncLeaderboardUsernameNativeInput('), menu.indexOf('private buildLeaderboardUsernameEditorOverlay'));
    for (const needle of ['attributes.autocapitalize', 'attributes.spellcheck', 'attributes.maxLength', 'attributes.autocomplete', 'LEGACY_USERNAME_EDITOR_AUTOFILL_OPT_OUT']) {
      expect(sync).toContain(needle);
    }
  });

  test('the dead username-field code is gone', () => {
    for (const dead of ['accountUsernameActive', 'handleAccountUsernameFieldInput', 'handleAccountUsernameChange', 'scheduleAccountUsernameEvaluation', 'evaluateAndSaveAccountUsername', 'accountUsernameDebounceTimer', 'accountUsernameDraft']) {
      expect(menu).not.toContain(dead);
    }
  });
});
