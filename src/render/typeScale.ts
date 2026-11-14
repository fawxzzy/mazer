/**
 * MAZER-UI-010: the one written type scale. Roles, sizes and weights live here
 * and in docs/ui/MAZER-TYPE-SCALE.md; surfaces migrate to these constants one
 * PR at a time. tests/render/type-scale-ratchet.test.ts keeps the ad hoc sizes
 * and font stacks found in source from growing while that migration runs.
 *
 * Faces: Space Grotesk is the body face (unchanged). Oxanium is the single
 * squared display face, for short uppercase labels only, never for sentences.
 */

export const TYPE_BODY_FACE = '"Space Grotesk", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const TYPE_DISPLAY_FACE = '"Oxanium", "Space Grotesk", ui-sans-serif, system-ui, sans-serif';

/** Body copy never renders below this at any width, including 320 px wide. */
export const TYPE_BODY_FLOOR_PX = 12;

export type TypeRole = 'caption' | 'body' | 'control' | 'heading' | 'title' | 'display';
export type TypeFace = 'body' | 'display';

export interface TypeScaleStep {
  readonly role: TypeRole;
  readonly sizePx: number;
  readonly weight: 400 | 500 | 600 | 700;
  readonly face: TypeFace;
  /** True for the display face: short uppercase labels only. */
  readonly uppercase: boolean;
  readonly use: string;
}

export const TYPE_SCALE: readonly TypeScaleStep[] = Object.freeze([
  { role: 'caption', sizePx: 12, weight: 500, face: 'body', uppercase: false, use: 'Secondary lines, hints, footers' },
  { role: 'body', sizePx: 14, weight: 400, face: 'body', uppercase: false, use: 'Sentences, descriptions, list rows' },
  { role: 'control', sizePx: 16, weight: 600, face: 'display', uppercase: true, use: 'Button and tab labels, toggle names' },
  { role: 'heading', sizePx: 20, weight: 600, face: 'display', uppercase: true, use: 'Panel and sheet headings' },
  { role: 'title', sizePx: 28, weight: 700, face: 'display', uppercase: true, use: 'Screen titles' },
  { role: 'display', sizePx: 40, weight: 700, face: 'display', uppercase: true, use: 'Run result and rank figures' }
].map((step) => Object.freeze(step) as TypeScaleStep));

export const TYPE_SCALE_SIZES_PX: readonly number[] = Object.freeze(TYPE_SCALE.map((step) => step.sizePx));

export const getTypeScaleStep = (role: TypeRole): TypeScaleStep => {
  const step = TYPE_SCALE.find((entry) => entry.role === role);
  if (!step) {
    throw new Error(`Unknown type role: ${role}`);
  }
  return step;
};

export const resolveTypeFaceStack = (face: TypeFace): string => (face === 'display' ? TYPE_DISPLAY_FACE : TYPE_BODY_FACE);

/** Rounds up to the nearest scale step, so a computed size can never fall below the body floor. */
export const snapToTypeScale = (sizePx: number): number => {
  const wanted = Math.max(TYPE_BODY_FLOOR_PX, Number.isFinite(sizePx) ? sizePx : TYPE_BODY_FLOOR_PX);
  return TYPE_SCALE_SIZES_PX.find((step) => step >= wanted) ?? TYPE_SCALE_SIZES_PX[TYPE_SCALE_SIZES_PX.length - 1];
};
