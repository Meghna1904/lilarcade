/**
 * Built-in adult coloring sheets. Every sheet is vector line art drawn on one
 * standard 4:3 page (1200 × 900), so a vertical tear makes two exact 600 × 900
 * halves and a horizontal tear two 1200 × 450 halves — no stretching, no
 * rounding, and crisp lines at any zoom.
 */

export const PAGE_WIDTH = 1200;
export const PAGE_HEIGHT = 900;

export type ColoringPage = {
  id: string;
  name: string;
  note: string;
  width: number;
  height: number;
  /** SVG data URI — rasterized onto a canvas at full size before it is shared. */
  uri: string;
};

const INK = '#2a2733';
const CX = PAGE_WIDTH / 2;
const CY = PAGE_HEIGHT / 2;

type Point = { x: number; y: number };

const n = (value: number) => Math.round(value * 10) / 10;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

const at = (cx: number, cy: number, r: number, degrees: number): Point => ({
  x: cx + Math.cos(rad(degrees)) * r,
  y: cy + Math.sin(rad(degrees)) * r,
});

const circle = (x: number, y: number, r: number) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}"/>`;

function beadRing(cx: number, cy: number, count: number, radius: number, size: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const point = at(cx, cy, radius, offset + (360 / count) * index);
    return `<circle cx="${n(point.x)}" cy="${n(point.y)}" r="${n(size)}" stroke-width="2.4"/>`;
  }).join('');
}

/** One teardrop pointing away from the centre; left open at the base on purpose. */
function petal(cx: number, cy: number, r0: number, r1: number, degrees: number, spread: number, bulge = 0.62) {
  const base1 = at(cx, cy, r0, degrees - spread);
  const base2 = at(cx, cy, r0, degrees + spread);
  const tip = at(cx, cy, r1, degrees);
  const reach = r0 + (r1 - r0) * bulge;
  const control1 = at(cx, cy, reach, degrees - spread * 0.92);
  const control2 = at(cx, cy, reach, degrees + spread * 0.92);
  return `M${n(base1.x)} ${n(base1.y)}Q${n(control1.x)} ${n(control1.y)} ${n(tip.x)} ${n(tip.y)}Q${n(control2.x)} ${n(control2.y)} ${n(base2.x)} ${n(base2.y)}`;
}

function petalRing(cx: number, cy: number, count: number, r0: number, r1: number, spread: number, bulge = 0.62, offset = 0) {
  return `<path d="${Array.from({ length: count }, (_, index) => petal(cx, cy, r0, r1, offset + (360 / count) * index, spread, bulge)).join('')}"/>`;
}

/** Row of outward bumps sitting on a circle. */
function scallop(cx: number, cy: number, count: number, radius: number, bulge: number, offset = 0) {
  return `<path d="${Array.from({ length: count }, (_, index) => {
    const from = offset + (360 / count) * index;
    const to = from + 360 / count;
    const start = at(cx, cy, radius, from);
    const end = at(cx, cy, radius, to);
    const control = at(cx, cy, radius + bulge, (from + to) / 2);
    return `M${n(start.x)} ${n(start.y)}Q${n(control.x)} ${n(control.y)} ${n(end.x)} ${n(end.y)}`;
  }).join('')}"/>`;
}

function leaf(x: number, y: number, length: number, width: number, degrees: number) {
  const tip = { x: x + Math.cos(rad(degrees)) * length, y: y + Math.sin(rad(degrees)) * length };
  const side = degrees + 90;
  const middle = { x: x + Math.cos(rad(degrees)) * length * 0.44, y: y + Math.sin(rad(degrees)) * length * 0.44 };
  const control1 = { x: middle.x + Math.cos(rad(side)) * width, y: middle.y + Math.sin(rad(side)) * width };
  const control2 = { x: middle.x - Math.cos(rad(side)) * width, y: middle.y - Math.sin(rad(side)) * width };
  return `<path d="M${n(x)} ${n(y)}Q${n(control1.x)} ${n(control1.y)} ${n(tip.x)} ${n(tip.y)}Q${n(control2.x)} ${n(control2.y)} ${n(x)} ${n(y)}"/>`;
}

