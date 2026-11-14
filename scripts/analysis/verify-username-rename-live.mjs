#!/usr/bin/env node
/**
 * MAZER-ACCT-033: live headless recheck that the main-menu header follows the saved profile name
 * after a rename on the Leaderboard and a reload.
 *
 *   node scripts/analysis/verify-username-rename-live.mjs --mode read-only
 *   node scripts/analysis/verify-username-rename-live.mjs --mode rename [--new-name qa-ren-1113]
 *   node scripts/analysis/verify-username-rename-live.mjs --mode restore     (put the QA name back)
 *
 * Options: --viewport phone|desktop|both (default phone: 390x844 @ DPR 3), --base <origin>
 *          (default https://mazer.fawxzzy.com), --out <dir> (screenshots + result.json).
 *
 * It signs in ONLY as the standing QA account (mzr-qa-1112) through the real sign-in hand-off: the app sends a
 * signed-out launch to the account host, the script logs in there, the host returns to Mazer. The context
 * emulates an installed app (display-mode standalone + navigator.standalone) so the install gate does not hide
 * the menu. The password is read from the local DPAPI credential blob (label mazer-qa1) through the Fitness QA
 * helper and is never printed or written.
 *
 * Modes:
 *   read-only  signs in, reads the header and the Leaderboard "You" row, changes nothing.
 *   rename     renames the QA account on the Leaderboard, reads the header in the same session and after a
 *              reload, then ALWAYS puts the name back and reads it back (in a finally block).
 *   restore    puts the QA account back to mzr-qa-1112 if a previous run was interrupted.
 *
 * No SQL, no account creation, no other account is touched: the script refuses to rename unless the Leaderboard
 * "You" row shows the QA name (or, in restore mode, the rename target).
 *
 * Header reading: the menu header label is a text label near the top of the canvas. It is truncated with an
 * ellipsis on a phone ("mzr-qa..."), so a name "shows" when the label equals it or is its prefix plus an ellipsis.
 * The default rename target differs from the QA name inside that visible prefix so the check cannot pass by accident.
 * Where the header no longer shows the username (the online-counter header), the script reports the header label
 * as is and the Leaderboard "You" row remains the surface that carries the saved name.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const { chromium } = require(require.resolve('playwright', { paths: [repoRoot] }));

const QA_NAME = 'mzr-qa-1112';
const QA_LOGIN = QA_NAME;
const DEFAULT_NEW_NAME = 'qa-ren-1113';
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{2,15}$/u;
const ELLIPSES = ['…', '...'];

const parseArgs = (argv) => {
  const out = { mode: 'read-only', viewport: 'phone', base: 'https://mazer.fawxzzy.com', newName: DEFAULT_NEW_NAME, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = () => argv[(i += 1)];
    if (flag === '--mode') out.mode = next();
    else if (flag === '--viewport') out.viewport = next();
    else if (flag === '--base') out.base = next().replace(/\/+$/u, '');
    else if (flag === '--new-name') out.newName = next();
    else if (flag === '--out') out.out = next();
    else throw new Error(`unknown argument ${flag}`);
  }
  if (!['read-only', 'rename', 'restore'].includes(out.mode)) throw new Error('--mode must be read-only, rename or restore');
  if (!['phone', 'desktop', 'both'].includes(out.viewport)) throw new Error('--viewport must be phone, desktop or both');
  if (!USERNAME_PATTERN.test(out.newName) || out.newName.toLowerCase() === QA_NAME.toLowerCase()) {
    throw new Error('--new-name must be a valid username different from the QA name');
  }
  return out;
};

const VIEWPORTS = {
  phone: { label: 'phone-390x844-dpr3', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  desktop: { label: 'desktop-1280x720', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false }
};

const readQaPassword = () => {
  const helper = process.env.MAZER_QA_LIB || join(homedir(), '.claude', 'skills', 'fitness', 'qa', 'lib.js');
  return require(helper).readPassword('mazer-qa1');
};

const stripEllipsis = (text) => {
  for (const ellipsis of ELLIPSES) {
    if (text.endsWith(ellipsis)) return { text: text.slice(0, -ellipsis.length), truncated: true };
  }
  return { text, truncated: false };
};

/** True when the label shows `name`: equal, or a prefix of at least 3 characters plus an ellipsis. */
export const labelShowsName = (label, name) => {
  if (typeof label !== 'string' || label.length === 0) return false;
  const { text, truncated } = stripEllipsis(label);
  if (!truncated) return label === name;
  return text.length >= 3 && name.startsWith(text);
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const readDiagnostics = (page) => page.evaluate(() => {
  const raw = document.documentElement.getAttribute('data-mazer-visual-diagnostics');
  return raw ? JSON.parse(raw) : null;
});

const waitFor = async (check, timeoutMs, what) => {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${what}`);
};

const center = (bounds) => ({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });

const press = async (page, mobile, point) => {
  if (mobile) {
    await page.touchscreen.tap(point.x, point.y);
    return;
  }
  await page.mouse.move(point.x - 6, point.y - 2);
  await sleep(250);
  await page.mouse.move(point.x, point.y);
  await sleep(250);
  await page.mouse.down();
  await sleep(120);
  await page.mouse.up();
};

const findButton = (diagnostics, text) => (diagnostics?.buttons ?? []).find((button) => button.text === text && button.bounds);

const pressButton = async (page, mobile, text) => {
  const button = await waitFor(async () => findButton(await readDiagnostics(page), text), 20000, `button "${text}"`);
  await press(page, mobile, center(button.bounds));
};

/** The header username label: the text label closest to the top of the menu canvas. */
const readHeader = async (page) => {
  const diagnostics = await readDiagnostics(page);
  const labels = (diagnostics?.textLabels ?? []).filter((label) => label.bounds && label.bounds.top < 60 && label.text);
  return labels.length === 0 ? null : labels.map((label) => label.text).join(' | ');
};

/** The saved name on the pinned "You" row of the Leaderboard sheet, or null while it has not loaded. */
const readYouRow = async (page) => {
  const diagnostics = await readDiagnostics(page);
  const texts = (diagnostics?.textLabels ?? []).map((label) => label.text);
  const you = texts.lastIndexOf('YOU');
  if (you < 0) return null;
  let index = you + 1;
  if (texts[index] === 'EDIT NAME') index += 1;
  return texts[index] ?? null;
};

const waitForMenuHeader = async (page) => {
  await waitFor(async () => (await readDiagnostics(page)) !== null, 40000, 'visual diagnostics');
  await waitFor(async () => findButton(await readDiagnostics(page), 'Leaderboard'), 40000, 'menu buttons');
  // The saved profile name is read once after sign-in, so let the header settle before reading it.
  let previous = null;
  let stableReads = 0;
  for (let i = 0; i < 20 && stableReads < 4; i += 1) {
    await sleep(1000);
    const header = await readHeader(page);
    stableReads = header !== null && header === previous ? stableReads + 1 : 0;
    previous = header;
  }
  return previous;
};

const signIn = async (page, base, password) => {
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  const atHost = await page.waitForURL(/account\.fawxzzy\.com\/login/u, { timeout: 30000 }).then(() => true).catch(() => false);
  if (atHost) {
    await page.waitForSelector('input[name=email]', { timeout: 15000 });
    await page.fill('input[name=email]', QA_LOGIN);
    await page.fill('input[name=password]', password);
    await page.locator('button[type=submit]').click();
    for (let i = 0; i < 40; i += 1) {
      await sleep(500);
      const url = new URL(page.url());
      if (url.host === new URL(base).host && !url.search && i > 4) break;
      const consent = page.getByRole('button', { name: /continue to mazer/iu });
      if (await consent.count().catch(() => 0)) await consent.first().click().catch(() => undefined);
    }
  }
  const landed = new URL(page.url());
  if (landed.host !== new URL(base).host) throw new Error(`sign-in hand-off did not return to Mazer (at ${landed.host})`);
  await page.goto(`${base}/?runtimeDiagnostics=1`, { waitUntil: 'networkidle' });
};

const runViewport = async (browser, args, key, outDir, password) => {
  const profile = VIEWPORTS[key];
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    hasTouch: profile.hasTouch,
    isMobile: profile.isMobile
  });
  await context.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, get: () => true });
    window.matchMedia = (query) => (query === '(display-mode: standalone)'
      ? new Proxy(original(query), {
        get(target, prop) {
          if (prop === 'matches') return true;
          const value = Reflect.get(target, prop, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }
      })
      : original(query));
  });
  const page = await context.newPage();
  const mobile = profile.isMobile;
  const record = { viewport: profile.label, steps: [], checks: [], consoleErrors: [], renameRequests: [] };
  page.on('console', (message) => { if (message.type() === 'error') record.consoleErrors.push(message.text().slice(0, 200)); });
  page.on('pageerror', (error) => record.consoleErrors.push(`pageerror: ${String(error).slice(0, 200)}`));
  page.on('response', (response) => {
    if (/mazer_set_username/u.test(response.url())) {
      record.renameRequests.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`);
    }
  });
  const shot = async (name) => {
    const file = join(outDir, `${profile.label}-${name}.png`);
    await page.screenshot({ path: file });
    return file;
  };
  const step = (name, data) => { record.steps.push({ step: name, ...data }); console.log(`[${profile.label}] ${name}`, JSON.stringify(data)); };
  const check = (name, pass, detail) => { record.checks.push({ check: name, pass, detail }); console.log(`[${profile.label}] CHECK ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); };

  const openLeaderboard = async () => {
    await pressButton(page, mobile, 'Leaderboard');
    return waitFor(() => readYouRow(page), 30000, 'the Leaderboard "You" row');
  };
  const backToMenu = async () => {
    await pressButton(page, mobile, 'Back to Menu');
    await waitFor(async () => findButton(await readDiagnostics(page), 'Leaderboard'), 20000, 'the menu');
    await sleep(2500);
  };
  const renameTo = async (newName, tag) => {
    await pressButton(page, mobile, 'Edit name');
    await waitFor(async () => (await page.locator('input[name=mazer-leaderboard-username]').count()) > 0, 15000, 'the name editor');
    await page.fill('input[name=mazer-leaderboard-username]', newName);
    await sleep(500);
    await shot(`${tag}-editor`);
    await pressButton(page, mobile, 'Save');
    await waitFor(async () => (await readYouRow(page)) === newName, 30000, `the You row to read ${newName}`);
    await sleep(1500);
  };
  const reload = async () => {
    await page.reload({ waitUntil: 'networkidle' });
    return waitForMenuHeader(page);
  };

  let renamed = false;
  try {
    await signIn(page, args.base, password);
    const headerBefore = await waitForMenuHeader(page);
    await shot('01-menu-signed-in');
    const youBefore = await openLeaderboard();
    await shot('02-leaderboard-signed-in');
    step('signed in', { header: headerBefore, leaderboardYouRow: youBefore });
    const headerFollowsRow = labelShowsName(headerBefore, youBefore);
    check('header shows the saved name (read-only)', headerFollowsRow, `header "${headerBefore}" vs You row "${youBefore}"`);

    const guardOk = args.mode === 'restore'
      ? youBefore === QA_NAME || youBefore === args.newName
      : youBefore === QA_NAME;
    if (args.mode !== 'read-only' && !guardOk) {
      throw new Error(`refusing to rename: the You row reads "${youBefore}", not the QA account`);
    }

    if (args.mode === 'rename') {
      // The header may be truncated: the target must not start with the visible part of the current header.
      const visibleBefore = headerBefore ? stripEllipsis(headerBefore).text : '';
      if (visibleBefore.length >= 3 && args.newName.startsWith(visibleBefore)) {
        throw new Error('the rename target starts with the same visible prefix as the QA name; pick another --new-name');
      }
      await renameTo(args.newName, '03');
      renamed = true;
      const youAfterSave = await readYouRow(page);
      await shot('04-leaderboard-after-save');
      check('save reached the profile (rename request succeeded)', record.renameRequests.some((line) => line.startsWith('2')), record.renameRequests.join('; ') || 'no mazer_set_username response seen');
      await backToMenu();
      const headerSameSession = await readHeader(page);
      await shot('05-menu-same-session');
      step('after save, same session', { leaderboardYouRow: youAfterSave, header: headerSameSession });
      check('header follows the rename in the same session', labelShowsName(headerSameSession, args.newName), `header "${headerSameSession}"`);

      const headerAfterReload = await reload();
      await shot('06-menu-after-reload');
      const youAfterReload = await openLeaderboard();
      await shot('07-leaderboard-after-reload');
      step('after reload', { header: headerAfterReload, leaderboardYouRow: youAfterReload });
      check('header shows the new name after reload (MAZER-ACCT-033)', labelShowsName(headerAfterReload, args.newName), `header "${headerAfterReload}"`);
      check('header did not revert to the old sign-in name after reload', !labelShowsName(headerAfterReload, QA_NAME), `header "${headerAfterReload}"`);
      check('leaderboard You row shows the new name after reload', youAfterReload === args.newName, `You row "${youAfterReload}"`);
    }
  } catch (error) {
    record.error = String(error?.message ?? error).slice(0, 300);
    console.log(`[${profile.label}] ERROR ${record.error}`);
    await shot('99-error').catch(() => undefined);
  } finally {
    // Put the QA name back whenever a rename may have happened, whatever the checks said.
    if (args.mode !== 'read-only' && (renamed || args.mode === 'restore' || record.error)) {
      try {
        if ((await page.locator('input[name=mazer-leaderboard-username]').count()) === 0 && !(await readYouRow(page))) {
          await page.goto(`${args.base}/?runtimeDiagnostics=1`, { waitUntil: 'networkidle' });
          await waitForMenuHeader(page);
          await openLeaderboard();
        }
        const current = await readYouRow(page);
        if (current && current !== QA_NAME) {
          if (current !== args.newName && args.mode !== 'restore') throw new Error(`restore refused: the You row reads "${current}"`);
          await renameTo(QA_NAME, '08-restore');
        }
        const headerRestored = await reload();
        const youRestored = await openLeaderboard();
        await shot('09-restored-leaderboard');
        step('restored and read back after reload', { header: headerRestored, leaderboardYouRow: youRestored });
        check('QA name restored (read back after reload)', youRestored === QA_NAME && labelShowsName(headerRestored, QA_NAME), `You row "${youRestored}", header "${headerRestored}"`);
        record.restored = youRestored === QA_NAME;
      } catch (error) {
        record.restored = false;
        record.restoreError = String(error?.message ?? error).slice(0, 300);
        console.log(`[${profile.label}] RESTORE FAILED ${record.restoreError}. Run again with --mode restore.`);
        await shot('99-restore-error').catch(() => undefined);
      }
    }
    await context.close();
  }
  record.pass = !record.error && record.checks.every((entry) => entry.pass) && record.restored !== false;
  return record;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(args.out ?? join(repoRoot, 'tmp', 'verify-username-rename-live'));
  mkdirSync(outDir, { recursive: true });
  const keys = args.viewport === 'both' ? ['phone', 'desktop'] : [args.viewport];
  const password = readQaPassword();
  const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
  const results = [];
  try {
    for (const key of keys) results.push(await runViewport(browser, args, key, outDir, password));
  } finally {
    await browser.close();
  }
  const summary = {
    card: 'MAZER-ACCT-033',
    base: args.base,
    mode: args.mode,
    newName: args.mode === 'rename' ? args.newName : null,
    ranAt: new Date().toISOString(),
    note: 'headless only, not checked on a real phone',
    results
  };
  writeFileSync(join(outDir, 'result.json'), `${JSON.stringify(summary, null, 2)}\n`);
  const failed = results.filter((entry) => !entry.pass);
  console.log(failed.length === 0 ? 'RESULT PASS' : `RESULT FAIL (${failed.map((entry) => entry.viewport).join(', ')})`);
  process.exitCode = failed.length === 0 ? 0 : 2;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('FATAL', String(error?.message ?? error).slice(0, 300));
    process.exit(1);
  });
}
