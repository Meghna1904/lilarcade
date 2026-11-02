import type { CupId, CupsGuess } from '@arcade/shared';
import { Cup } from './Cup';

export function GuessHistory({ guesses, cupCount }: { guesses: CupsGuess[]; cupCount: number }) {
  if (!guesses.length) return null;
  return <section className="guess-history"><div className="history-heading"><span>Guess history</span><small>Newest first</small></div>
      <div className="history-list">{[...guesses].reverse().map(guess => <div className="history-row" key={guess.number}>
        <small className="history-number">{guess.number}</small><div className="history-cups">{guess.order.map((cup: CupId, index) => <Cup key={`${guess.number}-${cup}-${index}`} id={cup} compact />)}</div>
        <div className="history-score"><b>{guess.correct} ✓</b><span>{Array.from({ length: cupCount }, (_, index) => <i className={index < guess.correct ? 'filled' : ''} key={index} />)}</span></div>
      </div>)}</div>
  </section>;
}
