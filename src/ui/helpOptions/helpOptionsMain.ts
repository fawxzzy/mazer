import './helpOptions.css';
import { createMazerButton } from '../dom/MazerButton';
import { createMazerField } from '../dom/MazerField';
import { createMazerSegmentedControl } from '../dom/MazerSegmentedControl';
import { createStatusBanner } from '../dom/StatusBanner';
import {
  bootOptionsPage,
  createIconCanvas,
  createIntro,
  createNav,
  createSection,
  el,
  type OptionSpec,
  type SectionSpec
} from '../optionsPages/optionsKit';
import { HELP_ICON_IDS, paintHelpIcon, type HelpIconId } from './helpIcons';
import { buildLegacyMenuRows, LEGACY_MENU_ROW_PANEL_WIDTH_PX } from '../../legacy-runtime/legacyMenuRows';
import { resolveMenuRowVectorIconId } from '../../render/menuRowIcons';
import type { ButtonIconId } from '../../render/buttonIcons';

/**
 * Options page for the Help tab (dev/proposal only; not in vite.config build.rollupOptions.input).
 * Help is where a player gets help or submits a support request. It is NOT the rating popup (that stays a rating) and no
 * bug-report form lives in the rating. Five options each for: where the tab sits in the drop-down, what the get-help
 * view shows, and the submit-support form with its empty, sent and error states. Errors and confirmations use the in-flow
 * notice (createStatusBanner), never inline red text. Real DOM from the shipping tokens, fonts and kit components; the
 * drop-down rows come from the game's own row table and icon ids (the real menu is a Phaser canvas).
 * Nothing here is imported by the game (pinned by a test).
 *
 * Query: theme=default|dark (default: default), only=placement|view|form (show one section).
 */
const { theme, only } = bootOptionsPage();

// ------------------------------------------------------------------------------------------ 1. placement

type Screen = 'main' | 'play';
let screen: Screen = 'main';
const placementHosts: Array<() => void> = [];

interface HelpRow { readonly label: string; readonly icon: HelpIconId | null; readonly index: 'afterGuide' | 'last' | 'beforeExit' | 'none' }

const rowCanvas = (id: ButtonIconId | HelpIconId): HTMLCanvasElement => {
  if ((HELP_ICON_IDS as string[]).includes(id)) {
    const canvas = el('canvas', 'oo-icon');
    paintHelpIcon(canvas, id as HelpIconId, 20);
    canvas.setAttribute('aria-hidden', 'true');
    return canvas;
  }
  return createIconCanvas(id as ButtonIconId, 20);
};

/** The real drop-down: row table, ids, icons, 216 px panel, cyan keyline, lit row with its left bar. */
const dropdown = (help: HelpRow, lit: string | null): HTMLElement => {
  const built = screen === 'main'
    ? buildLegacyMenuRows('main', { soundEnabled: true })
    : buildLegacyMenuRows('play', { soundEnabled: true });
  const rows: ReadonlyArray<{ id: string; label: string; stateText: string | null }> = built.map((row) => ({ id: row.id, label: row.label, stateText: row.stateText ?? null }));
  const items: Array<{ id: string; label: string; stateText: string | null; icon: ButtonIconId | HelpIconId }> = rows.map((row) => ({
    id: row.id,
    label: row.label,
    stateText: row.stateText,
    icon: (resolveMenuRowVectorIconId(row.id as never, { soundEnabled: true }) ?? (({
      settings: 'settings', guide: 'guide', profile: 'profile', leaderboard: 'leaderboard', 'reset-level': 'reset', 'main-menu': 'home'
    } as Record<string, ButtonIconId>)[row.id] ?? 'menu')) as ButtonIconId
  }));
  if (help.icon) {
    const entry = { id: 'help', label: help.label, stateText: null, icon: help.icon };
    if (help.index === 'afterGuide') items.splice(items.findIndex((i) => i.id === 'guide') + 1, 0, entry);
    else if (help.index === 'beforeExit') items.splice(Math.max(items.length - 1, 0), 0, entry);
    else items.push(entry);
  }
  const panel = el('div', 'hp-panel');
  panel.style.width = `${LEGACY_MENU_ROW_PANEL_WIDTH_PX}px`;
  for (const item of items) {
    const row = el('div', `hp-row${item.id === lit ? ' is-lit' : ''}`);
    row.append(rowCanvas(item.icon), el('span', 'hp-row-label', item.label));
    if (item.stateText) row.append(el('span', 'hp-row-state', item.stateText));
    panel.append(row);
  }
  return panel;
};

