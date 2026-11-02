import type { CSSProperties } from 'react';
import type { Socket } from 'socket.io-client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClientToServerEvents, PoisonSettings, PoisonView, RoomView, ServerToClientEvents } from '@arcade/shared';
import { CandyArt, type CandyArtState } from './CandyArt';
import { candyForTile, candyLines } from './candyConfig';
import { useCandyAudio } from './useCandyAudio';
import { ReactionBar } from '../../reactions/ReactionBar';
import { DoodleResultPair } from '../../../doodles/DoodleResultPair';
import { Doodle } from '../../../doodles/Doodle';
import { playerDoodleId } from '../../../doodles/playerDoodle';

type ArcadeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Props = { game: PoisonView; self: string; players: RoomView['players']; socket: ArcadeSocket; sameSweetMoments: number };
type SugarParticle = { id: number; tile: number; color: string; kind: 'crumb' | 'sparkle'; dx: string; dy: string };

export function PoisonGame({ game, self, players, socket, sameSweetMoments }: Props) {
  const [pendingTile, setPendingTile] = useState<number | null>(null);
  const [pendingPoisons, setPendingPoisons] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [particles, setParticles] = useState<SugarParticle[]>([]);
  const [, setClock] = useState(0);
  const { muted, toggleMute, unlock, play } = useCandyAudio();
  const particleId = useRef(0);
  const particleTimers = useRef<number[]>([]);
  const priorRevealed = useRef(new Set(game.revealed.map(tile => tile.index)));
  const priorRound = useRef(game.round);
  const priorPhase = useRef(game.phase);
  const priorLocked = useRef(!!game.myLocked);
  const opponent = game.roles.playerA === self ? game.roles.playerB : game.roles.playerA;
  const selfName = players.find(p => p.id === self)?.name ?? 'You';
  const opponentName = players.find(p => p.id === opponent)?.name ?? 'Your person';
  const ended = game.phase === 'roundOver' || game.phase === 'matchOver';
  const isMyTurn = game.currentTurn === self;
  const legalLeft = game.phase === 'playing' ? game.gridSize * game.gridSize - game.revealed.length - (game.myPoison?.length ?? game.round) : 0;
  const forced = game.phase === 'playing' && isMyTurn && legalLeft === game.round;
  const safeRevealed = useMemo(() => new Map(game.revealed.map(tile => [tile.index, tile])), [game.revealed]);
  const hitTile = ended && game.endReason === 'tapped' ? game.hitTile : undefined;
  const scoreA = game.matchScore[game.roles.playerA] ?? 0;
  const scoreB = game.matchScore[game.roles.playerB] ?? 0;
  const deadline = game.turnDeadline ?? 0;
  const timerSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const winnerName = game.roundWinner === self ? 'You' : players.find(player => player.id === game.roundWinner)?.name ?? 'Your person';
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const canSetup = game.phase === 'setup' && !game.paused && !game.myLocked;
  const canTap = game.phase === 'playing' && isMyTurn && !game.paused && !submitting;

  useEffect(() => { setPendingTile(null); setPendingPoisons([]); setSubmitting(false); }, [game.phase, game.turnNumber, game.round]);
  useEffect(() => { if (game.phase === 'setup') setPendingPoisons(game.myPick ?? []); }, [game.phase, game.myPick]);
  useEffect(() => { const id = window.setInterval(() => setClock(now => now + 1), 250); return () => window.clearInterval(id); }, []);
  useEffect(() => () => particleTimers.current.forEach(id => window.clearTimeout(id)), []);

  useEffect(() => {
    if (priorRound.current !== game.round) {
      priorRound.current = game.round;
      priorRevealed.current = new Set(game.revealed.map(tile => tile.index));
      setParticles([]);
      return;
    }
    const fresh = game.revealed.filter(tile => !priorRevealed.current.has(tile.index));
    priorRevealed.current = new Set(game.revealed.map(tile => tile.index));
    if (!fresh.length || game.phase !== 'playing') return;
    play('safe');
    if (reducedMotion) return;
    const made = fresh.flatMap(tile => {
      const color = candyForTile(tile.index, game.gridSize).color;
      return Array.from({ length: 8 }, (_, i) => {
        const angle = i * Math.PI / 4;
        return { id: ++particleId.current, tile: tile.index, color, kind: i < 6 ? 'crumb' as const : 'sparkle' as const, dx: `${Math.cos(angle) * 24}px`, dy: `${Math.sin(angle) * 24}px` };
      });
    });
    setParticles(current => [...current.filter(item => particleId.current - item.id < 40), ...made].slice(-30));
    const timeout = window.setTimeout(() => setParticles(current => current.filter(item => !made.some(p => p.id === item.id))), 900);
    particleTimers.current.push(timeout);
  }, [game.revealed, game.round, game.gridSize, game.phase, play, reducedMotion]);

  useEffect(() => {
    if (game.myLocked && !priorLocked.current) play('lock');
    priorLocked.current = !!game.myLocked;
  }, [game.myLocked, play]);

  useEffect(() => {
    const previous = priorPhase.current;
    const wasEnded = previous === 'roundOver' || previous === 'matchOver';
    if (!wasEnded && ended) {
      if (game.endReason === 'sweetTie') {
        const id = window.setTimeout(() => play('aww'), 700);
        particleTimers.current.push(id);
      } else {
        play('reveal');
        if (game.endReason === 'tapped') play('poison');
        const id = window.setTimeout(() => play(game.roundWinner === self ? 'win' : 'lose'), game.endReason === 'tapped' ? 650 : 350);
        particleTimers.current.push(id);
      }
    } else if (previous === 'setup' && game.phase === 'playing') play('reveal');
    priorPhase.current = game.phase;
  }, [game.phase, game.endReason, game.roundWinner, self, play, ended]);

  const choose = (tile: number) => {
    unlock();
    play('tap');
    if (game.phase === 'setup') {
      if (!canSetup) return;
      const next = pendingPoisons.includes(tile) ? pendingPoisons.filter(p => p !== tile) : pendingPoisons.length < game.round ? [...pendingPoisons, tile] : pendingPoisons;
      if (next === pendingPoisons) return;
      setPendingPoisons(next);
      play('select');
      socket.emit('poisonPickTile', { tile });
    } else if (canTap && !game.myPoison?.includes(tile) && !safeRevealed.has(tile)) {
      if (game.settings.confirmMode) {
        setPendingTile(current => current === tile ? null : tile);
        play('select');
      } else sendTap(tile);
    }
  };
  const sendTap = (tile = pendingTile) => {
    unlock();
    if (tile === null || !canTap || game.turnNumber === undefined) return;
    setSubmitting(true);
    window.setTimeout(() => setSubmitting(false), 900);
    socket.emit('poisonTapTile', { tile, turnNumber: game.turnNumber });
  };

  return <section className="game-layout poison-game-layout">
    <div className="game-main">
      <div className="game-title-row"><button className="back-link" onClick={() => socket.emit('backToLobby')}>← Lobby</button><div className="eyebrow">A LITTLE CANDY TRAP · ROUND {game.round}</div><span className="round-chip">{game.format === 'quick' ? 'QUICK ROUND' : `${scoreA} – ${scoreB}`}</span></div>
      <div className="panel poison-panel">
        <div className="role-line"><span className="role-pill">✿ POISON CANDY</span>{game.paused && <span className="paused-label">Paused while your person reconnects</span>}<button type="button" className="candy-mute" aria-pressed={muted} aria-label={muted ? 'Turn sounds on' : 'Mute sounds'} onClick={toggleMute}>{muted ? '♪̸ Sound off' : '♪ Sound on'}</button></div>
        {game.phase === 'setup' && <div className="poison-stage"><h2>Hide your poison</h2><p className="muted">Pick {game.round} sweets to poison, then lock them in. Your person won’t see your choices.</p>
          <p className="candy-pick-count">Choose {game.round} {game.round === 1 ? 'poison sweet' : 'poison sweets'} · {pendingPoisons.length} of {game.round} picked</p>
          <CandyTray size={game.gridSize} self={self} opponent={opponent} players={players} selected={null} selectedTiles={pendingPoisons} ownPoison={[]} opponentPoison={[]} hitTile={undefined} revealed={safeRevealed} disabled={!canSetup} showPoisonMarker onChoose={choose} particles={particles} />
          {!game.myLocked ? <button className="button primary" disabled={!canSetup || pendingPoisons.length !== game.round} onClick={() => { unlock(); socket.emit('poisonLockPick'); }}>Lock them in <span>♡</span></button> : <div className="waiting-game poison-wait"><div className="waiting-orbit">✧</div><h2>Waiting for {opponentName}…</h2><p>{game.opponentLocked ? 'Your person has picked. One moment…' : 'Your sweet little secret is safe.'}</p></div>}
        </div>}
        {game.phase === 'playing' && <>
          <div className="poison-turn-banner"><div><span className="eyebrow">{forced ? 'NO WAY OUT' : isMyTurn ? 'YOUR TURN' : `${opponentName.toUpperCase()} IS CHOOSING`}</span><h2>{forced ? 'Only the poisoned sweet is left…' : isMyTurn ? candyLines.yourTurn[game.round % candyLines.yourTurn.length] : `${opponentName} is choosing…`}</h2><p>{forced ? 'A tiny dramatic pause…' : game.revealed.length ? candyLines.safe[(game.revealed.length - 1) % candyLines.safe.length] : isMyTurn ? candyLines.thoughts[game.round % candyLines.thoughts.length] : 'Take a breath. Watch the candy tray.'}</p></div>{game.settings.timerEnabled && <div className="poison-timer" aria-label={`${timerSeconds} seconds remaining`}><b>{timerSeconds}</b><small>sec</small></div>}</div>
          <CandyTray size={game.gridSize} self={self} opponent={opponent} players={players} selected={pendingTile} selectedTiles={[]} ownPoison={game.myPoison ?? []} opponentPoison={[]} hitTile={undefined} revealed={safeRevealed} disabled={!canTap} onChoose={choose} particles={particles} />
          {isMyTurn && game.settings.confirmMode && <button className="button primary poison-confirm" disabled={!canTap || pendingTile === null} onClick={() => sendTap()}>Taste it 😬 <span>→</span></button>}
          {!isMyTurn && <ReactionBar onReact={id => socket.emit('poisonReact', { emoji: id })} />}
        </>}
        {ended && game.endReason === 'sweetTie' && <>
          <div className="sweet-tie-stage">
            <CandyTray size={game.gridSize} self={self} opponent={opponent} players={players} selected={null} selectedTiles={[]} ownPoison={game.myPoison ?? []} opponentPoison={game.opponentPoison ?? []} hitTile={undefined} revealed={safeRevealed} disabled roundReveal showPoisonMarker={false} onChoose={() => {}} particles={[]} />
            <SweetTieReveal sharedTiles={(game.myPoison ?? []).filter(tile => game.opponentPoison?.includes(tile))} gridSize={game.gridSize} self={self} opponent={opponent} players={players} selfName={selfName} opponentName={opponentName} round={game.round} onAgain={() => socket.emit('poisonNextRound')} onLobby={() => socket.emit('backToLobby')} />
          </div>
        </>}
        {ended && game.endReason !== 'sweetTie' && <>
          <CandyTray size={game.gridSize} self={self} opponent={opponent} players={players} selected={null} selectedTiles={[]} ownPoison={game.myPoison ?? []} opponentPoison={game.opponentPoison ?? []} hitTile={hitTile} revealed={safeRevealed} disabled roundReveal showPoisonMarker={false} onChoose={() => {}} particles={[]} />
          <div className={`round-result poison-result ${game.roundWinner === self ? 'you-won' : ''}`}>
          {game.roundWinner === self && <div className="candy-confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--i': i, left: `${(i * 53) % 100}%` } as CSSProperties} />)}</div>}
          <div className="result-sparkle">{game.roundWinner === self ? '✧' : '♡'}</div><DoodleResultPair players={players} winnerId={game.roundWinner}/><span className="candy-result-kicker">{game.endReason === 'tapped' ? candyLines.poison[(game.round + 1) % candyLines.poison.length] : 'round over.'}</span><h2>{winnerName} {game.roundWinner === self ? 'win this round!' : 'wins this round!'}</h2>
          <p>{game.endReason === 'forced' ? 'No safe sweets remained.' : game.loser === self ? 'Oh no, that sweet was poisoned.' : `${players.find(player => player.id === game.loser)?.name ?? 'Your person'} found the poisoned sweet.`} Both candies are revealed.</p>
          <div className="poison-reveals"><span>Yours: <b>{(game.myPoison ?? []).map(tile => `☠️ #${tile + 1}`).join(' ')}</b></span><span>{opponentName}: <b>{(game.opponentPoison ?? []).map(tile => `☠️ #${tile + 1}`).join(' ')}</b></span></div>
          <p className="match-score">{game.format === 'quick' ? 'A tiny victory for the scoreboard.' : `Match score: ${scoreA} – ${scoreB}`}</p>
          <div className="result-actions"><button className="button primary" onClick={() => socket.emit('poisonNextRound')}>{game.phase === 'matchOver' ? 'Play again' : 'Next round'} <span>→</span></button><button className="button text-button" onClick={() => socket.emit('backToLobby')}>Back to lobby</button></div>
          </div>
        </>}
      </div>
    </div>
    <aside className="game-side"><div className="panel poison-score"><div className="eyebrow">THIS MATCH</div><h3>Little score</h3>{[game.roles.playerA, game.roles.playerB].map(id => <div className="mini-score-row" key={id}><span>{id === self ? 'You' : opponentName}</span><b>{game.matchScore[id] ?? 0}</b></div>)}{game.format !== 'quick' && <div className="poison-pips">{Array.from({ length: game.format === 'bestOf5' ? 5 : 3 }, (_, index) => <i key={index} className={index < scoreA + scoreB ? 'filled' : ''} />)}</div>}<div className="same-sweet-stat"><span aria-hidden="true">♡</span> {sameSweetMoments} same-sweet moments</div></div><div className="panel pep-talk"><span>☾</span><p>{candyLines.thoughts[(game.round + (isMyTurn ? 0 : 1)) % candyLines.thoughts.length]}</p></div></aside>
  </section>;
}

function SweetTieReveal({ sharedTiles, gridSize, self, opponent, players, selfName, opponentName, round, onAgain, onLobby }: { sharedTiles: number[]; gridSize: number; self: string; opponent: string; players: RoomView['players']; selfName: string; opponentName: string; round: number; onAgain: () => void; onLobby: () => void }) {
  const copy = candyLines.sweetTie[(round - 1) % candyLines.sweetTie.length];
  const heroTile = sharedTiles[0] ?? 0;
  return <div className="sweet-tie-reveal" role="status" aria-live="polite">
    <div className="sweet-tie-confetti" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} className={i % 3 === 0 ? 'heart' : 'sparkle'} style={{ '--i': i } as CSSProperties} />)}</div>
    <div className="sweet-tie-characters"><Doodle className="smitten-doodle left" id={playerDoodleId(players, players.find(player => player.id === self))} expression="happy" size="clamp(31px,11vw,55px)" name={selfName}/><Doodle className="smitten-doodle right" id={playerDoodleId(players, players.find(player => player.id === opponent))} expression="happy" size="clamp(31px,11vw,55px)" name={opponentName}/></div>
    <div className="sweet-tie-feature" style={{ '--tie-delay': '550ms' } as CSSProperties}>
      <span className="sweet-tie-kicker">A LITTLE SECRET REVEALED</span>
      <div className="sweet-tie-candy"><CandyArt candy={candyForTile(heroTile, gridSize)} state="poison" /></div>
      <div className="sweet-tie-labels"><span><b>☠️</b>{selfName}</span><i aria-hidden="true">💗</i><span><b>☠️</b>{opponentName}</span></div>
      {sharedTiles.length > 1 && <div className="sweet-tie-extra">And you both picked {sharedTiles.slice(1).map(tile => `#${tile + 1}`).join(', ')} too</div>}
      <h2>{copy.headline}</h2><p>{copy.subline}</p>
      <div className="sweet-tie-actions"><button className="button primary" onClick={onAgain}>Play again <span>♡</span></button><button className="button text-button" onClick={onLobby}>Back to lobby</button></div>
    </div>
  </div>;
}

