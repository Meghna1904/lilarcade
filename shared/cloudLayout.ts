import type { CloudPosition } from './index.js';

export const CLOUD_NUMBER_COUNT = 100;

type SizeBand = { min: number; max: number; weight: number };
const SIZE_BANDS: SizeBand[] = [
  { min: 36, max: 42, weight: 25 },
  { min: 42, max: 48, weight: 35 },
  { min: 48, max: 54, weight: 25 },
  { min: 54, max: 60, weight: 15 },
];

function seedNumber(seed: number | string): number {
  if (typeof seed === 'number') return seed >>> 0;
  let value = 2166136261;
  for (let i = 0; i < seed.length; i++) value = Math.imul(value ^ seed.charCodeAt(i), 16777619);
  return value >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function cloudPaddedRadius(size: number): number { return size * .3 + 2; }

function chooseSize(random: () => number): number {
  let pick = random() * 100;
  for (const band of SIZE_BANDS) {
    pick -= band.weight;
    if (pick < 0) return band.min + random() * (band.max - band.min);
  }
  return 30;
}

type Cell = { col: number; row: number; n: number };

function layoutAttempt(random: () => number, count: number, width: number, height: number, minFont: number, scale: number): CloudPosition[] | null {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count * width / height)));
  const rows = Math.ceil(count / cols);
  // Shuffle the positions, then assign the numbers in numeric order to those
  // positions. Shuffling cells that already contain their number would only
  // reorder the array; each number would still land in its original cell.
  const cells: Cell[] = Array.from({ length: count }, (_, i) => ({ col: i % cols, row: Math.floor(i / cols), n: 0 }));
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  cells.forEach((cell, i) => { cell.n = i + 1; });
  const placed: CloudPosition[] = [];
  const radii: number[] = [];
  const usedCells = new Set<string>();
  const colorOffset = Math.floor(random() * 7);

  for (const cell of cells.slice(0, count)) {
    const baseSize = chooseSize(random);
    const size = Math.min(60, Math.max(minFont, baseSize * scale));
    const radius = cloudPaddedRadius(size);
    const left = Math.max(radius, width * .035);
    const right = width - left;
    const top = Math.max(radius, height * .035);
    const bottom = height - top;
    const stepX = cols > 1 ? (right - left) / (cols - 1) : (right - left) / 2;
    const stepY = rows > 1 ? (bottom - top) / (rows - 1) : (bottom - top) / 2;
    let accepted: { x: number; y: number } | undefined;
    for (let attempt = 0; attempt < 200; attempt++) {
      const jitterX = (random() - .5) * stepX * .02;
      const jitterY = (random() - .5) * stepY * .02;
      const x = cols > 1 ? left + cell.col * stepX + jitterX : width / 2 + jitterX;
      const y = rows > 1 ? top + cell.row * stepY + jitterY : height / 2 + jitterY;
      if (x < radius || x > width - radius || y < radius || y > height - radius) continue;
      if (placed.some((other, i) => (x - other.x) ** 2 + (y - other.y) ** 2 < (radius + radii[i]) ** 2)) continue;
      accepted = { x, y };
      break;
    }
    if (!accepted) return null;
    usedCells.add(`${cell.col},${cell.row}`);
    const colorIndex = ((cell.col % 3) + (cell.row % 2) * 3 + colorOffset) % 7;
    placed.push({ n: cell.n, x: accepted.x, y: accepted.y, size, rotation: Math.round(-14 + random() * 28), colorIndex });
    radii.push(radius);
  }

  if (usedCells.size !== count) return null;
  return placed.sort((a, b) => a.n - b.n);
}

/** Build a seeded jittered-grid cloud in the measured arena's CSS-pixel coordinate space. */
export function layoutCloud(seed: number | string, count = CLOUD_NUMBER_COUNT, width = 1000, height = 700): CloudPosition[] {
  if (!Number.isInteger(count) || count < 1 || count > CLOUD_NUMBER_COUNT) throw new RangeError('Cloud size must be an integer from 1 to 100.');
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new RangeError('Cloud dimensions must be positive finite numbers.');
  const minFont = width < 600 ? 22 : 26;
  const root = mulberry32(seedNumber(seed));
  const cols = Math.max(1, Math.ceil(Math.sqrt(count * width / height)));
  const minCell = Math.min(width / cols, height / Math.ceil(count / cols));
  const fitScale = Math.min(1, minCell * .72 / 60);
  for (let retry = 0; retry <= 8; retry++) {
    const result = layoutAttempt(mulberry32(Math.floor(root() * 4294967296)), count, width, height, minFont, fitScale * .94 ** retry);
    if (result) return result;
  }

  // The near-regular jittered grid is the guaranteed final fit for very small arenas.
  const fallback = layoutAttempt(mulberry32(seedNumber(seed)), count, width, height, minFont, 0);
  if (fallback) return fallback;
  throw new Error('Unable to fit the requested cloud in the arena.');
}