const placementOption = (id: string, name: string, blurb: string, help: HelpRow, needs: string, pick?: string): OptionSpec => ({
  id,
  name,
  blurb,
  needs,
  ...(pick ? { pick: { why: pick } } : {}),
  build: () => {
    const host = el('div', 'hp-stage');
    const render = (): void => {
      const body = el('div', 'hp-menu-wrap');
      const burger = el('span', 'hp-burger');
      burger.append(createIconCanvas('menuOpen', 22));
      body.append(burger, dropdown(help, 'help'));
      host.replaceChildren(body);
    };
    placementHosts.push(render);
    render();
    return host;
  }
});

const placementSection: SectionSpec = {
  id: 'placement',
  title: '1. Where the Help tab sits in the drop-down',
  intro: 'The drop-down is the real one: same rows, icons, 216 px panel and cyan keyline. The lit row is the new Help row. Icons here are candidates drawn in the same Star Dust style (not in the shipped set yet). The screen toggle below applies to all five.',
  options: [
    placementOption('A', 'A  Help after Guide', 'A "Help" row right under Guide, with a lifebuoy. Guide and Help sit together as the two "learn" rows.',
      { label: 'Help', icon: 'lifebuoy', index: 'afterGuide' },
      'one row in legacyMenuRows.ts plus an icon in buttonIcons.ts; the Guide menu entry (legacyGuideContent.ts, id menu) lists the rows, so its copy changes and the drift test needs the update.',
      'Short label, the shortest tap path (two taps from play), and the Guide and Help rows read as a pair. The lifebuoy cannot be confused with the question-mark Guide icon.'),
    placementOption('B', 'B  Support at the bottom', 'A "Support" row with an envelope, last in the list. Out of the way of play actions.',
      { label: 'Support', icon: 'mail', index: 'last' },
      'one row and one icon; Guide menu copy and its drift test.'),
    placementOption('C', 'C  Help and support', 'A longer label, "Help and support", with a headset, one row above the last one (above Main menu in a game).',
      { label: 'Help and support', icon: 'headset', index: 'beforeExit' },
      'one row and one icon; the long label must fit the 216 px panel (it does); Guide copy and drift test.'),
    placementOption('D', 'D  Care row', 'A "Need help?" row with a heart. Friendlier, less formal.',
      { label: 'Need help?', icon: 'heart', index: 'afterGuide' },
      'one row and one icon; Guide copy and drift test.'),
    placementOption('E', 'E  Inside Guide', 'No new row. The Guide screen gets a Help tab at its top. Menu stays as is; Help is one tap deeper.',
      { label: '', icon: null, index: 'none' },
      'no menu row; the Guide screen gains a tab strip (new surface) and its content table; the drift test covers the new tab.')
  ]
};

// ------------------------------------------------------------------------------------------ 2. get-help view

const sheet = (title: string, ...children: HTMLElement[]): HTMLElement => {
  const node = el('div', 'hp-sheet');
  const head = el('div', 'hp-sheet-head');
  head.append(el('b', undefined, title), createMazerButton({ label: 'Close', tone: 'quiet' }));
  node.append(head, ...children);
  return node;
};

const faq = (question: string, answer: string, open = false): HTMLElement => {
  const details = el('details', 'hp-faq');
  details.open = open;
  details.append(el('summary', undefined, question), el('p', undefined, answer));
  return details;
};

const FAQ_ROWS: ReadonlyArray<readonly [string, string]> = [
  ['My progress is missing', 'Progress saves to this device. Sign in from Profile to keep it across devices.'],
  ['The shards will not let me finish', 'Take every shard in order. The next one pulses; the star opens when all are taken.'],
  ['Sound is off', 'Open the menu and set Sound to On. Your phone silent switch can also mute the game.']
];

const viewOption = (id: string, name: string, blurb: string, build: () => HTMLElement, needs: string, pick?: string): OptionSpec => ({
  id,
  name,
  blurb,
  needs,
  ...(pick ? { pick: { why: pick } } : {}),
  build: () => {
    const host = el('div', 'hp-stage');
    host.append(build());
    return host;
  }
});

