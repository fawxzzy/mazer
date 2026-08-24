import { getMazerIconDefinition, type MazerIconName, type MazerIconShape } from './icons';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export interface MazerIconOptions {
  name: MazerIconName;
  label?: string;
  className?: string;
  size?: number;
}

const appendShape = (svg: SVGSVGElement, shape: MazerIconShape, ownerDocument: Document): void => {
  const node = ownerDocument.createElementNS(SVG_NAMESPACE, shape.element);

  if (shape.element === 'path') {
    node.setAttribute('d', shape.d);
  } else if (shape.element === 'circle') {
    node.setAttribute('cx', String(shape.cx));
    node.setAttribute('cy', String(shape.cy));
    node.setAttribute('r', String(shape.r));
  } else if (shape.element === 'line') {
    node.setAttribute('x1', String(shape.x1));
    node.setAttribute('y1', String(shape.y1));
    node.setAttribute('x2', String(shape.x2));
    node.setAttribute('y2', String(shape.y2));
  } else {
    node.setAttribute('points', shape.points);
  }

  svg.append(node);
};

export const createMazerIcon = (
  options: MazerIconOptions,
  ownerDocument: Document = document
): SVGSVGElement => {
  const definition = getMazerIconDefinition(options.name);
  const size = options.size ?? 20;
  const svg = ownerDocument.createElementNS(SVG_NAMESPACE, 'svg');

  svg.classList.add('mazer-icon');
  if (options.className) {
    svg.classList.add(...options.className.split(/\s+/).filter(Boolean));
  }
  svg.setAttribute('viewBox', definition.viewBox);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('focusable', 'false');
  svg.dataset.mazerIcon = options.name;

  if (options.label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', options.label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  definition.shapes.forEach((shape) => appendShape(svg, shape, ownerDocument));
  return svg;
};
