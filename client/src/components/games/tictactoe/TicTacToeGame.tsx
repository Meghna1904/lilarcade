import type { TicTacToeMark, TicTacToeView, RoomView, ClientToServerEvents, ServerToClientEvents } from '@arcade/shared';
import type { Socket } from 'socket.io-client';
import { Doodle } from '../../../doodles/Doodle';

type Props = { game: TicTacToeView; self: string; players: RoomView['players']; socket: Socket<ServerToClientEvents, ClientToServerEvents> };

export function TicTacToeGame({ game, self, players, socket }: Props) {
  const opponent = game.players.find(id => id !== self)!;
  const me = players.find(player => player.id === self);
  const other = players.find(player => player.id === opponent);
  const winnerName = game.winner === self ? 'You win!' : `${players.find(player => player.id === game.winner)?.name ?? 'Your person'} wins!`;
  const status = game.phase === 'complete'
    ? winnerName
    : game.paused ? 'Your person is reconnecting…'
      : game.currentPlayer === self ? `Your turn · place ${game.marks[self]}` : `${other?.name ?? 'Your person'} is thinking…`;

  return <section className="ttt-screen">
    <header className="ttt-header">
      <button className="ttt-back" type="button" onClick={() => socket.emit('backToLobby')}>← <span>Arcade</span></button>
      <div className="ttt-brand">Tic-<b>Tac</b>-Toe</div>
      <span className="ttt-format">{game.boardCount} {game.boardCount === 1 ? 'BOARD' : 'BOARDS'}</span>
    </header>

    <main className="ttt-shell">
      <div className="ttt-scoreboard">
        <Player player={me} mark={game.marks[self]} wins={game.wins[self] ?? 0} active={game.phase === 'playing' && game.currentPlayer === self}/>
        <div className="ttt-versus">✦</div>
        <Player player={other} mark={game.marks[opponent]} wins={game.wins[opponent] ?? 0} active={game.phase === 'playing' && game.currentPlayer === opponent}/>
      </div>

      <section className={`ttt-panel ${game.phase === 'complete' ? 'is-complete' : ''}`}>
        <div className="ttt-heading">
          <p>{game.boardCount === 1 ? 'ONE LITTLE GRID' : 'BEST OF THREE BOARDS'}</p>
          <h1>{game.phase === 'complete' ? winnerName : status}</h1>
          <span>{game.phase === 'complete' ? 'Nicely played. Fancy another round?' : game.boardCount === 1 ? 'Get three in a row to win.' : 'Win two boards to take the match.'}</span>
        </div>

        <div className={`ttt-boards ttt-boards-${game.boardCount}`}>
          {game.boards.map((board, boardIndex) => <section className={`ttt-board-card ${board.winner ? 'board-won' : ''}`} key={boardIndex} aria-label={`Board ${boardIndex + 1}`}>
            {game.boardCount === 3 && <div className="ttt-board-label"><span>BOARD {boardIndex + 1}</span>{board.winner && <b>{board.winner === self ? 'You won' : `${other?.name ?? 'They'} won`}</b>}</div>}
            <div className="ttt-board" role="group" aria-label={`Tic-Tac-Toe board ${boardIndex + 1}`}>
              {board.cells.map((mark, cellIndex) => {
                const vanishing = game.lastRemoved?.board === boardIndex && game.lastRemoved.cell === cellIndex;
                const canPlay = game.phase === 'playing' && !game.paused && game.currentPlayer === self && !board.winner && !mark;
                return <button
                  type="button"
                  className={`ttt-cell ${mark ? `mark-${mark.toLowerCase()}` : ''} ${vanishing ? 'mark-vanishing' : ''}`}
                  key={cellIndex}
                  disabled={!canPlay}
                  aria-label={`Board ${boardIndex + 1}, row ${Math.floor(cellIndex / 3) + 1}, column ${cellIndex % 3 + 1}${mark ? `, ${mark}` : ', empty'}`}
                  onClick={() => socket.emit('tictactoe:move', { board: boardIndex, cell: cellIndex })}
                >
                  {mark && <span>{mark}</span>}
                  {vanishing && !mark && <span key={game.lastRemoved!.at} className={`ttt-vanish mark-${game.lastRemoved!.mark.toLowerCase()}`}>{game.lastRemoved!.mark}</span>}
                </button>;
              })}
            </div>
            {board.winner && <div className="ttt-board-winner">{board.winner === self ? '✦ Your board!' : '✦ Board claimed'}</div>}
          </section>)}
        </div>

        {game.lastRemoved && game.phase === 'playing' && <p className="ttt-draw-note" role="status">Draw! The oldest {game.lastRemoved.mark} vanished. Keep playing.</p>}
        {game.phase === 'complete' && <div className="ttt-actions"><button className="ttt-primary" type="button" disabled={game.paused} onClick={() => socket.emit('tictactoe:replay')}>Play again <span>↻</span></button><button className="ttt-secondary" type="button" onClick={() => socket.emit('backToLobby')}>Back to arcade</button></div>}
      </section>
      <p className="ttt-footnote">{game.boardCount === 1 ? 'A tie keeps the game going: the oldest mark fades away.' : 'Boards won stay locked. Draws keep going as the oldest mark fades away.'}</p>
    </main>
  </section>;
}

function Player({ player, mark, wins, active }: { player?: RoomView['players'][number]; mark: TicTacToeMark; wins: number; active: boolean }) {
  return <div className={`ttt-player ${active ? 'active' : ''}`}>
    <Doodle id={player?.doodleId ?? 'her'} size={54} crop name={player?.name}/>
    <span>{player?.name ?? 'Player'}</span>
    <strong className={`ttt-mark-${mark.toLowerCase()}`}>{mark}<small>{wins} {wins === 1 ? 'BOARD' : 'BOARDS'}</small></strong>
  </div>;
}
