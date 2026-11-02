import type { CSSProperties } from 'react';
import type { CloudView, RoomView } from '@arcade/shared';

export function StatusBar({ game, self, players, seconds, status, lockoutProgress = 0 }: { game: CloudView; self: string; players: RoomView['players']; seconds: number; status: string; lockoutProgress?: number }) {
  const showTimer = game.phase === 'calling' || game.phase === 'hunting' || (game.paused && seconds > 0);
  const totalSeconds = game.phase === 'calling' ? 5 : game.settings.huntTimeoutSeconds;
  const remaining = Math.max(0, Math.min(1, seconds / totalSeconds));
  const targetVisible = game.targetNumber !== undefined && (game.phase === 'hunting' || game.phase === 'swapping');
  const targetLabel = game.roles.caller === self ? 'CALLED' : 'FIND';
  const callerName = players.find(player => player.id === game.roles.caller)?.name ?? 'Caller';
  const pausedStatus = game.paused ? 'Waiting for your person to reconnect…' : status;
  return <div className="cloud-status-bar" aria-live="polite">
    <div className="cloud-status-copy"><span className="eyebrow">CLOUD RACE</span><h2>{pausedStatus}</h2></div>
    <div className={`cloud-target-chip${targetVisible ? ' visible' : ' empty'}${lockoutProgress > 0 ? ' lockout' : ''}`} style={{'--lockout-progress': lockoutProgress} as CSSProperties} aria-label={targetVisible ? `${targetLabel} ${game.targetNumber}` : undefined} aria-hidden={!targetVisible}>
      {targetVisible && <><small>{targetLabel}</small><b>{game.targetNumber}</b></>}
      {lockoutProgress > 0 && <i aria-hidden="true"/>}
    </div>
    <div className={`cloud-strip-timer${showTimer ? ' active' : ''}`} aria-label={showTimer ? `${seconds} seconds remaining` : undefined}>
      {showTimer && <><span>{seconds}<small>s</small></span><i style={{'--cloud-timer-progress': remaining} as CSSProperties}/></>}
    </div>
    {game.phase === 'hunting' && game.roles.caller === self && <span className="sr-only">{callerName} is calling for the hunter</span>}
  </div>;
}
