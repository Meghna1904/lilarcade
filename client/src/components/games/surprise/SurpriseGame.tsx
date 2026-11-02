import { useEffect, useState } from 'react';
import type { ClientToServerEvents, RoomView, ServerToClientEvents, SurpriseChoice, SurpriseView } from '@arcade/shared';
import type { Socket } from 'socket.io-client';
import { DoodleResultPair } from '../../../doodles/DoodleResultPair';
import { GameDoodle } from '../../../doodles/GameDoodle';
import { playerDoodleId } from '../../../doodles/playerDoodle';
import './surprise.css';

type Props = { game: SurpriseView; self: string; players: RoomView['players']; socket: Socket<ServerToClientEvents, ClientToServerEvents> };

export function SurpriseGame({ game, self, players, socket }: Props) {
  const [answer, setAnswer] = useState<SurpriseChoice | null>(null);
  const [prediction, setPrediction] = useState<SurpriseChoice | null>(null);
  const partnerId = game.players.find(id => id !== self) ?? '';
  const me = players.find(player => player.id === self);
  const partner = players.find(player => player.id === partnerId);
  const submitted = !!game.answered[self];
  const revealed = game.phase !== 'answering';
  const ended = game.phase === 'matchOver';
  const winnerName = players.find(player => player.id === game.winner)?.name ?? 'Your person';

  useEffect(() => {
    setAnswer(null);
    setPrediction(null);
  }, [game.promptIndex]);

  const back = () => {
    if (!ended && !window.confirm('Leave this little guessing game and return to the lobby?')) return;
    socket.emit('backToLobby');
  };
  const submit = () => {
    if (answer === null || prediction === null || submitted || revealed) return;
    socket.emit('surprise:answer', { answer, prediction });
  };

  return <section className="surprise-screen">
    <header className="surprise-header">
      <button type="button" className="surprise-back" onClick={back}>← <span>Lobby</span></button>
      <div className="surprise-heading"><span aria-hidden="true">✦</span><b>Surprise Us</b><small>QUICK MATCH</small></div>
      <div className="surprise-progress" aria-label={`Prompt ${game.promptIndex + 1} of ${game.totalPrompts}`}>
        {Array.from({ length: game.totalPrompts }, (_, index) => <i key={index} className={index <= game.promptIndex ? 'active' : ''}/>) }
      </div>
    </header>

    <main className="surprise-layout">
      <SurpriseRail player={me} players={players} score={game.scores[self] ?? 0} active={!submitted && !revealed} winner={ended && game.winner === self} label="YOU"/>
      <section className="surprise-board" aria-live="polite">
        {game.paused && <div className="surprise-paused" role="status">Your person lost connection. Waiting for them to come back…</div>}
        {ended ? <div className="surprise-result">
          <span className="surprise-kicker">FIVE LITTLE QUESTIONS</span>
          <DoodleResultPair players={players} winnerId={game.winner}/>
          <h1>{game.draw ? 'A perfect tie!' : `${winnerName} knows you best!`}</h1>
          <p className="surprise-final-score"><b>{game.scores[self] ?? 0}</b> · <b>{game.scores[partnerId] ?? 0}</b></p>
          <div className="surprise-final-reveal"><small>{game.prompt.question}</small>{game.players.map(id => <span key={id}><b>{players.find(player => player.id === id)?.name ?? 'Player'}</b> picked {game.prompt.choices[game.answers?.[id] ?? 0]}{game.correctPredictions?.[id] ? ' · guessed right' : ''}</span>)}</div>
          <p>{game.draw ? 'Five answers, five little ways to be in sync.' : `${me?.name ?? 'You'} got ${game.scores[self] ?? 0} right, and ${partner?.name ?? 'your person'} got ${game.scores[partnerId] ?? 0}.`}</p>
          <div className="surprise-actions"><button type="button" className="button primary" onClick={() => socket.emit('startGame', { game: 'surprise', format: 'quick' })}>Play again <span>↻</span></button><button type="button" className="button text-button" onClick={() => socket.emit('backToLobby')}>Back to lobby</button></div>
        </div> : revealed ? <div className="surprise-reveal">
          <span className="surprise-kicker">{game.phase === 'reveal' ? 'THE LITTLE REVEAL' : 'LAST REVEAL'}</span>
          <h1>{game.prompt.question}</h1>
          <div className="surprise-reveal-rows">
            {game.players.map(id => {
              const player = players.find(item => item.id === id);
              const choice = game.answers?.[id] ?? 0;
              const correct = !!game.correctPredictions?.[id];
              return <div className="surprise-reveal-row" key={id}>
                <span>{player?.name ?? 'Player'}</span>
                <b>{game.prompt.choices[choice]}</b>
                <small className={correct ? 'correct' : ''}>{correct ? 'Guessed right ✦' : 'A tiny surprise'}</small>
              </div>;
            })}
          </div>
          <div className="surprise-score-line"><span>{me?.name ?? 'You'} <b>{game.scores[self] ?? 0}</b></span><i>·</i><span>{partner?.name ?? 'Your person'} <b>{game.scores[partnerId] ?? 0}</b></span></div>
          <button type="button" className="button primary surprise-next" onClick={() => socket.emit('surprise:nextPrompt')}>Next surprise <span>→</span></button>
        </div> : <div className="surprise-play">
          <span className="surprise-kicker">PROMPT {game.promptIndex + 1} OF {game.totalPrompts}</span>
          <h1>{game.prompt.question}</h1>
          {submitted ? <div className="surprise-waiting" role="status"><span>✧</span><h2>Your answers are tucked away.</h2><p>Waiting for {partner?.name ?? 'your person'} to choose…</p></div> : <>
            <ChoiceGroup title="Your answer" choices={game.prompt.choices} value={answer} onChange={setAnswer}/>
            <ChoiceGroup title={`Guess ${partner?.name ?? 'your person'}'s answer`} choices={game.prompt.choices} value={prediction} onChange={setPrediction}/>
            <button type="button" className="button primary surprise-submit" disabled={answer === null || prediction === null || game.paused} onClick={submit}>Lock in both <span>✦</span></button>
          </>}
          {game.answered[partnerId] && !submitted && <p className="surprise-partner-ready">Your person has locked in their answers.</p>}
          <div className="surprise-score-line"><span>{me?.name ?? 'You'} <b>{game.scores[self] ?? 0}</b></span><i>·</i><span>{partner?.name ?? 'Your person'} <b>{game.scores[partnerId] ?? 0}</b></span></div>
        </div>}
      </section>
      <SurpriseRail player={partner} players={players} score={game.scores[partnerId] ?? 0} active={game.answered[partnerId] && !revealed} winner={ended && game.winner === partnerId} label="YOUR PERSON"/>
    </main>
  </section>;
}

