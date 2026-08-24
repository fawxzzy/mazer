import { getMazerIconDefinition, type MazerIconName, type MazerIconShape } from './icons';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export interface MazerIconOptions {
  name: MazerIconName;
  label?: string;
  className?: string;
  size?: number;
}

interface ParsedMazerIconOptions extends MazerIconOptions {
  name: MazerIconName;
}

const readOwnDataValue = (value: object, key: PropertyKey): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
};

const parseOptions = (value: unknown): ParsedMazerIconOptions | null => {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const name = readOwnDataValue(value, 'name');
    const label = readOwnDataValue(value, 'label');
    const className = readOwnDataValue(value, 'className');
    const size = readOwnDataValue(value, 'size');
    if (!getMazerIconDefinition(name)) return null;
    if (label !== undefined && typeof label !== 'string') return null;
    if (className !== undefined && typeof className !== 'string') return null;
    if (size !== undefined && (typeof size !== 'number' || !Number.isFinite(size) || size <= 0)) return null;
    return { name: name as MazerIconName, label, className, size };
  } catch {
    return null;
  }
};

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

export function createMazerIcon(options: MazerIconOptions, ownerDocument?: Document): SVGSVGElement;
export function createMazerIcon(options: unknown, ownerDocument?: Document): SVGSVGElement | null;
export function createMazerIcon(
  options: unknown,
  ownerDocument: Document = document
): SVGSVGElement | null {
  const parsed = parseOptions(options);
  if (!parsed) return null;
  const definition = getMazerIconDefinition(parsed.name);
  if (!definition) return null;
  const size = parsed.size ?? 20;
  const svg = ownerDocument.createElementNS(SVG_NAMESPACE, 'svg');

  svg.classList.add('mazer-icon');
  if (parsed.className) {
    svg.classList.add(...parsed.className.split(/\s+/).filter(Boolean));
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
  svg.dataset.mazerIcon = parsed.name;

  if (parsed.label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', parsed.label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  definition.shapes.forEach((shape) => appendShape(svg, shape, ownerDocument));
  return svg;
}