function diamond(cx: number, cy: number, w: number, h: number) {
  return `<path d="M${n(cx)} ${n(cy - h)}L${n(cx + w)} ${n(cy)}L${n(cx)} ${n(cy + h)}L${n(cx - w)} ${n(cy)}Z"/>`;
}

function star(x: number, y: number, r: number, rotation = -90) {
  return `<path d="${Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 ? r * 0.42 : r;
    const point = at(x, y, radius, rotation + index * 36);
    return `${index ? 'L' : 'M'}${n(point.x)} ${n(point.y)}`;
  }).join('')}Z"/>`;
}

function sparkle(x: number, y: number, r: number) {
  const inner = r * 0.17;
  return `<path d="M${n(x)} ${n(y - r)}Q${n(x + inner)} ${n(y - inner)} ${n(x + r)} ${n(y)}Q${n(x + inner)} ${n(y + inner)} ${n(x)} ${n(y + r)}Q${n(x - inner)} ${n(y + inner)} ${n(x - r)} ${n(y)}Q${n(x - inner)} ${n(y - inner)} ${n(x)} ${n(y - r)}Z"/>`;
}

const quadPoint = (a: Point, b: Point, c: Point, t: number): Point => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * b.x + t * t * c.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * b.y + t * t * c.y,
});

/** A curved stem with leaves alternating either side of it. */
function leafyStem(a: Point, b: Point, c: Point, count: number, size: number) {
  const leaves = Array.from({ length: count }, (_, index) => {
    const t = 0.2 + (index / Math.max(1, count - 1)) * 0.72;
    const point = quadPoint(a, b, c, t);
    const along = (Math.atan2(c.y - a.y, c.x - a.x) * 180) / Math.PI;
    const tilt = index % 2 ? 52 : -52;
    return leaf(point.x, point.y, size * (1 - Math.abs(t - 0.55) * 0.45), size * 0.34, along + tilt);
  }).join('');
  return `<path d="M${n(a.x)} ${n(a.y)}Q${n(b.x)} ${n(b.y)} ${n(c.x)} ${n(c.y)}"/>${leaves}`;
}

const flower = (x: number, y: number, size: number) =>
  petalRing(x, y, 6, size * 0.26, size, 28, 0.62) + circle(x, y, size * 0.26) + beadRing(x, y, 6, size * 0.62, size * 0.09);

function grass(x: number, y: number) {
  return `<path d="M${n(x)} ${n(y)}q-14 -26 -30 -40M${n(x)} ${n(y)}q-6 -34 -12 -48M${n(x)} ${n(y)}q2 -36 4 -50M${n(x)} ${n(y)}q14 -30 30 -42"/>`;
}

function cloud(x: number, y: number, w: number) {
  const h = w * 0.34;
  return `<path d="M${n(x)} ${n(y)}q${n(w * 0.06)} ${n(-h * 0.9)} ${n(w * 0.26)} ${n(-h * 0.55)}q${n(w * 0.08)} ${n(-h * 0.8)} ${n(w * 0.34)} ${n(-h * 0.3)}q${n(w * 0.18)} ${n(-h * 0.5)} ${n(w * 0.4)} ${n(h * 0.55)}q${n(w * 0.16)} ${n(-h * 0.1)} ${n(w * 0.14)} ${n(h * 0.3)}Z"/>`;
}

function pine(x: number, base: number, height: number) {
  const width = height * 0.42;
  const trunk = `<path d="M${n(x - height * 0.03)} ${n(base)}L${n(x - height * 0.03)} ${n(base - height * 0.16)}L${n(x + height * 0.03)} ${n(base - height * 0.16)}L${n(x + height * 0.03)} ${n(base)}Z"/>`;
  const tiers = [0, 1, 2].map(index => {
    const bottom = base - height * (0.14 + index * 0.2);
    const top = bottom - height * 0.4;
    const half = (width * (1 - index * 0.24)) / 2;
    return `<path d="M${n(x)} ${n(top)}L${n(x + half)} ${n(bottom)}L${n(x - half)} ${n(bottom)}Z"/>`;
  }).join('');
  return trunk + tiers;
}

