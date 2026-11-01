import { useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, RoomView, ServerToClientEvents } from '@arcade/shared';
import { arcadeConfig } from './config';
import HangmanGame from './components/games/hangman/HangmanGame';

type ArcadeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const tokenKey = 'little-arcade-device';
const makeToken = () => {
  const old = localStorage.getItem(tokenKey); if (old) return old;
  const token = crypto.randomUUID(); localStorage.setItem(tokenKey, token); return token;
};

export default function App() {
  const socket = useMemo<ArcadeSocket>(() => io(import.meta.env.VITE_SERVER_URL || window.location.origin, { autoConnect: true }), []);
  const [token] = useState(makeToken);
  const [name, setName] = useState(localStorage.getItem('little-arcade-name') ?? '');
  const [passcode, setPasscode] = useState('');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [joinError, setJoinError] = useState('');
  const [actionError, setActionError] = useState('');

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
      {game?.game === 'hangman' ? <HangmanGame game={game} self={room.self} players={room.players} socket={socket} /> : <section className="lobby-grid">
        <div className="games-column"><div className="section-heading"><div><div className="eyebrow">CHOOSE YOUR LITTLE ADVENTURE</div><h2>What shall we play?</h2></div><span className="tiny-sparkle">✧ ✦ ✧</span></div>
          <div className="game-cards">
            <article className="game-card hangman-card"><div className="card-art hangman-art"><span>☁</span><span className="rope">⌁</span><span className="mini-face">◡</span><b>?</b></div><div className="card-content"><div className="game-label">WORD GAME · 2 PLAYERS</div><h3>Hangman</h3><p>A secret word, six guesses, and a very cute little fellow.</p><div className="card-actions"><button className="button primary" onClick={() => socket.emit('startGame', { game: 'hangman', format: 'quick' })}>Quick round <span>→</span></button><button className="button text-button" onClick={() => socket.emit('startGame', { game: 'hangman', format: 'bestOf3' })}>Best of 3</button></div></div></article>
            <article className="game-card cups-card locked"><div className="card-art cup-art"><span>🥤</span><span>🫖</span><span>☕</span></div><div className="card-content"><div className="game-label">A LITTLE LOGIC · 2 PLAYERS</div><h3>Cup Ordering</h3><p>Can you find the secret arrangement?</p><button className="button soft" disabled>Coming soon <span>✦</span></button></div></article>
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
