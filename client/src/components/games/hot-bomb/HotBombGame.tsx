import { useEffect, useRef, useState } from 'react';
import type { HotBombAction, HotBombView, RoomView, ClientToServerEvents, ServerToClientEvents } from '@arcade/shared';
import type { Socket } from 'socket.io-client';
import { Doodle } from '../../../doodles/Doodle';
import { useCandyAudio } from '../poison/useCandyAudio';

type Props = { game: HotBombView; self: string; players: RoomView['players']; socket: Socket<ServerToClientEvents, ClientToServerEvents> };

export function HotBombGame({ game, self, players, socket }: Props) {
  const otherId = self === game.playerA ? game.playerB : game.playerA;
  const me = players.find(player => player.id === self);
  const other = players.find(player => player.id === otherId);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState('');
  const [goUntil, setGoUntil] = useState(0);
  const { muted, toggleMute, unlock, play } = useCandyAudio();
  const handledEventId = useRef(game.lastEvent?.id ?? 0);
  const previousCountdown = useRef(0);
  const targetWins = game.format === 'quick' ? 1 : game.format === 'bestOf3' ? 2 : 3;
  const opponentName = other?.name ?? 'Your person';
  const ownName = me?.name ?? 'You';
  const countdown = game.countdownEndsAt ? Math.max(1, Math.ceil((game.countdownEndsAt - now) / 1000)) : 0;
  const phaseNeedsClock = game.phase === 'countdown' || game.phase === 'playing' || !!game.flight;

  useEffect(() => {
    if (!phaseNeedsClock) return;
    const timer = window.setInterval(() => setNow(Date.now()), 24);
    return () => window.clearInterval(timer);
  }, [phaseNeedsClock]);

  useEffect(() => {
    if (!game.lastEvent || game.lastEvent.id <= handledEventId.current) return;
    const event = game.lastEvent;
    handledEventId.current = event.id;
    if (event.type === 'go') { setGoUntil(Date.now() + 680); setNotice(''); play('bombCountdown'); }
    if (event.type === 'launched') play('bombPass');
    if (event.type === 'dodge') {
      play('bombDodge');
      if (event.player === self) setNotice('Dodge!');
    }
    if (event.type === 'feintReversed' && event.player === self) setNotice('That was a feint!');
    if (event.type === 'boom') play('bombBoom');
  }, [game.lastEvent, play, self]);

  useEffect(() => {
    if (game.phase !== 'playing' || game.paused) return;
    let timer = 0;
    let cancelled = false;
    const scheduleTick = () => {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        play('bombTick');
        scheduleTick();
      }, 830 + Math.random() * 80 - 40);
    };
    scheduleTick();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [game.phase, game.paused, play]);

  useEffect(() => {
    if (countdown > 0 && countdown !== previousCountdown.current) {
      previousCountdown.current = countdown;
      play('bombCountdown');
    } else if (countdown === 0) previousCountdown.current = 0;
  }, [countdown, play]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 1_250);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (game.phase !== 'playing') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const key = event.key.toLowerCase();
      const action: HotBombAction | undefined = key === ' ' || key === 'spacebar' ? 'pass' : key === 'd' ? 'dodge' : key === 'f' ? 'feint' : undefined;
      if (!action) return;
      if (action === 'pass' && !game.canPass || action === 'dodge' && !game.canDodge || action === 'feint' && !game.canFeint) return;
      event.preventDefault();
      void unlock();
      socket.emit('hotbomb:action', { action });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [game.canDodge, game.canFeint, game.canPass, game.phase, socket, unlock]);

  const act = (action: HotBombAction) => { void unlock(); socket.emit('hotbomb:action', { action }); };
  const flight = game.flight;
  const flightProgress = flight ? Math.min(1, Math.max(0, (now - flight.startedAt) / Math.max(1, flight.durationMs))) : 0;
  let bombX = game.holder === self ? 74 : 26;
  let bombY = game.holder === self ? 76 : 24;
  if (flight) {
    const fromSelf = flight.from === self;
    bombX = fromSelf ? 74 - flightProgress * 48 : 26 + flightProgress * 48;
    bombY = fromSelf ? 76 - flightProgress * 52 : 24 + flightProgress * 52;
  }
  const status = game.paused ? 'Waiting for your person to reconnect…'
    : game.phase === 'countdown' ? 'Ready your thumbs…'
    : game.phase === 'playing' && !!game.flight?.reversed && game.lastEvent?.type === 'feintReversed' && game.lastEvent.player === self ? 'That was a feint!'
    : game.phase === 'playing' && !!game.flight && game.lastEvent?.type === 'dodge' && game.lastEvent.player === self ? 'Dodge!'
    : game.phase === 'playing' && game.flight?.to === self ? 'Incoming!'
    : game.phase === 'playing' && game.flight ? 'Bomb on the move…'
    : game.phase === 'playing' && game.holder === self && game.gripLocked ? 'Gripping…'
    : game.phase === 'playing' && game.holder === self ? 'You have the bomb!'
    : game.phase === 'playing' ? `${opponentName} has the bomb` : '';
  const resultText = game.boomMode === 'held' ? `${game.loser === self ? 'You' : opponentName} was holding it.`
    : game.boomMode === 'feint' ? `${game.loser === self ? 'You' : opponentName} got caught on the feint.`
    : `${game.loser === self ? 'You' : opponentName} caught it mid-flight.`;

  return <section className="hot-bomb-screen">
    <header className="hb-header">
      <button className="hb-back" type="button" onClick={() => socket.emit('backToLobby')}>Back to arcade</button>
      <h1>Hot Bomb</h1>
      <button className="hb-sound" type="button" aria-pressed={!muted} aria-label={muted ? 'Turn sound on' : 'Mute sound'} onClick={toggleMute}>{muted ? '♪̸' : '♫'}<span>{muted ? 'Sound off' : 'Sound on'}</span></button>
    </header>

    <main className="hb-shell">
      <div className="hb-scoreline" aria-label="Match score">
        <ScorePlayer player={other} score={game.matchScore[otherId] ?? 0} target={targetWins} own={false}/>
        <div className="hb-round-chip"><span>{game.format === 'quick' ? 'QUICK' : game.format === 'bestOf3' ? 'BEST OF 3' : 'BEST OF 5'}</span><b>ROUND {game.round}</b></div>
        <ScorePlayer player={me} score={game.matchScore[self] ?? 0} target={targetWins} own/>
      </div>

      {game.phase === 'roundOver' || game.phase === 'matchOver' ? <section className={`hb-result ${game.phase === 'matchOver' ? 'match-over' : ''}`}>
        <div className="hb-result-burst" aria-hidden="true">✦</div>
        <p className="hb-overline">{game.phase === 'matchOver' ? 'MATCH OVER' : `ROUND ${game.round} RESULT`}</p>
        <h2>BOOM!</h2>
        <p className="hb-result-copy">{resultText}</p>
        {game.phase === 'matchOver' && <strong className="hb-match-winner">{game.winner === self ? 'You win the match!' : `${opponentName} wins the match!`}</strong>}
        <div className="hb-result-score"><span>{opponentName} <b>{game.matchScore[otherId] ?? 0}</b></span><i>VS</i><span>{ownName} <b>{game.matchScore[self] ?? 0}</b></span></div>
        {game.fuseLengthMs !== undefined && <p className="hb-fuse-fact">Fuse was {(game.fuseLengthMs / 1000).toFixed(1)} seconds.</p>}
        <button className="hb-primary" type="button" onClick={() => socket.emit('hotbomb:next')}>{game.phase === 'matchOver' ? 'Rematch' : 'Next round'}</button>
        <button className="hb-quiet-button" type="button" onClick={() => socket.emit('backToLobby')}>Back to lobby</button>
      </section> : <>
        <section className={`hb-arena ${game.phase === 'countdown' ? 'is-countdown' : ''}`} style={{ '--bomb-x': `${bombX}%`, '--bomb-y': `${bombY}%` } as React.CSSProperties} aria-label="Hot Bomb arena">
          <ArenaPlayer player={other} holder={game.holder === otherId} incoming={flight?.to === otherId} label={game.holder === otherId ? 'Has the bomb' : ''} side="opponent"/>
          <ArenaPlayer player={me} holder={game.holder === self} incoming={flight?.to === self} label={game.holder === self ? 'Has the bomb' : ''} side="self"/>
          <div className={`hb-bomb ${flight ? 'in-flight' : ''}`} aria-hidden="true"><BombArt/></div>
          {game.phase === 'countdown' && <div className="hb-countdown" aria-live="assertive">{countdown}</div>}
          {game.phase === 'playing' && goUntil > now && <div className="hb-go" aria-live="assertive">GO!</div>}
          <div className={`hb-status ${notice ? 'has-notice' : ''}`} role="status" aria-live="polite">{notice || status}</div>
        </section>

        <section className="hb-controls" aria-label="Your controls">
          <div className="hb-controls-heading"><h2>Your move</h2><p>{game.gripLocked ? 'Gripping…' : game.canPass || game.canFeint ? 'Keep it moving. You never know when it’ll pop.' : 'Wait for the bomb to reach you.'}</p></div>
          <div className="hb-action-row">
            <button className="hb-action hb-pass" type="button" disabled={!game.canPass || game.paused} onClick={() => act('pass')}><span>Pass</span><small>throw it over <kbd>Space</kbd></small></button>
            <button className="hb-action hb-dodge" type="button" disabled={!game.canDodge || game.paused} onClick={() => act('dodge')}><span>Dodge <i>{game.myDodges}</i></span><small>3 each round <kbd>D</kbd></small></button>
            <button className="hb-action hb-feint" type="button" disabled={!game.canFeint || game.paused} onClick={() => act('feint')}><span>Feint <i>{game.myFeints}</i></span><small>4 each round <kbd>F</kbd></small></button>
          </div>
          {game.paused && <p className="hb-away">The round is paused while your person reconnects.</p>}
        </section>
      </>}
      <p className="hb-footnote">The fuse is secret and different every round. It could blow in 3 seconds or in 2 minutes.</p>
      <p className="hb-footnote">Pass to your person, dodge a pass, or feint your way out. First to {targetWins} wins.</p>
    </main>
  </section>;
}

