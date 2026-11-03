import { useCallback, useEffect, useRef, useState } from 'react';
import { isReactionId, REACTIONS } from '@arcade/shared';
import './reactions.css';

type ReactionEvent = { player: string; emoji: string; at: number };
type Floating = { key: string; player: string; left: number; top: number; emoji: string; reduced: boolean };

function findAnchor(player: string, self?: string): { left: number; top: number } {
  const anchor = [...document.querySelectorAll<HTMLElement>('[data-reaction-player]')]
    .find(element => element.dataset.reactionPlayer === player);
  const cupRail = !anchor && self
    ? document.querySelector<HTMLElement>(`.cups-player-rail.${player === self ? 'left' : 'right'}`)
    : null;
  const targetAnchor = anchor ?? cupRail;
  if (!targetAnchor) return { left: window.innerWidth / 2, top: window.innerHeight / 2 };
  const target = targetAnchor.querySelector<HTMLElement>('.doodle-wrap') ?? targetAnchor;
  const bounds = target.getBoundingClientRect();
  return { left: bounds.left + bounds.width / 2, top: bounds.top + bounds.height / 2 };
}

export function FloatingReactions({ reaction, self }: { reaction?: ReactionEvent; self?: string }) {
  const [floating, setFloating] = useState<Floating[]>([]);
  const remove = useCallback((key: string) => setFloating(current => current.filter(entry => entry.key !== key)), []);
  const seen = useRef(reaction ? `${reaction.player}-${reaction.at}-${reaction.emoji}` : '');

  useEffect(() => {
    if (!reaction) return;
    const key = `${reaction.player}-${reaction.at}-${reaction.emoji}`;
    if (seen.current === key) return;
    seen.current = key;
    const item = isReactionId(reaction.emoji) ? REACTIONS.find(entry => entry.id === reaction.emoji) : undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const position = findAnchor(reaction.player, self);
    setFloating(current => [...current, { key, player: reaction.player, ...position, emoji: item?.fallback ?? '🙂', reduced }].slice(-5));
  }, [reaction?.at, reaction?.emoji, reaction?.player, self]);

  return <div className="floating-reaction-layer" aria-live="off" aria-hidden="true">
    {floating.map(item => <ReactionFloat key={item.key} item={item} onDone={remove} />)}
  </div>;
}

function ReactionFloat({ item, onDone }: { item: Floating; onDone: (key: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDone(item.key), 1_500);
    return () => window.clearTimeout(timer);
  }, [item.key, onDone]);

  return <span className={`floating-reaction${item.reduced ? ' reduced' : ''}`} style={{ left: item.left, top: item.top }}>
    <span className="floating-reaction-emoji">{item.emoji}</span>
  </span>;
}
