import type { CupId } from '@arcade/shared';
import { useRef } from 'react';
import { Cup } from './Cup';

export function SlotRow({ order, selected, onSelect, onMove, disabled = false, label = 'Build your order' }: {
  order: CupId[]; selected: number | null; onSelect: (index: number) => void; onMove: (from: number, to: number) => void;
  disabled?: boolean; label?: string;
}) {
  const pointerStart = useRef<number | null>(null);
  return <div className="cup-shelf" aria-label={label}>
    <div className="slot-label">{label}<span>Tap one cup, then another to swap</span></div>
    <div className="slot-row">
      {order.map((cup, index) => <button key={`${cup}-${index}`} className={`cup-slot ${selected === index ? 'selected-slot' : ''}`} type="button" disabled={disabled}
        onPointerDown={event => { pointerStart.current = index; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerUp={event => { const from = pointerStart.current; pointerStart.current = null; event.currentTarget.releasePointerCapture(event.pointerId); if (from !== null && from !== index) onMove(from, index); else onSelect(index); }}
        onPointerCancel={() => { pointerStart.current = null; }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(index); } }}>
        <span className="slot-number">{index + 1}</span><Cup id={cup} selected={selected === index} />
      </button>)}
    </div>
  </div>;
}
