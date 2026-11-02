import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, RoomView, ServerToClientEvents } from '@arcade/shared';
import { arcadeConfig } from './config';
import { CupsGame, CupsLobbyCard } from './components/games/cups/CupsGame';
import { PoisonGame, PoisonLobbyCard } from './components/games/poison/PoisonGame';
import { CloudGame, CloudLobbyCard } from './components/games/cloud/CloudGame';
import { FloatingReactions } from './components/reactions/FloatingReactions';
import { ReactionBar } from './components/reactions/ReactionBar';
import { SlapCountGame, SlapCountLobbyCard } from './components/games/slapcount/SlapCountGame';
import { GameScreenErrorBoundary } from './components/games/GameScreenErrorBoundary';
import { Scene, SceneSettings } from './scene/Scene';
import { sceneConfig } from './scene/config';
import { Doodle } from './doodles/Doodle';
import { DoodleResultPair } from './doodles/DoodleResultPair';
import { preloadDoodleSet } from './doodles/manifest';
import { playerDoodleId } from './doodles/playerDoodle';
import { GameDoodle } from './doodles/GameDoodle';
import { DoodlePicker, savedDoodleId } from './doodles/DoodlePicker';
import './doodles/doodles.css';
import { GameTicket } from './lobby/GameTicket';
import { gameRegistry, lobbyCopy, type LobbyGameId } from './lobby/games.config';
import { LobbyScoreboard } from './lobby/LobbyScoreboard';
import './lobby/lobby.css';
import './components/games/hangman/hangman-screen.css';

type ArcadeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const tokenKey = 'little-arcade-device';
const makeToken = () => {
  const old = localStorage.getItem(tokenKey); if (old) return old;
  const token = crypto.randomUUID(); localStorage.setItem(tokenKey, token); return token;
};
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

type LobbySettings = Record<string, string | number | boolean>;
function setting(settings: LobbySettings, key: string, fallback: string | number | boolean) { return settings[key] ?? fallback; }
function startLobbyGame(socket: ArcadeSocket, id: LobbyGameId, format: string, settings: LobbySettings) {
  if (id === 'hangman') socket.emit('startGame', { game: 'hangman', format: format as 'quick' | 'bestOf3' });
  if (id === 'cups') socket.emit('startGame', { game: 'cups', format: format as 'quick' | 'bestOf3', cups: { cupCount: Number(setting(settings, 'cupCount', 5)), maxGuesses: Number(setting(settings, 'maxGuesses', 8)), hintEnabled: Boolean(setting(settings, 'hintEnabled', false)) } });
  if (id === 'poison') socket.emit('startGame', { game: 'poison', format: format as 'quick' | 'bestOf3' | 'bestOf5', poison: { gridSize: Number(setting(settings, 'gridSize', 4)) as 3 | 4 | 5, timerEnabled: Boolean(setting(settings, 'timerEnabled', false)), confirmMode: Boolean(setting(settings, 'confirmMode', true)), warmCold: Boolean(setting(settings, 'warmCold', false)), tieMode: setting(settings, 'tieMode', 'replay') as 'replay' | 'draw' } });
  if (id === 'cloud') socket.emit('startGame', { game: 'cloud', format: format as 'quick' | 'bestOf3', cloud: { targetBoxes: Number(setting(settings, 'targetBoxes', 100)) as 30 | 50 | 100, catchBonus: Number(setting(settings, 'catchBonus', 1)) as 0 | 1 | 2 | 3, layoutMode: setting(settings, 'layoutMode', 'hunt') as 'hunt' | 'round', huntTimeoutSeconds: Number(setting(settings, 'huntTimeoutSeconds', 45)) as 15 | 30 | 45 | 60 } });
  if (id === 'slapcount') socket.emit('startGame', { game: 'slapcount', format: format as 'quick' | 'bestOf3', slapCount: { startingCards: Number(setting(settings, 'startingCards', 20)), penaltyCards: Number(setting(settings, 'penaltyCards', 2)), pace: setting(settings, 'pace', 'manual') as 'manual' | 1200 | 1000 | 800, callMode: Boolean(setting(settings, 'callMode', false)) } });
}

