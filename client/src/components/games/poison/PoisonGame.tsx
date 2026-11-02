import type { Socket } from 'socket.io-client';
import { useEffect, useMemo, useState } from 'react';
import type { ClientToServerEvents, PoisonSettings, PoisonView, RoomView, ServerToClientEvents } from '@arcade/shared';

type ArcadeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Props = { game: PoisonView; self: string; players: RoomView['players']; socket: ArcadeSocket };
const reactions = ['😂', '😬', '😭', '🎉', '🙈'];

export function PoisonGame({ game, self, players, socket }: Props) {
  const [pendingTile, setPendingTile] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, setClock] = useState(0);
  const opponent = game.roles.playerA === self ? game.roles.playerB : game.roles.playerA;
  const opponentName = players.find(p => p.id === opponent)?.name ?? 'Your person';
  const ended = game.phase === 'roundOver' || game.phase === 'matchOver';
  const isMyTurn = game.currentTurn === self;
  const legalLeft = game.phase === 'playing' ? game.gridSize * game.gridSize - game.revealed.length - 1 : 0;
  const forced = game.phase === 'playing' && isMyTurn && legalLeft === 1;
  const safeRevealed = useMemo(() => new Map(game.revealed.map(tile => [tile.index, tile])), [game.revealed]);

  useEffect(() => { setPendingTile(null); setSubmitting(false); }, [game.phase, game.turnNumber, game.round]);
  useEffect(() => { if (game.phase === 'setup') setPendingTile(game.myPick ?? null); }, [game.phase, game.myPick]);
  useEffect(() => { const id = window.setInterval(() => setClock(now => now + 1), 250); return () => window.clearInterval(id); }, []);

  const canSetup = game.phase === 'setup' && !game.paused && !game.myLocked;
  const canTap = game.phase === 'playing' && isMyTurn && !game.paused && !submitting;
  const choose = (tile: number) => {
    if (game.phase === 'setup') {
      if (!canSetup) return;
      setPendingTile(tile);
      socket.emit('poisonPickTile', { tile });
    } else if (canTap && tile !== game.myPoison && !safeRevealed.has(tile)) {
      if (!game.settings.confirmMode) sendTap(tile);
      else setPendingTile(current => current === tile ? null : tile);
    }
  };
  const sendTap = (tile = pendingTile) => {
    if (tile === null || !canTap || game.turnNumber === undefined) return;
    setSubmitting(true);
    window.setTimeout(() => setSubmitting(false), 900);
    socket.emit('poisonTapTile', { tile, turnNumber: game.turnNumber });
  };
  const deadline = game.turnDeadline ?? 0;
  const timerSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const winnerName = game.roundWinner === self ? 'You' : players.find(p => p.id === game.roundWinner)?.name ?? 'Your person';
  const scoreA = game.matchScore[game.roles.playerA] ?? 0;
  const scoreB = game.matchScore[game.roles.playerB] ?? 0;

  return <section className="game-layout poison-game-layout">
    <div className="game-main">
      <div className="game-title-row"><button className="back-link" onClick={() => socket.emit('backToLobby')}>← Lobby</button><div className="eyebrow">A LITTLE SNEAKY GAME · ROUND {game.round}</div><span className="round-chip">{game.format === 'bestOf3' ? `${scoreA} – ${scoreB}` : 'QUICK ROUND'}</span></div>
      <div className="panel poison-panel">
        <div className="role-line"><span className="role-pill">✿ POISON CHALLENGE</span>{game.paused && <span className="paused-label">Paused while your person reconnects</span>}</div>
        {game.phase === 'setup' && <div className="poison-stage"><h2>Hide your poison</h2><p className="muted">Pick one cupcake to poison, then lock it in. Your person won’t see your choice.</p>
          <Tray size={game.gridSize} selected={pendingTile} ownPoison={null} revealed={safeRevealed} disabled={!canSetup} showPoisonMarker onChoose={choose} />
          {!game.myLocked ? <button className="button primary" disabled={!canSetup || pendingTile === null} onClick={() => socket.emit('poisonLockPick')}>Lock it in <span>♡</span></button> : <div className="waiting-game poison-wait"><div className="waiting-orbit">🙈</div><h2>Waiting for {opponentName}…</h2><p>{game.opponentLocked ? 'Your person has picked. One moment…' : 'Your poison is safe with us.'}</p></div>}
          {game.sameTileRejectedAt && <div className="poison-note" role="status">You both picked the same cupcake! Choose again together.</div>}
        </div>}
        {game.phase === 'playing' && <>
          <div className="poison-turn-banner"><div><span className="eyebrow">{forced ? 'NO WAY OUT' : isMyTurn ? 'YOUR TURN' : `${opponentName.toUpperCase()} IS CHOOSING`}</span><h2>{forced ? 'Only the poisoned cupcake is left…' : isMyTurn ? 'Pick a cupcake to eat' : `${opponentName} is choosing…`}</h2><p>{forced ? 'A little dramatic pause…' : isMyTurn ? 'Try to avoid the one your person hid.' : 'Take a breath and see what they choose.'}</p></div>{game.settings.timerEnabled && <div className="poison-timer" aria-label={`${timerSeconds} seconds remaining`}><b>{timerSeconds}</b><small>sec</small></div>}</div>
          <Tray size={game.gridSize} selected={pendingTile} ownPoison={game.myPoison ?? null} revealed={safeRevealed} disabled={!canTap} onChoose={choose} />
          {isMyTurn && game.settings.confirmMode && <button className="button primary poison-confirm" disabled={!canTap || pendingTile === null} onClick={() => sendTap()}>Eat this one <span>→</span></button>}
          {!isMyTurn && <ReactionBar onReact={emoji => socket.emit('poisonReact', { emoji })} lastReaction={game.lastReaction} self={self} />}
        </>}
        {ended && <div className={`round-result poison-result ${game.roundWinner === self ? 'you-won' : ''}`}>
          {game.roundWinner === self && <div className="poison-confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--i': i, left: `${(i * 53) % 100}%` } as React.CSSProperties} />)}</div>}
          <div className="result-sparkle">{game.roundWinner === self ? '✧' : '♡'}</div><h2>{winnerName} {game.roundWinner === self ? 'win this round!' : 'wins this round!'}</h2>
          <p>{game.loser === self ? 'Oops, you found their poison cupcake.' : `${players.find(p => p.id === game.loser)?.name ?? 'Your person'} found the poison cupcake.`} Both poisons are revealed.</p>
          <div className="poison-reveals"><span>Yours: <b>☠️ #{(game.myPoison ?? -1) + 1}</b></span><span>{opponentName}: <b>☠️ #{(game.opponentPoison ?? -1) + 1}</b></span></div>
          <p className="match-score">{game.format === 'bestOf3' ? `Match score: ${scoreA} – ${scoreB}` : 'A tiny victory for the scoreboard.'}</p>
          <div className="result-actions"><button className="button primary" onClick={() => socket.emit('poisonNextRound')}>{game.phase === 'matchOver' ? 'Play again' : 'Next round'} <span>→</span></button><button className="button text-button" onClick={() => socket.emit('backToLobby')}>Back to lobby</button></div>
        </div>}
      </div>
    </div>
    <aside className="game-side"><div className="panel poison-score"><div className="eyebrow">THIS MATCH</div><h3>Little score</h3>{[game.roles.playerA, game.roles.playerB].map(id => <div className="mini-score-row" key={id}><span>{id === self ? 'You' : opponentName}</span><b>{game.matchScore[id] ?? 0}</b></div>)}{game.format === 'bestOf3' && <div className="poison-pips"><i className={scoreA > 0 ? 'filled' : ''}/><i className={scoreB > 0 ? 'filled' : ''}/><i className={scoreA + scoreB > 1 ? 'filled' : ''}/></div>}</div><div className="panel pep-talk"><span>☾</span><p>Choose carefully. A little cupcake can hide a big surprise.</p></div></aside>
  </section>;
}

