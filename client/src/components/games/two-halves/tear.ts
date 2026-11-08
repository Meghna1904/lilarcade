/**
 * Pure geometry for the Two Halves tear, merge and seam.
 * No DOM, no canvas: the component only turns these numbers into clip-paths and
 * canvas calls, so both clients can derive an identical edge and seam from the
 * same `jag` arrays and the tests can check the maths directly.
 */

export type SplitAxis = 'vertical' | 'horizontal';
export type TearStyle = 'rip' | 'cut' | 'none';
export type MergeStyle = 'slide' | 'snap' | 'fold' | 'skip';
export type SeamStyle = 'none' | 'gold' | 'stitches' | 'thread' | 'zigzag';
export type PieceSide = 'first' | 'second';
export type Pt = { x: number; y: number };
export type Stitch = { x: number; y: number; angle: number; length: number };

/** 27 points keeps the jagged edge readable at any size and stays cheap to sync. */
export const JAG_POINTS = 27;
/** One stitch per 4% of the seam. */
export const STITCH_STEP = 0.04;

/** Small, fast, seedable PRNG so replays and both clients match exactly. */
export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Random jags in [-1, 1]; the component scales them to percent / wobble units. */
export function makeJag(seed: number, count = JAG_POINTS): number[] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, () => random() * 2 - 1);
}

/** Small symmetric wobble around a straight edge. */
function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

/**
 * How far the jag at each point is applied at `progress` (0-1, the tear front
 * travelling along the split axis). Points the front has not reached stay
 * straight; passed points ease out to their full jagged offset.
 */
export function tearJag(jag: number[], progress: number): number[] {
  if (progress <= 0) return jag.map(() => 0);
  if (progress >= 1) return jag.slice();
  return jag.map((value, index) => {
    const pointAt = index / Math.max(1, jag.length - 1);
    const local = clamp01((progress * 1.15 - pointAt) / 0.15);
    return value * smoothstep(local);
  });
}

/**
 * Clip-path polygon in PERCENT coordinates (0-100). `first` is the side that
 * sits before the seam (left of a vertical split, top of a horizontal one).
 * The trailing corners are appended in a fixed order so the polygon never
 * becomes a bowtie.
 */
export function tearPolygon(
  axis: SplitAxis, side: PieceSide, jag: number[], progress: number, spread = 0.9,
): Array<[number, number]> {
  const offsets = tearJag(jag, progress).map(value => value * spread);
  const count = offsets.length;
  const first = side === 'first';
  // Both halves share the SAME edge, so a merged page closes without a gap or an
  // overlap; only the corners that close the polygon differ.
  if (axis === 'vertical') {
    const points = offsets.map((offset, index): [number, number] => [
      50 + offset,
      (index / Math.max(1, count - 1)) * 100,
    ]);
    return first
      ? [[0, 0], ...points, [0, 100]]
      : [...points, [100, 100], [100, 0]];
  }
  const points = offsets.map((offset, index): [number, number] => [
    (index / Math.max(1, count - 1)) * 100,
    50 + offset,
  ]);
  return first
    ? [...points, [100, 0], [0, 0]]
    : [...points, [100, 100], [0, 100]];
}

/** Turns polygon pairs into a CSS clip-path value. */
export function toClipPath(points: Array<[number, number]>): string {
  return `polygon(${points.map(([x, y]) => `${x.toFixed(3)}% ${y.toFixed(3)}%`).join(', ')})`;
}

/**
 * Seam centreline in normalised 0-1 output coordinates, wobbled by the same jag
 * the tear used so the stitched edge follows the rip.
 */
export function seamPath(axis: SplitAxis, jag: number[], wobble = 0.03): Pt[] {
  const count = jag.length;
  return jag.map((value, index) => {
    const along = index / Math.max(1, count - 1);
    return axis === 'vertical'
      ? { x: 0.5 + value * wobble, y: along }
      : { x: along, y: 0.5 + value * wobble };
  });
}

/** Point along the seam for a 0-1 reveal progress (used by the glint spark). */
export function frontPoint(path: Pt[], progress: number): Pt {
  if (!path.length) return { x: 0.5, y: 0.5 };
  const t = clamp01(progress);
  const position = t * (path.length - 1);
  const index = Math.min(path.length - 2, Math.floor(position));
  const local = index >= path.length - 2 ? 1 : position - index;
  const from = path[Math.max(0, index)];
  const to = path[Math.min(path.length - 1, index + 1)];
  return { x: from.x + (to.x - from.x) * local, y: from.y + (to.y - from.y) * local };
}

/**
 * Bars crossing the seam. Length is a fraction of the larger output side, tilt
 * is seeded so a redraw never moves them.
 */
export function stitchBars(
  axis: SplitAxis, jag: number[], count = Math.max(4, Math.round(1 / STITCH_STEP)), size = 0.04, seed = 0x51ce,
): Stitch[] {
  const random = mulberry32(seed);
  const path = seamPath(axis, jag);
  const bars: Stitch[] = [];
  for (let index = 0; index < count; index++) {
    const progress = (index + 0.5) / count;
    const centre = frontPoint(path, progress);
    const angle = (random() * 2 - 1) * 0.2;
    bars.push({
      x: centre.x,
      y: centre.y,
      // The bar crosses the seam: perpendicular to a vertical seam is horizontal.
      angle: (axis === 'vertical' ? 0 : Math.PI / 2) + angle,
      length: size,
    });
  }
  return bars;
}

/** Running-stitch dashes along the seam, in normalised coordinates. */
export function threadDashes(axis: SplitAxis, jag: number[], count = 34): Array<[Pt, Pt]> {
  const path = seamPath(axis, jag);
  const dashes: Array<[Pt, Pt]> = [];
  for (let index = 0; index < count; index++) {
    const start = (index + 0.08) / count;
    const end = (index + 0.58) / count;
    if (end > 1) continue;
    dashes.push([frontPoint(path, start), frontPoint(path, end)]);
  }
  return dashes;
}

/** Zigzag polyline alternating either side of the seam. */
export function zigzagPath(axis: SplitAxis, jag: number[], count = 34, amplitude = 0.016): Pt[] {
  const path = seamPath(axis, jag);
  const points: Pt[] = [];
  for (let index = 0; index <= count; index++) {
    const progress = index / count;
    const centre = frontPoint(path, progress);
    const swing = index % 2 === 0 ? -amplitude : amplitude;
    points.push(axis === 'vertical'
      ? { x: centre.x + swing, y: centre.y }
      : { x: centre.x, y: centre.y + swing });
  }
  return points;
}

/** Seeded four-point sparkles in the middle of the artwork (gold seam only). */
export function sparkles(seed: number, count = 5): Array<{ x: number; y: number; r: number }> {
  const random = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    x: 0.38 + random() * 0.24,
    y: 0.12 + random() * 0.76,
    r: 0.006 + random() * 0.008,
  }));
}

export const seamStyleUsesColor = (style: SeamStyle) => style === 'thread' || style === 'zigzag';

export const TEAR_DURATION_MS = 1500;
export const SEAM_DURATION_MS = 1800;
export const MERGE_DURATION_MS: Record<MergeStyle, number> = {
  slide: 1100,
  snap: 850,
  fold: 900,
  skip: 0,
};
