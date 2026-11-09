import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientToServerEvents, PicturePuzzleView, ServerToClientEvents } from '@arcade/shared';
import type { Socket } from 'socket.io-client';
import { createPuzzleRects, pieceEdgePaths, piecePath, type PuzzleRect } from './geometry';

const PUZZLE_W = 1000;
const EDGE_PAD = 34;
const SCATTER_GAP = 36;
const SCATTER_COLUMNS = 4;
type Point = { x: number; y: number };
type DragSession = { pointerId: number; piece: number; group: number[]; down: Point; origin: Point; origins: Record<number, Point>; pan: Point | null };
type Props = { game: PicturePuzzleView; self: string; socket: Socket<ServerToClientEvents, ClientToServerEvents> };
let mergeAudio: AudioContext | null = null;

function gridMetrics(count: number, aspect: number, rows?: number, cols?: number) {
  const columns = cols ?? Math.max(1, Math.round(Math.sqrt(count * aspect)));
  rows ??= Math.ceil(count / columns);
  return { columns, rows };
}

function workspaceMetrics(count: number, aspect: number, rows?: number, cols?: number) {
  const { columns, rows: gridRows } = gridMetrics(count, aspect, rows, cols);
  const cellWidth = PUZZLE_W / columns;
  const heightWorld = PUZZLE_W / aspect;
  const cellHeight = heightWorld / gridRows;
  const scatterRows = Math.ceil(count / (SCATTER_COLUMNS * 2));
  const left = -(SCATTER_COLUMNS * (cellWidth + SCATTER_GAP) + EDGE_PAD);
  const right = PUZZLE_W + SCATTER_COLUMNS * (cellWidth + SCATTER_GAP) + EDGE_PAD;
  const top = -EDGE_PAD;
  const bottom = Math.max(heightWorld, scatterRows * (cellHeight + SCATTER_GAP) + EDGE_PAD);
  return { width: right - left, height: bottom - top, centerY: (top + bottom) / 2 };
}

function edgePiece(rect: PuzzleRect, count: number, columns: number, rows: number) {
  return rect.row === 0 || rect.col === 0 || rect.col === columns - 1 || rect.row === rows - 1 || rect.id + columns >= count;
}

export function unlockPicturePuzzleSound() {
  try {
    const Audio = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return;
    mergeAudio ??= new Audio();
    if (mergeAudio.state === 'suspended') void mergeAudio.resume();
  } catch { /* sound is a small enhancement; puzzle play never depends on audio */ }
}

function playMergeSound() {
  try {
    if (!mergeAudio || mergeAudio.state === 'closed') return;
    const context = mergeAudio;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(660, context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.08);
    gain.gain.setValueAtTime(0.035, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.13);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.14);
  } catch { /* sound is a small enhancement; puzzle play never depends on audio */ }
}