function Tray({ size, selected, ownPoison, revealed, disabled, showPoisonMarker = false, onChoose }: { size: number; selected: number | null; ownPoison: number | null; revealed: Map<number, PoisonView['revealed'][number]>; disabled: boolean; showPoisonMarker?: boolean; onChoose: (tile: number) => void }) {
  return <div className="poison-tray" style={{ '--grid': size } as React.CSSProperties} role="group" aria-label={`${size} by ${size} cupcake tray`}>
    {Array.from({ length: size * size }, (_, tile) => {
      const eaten = revealed.get(tile); const mine = ownPoison === tile; const active = selected === tile;
      return <button key={tile} type="button" className={`poison-tile ${active ? 'selected' : ''} ${eaten ? 'eaten' : ''} ${mine ? 'my-poison' : ''}`} disabled={disabled || !!eaten || mine} onClick={() => onChoose(tile)} aria-label={eaten ? `Cupcake ${tile + 1}, eaten by ${eaten.eatenBy}${eaten.warm === undefined ? '' : eaten.warm ? ', warm' : ', cold'}` : mine ? `Cupcake ${tile + 1}, your poison` : `Cupcake ${tile + 1}${active ? ', selected' : ''}`}>
        {eaten ? <><span className="tile-cake">🍰</span><small>{eaten.warm === undefined ? '' : eaten.warm ? '🔥' : '❄️'}</small></> : mine ? <><span className="tile-cake">🧁</span><b>☠</b></> : <><span className="tile-cake">🧁</span>{active && showPoisonMarker && <b className="poison-pick-mark">☠</b>}</>}
      </button>;
    })}
  </div>;
}

