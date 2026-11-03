import type { RpsChoice, RpsView, RoomView, ClientToServerEvents, ServerToClientEvents } from '@arcade/shared';
import type { Socket } from 'socket.io-client';
import { Doodle } from '../../../doodles/Doodle';

type Props = { game: RpsView; self: string; players: RoomView['players']; socket: Socket<ServerToClientEvents, ClientToServerEvents> };
const moves: RpsChoice[] = ['rock', 'paper', 'scissors'];
const moveLabels: Record<RpsChoice, string> = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };
const winsAgainst: Record<RpsChoice, RpsChoice> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

export function RockPaperScissorsGame({ game, self, players, socket }: Props) {
  const otherId = self === game.playerA ? game.playerB : game.playerA;
  const me = players.find(player => player.id === self);
  const other = players.find(player => player.id === otherId);
  const revealed = game.phase !== 'choosing';
  const myMove = game.choices?.[self];
  const otherMove = game.choices?.[otherId];
  const winnerName = game.matchWinner === self ? 'You' : players.find(player => player.id === game.matchWinner)?.name ?? 'Your person';
  const roundLine = game.draw ? 'Same move! Nobody gets a point.' : game.roundWinner === self ? `${moveLabels[myMove!] } beats ${moveLabels[otherMove!]}. Point to you!` : `${moveLabels[otherMove!] } beats ${moveLabels[myMove!]}. Point to ${other?.name ?? 'your person'}!`;

  return <section className="rps-screen">
    <header className="rps-header">
      <button className="rps-back" type="button" onClick={() => socket.emit('backToLobby')}>← <span>Arcade</span></button>
      <div className="rps-brand">Rock <b>Paper</b> Scissors</div>
      <span className="rps-format">BEST OF 5</span>
    </header>

    <main className="rps-shell">
      <div className="rps-scoreboard" aria-label="Tournament score">
        <Player player={me} wins={game.wins[self] ?? 0} active={game.phase === 'choosing' && !game.myChoice} />
        <div className="rps-versus"><span>VS</span><small>ROUND {game.round} / 5</small></div>
        <Player player={other} wins={game.wins[otherId] ?? 0} active={game.phase === 'choosing' && game.opponentChosen} />
      </div>

      <section className={`rps-panel ${revealed ? 'is-revealed' : ''} ${game.phase === 'matchOver' ? 'is-final' : ''}`}>
        {game.phase === 'choosing' ? <>
          <div className="rps-panel-heading"><h1>Choose your move</h1><p>Pick one. Your moves meet when you both lock in.</p></div>
          <div className="rps-choices" aria-label="Choose rock, paper, or scissors">
            {moves.map(move => <button type="button" key={move} className={`rps-choice ${game.myChoice === move ? 'selected' : ''}`} aria-pressed={game.myChoice === move} disabled={game.paused} onClick={() => socket.emit('rps:choose', { choice: move })}>
              <MoveArt move={move}/><span>{moveLabels[move]}</span><small>{move === 'rock' ? 'A sturdy classic' : move === 'paper' ? 'Sneaky and flat' : 'Snip snip!'}</small>
            </button>)}
          </div>
          <div className={`rps-status ${game.myChoice ? 'locked' : ''}`} role="status">
            <span className="rps-status-mark">{game.myChoice ? '✓' : '✦'}</span>
            <span>{game.myChoice ? game.opponentChosen ? `${other?.name ?? 'Your person'} has picked too…` : `${moveLabels[game.myChoice]} locked in. Change it any time.` : game.opponentChosen ? `${other?.name ?? 'Your person'} is ready. Your move!` : 'Pick the move you believe in.'}</span>
          </div>
          {game.paused && <p className="rps-away">Your person is reconnecting. The tournament will be here.</p>}
        </> : <>
          <div className="rps-panel-heading"><p className="rps-round-label">{game.phase === 'matchOver' ? 'THE TOURNAMENT IS OVER' : `ROUND ${game.round} REVEAL`}</p><h1>{game.draw ? 'Great minds tie!' : game.phase === 'matchOver' ? `${winnerName} wins!` : 'Show us what you got!'}</h1></div>
          <div className="rps-faceoff">
            <RevealPlayer player={me} move={myMove} winner={game.roundWinner === self}/>
            <div className="rps-versus rps-battle-mark"><span>{game.draw ? 'AGAIN!' : 'POW!'}</span></div>
            <RevealPlayer player={other} move={otherMove} winner={game.roundWinner === otherId}/>
          </div>
          <p className="rps-round-result">{game.draw ? 'Same move! Give it another go.' : roundLine}</p>
          {game.phase === 'matchOver' ? <div className="rps-finish">
            <p>{winnerName} takes the best of five with <b>{game.wins[game.matchWinner!]}</b> wins.</p>
            <div className="rps-actions"><button className="rps-primary" type="button" onClick={() => socket.emit('rps:next')}>Play again <span>↻</span></button><button className="rps-secondary" type="button" onClick={() => socket.emit('backToLobby')}>Back to arcade</button></div>
          </div> : <button className="rps-primary rps-next" type="button" disabled={game.paused} onClick={() => socket.emit('rps:next')}>{game.draw ? 'Replay this round' : 'Next round'} <span>→</span></button>}
        </>}
      </section>
      <p className="rps-footnote">First to three wins. Ties are do-overs, because the universe said so.</p>
    </main>
  </section>;
}

function Player({ player, wins, active }: { player?: RoomView['players'][number]; wins: number; active: boolean }) {
  return <div className={`rps-player ${active ? 'active' : ''}`}>
    <Doodle id={player?.doodleId ?? 'her'} size={56} crop name={player?.name}/>
    <span>{player?.name ?? 'Player'}</span>
    <strong>{wins}<small>WINS</small></strong>
  </div>;
}

function RevealPlayer({ player, move, winner }: { player?: RoomView['players'][number]; move?: RpsChoice; winner: boolean }) {
  return <div className={`rps-reveal-player ${winner ? 'round-winner' : ''}`}>
    <Doodle id={player?.doodleId ?? 'her'} size={48} crop name={player?.name}/>
    <span>{player?.name ?? 'Player'}</span>
    {move && <div className={`rps-move-card rps-${move}`}><MoveArt move={move}/><b>{moveLabels[move]}</b></div>}
    {winner && <small className="rps-point-sticker">POINT!</small>}
  </div>;
}

function MoveArt({ move }: { move: RpsChoice }) {
  if (move === 'rock') return <svg className="rps-art" viewBox="0 0 100 100" role="img" aria-label="Rock"><path d="m18 65 8-24 14-18 18-5 10 8 13-1 7 10 7 7-5 29-13 14-37 1-17-8Z"/><path d="m30 43 14 2m10-14 10 6m8-2 8 9M26 66l54 1"/></svg>;
  if (move === 'paper') return <svg className="rps-art" viewBox="0 0 100 100" role="img" aria-label="Paper"><path d="M27 14h34l16 17v55H27Z"/><path d="M61 14v18h16M39 47h26M39 59h26M39 71h17"/><path d="m20 36-7 8m74-8 7 8"/></svg>;
  return <svg className="rps-art" viewBox="0 0 100 100" role="img" aria-label="Scissors"><circle cx="31" cy="70" r="11"/><circle cx="54" cy="72" r="11"/><path d="m39 63 39-45m-8-2 17 15M47 64 19 24m-7 5 15-12"/><path d="m48 63 29 19"/></svg>;
}