export default function App() {
  const socket = useMemo<ArcadeSocket>(() => {
    return io(import.meta.env.VITE_SERVER_URL || undefined);
  }, []);
  const [token] = useState(makeToken);
  const [name, setName] = useState(localStorage.getItem('little-arcade-name') ?? '');
  const [passcode, setPasscode] = useState('');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [joinError, setJoinError] = useState('');
  const [actionError, setActionError] = useState('');
  const [word, setWord] = useState('');
  const [hint, setHint] = useState('');
  const [doodlePickerOpen, setDoodlePickerOpen] = useState(false);
  const [selectedDoodle, setSelectedDoodle] = useState(savedDoodleId);
  const [muted, setMuted] = useState(() => localStorage.getItem('little-arcade-candy-muted') === 'true');
  const [greetingIndex, setGreetingIndex] = useState(0);
  const doodlePickerTrigger = useRef<HTMLButtonElement>(null);

  const profilePayload = (nameValue: string, passcodeValue: string) => ({
    name: nameValue, passcode: passcodeValue, token,
    ...(localStorage.getItem('little-arcade-share-sky') === 'false' ? { shareSky: false } : { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, shareSky: true }),
    ...(savedDoodleId() ? { doodleId: savedDoodleId()! } : {}),
  });

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const savedCode = sessionStorage.getItem('little-arcade-passcode');
      const savedName = localStorage.getItem('little-arcade-name');
      if (savedCode && savedName) socket.emit('enter', profilePayload(savedName, savedCode));
    };
    const onDisconnect = () => setConnected(false);
    const onRoomState = (s: RoomView) => { setRoom(s); setJoinError(''); setActionError(''); };
    const onJoinError = (e: string) => setJoinError(e);
    const onActionError = (e: string) => { setActionError(e); window.setTimeout(() => setActionError(''), 2800); };
    socket.on('connect', onConnect); socket.on('disconnect', onDisconnect);
    socket.on('roomState', onRoomState); socket.on('joinError', onJoinError); socket.on('actionError', onActionError);
    if (socket.connected) onConnect(); else socket.connect();
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('roomState', onRoomState); socket.off('joinError', onJoinError); socket.off('actionError', onActionError); socket.disconnect(); };
  }, [socket, token]);

  useEffect(() => {
    const syncMute = (event: Event) => setMuted((event as CustomEvent<boolean>).detail);
    window.addEventListener('little-arcade-mute', syncMute);
    return () => window.removeEventListener('little-arcade-mute', syncMute);
  }, []);
  useEffect(() => {
    if (!room || room.game) return;
    const timer = window.setInterval(() => setGreetingIndex(index => (index + 1) % Math.max(lobbyCopy.greetings.length, 1)), 9000);
    return () => window.clearInterval(timer);
  }, [room?.game, room?.self]);
  useEffect(() => {
    if (!room) return;
    void Promise.all(room.players.map(player => preloadDoodleSet(playerDoodleId(room.players, player)))).catch(() => {});
  }, [room?.self, room?.players.map(player => `${player.id}:${playerDoodleId(room.players, player)}`).join('|')]);

  const syncProfile = () => {
    const savedName = localStorage.getItem('little-arcade-name') || name.trim();
    const savedCode = sessionStorage.getItem('little-arcade-passcode');
    if (savedName && savedCode) socket.emit('enter', profilePayload(savedName, savedCode));
  };
  const toggleMute = () => setMuted(value => {
    const next = !value;
    localStorage.setItem('little-arcade-candy-muted', String(next));
    window.dispatchEvent(new CustomEvent('little-arcade-mute', { detail: next }));
    return next;
  });

  const enter = (e: React.FormEvent) => {
    e.preventDefault(); setJoinError('');
    localStorage.setItem('little-arcade-name', name.trim()); sessionStorage.setItem('little-arcade-passcode', passcode.trim());
    socket.emit('enter', profilePayload(name.trim(), passcode.trim()));
  };
  const me = room?.players.find(p => p.id === room.self);
  const other = room?.players.find(p => p.id !== room.self);
  const game = room?.game;
  // Keep the locally chosen portrait visible immediately, even while the room
  // profile update is travelling to the server and back to both clients.
  const displayPlayers = room?.players.map(player => player.id === room.self && selectedDoodle
    ? { ...player, doodleId: selectedDoodle }
    : player) ?? [];
  const canStartGame = !!room && room.players.length === 2 && room.players.every(player => player.online);

  const isQuietGame = !!game;
  const myDoodle = selectedDoodle || (room ? playerDoodleId(room.players, me) : 'her');
  const partnerDoodle = room ? playerDoodleId(room.players, room.players.find(player => player.id !== room.self)) : 'him';
  return <main className={`app-shell ${!isQuietGame ? 'scene-active' : ''} ${game ? 'game-active' : ''} ${game?.game === 'cups' ? 'cups-app-shell' : ''} ${game?.game === 'hangman' ? 'hangman-app-shell' : ''} ${game?.game === 'poison' ? 'poison-app-shell' : ''} ${game?.game === 'cloud' ? 'cloud-app-shell' : ''} ${game?.game === 'slapcount' ? 'slap-app-shell' : ''}`}>
    {!isQuietGame && <><Scene rooftop={!!room}/>{!room && <div className="scene-actors login-actors" style={{ '--doodle-left': `${sceneConfig.doodlePlacement.left}%`, '--doodle-right': `${sceneConfig.doodlePlacement.right}%`, '--doodle-bottom': `${100 - sceneConfig.doodlePlacement.baseline}%` } as React.CSSProperties}>
      <div className="scene-actor"><Doodle id={room ? myDoodle : 'sunny'} name={room ? me?.name : 'You'} size="clamp(58px, 9vw, 116px)"/><span>{room ? me?.name : 'you'}</span></div>
      <div className="scene-actor"><Doodle id={room ? partnerDoodle : 'moonbeam'} name={room ? other?.name : 'Your person'} size="clamp(58px, 9vw, 116px)"/><span>{room ? other?.name || 'your person' : 'your person'}</span></div>
    </div>}</>}
    <FloatingReactions reaction={game?.lastReaction} self={room?.self} />
    <header className="topbar"><a className="brand" href="#home" onClick={e => { e.preventDefault(); if (room) socket.emit('backToLobby'); }}><span className="brand-icon">✦</span><span>our little <b>arcade</b></span></a><div className="topbar-actions">{room && !game && <button ref={doodlePickerTrigger} type="button" className="doodle-picker-trigger" onClick={() => setDoodlePickerOpen(true)}><Doodle id={myDoodle} size={56} crop name={me?.name}/><span>Pick your doodle</span></button>}<span className={`connection ${connected ? 'online' : ''}`}><i />{connected ? 'connected' : 'reconnecting…'}</span><SceneSettings muted={muted} onMute={toggleMute} onShareSkyChange={() => syncProfile()}/></div></header>
    {!room ? <section className="landing">
      <div className="landing-copy"><div className="eyebrow"><span>✧</span> JUST FOR TWO <span>✧</span></div><h1>A little place<br />for <em>us</em> to play.</h1><p>Pick a game, settle in, and make a tiny memory together.</p><div className="floaty floaty-one">☾</div><div className="floaty floaty-two">✦</div></div>
      <form className="panel enter-card" onSubmit={enter}>
        <div className="panel-sticker">♡</div><h2>Come on in</h2><p className="muted">Your own little corner of the internet.</p>
        <label>Your name<input autoComplete="nickname" maxLength={24} required value={name} onChange={e => setName(e.target.value)} placeholder="What should I call you?" /></label>
        <label>Our shared passcode<input autoComplete="off" required type="password" value={passcode} onChange={e => setPasscode(e.target.value)} placeholder="Just between us" /></label>
        {joinError && <div className="error-box" role="alert">{joinError}</div>}
        <button className="button primary wide" type="submit">Enter our room <span>→</span></button>
        <div className="privacy-note">🔒 Just the two of you, no accounts needed.</div>
      </form>
      <footer className="landing-footer">a small soft spot on the internet <span>·</span> made with love ♡</footer>
    </section> : <>
      {!game && <section className="lobby-hero"><div className="lobby-hero-copy"><div className="eyebrow">YOUR SHARED LITTLE WORLD</div><h1>Hey, {me?.name || 'love'} <span>♡</span></h1><p>{lobbyCopy.greetings[greetingIndex % lobbyCopy.greetings.length] || arcadeConfig.greeting}</p></div><div className="lobby-hero-stage"><div className={`hero-player ${me?.online ? 'online' : 'away'}`} data-reaction-player={me?.id}><Doodle id={myDoodle} expression={me?.online ? 'happy' : 'sleepy'} size={56} crop name={me?.name}/><b>{me?.name || 'you'}</b><small><i/>{me?.online ? 'here with you' : 'away'}</small></div><div className={`hero-player ${other?.online ? 'online' : 'away'}`} data-reaction-player={other?.id}><Doodle id={partnerDoodle} expression={other?.online ? 'happy' : 'sleepy'} size={56} crop name={other?.name}/><b>{other?.name || 'partner'}</b><small><i/>{other?.online ? 'here with you' : 'away'}</small></div></div></section>}
      {!game && !canStartGame && <p className="lobby-connection-note" role="status">{room.players.length < 2 ? 'Your person needs to join the room before a game can start.' : 'Both players need to be connected before a game can start.'}</p>}
      {actionError && <div className="toast" role="status">{actionError}</div>}
      {game ? <GameScreenErrorBoundary key={game.game} onBackToLobby={() => socket.emit('backToLobby')}>
        {game.game === 'hangman' ? <HangmanScreen game={game} self={room.self} players={displayPlayers} socket={socket} word={word} setWord={setWord} hint={hint} setHint={setHint} connected={connected} muted={muted} onToggleMute={toggleMute} /> : game.game === 'cups' ? <CupsGame game={game} self={room.self} players={displayPlayers} socket={socket} /> : game.game === 'poison' ? <PoisonGame game={game} self={room.self} players={displayPlayers} socket={socket} sameSweetMoments={room.sameSweetMoments} /> : game.game === 'cloud' ? <CloudGame game={game} self={room.self} players={displayPlayers} socket={socket} connected={connected} /> : game.game === 'slapcount' ? <SlapCountGame game={game} self={room.self} players={displayPlayers} socket={socket} /> : null}
      </GameScreenErrorBoundary> : <section className="lobby-layout">
        <div className="games-column"><div className="lobby-games-heading"><div><div className="eyebrow">CHOOSE YOUR LITTLE ADVENTURE</div><h2>What shall we play?</h2></div><span className="tiny-sparkle">✧ ✦ ✧</span></div><div className="game-tickets">{gameRegistry.map(config => <GameTicket key={config.id} config={config} canPlay={canStartGame} onLaunch={(format, settings) => startLobbyGame(socket, config.id, format, settings)}/>)}</div><div className="lobby-coming-row"><span>ON THE WAY</span><i>Memory Duel</i><i>Draw &amp; Guess</i></div></div>
        <aside className="lobby-side-column"><LobbyScoreboard players={displayPlayers} self={room.self} scores={room.scoreboard} sameSweetMoments={room.sameSweetMoments}/><div className="panel note-card"><span>✉</span><p>Two players. One tiny corner. Infinite rematches.</p></div></aside>
      </section>}
      {!game && <footer className="lobby-footer">{lobbyCopy.footer}</footer>}
    </>}
    {doodlePickerOpen && room && !game && <DoodlePicker selectedId={myDoodle} onClose={() => setDoodlePickerOpen(false)} partnerId={partnerDoodle} myName={me?.name ?? 'you'} partnerName={other?.name ?? 'partner'} onChoose={id => { setSelectedDoodle(id); socket.emit('doodle:select', { doodleId: id }); }} />}
  </main>;
}