function ScorePlayer({ player, score, target, own }: { player?: RoomView['players'][number]; score: number; target: number; own: boolean }) {
  return <div className={`hb-score-player ${own ? 'is-own' : ''}`}>
    <Doodle id={player?.doodleId ?? 'her'} size={50} crop name={player?.name}/>
    <span>{player?.name ?? 'Player'}</span>
    <div className="hb-pips" aria-label={`${score} of ${target} round wins`}>
      {Array.from({ length: target }, (_, index) => <i className={index < score ? 'filled' : ''} key={index}/>)}</div>
  </div>;
}

function ArenaPlayer({ player, holder, incoming, label, side }: { player?: RoomView['players'][number]; holder: boolean; incoming: boolean; label: string; side: 'self' | 'opponent' }) {
  return <div className={`hb-player-zone hb-${side} ${holder ? 'has-bomb' : ''} ${incoming ? 'is-incoming' : ''}`}>
    <Doodle id={player?.doodleId ?? 'her'} size={68} crop name={player?.name}/>
    <strong>{player?.name ?? 'Player'}</strong>
    <span className="hb-holder-label">{label || (incoming ? 'Incoming!' : 'Ready')}</span>
  </div>;
}

function BombArt() {
  return <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="M46 20q-7-13 5-17 9-3 12 4 2 5-4 9l-7 7m9-17 11-6"/><circle cx="49" cy="57" r="30"/><path d="M37 52q4-5 8 0m11 0q4-5 8 0m-25 13q7 8 15 0"/><path className="hb-spark" d="m82 19 4-10 4 10 10 4-10 4-4 10-4-10-10-4z"/></svg>;
}
