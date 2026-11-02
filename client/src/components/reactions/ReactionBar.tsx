import { useRef } from 'react';
import { REACTIONS } from '@arcade/shared';

export function ReactionBar({ onReact, label = 'Send a little feeling:' }: { onReact: (id: string) => void; label?: string }) {
  const lastSentAt = useRef(Number.NEGATIVE_INFINITY);
  const send = (id: string) => {
    const now = performance.now();
    if (now - lastSentAt.current < 600) return;
    lastSentAt.current = now;
    onReact(id);
  };
  return <div className="reaction-bar"><span>{label}</span>{REACTIONS.map(reaction => <button type="button" key={reaction.id} data-reaction-id={reaction.id} aria-label={`Send ${reaction.fallback} reaction`} title={reaction.fallback} onClick={() => send(reaction.id)}>{reaction.fallback}</button>)}</div>;
}