function ReactionBar({ onReact, lastReaction, self }: { onReact: (emoji: string) => void; lastReaction?: PoisonView['lastReaction']; self: string }) {
  return <div className="poison-reaction-bar"><span>Keep them company:</span>{reactions.map(emoji => <button key={emoji} aria-label={`Send ${emoji} reaction`} onClick={() => onReact(emoji)}>{emoji}</button>)}{lastReaction && <small>{lastReaction.emoji} from {lastReaction.player === self ? 'you' : 'your person'}</small>}</div>;
}

export function PoisonLobbyCard({ onStart }: { onStart: (format: 'quick' | 'bestOf3', settings: Omit<PoisonSettings, 'format'>) => void }) {
  const [gridSize, setGridSize] = useState<3 | 4 | 5>(4);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [confirmMode, setConfirmMode] = useState(true);
  const [warmCold, setWarmCold] = useState(false);
  const settings = { gridSize, timerEnabled, confirmMode, warmCold };
  return <article className="game-card poison-card"><div className="card-art poison-art"><span>🧁</span><span>☠</span><span>🧁</span></div><div className="card-content"><div className="game-label">A TINY BIT SNEAKY · 2 PLAYERS</div><h3>Poison Challenge</h3><p>Pick your poison and try not to find theirs.</p><div className="poison-settings"><label>Tray <select value={gridSize} onChange={e => setGridSize(Number(e.target.value) as 3 | 4 | 5)}><option value="3">3 × 3</option><option value="4">4 × 4</option><option value="5">5 × 5</option></select></label><label><input type="checkbox" checked={timerEnabled} onChange={e => setTimerEnabled(e.target.checked)} /> 20 second timer</label><label><input type="checkbox" checked={confirmMode} onChange={e => setConfirmMode(e.target.checked)} /> Confirm before eating</label><label><input type="checkbox" checked={warmCold} onChange={e => setWarmCold(e.target.checked)} /> Warm / cold hints</label></div><div className="card-actions"><button className="button primary" onClick={() => onStart('quick', settings)}>Quick round <span>→</span></button><button className="button text-button" onClick={() => onStart('bestOf3', settings)}>Best of 3</button></div></div></article>;
}
