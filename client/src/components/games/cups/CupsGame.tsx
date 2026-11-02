import type { Socket } from 'socket.io-client';
import { useEffect, useState } from 'react';
import type { ClientToServerEvents, CupsView, RoomView, ServerToClientEvents } from '@arcade/shared';
import { useCupsGame } from './useCupsGame';
import { SlotRow } from './SlotRow';
import { SecretStrip } from './SecretStrip';
import { GuessHistory } from './GuessHistory';
import { ReactionBar } from '../../reactions/ReactionBar';
import { Doodle } from '../../../doodles/Doodle';
import { DoodleResultPair } from '../../../doodles/DoodleResultPair';
import { playerDoodleId } from '../../../doodles/playerDoodle';
import { GameDoodle } from '../../../doodles/GameDoodle';
import { useCandyAudio } from '../poison/useCandyAudio';
import './cups-screen.css';

type ArcadeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Player = RoomView['players'][number];

export function CupsGame({ game, self, players, socket }: { game: CupsView; self: string; players: RoomView['players']; socket: ArcadeSocket }) {
  const isArranger = self === game.roles.arranger;
  const isGuesser = self === game.roles.guesser;
  const ended = game.phase === 'roundOver' || game.phase === 'matchOver';
  const { order, selected, selectOrSwap, moveCup } = useCupsGame(game);
  const [submitting, setSubmitting] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { muted, toggleMute } = useCandyAudio();
  useEffect(() => setSubmitting(false), [game.phase, game.guessesUsed, game.round, game.paused]);
  useEffect(() => {
    const releaseSubmit = () => setSubmitting(false);
    socket.on('actionError', releaseSubmit);
    socket.on('disconnect', releaseSubmit);
    return () => { socket.off('actionError', releaseSubmit); socket.off('disconnect', releaseSubmit); };
  }, [socket]);
  useEffect(() => {
    if (!helpOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setHelpOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [helpOpen]);

  const canAct = !game.paused && !ended && !submitting;
  const submit = () => {
    if (!canAct) return;
    setSubmitting(true);
    const ack = () => setSubmitting(false);
    if (isArranger) socket.emit('cupsLockSecret', { order }, ack);
    else socket.emit('cupsSubmitGuess', { order }, ack);
  };
  const arrangedName = players.find(player => player.id === game.roles.arranger)?.name ?? 'Your person';
  const guesserName = players.find(player => player.id === game.roles.guesser)?.name ?? 'Your person';
  const winner = game.roundWinner ? players.find(player => player.id === game.roundWinner)?.name ?? 'Your person' : '';
  const pips = game.format === 'bestOf3' ? 3 : 0;
  const wins = (game.matchScore[game.roles.arranger] ?? 0) + (game.matchScore[game.roles.guesser] ?? 0);
  const me = players.find(player => player.id === self);
  const partner = players.find(player => player.id !== self);
  const guessStatus = isGuesser ? `Guess ${game.guessesUsed + 1} of ${game.maxGuesses}` : `${guesserName} is guessing… ${game.guessesUsed + 1} of ${game.maxGuesses}`;

  return <section className="cups-screen">
    <header className="cups-topbar">
      <button className="cups-back" type="button" onClick={() => socket.emit('backToLobby')} aria-label="Back to lobby">← <span>Lobby</span></button>
      <span className="cups-title"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14l-1.4 14H6.4L5 5Z"/><path d="M4 5c0-1.1 1-2 2.2-2h11.6C19 3 20 3.9 20 5"/><path d="M9 9v5m6-5v5"/></svg><b>Cup Ordering</b><small>ROUND {game.round}</small></span>
      <div className="cups-topbar-right">{pips > 0 && <div className="cups-round-pips" aria-label={`${wins} rounds won`}>{Array.from({ length: pips }, (_, index) => <i key={index} className={index < wins ? 'filled' : ''}/>)}</div>}<span className={`cups-connection-dot${game.paused ? ' offline' : ''}`} role="img" aria-label={game.paused ? 'Partner disconnected' : 'Players connected'}/><button className="cups-icon-button" type="button" aria-label={muted ? 'Turn sound on' : 'Mute sound'} onClick={toggleMute}>{muted ? '♪̸' : '♪'}</button><button className="cups-icon-button cups-help-button" type="button" aria-label="How to play" onClick={() => setHelpOpen(true)}>?</button></div>
    </header>

    <div className="cups-layout">
      <PlayerRail player={me} players={players} game={game} role={isArranger ? 'ARRANGER' : 'GUESSER'} wins={game.matchScore[self] ?? 0} side="left" winnerId={ended ? game.roundWinner : undefined} />
      <main className="cups-board">
        <div className="cups-board-inner">
          {game.paused && <div className="paused-label cups-paused">Paused while your person reconnects</div>}
          {game.phase === 'setup' && isArranger && <section className="cups-stage cups-setup-stage">
            <div className="cups-copy"><span className="eyebrow">A LITTLE LOGIC GAME · ROUND {game.round}</span><h1>Hide the cups</h1><p>Make a secret order, then lock it in.</p></div>
            <SlotRow order={order} selected={selected} onSelect={selectOrSwap} onMove={moveCup} disabled={!canAct} label="Your secret order" />
            <button className="button primary cups-primary" disabled={!canAct} onClick={submit}>Lock it in <span>♡</span></button>
          </section>}
          {game.phase === 'setup' && !isArranger && <section className="cups-waiting-stage">
            <div className="cups-waiting-curtain" aria-hidden="true"><span>☾</span><i/><b/><i/></div>
            <span className="eyebrow">A LITTLE LOGIC GAME · ROUND {game.round}</span><h1>{arrangedName} is hiding the cups…</h1><p>Get your guessing brain ready.</p>
          </section>}
          {game.phase === 'guessing' && <section className="cups-guessing-stage">
            <div className="cups-status" aria-live="polite"><span className="eyebrow">{game.phase === 'guessing' ? 'THE SHELF' : ''}</span><b>{guessStatus}</b></div>
            {isArranger && <SecretStrip secret={game.secret} />}
            {isGuesser
              ? <SlotRow order={order} selected={selected} onSelect={selectOrSwap} onMove={moveCup} disabled={!canAct} label="Build your guess" />
              : <div className="cups-arranger-watching" aria-live="polite"><span aria-hidden="true">···</span>{guesserName} is arranging a guess</div>}
            {isGuesser && game.hintEnabled && !game.hintUsed && <div className="hint-choices"><span>Need a nudge? Reveal one slot:</span>{game.cups.map((_, slot) => <button key={slot} type="button" disabled={!canAct} onClick={() => socket.emit('cupsHint', { slot })}>Slot {slot + 1}</button>)}</div>}
            {game.hint && <div className="hint-line"><span>HINT</span> Slot {game.hint.slot + 1} is <strong>{game.hint.cup}</strong>.</div>}
            {isGuesser && <button className="button primary wide-action cups-primary" disabled={!canAct || order.length !== game.cups.length} onClick={submit}>Guess <span>→</span></button>}
            {isArranger && <ReactionBar label="React:" onReact={id => socket.emit('cupsReaction', { emoji: id })} />}
            <GuessHistory guesses={game.guesses} cupCount={game.cups.length} />
          </section>}
          {ended && <div className={`round-result cups-result ${game.roundWinner === self ? 'you-won' : ''}`}><div className="result-sparkle">{game.roundWinner === self ? '✧' : '♡'}</div><DoodleResultPair players={players} winnerId={game.roundWinner}/><h2>{game.roundWinner === self ? 'You cracked it!' : `${winner} wins this round!`}</h2><p>{game.roundWinner === game.roles.guesser ? `Solved in ${game.guessesUsed} guesses.` : 'So close! The cups kept their secret.'}</p><SecretStrip secret={game.secret} revealed /><p className="match-score">{game.format === 'bestOf3' ? `Match score: ${game.matchScore[game.roles.arranger]} – ${game.matchScore[game.roles.guesser]}` : 'A tiny victory for the scoreboard.'}</p><div className="result-actions"><button className="button primary" onClick={() => socket.emit('cupsNextRound')}>{game.phase === 'matchOver' ? 'Play again' : 'Next round'} <span>→</span></button><button className="button text-button" onClick={() => socket.emit('backToLobby')}>Back to lobby</button></div></div>}
        </div>
      </main>
      <PlayerRail player={partner} players={players} game={game} role={partner?.id === game.roles.arranger ? 'ARRANGER' : 'GUESSER'} wins={partner ? game.matchScore[partner.id] ?? 0 : 0} side="right" winnerId={ended ? game.roundWinner : undefined} />
    </div>

    {helpOpen && <div className="cups-help-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setHelpOpen(false); }}><section className="cups-help-modal" role="dialog" aria-modal="true" aria-labelledby="cups-help-title"><button className="cups-help-close" type="button" onClick={() => setHelpOpen(false)} aria-label="Close how to play">×</button><span className="eyebrow">A LITTLE LOGIC GAME</span><h2 id="cups-help-title">How to play</h2><ol><li>One player hides a secret cup order.</li><li>The other player arranges a guess, then checks the score.</li><li>Use each little clue to solve the order before guesses run out.</li></ol><button className="button primary" type="button" onClick={() => setHelpOpen(false)}>Got it</button></section></div>}
  </section>;
}

function PlayerRail({ player, players, game, role, wins, side, winnerId }: { player?: Player; players: RoomView['players']; game: CupsView; role: string; wins: number; side: 'left' | 'right'; winnerId?: string }) {
  const online = player?.online ?? false;
  const expression = winnerId ? player?.id === winnerId ? 'celebrating' : 'sad' : game.phase === 'guessing' && player?.id === game.roles.guesser ? game.guessesUsed >= game.maxGuesses - 1 ? 'worried' : game.guesses.at(-1)?.correct === 0 ? 'shocked' : 'thinking' : game.phase === 'guessing' && player?.id === game.roles.arranger ? 'smug' : online ? 'idle' : 'sleepy';
  return <aside className={`cups-player-rail ${side}`}>
    <GameDoodle id={playerDoodleId(players, player)} expression={expression} playing={game.phase === 'guessing'} seed={`${player?.id}:${game.guessesUsed}`} flip={side === 'right'} size="clamp(150px, 20vh, 240px)" name={player?.name}/>
    <span className="cups-rail-ledge" aria-hidden="true"/>
    <b className="cups-player-name">{player?.name ?? (side === 'left' ? 'you' : 'partner')}</b>
    <span className="cups-role-badge">{role}</span>
    <span className="cups-rail-wins" aria-label={`${wins} round wins`}>{Array.from({ length: Math.min(wins, 5) }, (_, index) => <i key={index}/>)}<small>{wins}</small></span>
  </aside>;
}

export function CupsLobbyCard({ onStart }: { onStart: (format: 'quick' | 'bestOf3', settings: { cupCount: number; maxGuesses: number; hintEnabled: boolean }) => void }) {
  const [cupCount, setCupCount] = useState(5);
  const [maxGuesses, setMaxGuesses] = useState(8);
  const [hintEnabled, setHintEnabled] = useState(false);
  const settings = { cupCount, maxGuesses, hintEnabled };
  return <article className="game-card cups-card"><div className="card-art cup-art"><span>🥤</span><span>🫖</span><span>☕</span></div><div className="card-content"><div className="game-label">A LITTLE LOGIC · 2 PLAYERS</div><h3>Cup Ordering</h3><p>Find the secret arrangement with tiny clues.</p><div className="cups-settings"><label>Cups <select value={cupCount} onChange={event => setCupCount(Number(event.target.value))}><option value="4">4</option><option value="5">5</option><option value="6">6</option></select></label><label>Guesses <select value={maxGuesses} onChange={event => setMaxGuesses(Number(event.target.value))}><option value="6">6</option><option value="8">8</option><option value="10">10</option><option value="12">12</option></select></label><label className="hint-toggle"><input type="checkbox" checked={hintEnabled} onChange={event => setHintEnabled(event.target.checked)} /> Hint</label></div><div className="card-actions"><button className="button primary" onClick={() => onStart('quick', settings)}>Quick round <span>→</span></button><button className="button text-button" onClick={() => onStart('bestOf3', settings)}>Best of 3</button></div></div></article>;
}