export function PicturePuzzleCanvas({ game, self, socket }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const previewPositions = useRef<Record<number, Point> | null>(null);
  const camera = useRef({ zoom: 1, panX: 0, panY: 0, fitZoom: 1, fitPanY: 0 });
  const drawRef = useRef<() => void>(() => undefined);
  const [edgeOnly, setEdgeOnly] = useState(false);
  const [ghost, setGhost] = useState(false);
  const [hand, setHand] = useState(false);
  const [zoomLabel, setZoomLabel] = useState(100);
  const [notice, setNotice] = useState('');
  const lastGroupCount = useRef(game.board.groups.length);
  const flashUntil = useRef(0);
  const rects = useRef(createPuzzleRects(game.pieces, game.seed, PUZZLE_W, PUZZLE_W / game.imageAspect, game.rows, game.cols));
  const pathCache = useRef(new Map<number, { full: Path2D; edges: Record<'top' | 'right' | 'bottom' | 'left', Path2D>; bitmap?: HTMLCanvasElement }>());

  const draw = useCallback(() => {
    const canvas = canvasRef.current, bounds = boxRef.current?.getBoundingClientRect();
    if (!canvas || !bounds) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const currentRects = rects.current;
    const { columns, rows } = gridMetrics(game.pieces, game.imageAspect, game.rows, game.cols);
    const heightWorld = PUZZLE_W / game.imageAspect;
    const view = camera.current;
    const zoom = view.zoom;
    const boardLeft = width / 2 - (PUZZLE_W * zoom) / 2 + view.panX;
    const boardTop = height / 2 - (heightWorld * zoom) / 2 + view.panY;
    const piecePositions = game.board.positions;
    const membership = new Map<number, number>();
    const groupSizes = new Map<number, number>();
    game.board.groups.forEach(group => {
      const groupId = Math.min(...group); groupSizes.set(groupId, group.length);
      group.forEach(id => membership.set(id, groupId));
    });

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(boardLeft, boardTop, PUZZLE_W * zoom, heightWorld * zoom, 12 * zoom);
    ctx.fillStyle = '#514052'; ctx.shadowColor = '#17132188'; ctx.shadowBlur = 24 * zoom; ctx.shadowOffsetY = 8 * zoom; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#ff9b8f'; ctx.lineWidth = 2.5 * zoom; ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(boardLeft + 6 * zoom, boardTop + 6 * zoom, (PUZZLE_W - 12) * zoom, (heightWorld - 12) * zoom, 8 * zoom);
    ctx.strokeStyle = '#fff2df42'; ctx.lineWidth = 1 * zoom; ctx.stroke();
    if (ghost && game.image) {
      const image = imageCache.current;
      if (image?.complete) { ctx.globalAlpha = 0.16; ctx.drawImage(image, boardLeft, boardTop, PUZZLE_W * zoom, heightWorld * zoom); ctx.globalAlpha = 1; }
    }
    ctx.restore();

    const image = imageCache.current;
    const baseOrder = game.board.zOrder.length ? game.board.zOrder : currentRects.map(rect => rect.id);
    const activeGroup = dragRef.current?.group;
    const visible = activeGroup?.length ? [...baseOrder.filter(id => !activeGroup.includes(id)), ...activeGroup] : baseOrder;
    for (const id of visible) {
      const rect = currentRects[id], position = previewPositions.current?.[id] ?? piecePositions[id];
      if (!rect || !position || (edgeOnly && groupSizes.get(membership.get(id) ?? id) === 1 && !edgePiece(rect, game.pieces, columns, rows))) continue;
      let cached = pathCache.current.get(id);
      if (!cached) {
        const sidePaths = pieceEdgePaths(rect, currentRects, EDGE_PAD, game.seed);
        const startPoints = { top: [EDGE_PAD, EDGE_PAD], right: [EDGE_PAD + rect.width, EDGE_PAD], bottom: [EDGE_PAD + rect.width, EDGE_PAD + rect.height], left: [EDGE_PAD, EDGE_PAD + rect.height] } as const;
        const edges = Object.fromEntries((Object.keys(sidePaths) as Array<keyof typeof sidePaths>).map(side => {
          const [x, y] = startPoints[side]; return [side, new Path2D(`M ${x} ${y} ${sidePaths[side]}`)];
        })) as { top: Path2D; right: Path2D; bottom: Path2D; left: Path2D };
        cached = { full: new Path2D(piecePath(rect, currentRects, EDGE_PAD, game.seed)), edges };
        if (image?.complete && image.naturalWidth) {
          const bitmap = document.createElement('canvas'); bitmap.width = Math.ceil((rect.width + 2 * EDGE_PAD) * dpr); bitmap.height = Math.ceil((rect.height + 2 * EDGE_PAD) * dpr);
          const bitmapCtx = bitmap.getContext('2d');
          if (bitmapCtx) {
            bitmapCtx.setTransform(dpr, 0, 0, dpr, 0, 0); bitmapCtx.clip(cached.full);
            bitmapCtx.drawImage(image, EDGE_PAD - rect.x, EDGE_PAD - rect.y, PUZZLE_W, heightWorld);
            cached.bitmap = bitmap;
          }
        }
        pathCache.current.set(id, cached);
      }
      const x = boardLeft + (position.x - EDGE_PAD) * zoom, y = boardTop + (position.y - EDGE_PAD) * zoom;
      const pieceW = (rect.width + EDGE_PAD * 2) * zoom, pieceH = (rect.height + EDGE_PAD * 2) * zoom;
      if (cached.bitmap) ctx.drawImage(cached.bitmap, x, y, pieceW, pieceH);
      else {
        ctx.save(); ctx.translate(x, y); ctx.scale(zoom, zoom); ctx.clip(cached.full);
        if (image?.complete && image.naturalWidth) ctx.drawImage(image, EDGE_PAD - rect.x, EDGE_PAD - rect.y, PUZZLE_W, heightWorld);
        ctx.restore();
      }
      const groupId = membership.get(id) ?? id;
      const lockedBy = game.board.locks[String(groupId)];
      const playerIndex = game.players.indexOf(lockedBy);
      ctx.save(); ctx.translate(x, y); ctx.scale(zoom, zoom);
      if (lockedBy) {
        ctx.save(); ctx.clip(cached.full); ctx.fillStyle = playerIndex === 0 ? '#f05d92aa' : '#6e9bffaa'; ctx.fill(cached.full); ctx.restore();
      }
      const glowing = performance.now() < flashUntil.current && (groupSizes.get(groupId) ?? 1) > 1;
      const pieceAccents = ['#ff9b8f', '#ffd98a', '#8fd3c1'] as const;
      const accentIndex = ((Math.imul(id + 1, 0x9e3779b1) ^ game.seed) >>> 0) % pieceAccents.length;
      const accent = lockedBy ? (playerIndex === 0 ? '#ff9b8f' : '#8fd3c1') : pieceAccents[accentIndex];
      const sides: Array<keyof typeof cached.edges> = ['top', 'right', 'bottom', 'left'];
      const strokeOuterEdges = () => {
        for (const side of sides) {
          const neighbor = side === 'top' ? id - columns : side === 'bottom' ? id + columns : side === 'left' ? id - 1 : id + 1;
          const isAdjacent = side === 'top' ? rect.row > 0 : side === 'bottom' ? rect.row < rows - 1 && neighbor < game.pieces : side === 'left' ? rect.col > 0 : rect.col < columns - 1 && neighbor < game.pieces;
          if (isAdjacent && membership.get(neighbor) === groupId) continue;
          ctx.stroke(cached.edges[side]);
        }
      };
      ctx.strokeStyle = '#251c30'; ctx.lineWidth = 6 / zoom;
      ctx.shadowColor = glowing ? '#ffd98a' : '#171321bb';
      ctx.shadowBlur = (glowing ? 17 : 8) / zoom; ctx.shadowOffsetY = 3 / zoom;
      strokeOuterEdges();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = '#fff2df'; ctx.lineWidth = 3.2 / zoom; strokeOuterEdges();
      ctx.strokeStyle = accent; ctx.lineWidth = 1.15 / zoom; strokeOuterEdges();
      if (lockedBy) {
        ctx.strokeStyle = accent; ctx.lineWidth = 1.8 / zoom; ctx.setLineDash([5 / zoom, 4 / zoom]); strokeOuterEdges(); ctx.setLineDash([]);
      }
      ctx.restore();
    }
    if (dragRef.current?.pan) {
      ctx.save(); ctx.fillStyle = '#ffd98a'; ctx.font = '700 10px sans-serif'; ctx.fillText('PAN', 16, height - 16); ctx.restore();
    }
  }, [edgeOnly, game, ghost]);
  drawRef.current = draw;

  const imageCache = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!game.image) return;
    const image = new Image();
    image.onload = () => { imageCache.current = image; pathCache.current.clear(); drawRef.current(); };
    image.src = game.image;
    return () => { image.onload = null; };
  }, [game.image]);

  useEffect(() => {
    rects.current = createPuzzleRects(game.pieces, game.seed, PUZZLE_W, PUZZLE_W / game.imageAspect, game.rows, game.cols);
    pathCache.current.clear();
  }, [game.imageAspect, game.pieces, game.rows, game.cols, game.seed]);

  useEffect(() => {
    drawRef.current();
  }, [draw, game.board]);

  useEffect(() => {
    const before = lastGroupCount.current;
    if (game.board.groups.length < before) {
      playMergeSound(); flashUntil.current = performance.now() + 420;
      drawRef.current(); window.setTimeout(() => drawRef.current(), 440);
    }
    lastGroupCount.current = game.board.groups.length;
  }, [game.board.groups.length]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const resize = new ResizeObserver(() => {
      const rect = box.getBoundingClientRect();
      const workspace = workspaceMetrics(game.pieces, game.imageAspect, game.rows, game.cols);
      const previousFit = camera.current.fitZoom;
      const fit = Math.min(rect.width / workspace.width, rect.height / workspace.height, 1.2);
      camera.current.fitZoom = Math.max(0.12, fit);
      camera.current.fitPanY = -workspace.centerY * camera.current.fitZoom;
      if (camera.current.zoom === 1 || Math.abs(camera.current.zoom - previousFit) < 0.001) {
        camera.current.zoom = camera.current.fitZoom;
        camera.current.panX = 0;
        camera.current.panY = camera.current.fitPanY;
      }
      setZoomLabel(Math.round(camera.current.zoom * 100)); drawRef.current();
    });
    resize.observe(box); return () => resize.disconnect();
  }, [game.imageAspect, game.pieces, game.rows, game.cols]);

  useEffect(() => {
    const board = game.board;
    if (!dragRef.current) previewPositions.current = board.positions;
    drawRef.current();
  }, [game.board.positions]);

  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const zoom = camera.current.zoom;
    const worldX = ((clientX - rect.left) - rect.width / 2 - camera.current.panX) / zoom + PUZZLE_W / 2;
    const worldY = ((clientY - rect.top) - rect.height / 2 - camera.current.panY) / zoom + (PUZZLE_W / game.imageAspect) / 2;
    return { x: worldX, y: worldY };
  };

  const hitTest = (point: Point) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const { columns, rows } = gridMetrics(game.pieces, game.imageAspect, game.rows, game.cols);
    const membership = new Map<number, number>();
    const groupSizes = new Map<number, number>();
    game.board.groups.forEach(group => {
      const groupId = Math.min(...group); groupSizes.set(groupId, group.length);
      group.forEach(id => membership.set(id, groupId));
    });
    const zOrder = game.board.zOrder.length ? game.board.zOrder : rects.current.map(rect => rect.id);
    for (let index = zOrder.length - 1; index >= 0; index--) {
      const id = zOrder[index], rect = rects.current[id], pos = previewPositions.current?.[id] ?? game.board.positions[id];
      const groupId = membership.get(id) ?? id;
      if (!rect || !pos || (edgeOnly && groupSizes.get(groupId) === 1 && !edgePiece(rect, game.pieces, columns, rows))) continue;
      const owner = game.board.locks[String(groupId)];
      if (owner && owner !== self) continue;
      const localX = point.x - pos.x + EDGE_PAD, localY = point.y - pos.y + EDGE_PAD;
      if (localX < 0 || localY < 0 || localX > rect.width + EDGE_PAD * 2 || localY > rect.height + EDGE_PAD * 2) continue;
      const path = pathCache.current.get(id)?.full;
      if (path && ctx.isPointInPath(path, localX, localY)) return id;
    }
    return null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const point = screenToWorld(event.clientX, event.clientY);
    const piece = hand || event.button === 1 ? null : hitTest(point);
    if (game.paused) return;
    unlockPicturePuzzleSound();
    if (piece === null) {
      dragRef.current = { pointerId: event.pointerId, piece: -1, group: [], down: { x: event.clientX, y: event.clientY }, origin: point, origins: {}, pan: { x: camera.current.panX, y: camera.current.panY } };
      drawRef.current(); return;
    }
    const group = game.board.groups.find(members => members.includes(piece)) ?? [piece];
    const origin = game.board.positions[piece];
    if (!origin) return;
    previewPositions.current = {};
    const origins = Object.fromEntries(group.map(id => [id, { ...game.board.positions[id] }])) as Record<number, Point>;
    dragRef.current = { pointerId: event.pointerId, piece, group, down: point, origin: { ...origin }, origins, pan: null };
    for (const id of group) {
      const pos = origins[id];
      if (pos) previewPositions.current[id] = { ...pos };
    }
    drawRef.current();
    socket.emit('picturepuzzle:grab', { piece }, error => {
      if (error && dragRef.current?.piece === piece) { dragRef.current = null; previewPositions.current = null; setNotice(error); drawRef.current(); }
    });
  };

  const lastSent = useRef(0);
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.pan) {
      camera.current.panX = drag.pan.x + (event.clientX - drag.down.x);
      camera.current.panY = drag.pan.y + (event.clientY - drag.down.y);
      drawRef.current(); return;
    }
    const current = screenToWorld(event.clientX, event.clientY);
    const dx = current.x - drag.down.x, dy = current.y - drag.down.y;
    if (previewPositions.current) for (const id of drag.group) {
      const base = drag.origins[id]; if (base) previewPositions.current[id] = { x: base.x + dx, y: base.y + dy };
    }
    drawRef.current();
    const now = performance.now();
    if (now - lastSent.current >= 40) {
      lastSent.current = now; socket.emit('picturepuzzle:move', { piece: drag.piece, x: drag.origin.x + dx, y: drag.origin.y + dy });
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.pan) { dragRef.current = null; drawRef.current(); return; }
    const current = screenToWorld(event.clientX, event.clientY);
    const dx = current.x - drag.down.x, dy = current.y - drag.down.y;
    socket.emit('picturepuzzle:move', { piece: drag.piece, x: drag.origin.x + dx, y: drag.origin.y + dy });
    socket.emit('picturepuzzle:drop', { piece: drag.piece });
    dragRef.current = null; drawRef.current();
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const change = event.deltaY < 0 ? 1.08 : 0.92;
      camera.current.zoom = Math.max(0.35, Math.min(2.2, camera.current.zoom * change));
      setZoomLabel(Math.round(camera.current.zoom * 100));
    } else if (event.shiftKey) camera.current.panX -= event.deltaY;
    else camera.current.panY -= event.deltaY;
    drawRef.current();
  };

  const zoomBy = (factor: number) => {
    camera.current.zoom = Math.max(0.35, Math.min(2.2, camera.current.zoom * factor));
    setZoomLabel(Math.round(camera.current.zoom * 100)); drawRef.current();
  };
  const resetView = () => { camera.current.zoom = camera.current.fitZoom; camera.current.panX = 0; camera.current.panY = camera.current.fitPanY; setZoomLabel(Math.round(camera.current.zoom * 100)); drawRef.current(); };

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2200); return () => clearTimeout(timer);
  }, [notice]);

  return <div className={`puzzle-canvas-stage${hand ? ' hand-mode' : ''}`} ref={boxRef}>
    <canvas ref={canvasRef} className="puzzle-canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel} aria-label="Jigsaw board. Drag pieces together to connect them." />
    <div className="puzzle-tool-dock">
      <button type="button" className={hand ? 'active' : ''} onClick={() => setHand(value => !value)} title="Pan the table" aria-label="Pan the table">✋</button>
      <button type="button" className={ghost ? 'active' : ''} onClick={() => { setGhost(value => !value); drawRef.current(); }} title="Toggle ghost image" aria-label="Toggle ghost image">◩</button>
      <button type="button" className={edgeOnly ? 'active' : ''} onClick={() => setEdgeOnly(value => !value)} title="Show edge pieces only" aria-label="Show edge pieces only">▦</button>
      <button type="button" onClick={() => socket.emit('picturepuzzle:scatter')} title="Re-scatter loose groups" aria-label="Re-scatter loose groups">⤨</button>
      <span className="puzzle-tool-divider"/>
      <button type="button" onClick={() => zoomBy(1.15)} title="Zoom in" aria-label="Zoom in">＋</button>
      <output>{zoomLabel}%</output>
      <button type="button" onClick={() => zoomBy(0.87)} title="Zoom out" aria-label="Zoom out">−</button>
      <button type="button" onClick={resetView} title="Reset view" aria-label="Reset view">⌂</button>
    </div>
    {notice && <div className="puzzle-canvas-notice" role="status">{notice}</div>}
  </div>;
}
