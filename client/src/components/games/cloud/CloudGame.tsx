import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CloudSettings, CloudView, ClientToServerEvents, RoomView, ServerToClientEvents } from '@arcade/shared';
import type { Socket } from 'socket.io-client';
import './cloud.css';
import { useCandyAudio } from '../poison/useCandyAudio';
import { BoxGrid } from './BoxGrid';
import { CloudField } from './CloudField';
import { cloudLines } from './cloudConfig';
import { StatusBar } from './StatusBar';
import { useCloudGame } from './useCloudGame';
import { DoodleResultPair } from '../../../doodles/DoodleResultPair';
import { playerDoodleId } from '../../../doodles/playerDoodle';
import { GameDoodle } from '../../../doodles/GameDoodle';

type CloudSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Props = { game: CloudView; self: string; players: RoomView['players']; socket: CloudSocket };

export function CloudGame({ game, self, players, socket, connected }: Props & { connected: boolean }) {
  const [clock, setClock] = useState(Date.now());
  const [helpOpen, setHelpOpen] = useState(false);
  const { muted, toggleMute, unlock, play, resetCloudTick } = useCandyAudio();
  const { tick, optimisticTicks } = useCloudGame(game, socket);
  const priorPhase = useRef(game.phase);
  const priorWrong = useRef(game.wrongTapId);
  const priorHunt = useRef(game.huntId);
  const caller = game.roles.caller === self;
  const hunter = game.roles.hunter === self;
  const ended = game.phase === 'roundOver' || game.phase === 'matchOver';
  const callerMarking = game.phase === 'hunting' && caller;
  const playerAId = players[0]?.id ?? game.roles.caller;
  const playerBId = players[1]?.id ?? game.roles.hunter;
  const playerAName = players.find(player => player.id === playerAId)?.name ?? 'Caller';
  const playerBName = players.find(player => player.id === playerBId)?.name ?? 'Hunter';
  const myProgress = game.tickCounts[self] ?? 0;
  const tickCounts = { ...game.tickCounts };
  if (caller && optimisticTicks) tickCounts[self] = Math.min(game.settings.targetBoxes, myProgress + optimisticTicks);
  const deadline = game.phase === 'calling' ? game.callDeadline : game.huntDeadline;
  const seconds = Math.max(0, Math.ceil(((deadline ?? 0) - clock) / 1000));
  const timerSeconds = game.paused ? Math.ceil((game.remainingMs ?? 0) / 1000) : seconds;
  const lockedOut = hunter && (game.lockoutUntil ?? 0) > clock;
  const lockoutProgress = lockedOut && game.lockoutUntil ? Math.max(0, Math.min(1, (game.lockoutUntil - clock) / 1000)) : 0;
  const winnerId = game.matchWinner ?? game.roundWinner;
  const winnerName = players.find(player => player.id === winnerId)?.name ?? 'Your person';
  const iWon = winnerId === self;
  let status = '';
  if (game.phase === 'calling') status = caller ? 'Call a number' : `${playerAId === game.roles.caller ? playerAName : playerBName} is picking a number…`;
  else if (game.phase === 'hunting') status = hunter ? 'Find it!' : `${game.roles.hunter === playerAId ? playerAName : playerBName} is hunting`;
  else if (game.phase === 'swapping') status = game.swapReason === 'caught' ? 'Found it!' : 'Time is up!';
  else status = game.phase === 'matchOver' ? 'Race complete!' : 'Round complete!';

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const previous = priorPhase.current;
    if (previous === 'calling' && game.phase === 'hunting') play('cloudCall');
    if (previous === 'hunting' && game.phase === 'swapping') {
      if (game.swapReason === 'caught') play('cloudFound');
      play('cloudSwap');
    }
    if (previous !== 'roundOver' && previous !== 'matchOver' && ended) play(game.matchWinner === self || game.roundWinner === self ? 'win' : 'lose');
    priorPhase.current = game.phase;
  }, [game.phase, game.swapReason, game.matchWinner, ended, self, play]);
  useEffect(() => {
    if (priorWrong.current !== game.wrongTapId && hunter) play('cloudWrong');
    priorWrong.current = game.wrongTapId;
  }, [game.wrongTapId, hunter, play]);
  useEffect(() => {
    if (priorHunt.current !== game.huntId || game.phase !== 'hunting' || !caller || game.paused) resetCloudTick();
    priorHunt.current = game.huntId;
  }, [caller, game.huntId, game.paused, game.phase, resetCloudTick]);
  useEffect(() => {
    if (!helpOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setHelpOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [helpOpen]);

  const onNumber = (n: number) => {
    if (game.paused || ended || lockedOut) return;
    unlock();
    if (game.phase === 'calling' && caller) socket.emit('cloud:callNumber', { n, huntId: game.huntId });
    else if (game.phase === 'hunting' && hunter) socket.emit('cloud:findNumber', { n, huntId: game.huntId });
  };
  const requestCloudState = useCallback(() => {
    if (socket.connected) socket.emit('cloud:requestState');
  }, [socket]);
  const onTick = () => {
    if (!caller || game.phase !== 'hunting' || game.paused || tickCounts[self] >= game.settings.targetBoxes) return;
    unlock(); play('cloudTick'); tick();
  };
  const back = () => {
    if (game.phase === 'hunting' && !window.confirm('Leave the hunt and return to the lobby?')) return;
    socket.emit('cloud:backToLobby');
  };
  const mode = game.phase === 'calling' && caller ? 'call' : game.phase === 'hunting' && hunter ? 'find' : 'idle';
  const highlighted = game.phase === 'hunting' && caller ? game.targetNumber : undefined;
  const found = game.phase === 'swapping' ? game.targetNumber : undefined;
  const speech = game.phase === 'calling' ? (caller ? cloudLines.caller[(game.huntId - 1) % cloudLines.caller.length] : cloudLines.hunter[(game.huntId - 1) % cloudLines.hunter.length]) : game.phase === 'hunting' ? cloudLines.hunting[(game.huntId - 1) % cloudLines.hunting.length] : game.swapReason === 'caught' ? cloudLines.found[(game.huntId - 1) % cloudLines.found.length] : cloudLines.timeout[(game.huntId - 1) % cloudLines.timeout.length];

  return <section className="cloud-screen">
    <header className="cloud-topbar">
      <button className="cloud-back" onClick={back} aria-label="Back to lobby">← <span>Lobby</span></button>
      <div className="cloud-title"><svg viewBox="0 0 40 32" aria-hidden="true"><path d="M9 26H30a8 8 0 0 0 .5-16 11 11 0 0 0-20-1 8.5 8.5 0 0 0-1.5 17Z"/><path d="M15 13h.1m5-.4h.1m5 .3h.1M16 18q4 4 8 0"/><path d="M19 20v5m-2 0h4"/></svg><b>Cloud Race</b></div>
      <div className="cloud-topbar-actions">{game.format === 'bestOf3' && <div className="cloud-round-pips" aria-label={`${game.matchScore[playerAId] ?? 0} to ${game.matchScore[playerBId] ?? 0}`}><i className={(game.matchScore[playerAId] ?? 0) > 0 ? 'filled' : ''}/><i className={(game.matchScore[playerBId] ?? 0) > 0 ? 'filled' : ''}/><i className={game.round >= 3 ? 'filled' : ''}/></div>}<span className={`cloud-connection${connected ? ' online' : ''}`} aria-label={connected ? 'Connected' : 'Reconnecting'}/><button className="cloud-icon-button" onClick={toggleMute} aria-label={muted ? 'Turn sound on' : 'Mute sound'}>{muted ? '♪̸' : '♫'}</button><button className="cloud-icon-button" onClick={() => setHelpOpen(true)} aria-label="How to play">?</button></div>
    </header>
    <div className="cloud-zones">
      <CloudPlayerRail player={players.find(player => player.id === self)} players={players} game={game} role={caller ? 'CALLER' : 'HUNTER'} count={tickCounts[self] ?? 0} target={game.settings.targetBoxes} wins={game.matchScore[self] ?? 0} side="left" line={speech} winnerId={ended ? winnerId : undefined}/>
      <main className="cloud-board">
        {game.paused && <div className="cloud-paused-overlay" role="status">Your person lost connection. Waiting for them to come back…</div>}
        <StatusBar game={game} self={self} players={players} seconds={timerSeconds} status={status} lockoutProgress={lockoutProgress}/>
        {ended ? <div className="cloud-result">
          {iWon && <div className="cloud-confetti" aria-hidden="true">{Array.from({length:22},(_,i)=><i key={i} style={{'--i':i} as CSSProperties}/>)}</div>}
          <div className="cloud-result-spark">{iWon ? '✦' : '☁'}</div><DoodleResultPair players={players} winnerId={winnerId}/><span className="eyebrow">{game.phase === 'matchOver' ? 'MATCH OVER' : 'ROUND OVER'}</span>
          <h2>{iWon ? 'You won the race!' : `${winnerName} won the race!`}</h2>
          <p>Final progress: {playerAName} <b>{game.tickCounts[playerAId] ?? 0} / {game.settings.targetBoxes}</b> · {playerBName} <b>{game.tickCounts[playerBId] ?? 0} / {game.settings.targetBoxes}</b></p>
          <div className="cloud-result-scores"><BoxGrid name={playerAName} count={game.tickCounts[playerAId] ?? 0} target={game.settings.targetBoxes} self={playerAId === self} compact/><BoxGrid name={playerBName} count={game.tickCounts[playerBId] ?? 0} target={game.settings.targetBoxes} self={playerBId === self} compact/></div>
          <div className="result-actions"><button className="button primary" onClick={() => socket.emit('cloud:nextRound')}>{game.phase === 'matchOver' ? 'Rematch' : 'Next round'} <span>→</span></button><button className="button text-button" onClick={() => socket.emit('cloud:backToLobby')}>Back to lobby</button></div>
        </div> : <>
          {callerMarking ? <div className="cloud-marking-panel" role="group" aria-label="Mark your progress">
            <p>Click each box as you tick while your person hunts.</p>
            <BoxGrid name={playerAName} count={tickCounts[self] ?? 0} target={game.settings.targetBoxes} self canTick={!game.paused && (tickCounts[self] ?? 0) < game.settings.targetBoxes} onTick={onTick}/>
          </div> : <CloudField seed={(game as unknown as { layoutSeed?: unknown }).layoutSeed} mode={mode} highlightNumber={highlighted} foundNumber={found} lockedOut={lockedOut} onNumber={onNumber} connected={connected} onRequestState={requestCloudState}/>}
          <div className="cloud-action-bar">
            {callerMarking ? <p>Click the next box to mark it</p>
              : hunter && game.phase === 'hunting' ? <p>{game.huntId <= 1 ? 'Find the called number in the cloud' : 'You know the number hunt now — go!'}</p>
              : caller && game.phase === 'calling' ? <p>Tap any number in the cloud to call it</p>
              : game.phase === 'calling' ? <p>{status}</p> : game.phase === 'swapping' ? <p>Switching roles…</p> : <p>{status}</p>}
          </div>
        </>}
      </main>
      <CloudPlayerRail player={players.find(player => player.id !== self)} players={players} game={game} role={caller ? 'HUNTER' : 'CALLER'} count={tickCounts[self === playerAId ? playerBId : playerAId] ?? 0} target={game.settings.targetBoxes} wins={game.matchScore[self === playerAId ? playerBId : playerAId] ?? 0} side="right" line={speech} winnerId={ended ? winnerId : undefined}/>
    </div>
    {helpOpen && <div className="cloud-modal-backdrop" onMouseDown={event => {if (event.target === event.currentTarget) setHelpOpen(false)}}><section className="cloud-help-modal" role="dialog" aria-modal="true" aria-labelledby="cloud-help-title"><button onClick={() => setHelpOpen(false)} aria-label="Close">×</button><span className="eyebrow">A TINY RACE</span><h2 id="cloud-help-title">How to play</h2><p>Take turns calling a number and finding it in the cloud. The caller ticks boxes while the hunter searches. First to fill the progress boxes wins.</p><button className="button primary" onClick={() => setHelpOpen(false)}>Got it</button></section></div>}
  </section>;
}

function CloudPlayerRail({ player, players, game, role, count, target, wins, side, line, winnerId }: { player?: RoomView['players'][number]; players: RoomView['players']; game: CloudView; role: 'CALLER' | 'HUNTER'; count: number; target: number; wins: number; side: 'left' | 'right'; line: string; winnerId?: string }) {
  const expression = winnerId ? player?.id === winnerId ? 'celebrating' : 'sad' : role === 'HUNTER' && game.wrongTapId > 0 ? 'shocked' : role === 'HUNTER' && count === 0 && game.phase === 'hunting' ? 'worried' : 'idle';
  return <aside className={`cloud-player-rail cloud-player-rail-${side}`} data-reaction-player={player?.id}>
    <GameDoodle id={playerDoodleId(players, player)} expression={expression} playing={!['roundOver', 'matchOver'].includes(game.phase)} seed={`${player?.id}:${game.huntId}:${game.wrongTapId}`} size="clamp(150px,17vh,240px)" flip={side === 'right'} name={player?.name}/>
    <div className="cloud-rail-ledge"/><strong>{player?.name ?? (side === 'left' ? 'You' : 'Your person')}</strong><span className={`cloud-role-badge ${role === 'HUNTER' ? 'hunter' : ''}`}>{role}</span>
    <div className="cloud-rail-progress"><BoxGrid name="Progress" count={count} target={target} self={side === 'left'} compact/><span>{count} / {target}</span></div>
    <div className="cloud-rail-wins" aria-label={`${wins} round wins`}>{Array.from({length:wins},(_,i)=><i key={i}>│</i>)}<small>{wins} wins</small></div><p className="cloud-rail-line">{line}</p>
  </aside>;
}
export function CloudLobbyCard({ onStart }: { onStart: (format: 'quick' | 'bestOf3', settings: CloudSettings) => void }) {
  const [targetBoxes, setTargetBoxes] = useState<30 | 50 | 100>(100);
  const [catchBonus, setCatchBonus] = useState<0 | 1 | 2 | 3>(1);
  const [layoutMode, setLayoutMode] = useState<'hunt' | 'round'>('hunt');
  const [huntTimeoutSeconds, setHuntTimeoutSeconds] = useState<15 | 30 | 45 | 60>(45);
  const settings: CloudSettings = { targetBoxes, catchBonus, layoutMode, huntTimeoutSeconds };
  return <article className="game-card cloud-card"><div className="card-art cloud-card-art"><span>☁</span><b>64</b><i>12</i><strong>8</strong><em>93</em></div><div className="card-content"><div className="game-label">NUMBER HUNT · 2 PLAYERS</div><h3>Cloud Race</h3><p>One calls, one hunts. Tick your boxes while they search.</p>
    <div className="cloud-settings">
      <label>Target boxes <select value={targetBoxes} onChange={event => setTargetBoxes(Number(event.target.value) as 30 | 50 | 100)}><option value="30">30</option><option value="50">50</option><option value="100">100</option></select></label>
      <label>Catch bonus <select value={catchBonus} onChange={event => setCatchBonus(Number(event.target.value) as 0 | 1 | 2 | 3)}><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
      <label>Re-scatter <select value={layoutMode} onChange={event => setLayoutMode(event.target.value as 'hunt' | 'round')}><option value="hunt">Every hunt (default)</option><option value="round">Every round</option></select></label>
      <label>Hunt timeout <select value={huntTimeoutSeconds} onChange={event => setHuntTimeoutSeconds(Number(event.target.value) as 15 | 30 | 45 | 60)}><option value="15">15 sec</option><option value="30">30 sec</option><option value="45">45 sec</option><option value="60">60 sec</option></select></label>
    </div>
    <div className="card-actions"><button className="button primary" onClick={() => onStart('quick', settings)}>Quick match <span>→</span></button><button className="button text-button" onClick={() => onStart('bestOf3', settings)}>Best of 3</button></div>
  </div></article>;
}
