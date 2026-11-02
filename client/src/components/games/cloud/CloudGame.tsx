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
import { ReactionBar } from '../../reactions/ReactionBar';

type CloudSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Props = { game: CloudView; self: string; players: RoomView['players']; socket: CloudSocket };

export function CloudGame({ game, self, players, socket }: Props) {
  const [clock, setClock] = useState(Date.now());
  const { muted, toggleMute, unlock, play, resetCloudTick } = useCandyAudio();
  const { tick, optimisticTicks } = useCloudGame(game, socket);
  const priorPhase = useRef(game.phase);
  const priorWrong = useRef(game.wrongTapId);
  const priorHunt = useRef(game.huntId);
  const caller = game.roles.caller === self;
  const hunter = game.roles.hunter === self;
  const callerMarking = game.phase === 'hunting' && caller;
  const playerAId = players[0]?.id ?? game.roles.caller;
  const playerBId = players[1]?.id ?? game.roles.hunter;
  const isEnded = game.phase === 'roundOver' || game.phase === 'matchOver';
  const displayName = useCallback((id: string) => players.find(player => player.id === id)?.name ?? 'Your person', [players]);
  const target = game.targetNumber;
  const timerDeadline = game.phase === 'calling' ? game.callDeadline : game.huntDeadline;
  const seconds = Math.max(0, Math.ceil(((timerDeadline ?? 0) - clock) / 1000));
  const timerSeconds = game.paused ? Math.ceil((game.remainingMs ?? 0) / 1000) : seconds;
  const lockedOut = hunter && (game.lockoutUntil ?? 0) > clock;
  const playerAName = displayName(playerAId);
  const playerBName = displayName(playerBId);
  const winnerName = game.matchWinner ? displayName(game.matchWinner) : game.roundWinner ? displayName(game.roundWinner) : '';
  const iWon = game.matchWinner === self || game.roundWinner === self;
  const tickCounts = { ...game.tickCounts };
  if (caller && optimisticTicks) tickCounts[self] = Math.min(game.settings.targetBoxes, (tickCounts[self] ?? 0) + optimisticTicks);

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
    if (previous !== 'roundOver' && previous !== 'matchOver' && isEnded) play(game.matchWinner === self || game.roundWinner === self ? 'win' : 'lose');
    priorPhase.current = game.phase;
  }, [game.phase, game.swapReason, game.matchWinner, isEnded, self, play]);

  useEffect(() => {
    if (priorWrong.current !== game.wrongTapId && hunter) play('cloudWrong');
    priorWrong.current = game.wrongTapId;
  }, [game.wrongTapId, hunter, play]);

  useEffect(() => {
    if (priorHunt.current !== game.huntId || game.phase !== 'hunting' || !caller || game.paused) resetCloudTick();
    priorHunt.current = game.huntId;
  }, [caller, game.huntId, game.paused, game.phase, resetCloudTick]);

  const onNumber = (n: number) => {
    if (game.paused || isEnded || lockedOut) return;
    unlock();
    if (game.phase === 'calling' && caller) socket.emit('cloud:callNumber', { n, huntId: game.huntId });
    else if (game.phase === 'hunting' && hunter) socket.emit('cloud:findNumber', { n, huntId: game.huntId });
  };
  const onTick = () => {
    if (!caller || game.phase !== 'hunting' || game.paused || tickCounts[self] >= game.settings.targetBoxes) return;
    unlock();
    play('cloudTick');
    tick();
  };

  let status = '';
  if (game.phase === 'calling') status = caller ? 'Call a number' : `${displayName(game.roles.caller)} is choosing…`;
  else if (game.phase === 'hunting') status = hunter ? `FIND ${target ?? '…'}` : `${displayName(game.roles.hunter)} is hunting ${target ?? ''}!`;
  else if (game.phase === 'swapping') status = game.swapReason === 'caught' ? 'Found it!' : 'Time!';
  else status = game.phase === 'matchOver' ? 'Race complete!' : 'Round complete!';

  if (isEnded) return <section className="game-layout cloud-game-layout">
    <div className="game-main"><div className="game-title-row"><button className="back-link" onClick={() => socket.emit('cloud:backToLobby')}>← Lobby</button><div className="eyebrow">CLOUD RACE · ROUND {game.round}</div><span className="round-chip">{game.format === 'quick' ? 'QUICK MATCH' : `${game.matchScore[playerAId] ?? 0} – ${game.matchScore[playerBId] ?? 0}`}</span></div>
      <div className="panel cloud-panel"><div className="cloud-result">
        {game.matchWinner === self && <div className="cloud-confetti" aria-hidden="true">{Array.from({ length: 22 }, (_, index) => <i key={index} style={{ '--i': index } as CSSProperties} />)}</div>}
        <div className="cloud-result-spark">{game.matchWinner === self ? '✦' : '☁'}</div><span className="eyebrow">{game.phase === 'matchOver' ? 'MATCH OVER' : 'ROUND OVER'}</span>
        <h2>{game.phase === 'matchOver' ? iWon ? 'You won the race!' : `${winnerName} won the match!` : iWon ? 'You won this round!' : `${winnerName} won this round!`}</h2>
        <p>Final ticks: {playerAName} <b>{game.tickCounts[playerAId] ?? 0}</b> · {playerBName} <b>{game.tickCounts[playerBId] ?? 0}</b></p>
        <div className="cloud-result-scores"><BoxGrid name={playerAName} count={game.tickCounts[playerAId] ?? 0} target={game.settings.targetBoxes} self={playerAId === self} compact /><BoxGrid name={playerBName} count={game.tickCounts[playerBId] ?? 0} target={game.settings.targetBoxes} self={playerBId === self} compact /></div>
        <div className="result-actions"><button className="button primary" onClick={() => socket.emit('cloud:nextRound')}>{game.phase === 'matchOver' ? 'Rematch' : 'Next round'} <span>→</span></button><button className="button text-button" onClick={() => socket.emit('cloud:backToLobby')}>Back to lobby</button></div>
      </div></div>
    </div>
    <aside className="game-side"><div className="panel cloud-score-panel"><div className="eyebrow">THIS MATCH</div><h3>Scoreboard</h3><div className="mini-score-row"><span>{playerAName}</span><b>{game.matchScore[playerAId] ?? 0}</b></div><div className="mini-score-row"><span>{playerBName}</span><b>{game.matchScore[playerBId] ?? 0}</b></div></div></aside>
  </section>;

  const mode = game.phase === 'calling' && caller ? 'call' : game.phase === 'hunting' && hunter ? 'find' : 'idle';
  const highlighted = game.phase === 'hunting' && caller ? target : undefined;
  const found = game.phase === 'swapping' ? target : undefined;
  const speech = game.phase === 'calling' ? (caller ? cloudLines.caller[(game.huntId - 1) % cloudLines.caller.length] : cloudLines.hunter[(game.huntId - 1) % cloudLines.hunter.length]) : game.phase === 'hunting' ? (hunter ? cloudLines.hunting[(game.huntId - 1) % cloudLines.hunting.length] : cloudLines.hunting[(game.huntId + 1) % cloudLines.hunting.length]) : game.swapReason === 'caught' ? cloudLines.found[(game.huntId - 1) % cloudLines.found.length] : cloudLines.timeout[(game.huntId - 1) % cloudLines.timeout.length];

  return <section className={`game-layout cloud-game-layout ${callerMarking ? 'cloud-marking-only' : ''}`}>
    <div className="game-main">
      <div className="game-title-row"><button className="back-link" onClick={() => socket.emit('cloud:backToLobby')}>← Lobby</button><div className="eyebrow">CLOUD RACE · ROUND {game.round}</div><span className="round-chip">{game.format === 'quick' ? 'QUICK MATCH' : `${game.matchScore[playerAId] ?? 0} – ${game.matchScore[playerBId] ?? 0}`}</span></div>
      <div className="panel cloud-panel">
        {callerMarking ? <div className="cloud-marking-stage">
          <div className="cloud-marking-heading"><div><span>YOUR GRID</span><b>{game.paused ? 'Paused while your person reconnects' : `Check boxes while ${displayName(game.roles.hunter)} hunts for ${target}`}</b></div><div className="cloud-timer" style={{ '--cloud-timer-progress': Math.max(0, timerSeconds / game.settings.huntTimeoutSeconds) } as CSSProperties} aria-label={`${timerSeconds} seconds remaining`}><b>{timerSeconds}</b><small>sec</small></div></div>
          <div className="cloud-marking-grid"><BoxGrid name="YOUR PROGRESS" count={tickCounts[self] ?? 0} target={game.settings.targetBoxes} self canTick={!game.paused && tickCounts[self] < game.settings.targetBoxes} onTick={onTick} /></div>
        </div> : <>
        <div className="cloud-role-row"><div><span className="role-pill">CALLER · {displayName(game.roles.caller)}</span><span className="role-pill hunter-pill">HUNTER · {displayName(game.roles.hunter)}</span></div><button className="candy-mute" type="button" aria-pressed={muted} onClick={toggleMute}>{muted ? '♪̸ Sound off' : '♪ Sound on'}</button></div>
        {game.paused && <div className="paused-label cloud-paused">Paused while your person reconnects</div>}
        <StatusBar game={game} self={self} players={players} seconds={game.paused ? Math.ceil((game.remainingMs ?? 0) / 1000) : seconds} status={status} />
        {game.phase === 'hunting' && hunter && <div className="cloud-find-label">FIND <b>{target}</b></div>}
        <CloudField layout={game.layout} mode={mode} highlightNumber={highlighted} foundNumber={found} lockedOut={lockedOut} onNumber={onNumber} />
        <div className="cloud-boxes"><BoxGrid name={playerAName} count={tickCounts[playerAId] ?? 0} target={game.settings.targetBoxes} self={playerAId === self} canTick={caller && playerAId === self && game.phase === 'hunting' && !game.paused} onTick={onTick} /><BoxGrid name={playerBName} count={tickCounts[playerBId] ?? 0} target={game.settings.targetBoxes} self={playerBId === self} canTick={caller && playerBId === self && game.phase === 'hunting' && !game.paused} onTick={onTick} /></div>
        <div className="cloud-character-row"><CloudCharacter name={playerAName} side="left" line={speech} active={game.roles.caller === playerAId ? caller : hunter} /><CloudCharacter name={playerBName} side="right" line={speech} active={game.roles.caller === playerBId ? caller : hunter} /></div>
        <ReactionBar onReact={id => socket.emit('cloud:react', { emoji: id })} />
        </>}
      </div>
    </div>
    <aside className="game-side"><div className="panel cloud-score-panel"><div className="eyebrow">THIS MATCH</div><h3>Little score</h3><div className="mini-score-row"><span>{playerAName}</span><b>{game.matchScore[playerAId] ?? 0}</b></div><div className="mini-score-row"><span>{playerBName}</span><b>{game.matchScore[playerBId] ?? 0}</b></div></div><div className="panel pep-talk"><span>☁</span><p>{speech}</p></div></aside>
  </section>;
}

function CloudCharacter({ name, side, line, active }: { name: string; side: 'left' | 'right'; line: string; active: boolean }) {
  return <div className={`cloud-character ${side} ${active ? 'active' : ''}`}><svg viewBox="0 0 90 70" aria-hidden="true"><path d="M20 48c-10 0-15-7-15-16s7-16 16-16c4-10 14-14 23-10 9-8 24-5 28 7 11 1 17 9 16 19-1 9-8 15-18 15z" fill="#f5dfba" stroke="#6d5b7b" strokeWidth="3"/><circle cx="34" cy="32" r="2.5" fill="#40324e"/><circle cx="55" cy="32" r="2.5" fill="#40324e"/><path d="M38 39q7 7 14 0" fill="none" stroke="#9c5d6d" strokeWidth="2.5" strokeLinecap="round"/><ellipse cx="27" cy="38" rx="4" ry="2.4" fill="#ff9aa4"/><ellipse cx="62" cy="38" rx="4" ry="2.4" fill="#ff9aa4"/><path d="M30 12q9-8 17-2" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none"/></svg><div className="cloud-speech"><b>{name}</b><span>{line}</span></div></div>;
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
