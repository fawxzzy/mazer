/**
 * Entry for trail-perf-options.html (dev/proposal page, not a build input): installs the chosen star-dust painter, then
 * boots the real game unchanged. A small bar picks Before / A / B / C / C + A (shipped, the default), fills a long trail,
 * walks it, and shows a live frame meter plus the frame times measured headless for each option (trailPerfMeasurements.ts).
 *
 * Open: /trail-perf-options.html?previewLevel=300&runtimeDiagnostics=1&trailVariant=shipped
 */
import { createTrailPerfHarness, isPlayReady, type TrailPerfHarness } from './trailPerfOptionsHarness';
import { TRAIL_PERF_SETUP, describeTrailPerfMeasurement } from './trailPerfMeasurements';
import { findTrailPerfVariant, TRAIL_PERF_VARIANTS, type TrailPerfVariantId } from './starDustTrailVariants';

const params = new URLSearchParams(window.location.search);
const harness = createTrailPerfHarness(findTrailPerfVariant(params.get('trailVariant') ?? 'CA').id);
(window as unknown as { __MAZER_TRAIL_PERF__?: TrailPerfHarness }).__MAZER_TRAIL_PERF__ = harness;

// The bar's styles are in trail-perf-options.html (kept out of src/ for the colour-literal ratchet).
const bar = document.createElement('div');
bar.id = 'trail-perf-bar';
bar.setAttribute('role', 'region');
bar.setAttribute('aria-label', 'Trail cost options');
const pickRow = document.createElement('div');
pickRow.className = 'row';
const look = document.createElement('div');
look.className = 'look';
const measured = document.createElement('div');
measured.className = 'nums measured';
const live = document.createElement('div');
live.className = 'nums live';
bar.append(pickRow, look, measured, live);

const pickButtons = new Map<TrailPerfVariantId, HTMLButtonElement>();
for (const variant of TRAIL_PERF_VARIANTS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = variant.id === 'shipped' ? 'Before' : variant.name;
  button.addEventListener('click', () => select(variant.id));
  pickButtons.set(variant.id, button);
  pickRow.appendChild(button);
}
const trailButton = document.createElement('button');
trailButton.type = 'button';
trailButton.textContent = 'Long trail';
trailButton.addEventListener('click', () => harness.fillLongTrail());
const walkButton = document.createElement('button');
walkButton.type = 'button';
walkButton.addEventListener('click', () => {
  if (harness.walking) harness.stopWalk();
  else harness.startWalk();
  renderWalk();
});
const minButton = document.createElement('button');
minButton.type = 'button';
minButton.textContent = 'Hide';
minButton.addEventListener('click', () => {
  bar.classList.toggle('min');
  minButton.textContent = bar.classList.contains('min') ? 'Show' : 'Hide';
});
pickRow.append(trailButton, walkButton, minButton);

const renderWalk = (): void => {
  walkButton.textContent = harness.walking ? 'Stop walk' : 'Walk';
  walkButton.setAttribute('aria-pressed', String(harness.walking));
};


function select(id: TrailPerfVariantId): void {
  harness.select(id);
  renderVariant();
}

// Also called when the bench switches the harness directly, so the bar always names the painter in use.
let shownVariant: TrailPerfVariantId | null = null;
function renderVariant(): void {
  const variant = findTrailPerfVariant(harness.variant);
  shownVariant = variant.id;
  for (const [key, button] of pickButtons) button.setAttribute('aria-pressed', String(key === variant.id));
  look.textContent = variant.look;
  const lines = describeTrailPerfMeasurement(variant.id);
  measured.textContent = `Measured per frame${variant.id === 'shipped' ? '' : ' (this option\'s frame / Before\'s, same run)'}: `
    + `${lines.join(' | ')}.`;
  measured.title = TRAIL_PERF_SETUP;
  const url = new URL(window.location.href);
  url.searchParams.set('trailVariant', variant.id);
  window.history.replaceState(null, '', url);
}

const mount = (): void => {
  document.body.appendChild(bar);
  select(harness.variant);
  renderWalk();
  window.setInterval(() => {
    if (harness.variant !== shownVariant) renderVariant();
    renderWalk();
    const m = harness.meter(2000);
    const s = harness.stats();
    live.textContent = `Live here: ${m.meanMs.toFixed(1)} ms mean, ${m.p95Ms.toFixed(1)} ms p95 (${m.fps.toFixed(0)} fps)`
      + ` | trail ${harness.routeLength() > 0 ? 'long' : 'as played'}`
      + (harness.variant === 'shipped' ? '' : ` | paints: full ${s.fullPaints}, head-only ${s.headPaints}, body ${s.bodyRebuilds}`);
  }, 500);
};

// Fill a long trail once play is ready (skip with ?autoTrail=0), so the page opens on the expensive case.
const autoTrail = params.get('autoTrail') !== '0';
const waitForPlay = (): void => {
  if (isPlayReady()) {
    if (autoTrail) harness.fillLongTrail();
    return;
  }
  window.setTimeout(waitForPlay, 250);
};

void import('../../boot/main').then(() => {
  mount();
  waitForPlay();
});
