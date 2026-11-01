import { useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, RoomView, ServerToClientEvents } from '@arcade/shared';
import { arcadeConfig } from './config';
import { CupsGame, CupsLobbyCard } from './components/games/cups/CupsGame';

type ArcadeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const tokenKey = 'little-arcade-device';
const makeToken = () => {
  const old = localStorage.getItem(tokenKey); if (old) return old;
  const token = crypto.randomUUID(); localStorage.setItem(tokenKey, token); return token;
};
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function App() {
  const socket = useMemo<ArcadeSocket>(() => io(import.meta.env.VITE_SERVER_URL || window.location.origin, { autoConnect: true }), []);
  const [token] = useState(makeToken);
  const [name, setName] = useState(localStorage.getItem('little-arcade-name') ?? '');
  const [passcode, setPasscode] = useState('');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [joinError, setJoinError] = useState('');
  const [actionError, setActionError] = useState('');
  const [word, setWord] = useState('');
  const [hint, setHint] = useState('');

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const savedCode = sessionStorage.getItem('little-arcade-passcode');
      const savedName = localStorage.getItem('little-arcade-name');
      if (savedCode && savedName) socket.emit('enter', { name: savedName, passcode: savedCode, token });
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

  const enter = (e: React.FormEvent) => {
    e.preventDefault(); setJoinError('');
    localStorage.setItem('little-arcade-name', name.trim()); sessionStorage.setItem('little-arcade-passcode', passcode.trim());
    socket.emit('enter', { name: name.trim(), passcode: passcode.trim(), token });
  };
  const me = room?.players.find(p => p.id === room.self);
  const other = room?.players.find(p => p.id !== room.self);
  const game = room?.game;

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#home" onClick={e => { e.preventDefault(); if (room) socket.emit('backToLobby'); }}><span className="brand-icon">✦</span><span>our little <b>arcade</b></span></a><span className={`connection ${connected ? 'online' : ''}`}><i />{connected ? 'connected' : 'reconnecting…'}</span></header>
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
      <section className="room-header"><div><div className="eyebrow">YOUR SHARED LITTLE WORLD</div><h1>Hey, {me?.name || 'love'} <span>♡</span></h1><p>{arcadeConfig.greeting}</p></div>
        <div className="couple-card panel">{room.players.map((p, i) => <div className="person" key={p.id}><div className={`avatar avatar-${i}`}>{p.name[0]?.toUpperCase()}</div><div><b>{p.name}</b><small><i className={p.online ? 'dot online' : 'dot'} />{p.online ? 'here with you' : 'away for a moment'}</small></div></div>)}{!other && <div className="waiting-note">{room.status}</div>}</div>
      </section>
      {actionError && <div className="toast" role="status">{actionError}</div>}
      {game?.game === 'hangman' ? <HangmanScreen game={game} self={room.self} players={room.players} socket={socket} word={word} setWord={setWord} hint={hint} setHint={setHint} /> : game?.game === 'cups' ? <CupsGame game={game} self={room.self} players={room.players} socket={socket} /> : <section className="lobby-grid">
        <div className="games-column"><div className="section-heading"><div><div className="eyebrow">CHOOSE YOUR LITTLE ADVENTURE</div><h2>What shall we play?</h2></div><span className="tiny-sparkle">✧ ✦ ✧</span></div>
          <div className="game-cards">
            <article className="game-card hangman-card"><div className="card-art hangman-art"><span>☁</span><span className="rope">⌁</span><span className="mini-face">◡</span><b>?</b></div><div className="card-content"><div className="game-label">WORD GAME · 2 PLAYERS</div><h3>Hangman</h3><p>A secret word, six guesses, and a very cute little fellow.</p><div className="card-actions"><button className="button primary" onClick={() => socket.emit('startGame', { game: 'hangman', format: 'quick' })}>Quick round <span>→</span></button><button className="button text-button" onClick={() => socket.emit('startGame', { game: 'hangman', format: 'bestOf3' })}>Best of 3</button></div></div></article>
            <CupsLobbyCard onStart={(format, cups) => socket.emit('startGame', { game: 'cups', format, cups })} />
            <article className="game-card poison-card locked"><div className="card-art poison-art"><span>✿</span><span>?</span><span>✿</span></div><div className="card-content"><div className="game-label">A TINY BIT SNEAKY · 2 PLAYERS</div><h3>Poison Challenge</h3><p>Pick your poison and try not to find theirs.</p><button className="button soft" disabled>Coming soon <span>✦</span></button></div></article>
          </div>
          <div className="coming-row"><span>ON THE WAY</span><i>Uno Slap</i><i>Memory Duel</i><i>Draw & Guess</i></div>
        </div>
        <aside className="side-column"><div className="panel scoreboard"><div className="eyebrow">OUR LITTLE SCOREBOARD</div><h3>Wins together <span>✧</span></h3>{['hangman','cups','poison'].map((g, idx) => <div className="score-row" key={g}><span>{['☁','🥤','✿'][idx]} {['Hangman','Cup Ordering','Poison'][idx]}</span><div>{room.players.map(p => <b key={p.id}>{room.scoreboard[g as keyof typeof room.scoreboard]?.[p.id] ?? 0}</b>)}</div></div>)}<div className="score-legend">{room.players.map(p => <span key={p.id}><i className="dot online" />{p.name}</span>)}</div></div><div className="panel note-card"><span>✉</span><p>Two players. One tiny corner. Infinite rematches.</p></div></aside>
      </section>}
      <footer className="room-footer">made with love for {arcadeConfig.footerName} <span>♡</span></footer>
    </>}
  </main>;
}