const viewSection: SectionSpec = {
  id: 'view',
  title: '2. The get-help view',
  intro: 'What opens when the player taps Help. It is a sheet over the game, like the sign-in and settings sheets, built from the kit button and the same panel colours. The rating popup is separate and unchanged.',
  options: [
    viewOption('A', 'A  Short answers', 'Three common questions as expanding rows, then a "Contact us" button for everything else.', () => sheet('Help',
      ...FAQ_ROWS.map(([q, a], i) => faq(q, a, i === 0)),
      createMazerButton({ label: 'Contact us', tone: 'primary' })),
      'copy for the answers (owner-written), one sheet, an entry in the Guide; the form is section 3.',
      'Most players want the answer, not a form. Three rows keep it short, and Contact us is always one tap away at the bottom.'),
    viewOption('B', 'B  Guide first', 'A search box over the Guide topics, the top three topics, and a Contact link.', () => {
      const search = createMazerField({ id: 'hp-search', label: 'Search help', type: 'search', placeholder: 'Shards, sound, account' });
      const list = el('div', 'hp-links');
      ['Guide: the goal and the star', 'Guide: shards', 'Guide: your account'].forEach((t) => list.append(createMazerButton({ label: t, tone: 'secondary' })));
      return sheet('Help', search.root, list, createMazerButton({ label: 'Contact us', tone: 'quiet' }));
    }, 'a search over legacyGuideContent.ts rows (new logic) and deep links into the Guide; Guide copy and drift test.'),
    viewOption('C', 'C  Two big buttons', 'Almost nothing on screen: Read the Guide, or Contact support. Fastest to build.', () => sheet('Help',
      el('p', 'hp-lede', 'How can we help?'),
      createMazerButton({ label: 'Read the Guide', tone: 'secondary' }),
      createMazerButton({ label: 'Contact support', tone: 'primary' })),
      'one sheet with two buttons; no new copy beyond the labels.'),
    viewOption('D', 'D  Contact first', 'The form is the view. A small "Check the Guide first" link sits above it.', () => {
      const field = createMazerField({ id: 'hp-d-msg', label: 'What is going wrong?', placeholder: 'A few words is enough' });
      return sheet('Contact support', createMazerButton({ label: 'Check the Guide first', tone: 'quiet' }), field.root, createMazerButton({ label: 'Send', tone: 'primary' }));
    }, 'one sheet that IS the form (section 3); the Guide link opens the Guide.'),
    viewOption('E', 'E  This device', 'Shows what support would ask for (version, signed in, sound), a Copy details button, then Contact us.', () => {
      const facts = el('dl', 'hp-facts');
      [['Game', 'Mazer, level 63'], ['Signed in', 'No (guest)'], ['Sound', 'On']].forEach(([k, v]) => { facts.append(el('dt', undefined, k), el('dd', undefined, v)); });
      return sheet('Help', facts, createMazerButton({ label: 'Copy details', tone: 'secondary' }), createMazerButton({ label: 'Contact us', tone: 'primary' }));
    }, 'a read of version, level and account state (no new data collected), a clipboard action; Guide entry.')
  ]
};

// ------------------------------------------------------------------------------------------ 3. submit form

type FormState = 'empty' | 'sent' | 'error';
interface FormSpec { readonly extra?: (form: HTMLElement) => void; readonly topics?: boolean; readonly email?: boolean; readonly attach?: boolean; readonly counter?: boolean }

const buildForm = (idBase: string, spec: FormSpec): HTMLElement => {
  const holder = el('div', 'hp-stage hp-form-demo');
  const noticeHost = el('div', 'hp-notice');
  const form = el('form', 'hp-form');
  form.noValidate = true;
  form.addEventListener('submit', (event) => event.preventDefault());
  if (spec.topics) {
    const topics = createMazerSegmentedControl({
      id: `${idBase}-topic`,
      label: 'What is it about?',
      options: [{ value: 'account', label: 'Account' }, { value: 'bug', label: 'Game bug' }, { value: 'idea', label: 'Idea' }, { value: 'other', label: 'Other' }],
      selectedValue: 'account'
    });
    form.append(topics.root);
  }
  if (spec.email) form.append(createMazerField({ id: `${idBase}-email`, label: 'Your email', type: 'email', autoComplete: 'email', placeholder: 'you@example.com', description: 'We reply here.' }).root);
  const label = el('label', 'hp-label', 'Message');
  const area = el('textarea', 'mazer-field__input hp-textarea');
  area.id = `${idBase}-msg`;
  area.rows = 4;
  area.maxLength = 500;
  area.placeholder = 'Tell us what happened';
  label.htmlFor = area.id;
  const counter = el('span', 'hp-counter', '0 / 500');
  area.addEventListener('input', () => { counter.textContent = `${area.value.length} / 500`; });
  form.append(label, area);
  if (spec.counter) form.append(counter);
  if (spec.attach) {
    const row = el('label', 'hp-attach');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = true;
    row.append(box, el('span', undefined, 'Include device and game details (version, level)'));
    form.append(row);
  }
  const send = createMazerButton({ label: 'Send', tone: 'primary', disabled: true });
  form.append(send);
  const apply = (state: FormState): void => {
    noticeHost.replaceChildren();
    send.disabled = state === 'empty';
    if (state === 'empty') {
      area.value = '';
      counter.textContent = '0 / 500';
    } else {
      area.value = 'The star would not open on level 63 even after I took the last shard.';
      counter.textContent = `${area.value.length} / 500`;
    }
    if (state === 'sent') noticeHost.append(createStatusBanner({ message: 'Sent. Thank you, we will reply by email.', tone: 'success' }));
    if (state === 'error') noticeHost.append(createStatusBanner({ message: 'Could not send. Check your connection and try again.', tone: 'error', actionLabel: 'Try again' }));
  };
  const states = createMazerSegmentedControl<FormState>({
    id: `${idBase}-state`,
    label: 'Show state',
    options: [{ value: 'empty', label: 'Empty' }, { value: 'sent', label: 'Sent' }, { value: 'error', label: 'Error' }],
    selectedValue: 'empty',
    onChange: (value) => apply(value)
  });
  const bar = el('div', 'oo-controls');
  bar.append(states.root);
  apply('empty');
  holder.append(bar, noticeHost, sheet('Contact support', form));
  return holder;
};

