import { useCallback, useEffect, useRef, useState } from 'react';
import Lottie from 'lottie-react';
import { REACTIONS, type ReactionId } from '@arcade/shared';
import './reactions.css';

type ReactionEvent = { player: string; emoji: string; at: number };
type Floating = { key: string; player: string; id: ReactionId; left: number; top: number; fallback: string; file: string; reduced: boolean };
const jsonCache = new Map<string, Promise<object>>();

function loadAnimation(file: string): Promise<object> {
  let cached = jsonCache.get(file);
  if (!cached) {
    cached = fetch(`/emoji/${file}`).then(response => {
      if (!response.ok) throw new Error(`Could not load reaction animation ${file}`);
      return response.json() as Promise<object>;
    });
    jsonCache.set(file, cached);
    cached.catch(() => jsonCache.delete(file));
  }
  return cached;
}

function findAnchor(player: string): { left: number; top: number } {
  const anchor = [...document.querySelectorAll<HTMLElement>('[data-reaction-player]')]
    .find(element => element.dataset.reactionPlayer === player);
  if (!anchor) return { left: window.innerWidth / 2, top: window.innerHeight / 2 };
  const bounds = anchor.getBoundingClientRect();
  return { left: bounds.left + bounds.width / 2, top: bounds.top + bounds.height / 2 };
}

export function FloatingReactions({ reaction }: { reaction?: ReactionEvent }) {
  const [floating, setFloating] = useState<Floating[]>([]);
  const remove = useCallback((key: string) => setFloating(current => current.filter(entry => entry.key !== key)), []);
  const seen = useRef(reaction ? `${reaction.player}-${reaction.at}-${reaction.emoji}` : '');

  useEffect(() => {
    if (!reaction) return;
    const key = `${reaction.player}-${reaction.at}-${reaction.emoji}`;
    if (seen.current === key) return;
    seen.current = key;
    const item = REACTIONS.find(entry => entry.id === reaction.emoji);
    if (!item) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const position = findAnchor(reaction.player);
    setFloating(current => [...current, { key, player: reaction.player, id: item.id, ...position, fallback: item.fallback, file: item.file, reduced }].slice(-5));
  }, [reaction?.at, reaction?.emoji, reaction?.player]);

  return <div className="floating-reaction-layer" aria-live="off" aria-hidden="true">
    {floating.map(item => <ReactionFloat key={item.key} item={item} onDone={remove} />)}
  </div>;
}

function ReactionFloat({ item, onDone }: { item: Floating; onDone: (key: string) => void }) {
  const [animation, setAnimation] = useState<object>();
  useEffect(() => {
    const timer = window.setTimeout(() => onDone(item.key), 1_500);
    return () => window.clearTimeout(timer);
  }, [item.key, onDone]);
  useEffect(() => {
    if (item.reduced) return;
    let active = true;
    loadAnimation(item.file).then(value => { if (active) setAnimation(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [item.file, item.reduced]);

  return <span className={`floating-reaction ${item.reduced ? 'reduced' : ''}`} style={{ left: item.left, top: item.top }}>
    {animation && !item.reduced
      ? <Lottie animationData={animation as never} loop={false} autoplay className="floating-reaction-lottie" />
      : <span className="floating-reaction-fallback">{item.fallback}</span>}
  </span>;
}
