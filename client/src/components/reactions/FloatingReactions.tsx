import { useCallback, useEffect, useRef, useState } from 'react';
import Lottie from 'lottie-react';
import { isReactionId, REACTIONS, type ReactionId } from '@arcade/shared';
import './reactions.css';

type ReactionEvent = { player: string; emoji: string; at: number };
type Floating = { key: string; player: string; id?: ReactionId; left: number; top: number; fallback: string; file?: string; reduced: boolean };
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
    const validId = isReactionId(reaction.emoji);
    const item = validId ? REACTIONS.find(entry => entry.id === reaction.emoji) : undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const position = findAnchor(reaction.player, self);
    setFloating(current => [...current, { key, player: reaction.player, id: item?.id, ...position, fallback: item?.fallback ?? '🙂', file: item?.file, reduced }].slice(-5));
  }, [reaction?.at, reaction?.emoji, reaction?.player, self]);

  return <div className="floating-reaction-layer" aria-live="off" aria-hidden="true">
    {floating.map(item => <ReactionFloat key={item.key} item={item} onDone={remove} />)}
  </div>;
}

function ReactionFloat({ item, onDone }: { item: Floating; onDone: (key: string) => void }) {
  const [animation, setAnimation] = useState<object>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>(item.reduced || !item.file ? 'fallback' : 'loading');
  useEffect(() => {
    if (status === 'loading') return;
    const timer = window.setTimeout(() => onDone(item.key), 1_500);
    return () => window.clearTimeout(timer);
  }, [item.key, onDone, status]);
  useEffect(() => {
    if (status !== 'loading' || !item.file) return;
    let active = true;
    const timer = window.setTimeout(() => { if (active) setStatus('fallback'); }, 1_000);
    loadAnimation(item.file).then(value => {
      if (active && status === 'loading') setAnimation(value);
    }).catch(() => { if (active) setStatus('fallback'); });
    return () => { active = false; window.clearTimeout(timer); };
  }, [item.file, status]);

  const showFallback = status === 'fallback' || item.reduced || !animation;

  return <span className={`floating-reaction floating-reaction-${status}${item.reduced ? ' reduced' : ''}`} style={{ left: item.left, top: item.top }}>
    {showFallback
      ? <span className="floating-reaction-fallback">{item.fallback}</span>
      : <Lottie animationData={animation as never} loop={false} autoplay renderer="svg" className="floating-reaction-lottie" onDOMLoaded={() => setStatus('ready')} onDataFailed={() => setStatus('fallback')} />}
  </span>;
}