function HangmanScreen({ game, self, players, socket, word, setWord, hint, setHint, connected, muted, onToggleMute }: { game: Extract<NonNullable<RoomView['game']>, { game: 'hangman' }>; self: string; players: RoomView['players']; socket: ArcadeSocket; word: string; setWord: (v: string) => void; hint: string; setHint: (v: string) => void; connected: boolean; muted: boolean; onToggleMute: () => void }) {
  const isSetter = self === game.roles.setter; const isGuesser = self === game.roles.guesser;
  const ended = game.phase === 'roundOver' || game.phase === 'matchOver';
  const [helpOpen, setHelpOpen] = useState(false);
  const me = players.find(player => player.id === self); const partner = players.find(player => player.id !== self);
  const cleanWord = word.trim().toUpperCase(); const validWord = cleanWord.length >= 3 && cleanWord.length <= 25 && /^[A-Z ]+$/.test(cleanWord);
  const winnerName = game.roundWinner ? players.find(player => player.id === game.roundWinner)?.name ?? 'Your person' : '';
  const keyboardRows = ['ABCDEFGHI', 'JKLMNOPQR', 'STUVWXYZ'];
  useEffect(() => {
    if (!isGuesser || game.phase !== 'playing' || game.paused) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const letter = event.key.toUpperCase(); if (!/^[A-Z]$/.test(letter) || game.guessed.includes(letter)) return;
      event.preventDefault(); socket.emit('guessLetter', { letter });
    };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  }, [game.guessed, game.paused, game.phase, isGuesser, socket]);
  const back = () => { if (!ended && !window.confirm('Leave this round and go back to the lobby?')) return; socket.emit('backToLobby'); };
  const expression = (id?: string) => !connected ? 'sleepy' as const : ended && game.roundWinner === id ? 'celebrating' as const : ended && game.roundWinner ? 'sad' as const : game.phase === 'playing' && id === game.roles.guesser && game.wrong.length >= game.maxMistakes - 1 ? 'worried' as const : game.phase === 'playing' && id === game.roles.guesser && game.wrong.length > 0 ? 'thinking' as const : game.phase === 'playing' && id === game.roles.setter ? 'smug' as const : 'idle' as const;
  const Rail = ({ player, role, side }: { player?: RoomView['players'][number]; role: string; side: 'left' | 'right' }) => <aside className={`hangman-rail hangman-rail-${side}`} data-reaction-player={player?.id}>
    <GameDoodle id={playerDoodleId(players, player)} expression={expression(player?.id)} playing={game.phase === 'playing'} size="clamp(150px, 17vh, 240px)" flip={side === 'right'} name={player?.name}/>
    <div className="hangman-ledge"/><strong>{player?.name || (side === 'left' ? 'You' : 'Partner')}</strong><span className="hangman-role">{role}</span>
    <div className="hangman-tallies" aria-label={`${player ? game.matchScore[player.id] ?? 0 : 0} round wins`}>{Array.from({length: player ? game.matchScore[player.id] ?? 0 : 0},(_,i)=><i key={i} aria-hidden="true">│</i>)}<small>{player ? game.matchScore[player.id] ?? 0 : 0} wins</small></div>
  </aside>;
  return <section className="hangman-screen">
    <header className="hangman-topbar"><button className="hangman-back" onClick={back} aria-label="Back to lobby">← <span>Lobby</span></button><div className="hangman-brand"><svg viewBox="0 0 36 36" aria-hidden="true"><path d="M7 29h22M11 28V8h15v5"/><path d="M26 14v3"/><circle cx="26" cy="21" r="4"/><path d="M24 22q2 2 4 0"/></svg> Hangman</div><div className="hangman-top-actions">{game.format === 'bestOf3' && <div className="hangman-round-pips" aria-label={`Round ${game.round} of 3`}>{[1,2,3].map(n=><i className={n <= game.round ? 'active' : ''} key={n}/>)}</div>}<span className={`hangman-connection ${connected ? 'online' : ''}`} aria-label={connected ? 'Connected' : 'Reconnecting'}/><button className="hangman-icon-button" onClick={onToggleMute} aria-label={muted ? 'Unmute sound' : 'Mute sound'}>{muted ? '🔇' : '♫'}</button><button className="hangman-icon-button" onClick={()=>setHelpOpen(true)} aria-label="How to play">?</button></div></header>
    <div className="hangman-zones"><Rail player={me} role={isSetter ? 'WORD SETTER' : 'GUESSER'} side="left"/><main className="hangman-board"><div className="hangman-board-heading"><span>♡ &nbsp; A LITTLE WORD GAME</span><small>FIND THE WORD</small></div>
      {game.paused && <div className="hangman-paused" role="status">Waiting for your person to reconnect…</div>}
      {game.phase === 'setting' && isSetter && <div className="hangman-setup"><h1>Choose a secret word</h1><p>A place, a meal, an in-joke... make it yours.</p><form onSubmit={e=>{e.preventDefault(); if(validWord)socket.emit('setHangmanWord',{word,hint});}}>
        <label className="hangman-field">Your secret word <span>{cleanWord.length} / 25</span><input autoFocus maxLength={25} required value={word} onChange={e=>setWord(e.target.value)} placeholder="Something they might know…" aria-describedby="hangman-word-validation"/></label>
        <div id="hangman-word-validation" className={`hangman-validation ${word && !validWord ? 'invalid' : ''}`} aria-live="polite">{word && !validWord ? 'Use 3–25 letters and spaces.' : 'Letters and spaces only.'}</div>
        <div className="hangman-preview" aria-label="Your private masked word preview">{cleanWord.split('').map((ch,i)=>ch===' '?<i className="preview-gap" key={i}/>:<i key={i}/>)}</div>
        <label className="hangman-field hint-field">A tiny hint (optional) <span>{hint.length} / 100</span><input maxLength={100} value={hint} onChange={e=>setHint(e.target.value)} placeholder="A food we love"/></label>
        <button className="button primary hangman-lock" type="submit" disabled={!validWord}>Lock in my word <span>♡</span></button></form><div className="hangman-tip">Pick something we'd both know ♡</div></div>}
      {game.phase === 'setting' && !isSetter && <div className="hangman-waiting"><div className="hangman-thinking">?</div><h1>{partner?.name || 'Your person'} is thinking of a word...</h1><p>Get your guessing brain ready.</p></div>}
      {game.phase === 'playing' && isSetter && <div className="hangman-watching"><div className="watching-figure-group"><div className="hangman-figure-wrap"><svg className="hangman-drawing" viewBox="0 0 220 170" aria-hidden="true"><path className="gallows" d="M48 151V54Q48 43 60 43H160Q172 43 172 55V151M34 151H186"/><path className="lantern-wire" d="M110 28V13"/><path className="lantern" d="M101 13Q110 4 119 13L116 22H104Z"/><path className={game.mistakes>=1?'drawn':'undrawn'} d="M137 52v17"/><circle className={game.mistakes>=2?'drawn':'undrawn'} cx="137" cy="85" r="17"/><path className={game.mistakes>=3?'drawn':'undrawn'} d="M137 102v25"/><path className={game.mistakes>=4?'drawn':'undrawn'} d="M137 107l-17 16"/><path className={game.mistakes>=5?'drawn':'undrawn'} d="M137 107l17 16"/><path className={game.mistakes>=6?'drawn':'undrawn'} d="M137 127l-14 22M137 127l14 22"/><path className="smile" d="M130 89q7 4 14 0"/><circle className="eye" cx="131" cy="83" r="2"/><circle className="eye" cx="143" cy="83" r="2"/><path className="hat" d="M120 68q17-17 34 0M118 69h38"/></svg></div><div className="hangman-lives" aria-label={`${game.maxMistakes-game.mistakes} lives left`}>{Array.from({length:game.maxMistakes},(_,i)=><span className={i<game.maxMistakes-game.mistakes?'alive':''} aria-hidden="true" key={i}>♥</span>)}<span className="sr-only" aria-live="polite">{game.maxMistakes-game.mistakes} lives left</span></div></div><div className="watching-copy"><h1>{partner?.name || 'Your person'} is guessing...</h1><div className="hangman-secret-strip"><small>YOUR WORD</small><div className="word-pattern" role="img" aria-label={`Your word: ${[...game.pattern].map(c=>c===' '?'word break':c==='_'?'blank':c).join(', ')}`}>{[...game.pattern].map((c,i)=>c===' '?<span className="letter-space" key={i}/>:<span className={`letter-slot ${c!=='_'?'revealed':''}`} key={i}>{c==='_'?'':c}</span>)}</div></div><div className="watch-wrong" aria-label="Wrong guesses">{game.wrong.length ? game.wrong.map(l=><span key={l}>× {l}</span>) : <span className="watch-empty">No wrong guesses yet</span>}</div><p className="sr-only" aria-live="polite">{game.wrong.length ? `Wrong: ${game.wrong[game.wrong.length-1]}` : 'No wrong guesses yet'}</p></div><div className="watch-reactions"><ReactionBar label="Keep them company:" onReact={id=>socket.emit('hangmanReaction',{emoji:id})}/></div></div>}
      {((game.phase === 'playing' && isGuesser) || ended) && <div className="hangman-play">
        {game.hint && <div className="hangman-hint-bubble">{game.hint}</div>}
        <div className="hangman-figure-group"><div className="hangman-figure-wrap" style={{'--lantern-glow':String(Math.max(.16,1-game.mistakes*.13))} as React.CSSProperties}><svg className="hangman-drawing" viewBox="0 0 220 170" role="img" aria-label={`Friendly character, ${game.mistakes} of 6 wrong guesses`}><path className="gallows" d="M48 151V54Q48 43 60 43H160Q172 43 172 55V151M34 151H186"/><path className="lantern-wire" d="M110 28V13"/><path className="lantern" d="M101 13Q110 4 119 13L116 22H104Z"/><path className={game.mistakes>=1?'drawn':'undrawn'} d="M137 52v17"/><circle className={game.mistakes>=2?'drawn':'undrawn'} cx="137" cy="85" r="17"/><path className={game.mistakes>=3?'drawn':'undrawn'} d="M137 102v25"/><path className={game.mistakes>=4?'drawn':'undrawn'} d="M137 107l-17 16"/><path className={game.mistakes>=5?'drawn':'undrawn'} d="M137 107l17 16"/><path className={game.mistakes>=6?'drawn':'undrawn'} d="M137 127l-14 22M137 127l14 22"/><path className="smile" d="M130 89q7 4 14 0"/><circle className="eye" cx="131" cy="83" r="2"/><circle className="eye" cx="143" cy="83" r="2"/><path className="hat" d="M120 68q17-17 34 0M118 69h38"/></svg></div>
          <div className="hangman-lives" aria-label={`${game.maxMistakes-game.mistakes} lives left`}>{Array.from({length:game.maxMistakes},(_,i)=><span className={i<game.maxMistakes-game.mistakes?'alive':''} key={i} aria-hidden="true">♥</span>)}<span className="sr-only" aria-live="polite">{game.maxMistakes-game.mistakes} lives left</span></div></div>
        <div className="hangman-word-keyboard">
        <div className="word-pattern" role="img" aria-label={`Word: ${[...game.pattern].map(c=>c===' '?'word break':c==='_'?'blank':c).join(', ')}`}>{[...game.pattern].map((c,i)=>c===' '?<span className="letter-space" key={i}/>:<span className={`letter-slot ${c!=='_'?'revealed':''}`} key={i}>{c==='_'?'':c}</span>)}</div>
        <span className="sr-only" aria-live="polite">{game.wrong.length ? `Wrong: ${game.wrong.at(-1)}` : ''}</span>
        {game.phase==='playing' && isGuesser && <><div className="keyboard" aria-label="Choose a letter">{keyboardRows.map((row,ri)=><div className="keyboard-row" key={ri}>{row.split('').map(l=><button key={l} className={`key ${game.guessed.includes(l)?game.wrong.includes(l)?'wrong-key':'right-key':''}`} aria-label={`Letter ${l}, ${game.guessed.includes(l)?game.wrong.includes(l)?'incorrect':'correct':'not guessed yet'}`} disabled={game.guessed.includes(l)||game.paused} onClick={()=>socket.emit('guessLetter',{letter:l})}>{l}{game.guessed.includes(l)&&<small aria-hidden="true">{game.wrong.includes(l)?'×':'✓'}</small>}</button>)}</div>)}</div>{game.guessed.length===0&&<p className="keyboard-hint">Click a letter or use your keyboard</p>}</>}
        {game.phase==='playing' && !isGuesser && <ReactionBar label="Keep them company:" onReact={id=>socket.emit('hangmanReaction',{emoji:id})}/>}
        {ended && <div className={`round-result ${game.roundWinner===self?'you-won':''}`}><div className="result-sparkle">{game.roundWinner===self?'✧':'♡'}</div><DoodleResultPair players={players} winnerId={game.roundWinner}/><h2>{game.roundWinner===self?'You got it!':`${winnerName} got it!`}</h2><p>The word was <strong>{game.fullWord}</strong></p><div className="result-actions"><button className="button primary" onClick={()=>socket.emit('hangmanAgain')}>Play again <span>→</span></button><button className="button text-button" onClick={()=>socket.emit('backToLobby')}>Back to lobby</button></div></div>}
        </div>
      </div>}
    </main><Rail player={partner} role={isSetter?'GUESSER':'WORD SETTER'} side="right"/></div>
    {helpOpen && <div className="hangman-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setHelpOpen(false)}}><section className="hangman-help-modal" role="dialog" aria-modal="true" aria-labelledby="hangman-help-title"><button className="hangman-modal-close" onClick={()=>setHelpOpen(false)} aria-label="Close">×</button><h2 id="hangman-help-title">How to play</h2><p>One of you chooses a secret word. The other guesses letters. Find the word before the six hearts run out.</p><button className="button primary" onClick={()=>setHelpOpen(false)}>Got it</button></section></div>}
  </section>;
}
