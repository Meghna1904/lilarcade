import type { HangmanView } from '@arcade/shared';
import type { ArcadeSocket } from './useHangmanGame';
const reactions = ['😂', '😬', '😭', '🎉', '🙈'];
export default function ReactionBar({ socket, game, self }: { socket: ArcadeSocket; game: HangmanView; self: string }) {
  return <div className="setter-watch"><span>Keep them company:</span>{reactions.map(emoji => <button type="button" key={emoji} aria-label={`Send ${emoji} reaction`} onClick={() => socket.emit('hangman:react', { emoji })}>{emoji}</button>)}
    {game.lastReaction && <small>{game.lastReaction.emoji} from {game.lastReaction.player === self ? 'you' : 'your person'}</small>}
  </div>;
}
