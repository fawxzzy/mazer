/**
 * First-time cards slice 9 (spec docs/design/MAZER-FIRST-TIME-CARDS-SPEC-2026-11-26.md section 8 item 1): the level-1
 * control hint as a card, only while `?lab=firsttime` is on. Same component as every first-time card (the in-flow notice
 * through legacyInFlowNoticeHost.ts, rich layout: skin B Neon edge, look E Two-line), with the player's registry icon,
 * the registry copy (legacyFirstTimeCards.ts `level-1.controls`: "Move", the move line + the twin-stars goal line) and a
 * "Got it" button. Flag off the hint stays the unchanged pill (legacyControlHintOverlay.ts).
 *
 * Placement: the shared text card rule, bottom band first, never above the HUD line, never over the player, the end
 * star, a Switch or a wrap mouth. The card is placed once, when the board has stopped moving (two polls with the same
 * keep-clear rects), so it never has to jump. The player does not move while it is up: the first move dismisses it.
 */
import { resolveFirstTimeCard } from '../legacy-runtime/legacyFirstTimeCards.ts';
import { resolveLegacyControlHintCardCopy, type LegacyControlHintInput } from '../legacy-runtime/legacyControlHint.ts';
import { createLegacyInFlowNoticeHost, type LegacyInFlowNoticeHost } from '../legacy-runtime/legacyInFlowNoticeHost.ts';
import type { InFlowNoticeDismissReason, InFlowNoticeProps } from '../ui/notice/inFlowNotice.ts';
import {
  estimateTextCardHeight,
  resolveTextCardPlacement,
  resolveTextCardWidth,
  type TextCardBoardView,
  type TextCardPlacement
} from './textCardPlacement.ts';

export const LEGACY_CONTROL_HINT_CARD_NOTICE_KEY = 'control-hint.card';
/** Gap under the card on the bottom band (the notice adds the bottom safe area itself). */
export const LEGACY_CONTROL_HINT_CARD_BOTTOM_PX = 8;
/** Gap between the HUD line and the card when it has to sit high. */
export const LEGACY_CONTROL_HINT_CARD_HUD_GAP_PX = 8;

/** Pure: the card's notice props (without placement and callbacks). */
export const resolveLegacyControlHintCardContent = (input: LegacyControlHintInput): Pick<InFlowNoticeProps, 'title' | 'heading' | 'icon' | 'body' | 'actionLabel' | 'tone'> => {
  const notice = resolveFirstTimeCard('level-1.controls').notice!;
  return {
    title: notice.marker,
    heading: notice.heading,
    icon: 'player',
    body: resolveLegacyControlHintCardCopy(input),
    actionLabel: notice.actionLabel,
    tone: 'info'
  };
};

/**
 * Pure: the body's height in characters for the card estimate. The body breaks after the move line (pre-line), so each
 * line is counted as starting a fresh row: a short first line still takes a whole row.
 */
export const resolveLegacyControlHintCardBodyChars = (body: string, cardWidth: number): number => {
  const charsPerLine = Math.max(8, Math.floor(Math.max(40, cardWidth - 24) / (14 * 0.52)));
  return body.split('\n').reduce((sum, line) => sum + (Math.max(1, Math.ceil(line.length / charsPerLine)) * charsPerLine), 0);
};

/** Pure: where the card goes on this board (page px). */
export const resolveLegacyControlHintCardPlacement = (
  view: TextCardBoardView,
  body: string,
  page: { readonly width: number; readonly height: number }
): TextCardPlacement => {
  const cardWidth = resolveTextCardWidth(page.width);
  return resolveTextCardPlacement({
    viewWidth: page.width,
    viewHeight: page.height,
    topMin: view.hudBottom + LEGACY_CONTROL_HINT_CARD_HUD_GAP_PX,
    bottomInset: LEGACY_CONTROL_HINT_CARD_BOTTOM_PX,
    cardWidth,
    cardHeight: estimateTextCardHeight({
      cardWidth,
      bodyChars: resolveLegacyControlHintCardBodyChars(body, cardWidth),
      heading: true,
      action: true
    }),
    keepClear: view.keepClear,
    prefer: 'bottom'
  });
};

/** Pure: a stable key for the keep-clear rects, so the card waits until the board reveal and zoom have settled. */
export const resolveLegacyControlHintCardViewKey = (view: TextCardBoardView): string => [
  Math.round(view.hudBottom),
  ...view.keepClear.map((rect) => (rect === null ? '-' : `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}`))
].join('|');

export interface LegacyControlHintCard {
  /** Offers the card for this board view; it mounts once the view has held still for one poll. Returns true once up. */
  offer(view: TextCardBoardView, input: LegacyControlHintInput, page: { width: number; height: number }, reducedMotion: boolean): boolean;
  isOpen(): boolean;
  close(): void;
  destroy(): void;
}

/**
 * The card's lifecycle for the hint presenter. `onDismiss` fires once per card the player dismissed with "Got it"
 * ('action'); the presenter handles moves and the 12 s timeout itself.
 */
export const createLegacyControlHintCard = (deps: {
  readonly onAction: () => void;
  readonly notices?: LegacyInFlowNoticeHost;
}): LegacyControlHintCard => {
  const notices = deps.notices ?? createLegacyInFlowNoticeHost();
  let lastKey: string | null = null;
  let open = false;
  return {
    offer: (view, input, page, reducedMotion) => {
      if (open) return true;
      const key = resolveLegacyControlHintCardViewKey(view);
      if (key !== lastKey) {
        lastKey = key;
        return false;
      }
      const content = resolveLegacyControlHintCardContent(input);
      const placement = resolveLegacyControlHintCardPlacement(view, content.body, page);
      open = true;
      notices.show(LEGACY_CONTROL_HINT_CARD_NOTICE_KEY, {
        ...content,
        topPx: placement.topPx,
        bottomPx: placement.edge === 'bottom' ? placement.bottomPx : undefined,
        reducedMotion,
        onDismiss: (reason: InFlowNoticeDismissReason) => {
          open = false;
          lastKey = null;
          if (reason === 'action') deps.onAction();
        }
      });
      return true;
    },
    isOpen: () => open,
    close: () => {
      if (!open) return;
      open = false;
      lastKey = null;
      notices.close(LEGACY_CONTROL_HINT_CARD_NOTICE_KEY);
    },
    destroy: () => {
      open = false;
      notices.destroy();
    }
  };
};