function CandyTray({ size, self, opponent, players, selected, selectedTiles = [], ownPoison, opponentPoison, hitTile, revealed, disabled, showPoisonMarker = false, roundReveal = false, onChoose, particles }: { size: number; self: string; opponent: string; players: RoomView['players']; selected: number | null; selectedTiles?: number[]; ownPoison: number[]; opponentPoison: number[]; hitTile?: number; revealed: Map<number, PoisonView['revealed'][number]>; disabled: boolean; showPoisonMarker?: boolean; roundReveal?: boolean; onChoose: (tile: number) => void; particles: SugarParticle[] }) {
  return <div className="candy-tray" style={{ '--grid': size } as CSSProperties} role="group" aria-label={`${size} by ${size} candy tray`}>
    {Array.from({ length: size * size }, (_, tile) => {
      const candy = candyForTile(tile, size); const eaten = revealed.get(tile); const mine = ownPoison.includes(tile);
      const isOppPoison = opponentPoison.includes(tile); const active = selected === tile || selectedTiles.includes(tile);
      const poisonLabel = roundReveal && mine ? `${players.find(p => p.id === self)?.name ?? 'Your'}'s poison` : roundReveal && isOppPoison ? `${players.find(p => p.id === opponent)?.name ?? 'Your person'}'s poison` : undefined;
      const isHit = hitTile === tile;
      const state: CandyArtState = isHit ? 'hit' : poisonLabel ? 'poison' : eaten ? 'crumbs' : 'whole';
      const eater = eaten ? players.find(p => p.id === eaten.eatenBy) : undefined;
      const revealOrder = [...ownPoison, ...opponentPoison].sort((a, b) => a - b);
      const revealDelay = `${0.15 + Math.max(0, revealOrder.indexOf(tile)) * 0.32}s`;
      const className = ['candy-tile', active ? 'selected' : '', eaten ? 'eaten' : '', mine && !roundReveal ? 'my-poison' : '', isHit ? 'poison-hit' : '', poisonLabel ? 'round-poison' : ''].filter(Boolean).join(' ');
      return <button key={tile} type="button" className={className} style={{ '--idle-delay': `${(tile % 7) * -0.17}s`, '--reveal-delay': revealDelay } as CSSProperties} disabled={disabled || !!eaten || (mine && !showPoisonMarker)} onClick={() => onChoose(tile)} aria-label={`${candy.name} #${tile + 1}${eaten ? `, tasted by ${eaten.eatenBy}` : ''}${poisonLabel ? `, ${poisonLabel}` : mine ? ', your poison' : ''}`}>
        <span className="candy-art-frame"><CandyArt candy={candy} state={state} /></span>
        <span className="candy-index">#{tile + 1}</span>
        {poisonLabel && <span className="candy-poison-label">{poisonLabel}</span>}
        {mine && !roundReveal && <span className="candy-skull-sticker">☠️</span>}
        {eaten && <><i className={`candy-eater-dot ${eater?.id === self ? 'self-dot' : 'other-dot'}`} title={`Tasted by ${eater?.name ?? 'player'}`}>{eater?.name[0]?.toUpperCase() ?? '•'}</i>{eaten.warm !== undefined && <span className="candy-temperature">{eaten.warm ? '🔥' : '❄️'}</span>}</>}
        {particles.filter(particle => particle.tile === tile).map(particle => <i key={particle.id} className={`candy-particle ${particle.kind}`} style={{ '--particle-color': particle.color, '--dx': particle.dx, '--dy': particle.dy } as CSSProperties} />)}
        {active && showPoisonMarker && <span className="candy-skull-sticker">☠️</span>}
      </button>;
    })}
  </div>;
}

