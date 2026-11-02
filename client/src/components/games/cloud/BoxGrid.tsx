export function BoxGrid({ name, count, target, self, compact = false, canTick = false, onTick }: { name: string; count: number; target: number; self: boolean; compact?: boolean; canTick?: boolean; onTick?: () => void }) {
  const columns = target === 30 ? 6 : 10;
  return <div className={`cloud-box-card ${self ? 'self' : ''} ${compact ? 'compact' : ''}`}>
    <div className="cloud-box-heading"><span>{name}</span><b>{count} <i>/ {target}</i></b></div>
    <div className="cloud-box-grid" style={{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))` }} role="group" aria-label={`${name}: ${count} of ${target} ticks`}>
      {Array.from({ length: target }, (_, index) => index < count
        ? <i key={index} className="filled" aria-hidden="true" />
        : canTick && index === count
          ? <button key={index} type="button" className="cloud-tick-box" onClick={onTick} aria-label={`Tick box ${index + 1}`} title={`Tick box ${index + 1}`} />
          : <i key={index} aria-hidden="true" />)}
    </div>
    <div className="cloud-progress-track"><i style={{ width: `${Math.min(100, count / target * 100)}%` }} /></div>
  </div>;
}
