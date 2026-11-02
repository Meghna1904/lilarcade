import { useEffect, useMemo, useRef, useState } from 'react';
import type { CloudPosition } from '@arcade/shared';
import { CLOUD_HEIGHT, CLOUD_WIDTH } from '@arcade/shared';
import { NumberTag } from './NumberTag';

type Transform = { zoom: number; x: number; y: number };
type PointerPoint = { x: number; y: number };

export function CloudField({ layout, mode, highlightNumber, foundNumber, lockedOut, onNumber }: {
  layout: CloudPosition[]; mode: 'call' | 'find' | 'idle'; highlightNumber?: number; foundNumber?: number; lockedOut: boolean; onNumber: (n: number) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, PointerPoint>());
  const gesture = useRef({ dragging: false, previousX: 0, previousY: 0, startDistance: 0, startZoom: 1 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<Transform>({ zoom: 1, x: 0, y: 0 });
  const scale = useMemo(() => viewport.width && viewport.height ? Math.min(viewport.width / CLOUD_WIDTH, viewport.height / CLOUD_HEIGHT) : 0, [viewport]);
  const totalScale = scale * view.zoom;

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
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
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
      if (startDistance > 0) setView(current => ({ ...current, zoom: Math.min(2.8, Math.max(0.75, gesture.current.startZoom * distance(a, b) / startDistance)) }));
      gesture.current.dragging = true;
      return;
    }
    const dx = point.x - previous.x, dy = point.y - previous.y;
    if (Math.abs(point.x - gesture.current.previousX) + Math.abs(point.y - gesture.current.previousY) > 5) gesture.current.dragging = true;
    if (gesture.current.dragging) setView(current => ({ ...current, x: current.x + dx, y: current.y + dy }));
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = { x: event.clientX, y: event.clientY };
    const wasSingleTap = pointers.current.size === 1 && !gesture.current.dragging;
    pointers.current.delete(event.pointerId);
    if (wasSingleTap && totalScale > 0 && mode !== 'idle' && !lockedOut) {
      const bounds = viewportRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const x = (point.x - bounds.left - view.x) / totalScale;
      const y = (point.y - bounds.top - view.y) / totalScale;
      let closest: { n: number; d: number } | undefined;
      for (const item of layout) {
        const d = Math.hypot(x - item.x, y - item.y);
        const hitRadius = Math.max(28 / totalScale, item.size * 0.53 + 8);
        if (d <= hitRadius && (!closest || d < closest.d)) closest = { n: item.n, d };
      }
      if (closest) onNumber(closest.n);
    }
    if (pointers.current.size === 0) gesture.current.dragging = false;
  };
  const resetZoom = () => setView({ zoom: 1, x: 0, y: 0 });
  const fontFor = (item: CloudPosition) => Math.max(20 / Math.max(totalScale, .001), item.size * .68);

  return <div className={`cloud-field-shell ${lockedOut ? 'hunter-locked' : ''}`}>
    <div ref={viewportRef} className="cloud-field" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} aria-label="Cloud Race number cloud">
      {scale > 0 && <div className="cloud-canvas" style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${totalScale})` }}>
        {layout.map((item, index) => <NumberTag key={item.n} item={item} fontSize={fontFor(item)} highlighted={highlightNumber === item.n} found={foundNumber === item.n} stagger={Math.min(index * 7, 380)} onKeyboardChoose={onNumber} />)}
      </div>}
    </div>
    <button className="cloud-zoom-fit" type="button" onClick={resetZoom} aria-label="Zoom to fit cloud">↗ fit</button>
  </div>;
}