function snowLine(x: number, y: number, half: number) {
  const step = half / 4;
  return `<path d="M${n(x - half)} ${n(y + half * 0.95)}l${n(step)} ${n(-step * 0.55)}l${n(step * 0.8)} ${n(step * 0.7)}l${n(step * 1.1)} ${n(-step * 0.95)}l${n(step * 0.9)} ${n(step * 0.8)}l${n(step * 1.1)} ${n(-step * 0.7)}l${n(step)} ${n(step * 0.4)}"/>`;
}

/* --------------------------------------------------------------- the sheets */

function mandala() {
  return sheet([
    petalRing(CX, CY, 12, 16, 84, 9, 0.62),
    circle(CX, CY, 16),
    circle(CX, CY, 90),
    petalRing(CX, CY, 24, 96, 144, 5.6, 0.6, 7.5),
    circle(CX, CY, 150),
    beadRing(CX, CY, 40, 166, 5),
    circle(CX, CY, 182),
    petalRing(CX, CY, 12, 186, 274, 12.6, 0.58),
    petalRing(CX, CY, 12, 204, 254, 7.8, 0.6),
    circle(CX, CY, 282),
    scallop(CX, CY, 36, 282, 24),
    circle(CX, CY, 308),
    circle(CX, CY, 330),
    beadRing(CX, CY, 44, 319, 4.4),
    circle(CX, CY, 334),
    petalRing(CX, CY, 40, 334, 386, 3.9, 0.62),
    scallop(CX, CY, 60, 388, 14),
    circle(CX, CY, 400),
  ].join(''));
}

function wreath() {
  const parts = [circle(CX, CY, 366), scallop(CX, CY, 32, 366, 15), circle(CX, CY, 236)];
  for (let index = 0; index < 8; index += 1) {
    const angle = -90 + index * 45;
    const bloom = at(CX, CY, 300, angle);
    parts.push(petalRing(bloom.x, bloom.y, 6, 14, 62, 30, 0.66, angle - 90));
    parts.push(petalRing(bloom.x, bloom.y, 6, 22, 44, 22, 0.6, angle - 60));
    parts.push(circle(bloom.x, bloom.y, 14), beadRing(bloom.x, bloom.y, 6, 30, 3.6, angle - 90));
    const gap = angle + 22.5;
    const band = at(CX, CY, 300, gap);
    parts.push(leaf(band.x, band.y, 66, 19, gap + 90));
    parts.push(leaf(band.x, band.y, 66, 19, gap - 90));
    const outerLeaf = at(CX, CY, 262, gap);
    parts.push(leaf(outerLeaf.x, outerLeaf.y, 50, 16, gap));
    const innerLeaf = at(CX, CY, 338, gap);
    parts.push(leaf(innerLeaf.x, innerLeaf.y, 50, 16, gap + 180));
    const berry = at(CX, CY, 344, gap);
    parts.push(circle(berry.x, berry.y, 4.5));
  }
  parts.push(
    circle(CX, CY, 228),
    petalRing(CX, CY, 16, 132, 224, 7, 0.62),
    beadRing(CX, CY, 24, 178, 4.4),
    circle(CX, CY, 120),
    petalRing(CX, CY, 8, 22, 96, 22, 0.6),
    circle(CX, CY, 22),
    beadRing(CX, CY, 8, 64, 4),
  );
  const corners: Array<[number, number, number]> = [[96, 108, 18], [1104, 108, 162], [96, 792, -18], [1104, 792, -162]];
  corners.forEach(([x, y, rotation]) => parts.push(`<g transform="translate(${x} ${y}) rotate(${rotation})">${sprig()}</g>`));
  return sheet(parts.join(''));
}

function sprig() {
  const a = { x: 0, y: 0 };
  const b = { x: 46, y: 18 };
  const c = { x: 96, y: 2 };
  const parts = [`<path d="M0 0Q46 18 96 2"/>`];
  [0.2, 0.42, 0.64, 0.85].forEach((t, index) => {
    const point = quadPoint(a, b, c, t);
    parts.push(leaf(point.x, point.y, 34, 13, index % 2 ? -42 : 42));
  });
  const tip = quadPoint(a, b, c, 1);
  parts.push(circle(tip.x, tip.y, 6));
  return parts.join('');
}

