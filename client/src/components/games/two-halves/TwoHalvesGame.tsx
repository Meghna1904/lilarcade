import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  defaultTwoHalvesSettings,
  type ClientToServerEvents,
  type RoomView,
  type ServerToClientEvents,
  type TwoHalvesMergeStyle,
  type TwoHalvesSeamStyle,
  type TwoHalvesSettings,
  type TwoHalvesSplit,
  type TwoHalvesStroke,
  type TwoHalvesTearStyle,
  type TwoHalvesView,
} from '@arcade/shared';
import type { Socket } from 'socket.io-client';
import { GameDoodle } from '../../../doodles/GameDoodle';
import { playerDoodleId } from '../../../doodles/playerDoodle';
import { brushAlpha, clamp, colorAtSquare, hexToHsv, hexToRgb, hsvFromHexPreservingHue, hsvFromSquare, hsvToHex, hueFromHandle, normalizeHex, pickerLayout, rgbToHex, seedFromHex, type HSV } from './color';
import { applyFill, buildBarriers, computeFill, dilateBarriers } from './fill';
import {
  MERGE_DURATION_MS, SEAM_DURATION_MS, TEAR_DURATION_MS, frontPoint, makeJag, seamPath, seamStyleUsesColor,
  sparkles, stitchBars, tearPolygon, threadDashes, toClipPath, zigzagPath, type SplitAxis,
} from './tear';
import { clampPan, clampZoom, fitScale, imageOrigin, panToPoint, pointerToPage, type Point } from './view';
import './two-halves.css';
import './two-halves-studio.css';

type Props = { game: TwoHalvesView; self: string; players: RoomView['players']; socket: Socket<ServerToClientEvents, ClientToServerEvents> };
type Tool = 'pencil'|'marker'|'crayon'|'pastel'|'watercolor'|'brush'|'glitter'|'fill'|'hand'|'eraser';
type Palette = 'Pencils'|'Watercolor'|'Pastel'|'Neon'|'Earth';
const palettes: Record<Palette, string[]> = {
  Pencils: ['#111111','#3b3b3b','#666666','#999999','#cccccc','#f5f5f5','#5c3317','#8a431e','#bd641f','#e9b276','#ffd8a8','#d6336c','#c2255c','#ef4f00','#ff922b','#f59f00','#fcc419','#fff3bf','#82c91e','#2f9e44','#0ca678','#0c7285','#15aabf','#74c0fc','#228be6','#364fc7','#7048e8','#be4bdb','#f06595','#ffa8a8','#fa5252','#a9e34b','#63e6be','#20c997','#845ef7','#ff8787'],
  Watercolor: ['#3b2737','#533b4d','#76516a','#8a6573','#c08b94','#e5b2aa','#f3c5bd','#804b34','#a85d3a','#ba7149','#e19c6b','#f0c08b','#f8d7a2','#596b3c','#7a8b58','#a6b77b','#cccf9a','#e6e0b1','#486b78','#5a91a2','#8bc2c9','#b6ded8','#555c88','#7887b5','#a7b7d6','#d2d9e8','#835d9b','#ab80b7','#d1a3ce','#eed3e3','#9c6644','#b08968','#52796f','#84a98c','#6d6875','#e5989b'],
  Pastel: ['#fff0f0','#ffe3e3','#ffc9c9','#ffa8a8','#fcc2d7','#faa2c1','#f783ac','#eebefa','#e5dbff','#d0bfff','#bac8ff','#a5d8ff','#c5f6fa','#c3fae8','#d3f9d8','#d8f5a2','#e9fac8','#fff3bf','#ffec99','#ffe8cc','#ffd8a8','#ffdeeb','#f1f3f5','#e9ecef','#dee2e6','#fff','#f8f0fc','#e7f5ff','#e6fcf5','#fff9db','#fff4e6','#f3d9fa','#d0ebff','#c3fae8','#d8f5a2','#ffd8a8'],
  Neon: ['#ff0054','#ff006e','#f72585','#ff70a6','#ff99c8','#fb5607','#ff4d00','#ff7b00','#ffbe0b','#f9f871','#d0ff00','#caff00','#aaff00','#70e000','#00ff9f','#00f5d4','#80ffdb','#00f0ff','#48bfe3','#00bbf9','#3a86ff','#4361ee','#5e60ce','#7209b7','#8338ec','#b5179e','#e0aaff','#ff00ff','#ff3131','#ffea00','#39ff14','#7df9ff','#fe53bb','#adff2f','#bf00ff','#00ffff'],
  Earth: ['#1f1b16','#26231f','#463f3a','#5d5147','#8a7867','#b6a58f','#d6c6b2','#51372f','#754c37','#98694f','#c4926b','#e0a96d','#62543f','#87744f','#a59767','#c7b985','#35594b','#4e755b','#769477','#a8b899','#344955','#4a6671','#718b91','#9eb5b5','#5a4356','#806478','#a88b9d','#cdb8c2','#7f5539','#9c6644','#b08968','#52796f','#84a98c','#cad2c5','#6b705c','#cb997e'],
};
const samplePage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="720" viewBox="0 0 1040 720"><rect width="1040" height="720" fill="white"/><g fill="none" stroke="#292735" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M80 600c130-40 240-40 370 0s250 40 510 0M185 565c0-160 145-310 335-310s335 150 335 310M520 255V98m0 74c-80-110-210-95-207-8 2 70 110 103 207 8m0 55c77-108 200-94 198-10-2 70-105 99-198 10M273 433c28-48 78-48 106 0-30 48-78 48-106 0zm92 0h-78m375 0c28-48 78-48 106 0-30 48-78 48-106 0zm92 0h-78M416 498q104 80 208 0m-193-4 20 12m137-12-20 12M223 365l-46-28m640 28 46-28M320 292l-20-48m420 48 20-48"/><path d="M110 627q25-45 50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0"/></g><g fill="#292735"><circle cx="335" cy="425" r="8"/><circle cx="705" cy="425" r="8"/></g></svg>')}`;
const toolList: Array<{ id: Tool; icon: string; label: string }> = [
  { id: 'fill', icon: '◈', label: 'Fill' }, { id: 'pencil', icon: '✎', label: 'Pencil' }, { id: 'marker', icon: '／', label: 'Marker' }, { id: 'crayon', icon: '╱', label: 'Crayon' },
  { id: 'pastel', icon: '▯', label: 'Pastel' }, { id: 'watercolor', icon: '♧', label: 'Watercolor' }, { id: 'brush', icon: '🖌', label: 'Brush' },
  { id: 'glitter', icon: '✧', label: 'Glitter' }, { id: 'hand', icon: '✋', label: 'Hand' }, { id: 'eraser', icon: '▱', label: 'Eraser' },
];
const moodPresets = [
  { name: 'Sunset', icon: '☼', palette: 'Pastel' as Palette, color: '#f06595' },
  { name: 'Ocean', icon: '≈', palette: 'Watercolor' as Palette, color: '#15aabf' },
  { name: 'Garden', icon: '✿', palette: 'Earth' as Palette, color: '#2f9e44' },
  { name: 'Electric', icon: '✦', palette: 'Neon' as Palette, color: '#00f5d4' },
];
const tearOptions: Array<{ id: TwoHalvesTearStyle; label: string }> = [
  { id: 'rip', label: 'Rip' }, { id: 'cut', label: 'Clean cut' }, { id: 'none', label: 'No animation' },
];
const mergeOptions: Array<{ id: TwoHalvesMergeStyle; label: string }> = [
  { id: 'slide', label: 'Slide' }, { id: 'snap', label: 'Snap' }, { id: 'fold', label: 'Fold shut' }, { id: 'skip', label: 'Skip' },
];
const seamOptions: Array<{ id: TwoHalvesSeamStyle; label: string }> = [
  { id: 'none', label: 'No stitch' }, { id: 'gold', label: 'Gold seam' }, { id: 'stitches', label: 'Gold stitches' },
  { id: 'thread', label: 'Thread' }, { id: 'zigzag', label: 'Zigzag' },
];
const splitOptions: Array<{ id: TwoHalvesSplit; label: string }> = [
  { id: 'vertical', label: 'Left / right' }, { id: 'horizontal', label: 'Top / bottom' },
];

const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
const logDebug = (...args: unknown[]) => { if (DEBUG) console.info('[twohalves]', ...args); };