const formOption = (id: string, name: string, blurb: string, spec: FormSpec, needs: string, pick?: string): OptionSpec => ({
  id,
  name,
  blurb,
  needs,
  ...(pick ? { pick: { why: pick } } : {}),
  build: () => buildForm(`hp-form-${id}`, spec)
});

const formSection: SectionSpec = {
  id: 'form',
  title: '3. Submit-support form and its states',
  intro: 'Press Empty, Sent and Error on each. Sent and Error use the in-flow notice (createStatusBanner), never inline red text under a field. Send stays disabled until there is a message. Where it would be sent (an email, a table) is a back-end decision that is NOT made here and needs your yes before any database or service work.',
  options: [
    formOption('A', 'A  Message only', 'One message box and Send. The shortest form; the reply address comes from the signed-in account.', {},
      'a form, a send path (back end undecided), a copy line in the Guide. Guests would have no reply address.'),
    formOption('B', 'B  Topic chips', 'Four topic chips, a message, and Send. Helps sort what comes in; includes a "Game bug" topic here, separate from the rating.', { topics: true },
      'a form with a topic field the back end must store; a copy line in the Guide.'),
    formOption('C', 'C  Email first', 'An email field and a message. Works for guests and signed-in players alike.', { email: true },
      'a form with email validation and a send path; a privacy line for the email; copy in the Guide.',
      'It works for guests, who are most players, and the reply address is always explicit. One field more than A, no topic to pick.'),
    formOption('D', 'D  With device details', 'A message and a tick box (on by default) that attaches version and level so reports are actionable.', { attach: true },
      'a form, a small details payload (no new data beyond version and level), a copy line in the Guide.'),
    formOption('E', 'E  Counted note', 'A single box with a visible 500 character counter and Send. No other fields.', { counter: true },
      'a form with a length cap; copy in the Guide.')
  ]
};

// ------------------------------------------------------------------------------------------ mount

const sections = [placementSection, viewSection, formSection];
const visible = only ? sections.filter((section) => section.id === only) : sections;

const wrap = el('main', 'oo-wrap');
wrap.append(
  createIntro('Help tab: options', [
    'Help is where a player gets help or sends a support message. It is its own thing: the rating popup (level 50) stays a rating, and there is no bug report inside it. Pick one option per section. Nothing is wired into the game.',
    'If Help ships, the in-app Guide must change with it: the Menu entry in legacyGuideContent.ts lists the drop-down rows, and tests/reset/legacy-guide-content-drift.test.ts pins that copy, so both are updated in the same PR.'
  ], theme, only),
  createNav(sections)
);

const screenControl = createMazerSegmentedControl<Screen>({
  id: 'hp-screen',
  label: 'Drop-down on',
  options: [{ value: 'main', label: 'Main menu' }, { value: 'play', label: 'In a game' }],
  selectedValue: 'main',
  onChange: (value) => { screen = value; placementHosts.forEach((render) => render()); }
});
const built = visible.map(createSection);
const placementEl = built.find((node) => node.id === 'placement');
if (placementEl) {
  const bar = el('div', 'oo-controls');
  bar.append(screenControl.root);
  placementEl.querySelector('.oo-section-head')?.after(bar);
}
wrap.append(...built);
document.getElementById('help-options-root')?.append(wrap);