/** Crescent built from the two circle arcs that actually form its outline. */
function arcRun(cx: number, cy: number, r: number, keep: (point: Point) => boolean, step = 2) {
  const total = Math.round(360 / step);
  const flags = Array.from({ length: total }, (_, index) => keep(at(cx, cy, r, index * step)));
  // Start on the first sample whose predecessor is outside the arc.
  let start = -1;
  for (let index = 0; index < total; index += 1) {
    if (!flags[index] && flags[(index + 1) % total]) { start = (index + 1) % total; break; }
  }
  if (start < 0) return [] as Point[];
  const points: Point[] = [];
  for (let index = 0; index < total; index += 1) {
    const slot = (start + index) % total;
    if (!flags[slot]) break;
    points.push(at(cx, cy, r, slot * step));
  }
  return points;
}

function crescent(ax: number, ay: number, ar: number, bx: number, by: number, br: number) {
  const outer = arcRun(ax, ay, ar, point => Math.hypot(point.x - bx, point.y - by) > br);
  const inner = arcRun(bx, by, br, point => Math.hypot(point.x - ax, point.y - ay) < ar);
  if (!outer.length || !inner.length) return '';
  const gap = (first: Point, second: Point) => Math.hypot(first.x - second.x, first.y - second.y);
  const straight = gap(outer[outer.length - 1], inner[0]) + gap(outer[0], inner[inner.length - 1]);
  const flipped = gap(outer[outer.length - 1], inner[inner.length - 1]) + gap(outer[0], inner[0]);
  const ring = straight <= flipped ? [...outer, ...inner] : [...outer, ...inner.slice().reverse()];
  return `<path d="M${ring.map(point => `${n(point.x)} ${n(point.y)}`).join('L')}Z"/>`;
}

function moon() {
  const parts = [
    crescent(556, 430, 264, 676, 384, 230),
    circle(372, 470, 24), circle(436, 566, 17), circle(328, 556, 12), circle(470, 380, 10),
    star(946, 232, 34), star(1052, 366, 24), star(878, 144, 20),
    star(1010, 136, 15), star(1090, 508, 18), star(944, 604, 22), star(842, 700, 15),
    sparkle(806, 92, 16), sparkle(1122, 244, 12), sparkle(762, 596, 12),
    circle(742, 316, 3.5), circle(716, 208, 3), circle(884, 452, 3.5), circle(978, 690, 3),
    circle(812, 392, 2.6), circle(1128, 616, 3.4), circle(1006, 296, 2.8), circle(908, 96, 3.2),
    `<path d="M0 858q75 -16 150 0t150 0t150 0t150 0t150 0t150 0t150 0t150 0"/>`,
    leafyStem({ x: 138, y: 858 }, { x: 92, y: 700 }, { x: 176, y: 592 }, 5, 44),
    leafyStem({ x: 1082, y: 858 }, { x: 1136, y: 706 }, { x: 1046, y: 600 }, 5, 44),
    flower(176, 578, 26), flower(1046, 586, 26), flower(96, 846, 20), flower(1120, 840, 20),
  ];
  return sheet(parts.join(''));
}

function tile(kind: number, cx: number, cy: number, size: number) {
  if (kind === 0) {
    return [
      diamond(cx, cy, size, size * 0.86), diamond(cx, cy, size * 0.66, size * 0.56),
      diamond(cx, cy, size * 0.3, size * 0.26), circle(cx, cy, 5),
    ].join('');
  }
  if (kind === 1) {
    return petalRing(cx, cy, 8, size * 0.22, size, 18, 0.62) + circle(cx, cy, size * 0.22) + beadRing(cx, cy, 8, size * 0.62, size * 0.09, 22.5);
  }
  if (kind === 2) {
    const spokes = Array.from({ length: 8 }, (_, index) => {
      const angle = index * 45;
      const from = at(cx, cy, size * 0.34, angle);
      const to = at(cx, cy, size, angle);
      return `M${n(from.x)} ${n(from.y)}L${n(to.x)} ${n(to.y)}`;
    }).join('');
    return [circle(cx, cy, size * 0.34), circle(cx, cy, size * 0.62), circle(cx, cy, size), `<path d="${spokes}"/>`].join('');
  }
  if (kind === 3) {
    return [0, 60, 120, 180, 240, 300].map(angle => leaf(cx, cy, size, size * 0.3, angle)).join('') + circle(cx, cy, size * 0.2);
  }
  return [0, 90, 180, 270].map(angle => {
    const point = at(cx, cy, size * 0.46, angle);
    return circle(point.x, point.y, size * 0.44);
  }).join('') + circle(cx, cy, size * 0.22);
}

