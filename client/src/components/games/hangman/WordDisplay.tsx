import type { HangmanView } from '@arcade/shared';

export default function WordDisplay({ pattern, correct }: { pattern: HangmanView['pattern']; correct: string[] }) {
  return <div className="word-pattern" aria-label="Word pattern" aria-live="polite">
    {[...pattern].map((character, index) => character === ' '
      ? <span className="letter-space" key={`space-${index}`} aria-hidden="true" />
      : <span className={`letter-slot ${character !== '_' ? 'revealed letter-pop' : ''}`} key={`letter-${index}`} aria-label={character === '_' ? 'blank' : `letter ${character}`}>
        {character === '_' ? '' : <>{character}<span className="sr-only"> {correct.includes(character) ? 'correct' : 'revealed'}</span></>}
      </span>)}
  </div>;
}
