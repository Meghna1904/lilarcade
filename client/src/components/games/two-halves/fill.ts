/**
 * Scanline flood fill over a barrier mask built from the line-art layer only.
 * Pure array maths so it can be unit-tested without a DOM and replayed
 * deterministically on both clients at the canvas's internal resolution.
 *
 * The paint layer is never read while computing the region: barriers come from
 * the line art, so recolouring an already-painted area (blue -> pink) always
 * clears it instead of being rejected by a colour-tolerance test.
 */

export type FillOptions = {
  width: number;
  height: number;
  /** 1 = line-art barrier at the canvas's internal resolution. */
  barriers: Uint8Array;
  seedX: number;
  seedY: number;
  /** Pixels to creep under the line art so anti-aliased edges leave no halo. */
  expand?: number;
  /** Radius (px) to search for the nearest open pixel when the tap lands on a line. */
  seedRadius?: number;
};

export type FillResult = {
  mask: Uint8Array;
  /** Seed actually used after snapping off a line. */
  seedX: number;
  seedY: number;
  /** True when the tap landed on a barrier and had to be nudged. */
  snapped: boolean;
  region: number;
  /** Time spent flood filling + dilating, in milliseconds (for debug + tests). */
  ms: number;
};

/**
 * Turns the transparent line-art layer into a 1 = wall mask.
 * Reads alpha first, then luminance for soft anti-aliased edges.
 */
export function buildBarriers(
  lineArt: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 48,
  luminanceThreshold = 96,
): Uint8Array {
  const barriers = new Uint8Array(width * height);
  for (let index = 0; index < barriers.length; index++) {
    const offset = index * 4;
    const alpha = lineArt[offset + 3];
    if (alpha > alphaThreshold) { barriers[index] = 1; continue; }
    if (alpha > 0) {
      const luminance = 0.2126 * lineArt[offset] + 0.7152 * lineArt[offset + 1] + 0.0722 * lineArt[offset + 2];
      if (luminance < luminanceThreshold) barriers[index] = 1;
    }
  }
  return barriers;
}

/**
 * Span-based flood fill. `barrier` is 1 where a wall is, `w * h` long.
 * Works on the whole closed shape (no vertical banding) and is linear in area.
 */
export function fillRegion(barrier: Uint8Array, w: number, h: number, sx: number, sy: number): Uint8Array | null {
  if (!w || !h || barrier.length < w * h) return null;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const seed = sy * w + sx;
  if (barrier[seed]) return null;
  const mask = new Uint8Array(w * h);
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    const row = y * w;
    if (barrier[row + x] || mask[row + x]) continue;
    let left = x;
    let right = x;
    while (left > 0 && !barrier[row + left - 1] && !mask[row + left - 1]) left--;
    while (right < w - 1 && !barrier[row + right + 1] && !mask[row + right + 1]) right++;
    for (let k = left; k <= right; k++) mask[row + k] = 1;
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= h) continue;
      let inRun = false;
      for (let k = left; k <= right; k++) {
        const j = ny * w + k;
        const open = !barrier[j] && !mask[j];
        if (open && !inRun) { stack.push(k, ny); inRun = true; }
        else if (!open) inRun = false;
      }
    }
  }
  return mask;
}

/** Nearest open pixel in a small square ring, or null when the tap is walled in. */
export function findOpenSeed(
  barrier: Uint8Array, w: number, h: number, x: number, y: number, radius = 4,
): { x: number; y: number } | null {
  const inside = (px: number, py: number) => px >= 0 && py >= 0 && px < w && py < h;
  if (inside(x, y) && !barrier[y * w + x]) return { x, y };
  for (let ring = 1; ring <= radius; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const px = x + dx;
        const py = y + dy;
        if (inside(px, py) && !barrier[py * w + px]) return { x: px, y: py };
      }
    }
  }
  return null;
}

/** Expands the mask by `radius` pixels into barriers so anti-aliased edges leave no halo. */
export function expandMask(mask: Uint8Array, barriers: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask;
  const depth = new Uint8Array(mask.length);
  const queue: number[] = [];
  const neighboursOf = (index: number) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbours: number[] = [];
    if (x > 0) neighbours.push(index - 1);
    if (x < width - 1) neighbours.push(index + 1);
    if (y > 0) neighbours.push(index - width);
    if (y < height - 1) neighbours.push(index + width);
    return neighbours;
  };
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) continue;
    for (const neighbour of neighboursOf(index)) {
      if (barriers[neighbour] && !depth[neighbour]) { depth[neighbour] = 1; queue.push(neighbour); }
    }
  }
  while (queue.length) {
    const index = queue.pop()!;
    mask[index] = 1;
    const current = depth[index];
    if (current >= radius) continue;
    for (const neighbour of neighboursOf(index)) {
      if (!barriers[neighbour] || depth[neighbour]) continue;
      depth[neighbour] = current + 1;
      queue.push(neighbour);
    }
  }
  return mask;
}

/**
 * Grows every wall by `radius` pixels. Photos with broken outlines leak, so the
 * barrier is closed up slightly before regions are computed.
 */
export function dilateBarriers(barriers: Uint8Array, width: number, height: number, radius = 1): Uint8Array {
  if (radius <= 0) return barriers;
  let current = barriers.slice();
  for (let step = 0; step < radius; step++) {
    const next = current.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (current[index]) continue;
        if ((x > 0 && current[index - 1]) || (x < width - 1 && current[index + 1]) ||
            (y > 0 && current[index - width]) || (y < height - 1 && current[index + width])) next[index] = 1;
      }
    }
    current = next;
  }
  return current;
}

/** Counts painted pixels (debug + tests). */
export function countMask(mask: Uint8Array): number {
  let total = 0;
  for (let index = 0; index < mask.length; index++) total += mask[index] ? 1 : 0;
  return total;
}

/** Writes exact opaque pixels: no alpha, no blending, overwrites whatever was there. */
export function applyFill(data: Uint8ClampedArray, mask: Uint8Array, r: number, g: number, b: number) {
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) continue;
    const offset = index * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = 255;
  }
}

/**
 * Full fill: snap off a line if needed, flood the barrier mask, dilate under the
 * lines, and report what happened. Returns null only when there is no open pixel
 * anywhere near the tap — the caller shows a visual cue instead of failing silently.
 */
export function computeFill(options: FillOptions): FillResult | null {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { width, height, barriers } = options;
  if (!width || !height || barriers.length < width * height) return null;
  const expand = options.expand ?? 2;
  const radius = options.seedRadius ?? 4;
  const requestedX = Math.max(0, Math.min(width - 1, Math.floor(options.seedX)));
  const requestedY = Math.max(0, Math.min(height - 1, Math.floor(options.seedY)));
  const open = findOpenSeed(barriers, width, height, requestedX, requestedY, radius);
  if (!open) return null;
  let mask = fillRegion(barriers, width, height, open.x, open.y);
  if (!mask) return null;
  mask = expandMask(mask, barriers, width, height, expand);
  const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    mask,
    seedX: open.x,
    seedY: open.y,
    snapped: open.x !== requestedX || open.y !== requestedY,
    region: countMask(mask),
    ms: ended - started,
  };
}