function quilt() {
  const margin = 34;
  const columns = 6;
  const rows = 5;
  const width = (PAGE_WIDTH - margin * 2) / columns;
  const height = (PAGE_HEIGHT - margin * 2) / rows;
  const parts: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = margin + column * width;
      const y = margin + row * height;
      parts.push(`<rect x="${n(x + 3)}" y="${n(y + 3)}" width="${n(width - 6)}" height="${n(height - 6)}" rx="10"/>`);
      parts.push(tile((row * 2 + column * 3) % 5, x + width / 2, y + height / 2, Math.min(width, height) * 0.5 - 12));
    }
  }
  return sheet(parts.join(''));
}

function lake() {
  const horizon = 612;
  const parts = [
    circle(942, 168, 56), circle(942, 168, 40),
    `<path d="${Array.from({ length: 20 }, (_, index) => {
      const angle = index * 18 + 9;
      const from = at(942, 168, 74, angle);
      const to = at(942, 168, 116, angle);
      return `M${n(from.x)} ${n(from.y)}L${n(to.x)} ${n(to.y)}`;
    }).join('')}"/>`,
    cloud(88, 208, 236), cloud(604, 120, 158),
    `<path d="M300 176q13 -12 26 0M326 176q13 -12 26 0M420 128q11 -10 22 0M442 128q11 -10 22 0"/>`,
    `<path d="M0 ${horizon}L206 368L330 500L470 326L664 ${horizon}Z"/>`,
    `<path d="M540 ${horizon}L722 426L872 556L1006 464L1200 ${horizon}Z"/>`,
    snowLine(206, 368, 84), snowLine(470, 326, 92), snowLine(722, 426, 70), snowLine(1006, 464, 62),
    `<rect x="0" y="${horizon}" width="${PAGE_WIDTH}" height="156"/>`,
    `<path d="M96 646q84 -14 168 0t168 0M120 690q72 -12 144 0t144 0M96 730q96 -14 192 0t192 0M700 676q90 -14 180 0t180 0M660 726q120 -14 240 0t240 0"/>`,
    `<path d="M906 640h96M892 664h124M918 686h72M900 710h108"/>`,
    `<path d="M0 792Q150 754 300 786T600 786T900 782T1200 788L1200 900L0 900Z"/>`,
    pine(150, 792, 196), pine(252, 786, 258), pine(352, 800, 150), pine(1046, 790, 168), pine(1122, 798, 124),
    flower(180, 852, 24), flower(430, 866, 19), flower(648, 848, 26), flower(900, 862, 21), flower(1118, 852, 17),
    grass(70, 882), grass(320, 880), grass(760, 876), grass(1000, 882),
  ];
  return sheet(parts.join(''));
}

function sheet(body: string, weight = 3) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}"><rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="#ffffff"/><g fill="none" stroke="${INK}" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const page = (id: string, name: string, note: string, draw: () => string): ColoringPage => ({
  id, name, note, width: PAGE_WIDTH, height: PAGE_HEIGHT, uri: draw(),
});

export const COLORING_PAGES: ColoringPage[] = [
  page('mandala', 'Mandala', 'Twelve-fold rosette', mandala),
  page('wreath', 'Wildflower wreath', 'Leaves and blooms', wreath),
  page('moon', 'Moon garden', 'Crescent and stars', moon),
  page('quilt', 'Motif quilt', 'Zentangle tiles', quilt),
  page('lake', 'Mountain lake', 'Pines and still water', lake),
];
