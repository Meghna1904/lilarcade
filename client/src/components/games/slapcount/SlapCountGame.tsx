import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { SlapSettings, SlapView, ClientToServerEvents, RoomView, ServerToClientEvents } from '@arcade/shared';
import type { Socket } from 'socket.io-client';
import { ReactionBar } from '../../reactions/ReactionBar';
import { DoodleResultPair } from '../../../doodles/DoodleResultPair';
import { GameDoodle } from '../../../doodles/GameDoodle';
import { playerDoodleId } from '../../../doodles/playerDoodle';
import { useCandyAudio } from '../poison/useCandyAudio';
import { slapLines } from './slapConfig';
import { Card } from './Card';
import { Pile } from './Pile';
import { SlapPad } from './SlapPad';
import { useSlapCount } from './useSlapCount';
import './slapcount.css';

type ArcadeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Props = { game: SlapView; self: string; players: RoomView['players']; socket: ArcadeSocket };
const voiceKey = 'little-arcade-slap-voice';

export function SlapCountGame({ game, self, players, socket }: Props) {
  const opponent = players.find(player => player.id !== self);
  const otherId = opponent?.id ?? '';
  const selfName = players.find(player => player.id === self)?.name ?? 'You';
  const opponentName = opponent?.name ?? 'Your person';
  const selfPlayer = players.find(player => player.id === self);
  const selfDoodle = playerDoodleId(players, selfPlayer);
  const opponentDoodle = playerDoodleId(players, opponent);
  const { muted, toggleMute, unlock, play } = useCandyAudio();
  const { rttMs, clock, lay, slap, locked, laidEvent, resolvedEvent } = useSlapCount(game, self, socket);
  const [modal, setModal] = useState<'help' | 'settings' | null>(null);
  const [voiceCallOut, setVoiceCallOut] = useState(() => localStorage.getItem(voiceKey) === 'true');
  const [winConfetti, setWinConfetti] = useState(false);
  const priorCard = useRef(game.currentCardId);
  const priorResolution = useRef('');
  const priorMatchEnd = useRef('');
  const lastSpokenCard = useRef(0);
  const lastLayAt = useRef(Number.NEGATIVE_INFINITY);
  const lastSlapCard = useRef(0);
  const ended = game.phase === 'roundOver' || game.phase === 'matchOver';
  const decks = game.deckSizes;
  const scoreLine = `${game.matchScore[self] ?? 0} – ${game.matchScore[otherId] ?? 0}`;
  const callMode = game.settings.callMode;
  const lockRemaining = Math.max(0, (game.slapLockouts[self] ?? 0) - clock);
  const canLay = game.phase === 'playing' && !game.paused && self === game.turn && !ended;
  const voiceSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const liveEvent = laidEvent && laidEvent.cardId > game.currentCardId && game.phase === 'playing'
    ? laidEvent
    : laidEvent && laidEvent.cardId === game.currentCardId && game.pileSize > 0 ? laidEvent : undefined;
  const eventIsAhead = !!liveEvent && liveEvent.cardId > game.currentCardId;
  const displayedCardId = liveEvent?.cardId ?? game.currentCardId;
  const displayedCount = liveEvent ? liveEvent.count : game.pileSize > 0 ? game.currentCardCount : game.count;
  const displayedPileSize = game.pileSize + (eventIsAhead ? 1 : 0);
  const displayedPile = eventIsAhead && liveEvent
    ? [...game.topCards, liveEvent.card].slice(-3)
    : game.topCards;
  // Wrong slaps should register too; only matched cards outside their slap window are unavailable.
  // Wait for room state when the newly laid card event arrives just ahead of it.
  const canSlap = game.phase === 'playing' && !game.paused && !eventIsAhead && game.pileSize > 0 &&
    (!game.currentCardMatched || game.slapPossible || game.decisionPending) && !locked;
  const turnLine = game.paused ? 'Waiting for your person to reconnect…'
    : game.phase === 'ready' ? `Ready in ${Math.max(1, Math.ceil(((game.readyDeadline ?? clock) - clock) / 1000))}…`
      : game.phase === 'resolving' ? resolvedEvent?.winner === self ? 'You won the pile!' : `${opponentName} won the pile!`
        : self === game.turn ? 'Your turn' : `${opponentName} lays next…`;
  const speechLine = game.phase === 'ready'
    ? slapLines.waiting[(game.round - 1) % slapLines.waiting.length]
    : game.matchWindowOpen || game.decisionPending
      ? slapLines.hunting[(displayedCardId - 1) % slapLines.hunting.length]
      : slapLines.lay[(displayedCardId + 1) % slapLines.lay.length];

  useEffect(() => {
    if (priorCard.current !== game.currentCardId && game.currentCardId > 0) {
      play('slapLay');
      priorCard.current = game.currentCardId;
    }
  }, [game.currentCardId, play]);
  useEffect(() => {
    if (!resolvedEvent) return;
    const key = `${resolvedEvent.cardId}-${resolvedEvent.result}-${resolvedEvent.winner ?? resolvedEvent.loser ?? ''}`;
    if (priorResolution.current === key) return;
    priorResolution.current = key;
    if (resolvedEvent.result === 'pile') { play('slapPile'); navigator.vibrate?.([18, 24, 28]); }
    else { play('slapWrong'); navigator.vibrate?.([35, 30, 65]); }
  }, [play, resolvedEvent]);
  useEffect(() => {
    setWinConfetti(game.phase === 'matchOver' && game.matchWinner === self);
  }, [game.matchWinner, game.phase, self]);
  useEffect(() => {
    if (game.phase !== 'matchOver') return;
    const key = `${game.matchWinner ?? 'draw'}-${game.round}`;
    if (priorMatchEnd.current === key) return;
    priorMatchEnd.current = key;
    if (game.draw) play('aww');
    else play(game.matchWinner === self ? 'win' : 'lose');
  }, [game.draw, game.matchWinner, game.phase, game.round, play, self]);
  useEffect(() => {
    if (!laidEvent || laidEvent.cardId <= lastSpokenCard.current) return;
    lastSpokenCard.current = laidEvent.cardId;
    if (!voiceCallOut || muted || !voiceSupported || laidEvent.count === null) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(laidEvent.count));
    utterance.rate = 1.1;
    window.speechSynthesis.speak(utterance);
  }, [laidEvent?.cardId, muted, voiceCallOut, voiceSupported]);
  useEffect(() => {
    if (muted && voiceSupported) window.speechSynthesis.cancel();
  }, [muted, voiceSupported]);
  useEffect(() => () => {
    if (voiceSupported) window.speechSynthesis.cancel();
  }, [voiceSupported]);
  useEffect(() => {
    if (!modal) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setModal(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modal]);

  const onLay = useCallback(() => {
    const now = performance.now();
    if (!canLay || now - lastLayAt.current < 600) return;
    lastLayAt.current = now;
    unlock();
    lay();
  }, [canLay, lay, unlock]);
  const onSlap = useCallback(() => {
    const cardId = game.currentCardId;
    if (!canSlap || !cardId || lastSlapCard.current === cardId) return;
    lastSlapCard.current = cardId;
    unlock(); play('slapHit'); navigator.vibrate?.(18);
    slap(result => {
      if (result === 'ignored' || result === 'rejected') {
        if (lastSlapCard.current === cardId) lastSlapCard.current = 0;
      }
    });
    window.setTimeout(() => { if (lastSlapCard.current === cardId) lastSlapCard.current = 0; }, 900);
  }, [canSlap, game.currentCardId, play, slap, unlock]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (modal || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target as HTMLElement | null;
    const isTextEntry = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
    if (isTextEntry) return;
    if (event.code === 'Space' && canSlap) {
      if (target?.tagName === 'BUTTON') return; // Native Space activation handles a focused slap button.
      event.preventDefault(); onSlap();
    } else if ((event.key === 'Enter' || event.key.toLowerCase() === 'l') && canLay) {
      if (event.key === 'Enter' && target?.tagName === 'BUTTON') return;
      event.preventDefault(); onLay();
    }
  };
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canLay, canSlap, modal, onLay, onSlap]);

  const setVoice = (value: boolean) => {
    setVoiceCallOut(value);
    localStorage.setItem(voiceKey, String(value));
  };
  const backToLobby = () => socket.emit('slap:backToLobby');
  const nextRound = () => socket.emit('slap:nextRound');

  if (ended) return <section className="slap-count-screen slap-finished">
    <GameHeader game={game} scoreLine={scoreLine} onBack={backToLobby} onHelp={() => setModal('help')} onSettings={() => setModal('settings')} muted={muted} onMute={toggleMute} />
    <main className="slap-finish-content">
      {winConfetti && <div className="slap-confetti" aria-hidden="true">{Array.from({ length: 26 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</div>}
      <div className="slap-result-art"><Card value={game.topCards.at(-1)?.value ?? 10} suit={game.topCards.at(-1)?.suit ?? 'star'} /></div>
      <DoodleResultPair players={players} winnerId={game.draw ? undefined : game.matchWinner ?? game.roundWinner} />
      <span className="eyebrow">{game.phase === 'matchOver' ? 'MATCH OVER' : 'ROUND OVER'}</span>
      <h1>{game.draw ? 'A perfect tie!' : game.roundWinner === self ? 'You win this round!' : `${players.find(p => p.id === game.roundWinner)?.name ?? opponentName} wins this round!`}</h1>
      <p className="slap-finish-counts">{selfName} <b>{decks[self] ?? 0}</b> <span>·</span> {opponentName} <b>{decks[otherId] ?? 0}</b></p>
      {game.format === 'bestOf3' && <p className="slap-finish-score">Match score · {scoreLine}</p>}
      <div className="slap-finish-actions"><button className="button primary" onClick={nextRound}>{game.phase === 'matchOver' ? 'Rematch' : 'Next round'} <span>→</span></button><button className="button text-button" onClick={backToLobby}>Back to lobby</button></div>
    </main>
    <Modal modal={modal} onClose={() => setModal(null)} voiceSupported={voiceSupported} voiceCallOut={voiceCallOut} setVoice={setVoice} muted={muted} callMode={callMode} />
  </section>;

  return <section className="slap-count-screen">
    <GameHeader game={game} scoreLine={scoreLine} onBack={backToLobby} onHelp={() => setModal('help')} onSettings={() => setModal('settings')} muted={muted} onMute={toggleMute} />
    <main className="slap-board">
      <aside className="slap-player slap-player-me" data-reaction-player={self}>
        <span className="slap-doodle-character"><GameDoodle id={selfDoodle} expression={resolvedEvent?.result === 'wrong' && resolvedEvent.loser === self ? 'shocked' : 'idle'} playing seed={`${self}:${game.currentCardId}`} size="100%" name={selfName}/></span>
        <div className="slap-player-name"><b>{selfName}</b><small>YOU</small></div>
        <DeckButton count={decks[self] ?? 0} active={canLay} onLay={onLay} />
        <div className="slap-reactions"><ReactionBar label="React" onReact={id => socket.emit('slap:react', { emoji: id })} /></div>
      </aside>

      <section className={`slap-center ${game.phase === 'resolving' ? 'is-resolving' : ''}`}>
        <div className="slap-turn-line" aria-live="polite">{turnLine}{game.format === 'bestOf3' && <span className="slap-round-score">ROUND {game.round} · {scoreLine}</span>}</div>
        <div className="slap-calling-out" aria-live="polite">
          <span>CALLING OUT</span>
          <b key={liveEvent?.cardId ?? game.currentCardId} className="slap-call-number">{callMode ? '?' : displayedCount ?? 1}</b>
          {callMode && <small>count out loud together</small>}
        </div>
        <div className="slap-pile-wrap">
          <Pile cards={displayedPile} pileSize={displayedPileSize} onSlap={onSlap} canSlap={canSlap} cardId={displayedCardId} />
          {(game.phase === 'resolving' || resolvedEvent?.result === 'wrong') && resolvedEvent && <div className={`slap-toast ${resolvedEvent.result === 'pile' && resolvedEvent.winner === self ? 'success' : ''}`} role="status">{resolvedEvent.result === 'wrong' ? slapLines.wrong[resolvedEvent.cardId % slapLines.wrong.length] : `${players.find(p => p.id === resolvedEvent.winner)?.name ?? opponentName} ${slapLines.caught[(resolvedEvent.cardId - 1) % slapLines.caught.length]}`}</div>}
        </div>
        <div className="slap-balance" aria-label={`${decks[self] ?? 0} cards for you and ${decks[otherId] ?? 0} cards for ${opponentName}`}>
          <span>{decks[self] ?? 0} left</span><div><i style={{ width: `${Math.round(((decks[self] ?? 0) / Math.max(1, (decks[self] ?? 0) + (decks[otherId] ?? 0))) * 100)}%` }} /></div><span>{decks[otherId] ?? 0} left</span>
        </div>
        <SlapPad disabled={!canSlap} locked={locked} lockRemaining={lockRemaining} onSlap={onSlap} />
        <small className="slap-ping">fair-play ping · {Math.round(rttMs)} ms</small>
      </section>

      <aside className="slap-player slap-player-opponent" data-reaction-player={otherId}>
        <span className="slap-doodle-character opponent"><GameDoodle id={opponentDoodle} expression={resolvedEvent?.result === 'wrong' && resolvedEvent.loser === otherId ? 'shocked' : 'idle'} playing seed={`${otherId}:${game.currentCardId}`} size="100%" flip name={opponentName}/></span>
        <div className="slap-player-name"><b>{opponentName}</b><small>OPPONENT</small></div>
        <OpponentDeck name={opponentName} count={decks[otherId] ?? 0} />
        <div className="slap-speech" aria-live="polite">{game.paused ? 'waiting for you…' : speechLine}</div>
      </aside>
    </main>
    {modal && <Modal modal={modal} onClose={() => setModal(null)} voiceSupported={voiceSupported} voiceCallOut={voiceCallOut} setVoice={setVoice} muted={muted} callMode={callMode} />}
  </section>;
}

function GameHeader({ game, scoreLine, onBack, onHelp, onSettings, muted, onMute }: { game: SlapView; scoreLine: string; onBack: () => void; onHelp: () => void; onSettings: () => void; muted: boolean; onMute: () => void }) {
  return <header className="slap-game-header">
    <button className="slap-header-back" onClick={onBack} aria-label="Back to lobby">← <span>Lobby</span></button>
    <div className="slap-header-title"><b>Slap Count</b><span>{game.format === 'quick' ? 'QUICK ROUND' : `BEST OF 3 · ${scoreLine}`}</span></div>
    <div className="slap-header-actions"><button type="button" className="slap-icon-button" aria-label="How to play" onClick={onHelp}>?</button><button type="button" className="slap-icon-button" aria-label="Slap Count settings" onClick={onSettings}>⚙</button><button type="button" className="slap-sound-toggle" aria-pressed={!muted} onClick={onMute}>{muted ? '♪̸' : '♪'}<span>{muted ? 'Sound off' : 'Sound on'}</span></button></div>
  </header>;
}

function DeckButton({ count, active, onLay }: { count: number; active: boolean; onLay: () => void }) {
  return <button type="button" className={`slap-own-deck ${active ? 'active' : ''}`} onClick={onLay} disabled={!active} aria-label={`Lay a card, ${count} left`} data-lay-deck>
    <span className="slap-own-deck-art"><Card faceDown /><Card faceDown /><Card faceDown /></span>
    <b>{count} left</b><small>{active ? 'tap to lay' : 'your deck'}</small>
  </button>;
}

function OpponentDeck({ name, count }: { name: string; count: number }) {
  return <div className="slap-opponent-deck" aria-label={`${name} has ${count} cards`}>
    <span className="slap-opponent-deck-art"><Card faceDown /><Card faceDown /><Card faceDown /></span><b>{count} left</b>
  </div>;
}

function Modal({ modal, onClose, voiceSupported, voiceCallOut, setVoice, muted, callMode }: { modal: 'help' | 'settings' | null; onClose: () => void; voiceSupported: boolean; voiceCallOut: boolean; setVoice: (value: boolean) => void; muted: boolean; callMode: boolean }) {
  if (!modal) return null;
  return <div className="slap-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="slap-modal" role="dialog" aria-modal="true" aria-labelledby="slap-modal-title">
      <button type="button" className="slap-modal-close" onClick={onClose} aria-label="Close">×</button>
      {modal === 'help' ? <><span className="eyebrow">THE QUICK VERSION</span><h2 id="slap-modal-title">How to play</h2><ol><li>Tap your face-down pile on the left to put down one card.</li><li>Call the numbers from 1 to 10 as cards land, then start again at 1.</li><li>Slap when a card matches the called number, a <b>W</b> appears, or two cards in a row have the same number. The quickest slap takes the whole pile.</li><li>A wrong slap gives your person 2 cards.</li><li>If your turn comes and you have no cards left, you lose the round.</li></ol><p>Keyboard: <kbd>Enter</kbd> or <kbd>L</kbd> lays a card · <kbd>Space</kbd> slaps.</p></>
        : <><span className="eyebrow">MAKE IT YOURS</span><h2 id="slap-modal-title">Game settings</h2><p className="slap-modal-note">Call mode is {callMode ? 'on · count out loud together' : 'off'} · {muted ? 'sound is muted' : 'sound is on'}.</p>{voiceSupported && <label className="slap-voice-option"><span><b>Voice call-out</b><small>{callMode ? 'Turn call mode off to use spoken numbers.' : 'Speak each number as its card lands.'}</small></span><input type="checkbox" checked={voiceCallOut} disabled={callMode} onChange={event => setVoice(event.target.checked)} /></label>}<p className="slap-modal-note">The server adjusts for connection lag when deciding who slapped first.</p></>}
    </section>
  </div>;
}

export function SlapCountLobbyCard({ onStart }: { onStart: (format: 'quick'|'bestOf3', settings: SlapSettings) => void }) {
  const [startingCards, setStartingCards] = useState(20);
  const [pace, setPace] = useState<SlapSettings['pace']>('manual');
  const [callMode, setCallMode] = useState(false);
  const settings: SlapSettings = { startingCards, pace, callMode };
  return <article className="game-card slap-count-card"><div className="card-art slap-count-art"><span>✋</span><b>1</b><i>☾</i><strong>W</strong></div><div className="card-content"><div className="game-label">A LITTLE REFLEX RACE · 2 PLAYERS</div><h3>Slap Count</h3><p>Count 1–10. Slap a matching number, a W, or two matching cards in a row!</p><div className="slap-lobby-settings">
    <label>Starting cards<select value={startingCards} onChange={e=>setStartingCards(Number(e.target.value))}>{Array.from({length:11},(_,i)=><option key={i} value={i+10}>{i+10}</option>)}</select></label>
    <label>Turn pace<select value={pace} onChange={e=>setPace(e.target.value==='manual'?'manual':Number(e.target.value) as 1200|1000|800)}><option value="manual">Manual lay (default)</option><option value="1200">Auto · 1.2 sec</option><option value="1000">Auto · 1.0 sec</option><option value="800">Auto · 0.8 sec</option></select></label>
    <label className="slap-call-toggle"><input type="checkbox" checked={callMode} onChange={e=>setCallMode(e.target.checked)} /> Call mode · hide count</label>
  </div><div className="card-actions"><button className="button primary" onClick={()=>onStart('quick',settings)}>Quick round <span>→</span></button><button className="button text-button" onClick={()=>onStart('bestOf3',settings)}>Best of 3</button></div></div></article>;
}
