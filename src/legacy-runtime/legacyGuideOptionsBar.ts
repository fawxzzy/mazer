/**
 * Guide redesign OPTIONS (2026-11-23): the picker bar and auto-open for `?guideOptions=A|B|C`. Options route only.
 *
 * The bar is page chrome around the REAL game canvas (it is not part of any option's design): letters switch the
 * variant, Light/Dark reloads with the app's own Dark mode preference, Reopen brings the Guide back after "Got it".
 * `dark=1|0` in the URL sets the same stored preference the Settings switch writes, before the theme boots.
 */
import { DARK_MODE_STORAGE_KEY } from './legacyDarkModePreference';
import { type GuideOptionsVariantId } from './legacyGuideOptionsVariants';
import { getGuideOptionsState, isGuideOptionsRoute } from './legacyGuideOptionsPainter';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SceneLike = any;

const SHORT: Record<GuideOptionsVariantId, string> = { A: 'Cards', B: 'Steps', C: 'Glossary' };
export const GUIDE_OPTIONS_BAR_HEIGHT = 44;

export const applyGuideOptionsDarkParam = (): void => {
  if (!isGuideOptionsRoute()) {
    return;
  }
  const dark = new URLSearchParams(window.location.search).get('dark');
  if (dark === null) {
    return;
  }
  try {
    window.localStorage.setItem(DARK_MODE_STORAGE_KEY, dark === '1' ? 'on' : 'off');
  } catch {
    // Best effort: the picker still works in the current theme.
  }
};

const findScene = (): SceneLike | null => {
  const game = (window as unknown as { __MAZER_GAME__?: { scene: { scenes: SceneLike[] } } }).__MAZER_GAME__;
  return game?.scene.scenes.find((scene) => typeof scene.selectLegacyMainMenuRow === 'function') ?? null;
};

const openGuide = (scene: SceneLike): void => {
  if (scene.settingsGuideOpen === true) {
    scene.resetLegacyOverlayScrollState();
    scene.uiDirty = true;
    return;
  }
  scene.selectLegacyMainMenuRow('guide');
};

export const installGuideOptionsBar = (): void => {
  if (!isGuideOptionsRoute() || typeof document === 'undefined') {
    return;
  }
  const state = getGuideOptionsState();
  const bar = document.createElement('div');
  bar.setAttribute('data-guide-options-bar', '1');
  bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;display:flex;gap:6px;align-items:center;justify-content:center;'
    + 'flex-wrap:wrap;padding:calc(env(safe-area-inset-top,0px) + 6px) 8px 6px;flex-wrap:nowrap;background:rgba(0,0,0,.88);color:white;'
    + 'font:600 12px system-ui,sans-serif;white-space:nowrap;';
  const buttons = new Map<string, HTMLButtonElement>();
  const style = (button: HTMLButtonElement, on: boolean): void => {
    button.style.cssText = `min-height:32px;padding:4px 7px;white-space:nowrap;border-radius:8px;border:1px solid ${on ? 'aquamarine' : 'gray'};`
      + `background:${on ? 'aquamarine' : 'transparent'};color:${on ? 'black' : 'white'};font:inherit;cursor:pointer;`;
  };
  const refresh = (): void => buttons.forEach((button, key) => style(button, key === state.variant));
  const add = (key: string, label: string, onClick: () => void): void => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    buttons.set(key, button);
    style(button, false);
    bar.appendChild(button);
  };
  (['A', 'B', 'C'] as GuideOptionsVariantId[]).forEach((id) => add(id, `${id} ${SHORT[id]}`, () => {
    state.variant = id;
    state.page = 0;
    state.selected = 'goal';
    refresh();
    const scene = findScene();
    if (scene !== null) {
      openGuide(scene);
    }
  }));
  add('dark', 'Light/Dark', () => {
    let on = false;
    try {
      on = window.localStorage.getItem(DARK_MODE_STORAGE_KEY) === 'on';
    } catch {
      on = false;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('dark', on ? '0' : '1');
    window.location.href = url.toString();
  });
  add('reopen', 'Reopen', () => {
    const scene = findScene();
    if (scene !== null) {
      openGuide(scene);
    }
  });
  refresh();
  document.body.appendChild(bar);

  // Auto-open once the main menu is up.
  let tries = 0;
  const timer = window.setInterval(() => {
    tries += 1;
    const scene = findScene();
    if (scene !== null && scene.mode === 'menu' && scene.overlay !== 'auth' && scene.menuReadyForGuideOptions !== false) {
      window.clearInterval(timer);
      window.setTimeout(() => openGuide(scene), 600);
    } else if (tries > 80) {
      window.clearInterval(timer);
    }
  }, 500);
};
