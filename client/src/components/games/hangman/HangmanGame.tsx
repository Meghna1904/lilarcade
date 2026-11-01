import { useState } from 'react';
import type { HangmanView, RoomView } from '@arcade/shared';
import type { ArcadeSocket } from './useHangmanGame';
import { useHangmanGame } from './useHangmanGame';
import HangmanFigure from './HangmanFigure';
import Keyboard from './Keyboard';
import ReactionBar from './ReactionBar';
import SetterInput from './SetterInput';
import SetterStrip from './SetterStrip';
import WordDisplay from './WordDisplay';

type Props = { game: HangmanView; self: string; players: RoomView['players']; socket: ArcadeSocket };
export default function HangmanGame({ game, self, players, socket }: Props) {
  const isSetter = self === game.roles.setter; const isGuesser = self === game.roles.guesser;
  const ended = game.phase === 'roundOver' || game.phase === 'matchOver';
  const winnerName = game.roundWinner ? players.find(player => player.id === game.roundWinner)?.name ?? 'Your person' : '';
  const opponent = self === game.roles.setter ? game.roles.guesser : game.roles.setter;
  const setterName = players.find(player => player.id === game.roles.setter)?.name ?? 'Your person';
  const winner = game.roundWinner === self;
  const guesserName = players.find(player => player.id === game.roles.guesser)?.name ?? 'Your person';
  const guesserWon = game.roundWinner === game.roles.guesser;
  const [wholeGuess, setWholeGuess] = useState('');
  const { pending, submitLetter } = useHangmanGame(game, socket, isGuesser);

  const next = () => socket.emit('hangman:nextRound');
  const back = () => socket.emit('hangman:backToLobby');

  return <section className="game-layout"><div className="game-main">
    <div className="game-title-row"><button className="back-link" onClick={back}>← Lobby</button><div className="eyebrow">A LITTLE WORD GAME · ROUND {game.round}</div><span className="round-chip">{game.format === 'bestOf3' ? `${game.matchScore[self]} – ${game.matchScore[opponent]}` : 'QUICK ROUND'}</span></div>
    <div className="panel hangman-panel">
      <div className="role-line"><span className="role-pill">{isSetter ? '✎ WORD SETTER' : '✧ WORD GUESSEE'}</span>{game.paused && <span className="paused-label">Paused while your person reconnects</span>}</div>
      {game.phase === 'setting' && isSetter && <SetterInput socket={socket} settings={game.settings} disabled={false} />}
      {game.phase === 'setting' && isGuesser && <div className="waiting-game"><div className="waiting-orbit">✧</div><h2>{setterName} is thinking of a word… 🤔</h2><p>Get your guessing brain ready.</p><div className="waiting-dots"><i /><i /><i /></div></div>}
      {(game.phase === 'playing' || ended) && <>
        <div className="hangman-stage"><HangmanFigure game={game} winner={guesserWon} /><div className="lives-panel" aria-label={`${game.livesLeft} of ${game.maxMistakes} lives left`}><span className="lives-caption">LIVES LEFT</span><div className="life-hearts">{Array.from({ length: game.maxMistakes }, (_, index) => <span key={index} className={index < game.livesLeft ? 'heart full-heart' : 'heart empty-heart'} aria-hidden="true">♥</span>)}</div><small>{game.livesLeft} / {game.maxMistakes}</small></div></div>
        {isSetter && <SetterStrip word={game.ownWord} />}
        {!!game.hint && <div className="hint-bubble"><span>HINT ✦</span>{game.hint}</div>}
        {!game.hint && <div className="hint-bubble no-hint"><span>HINT ✦</span>No hint this time…</div>}
        <WordDisplay pattern={game.pattern} correct={game.correct} />
        {(game.wrong.length > 0 || game.wrongWordGuesses > 0) && <div className="wrong-tray" aria-label="Wrong guesses">{game.wrong.length > 0 && <><span>WRONG LETTERS</span>{game.wrong.map(letter => <b key={letter}>{letter}</b>)}</>}{game.wrongWordGuesses > 0 && <small>whole-word tries: {game.wrongWordGuesses}</small>}</div>}
        {game.phase === 'playing' && isGuesser && <>
          <Keyboard game={game} disabled={pending || game.paused} onLetter={submitLetter} />
          {game.settings.allowWordGuess && <form className="word-guess" onSubmit={event => { event.preventDefault(); if (wholeGuess.trim() && !pending && !game.paused) { socket.emit('hangman:guessWord', { word: wholeGuess }); setWholeGuess(''); } }}>
            <label htmlFor="whole-word">Think you know it?</label><input id="whole-word" value={wholeGuess} maxLength={25} onChange={event => setWholeGuess(event.target.value)} placeholder="Guess the whole word" />
            <button type="submit" className="button soft" disabled={!wholeGuess.trim() || pending || game.paused}>Guess word</button>
          </form>}
          {game.settings.allowRevealLetter && <button type="button" className="button reveal-button" disabled={pending || game.paused || game.revealUsed} onClick={() => socket.emit('hangman:revealLetter')}>
            {game.revealUsed ? 'Letter hint used' : 'Reveal a letter · costs 1 life'}
          </button>}
        </>}
        {game.phase === 'playing' && isSetter && <ReactionBar socket={socket} game={game} self={self} />}
        {game.phase === 'playing' && game.lastReaction && game.lastReaction.player !== self && <div className="floating-reaction" key={game.lastReaction.at} aria-live="polite">{game.lastReaction.emoji}<span>from {players.find(player => player.id === game.lastReaction?.player)?.name ?? 'your person'}</span></div>}
        {ended && <div className={`round-result ${winner ? 'you-won' : 'you-lost'}`}>
          {winner && <div className="confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index} style={{ ['--confetti-index' as string]: index }} />)}</div>}
          <div className="result-sparkle">{winner ? '✧' : '♡'}</div>
          <h2>{game.format === 'bestOf3' && game.phase === 'matchOver' ? `${winnerName} wins the match!` : guesserWon ? self === game.roles.guesser ? 'You found it!' : `${guesserName} found it!` : self === game.roles.setter ? 'Your word was safe!' : 'So close!'}</h2>
          <p>{guesserWon ? self === game.roles.guesser ? 'What a lovely little guess.' : 'A very good guess from your person.' : <>It was <strong>{game.fullWord}</strong></>}</p>
          {game.format === 'bestOf3' && <p className="match-score">Match score: {game.matchScore[self]} – {game.matchScore[opponent]}</p>}
          <div className="result-actions"><button className="button primary" onClick={next}>{game.phase === 'roundOver' ? 'Next round' : 'Play again'} <span>→</span></button><button className="button text-button" onClick={back}>Back to lobby</button></div>
        </div>}
      </>}
    </div>
  </div><aside className="game-side"><div className="panel mini-score"><div className="eyebrow">THIS MATCH</div><h3>Little score</h3>{Object.entries(game.matchScore).map(([id, score]) => <div className="mini-score-row" key={id}><span>{id === self ? 'You' : 'Your person'}</span><b>{score}</b></div>)}</div><div className="panel pep-talk"><span>☾</span><p>{game.phase === 'playing' ? isGuesser ? 'You’ve got this. Think of all your little in-jokes.' : 'No pressure, just a little friendly suspense.' : 'A cozy little game, just for the two of you.'}</p></div></aside></section>;
}