export function PoisonLobbyCard({ onStart }: { onStart: (format: 'quick' | 'bestOf3' | 'bestOf5', settings: Omit<PoisonSettings, 'format'>) => void }) {
  const [gridSize, setGridSize] = useState<3 | 4 | 5>(4);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [confirmMode, setConfirmMode] = useState(true);
  const [warmCold, setWarmCold] = useState(false);
  const [tieMode, setTieMode] = useState<'replay' | 'draw'>('replay');
  const settings = { gridSize, timerEnabled, confirmMode, warmCold, tieMode };
  return <article className="game-card candy-card"><div className="card-art candy-card-art"><span><CandyArt candy={candyForTile(0, 4)} /></span><span>✦</span><span><CandyArt candy={candyForTile(1, 4)} /></span></div><div className="card-content"><div className="game-label">A LITTLE SUGAR, A LITTLE SUSPENSE · 2 PLAYERS</div><h3>Poison Candy</h3><p>The tray grows and adds poison each round.</p><div className="poison-settings"><label>Starting tray <select value={gridSize} onChange={e => setGridSize(Number(e.target.value) as 3 | 4 | 5)}><option value="3">3 × 3</option><option value="4">4 × 4</option><option value="5">5 × 5</option></select></label><label><input type="checkbox" checked={timerEnabled} onChange={e => setTimerEnabled(e.target.checked)} /> 20 second timer</label><label><input type="checkbox" checked={confirmMode} onChange={e => setConfirmMode(e.target.checked)} /> Confirm before tasting</label><label><input type="checkbox" checked={warmCold} onChange={e => setWarmCold(e.target.checked)} /> Warm / cold hints</label><label>Sweet tie rounds <select value={tieMode} onChange={e => setTieMode(e.target.value as 'replay' | 'draw')}><option value="replay">Replay (default)</option><option value="draw">Count as a draw</option></select></label></div><div className="card-actions"><button className="button primary" onClick={() => onStart('quick', settings)}>Quick round <span>→</span></button><button className="button text-button" onClick={() => onStart('bestOf3', settings)}>Best of 3</button><button className="button text-button" onClick={() => onStart('bestOf5', settings)}>Best of 5</button></div></div></article>;
}