function imageFrom(src: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; }); }
function smallSnapshot(canvas: HTMLCanvasElement, preferredScale = 1) {
  let scale = preferredScale;
  let output = document.createElement('canvas');
  let data = '';
  do {
    output.width = Math.round(canvas.width * scale); output.height = Math.round(canvas.height * scale);
    output.getContext('2d')?.drawImage(canvas, 0, 0, output.width, output.height);
    data = output.toDataURL('image/webp', .7);
    if (!data.startsWith('data:image/webp,')) data = output.toDataURL('image/png');
    if (data.length <= 220_000) return data;
    scale *= .78;
  } while (scale > .2);
  return data;
}
function star(context: CanvasRenderingContext2D, x: number, y: number, r: number) {
  context.beginPath();
  for (let i = 0; i < 8; i++) { const radius = i % 2 ? r * .25 : r; const angle = i * Math.PI / 4 - Math.PI / 2; const px = x + Math.cos(angle) * radius; const py = y + Math.sin(angle) * radius; if (!i) context.moveTo(px, py); else context.lineTo(px, py); }
  context.closePath(); context.fill();
}
const MAX_PAGE_WIDTH = 1200;
const MAX_PAGE_HEIGHT = 900;
const MAX_PAGE_CHARS = 320_000;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DEFAULT_COLOR = palettes.Pencils[6];
const FILL_EXPAND = 2;
const FILL_SEED_RADIUS = 4;
const BARRIER_ALPHA = 48;
const BARRIER_LUMINANCE = 96;
const BARRIER_DILATE = 1;
const GOLD_STOPS = ['#8f5f06', '#dcae2e', '#f2cb55', '#c8921a', '#84560a'];

type ImageSource = { source: CanvasImageSource; width: number; height: number };

/** Decodes an upload with EXIF orientation applied before it is measured or drawn. */
async function loadImageSource(file: File): Promise<ImageSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch { /* fall through to the <img> path */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await imageFrom(url);
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally { URL.revokeObjectURL(url); }
}

/** Rebuilds a page half as transparent line art: alpha = 255 - luminance. */
function makeLineArt(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) return 0;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  let ink = 0;
  for (let index = 0; index < data.length; index += 4) {
    const luminance = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    const alpha = 255 - Math.round(luminance);
    data[index + 3] = alpha;
    if (alpha > BARRIER_ALPHA) ink++;
  }
  context.putImageData(image, 0, 0);
  return canvas.width * canvas.height ? ink / (canvas.width * canvas.height) : 0;
}

function configureBrush(context: CanvasRenderingContext2D, stroke: TwoHalvesStroke, canvasWidth: number) {
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  context.globalAlpha = clamp(stroke.alpha);
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = Math.max(1, stroke.size * canvasWidth);
  context.lineCap = stroke.tool === 'crayon' ? 'square' : 'round';
  context.lineJoin = 'round';
  context.shadowBlur = stroke.tool === 'pastel' ? 4 : 0;
  context.shadowColor = stroke.color;
}

/**
 * Paints one seam style over whatever is already on the canvas. The caller clips
 * to the reveal rectangle so the seam is drawn on along the join.
 */
function drawSeamOverlay(
  context: CanvasRenderingContext2D, axis: SplitAxis, style: TwoHalvesSeamStyle, color: string,
  jag: number[], width: number, height: number, seed: number,
) {
  if (style === 'none') return;
  const vertical = axis === 'vertical';
  const size = Math.max(width, height);
  const path = seamPath(axis, jag);
  const points = path.map(point => ({ x: point.x * width, y: point.y * height }));
  const gold = vertical ? context.createLinearGradient(0, 0, width, 0) : context.createLinearGradient(0, 0, 0, height);
  GOLD_STOPS.forEach((stop, index) => gold.addColorStop(index / (GOLD_STOPS.length - 1), stop));
  const trace = () => {
    context.beginPath();
    points.forEach((point, index) => (index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)));
  };
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (style === 'gold') {
    context.save();
    context.shadowColor = 'rgba(58,36,0,.5)';
    context.shadowBlur = size * 0.007;
    context.strokeStyle = gold;
    context.lineWidth = Math.max(2, size * 0.011);
    trace();
    context.stroke();
    context.restore();
    context.strokeStyle = 'rgba(255,240,179,.85)';
    context.lineWidth = Math.max(1, size * 0.0028);
    trace();
    context.stroke();
    context.fillStyle = '#fff6c9';
    sparkles(seed).forEach(spark => star(context, spark.x * width, spark.y * height, spark.r * size));
  } else if (style === 'stitches') {
    const bars = stitchBars(axis, jag, 25, 0.042, seed);
    bars.forEach(bar => {
      const cx = bar.x * width;
      const cy = bar.y * height;
      const half = (bar.length * size) / 2;
      const dx = Math.cos(bar.angle) * half;
      const dy = Math.sin(bar.angle) * half;
      context.save();
      context.shadowColor = 'rgba(58,36,0,.45)';
      context.shadowBlur = size * 0.005;
      context.strokeStyle = gold;
      context.lineWidth = Math.max(2, size * 0.006);
      context.beginPath();
      context.moveTo(cx - dx, cy - dy);
      context.lineTo(cx + dx, cy + dy);
      context.stroke();
      context.restore();
      context.strokeStyle = 'rgba(255,245,200,.75)';
      context.lineWidth = Math.max(1, size * 0.0018);
      context.beginPath();
      context.moveTo(cx - dx * 0.82, cy - dy * 0.82 - size * 0.0012);
      context.lineTo(cx + dx * 0.82, cy + dy * 0.82 - size * 0.0012);
      context.stroke();
      context.fillStyle = '#b9821b';
      [1, -1].forEach(sign => {
        context.beginPath();
        context.arc(cx + dx * sign, cy + dy * sign, Math.max(1.4, size * 0.0026), 0, Math.PI * 2);
        context.fill();
      });
    });
    context.fillStyle = '#fff6c9';
    sparkles(seed + 7, 3).forEach(spark => star(context, spark.x * width, spark.y * height, spark.r * size));
  } else if (style === 'thread') {
    const dashes = threadDashes(axis, jag);
    context.save();
    context.shadowColor = 'rgba(0,0,0,.35)';
    context.shadowBlur = size * 0.004;
    context.strokeStyle = color;
    context.lineWidth = Math.max(1.5, size * 0.005);
    dashes.forEach(([a, b]) => {
      context.beginPath();
      context.moveTo(a.x * width, a.y * height);
      context.lineTo(b.x * width, b.y * height);
      context.stroke();
    });
    context.restore();
    context.strokeStyle = 'rgba(255,255,255,.35)';
    context.lineWidth = Math.max(1, size * 0.0016);
    dashes.forEach(([a, b]) => {
      context.beginPath();
      context.moveTo(a.x * width, (a.y * height) - size * 0.0016);
      context.lineTo(b.x * width, (b.y * height) - size * 0.0016);
      context.stroke();
    });
  } else if (style === 'zigzag') {
    const zig = zigzagPath(axis, jag);
    const drawZig = () => {
      context.beginPath();
      zig.forEach((point, index) => (index ? context.lineTo(point.x * width, point.y * height) : context.moveTo(point.x * width, point.y * height)));
      context.stroke();
    };
    context.save();
    context.shadowColor = 'rgba(0,0,0,.35)';
    context.shadowBlur = size * 0.004;
    context.strokeStyle = color;
    context.lineWidth = Math.max(1.5, size * 0.0042);
    drawZig();
    context.restore();
    context.strokeStyle = 'rgba(255,255,255,.3)';
    context.lineWidth = Math.max(1, size * 0.0014);
    drawZig();
  }
  context.restore();
}

