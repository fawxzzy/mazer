/**
 * Entry for board-cost-options.html (dev/proposal page, not a build input). Only pure data is imported statically, so
 * the canvas-scale cap of options B and C is in place before Phaser or the game module reads window.devicePixelRatio;
 * then the page (bar + harness) and the real game load unchanged.
 *
 * Open: /board-cost-options.html?previewLevel=300&runtimeDiagnostics=1&boardVariant=A
 */
import { capDevicePixelRatio, findBoardCostVariant } from './boardCostVariants';

const variant = findBoardCostVariant(new URLSearchParams(window.location.search).get('boardVariant'));
const realDevicePixelRatio = window.devicePixelRatio;
if (variant.canvasScaleCap !== null) {
  const capped = capDevicePixelRatio(realDevicePixelRatio, variant.canvasScaleCap);
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => capped });
}

void import('./boardCostOptionsPage').then(({ startBoardCostOptionsPage }) => (
  startBoardCostOptionsPage(variant.id, realDevicePixelRatio)
));
