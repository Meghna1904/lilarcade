import type { HangmanView } from '@arcade/shared';

export default function HangmanFigure({ game, winner }: { game: HangmanView; winner: boolean }) {
  const stage = (part: number) => game.mistakes >= Math.ceil(part * game.maxMistakes / 6) ? 'figure-part is-drawn' : 'figure-part';
  const face = game.mistakes >= Math.ceil(game.maxMistakes / 6) ? 'face-details' : 'face-details is-hidden';
  const finished = game.phase === 'roundOver' || game.phase === 'matchOver';
  const lost = finished && game.roundWinner === game.roles.setter;
  return <svg className={`hangman-drawing ${winner ? 'figure-happy' : ''} ${lost ? 'figure-sad' : ''}`} viewBox="0 0 220 170" role="img" aria-label={`Hangman drawing, ${game.mistakes} of ${game.maxMistakes} misses`}>
    <path className="gallows" d="M31 154h112M59 153V18h75v18" />
    <path className="gallows" d="M134 36v12" />
    <circle className={stage(1)} cx="134" cy="62" r="14" />
    <path className={stage(2)} d="M134 76v34" />
    <path className={stage(3)} d="M134 87l-18 18" />
    <path className={stage(4)} d="M134 87l18 18" />
    <path className={stage(5)} d="M134 110l-17 29" />
    <path className={stage(6)} d="M134 110l17 29" />
    <g className={face}><path className="hat" d="M119 48q15-17 30 0M116 49h36" />
      <circle className="eye" cx="129" cy="61" r="1.7" /><circle className="eye" cx="139" cy="61" r="1.7" />
      <path className={`face-mouth ${lost ? 'sad-mouth' : ''}`} d={lost ? 'M128 69q6-6 12 0' : 'M128 68q6 6 12 0'} />
    </g>
  </svg>;
}
