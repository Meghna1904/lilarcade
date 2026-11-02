import { useEffect, useRef, useState } from 'react';
import type { CloudPosition } from '@arcade/shared';
import { CLOUD_NUMBER_COUNT, layoutCloud } from '@arcade/shared';
import { NumberTag } from './NumberTag';

type Transform = { zoom: number; x: number; y: number };
type PointerPoint = { x: number; y: number };

// Keep the visible label placement randomized in the client as well as in the
// shared layout generator. This also makes every rendered arena visibly
// scattered when an older shared package build is still present in a dev tab.
function scatterLabels(layout: CloudPosition[], seed: number): CloudPosition[] {
  let state = seed >>> 0;
  const random = () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const labels = layout.map(item => item.n);
  for (let i = labels.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [labels[i], labels[j]] = [labels[j], labels[i]];
  }
  return layout.map((item, i) => ({ ...item, n: labels[i] })).sort((a, b) => a.n - b.n);
}

export function CloudField({ seed, mode, highlightNumber, foundNumber, lockedOut, onNumber, connected, onRequestState }: {
  seed: unknown; mode: 'call' | 'find' | 'idle'; highlightNumber?: number; foundNumber?: number; lockedOut: boolean; onNumber: (n: number) => void;
  connected: boolean; onRequestState: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, PointerPoint>());
  const gesture = useRef({ dragging: false, previousX: 0, previousY: 0, startDistance: 0, startZoom: 1 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<Transform>({ zoom: 1, x: 0, y: 0 });
  const [base, setBase] = useState<{ seed: number; width: number; height: number; layout: CloudPosition[] | null } | null>(null);
  const validSeed = typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff;
  const activeBase = validSeed && base?.seed === seed && base.layout ? base : null;
  const layoutFailed = !validSeed || (validSeed && base?.seed === seed && !base.layout);
  const layoutPending = validSeed && !activeBase;
  useEffect(() => {
    if (!validSeed || !viewport.width || !viewport.height) return;
    if (base?.seed === seed && (base.layout || (base.width === viewport.width && base.height === viewport.height))) return;
    try {
      setBase({ seed, width: viewport.width, height: viewport.height, layout: scatterLabels(layoutCloud(seed, CLOUD_NUMBER_COUNT, viewport.width, viewport.height), seed) });
    } catch (error) {
      console.error('Could not build Cloud Race layout:', error);
      setBase({ seed, width: viewport.width, height: viewport.height, layout: null });
    }
  }, [base, seed, validSeed, viewport.width, viewport.height]);
  useEffect(() => { if (!validSeed) return; setView({ zoom: 1, x: 0, y: 0 }); }, [seed, validSeed]);
  useEffect(() => {
    if (!layoutFailed || !connected) return;
    onRequestState();
    const retry = window.setInterval(onRequestState, 2_000);
    return () => window.clearInterval(retry);
  }, [connected, layoutFailed, onRequestState]);
  const scale = activeBase ? Math.min(viewport.width / activeBase.width, viewport.height / activeBase.height) : 0;
  const totalScale = scale * view.zoom;
  const fitX = Math.max(0, (viewport.width - (activeBase?.width ?? 0) * scale) / 2);
  const fitY = Math.max(0, (viewport.height - (activeBase?.height ?? 0) * scale) / 2);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setViewport({ width: rect.width, height: rect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const distance = (a: PointerPoint, b: PointerPoint) => Math.hypot(a.x - b.x, a.y - b.y);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const numberButton = event.target instanceof Element && !!event.target.closest('.cloud-number');
    if (!numberButton || event.pointerType !== 'mouse') event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      gesture.current = { dragging: false, previousX: event.clientX, previousY: event.clientY, startDistance: 0, startZoom: view.zoom };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.startDistance = distance(a, b);
      gesture.current.startZoom = view.zoom;
      gesture.current.dragging = true;
    }
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const previous = pointers.current.get(event.pointerId)!;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const startDistance = gesture.current.startDistance;
      if (startDistance > 0) setView(current => ({ ...current, zoom: Math.min(2.8, Math.max(.75, gesture.current.startZoom * distance(a, b) / startDistance)) }));
      gesture.current.dragging = true;
      return;
    }
    const dx = point.x - previous.x, dy = point.y - previous.y;
    if (Math.abs(point.x - gesture.current.previousX) + Math.abs(point.y - gesture.current.previousY) > 5) gesture.current.dragging = true;
    if (gesture.current.dragging) {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
      setView(current => ({ ...current, x: current.x + dx, y: current.y + dy }));
    }
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = { x: event.clientX, y: event.clientY };
    const wasSingleTap = pointers.current.size === 1 && !gesture.current.dragging;
    const directNumberClick = event.target instanceof Element && !!event.target.closest('.cloud-number');
    pointers.current.delete(event.pointerId);
    if (wasSingleTap && !directNumberClick && totalScale > 0 && activeBase && mode !== 'idle' && !lockedOut) {
      const bounds = viewportRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const x = (point.x - bounds.left - fitX - view.x) / totalScale;
      const y = (point.y - bounds.top - fitY - view.y) / totalScale;
      let closest: { n: number; d: number } | undefined;
      for (const item of activeBase.layout!) {
        const d = Math.hypot(x - item.x, y - item.y);
        const hitRadius = Math.max(28 / totalScale, item.size * .53 + 8);
        if (d <= hitRadius && (!closest || d < closest.d)) closest = { n: item.n, d };
      }
      if (closest) onNumber(closest.n);
    }
    if (pointers.current.size === 0) gesture.current.dragging = false;
  };
  const resetZoom = () => setView({ zoom: 1, x: 0, y: 0 });

  return <div className={`cloud-field-shell ${lockedOut ? 'hunter-locked' : ''}`}>
    <div ref={viewportRef} className="cloud-field" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} role="group" aria-label="Cloud Race number cloud">
      {scale > 0 && activeBase && <div className="cloud-canvas" style={{ width: activeBase.width, height: activeBase.height, transform: `translate3d(${fitX + view.x}px, ${fitY + view.y}px, 0) scale(${totalScale})` }}>
        {activeBase.layout!.map((item, index) => <NumberTag key={item.n} item={item} fontSize={item.size} highlighted={highlightNumber === item.n} found={foundNumber === item.n} stagger={Math.min(index * 2, 198)} onChoose={onNumber} />)}
      </div>}
      {(layoutPending || layoutFailed) && <div className="cloud-field-reconnecting" role="status">Reconnecting…</div>}
    </div>
    {(view.zoom !== 1 || view.x !== 0 || view.y !== 0) && <button className="cloud-zoom-fit" type="button" onClick={resetZoom} aria-label="Zoom to fit cloud">↗ fit</button>}
  </div>;
}
