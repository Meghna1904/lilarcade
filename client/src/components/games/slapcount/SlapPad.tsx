import type { CSSProperties } from 'react';

export function SlapPad({ disabled, locked, lockRemaining = 0, onSlap }: { disabled: boolean; locked: boolean; lockRemaining?: number; onSlap: () => void }) {
  const lockProgress = `${Math.min(100, Math.max(0, lockRemaining / 10))}%`;
  return <button type="button" className={`slap-pad ${locked ? 'locked' : ''}`} style={{ '--lock-progress': lockProgress } as CSSProperties} disabled={disabled || locked} onClick={onSlap} aria-label={locked ? `Slap pad locked for ${Math.ceil(lockRemaining / 100) / 10} seconds` : 'Slap the pile'}>
    {locked && <span className="slap-lock-ring" aria-hidden="true" />}
    <span className="slap-hand" aria-hidden="true">✋</span><b>SLAP!</b><small>{locked ? `${(Math.ceil(lockRemaining / 100) / 10).toFixed(1)}s · take a breath…` : 'or hit the space bar'}</small>
  </button>;
}