function ChoiceGroup({ title, choices, value, onChange }: { title: string; choices: [string, string]; value: SurpriseChoice | null; onChange: (choice: SurpriseChoice) => void }) {
  return <fieldset className="surprise-choice-group">
    <legend>{title}</legend>
    <div>{choices.map((choice, index) => <button type="button" key={choice} className={value === index ? 'selected' : ''} aria-pressed={value === index} onClick={() => onChange(index as SurpriseChoice)}>{choice}</button>)}</div>
  </fieldset>;
}

function SurpriseRail({ player, players, score, active, winner, label }: { player?: RoomView['players'][number]; players: RoomView['players']; score: number; active: boolean; winner: boolean; label: string }) {
  return <aside className="surprise-rail" data-reaction-player={player?.id}>
    <GameDoodle id={playerDoodleId(players, player)} expression={winner ? 'celebrating' : active ? 'thinking' : 'idle'} playing={!winner} seed={`${player?.id}:${score}:${active}`} size="clamp(120px,18vh,220px)" name={player?.name}/>
    <strong>{player?.name ?? 'Your person'}</strong><span className={active ? 'active' : ''}>{active ? 'READY' : label}</span>
    <small>{score} {score === 1 ? 'right guess' : 'right guesses'}</small>
  </aside>;
}
