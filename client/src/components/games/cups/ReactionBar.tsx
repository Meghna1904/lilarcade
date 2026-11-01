export function ReactionBar({ onReact, lastReaction }: { onReact: (emoji: string) => void; lastReaction?: { emoji: string; player: string; at: number } }) {
  return <div className="reaction-bar"><span>Keep them guessing:</span>{['😂', '😬', '😭', '🎉', '🙈'].map(emoji => <button type="button" key={emoji} aria-label={`Send ${emoji} reaction`} onClick={() => onReact(emoji)}>{emoji}</button>)}{lastReaction && <small>{lastReaction.emoji} just landed</small>}</div>;
}
