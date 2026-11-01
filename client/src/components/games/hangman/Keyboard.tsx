import type { HangmanView } from '@arcade/shared';

const rows = ['ABCDEFGHI', 'JKLMNOPQR', 'STUVWXYZ'];
export default function Keyboard({ game, disabled, onLetter }: { game: HangmanView; disabled: boolean; onLetter: (letter: string) => void }) {
  return <div className="keyboard" aria-label="Choose a letter">
    {rows.map((row, rowIndex) => <div className="keyboard-row" key={rowIndex}>{[...row].map(letter => {
      const used = game.guessed.includes(letter); const wrong = game.wrong.includes(letter);
      return <button type="button" key={letter} className={`key ${used ? wrong ? 'wrong-key' : 'right-key' : ''}`} disabled={disabled || used} onClick={() => onLetter(letter)} aria-label={`${letter}${used ? wrong ? ', wrong' : ', correct' : ''}`}>
        {letter}{used && <span className="key-mark" aria-hidden="true">{wrong ? '×' : '✓'}</span>}
      </button>;
    })}</div>)}
  </div>;
}