export function TwoHalvesGame({ game, self, players, socket }: Props) {
  const settings: TwoHalvesSettings = game.settings ?? defaultTwoHalvesSettings;
  const split = settings.split;
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(DEFAULT_COLOR));
  const color = hsvToHex(hsv);
  const rgb = hexToRgb(color);
  const layout = pickerLayout(hsv);
  const pureHue = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const [palette, setPalette] = useState<Palette>('Pencils');
  const [tool, setTool] = useState<Tool>('fill');
  const [size, setSize] = useState(12);
  const [strength, setStrength] = useState(85);
  const [hexDraft, setHexDraft] = useState(DEFAULT_COLOR);
  const [recent, setRecent] = useState<string[]>([]);
  const [photoPage, setPhotoPage] = useState(false);
  const [pageDims, setPageDims] = useState({ w: 0, h: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [mode, setMode] = useState<'wide' | 'narrow'>('wide');
  const [userZoom, setUserZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pickerShape, setPickerShape] = useState<'ring' | 'square'>('ring');
  const [cursor, setCursor] = useState({ x: 0, y: 0, visible: false });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState<'tear' | 'color'>('tear');
  const [tearProgress, setTearProgress] = useState(0);
  const [showMask, setShowMask] = useState(false);
  const [fillCue, setFillCue] = useState(false);
  const [mergePieces, setMergePieces] = useState<{ first: string; second: string } | null>(null);
  const [merged, setMerged] = useState(false);
  const [finalUrl, setFinalUrl] = useState('');
  const [replayToken, setReplayToken] = useState(0);
  const paintRef = useRef<HTMLCanvasElement>(null);
  const artRef = useRef<HTMLCanvasElement>(null);
  const mergedRef = useRef<HTMLCanvasElement>(null);
  const debugRef = useRef<HTMLCanvasElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);
  const hueBarRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  const strokeRef = useRef<TwoHalvesStroke | null>(null);
  const history = useRef<ImageData[]>([]);
  const historyIndex = useRef(-1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; midpoint: Point; scale: number; pan: Point } | null>(null);
  const panning = useRef<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(null);
  const spaceHeld = useRef(false);
  const hovering = useRef(false);
  const barriersRef = useRef<Uint8Array>(new Uint8Array(0));
  const barrierDims = useRef({ w: 0, h: 0 });
  const fillSeq = useRef(0);
  const fillCueTimer = useRef(0);
  const pageImageRef = useRef<HTMLImageElement | null>(null);
  const halfCanvasesRef = useRef<Array<HTMLCanvasElement | null>>([null, null]);
  const renderSeq = useRef(0);
  const seamSeq = useRef(0);
  const mergeTimer = useRef(0);
  const finalUrlRef = useRef('');
  const [, setHistoryVersion] = useState(0);
  const solo = Boolean(game.solo);
  const mySide = game.players[0] === self ? 0 : 1;
  const activeSide = solo ? (game.activeSide ?? 0) : mySide;
  const seatId = game.players[activeSide];
  const partnerId = game.players[1 - activeSide];
  const me = players.find(player => player.id === self);
  const partner = players.find(player => player.id === partnerId);
  const myDone = Boolean(game.completed[seatId]);
  const partnerDone = Boolean(game.completed[partnerId]);
  const alpha = brushAlpha(tool, strength);
  const eyeDropper = typeof window === 'undefined' ? undefined : (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
  const playersKey = game.players.join('|');
  const halvesKey = game.players.map(id => (game.halves[id] ?? '').slice(-48)).join('|');

  const page = { width: pageDims.w, height: pageDims.h };
  const fit = fitScale(viewportSize, page);
  const displayScale = fit * userZoom;
  const origin = imageOrigin(viewportSize, page, displayScale, pan);
  const percentage = Math.round(userZoom * 100);
  const hueBarBackground = `linear-gradient(to bottom, ${[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360].map(degrees => hsvToHex({ h: degrees % 360, s: 1, v: 1 })).join(', ')})`;
  const ringBackground = `conic-gradient(from 0deg, ${Array.from({ length: 13 }, (_, index) => `${hsvToHex({ h: (index * 30) % 360, s: 1, v: 1 })} ${(index / 12) * 100}%`).join(', ')})`;
  const hueAngle = (hsv.h * Math.PI) / 180;
  const ringHandle = { x: 50 + Math.sin(hueAngle) * 50, y: 50 - Math.cos(hueAngle) * 50 };

  const zoomRef = useRef(userZoom);
  zoomRef.current = userZoom;
  const panRef = useRef(pan);
  panRef.current = pan;
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const pageRef = useRef(page);
  pageRef.current = page;
  const viewportSizeRef = useRef(viewportSize);
  viewportSizeRef.current = viewportSize;
  const splitRef = useRef(split);
  splitRef.current = split;

  const localJag = useMemo(() => makeJag(seedFromHex(game.page ?? 'two-halves')), [game.page]);
  const tearJag = game.tear?.jag ?? localJag;
  const tearStyle = game.tear?.style ?? settings.tear;
  const tearAxisJag = useMemo(() => (tearStyle === 'cut' ? tearJag.map(() => 0) : tearJag), [tearStyle, tearJag]);
  const seamJag = tearAxisJag;

  useEffect(() => { setHexDraft(color); }, [color]);

  const emitSettings = (patch: Partial<TwoHalvesSettings>) => socket.emit('twohalves:settings', patch);

  const applyHex = (value: string) => {
    const clean = normalizeHex(value);
    if (!clean) return;
    setHsv(current => hsvFromHexPreservingHue(clean, current));
  };
  const updateHex = (value: string) => {
    setHexDraft(value);
    if (/^#?[0-9a-f]{6}$/i.test(value)) applyHex(value);
  };
  const setChannel = (channel: 'r' | 'g' | 'b', value: string) => {
    if (!value.trim()) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    applyHex(rgbToHex({ ...rgb, [channel]: Math.round(clamp(parsed, 0, 255)) }));
  };
  const rememberColor = () => setRecent(list => [color, ...list.filter(value => value !== color)].slice(0, 12));
  const pickFromScreen = async () => {
    if (!eyeDropper) return;
    try {
      const picked = await new eyeDropper().open();
      applyHex(picked.sRGBHex);
      rememberColor();
    } catch { /* cancelled */ }
  };

  const pickSquare = (clientX: number, clientY: number) => {
    const square = squareRef.current;
    if (!square) return;
    const bounds = square.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = clamp((clientX - bounds.left) / bounds.width);
    const y = clamp((clientY - bounds.top) / bounds.height);
    setHsv(current => hsvFromSquare(x, y, current.h));
  };
  const pickHue = (clientY: number) => {
    const bar = hueBarRef.current;
    if (!bar) return;
    const bounds = bar.getBoundingClientRect();
    if (!bounds.height) return;
    setHsv(current => ({ ...current, h: hueFromHandle((clientY - bounds.top) / bounds.height) }));
  };
  const pickRing = (clientX: number, clientY: number) => {
    const ring = ringRef.current;
    if (!ring) return;
    const bounds = ring.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const nx = (clientX - bounds.left) / bounds.width - 0.5;
    const ny = (clientY - bounds.top) / bounds.height - 0.5;
    const inner = 0.29;
    if (Math.abs(nx) <= inner && Math.abs(ny) <= inner) {
      setHsv(current => hsvFromSquare(clamp((nx + inner) / (inner * 2)), clamp((ny + inner) / (inner * 2)), current.h));
      return;
    }
    const angle = (Math.atan2(nx, -ny) * 180) / Math.PI;
    setHsv(current => ({ ...current, h: (angle + 360) % 360 }));
  };
  const handleSquareKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.1 : 0.02;
    setHsv(current => ({
      ...current,
      s: clamp(current.s + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0)),
      v: clamp(current.v + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0)),
    }));
  };
  const handleHueKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 15 : 5;
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -step : step;
    setHsv(current => ({ ...current, h: (current.h + delta + 360) % 360 }));
  };

  const saveHistory = () => {
    const canvas = paintRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    history.current = history.current.slice(0, historyIndex.current + 1);
    history.current.push(context.getImageData(0, 0, canvas.width, canvas.height));
    historyIndex.current = history.current.length - 1;
    setHistoryVersion(value => value + 1);
  };
  const syncPaint = () => {
    const canvas = paintRef.current;
    if (canvas) socket.emit('twohalves:paint', { image: smallSnapshot(canvas, 0.8), side: activeSide });
  };
  const setFromHistory = (index: number) => {
    const canvas = paintRef.current;
    const context = canvas?.getContext('2d');
    const frame = history.current[index];
    if (!canvas || !context || !frame) return;
    context.putImageData(frame, 0, 0);
    historyIndex.current = index;
    setHistoryVersion(value => value + 1);
    syncPaint();
  };
  const undo = () => { if (historyIndex.current > 0) setFromHistory(historyIndex.current - 1); };
  const redo = () => { if (historyIndex.current < history.current.length - 1) setFromHistory(historyIndex.current + 1); };
  const clearHalf = () => {
    const canvas = paintRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || myDone) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    saveHistory();
    syncPaint();
  };

  /**
   * Exact opaque fill. Barriers come from the line-art mask only, so a region that
   * is already blue can be recoloured pink; the paint layer is never inspected.
   */
  const fill = (position: { x: number; y: number }) => {
    const paint = paintRef.current;
    if (!paint || !paint.width || !paint.height) return false;
    const paintContext = paint.getContext('2d');
    if (!paintContext) return false;
    const width = paint.width;
    const height = paint.height;
    const barriers = barriersRef.current;
    if (barriers.length !== width * height) { logDebug('fill skipped: mask size mismatch', barriers.length, width * height); return false; }
    const started = performance.now();
    try {
      const result = computeFill({
        width, height, barriers,
        seedX: Math.floor(position.x), seedY: Math.floor(position.y),
        expand: FILL_EXPAND, seedRadius: FILL_SEED_RADIUS,
      });
      if (!result) {
        logDebug('fill: no open pixel near tap', { seed: [Math.floor(position.x), Math.floor(position.y)] });
        setFillCue(true);
        window.clearTimeout(fillCueTimer.current);
        fillCueTimer.current = window.setTimeout(() => setFillCue(false), 700);
        return false;
      }
      const image = paintContext.getImageData(0, 0, width, height);
      applyFill(image.data, result.mask, rgb.r, rgb.g, rgb.b);
      paintContext.putImageData(image, 0, 0);
      logDebug('fill', {
        seed: [result.seedX, result.seedY], snapped: result.snapped, region: result.region,
        color, tool, ms: Math.round(result.ms), totalMs: Math.round(performance.now() - started),
        mask: [width, height], canvas: [paint.width, paint.height], alpha: paintContext.globalAlpha,
      });
      return true;
    } finally {
      paintContext.globalAlpha = 1;
      paintContext.globalCompositeOperation = 'source-over';
      paintContext.shadowBlur = 0;
    }
  };

  /* ---------------------------------------------------------------- layout */

  useEffect(() => {
    if (game.phase !== 'coloring') return;
    setStage('tear');
    setUserZoom(1);
    setPan({ x: 0, y: 0 });
  }, [game.page, game.phase]);

  useEffect(() => {
    if (game.phase === 'coloring') setStage('tear');
  }, [split, settings.tear]);

  /* ------------------------------------------------------------------ tear */

  useEffect(() => {
    if (game.phase !== 'coloring') return;
    if (stage !== 'tear') return;
    const tear = game.tear;
    if (!tear) { setTearProgress(0); return; }
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    if (tear.style === 'none' || reduce) { setTearProgress(1); return; }
    let frame = 0;
    const tick = () => {
      const next = Math.min(1, Math.max(0, (Date.now() - tear.startAt) / TEAR_DURATION_MS));
      setTearProgress(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [game.phase, stage, game.tear?.startAt, game.tear?.style]);

  const triggerTear = () => {
    if (game.tear || stage !== 'tear') return;
    const seed = (seedFromHex(game.page ?? 'two-halves') ^ Date.now()) >>> 0;
    socket.emit('twohalves:tear', { style: settings.tear, jag: makeJag(seed), jag2: makeJag(seed ^ 0x9e3779b9) });
  };

  /* ---------------------------------------------------------- page loading */

  useEffect(() => {
    // The studio canvases only exist once the tear stage is finished, so this must
    // re-run when the stage flips or the canvas mounts with no image in it.
    if (!game.page || game.phase !== 'coloring' || stage !== 'color') return;
    let live = true;
    setReady(false);
    void Promise.all([
      imageFrom(game.page),
      game.halves[seatId] ? imageFrom(game.halves[seatId]) : Promise.resolve(null),
    ]).then(([loadedPage, saved]) => {
      const paint = paintRef.current;
      const art = artRef.current;
      if (!live || !paint || !art) return;
      const vertical = splitRef.current === 'vertical';
      const halfWidth = vertical ? Math.max(2, Math.round(loadedPage.width / 2)) : loadedPage.width;
      const halfHeight = vertical ? loadedPage.height : Math.max(2, Math.round(loadedPage.height / 2));
      const sourceX = vertical ? (activeSide === 0 ? 0 : loadedPage.width - halfWidth) : 0;
      const sourceY = vertical ? 0 : (activeSide === 0 ? 0 : loadedPage.height - halfHeight);
      paint.width = art.width = halfWidth;
      paint.height = art.height = halfHeight;
      const paintContext = paint.getContext('2d');
      const artContext = art.getContext('2d');
      if (!paintContext || !artContext) return;
      paintContext.globalAlpha = 1;
      paintContext.globalCompositeOperation = 'source-over';
      paintContext.clearRect(0, 0, halfWidth, halfHeight);
      if (saved) paintContext.drawImage(saved, 0, 0, halfWidth, halfHeight);
      artContext.clearRect(0, 0, halfWidth, halfHeight);
      artContext.drawImage(loadedPage, sourceX, sourceY, halfWidth, halfHeight, 0, 0, halfWidth, halfHeight);
      setPhotoPage(makeLineArt(art) > 0.45);
      // Barriers are built ONCE per half, from the line-art layer, at the canvas's
      // own internal resolution — never from clientWidth or devicePixelRatio.
      const raw = buildBarriers(artContext.getImageData(0, 0, halfWidth, halfHeight).data, halfWidth, halfHeight, BARRIER_ALPHA, BARRIER_LUMINANCE);
      const closed = dilateBarriers(raw, halfWidth, halfHeight, BARRIER_DILATE);
      barriersRef.current = closed;
      barrierDims.current = { w: halfWidth, h: halfHeight };
      logDebug('half ready', {
        split: splitRef.current, side: mySide, canvas: [halfWidth, halfHeight],
        barriers: closed.length, ink: Math.round((closed.reduce((sum, value) => sum + value, 0) / closed.length) * 100),
        maskMatchesCanvas: closed.length === halfWidth * halfHeight,
      });
      history.current = [paintContext.getImageData(0, 0, halfWidth, halfHeight)];
      historyIndex.current = 0;
      setPageDims({ w: halfWidth, h: halfHeight });
      setHistoryVersion(value => value + 1);
      setReady(true);
      if (!saved) socket.emit('twohalves:paint', { image: smallSnapshot(paint, 0.8), side: activeSide });
    }).catch(() => {});
    return () => { live = false; };
  }, [game.page, game.phase, activeSide, self, socket, split, stage]);

  useEffect(() => {
    if (!DEBUG) return;
    if (!showMask) return;
    const canvas = debugRef.current;
    const barriers = barriersRef.current;
    const dims = barrierDims.current;
    if (!canvas || !barriers.length || !dims.w) return;
    canvas.width = dims.w;
    canvas.height = dims.h;
    const context = canvas.getContext('2d');
    if (!context) return;
    const image = context.createImageData(dims.w, dims.h);
    for (let index = 0; index < barriers.length; index++) {
      if (!barriers[index]) continue;
      const offset = index * 4;
      image.data[offset] = 255;
      image.data[offset + 1] = 40;
      image.data[offset + 2] = 120;
      image.data[offset + 3] = 165;
    }
    context.putImageData(image, 0, 0);
  }, [showMask, ready, pageDims.w, pageDims.h]);

  useEffect(() => {
    // The workspace is not mounted until the tear stage is done, so this has to
    // (re)attach when the studio appears — otherwise the layout mode is frozen.
    if (game.phase !== 'coloring' || stage !== 'color') return;
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const measure = (width: number) => { if (width > 0) setMode(width >= 900 ? 'wide' : 'narrow'); };
    measure(workspace.clientWidth);
    const observer = new ResizeObserver(entries => {
      measure(entries[0]?.contentRect.width ?? workspace.clientWidth);
    });
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [game.phase, stage]);

  useEffect(() => {
    if (game.phase !== 'coloring' || stage !== 'color') return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => {
      const rect = viewport.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setViewportSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, [game.phase, stage, mode]);

  useEffect(() => {
    if (displayScale <= 0) return;
    setPan(current => {
      const next = clampPan(current, viewportSize, page, displayScale);
      return next.x === current.x && next.y === current.y ? current : next;
    });
  }, [viewportSize.width, viewportSize.height, pageDims.w, pageDims.h, displayScale]);

  const applyZoomAt = (nextZoom: number, anchor: Point) => {
    const viewport = viewportSizeRef.current;
    const pageNow = pageRef.current;
    const currentFit = fitRef.current;
    if (!currentFit || !pageNow.width) return;
    const next = clampZoom(nextZoom);
    const fromScale = currentFit * zoomRef.current;
    const toScale = currentFit * next;
    setPan(panToPoint(viewport, pageNow, fromScale, toScale, anchor, panRef.current));
    setUserZoom(next);
  };
  const applyZoomRef = useRef(applyZoomAt);
  applyZoomRef.current = applyZoomAt;
  const centreAnchor = () => ({ x: viewportSizeRef.current.width / 2, y: viewportSizeRef.current.height / 2 });
  const resetView = () => { setUserZoom(1); setPan({ x: 0, y: 0 }); };
  const actualSize = () => {
    const currentFit = fitRef.current;
    setUserZoom(currentFit > 0 ? clampZoom(1 / currentFit) : 1);
    setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    if (game.phase !== 'coloring' || stage !== 'color') return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      const viewportNow = viewportSizeRef.current;
      const pageNow = pageRef.current;
      const currentFit = fitRef.current;
      if (!pageNow.width || !currentFit) return;
      const rect = viewport.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const factor = Math.exp(-event.deltaY * 0.0015);
        const nextZoom = clampZoom(zoomRef.current * factor);
        const fromScale = currentFit * zoomRef.current;
        const toScale = currentFit * nextZoom;
        setPan(panToPoint(viewportNow, pageNow, fromScale, toScale, anchor, panRef.current));
        setUserZoom(nextZoom);
        return;
      }
      if (zoomRef.current > 1) {
        event.preventDefault();
        setPan(current => clampPan({ x: current.x - event.deltaX, y: current.y - event.deltaY }, viewportNow, pageNow, currentFit * zoomRef.current));
      }
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [game.phase, stage, mode]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceHeld.current = true;
        if (hovering.current) event.preventDefault();
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || !hovering.current) return;
      if (event.key === '+' || event.key === '=') { event.preventDefault(); applyZoomRef.current(clampZoom(zoomRef.current * 1.25), centreAnchor()); }
      else if (event.key === '-') { event.preventDefault(); applyZoomRef.current(clampZoom(zoomRef.current / 1.25), centreAnchor()); }
      else if (event.key === '0') { event.preventDefault(); applyZoomRef.current(1, centreAnchor()); }
    };
    const onKeyUp = (event: globalThis.KeyboardEvent) => { if (event.code === 'Space') spaceHeld.current = false; };
    const onBlur = () => { spaceHeld.current = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur); };
  }, []);

  /* --------------------------------------------------------- merge + seam */

  useEffect(() => {
    if (game.phase !== 'complete' || !game.page) return;
    let live = true;
    const sequence = ++renderSeq.current;
    window.clearTimeout(mergeTimer.current);
    setMerged(false);
    setFinalUrl('');
    setMergePieces(null);
    void Promise.all([
      imageFrom(game.page),
      ...game.players.map(id => (game.halves[id] ? imageFrom(game.halves[id]) : Promise.resolve(null))),
    ]).then(([loadedPage, ...halves]) => {
      if (!live || sequence !== renderSeq.current) return;
      pageImageRef.current = loadedPage;
      const vertical = splitRef.current === 'vertical';
      const width = vertical ? Math.max(2, Math.round(loadedPage.width / 2)) : loadedPage.width;
      const height = vertical ? loadedPage.height : Math.max(2, Math.round(loadedPage.height / 2));
      halfCanvasesRef.current = halves.map((half, index) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return null;
        context.fillStyle = '#fff';
        context.fillRect(0, 0, width, height);
        if (half) context.drawImage(half, 0, 0, width, height);
        context.globalCompositeOperation = 'multiply';
        context.drawImage(
          loadedPage,
          vertical ? index * width : 0, vertical ? 0 : index * height, width, height,
          0, 0, width, height,
        );
        context.globalCompositeOperation = 'source-over';
        return canvas;
      });
      setMergePieces({
        first: halfCanvasesRef.current[0]?.toDataURL('image/png') ?? '',
        second: halfCanvasesRef.current[1]?.toDataURL('image/png') ?? '',
      });
      if (settings.merge === 'skip') { setMerged(true); return; }
      mergeTimer.current = window.setTimeout(() => { if (live && sequence === renderSeq.current) setMerged(true); }, MERGE_DURATION_MS[settings.merge] + 600);
    }).catch(() => {});
    return () => { live = false; };
  }, [game.phase, game.page, playersKey, halvesKey, split, settings.merge, replayToken]);

  useEffect(() => {
    if (!merged) return;
    const canvas = mergedRef.current;
    const loadedPage = pageImageRef.current;
    const halves = halfCanvasesRef.current;
    if (!canvas || !loadedPage || !halves[0] || !halves[1]) return;
    const sequence = ++seamSeq.current;
    const width = loadedPage.width;
    const height = loadedPage.height;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    const vertical = split === 'vertical';
    const paintJoin = () => {
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      halves.forEach((half, index) => {
        if (half) context.drawImage(half, vertical ? index * half.width : 0, vertical ? 0 : index * half.height);
      });
      context.restore();
    };
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const duration = reduce ? 0 : SEAM_DURATION_MS;
    const started = performance.now();
    let frame = 0;
    const render = (progress: number) => {
      if (sequence !== seamSeq.current) return;
      // ONE canvas: the no-seam version, then the seam clipped to a growing rect.
      paintJoin();
      context.save();
      context.beginPath();
      if (vertical) context.rect(0, 0, width, height * progress + 2);
      else context.rect(0, 0, width * progress + 2, height);
      context.clip();
      drawSeamOverlay(context, split, settings.seam, settings.seamColor, seamJag, width, height, seedFromHex(game.page ?? 'two-halves'));
      context.restore();
      if (progress > 0 && progress < 1) {
        const front = frontPoint(seamPath(split, seamJag), progress);
        const radius = Math.max(6, Math.max(width, height) * 0.012);
        context.save();
        context.globalCompositeOperation = 'lighter';
        const glow = context.createRadialGradient(front.x * width, front.y * height, 0, front.x * width, front.y * height, radius * 2.4);
        glow.addColorStop(0, 'rgba(255,244,190,.95)');
        glow.addColorStop(0.45, 'rgba(255,214,102,.35)');
        glow.addColorStop(1, 'rgba(255,214,102,0)');
        context.fillStyle = glow;
        context.beginPath();
        context.arc(front.x * width, front.y * height, radius * 2.4, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    };
    const finish = () => {
      const data = canvas.toDataURL('image/png');
      finalUrlRef.current = data;
      setFinalUrl(data);
    };
    if (duration === 0) { render(1); finish(); return; }
    const step = () => {
      if (sequence !== seamSeq.current) return;
      const elapsed = (performance.now() - started) / duration;
      const progress = Math.min(1, Math.max(0, elapsed));
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      render(eased);
      if (progress < 1) frame = requestAnimationFrame(step);
      else finish();
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [merged, settings.seam, settings.seamColor, split, seamJag, game.page, replayToken]);

  const replay = () => {
    setFinalUrl('');
    finalUrlRef.current = '';
    setMerged(false);
    setMergePieces(null);
    setReplayToken(value => value + 1);
  };

  useEffect(() => () => {
    window.clearTimeout(mergeTimer.current);
    window.clearTimeout(fillCueTimer.current);
  }, []);

  /* ------------------------------------------------------------- actions */

  const startPage = async (file?: File) => {
    setError('');
    setBusy(true);
    try {
      if (file) {
        if (!file.type.startsWith('image/')) { setError('That file is not an image. Choose a PNG, JPG or WebP.'); return; }
        if (file.size > MAX_UPLOAD_BYTES) { setError('That picture is larger than 10 MB. Please choose a smaller one.'); return; }
      }
      const loaded = file ? await loadImageSource(file) : { source: await imageFrom(samplePage), width: 1040, height: 720 };
      let scale = Math.min(1, MAX_PAGE_WIDTH / loaded.width, MAX_PAGE_HEIGHT / loaded.height);
      let data = '';
      // Very detailed photos cannot reach the page cap at full size, so shrink and
      // retry instead of refusing the upload. This keeps every page under the
      // socket payload limit while preserving the old working dimensions.
      for (let attempt = 0; attempt < 6; attempt += 1) {
        let width = Math.max(2, Math.round(loaded.width * scale));
        if (width % 2) width += 1;
        const height = Math.max(2, Math.round(loaded.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.drawImage(loaded.source, 0, 0, width, height);
        let quality = 0.78;
        data = canvas.toDataURL('image/jpeg', quality);
        while (data.length > MAX_PAGE_CHARS && quality > 0.35) { quality -= 0.08; data = canvas.toDataURL('image/jpeg', quality); }
        if (data.length <= MAX_PAGE_CHARS) break;
        scale *= 0.75;
      }
      if (data.length > MAX_PAGE_CHARS) { setError('This picture is too detailed to share. Please choose a simpler or smaller image.'); return; }
      socket.emit('twohalves:page', { page: data });
    } catch { setError('That image could not be opened. Try a PNG or JPG.'); }
    finally { setBusy(false); }
  };

  const point = (event: { clientX: number; clientY: number }) => {
    const canvas = paintRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
  };
  const cursorAt = (event: { clientX: number; clientY: number }) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    setCursor({ x: event.clientX - rect.left, y: event.clientY - rect.top, visible: true });
  };
  const cancelStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    strokeRef.current = null;
    const canvas = paintRef.current;
    const context = canvas?.getContext('2d');
    const frame = history.current[historyIndex.current];
    if (canvas && context && frame) context.putImageData(frame, 0, 0);
  };
  const beginPinch = () => {
    const viewport = viewportRef.current;
    const points = [...pointers.current.values()];
    if (!viewport || points.length < 2) return;
    const rect = viewport.getBoundingClientRect();
    const [a, b] = points;
    pinch.current = {
      distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      midpoint: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top },
      scale: displayScale,
      pan,
    };
  };
  const updatePinch = () => {
    const gesture = pinch.current;
    const viewport = viewportRef.current;
    const points = [...pointers.current.values()];
    if (!gesture || !viewport || points.length < 2) return;
    const pageNow = pageRef.current;
    const viewportNow = viewportSizeRef.current;
    const currentFit = fitRef.current;
    if (!pageNow.width || !currentFit) return;
    const rect = viewport.getBoundingClientRect();
    const [a, b] = points;
    const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const midpoint = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
    const nextScale = Math.min(currentFit * 8, Math.max(currentFit * 0.25, gesture.scale * (distance / gesture.distance)));
    const imagePoint = pointerToPage(viewportNow, pageNow, gesture.scale, gesture.pan, gesture.midpoint);
    const nextPan = clampPan({
      x: midpoint.x - imagePoint.x * nextScale - (viewportNow.width - pageNow.width * nextScale) / 2,
      y: midpoint.y - imagePoint.y * nextScale - (viewportNow.height - pageNow.height * nextScale) / 2,
    }, viewportNow, pageNow, nextScale);
    setUserZoom(clampZoom(nextScale / currentFit));
    setPan(nextPan);
  };

  const down = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    if (!ready || myDone || game.paused || !pageDims.w) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) {
      cancelStroke();
      canvas.setPointerCapture(event.pointerId);
      beginPinch();
      return;
    }
    if (spaceHeld.current || event.button === 1 || tool === 'hand') {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      panning.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    cursorAt(event);
    const position = point(event);
    if (tool === 'fill') {
      if (fill(position)) {
        const sequence = ++fillSeq.current;
        socket.emit('twohalves:fill', {
          id: `${self}:${sequence}`, seq: sequence,
          x: position.x / canvas.width, y: position.y / canvas.height, color,
        });
        saveHistory();
        syncPaint();
        rememberColor();
      }
      return;
    }
    const lineWidth = Math.max(1, size);
    const stroke: TwoHalvesStroke = {
      tool: tool as TwoHalvesStroke['tool'],
      color,
      size: lineWidth / canvas.width,
      alpha,
      points: [{ x: position.x / canvas.width, y: position.y / canvas.height }],
    };
    strokeRef.current = stroke;
    lastPoint.current = position;
    const context = canvas.getContext('2d');
    if (!context) return;
    drawing.current = true;
    configureBrush(context, stroke, canvas.width);
    if (tool === 'glitter') star(context, position.x, position.y, Math.max(4, lineWidth * (0.5 + Math.random())));
    else {
      context.beginPath();
      context.moveTo(position.x, position.y);
      context.lineTo(position.x + 0.01, position.y + 0.01);
      context.stroke();
    }
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) { updatePinch(); return; }
    const gesture = panning.current;
    if (gesture && gesture.pointerId === event.pointerId) {
      setPan(clampPan({ x: gesture.panX + (event.clientX - gesture.startX), y: gesture.panY + (event.clientY - gesture.startY) }, viewportSize, page, displayScale));
      return;
    }
    if (event.pointerType !== 'touch') cursorAt(event);
    const stroke = strokeRef.current;
    if (!drawing.current || !stroke) return;
    if (!canvas.hasPointerCapture(event.pointerId)) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const position = point(event);
    const normalized = { x: position.x / canvas.width, y: position.y / canvas.height };
    const previous = stroke.points[stroke.points.length - 1];
    if (Math.hypot(normalized.x - previous.x, normalized.y - previous.y) > 0.002 && stroke.points.length < 480) stroke.points.push(normalized);
    if (tool === 'glitter') {
      const steps = Math.max(1, Math.ceil(Math.hypot(position.x - lastPoint.current.x, position.y - lastPoint.current.y) / Math.max(stroke.size * canvas.width, 5)));
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const x = lastPoint.current.x + (position.x - lastPoint.current.x) * t + (Math.random() - 0.5) * stroke.size * canvas.width * 2;
        const y = lastPoint.current.y + (position.y - lastPoint.current.y) * t + (Math.random() - 0.5) * stroke.size * canvas.width * 2;
        star(context, x, y, 2 + Math.random() * stroke.size * canvas.width * 0.7);
      }
    } else {
      context.beginPath();
      context.moveTo(lastPoint.current.x, lastPoint.current.y);
      context.lineTo(position.x, position.y);
      context.stroke();
    }
    lastPoint.current = position;
  };
  const up = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (panning.current?.pointerId === event.pointerId) panning.current = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (drawing.current) {
      drawing.current = false;
      const context = canvas.getContext('2d');
      if (context) { context.globalAlpha = 1; context.globalCompositeOperation = 'source-over'; context.shadowBlur = 0; }
    }
    const stroke = strokeRef.current;
    strokeRef.current = null;
    if (!stroke) return;
    socket.emit('twohalves:stroke', stroke);
    saveHistory();
    syncPaint();
    rememberColor();
  };
  const download = () => {
    const url = finalUrlRef.current || mergedRef.current?.toDataURL('image/png');
    if (!url) return;
    const link = document.createElement('a');
    link.download = 'our-two-halves-masterpiece.png';
    link.href = url;
    link.click();
  };
  const exit = () => socket.emit('twohalves:back');
  const displayPercent = `${percentage}%`;
  const tearHint = settings.tear === 'rip' ? 'A soft, hand-torn edge with a paper fringe.'
    : settings.tear === 'cut' ? 'A clean, straight slice down the middle.'
      : 'No animation — the halves simply start apart.';

  return <section className="twohalves-screen">
    <header className="twohalves-header"><button className="twohalves-back" onClick={exit}>← Lobby</button><div className="twohalves-title"><span>◐</span><b>Two Halves</b><small>A coloring date for two</small></div><span className="twohalves-step">{game.phase === 'page' ? '01 · PICK A PAGE' : game.phase === 'complete' ? '04 · YOUR MASTERPIECE' : stage === 'tear' ? '02 · TEAR THE PAGE' : '03 · MAKE IT YOURS'}</span></header>
    {game.paused && <p className="twohalves-wait" role="status">Waiting for your person to reconnect…</p>}
    {game.phase === 'page' && <main className="twohalves-welcome"><div className="twohalves-copy"><span className="twohalves-kicker">A LITTLE ART DATE</span><h1>Two hands.<br />One <em>masterpiece.</em></h1><p>Pick a coloring page, split it down the middle, and paint your own side. Then bring them together and see what you made.</p><div className="twohalves-page-actions"><button className="twohalves-primary" disabled={busy} onClick={() => void startPage()}>{busy ? 'Getting things ready…' : 'Try our little page ✦'}</button><label className="twohalves-upload">Upload any picture<input type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) void startPage(file); event.target.value = ''; }} /></label></div>{error && <div className="twohalves-upload-error" role="alert">{error}</div>}<small>Any picture your browser can open · under 10 MB before resizing</small></div><div className="twohalves-preview-card"><div className="twohalves-sample-art"><img src={samplePage} alt="A line drawing of a smiling sun" /><i /><span>YOUR PAGE, IN TWO</span></div><div className="twohalves-pair"><span>{me?.name ?? 'You'} <b>{split === 'vertical' ? 'left half' : 'top half'}</b></span><span>{partner?.name ?? 'Your person'} <b>{split === 'vertical' ? 'right half' : 'bottom half'}</b></span></div></div></main>}

    {game.phase === 'coloring' && stage === 'tear' && game.page && <main className="twohalves-tear">
      <div className="twohalves-tear-copy">
        <span className="twohalves-kicker">STEP 02 · THE TEAR</span>
        <h1>{game.tear ? (game.tear.by === self ? 'You tore the page.' : `${partner?.name ?? 'Your person'} is tearing the page…`) : 'How shall we tear it?'}</h1>
        <p>{game.tear ? 'Both screens show the same jagged edge. When it settles, start coloring.' : tearHint}</p>
        <div className="twohalves-setting-group" role="group" aria-label="Split direction"><span>SPLIT</span>{splitOptions.map(option => <button type="button" key={option.id} className={split === option.id ? 'active' : ''} aria-pressed={split === option.id} onClick={() => emitSettings({ split: option.id })}>{option.label}</button>)}</div>
        <div className="twohalves-setting-group" role="group" aria-label="Tear style"><span>TEAR</span>{tearOptions.map(option => <button type="button" key={option.id} className={settings.tear === option.id ? 'active' : ''} aria-pressed={settings.tear === option.id} onClick={() => emitSettings({ tear: option.id })}>{option.label}</button>)}</div>
        {!game.tear
          ? <button className="twohalves-primary" onClick={triggerTear} disabled={game.paused}>Tear it ✂</button>
          : tearProgress >= 1
            ? <button className="twohalves-primary" onClick={() => setStage('color')}>Start coloring →</button>
            : <p className="twohalves-tear-wait" role="status">Tearing…</p>}
      </div>
      <div className="twohalves-tear-figure">
        <div className="twohalves-tear-stage" data-axis={split} data-open={tearProgress >= 1} data-ripping={tearProgress > 0 && tearProgress < 1}>
          <img className="twohalves-sizer" src={game.page} alt="" aria-hidden="true" />
          {(['first', 'second'] as const).map(side => {
            const outer = tearPolygon(split, side, tearAxisJag, tearProgress);
            const inner = tearPolygon(split, side, tearAxisJag, tearProgress, settings.tear === 'cut' ? 0 : 0.4);
            return <div className="twohalves-piece" data-side={side} key={side} style={{ clipPath: toClipPath(outer) }}>
              <img src={game.page} alt="" style={{ clipPath: toClipPath(inner) }} />
            </div>;
          })}
        </div>
      </div>
    </main>}

    {game.phase === 'coloring' && stage === 'color' && game.page && <main className="twohalves-studio" data-mode={mode} ref={workspaceRef}>
      <nav className="twohalves-toolrail" aria-label="Drawing tools">{toolList.map(item => <button type="button" key={item.id} className={tool === item.id ? 'active' : ''} aria-label={item.label} title={item.label} aria-pressed={tool === item.id} onClick={() => { setTool(item.id); setPaletteOpen(false); }}><span>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="twohalves-canvas-column">
        <div className="twohalves-studio-heading"><div><span className="twohalves-kicker">{solo ? (activeSide === 0 ? 'FIRST HALF' : 'SECOND HALF') : 'YOUR HALF'} · {me?.name ?? 'YOU'}</span><h1>{myDone ? 'Your half is ready!' : 'Make it yours.'}</h1></div><p>{partnerDone ? (solo ? 'The other half is finished ✦' : `${partner?.name ?? 'Your person'} finished their half ✦`) : solo ? 'Finish this half, then paint the other one.' : 'Your person is making the other half.'}</p><div className="twohalves-doodle-pair" aria-label="Players coloring together"><div className="twohalves-doodle-player"><GameDoodle id={playerDoodleId(players, me)} expression={myDone ? 'celebrating' : 'happy'} playing={!myDone} seed={`${self}:${myDone}`} size={54} name={me?.name} /><span>{me?.name ?? 'You'}</span></div><span className="twohalves-doodle-heart" aria-hidden="true">♡</span><div className="twohalves-doodle-player"><GameDoodle id={playerDoodleId(players, partner)} expression={partnerDone ? 'celebrating' : 'thinking'} playing={!partnerDone} seed={`${partnerId}:${partnerDone}`} size={54} flip name={partner?.name} /><span>{partner?.name ?? 'Your person'}</span></div></div></div>
        <div
          className="twohalves-canvas-viewport"
          ref={viewportRef}
          data-tool={tool}
          onPointerEnter={() => { hovering.current = true; }}
          onPointerLeave={() => { hovering.current = false; setCursor(current => ({ ...current, visible: false })); }}
        >
          <div
            className="twohalves-canvas-stack"
            style={{ width: `${pageDims.w}px`, height: `${pageDims.h}px`, transform: `translate(${origin.x}px, ${origin.y}px) scale(${displayScale})`, visibility: displayScale > 0 ? 'visible' : 'hidden' }}
          >
            <canvas
              ref={paintRef}
              aria-label={ready ? 'Color only your half of the page' : 'Loading your half of the page'}
              style={{ imageRendering: displayScale > 2 ? 'pixelated' : 'auto' }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            />
            <canvas ref={artRef} className="twohalves-line-art" aria-hidden="true" style={{ imageRendering: displayScale > 2 ? 'pixelated' : 'auto' }} />
            {DEBUG && <canvas ref={debugRef} className="twohalves-debug-mask" aria-hidden="true" style={{ display: showMask ? 'block' : 'none', imageRendering: displayScale > 2 ? 'pixelated' : 'auto' }} />}
            {myDone && <span className="twohalves-done-stamp">✓ YOUR HALF IS READY</span>}
          </div>
          {cursor.visible && tool !== 'hand' && <span
            className="twohalves-brush-cursor"
            aria-hidden="true"
            style={{ left: `${cursor.x}px`, top: `${cursor.y}px`, width: `${Math.max(4, size * displayScale)}px`, height: `${Math.max(4, size * displayScale)}px`, borderColor: tool === 'fill' ? color : '#fff' }}
          />}
          {fillCue && <span className="twohalves-fill-cue" role="status">Tap inside a shape</span>}
        </div>
        <div className="twohalves-history">
          <div className="twohalves-zoom" role="group" aria-label="Zoom controls">
            <button type="button" onClick={() => applyZoomAt(clampZoom(userZoom / 1.5), centreAnchor())} aria-label="Zoom out">−</button>
            <output aria-live="polite" aria-label="Zoom level">{displayPercent}</output>
            <button type="button" onClick={() => applyZoomAt(clampZoom(userZoom * 1.5), centreAnchor())} aria-label="Zoom in">+</button>
            <button type="button" onClick={() => resetView}>Fit</button>
            <button type="button" onClick={actualSize}>100%</button>
          </div>
          <button type="button" onClick={undo} disabled={historyIndex.current <= 0 || myDone}>↶ Undo</button>
          <button type="button" onClick={redo} disabled={historyIndex.current >= history.current.length - 1 || myDone}>↷ Redo</button>
          <button type="button" onClick={clearHalf} disabled={!ready || myDone}>Clear</button>
          {DEBUG && <button type="button" className={showMask ? 'active' : ''} aria-pressed={showMask} onClick={() => setShowMask(value => !value)}>Mask</button>}
          {mode === 'narrow' && <button type="button" className="twohalves-color-trigger" onClick={() => setPaletteOpen(true)}><span style={{ backgroundColor: color }} aria-hidden="true" />Color</button>}
          {solo && myDone && !partnerDone && <button type="button" className="twohalves-switch-half" onClick={() => socket.emit('twohalves:side', { side: activeSide === 0 ? 1 : 0 })}>Paint the other half →</button>}
          <button className="twohalves-done-button" disabled={!ready || game.paused || myDone} onClick={() => socket.emit('twohalves:complete', { side: activeSide })}>{myDone ? 'Half finished ✓' : 'Finish my half →'}</button>
        </div>
      </div>
      {mode === 'narrow' && paletteOpen && <button type="button" className="twohalves-drawer-backdrop" aria-label="Close colors" onClick={() => setPaletteOpen(false)} />}
      <aside className={`twohalves-palette-panel${paletteOpen ? ' open' : ''}`} aria-label="Colors and brushes">
        {mode === 'narrow' && <button type="button" className="twohalves-drawer-close" onClick={() => setPaletteOpen(false)} aria-label="Close colors">✕</button>}
        <div className="twohalves-current-color">
          <span className="twohalves-current-swatch" style={{ backgroundColor: color }} role="img" aria-label={`Current color ${color}`} />
          <div className="twohalves-color-fields">
            <input className="twohalves-hex-input" value={hexDraft} onChange={event => updateHex(event.target.value)} onBlur={() => setHexDraft(color)} aria-label="Hex color" maxLength={7} spellCheck={false} />
            <div className="twohalves-rgb-row">{(['r', 'g', 'b'] as const).map(channel => <label key={channel}><span>{channel.toUpperCase()}</span><input type="number" min={0} max={255} value={rgb[channel]} onChange={event => setChannel(channel, event.target.value)} aria-label={`${channel.toUpperCase()} channel`} /></label>)}</div>
          </div>
          {eyeDropper && <button type="button" className="twohalves-eyedropper" onClick={() => void pickFromScreen()} title="Pick a color from the page" aria-label="Pick a color from the page">⌖</button>}
          <div className="twohalves-brush-preview" aria-label={`Brush preview: ${color} at ${Math.round(alpha * 100)}% opacity`} title={`${tool} · ${Math.round(alpha * 100)}% opacity`}><span style={{ backgroundColor: color, opacity: tool === 'eraser' ? 1 : alpha }} /><small>{tool === 'eraser' ? 'erase' : tool === 'fill' ? 'fill' : `${Math.round(alpha * 100)}%`}</small></div>
        </div>
        <div className="twohalves-picker-mode" role="group" aria-label="Color picker shape">
          <button type="button" className={pickerShape === 'ring' ? 'active' : ''} aria-pressed={pickerShape === 'ring'} onClick={() => setPickerShape('ring')}>◯ Hue ring</button>
          <button type="button" className={pickerShape === 'square' ? 'active' : ''} aria-pressed={pickerShape === 'square'} onClick={() => setPickerShape('square')}>▤ Hue strip</button>
        </div>
        {pickerShape === 'ring' ? <div
          className="twohalves-hue-ring"
          ref={ringRef}
          style={{ background: ringBackground }}
          role="slider"
          tabIndex={0}
          aria-label="Hue ring with saturation and brightness square"
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={Math.round(hsv.h)}
          onKeyDown={handleHueKey}
          onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); pickRing(event.clientX, event.clientY); }}
          onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pickRing(event.clientX, event.clientY); }}
          onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        >
          <div className="twohalves-ring-square" style={{ background: `linear-gradient(to bottom, rgba(0,0,0,0), #000), linear-gradient(to right, #fff, ${pureHue})` }} aria-hidden="true">
            <span style={{ left: `${layout.markerX * 100}%`, top: `${layout.markerY * 100}%`, backgroundColor: color }} />
          </div>
          <span className="twohalves-ring-handle" style={{ left: `${ringHandle.x}%`, top: `${ringHandle.y}%`, backgroundColor: pureHue }} />
        </div> : <div className="twohalves-hue-picker twohalves-hue-picker-large twohalves-square-picker">
          <div className="twohalves-hue-square" ref={squareRef} style={{ background: `linear-gradient(to bottom, rgba(0,0,0,0), #000), linear-gradient(to right, #fff, ${pureHue})` }} role="slider" tabIndex={0} aria-label="Saturation and brightness" aria-valuetext={`Saturation ${Math.round(hsv.s * 100)} percent, brightness ${Math.round(hsv.v * 100)} percent`} data-color={colorAtSquare(layout.markerX, layout.markerY, hsv.h)} onKeyDown={handleSquareKey} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); pickSquare(event.clientX, event.clientY); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pickSquare(event.clientX, event.clientY); }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}><span style={{ left: `${layout.markerX * 100}%`, top: `${layout.markerY * 100}%`, backgroundColor: color }} /></div>
          <div className="twohalves-hue-bar" ref={hueBarRef} style={{ background: hueBarBackground }} role="slider" tabIndex={0} aria-label="Hue" aria-valuemin={0} aria-valuemax={359} aria-valuenow={Math.round(hsv.h)} onKeyDown={handleHueKey} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); pickHue(event.clientY); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pickHue(event.clientY); }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}><span style={{ top: `${layout.hueHandle * 100}%` }} /></div>
          <div><b>HUE · SATURATION · BRIGHTNESS</b><small>Hue on the strip, saturation across the square, brightness up</small><code>{color.toUpperCase()}</code></div>
        </div>}
        <div className="twohalves-brightness">
          <span><span>BRIGHTNESS</span><b>{Math.round(hsv.v * 100)}%</b></span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(hsv.v * 100)}
            aria-label="Brightness"
            style={{ background: `linear-gradient(to right, #000, ${hsvToHex({ ...hsv, v: 1 })})` }}
            onChange={event => { const v = Number(event.target.value) / 100; setHsv(current => ({ ...current, v })); }}
          />
        </div>
        {recent.length > 0 && <div className="twohalves-saved-colors" aria-label="Recent colors"><span>RECENT</span>{recent.map(value => <button type="button" key={value} style={{ backgroundColor: value }} aria-label={`Use recent color ${value}`} title={value} onClick={() => applyHex(value)} />)}</div>}
        <div className="twohalves-palette-tabs">{(Object.keys(palettes) as Palette[]).map(name => <button className={palette === name ? 'active' : ''} key={name} onClick={() => setPalette(name)}>{name}</button>)}</div>
        <div className="twohalves-mood-row" aria-label="Quick color moods"><span>MOOD</span>{moodPresets.map(mood => <button type="button" key={mood.name} className={palette === mood.palette && color === mood.color ? 'active' : ''} onClick={() => { setPalette(mood.palette); applyHex(mood.color); }}><i aria-hidden="true">{mood.icon}</i>{mood.name}</button>)}</div>
        <div className="twohalves-swatches" aria-label={`${palette} color palette`}>{palettes[palette].map(value => <button type="button" key={value} style={{ backgroundColor: value }} className={color === value ? 'selected' : ''} aria-label={`Choose ${value}`} onClick={() => applyHex(value)} />)}</div>
        <section className="twohalves-adjust"><label><span>BRUSH SIZE</span><b>{size}</b></label><input type="range" min="2" max="54" value={size} onChange={event => setSize(Number(event.target.value))} /><label><span>STRENGTH</span><b>{strength}</b></label><input type="range" min="10" max="100" value={strength} onChange={event => setStrength(Number(event.target.value))} /></section>
        <p className="twohalves-tool-hint">{tool === 'fill' ? (photoPage ? 'Fill works best on line art — this picture may fill a large area.' : 'Tap inside a shape to fill it with the active color.') : tool === 'hand' ? 'Drag to pan. Ctrl+wheel or pinch to zoom.' : tool === 'glitter' ? 'Paint a trail of tiny sparkles.' : tool === 'eraser' ? 'Erase your colors without touching the page.' : 'Choose a tool, pick a color, and paint.'}</p>
      </aside>
    </main>}

    {game.phase === 'complete' && game.page && <main className="twohalves-result">
      <span className="twohalves-kicker">MADE TOGETHER</span>
      <h1>Look what <em>you made.</em></h1>
      <p>Two different sides, one lovely little surprise.</p>
      <div className="twohalves-result-doodles" aria-label="You both finished the masterpiece"><GameDoodle id={playerDoodleId(players, me)} expression="celebrating" playing seed={`${self}:complete`} size={76} name={me?.name} /><span aria-hidden="true">✦</span><GameDoodle id={playerDoodleId(players, partner)} expression="celebrating" playing seed={`${partnerId}:complete`} size={76} flip name={partner?.name} /></div>
      <div className="twohalves-merge-frame">
        <div className="twohalves-merge" data-axis={split} data-anim={settings.merge} data-merged={merged || Boolean(finalUrl)} key={replayToken}>
          <img className="twohalves-sizer" src={game.page} alt="" aria-hidden="true" />
          {!merged && mergePieces && mergePieces.first && mergePieces.second && <>
            <img className="twohalves-merge-piece first" src={mergePieces.first} alt="" />
            <img className="twohalves-merge-piece second" src={mergePieces.second} alt="" />
          </>}
          <canvas ref={mergedRef} className="twohalves-merge-canvas" style={{ display: merged && !finalUrl ? 'block' : 'none' }} aria-label="Your merged coloring masterpiece" />
          {finalUrl && <img className="twohalves-merge-final" src={finalUrl} alt="Your merged coloring masterpiece" />}
        </div>
      </div>
      <section className="twohalves-finish-settings">
        <div className="twohalves-setting-group" role="group" aria-label="Merge animation"><span>MERGE</span>{mergeOptions.map(option => <button type="button" key={option.id} className={settings.merge === option.id ? 'active' : ''} aria-pressed={settings.merge === option.id} onClick={() => { emitSettings({ merge: option.id }); replay(); }}>{option.label}</button>)}</div>
        <div className="twohalves-setting-group" role="group" aria-label="Seam style"><span>SEAM</span>{seamOptions.map(option => <button type="button" key={option.id} className={settings.seam === option.id ? 'active' : ''} aria-pressed={settings.seam === option.id} onClick={() => emitSettings({ seam: option.id })}>{option.label}</button>)}{seamStyleUsesColor(settings.seam) && <label className="twohalves-seam-color"><input type="color" value={settings.seamColor} aria-label="Seam colour" onChange={event => emitSettings({ seamColor: event.target.value })} /><span>Seam colour</span></label>}</div>
      </section>
      <div className="twohalves-result-actions"><button className="twohalves-primary" onClick={download}>Download your masterpiece ↓</button><button className="twohalves-secondary" onClick={replay}>↻ Replay the merge</button><button className="twohalves-secondary" onClick={exit}>Back to our games</button></div>
    </main>}
  </section>;
}
