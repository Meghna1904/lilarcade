export type PuzzleRect = { id: number; row: number; col: number; x: number; y: number; width: number; height: number };

function randomFrom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function puzzleGrid(count: number, aspect: number, width = 1000, fixedRows?: number, fixedCols?: number) {
  const columns = fixedCols ?? Math.max(1, Math.round(Math.sqrt(count * aspect)));
  const rows = fixedRows ?? Math.ceil(count / columns);
  const height = width / aspect;
  return { columns, rows, width, height, cellWidth: width / columns, cellHeight: height / rows };
}

/** Regular rows and columns with exactly the requested piece count. */
export function createPuzzleRects(count: number, seed: number, width: number, height: number, rows?: number, cols?: number): PuzzleRect[] {
  void seed;
  const aspect = width / height;
  const grid = puzzleGrid(count, aspect, width, rows, cols);
  const cellWidth = width / grid.columns, cellHeight = height / grid.rows;
  return Array.from({ length: count }, (_, id) => {
    const row = Math.floor(id / grid.columns), col = id % grid.columns;
    return { id, row, col, x: col * cellWidth, y: row * cellHeight, width: cellWidth, height: cellHeight };
  });
}

type Side = 'top' | 'right' | 'bottom' | 'left';
type Segment = { from: number; to: number; other: number };
const EPSILON = 0.01;

function segmentsFor(rect: PuzzleRect, all: PuzzleRect[], side: Side): Segment[] {
  const segments: Segment[] = [];
  for (const other of all) {
    if (other.id === rect.id) continue;
    if (side === 'top' && Math.abs(other.y + other.height - rect.y) < EPSILON) {
      const from = Math.max(rect.x, other.x), to = Math.min(rect.x + rect.width, other.x + other.width);
      if (to - from > EPSILON) segments.push({ from: from - rect.x, to: to - rect.x, other: other.id });
    } else if (side === 'right' && Math.abs(other.x - rect.x - rect.width) < EPSILON) {
      const from = Math.max(rect.y, other.y), to = Math.min(rect.y + rect.height, other.y + other.height);
      if (to - from > EPSILON) segments.push({ from: from - rect.y, to: to - rect.y, other: other.id });
    } else if (side === 'bottom' && Math.abs(other.y - rect.y - rect.height) < EPSILON) {
      const from = Math.max(rect.x, other.x), to = Math.min(rect.x + rect.width, other.x + other.width);
      if (to - from > EPSILON) segments.push({ from: rect.x + rect.width - to, to: rect.x + rect.width - from, other: other.id });
    } else if (side === 'left' && Math.abs(other.x + other.width - rect.x) < EPSILON) {
      const from = Math.max(rect.y, other.y), to = Math.min(rect.y + rect.height, other.y + other.height);
      if (to - from > EPSILON) segments.push({ from: rect.y + rect.height - to, to: rect.y + rect.height - from, other: other.id });
    }
  }
  return segments.sort((a, b) => a.from - b.from);
}

