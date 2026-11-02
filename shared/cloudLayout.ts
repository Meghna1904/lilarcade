import type { CloudPosition } from './index.js';

export const CLOUD_WIDTH = 1000;
export const CLOUD_HEIGHT = 1200;
export const CLOUD_NUMBER_COUNT = 100;

type CloudSizeClass = { min: number; max: number; weight: number };
const SIZE_CLASSES: CloudSizeClass[] = [
  { min: 62, max: 68, weight: 25 },
  { min: 70, max: 74, weight: 35 },
  { min: 76, max: 80, weight: 25 },
  { min: 82, max: 88, weight: 15 },
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

export function cloudPaddedRadius(size: number): number { return size * 0.42 + 5; }
function chooseSize(random: () => number): number {
  let pick = random() * 100;
  for (const sizeClass of SIZE_CLASSES) {
    pick -= sizeClass.weight;
    if (pick < 0) return Math.round(sizeClass.min + random() * (sizeClass.max - sizeClass.min));
  }
  return 68;
}

type Candidate = CloudPosition & { radius: number; tieBreak: number };

function layoutAttempt(random: () => number, count: number): CloudPosition[] | null {
  const candidates: Candidate[] = Array.from({ length: count }, (_, i) => ({
    n: i + 1,
    x: 0,
    y: 0,
    size: chooseSize(random),
    rotation: Math.round(-14 + random() * 28),
    colorIndex: Math.floor(random() * 7),
    radius: 0,
    tieBreak: random(),
  })).map(item => ({ ...item, radius: cloudPaddedRadius(item.size) }))
    .sort((a, b) => b.radius - a.radius || a.tieBreak - b.tieBreak);

  const cellSize = 128;
  const cells = new Map<string, Candidate[]>();
  const placed: Candidate[] = [];
  const key = (col: number, row: number) => `${col},${row}`;
  for (const item of candidates) {
    let accepted = false;
    for (let tries = 0; tries < 200; tries++) {
      const x = item.radius + random() * (CLOUD_WIDTH - 2 * item.radius);
      const y = item.radius + random() * (CLOUD_HEIGHT - 2 * item.radius);
      const col = Math.floor(x / cellSize), row = Math.floor(y / cellSize);
      let overlaps = false;
      for (let dc = -1; dc <= 1 && !overlaps; dc++) for (let dr = -1; dr <= 1 && !overlaps; dr++) {
        for (const other of cells.get(key(col + dc, row + dr)) ?? []) {
          const dx = x - other.x, dy = y - other.y, min = item.radius + other.radius;
          if (dx * dx + dy * dy < min * min) { overlaps = true; break; }
        }
      }
      if (overlaps) continue;
      item.x = x;
      item.y = y;
      const nearby = placed.filter(other => {
        const dx = x - other.x, dy = y - other.y;
        const threshold = item.radius + other.radius + 8;
        return dx * dx + dy * dy < threshold * threshold;
      });
      const startColor = item.colorIndex;
      for (let offset = 0; offset < 7; offset++) {
        const color = (startColor + offset) % 7;
        if (!nearby.some(other => other.colorIndex === color)) { item.colorIndex = color; break; }
        item.colorIndex = color;
      }
      const bucket = key(col, row);
      cells.set(bucket, [...(cells.get(bucket) ?? []), item]);
      placed.push(item);
      accepted = true;
      break;
    }
    if (!accepted) return null;
  }
  return placed.sort((a, b) => a.n - b.n).map(({ n, x, y, size, rotation, colorIndex }) => ({ n, x, y, size, rotation, colorIndex }));
}

function fallbackLayout(random: () => number, count: number): CloudPosition[] {
  const cells = Array.from({ length: count }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return Array.from({ length: count }, (_, i) => {
    const cell = cells[i], row = Math.floor(cell / 10), col = cell % 10;
    return {
      n: i + 1,
      x: 50 + col * 100 + (random() - 0.5) * 8,
      y: 60 + row * 120 + (random() - 0.5) * 8,
      size: chooseSize(random),
      rotation: Math.round(-14 + random() * 28),
      colorIndex: Math.floor(random() * 7),
    };
  });
}

/** Build a deterministic, shuffled cloud. Circle padding keeps adjacent number tags separated. */
export function layoutCloud(seed: number | string, count = CLOUD_NUMBER_COUNT): CloudPosition[] {
  if (!Number.isInteger(count) || count < 1 || count > CLOUD_NUMBER_COUNT) throw new RangeError('Cloud size must be an integer from 1 to 100.');
  const root = mulberry32(seedNumber(seed));
  for (let restart = 0; restart < 64; restart++) {
    const subSeed = Math.floor(root() * 4294967296);
    const result = layoutAttempt(mulberry32(subSeed), count);
    if (result) return result;
  }
  return fallbackLayout(root, count);
}
