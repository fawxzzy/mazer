export interface LegacyAuthInputFieldBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface LegacyAuthInputCanvasRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface LegacyAuthInputLayoutSize {
  height: number;
  width: number;
}

export interface LegacyAuthInputCssRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export const resolveLegacyAuthInputCssRect = (
  field: LegacyAuthInputFieldBounds,
  canvas: LegacyAuthInputCanvasRect,
  layout: LegacyAuthInputLayoutSize
): LegacyAuthInputCssRect => {
  const scaleX = canvas.width / Math.max(1, layout.width);
  const scaleY = canvas.height / Math.max(1, layout.height);
  return {
    left: canvas.left + ((field.x - (field.width / 2)) * scaleX),
    top: canvas.top + ((field.y - (field.height / 2)) * scaleY),
    width: field.width * scaleX,
    height: field.height * scaleY
  };
};
