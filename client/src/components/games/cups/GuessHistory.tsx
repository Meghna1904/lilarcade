import type { CupId, CupsGuess } from '@arcade/shared';
import { Cup } from './Cup';

export function GuessHistory({ guesses, cupCount }: { guesses: CupsGuess[]; cupCount: number }) {
  return <section className="guess-history"><div className="history-heading"><span>Guess history</span><small>{guesses.length ? 'Newest at the bottom' : 'Your first guess is waiting'}</small></div>
    {guesses.length === 0 ? <div className="history-empty">Every guess gets a little score. Make it count.</div> :
      <div className="history-list">{guesses.map(guess => <div className="history-row" key={guess.number}>
        <div className="history-cups">{guess.order.map((cup: CupId, index) => <Cup key={`${guess.number}-${cup}`} id={cup} compact />)}</div>
        <div className="history-score"><b>{guess.correct} ✓</b><span>{Array.from({ length: cupCount }, (_, index) => <i className={index < guess.correct ? 'filled' : ''} key={index} />)}</span></div>
      </div>)}</div>}
  </section>;
}