function HangmanScreen({ game, self, players, socket, word, setWord, hint, setHint }: { game: Extract<NonNullable<RoomView['game']>, { game: 'hangman' }>; self: string; players: RoomView['players']; socket: ArcadeSocket; word: string; setWord: (v: string) => void; hint: string; setHint: (v: string) => void }) {
  const isSetter = self === game.roles.setter; const isGuesser = self === game.roles.guesser;
  const ended = game.phase === 'roundOver' || game.phase === 'matchOver';
  const winnerName = game.roundWinner ? players.find(player => player.id === game.roundWinner)?.name ?? 'Your person' : '';
  return <section className="game-layout"><div className="game-main"><div className="game-title-row"><button className="back-link" onClick={() => socket.emit('backToLobby')}>← Lobby</button><div className="eyebrow">A LITTLE WORD GAME · ROUND {game.round}</div><span className="round-chip">{game.format === 'bestOf3' ? `${game.matchScore[game.roles.setter]} – ${game.matchScore[game.roles.guesser]}` : 'QUICK ROUND'}</span></div>
    <div className="panel hangman-panel"><div className="role-line"><span className="role-pill">{isSetter ? '✎ WORD SETTER' : '✧ WORD GUESSEE'}</span>{game.paused && <span className="paused-label">Paused while your person reconnects</span>}</div>
      {game.phase === 'setting' && isSetter && <div className="setup-word"><h2>Choose a secret word</h2><p className="muted">A place, a meal, an in-joke… make it yours.</p><form onSubmit={e => { e.preventDefault(); socket.emit('setHangmanWord', { word, hint }); }}><label>Your secret (3–25 letters)<input autoFocus minLength={3} maxLength={25} required value={word} onChange={e => setWord(e.target.value)} placeholder="Something they might know…" /></label><label>A tiny hint <span className="optional">(optional)</span><input maxLength={100} value={hint} onChange={e => setHint(e.target.value)} placeholder="A food we love" /></label><button className="button primary" type="submit">Lock in my word <span>♡</span></button></form></div>}
      {game.phase === 'setting' && !isSetter && <div className="waiting-game"><div className="waiting-orbit">✧</div><h2>Your person is picking a word…</h2><p>Get your guessing brain ready.</p><div className="waiting-dots"><i/><i/><i/></div></div>}
      {(game.phase === 'playing' || ended) && <><div className="hangman-stage"><svg className="hangman-drawing" viewBox="0 0 220 170" role="img" aria-label={`Hangman drawing, ${game.mistakes} of 6 wrong guesses`}><path className="gallows" d="M31 154h112M59 153V18h75v18"/><path className={game.mistakes >= 1 ? 'drawn' : 'undrawn'} d="M134 36v22"/><circle className={game.mistakes >= 2 ? 'drawn' : 'undrawn'} cx="134" cy="70" r="14"/><path className={game.mistakes >= 3 ? 'drawn' : 'undrawn'} d="M134 84v36"/><path className={game.mistakes >= 4 ? 'drawn' : 'undrawn'} d="M134 94l-20 17"/><path className={game.mistakes >= 5 ? 'drawn' : 'undrawn'} d="M134 94l20 17"/><path className={game.mistakes >= 6 ? 'drawn' : 'undrawn'} d="M134 120l-17 26M134 120l17 26"/><path className="smile" d="M128 73q6 6 12 0"/><circle className="eye" cx="129" cy="67" r="1.7"/><circle className="eye" cx="139" cy="67" r="1.7"/><path className="hat" d="M119 56q15-17 30 0M116 57h36"/></svg><div className="mistake-count"><b>{game.mistakes}</b><span>/ 6</span><small>little oopsies</small></div></div>
        <div className="hint-line"><span>HINT</span> {game.hint || 'No hint this time…'}</div><div className="word-pattern" aria-label="Word pattern">{[...game.pattern].map((c, i) => c === ' ' ? <span className="letter-space" key={i} /> : <span className={`letter-slot ${c !== '_' ? 'revealed' : ''}`} key={i}>{c === '_' ? '' : c}</span>)}</div>
        {game.phase === 'playing' && isGuesser && <div className="keyboard" aria-label="Choose a letter">{alphabet.map(l => <button key={l} className={`key ${game.guessed.includes(l) ? game.wrong.includes(l) ? 'wrong-key' : 'right-key' : ''}`} disabled={game.guessed.includes(l) || game.paused} onClick={() => socket.emit('guessLetter', { letter: l })}>{l}</button>)}</div>}
        {game.phase === 'playing' && !isGuesser && <div className="setter-watch"><span>Keep them company:</span>{['😂','😬','😭','🎉'].map(e => <button key={e} aria-label={`Send ${e} reaction`} onClick={() => socket.emit('hangmanReaction', { emoji: e })}>{e}</button>)}{game.lastReaction && <small>{game.lastReaction.emoji} from {game.lastReaction.player === self ? 'you' : 'your person'}</small>}</div>}
        {ended && <div className={`round-result ${game.roundWinner === self ? 'you-won' : ''}`}><div className="result-sparkle">{game.roundWinner === self ? '✧' : '♡'}</div><h2>{game.roundWinner === self ? 'You got it!' : `${winnerName} got it!`}</h2><p>The word was <strong>{game.fullWord}</strong></p>{game.format === 'bestOf3' && <p className="match-score">Match score: {game.matchScore[game.roles.setter]} – {game.matchScore[game.roles.guesser]}</p>}<div className="result-actions"><button className="button primary" onClick={() => socket.emit('hangmanAgain')}>Play again <span>→</span></button><button className="button text-button" onClick={() => socket.emit('backToLobby')}>Back to lobby</button></div></div>}
      </>}
    </div></div><aside className="game-side"><div className="panel mini-score"><div className="eyebrow">THIS MATCH</div><h3>Little score</h3>{Object.entries(game.matchScore).map(([id, score]) => <div className="mini-score-row" key={id}><span>{id === self ? 'You' : id === game.roles.setter ? 'Your person' : 'Your person'}</span><b>{score}</b></div>)}</div><div className="panel pep-talk"><span>☾</span><p>{game.phase === 'playing' ? isGuesser ? 'You’ve got this. Think of all your little in-jokes.' : 'No pressure, just a little friendly suspense.' : 'A cozy little game, just for the two of you.'}</p></div></aside></section>;
}
