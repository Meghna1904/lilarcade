import type { Socket } from 'socket.io-client';
import { useEffect, useState } from 'react';
import type { ClientToServerEvents, CupsView, RoomView, ServerToClientEvents } from '@arcade/shared';
import { useCupsGame } from './useCupsGame';
import { SlotRow } from './SlotRow';
import { SecretStrip } from './SecretStrip';
import { GuessHistory } from './GuessHistory';
import { ReactionBar } from './ReactionBar';

type ArcadeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function CupsGame({ game, self, players, socket }: { game: CupsView; self: string; players: RoomView['players']; socket: ArcadeSocket }) {
  const isArranger = self === game.roles.arranger;
  const isGuesser = self === game.roles.guesser;
  const ended = game.phase === 'roundOver' || game.phase === 'matchOver';
  const { order, selected, selectOrSwap, moveCup } = useCupsGame(game);
  const winner = game.roundWinner ? players.find(player => player.id === game.roundWinner)?.name ?? 'Your person' : '';
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => setSubmitting(false), [game.phase, game.guessesUsed, game.round]);
  const canAct = !game.paused && !ended && !submitting;
  const submit = () => { setSubmitting(true); if (isArranger) socket.emit('cupsLockSecret', { order }); else socket.emit('cupsSubmitGuess', { order }); };
  return <section className="game-layout cups-game-layout"><div className="game-main"><div className="game-title-row"><button className="back-link" onClick={() => socket.emit('backToLobby')}>← Lobby</button><div className="eyebrow">A LITTLE LOGIC GAME · ROUND {game.round}</div><span className="round-chip">{game.format === 'bestOf3' ? `${game.matchScore[game.roles.arranger]} – ${game.matchScore[game.roles.guesser]}` : 'QUICK ROUND'}</span></div>
    <div className="panel cups-panel"><div className="role-line"><span className="role-pill">{isArranger ? '✎ ARRANGER' : '✧ GUESSER'}</span>{game.paused && <span className="paused-label">Paused while your person reconnects</span>}</div>
      {game.phase === 'setup' && isArranger && <div className="cups-stage"><h2>Hide the cups</h2><p className="muted">Make a secret order, then lock it in. Your person can’t peek.</p><SlotRow order={order} selected={selected} onSelect={selectOrSwap} onMove={moveCup} disabled={!canAct} label="Your secret order" /><SecretStrip secret={order} /><button className="button primary" disabled={!canAct} onClick={submit}>Lock it in <span>♡</span></button></div>}
      {game.phase === 'setup' && !isArranger && <div className="waiting-game cups-waiting"><div className="cup-curtain">🙈</div><h2>{players.find(player => player.id === game.roles.arranger)?.name ?? 'Your person'} is hiding the cups…</h2><p>Listen for the little shuffle under the cloth.</p><div className="waiting-dots"><i/><i/><i/></div></div>}
      {game.phase === 'guessing' && <><div className="cups-status"><b>Guess {game.guessesUsed + 1} of {game.maxGuesses}</b><span>{isGuesser ? 'Your turn to arrange the cups.' : 'Watch the clues arrive.'}</span></div>{isArranger && <SecretStrip secret={game.secret} />}<SlotRow order={order} selected={selected} onSelect={selectOrSwap} onMove={moveCup} disabled={!isGuesser || !canAct} label={isGuesser ? 'Build your guess' : 'The guesser is arranging…'} />{isGuesser && game.hintEnabled && !game.hintUsed && <div className="hint-choices"><span>Need a nudge? Reveal one slot:</span>{game.cups.map((_, slot) => <button key={slot} type="button" disabled={!canAct} onClick={() => socket.emit('cupsHint', { slot })}>Slot {slot + 1}</button>)}</div>}{game.hint && <div className="hint-line"><span>HINT</span> Slot {game.hint.slot + 1} is <strong>{game.hint.cup}</strong>.</div>}{isGuesser && <button className="button primary wide-action" disabled={!canAct || order.length !== game.cups.length} onClick={submit}>Make my guess <span>→</span></button>}{isArranger && <ReactionBar onReact={emoji => socket.emit('cupsReaction', { emoji })} lastReaction={game.lastReaction} />}</>}
      {ended && <div className={`round-result ${game.roundWinner === self ? 'you-won' : ''}`}><div className="result-sparkle">{game.roundWinner === self ? '✧' : '♡'}</div><h2>{game.roundWinner === self ? 'You cracked it!' : `${winner} wins this round!`}</h2><p>{game.roundWinner === game.roles.guesser ? `Solved in ${game.guessesUsed} guesses.` : 'So close! The cups kept their secret.'}</p><SecretStrip secret={game.secret} revealed /><p className="match-score">{game.format === 'bestOf3' ? `Match score: ${game.matchScore[game.roles.arranger]} – ${game.matchScore[game.roles.guesser]}` : 'A tiny victory for the scoreboard.'}</p><div className="result-actions"><button className="button primary" onClick={() => socket.emit('cupsNextRound')}>{game.phase === 'matchOver' ? 'Play again' : 'Next round'} <span>→</span></button><button className="button text-button" onClick={() => socket.emit('backToLobby')}>Back to lobby</button></div></div>}
    </div></div><aside className="game-side"><GuessHistory guesses={game.guesses} cupCount={game.cups.length} /><div className="panel mini-score"><div className="eyebrow">THIS MATCH</div><h3>Little score</h3>{Object.entries(game.matchScore).map(([id, score]) => <div className="mini-score-row" key={id}><span>{id === self ? 'You' : 'Your person'}</span><b>{score}</b></div>)}</div><div className="panel pep-talk"><span>☾</span><p>{game.phase === 'guessing' ? isGuesser ? 'Trust your instincts. The cups are cheering for you.' : 'No pressure, just a little friendly suspense.' : 'A cozy little game, just for the two of you.'}</p></div></aside></section>;
}

export function CupsLobbyCard({ onStart }: { onStart: (format: 'quick' | 'bestOf3', settings: { cupCount: number; maxGuesses: number; hintEnabled: boolean }) => void }) {
  const [cupCount, setCupCount] = useState(5);
  const [maxGuesses, setMaxGuesses] = useState(8);
  const [hintEnabled, setHintEnabled] = useState(false);
  return <article className="game-card cups-card"><div className="card-art cup-art"><span>🥤</span><span>🫖</span><span>☕</span></div><div className="card-content"><div className="game-label">A LITTLE LOGIC · 2 PLAYERS</div><h3>Cup Ordering</h3><p>Find the secret arrangement with tiny clues.</p><div className="cups-settings"><label>Cups <select value={cupCount} onChange={event => setCupCount(Number(event.target.value))}><option value="4">4</option><option value="5">5</option><option value="6">6</option></select></label><label>Guesses <select value={maxGuesses} onChange={event => setMaxGuesses(Number(event.target.value))}><option value="6">6</option><option value="8">8</option><option value="10">10</option><option value="12">12</option></select></label><label className="hint-toggle"><input type="checkbox" checked={hintEnabled} onChange={event => setHintEnabled(event.target.checked)} /> Hint</label></div><div className="card-actions"><button className="button primary" onClick={() => onStart('quick', { cupCount, maxGuesses, hintEnabled })}>Quick round <span>→</span></button><button className="button text-button" onClick={() => onStart('bestOf3', { cupCount, maxGuesses, hintEnabled })}>Best of 3</button></div></div></article>;
}
