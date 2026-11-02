import type { CloudView, RoomView } from '@arcade/shared';

export function StatusBar({ game, self, players, seconds, status }: { game: CloudView; self: string; players: RoomView['players']; seconds: number; status: string }) {
  const callerName = players.find(player => player.id === game.roles.caller)?.name ?? 'Caller';
  const hunterName = players.find(player => player.id === game.roles.hunter)?.name ?? 'Hunter';
  const deadline = game.phase === 'calling' ? game.callDeadline : game.huntDeadline;
  const showTimer = !!deadline || (game.paused && seconds > 0);
  const totalSeconds = game.phase === 'calling' ? 5 : game.settings.huntTimeoutSeconds;
  const remaining = Math.max(0, Math.min(1, seconds / totalSeconds));
  return <div className="cloud-status-bar">
    <div className="cloud-status-copy"><span className="eyebrow">{game.phase === 'calling' ? 'CALLER' : game.phase === 'hunting' ? 'HUNTING' : game.phase === 'swapping' ? 'SWAP' : 'CLOUD RACE'}</span><h2>{status}</h2>
      {game.phase === 'calling' ? <p>{game.roles.caller === self ? 'Tap any number to call it.' : `${callerName} is picking a number… 👀`}</p> : game.phase === 'hunting' ? <p>{game.roles.hunter === self ? `${callerName} is ticking boxes while you search.` : 'Click the next box below while they search.'}</p> : game.phase === 'swapping' ? <p>{game.swapReason === 'caught' ? 'Found it! Roles are swapping…' : 'Time! Roles are swapping…'}</p> : null}</div>
    {showTimer && <div className={`cloud-timer ${game.phase === 'calling' ? 'calling' : ''}`} aria-label={`${seconds} seconds remaining`}><i style={{ '--cloud-timer-progress': remaining } as React.CSSProperties} /><b>{seconds}</b><small>sec</small></div>}
  </div>;
}
