import '../../styles/base.css';
import '../dom/primitives.css';
import './feedbackPopup.css';
import { applyFeedbackTheme } from './feedbackTheme';
import { createFeedbackPopup, type FeedbackLayout } from './feedbackPopup';
import { FEEDBACK_COPY, createFeedbackDraft, type FeedbackDraft, type FeedbackSubmitResult } from './feedbackState';

/**
 * Options page for the in-game feedback popup (dev/proposal only, not a shipping entry: it is not in
 * vite.config build.rollupOptions.input). The popups here are the REAL component (feedbackPopup.ts) built from the
 * real kit (createMazerButton, createStatusBanner, tokens.css, primitives.css). Only the backdrop is a plain scrim:
 * in the game the popup sits over the paused menu or maze.
 *
 * Query: layout=card|sheet|compact|all (default all), theme=default|dark, state=empty|picked|filled|failed|offline|limited|sent.
 */
const params = new URLSearchParams(window.location.search);
const layoutParam = params.get('layout') ?? 'all';
const theme = params.get('theme') === 'dark' ? 'dark' : 'default';
const state = params.get('state') ?? 'empty';

const SAMPLE_NOTE = 'Level 12 felt great. The end star is easy to spot.';

const draftFor = (name: string): FeedbackDraft => {
  const base = createFeedbackDraft();
  switch (name) {
    case 'picked': return { ...base, rating: 4 };
    case 'filled': return { ...base, rating: 5, comment: SAMPLE_NOTE };
    case 'failed':
    case 'offline':
    case 'limited': {
      const result: FeedbackSubmitResult = name === 'failed'
        ? { status: 'failed' } : name === 'offline' ? { status: 'offline' } : { status: 'rate_limited', retryAfterSeconds: 1500 };
      const message = result.status === 'rate_limited'
        ? FEEDBACK_COPY.rateLimitedNotice(result.retryAfterSeconds)
        : result.status === 'offline' ? FEEDBACK_COPY.offlineNotice : FEEDBACK_COPY.failedNotice;
      return { ...base, rating: 4, comment: SAMPLE_NOTE, notice: { tone: 'info', message } };
    }
    case 'sent': return { ...base, rating: 5, phase: 'sent', notice: { tone: 'success', message: FEEDBACK_COPY.sent } };
    default: return base;
  }
};

const root = document.getElementById('feedback-options-root') as HTMLElement;
applyFeedbackTheme(document.documentElement, theme);
document.body.style.margin = '0';
document.body.style.background = 'var(--mazer-token-color-bg-shell)';
document.body.style.color = 'var(--mazer-token-color-text-primary)';

const LAYOUTS: Array<{ id: FeedbackLayout; name: string; blurb: string }> = [
  { id: 'card', name: 'A. Card', blurb: 'Centered card. Stars, note always visible, full-width Submit, Not now underneath.' },
  { id: 'sheet', name: 'B. Bottom sheet', blurb: 'Pinned to the bottom edge, big stars, the note is folded behind Add a note.' },
  { id: 'compact', name: 'C. Compact', blurb: 'Small card near the top, stars with the word beside them, Submit and Not now side by side.' }
];

const mountSingle = (layout: FeedbackLayout): void => {
  const scrim = document.createElement('div');
  scrim.className = `mazer-feedback-scrim mazer-feedback-scrim--${layout}`;
  const popup = createFeedbackPopup({ layout, draft: draftFor(state) });
  scrim.append(popup.root);
  root.replaceChildren(scrim);
};

const mountAll = (): void => {
  const page = document.createElement('main');
  page.style.cssText = 'box-sizing:border-box;display:grid;gap:28px;margin:0 auto;max-width:420px;padding:20px 16px 48px;font-family:"Space Grotesk",ui-sans-serif,system-ui,sans-serif';
  const intro = document.createElement('div');
  const h1 = document.createElement('h1');
  h1.textContent = 'Feedback popup: pick a layout';
  h1.style.cssText = 'font-size:1.35rem;line-height:1.2;margin:0 0 8px';
  const p = document.createElement('p');
  p.style.cssText = 'color:var(--mazer-token-color-text-muted);font-size:.95rem;line-height:1.4;margin:0';
  p.textContent = 'Each popup is the real component with the real kit buttons. It opens with no star selected and Submit disabled until you tap one. Try it: tap a star, type a note, tap Submit.';
  const switchRow = document.createElement('p');
  switchRow.style.cssText = 'font-size:.9rem;margin:12px 0 0';
  const other = theme === 'dark' ? 'default' : 'dark';
  const link = document.createElement('a');
  link.href = `?theme=${other}`;
  link.textContent = `Switch to ${other} theme`;
  link.style.color = 'var(--mazer-token-color-semantic-info)';
  switchRow.append(`Theme: ${theme}. `, link);
  intro.append(h1, p, switchRow);
  page.append(intro);
  for (const item of LAYOUTS) {
    const block = document.createElement('section');
    block.style.cssText = 'display:grid;gap:10px';
    const name = document.createElement('h2');
    name.textContent = item.name;
    name.style.cssText = 'font-size:1.05rem;margin:0';
    const blurb = document.createElement('p');
    blurb.textContent = item.blurb;
    blurb.style.cssText = 'color:var(--mazer-token-color-text-muted);font-size:.9rem;line-height:1.35;margin:0';
    const popup = createFeedbackPopup({
      layout: item.id,
      draft: draftFor(state),
      idPrefix: `opt-${item.id}`,
      onSubmit: (draft) => {
        // Demo only: no network. Answer like the server would: saved.
        window.setTimeout(() => popup.dispatch({ type: 'result', result: { status: 'saved' } }), 500);
        void draft;
      }
    });
    popup.root.style.maxWidth = 'none';
    if (item.id === 'sheet') popup.root.style.borderRadius = 'var(--mazer-token-radius-sheet)';
    block.append(name, blurb, popup.root);
    page.append(block);
  }
  root.replaceChildren(page);
};

if (layoutParam === 'card' || layoutParam === 'sheet' || layoutParam === 'compact') {
  mountSingle(layoutParam);
} else {
  mountAll();
}
