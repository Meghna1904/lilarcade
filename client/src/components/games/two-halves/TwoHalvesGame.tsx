import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ClientToServerEvents, RoomView, ServerToClientEvents, TwoHalvesView } from '@arcade/shared';
import type { Socket } from 'socket.io-client';
import { GameDoodle } from '../../../doodles/GameDoodle';
import { playerDoodleId } from '../../../doodles/playerDoodle';
import './two-halves.css';

type Props = { game: TwoHalvesView; self: string; players: RoomView['players']; socket: Socket<ServerToClientEvents, ClientToServerEvents> };
type Tool = 'pencil'|'marker'|'crayon'|'pastel'|'watercolor'|'brush'|'glitter'|'fill'|'eraser'|'move'|'colorwheel';
type Palette = 'Pencils'|'Watercolor'|'Pastel'|'Neon'|'Earth';
const WIDTH = 520;
const HEIGHT = 720;
const palettes: Record<Palette, string[]> = {
  Pencils: ['#111111','#3b3b3b','#666666','#999999','#cccccc','#f5f5f5','#5c3317','#8a431e','#bd641f','#e9b276','#ffd8a8','#d6336c','#c2255c','#ef4f00','#ff922b','#f59f00','#fcc419','#fff3bf','#82c91e','#2f9e44','#0ca678','#0c7285','#15aabf','#74c0fc','#228be6','#364fc7','#7048e8','#be4bdb','#f06595','#ffa8a8','#fa5252','#a9e34b','#63e6be','#20c997','#845ef7','#ff8787'],
  Watercolor: ['#3b2737','#533b4d','#76516a','#8a6573','#c08b94','#e5b2aa','#f3c5bd','#804b34','#a85d3a','#ba7149','#e19c6b','#f0c08b','#f8d7a2','#596b3c','#7a8b58','#a6b77b','#cccf9a','#e6e0b1','#486b78','#5a91a2','#8bc2c9','#b6ded8','#555c88','#7887b5','#a7b7d6','#d2d9e8','#835d9b','#ab80b7','#d1a3ce','#eed3e3','#9c6644','#b08968','#52796f','#84a98c','#6d6875','#e5989b'],
  Pastel: ['#fff0f0','#ffe3e3','#ffc9c9','#ffa8a8','#fcc2d7','#faa2c1','#f783ac','#eebefa','#e5dbff','#d0bfff','#bac8ff','#a5d8ff','#c5f6fa','#c3fae8','#d3f9d8','#d8f5a2','#e9fac8','#fff3bf','#ffec99','#ffe8cc','#ffd8a8','#ffdeeb','#f1f3f5','#e9ecef','#dee2e6','#fff','#f8f0fc','#e7f5ff','#e6fcf5','#fff9db','#fff4e6','#f3d9fa','#d0ebff','#c3fae8','#d8f5a2','#ffd8a8'],
  Neon: ['#ff0054','#ff006e','#f72585','#ff70a6','#ff99c8','#fb5607','#ff4d00','#ff7b00','#ffbe0b','#f9f871','#d0ff00','#caff00','#aaff00','#70e000','#00ff9f','#00f5d4','#80ffdb','#00f0ff','#48bfe3','#00bbf9','#3a86ff','#4361ee','#5e60ce','#7209b7','#8338ec','#b5179e','#e0aaff','#ff00ff','#ff3131','#ffea00','#39ff14','#7df9ff','#fe53bb','#adff2f','#bf00ff','#00ffff'],
  Earth: ['#1f1b16','#26231f','#463f3a','#5d5147','#8a7867','#b6a58f','#d6c6b2','#51372f','#754c37','#98694f','#c4926b','#e0a96d','#62543f','#87744f','#a59767','#c7b985','#35594b','#4e755b','#769477','#a8b899','#344955','#4a6671','#718b91','#9eb5b5','#5a4356','#806478','#a88b9d','#cdb8c2','#7f5539','#9c6644','#b08968','#52796f','#84a98c','#cad2c5','#6b705c','#cb997e'],
};
const samplePage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="720" viewBox="0 0 1040 720"><rect width="1040" height="720" fill="white"/><g fill="none" stroke="#292735" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M80 600c130-40 240-40 370 0s250 40 510 0M185 565c0-160 145-310 335-310s335 150 335 310M520 255V98m0 74c-80-110-210-95-207-8 2 70 110 103 207 8m0 55c77-108 200-94 198-10-2 70-105 99-198 10M273 433c28-48 78-48 106 0-30 48-78 48-106 0zm92 0h-78m375 0c28-48 78-48 106 0-30 48-78 48-106 0zm92 0h-78M416 498q104 80 208 0m-193-4 20 12m137-12-20 12M223 365l-46-28m640 28 46-28M320 292l-20-48m420 48 20-48"/><path d="M110 627q25-45 50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0"/></g><g fill="#292735"><circle cx="335" cy="425" r="8"/><circle cx="705" cy="425" r="8"/></g></svg>')}`;
const toolList: Array<{ id: Tool; icon: string; label: string }> = [
  { id: 'pencil', icon: '✎', label: 'Pencil' }, { id: 'marker', icon: '／', label: 'Marker' }, { id: 'crayon', icon: '╱', label: 'Crayon' },
  { id: 'pastel', icon: '▯', label: 'Pastel' }, { id: 'watercolor', icon: '♧', label: 'Watercolor' }, { id: 'brush', icon: '🖌', label: 'Brush' },
  { id: 'glitter', icon: '✧', label: 'Glitter' }, { id: 'fill', icon: '◈', label: 'Fill' }, { id: 'colorwheel', icon: '◉', label: 'Color wheel' }, { id: 'eraser', icon: '▱', label: 'Eraser' }, { id: 'move', icon: '✋', label: 'Pan / scroll' },
];
const moodPresets = [
  { name: 'Sunset', icon: '☼', palette: 'Pastel' as Palette, color: '#f06595' },
  { name: 'Ocean', icon: '≈', palette: 'Watercolor' as Palette, color: '#15aabf' },
  { name: 'Garden', icon: '✿', palette: 'Earth' as Palette, color: '#2f9e44' },
  { name: 'Electric', icon: '✦', palette: 'Neon' as Palette, color: '#00f5d4' },
];
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
function hueToHex(hue: number, saturation = 1, value = 1) {
  const c = value * saturation;
  const x = 1 - Math.abs((hue / 60) % 2 - 1);
  const m = value - c;
  const [red, green, blue] = hue < 60 ? [c + m, x * c + m, m] : hue < 120 ? [x * c + m, c + m, m] : hue < 180 ? [m, c + m, x * c + m] : hue < 240 ? [m, x * c + m, c + m] : hue < 300 ? [x * c + m, m, c + m] : [c + m, m, x * c + m];
  const toHex = (component: number) => Math.round(component * 255).toString(16).padStart(2, '0');
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

export function TwoHalvesGame({ game, self, players, socket }: Props) {
  const [color, setColor] = useState(palettes.Pencils[6]);
  const [palette, setPalette] = useState<Palette>('Pencils');
  const [tool, setTool] = useState<Tool>('pencil');
  const [size, setSize] = useState(6);
  const [strength, setStrength] = useState(85);
  const [zoom, setZoom] = useState(100);
  const [imageScale, setImageScale] = useState(100);
  const [hue, setHue] = useState(330);
  const [saturation, setSaturation] = useState(1);
  const [wheelPoint, setWheelPoint] = useState({ x: 50, y: 50 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const pageRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<HTMLCanvasElement>(null);
  const mergedRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  const panStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const hueWheelRef = useRef<HTMLDivElement>(null);
  const history = useRef<ImageData[]>([]);
  const historyIndex = useRef(-1);
  const [, setHistoryVersion] = useState(0);
  const mySide = game.players[0] === self ? 0 : 1;
  const partnerId = game.players[1 - mySide];
  const me = players.find(player => player.id === self);
  const partner = players.find(player => player.id === partnerId);
  const myDone = Boolean(game.completed[self]);
  const partnerDone = Boolean(game.completed[partnerId]);
  const chooseHue = (clientX: number, clientY: number) => {
    const wheel = hueWheelRef.current; if (!wheel) return;
    const bounds = wheel.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;
    const radius = Math.min(bounds.width, bounds.height) / 2;
    const distance = Math.min(Math.hypot(deltaX, deltaY), radius);
    const angle = Math.atan2(deltaY, deltaX);
    const nextHue = (Math.round((angle * 180 / Math.PI + 90 + 360) % 360) + 360) % 360;
    const nextSaturation = Math.max(0, Math.min(1, distance / radius));
    setHue(nextHue); setSaturation(nextSaturation); setWheelPoint({ x: 50 + (deltaX / radius) * 50, y: 50 + (deltaY / radius) * 50 }); setColor(hueToHex(nextHue, nextSaturation));
  };
  const handleHueKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -5 : 5;
    const nextHue = (hue + delta + 360) % 360;
    setHue(nextHue); setColor(hueToHex(nextHue, saturation));
  };

  const saveHistory = () => {
    const canvas = paintRef.current; const context = canvas?.getContext('2d'); if (!canvas || !context) return;
    history.current = history.current.slice(0, historyIndex.current + 1);
    history.current.push(context.getImageData(0, 0, WIDTH, HEIGHT)); historyIndex.current = history.current.length - 1;
    setHistoryVersion(value => value + 1);
  };
  const syncPaint = () => { const canvas = paintRef.current; if (canvas) socket.emit('twohalves:paint', { image: smallSnapshot(canvas, imageScale / 100) }); };
  const setFromHistory = (index: number) => {
    const canvas = paintRef.current; const context = canvas?.getContext('2d'); const frame = history.current[index]; if (!canvas || !context || !frame) return;
    context.putImageData(frame, 0, 0); historyIndex.current = index; setHistoryVersion(value => value + 1); syncPaint();
  };
  const undo = () => { if (historyIndex.current > 0) setFromHistory(historyIndex.current - 1); };
  const redo = () => { if (historyIndex.current < history.current.length - 1) setFromHistory(historyIndex.current + 1); };
  const clearHalf = () => { const canvas = paintRef.current; const context = canvas?.getContext('2d'); if (!canvas || !context || myDone) return; context.clearRect(0, 0, canvas.width, canvas.height); saveHistory(); syncPaint(); };

  useEffect(() => {
    if (!game.page || game.phase !== 'coloring') return;
    let live = true; setReady(false);
    void Promise.all([imageFrom(game.page), game.halves[self] ? imageFrom(game.halves[self]) : Promise.resolve(null)]).then(([page, saved]) => {
      const pageCanvas = pageRef.current; const paintCanvas = paintRef.current;
      const pageContext = pageCanvas?.getContext('2d'); const paintContext = paintCanvas?.getContext('2d');
      if (!live || !pageCanvas || !paintCanvas || !pageContext || !paintContext) return;
      pageCanvas.width = paintCanvas.width = WIDTH; pageCanvas.height = paintCanvas.height = HEIGHT;
      pageContext.fillStyle = '#fff'; pageContext.fillRect(0, 0, WIDTH, HEIGHT);
      pageContext.drawImage(page, mySide * page.width / 2, 0, page.width / 2, page.height, 0, 0, WIDTH, HEIGHT);
      paintContext.clearRect(0, 0, WIDTH, HEIGHT);
      if (saved) paintContext.drawImage(saved, 0, 0, WIDTH, HEIGHT);
      history.current = [paintContext.getImageData(0, 0, WIDTH, HEIGHT)]; historyIndex.current = 0;
      setHistoryVersion(value => value + 1); setReady(true);
      if (!saved) socket.emit('twohalves:paint', { image: smallSnapshot(paintCanvas) });
    }).catch(() => {});
    return () => { live = false; };
  }, [game.page, game.phase, mySide, self, socket]);

  useEffect(() => {
    if (game.phase !== 'complete' || !game.page) return;
    let live = true;
    void Promise.all([imageFrom(game.page), Promise.all(game.players.map(id => game.halves[id] ? imageFrom(game.halves[id]) : Promise.resolve(null)))]).then(([page, halves]) => {
      if (!live || !mergedRef.current) return;
      const canvas = mergedRef.current; const context = canvas.getContext('2d'); if (!context) return;
      canvas.width = WIDTH * 2; canvas.height = HEIGHT;
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(page, 0, 0, page.width, page.height, 0, 0, canvas.width, canvas.height);
      halves.forEach((half, index) => { if (half) context.drawImage(half, index * WIDTH, 0, WIDTH, HEIGHT); });
    }).catch(() => {});
    return () => { live = false; };
  }, [game.phase, game.page, game.players, game.halves]);

  const startPage = async (file?: File) => {
    setBusy(true);
    const objectUrl = file ? URL.createObjectURL(file) : undefined;
    try {
      if (file && (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024)) {
        window.alert('Please choose an image file under 10 MB.');
        return;
      }
      const source = file && objectUrl ? await imageFrom(objectUrl) : await imageFrom(samplePage);
      const scale = Math.min(1, 1200 / source.width, 900 / source.height);
      const canvas = document.createElement('canvas'); canvas.width = Math.round(source.width * scale); canvas.height = Math.round(source.height * scale);
      canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
      let quality = .78; let data = canvas.toDataURL('image/jpeg', quality);
      while (data.length > 320_000 && quality > .35) { quality -= .08; data = canvas.toDataURL('image/jpeg', quality); }
      if (data.length > 320_000) { window.alert('This picture is too detailed to share. Please choose a smaller image.'); return; }
      socket.emit('twohalves:page', { page: data });
    } catch { window.alert('That image could not be opened. Try a PNG or JPG.'); }
    finally { if (objectUrl) URL.revokeObjectURL(objectUrl); setBusy(false); }
  };
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * WIDTH / rect.width, y: (event.clientY - rect.top) * HEIGHT / rect.height };
  };
  const fill = (origin: { x: number; y: number }) => {
    const page = pageRef.current; const paint = paintRef.current; const paintContext = paint?.getContext('2d');
    const composite = document.createElement('canvas'); composite.width = WIDTH; composite.height = HEIGHT;
    const context = composite.getContext('2d'); if (!page || !paint || !paintContext || !context) return;
    context.drawImage(page, 0, 0); context.drawImage(paint, 0, 0);
    const image = context.getImageData(0, 0, WIDTH, HEIGHT); const pixels = image.data;
    const start = Math.max(0, Math.min(WIDTH - 1, Math.floor(origin.x))) + Math.max(0, Math.min(HEIGHT - 1, Math.floor(origin.y))) * WIDTH;
    const offset = start * 4; const seed = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    if ((seed[0] + seed[1] + seed[2]) / 3 < 110) return;
    const visited = new Uint8Array(WIDTH * HEIGHT); const queue = new Int32Array(WIDTH * HEIGHT); let head = 0; let tail = 0;
    queue[tail++] = start; visited[start] = 1;
    const tolerance = 60;
    while (head < tail) {
      const at = queue[head++]; const pixel = at * 4;
      if ((pixels[pixel] + pixels[pixel + 1] + pixels[pixel + 2]) / 3 < 105) continue;
      const delta = Math.abs(pixels[pixel] - seed[0]) + Math.abs(pixels[pixel + 1] - seed[1]) + Math.abs(pixels[pixel + 2] - seed[2]);
      if (delta > tolerance) continue;
      const x = at % WIDTH; const y = Math.floor(at / WIDTH);
      const neighbors = [x > 0 ? at - 1 : -1, x < WIDTH - 1 ? at + 1 : -1, y > 0 ? at - WIDTH : -1, y < HEIGHT - 1 ? at + WIDTH : -1];
      for (const next of neighbors) if (next >= 0 && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
    }
    const layer = paintContext.getImageData(0, 0, WIDTH, HEIGHT); const rgba = color.match(/[\da-f]{2}/gi)?.map(part => parseInt(part, 16)) ?? [0,0,0];
    const alpha = Math.round(strength * 2.55);
    for (let i = 0; i < tail; i++) { const at = queue[i]; if (!visited[at]) continue; const p = at * 4; if ((pixels[p] + pixels[p + 1] + pixels[p + 2]) / 3 < 105) continue; const d = Math.abs(pixels[p]-seed[0])+Math.abs(pixels[p+1]-seed[1])+Math.abs(pixels[p+2]-seed[2]); if (d > tolerance) continue; layer.data[p]=rgba[0];layer.data[p+1]=rgba[1];layer.data[p+2]=rgba[2];layer.data[p+3]=alpha; }
    paintContext.putImageData(layer, 0, 0); saveHistory(); syncPaint();
  };
  const down = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready || myDone || game.paused) return;
    const p = point(event); lastPoint.current = p;
    if (tool === 'move') {
      panStart.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
      return;
    }
    if (tool === 'colorwheel') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === 'fill') { fill(p); return; }
    const context = event.currentTarget.getContext('2d'); if (!context) return;
    drawing.current = true; context.beginPath(); context.moveTo(p.x, p.y); context.lineTo(p.x + .01, p.y + .01);
    context.strokeStyle = color; context.fillStyle = color; context.lineWidth = size; context.lineCap = tool === 'crayon' ? 'square' : 'round'; context.lineJoin = 'round';
    context.globalAlpha = strength / 100;
    if (tool === 'eraser') { context.globalCompositeOperation = 'destination-out'; context.lineWidth = size * 2; }
    if (tool === 'watercolor') context.globalAlpha *= .19;
    if (tool === 'pencil') context.globalAlpha *= .6;
    if (tool === 'pastel') { context.globalAlpha *= .72; context.shadowBlur = 4; context.shadowColor = color; }
    if (tool === 'glitter') star(context, p.x, p.y, Math.max(4, size * (.5 + Math.random())));
    else context.stroke();
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (panStart.current) { setOffset({ x: panStart.current.offsetX + event.clientX - panStart.current.x, y: panStart.current.offsetY + event.clientY - panStart.current.y }); return; }
    if (!drawing.current) return;
    const context = event.currentTarget.getContext('2d'); if (!context) return;
    const p = point(event);
    if (tool === 'glitter') {
      const steps = Math.max(1, Math.ceil(Math.hypot(p.x - lastPoint.current.x, p.y - lastPoint.current.y) / Math.max(size, 5)));
      for (let i = 0; i < steps; i++) { const t = i / steps; const x = lastPoint.current.x + (p.x - lastPoint.current.x) * t + (Math.random() - .5) * size * 2; const y = lastPoint.current.y + (p.y - lastPoint.current.y) * t + (Math.random() - .5) * size * 2; star(context, x, y, 2 + Math.random() * size * .7); }
    } else { context.beginPath(); context.moveTo(lastPoint.current.x, lastPoint.current.y); context.lineTo(p.x, p.y); context.stroke(); }
    lastPoint.current = p;
  };
  const up = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (panStart.current) { panStart.current = null; return; }
    if (!drawing.current) return;
    drawing.current = false;
    const context = event.currentTarget.getContext('2d'); if (context) { context.globalAlpha = 1; context.globalCompositeOperation = 'source-over'; context.shadowBlur = 0; }
    saveHistory(); syncPaint();
  };
  const download = () => { const canvas = mergedRef.current; if (!canvas) return; const link = document.createElement('a'); link.download = 'our-two-halves-masterpiece.png'; link.href = canvas.toDataURL('image/png'); link.click(); };
  const exit = () => socket.emit('twohalves:back');

  return <section className="twohalves-screen">
    <header className="twohalves-header"><button className="twohalves-back" onClick={exit}>← Lobby</button><div className="twohalves-title"><span>◐</span><b>Two Halves</b><small>A coloring date for two</small></div><span className="twohalves-step">{game.phase === 'page' ? '01 · PICK A PAGE' : game.phase === 'complete' ? '03 · YOUR MASTERPIECE' : '02 · MAKE IT YOURS'}</span></header>
    {game.paused && <p className="twohalves-wait" role="status">Waiting for your person to reconnect…</p>}
    {game.phase === 'page' && <main className="twohalves-welcome"><div className="twohalves-copy"><span className="twohalves-kicker">A LITTLE ART DATE</span><h1>Two hands.<br/>One <em>masterpiece.</em></h1><p>Pick a coloring page, split it down the middle, and paint your own side. Then bring them together and see what you made.</p><div className="twohalves-page-actions"><button className="twohalves-primary" disabled={busy} onClick={() => void startPage()}>{busy ? 'Getting things ready…' : 'Try our little page ✦'}</button><label className="twohalves-upload">Upload any picture<input type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) void startPage(file); event.target.value = ''; }}/></label></div><small>Any picture your browser can open · under 10 MB before resizing</small></div><div className="twohalves-preview-card"><div className="twohalves-sample-art"><img src={samplePage} alt="A line drawing of a smiling sun"/><i/><span>YOUR PAGE, IN TWO</span></div><div className="twohalves-pair"><span>{me?.name ?? 'You'} <b>left half</b></span><span>{partner?.name ?? 'Your person'} <b>right half</b></span></div></div></main>}
    {game.phase === 'coloring' && game.page && <main className="twohalves-studio">
      <nav className="twohalves-toolrail" aria-label="Drawing tools">{toolList.map(item => <button type="button" key={item.id} className={tool === item.id ? 'active' : ''} aria-label={item.label} title={item.label} aria-pressed={tool === item.id} onClick={() => setTool(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="twohalves-canvas-column"><div className="twohalves-studio-heading"><div><span className="twohalves-kicker">YOUR HALF · {me?.name ?? 'YOU'}</span><h1>{myDone ? 'Your half is ready!' : 'Make it yours.'}</h1></div><p>{partnerDone ? `${partner?.name ?? 'Your person'} finished their half ✦` : 'Your person is making the other half.'}</p></div><div className="twohalves-doodle-pair" aria-label="Players coloring together"><div className="twohalves-doodle-player"><GameDoodle id={playerDoodleId(players, me)} expression={myDone ? 'celebrating' : 'happy'} playing={!myDone} seed={`${self}:${myDone}`} size={54} name={me?.name}/><span>{me?.name ?? 'You'}</span></div><span className="twohalves-doodle-heart" aria-hidden="true">♡</span><div className="twohalves-doodle-player"><GameDoodle id={playerDoodleId(players, partner)} expression={partnerDone ? 'celebrating' : 'thinking'} playing={!partnerDone} seed={`${partnerId}:${partnerDone}`} size={54} flip name={partner?.name}/><span>{partner?.name ?? 'Your person'}</span></div></div><div className="twohalves-canvas-viewport">      <div className="twohalves-canvas-stack" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${(zoom * imageScale) / 10000})`, cursor: tool === 'move' ? 'grab' : tool === 'fill' ? 'cell' : tool === 'eraser' ? 'cell' : tool === 'colorwheel' ? 'default' : 'crosshair', touchAction: tool === 'move' ? 'pan-x pan-y' : 'none' }}><canvas ref={pageRef} aria-hidden="true"/><canvas ref={paintRef} aria-label={tool === 'move' ? 'Pan and scroll your half of the page' : 'Color only your half of the page'} style={{ touchAction: tool === 'move' ? 'pan-x pan-y' : 'none' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}/>{myDone && <span className="twohalves-done-stamp">✓ YOUR HALF IS READY</span>}      </div></div><div className="twohalves-canvas-zoom"><span>ZOOM</span><button type="button" aria-label="Zoom out" disabled={zoom <= 40} onClick={() => setZoom(value => Math.max(40, value - 20))}>−</button><strong>{zoom}%</strong><button type="button" aria-label="Zoom in" disabled={zoom >= 300} onClick={() => setZoom(value => Math.min(300, value + 20))}>+</button><button type="button" onClick={() => setZoom(100)}>Reset</button></div><div className="twohalves-history"><button onClick={undo} disabled={historyIndex.current <= 0 || myDone}>↶ Undo</button><button onClick={redo} disabled={historyIndex.current >= history.current.length - 1 || myDone}>↷ Redo</button><button onClick={clearHalf} disabled={!ready || myDone}>Clear half</button><button className="twohalves-done-button" disabled={!ready || game.paused || myDone} onClick={() => socket.emit('twohalves:complete')}>{myDone ? 'Half finished ✓' : 'Finish my half →'}</button></div></div>
      <aside className="twohalves-palette-panel"><div className="twohalves-current-color"><label className="twohalves-current-swatch" style={{ backgroundColor: color }}><input type="color" value={color} onChange={event => setColor(event.target.value)} aria-label="Choose any color"/></label><span className="twohalves-color-square" style={{ backgroundColor: color }}/><code>{color.toUpperCase()}</code></div><div className="twohalves-palette-tabs">{(Object.keys(palettes) as Palette[]).map(name => <button className={palette === name ? 'active' : ''} key={name} onClick={() => setPalette(name)}>{name}</button>)}</div>            <div className="twohalves-mood-row" aria-label="Quick color moods"><span>MOOD</span>{moodPresets.map(mood => <button type="button" key={mood.name} className={palette === mood.palette && color.toLowerCase() === mood.color ? 'active' : ''} onClick={() => { setPalette(mood.palette); setColor(mood.color); }}><i aria-hidden="true">{mood.icon}</i>{mood.name}</button>)}</div><div className="twohalves-hue-picker twohalves-hue-picker-large"><div className="twohalves-hue-wheel" ref={hueWheelRef} role="slider" tabIndex={0} aria-label="Choose a hue" aria-valuemin={0} aria-valuemax={359} aria-valuenow={hue} onKeyDown={handleHueKey} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); chooseHue(event.clientX, event.clientY); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) chooseHue(event.clientX, event.clientY); }}>            <span style={{ left: `${wheelPoint.x}%`, top: `${wheelPoint.y}%`, backgroundColor: hueToHex(hue, saturation), transform: 'translate(-50%, -50%)' }} /></div><div><b>COLOR WHEEL</b><small>Always ready — drag around the circle or use arrow keys</small><code>{color.toUpperCase()}</code></div></div><div className="twohalves-swatches" aria-label={`${palette} color palette`}>{palettes[palette].map(value => <button type="button" key={value} style={{ backgroundColor: value }} className={color.toLowerCase() === value.toLowerCase() ? 'selected' : ''} aria-label={`Choose ${value}`} onClick={() => setColor(value)}/>)}</div><section className="twohalves-adjust"><label><span>BRUSH SIZE</span><b>{size}</b></label>      <input type="range" min="2" max="54" value={size} onChange={event => setSize(Number(event.target.value))}/><label><span>STRENGTH</span><b>{strength}</b></label><input type="range" min="10" max="100" value={strength} onChange={event => setStrength(Number(event.target.value))}/><label><span>IMAGE SIZE</span><b>{imageScale}%</b></label><input type="range" min="40" max="100" step="10" value={imageScale} onChange={event => setImageScale(Number(event.target.value))}/>      </section><p className="twohalves-tool-hint">{tool === 'fill' ? 'Tap a closed shape to fill it.' : tool === 'glitter' ? 'Paint a trail of tiny sparkles.' : tool === 'eraser' ? 'Erase your colors without touching the page.' : 'Choose a tool, pick a color, and paint.'}</p></aside>
    </main>}
    {game.phase === 'complete' && game.page && <main className="twohalves-result"><span className="twohalves-kicker">MADE TOGETHER</span><h1>Look what <em>you made.</em></h1><p>Two different sides, one lovely little surprise.</p><div className="twohalves-result-doodles" aria-label="You both finished the masterpiece"><GameDoodle id={playerDoodleId(players, me)} expression="celebrating" playing seed={`${self}:complete`} size={76} name={me?.name}/><span aria-hidden="true">✦</span><GameDoodle id={playerDoodleId(players, partner)} expression="celebrating" playing seed={`${partnerId}:complete`} size={76} flip name={partner?.name}/></div><div className="twohalves-merged"><canvas ref={mergedRef} aria-label="Your merged coloring masterpiece"/></div><div className="twohalves-result-actions"><button className="twohalves-primary" onClick={download}>Download your masterpiece ↓</button><button className="twohalves-secondary" onClick={exit}>Back to our games</button></div></main>}
  </section>;
}
