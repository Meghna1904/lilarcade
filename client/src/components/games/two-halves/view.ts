/** Pure fit / zoom / pan maths shared by the studio and its tests. */

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Largest scale that shows the whole page, or 0 when it cannot be measured yet. */
export function fitScale(viewport: Size, page: Size): number {
  if (viewport.width <= 0 || viewport.height <= 0 || page.width <= 0 || page.height <= 0) return 0;
  return Math.min(viewport.width / page.width, viewport.height / page.height);
}

/** Top-left of the scaled page in viewport CSS pixels, centred plus the pan offset. */
export function imageOrigin(viewport: Size, page: Size, scale: number, pan: Point): Point {
  return {
    x: (viewport.width - page.width * scale) / 2 + pan.x,
    y: (viewport.height - page.height * scale) / 2 + pan.y,
  };
}

/** Keeps at least a corner of the page on screen so it can never be lost. */
export function clampPan(pan: Point, viewport: Size, page: Size, scale: number): Point {
  if (scale <= 0) return { x: 0, y: 0 };
  const margin = Math.min(48, viewport.width / 3, viewport.height / 3);
  const limit = (viewportSize: number, pageSize: number) => {
    const centred = (viewportSize - pageSize) / 2;
    let min = margin - pageSize - centred;
    let max = viewportSize - margin - centred;
    if (min > max) { const middle = (min + max) / 2; min = middle; max = middle; }
    return { min, max };
  };
  const horizontal = limit(viewport.width, page.width * scale);
  const vertical = limit(viewport.height, page.height * scale);
  return {
    x: Math.min(horizontal.max, Math.max(horizontal.min, pan.x)),
    y: Math.min(vertical.max, Math.max(vertical.min, pan.y)),
  };
}

/** Pan that keeps the page point under `pointer` fixed while the scale changes. */
export function panToPoint(
  viewport: Size, page: Size, fromScale: number, toScale: number, pointer: Point, pan: Point,
): Point {
  if (fromScale <= 0 || toScale <= 0) return clampPan(pan, viewport, page, toScale);
  const origin = imageOrigin(viewport, page, fromScale, pan);
  const imageX = (pointer.x - origin.x) / fromScale;
  const imageY = (pointer.y - origin.y) / fromScale;
  const nextOriginX = pointer.x - imageX * toScale;
  const nextOriginY = pointer.y - imageY * toScale;
  return clampPan({
    x: nextOriginX - (viewport.width - page.width * toScale) / 2,
    y: nextOriginY - (viewport.height - page.height * toScale) / 2,
  }, viewport, page, toScale);
}

/** Viewport-relative pointer position to page pixels; mirrors getBoundingClientRect mapping. */
export function pointerToPage(viewport: Size, page: Size, scale: number, pan: Point, pointer: Point): Point {
  const origin = imageOrigin(viewport, page, scale, pan);
  return { x: (pointer.x - origin.x) / scale, y: (pointer.y - origin.y) / scale };
}
