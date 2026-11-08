export type HSV = { h: number; s: number; v: number };
export type RGB = { r: number; g: number; b: number };

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/** Accepts #rgb or #rrggbb (with or without the hash) and returns lowercase #rrggbb. */
export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) return `#${raw.split('').map(character => character + character).join('')}`.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`.toLowerCase();
  return null;
}

export function hexToRgb(hex: string): RGB {
  const clean = normalizeHex(hex);
  if (!clean) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(clean.slice(1, 3), 16), g: parseInt(clean.slice(3, 5), 16), b: parseInt(clean.slice(5, 7), 16) };
}

export function rgbToHex(rgb: RGB): string {
  const channel = (value: number) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

export function rgbToHsv(rgb: RGB): HSV {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return { h: ((h % 360) + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb(hsv: HSV): RGB {
  const h = ((hsv.h % 360) + 360) % 360;
  const s = clamp(hsv.s);
  const v = clamp(hsv.v);
  const c = v * s;
  const sector = h / 60;
  const x = c * (1 - Math.abs((sector % 2) - 1));
  const m = v - c;
  const [r, g, b] = sector < 1 ? [c, x, 0]
    : sector < 2 ? [x, c, 0]
    : sector < 3 ? [0, c, x]
    : sector < 4 ? [0, x, c]
    : sector < 5 ? [x, 0, c]
    : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export const hexToHsv = (hex: string): HSV => rgbToHsv(hexToRgb(hex));
export const hsvToHex = (hsv: HSV): string => rgbToHex(hsvToRgb(hsv));

/** Greys and black carry no usable hue, so keep the hue the user was already on. */
export function hsvFromHexPreservingHue(hex: string, previous: HSV): HSV {
  const next = hexToHsv(hex);
  if (next.s === 0 || next.v === 0) return { ...next, h: previous.h };
  return next;
}

/** Marker (x = s, y = 1 - v) and hue handle (h / 360) positions as 0-1 ratios. */
export function pickerLayout(hsv: HSV) {
  const h = ((hsv.h % 360) + 360) % 360;
  return { markerX: clamp(hsv.s), markerY: 1 - clamp(hsv.v), hueHandle: h / 360 };
}

/** Inverse of pickerLayout for a square drag: x = saturation, y is inverted brightness. */
export function hsvFromSquare(x: number, y: number, hue: number): HSV {
  return { h: ((hue % 360) + 360) % 360, s: clamp(x), v: 1 - clamp(y) };
}

/**
 * The exact colour the picker square shows at a point, matching its CSS layers:
 * white -> pure hue across x, then a black overlay down y.
 */
export function colorAtSquare(x: number, y: number, hue: number): string {
  return hsvToHex(hsvFromSquare(x, y, hue));
}

/** CSS colour for a wheel handle, so the handle always agrees with the hex. */
export const hsvToCss = (hsv: HSV): string => hsvToHex(hsv);

/** Inverse of the hue handle: 0 at the top of the strip, 360 at the bottom. */
export function hueFromHandle(ratio: number): number {
  return clamp(ratio) * 360;
}

const TEXTURE_ALPHA: Record<string, number> = { watercolor: 0.19, pastel: 0.72, brush: 0.85, glitter: 1 };

/** Pencil, marker, crayon, fill and eraser paint the exact selected hex at full opacity. */
export function brushAlpha(tool: string, strengthPercent: number): number {
  const texture = TEXTURE_ALPHA[tool];
  if (texture === undefined) return 1;
  return clamp((strengthPercent / 100) * texture, 0.01, 1);
}

export const isTexturedTool = (tool: string) => tool in TEXTURE_ALPHA;

/** A fixed seed for a page so a replay re-draws the same seam, not a new one. */
export function seedFromHex(hex: string): number {
  let hash = 2166136261;
  for (let index = 0; index < hex.length; index++) {
    hash ^= hex.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