function edgePath(length: number, start: { x: number; y: number }, tangent: { x: number; y: number }, normal: { x: number; y: number }, segments: Segment[], rect: PuzzleRect, side: Side, seed: number) {
  let path = '';
  let cursor = 0;
  const point = (at: number) => ({ x: start.x + tangent.x * at, y: start.y + tangent.y * at });
  for (const segment of segments) {
    const from = Math.max(cursor, segment.from), to = Math.min(length, segment.to);
    const span = to - from;
    if (span <= 8) continue;
    path += `L ${point(from).x} ${point(from).y} `;
    let state = (seed ^ Math.imul(Math.min(rect.id, segment.other) + 1, 0x9e3779b1) ^ Math.imul(Math.max(rect.id, segment.other) + 1, 0x85ebca6b)) >>> 0;
    const random = () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    const reversed = side === 'bottom' || side === 'left';
    let along = 0.36 + random() * 0.28;
    if (reversed) along = 1 - along;
    const tabHalf = Math.min(span * (0.22 + random() * 0.08), Math.min(rect.width, rect.height) * (0.2 + random() * 0.07));
    const depth = Math.min(28, 18 + random() * 12, span * (0.24 + random() * 0.08), Math.min(rect.width, rect.height) * (0.22 + random() * 0.1));
    const polarity = random() < 0.5 ? -1 : 1;
    const sign = rect.id < segment.other ? polarity : -polarity;
    const n = { x: normal.x * sign, y: normal.y * sign };
    const centre = from + span * along;
    const a = point(centre - tabHalf), b = point(centre + tabHalf);
    const ap = (along: number, across: number) => ({
      x: start.x + tangent.x * along + n.x * across,
      y: start.y + tangent.y * along + n.y * across,
    });
    const neck = 0.48 + random() * 0.2;
    const shoulder = 1.08 + random() * 0.25;
    const p1 = ap(centre - tabHalf * neck, depth * 0.66);
    const p2 = ap(centre, depth);
    const p3 = ap(centre + tabHalf * neck, depth * 0.66);
    path += `L ${a.x} ${a.y} C ${ap(centre - tabHalf * 0.84, 0).x} ${ap(centre - tabHalf * 0.84, 0).y} ${p1.x} ${p1.y} ${p1.x} ${p1.y} `;
    path += `C ${ap(centre - tabHalf * 0.24, depth * shoulder).x} ${ap(centre - tabHalf * 0.24, depth * shoulder).y} ${ap(centre - tabHalf * 0.12, depth * shoulder).x} ${ap(centre - tabHalf * 0.12, depth * shoulder).y} ${p2.x} ${p2.y} `;
    path += `C ${ap(centre + tabHalf * 0.12, depth * shoulder).x} ${ap(centre + tabHalf * 0.12, depth * shoulder).y} ${ap(centre + tabHalf * 0.24, depth * shoulder).x} ${ap(centre + tabHalf * 0.24, depth * shoulder).y} ${p3.x} ${p3.y} `;
    path += `C ${p3.x} ${p3.y} ${ap(centre + tabHalf * 0.84, 0).x} ${ap(centre + tabHalf * 0.84, 0).y} ${b.x} ${b.y} `;
    cursor = Math.max(cursor, Math.min(to, centre + tabHalf));
  }
  path += `L ${point(length).x} ${point(length).y}`;
  return path;
}

/** Matched SVG cut contours: each shared edge bulges one way on both pieces. */
export function piecePath(rect: PuzzleRect, all: PuzzleRect[], padding: number, seed = 0): string {
  const edges = pieceEdgePaths(rect, all, padding, seed);
  return `M ${padding} ${padding} ${edges.top} ${edges.right} ${edges.bottom} ${edges.left} Z`;
}

export function pieceEdgePaths(rect: PuzzleRect, all: PuzzleRect[], padding: number, seed = 0) {
  const w = rect.width, h = rect.height, p = padding;
  const top = edgePath(w, { x: p, y: p }, { x: 1, y: 0 }, { x: 0, y: -1 }, segmentsFor(rect, all, 'top'), rect, 'top', seed);
  const right = edgePath(h, { x: p + w, y: p }, { x: 0, y: 1 }, { x: 1, y: 0 }, segmentsFor(rect, all, 'right'), rect, 'right', seed);
  const bottom = edgePath(w, { x: p + w, y: p + h }, { x: -1, y: 0 }, { x: 0, y: 1 }, segmentsFor(rect, all, 'bottom'), rect, 'bottom', seed);
  const left = edgePath(h, { x: p, y: p + h }, { x: 0, y: -1 }, { x: -1, y: 0 }, segmentsFor(rect, all, 'left'), rect, 'left', seed);
  return { top, right, bottom, left };
}

export function shuffledIds(count: number, seed: number) {
  const random = randomFrom(seed ^ 0x9e3779b9);
  const ids = Array.from({ length: count }, (_, index) => index);
  for (let index = ids.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
  }
  return ids;
}
