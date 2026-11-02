import { useCallback, useEffect, useRef, useState } from 'react';
import type { SlapCard, SlapView, ClientToServerEvents, ServerToClientEvents } from '@arcade/shared';
import type { Socket } from 'socket.io-client';

type SlapSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type LaidEvent = { cardId: number; card: SlapCard; count: number | null; serverTime: number };
type ResolveEvent = { cardId: number; result: 'pile'|'wrong'; winner?: string; loser?: string; penalty?: number };

export function useSlapCount(game: SlapView, self: string, socket: SlapSocket) {
  const [rttMs, setRttMs] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [laidEvent, setLaidEvent] = useState<LaidEvent>();
  const [resolvedEvent, setResolvedEvent] = useState<ResolveEvent>();
  const pingId = useRef(0);
  const sent = useRef(new Map<number, number>());
  const samples = useRef<number[]>([]);
  const pingTimeouts = useRef(new Set<number>());

  useEffect(() => {
    const onPong = ({ pingId: id }: { pingId: number }) => {
      const started = sent.current.get(id);
      if (started === undefined) return;
      sent.current.delete(id);
      const sample = performance.now() - started;
      samples.current = [...samples.current, sample].slice(-7);
      const ordered = [...samples.current].sort((a,b) => a-b);
      setRttMs(ordered[Math.floor(ordered.length / 2)] ?? 0);
      socket.emit('slap:pong', { pingId: id });
    };
    const onLaid = (event: LaidEvent) => setLaidEvent(event);
    const onResolved = (event: ResolveEvent) => setResolvedEvent(event);
    const ping = () => {
      for (let i = 0; i < 7; i++) {
        const timeout = window.setTimeout(() => {
        pingTimeouts.current.delete(timeout);
        const id = ++pingId.current; const started = performance.now(); sent.current.set(id, started);
        if (sent.current.size > 16) sent.current.delete(sent.current.keys().next().value!);
        socket.emit('slap:ping', { pingId: id, clientTime: started });
        window.setTimeout(() => sent.current.delete(id), 2_000);
      }, i * 120);
        pingTimeouts.current.add(timeout);
      }
    };
    socket.on('slap:pong', onPong); socket.on('slap:cardLaid', onLaid); socket.on('slap:resolved', onResolved);
    ping(); const interval = window.setInterval(ping, 10_000);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 60);
    return () => { socket.off('slap:pong', onPong); socket.off('slap:cardLaid', onLaid); socket.off('slap:resolved', onResolved); window.clearInterval(interval); window.clearInterval(clockTimer); pingTimeouts.current.forEach(window.clearTimeout); pingTimeouts.current.clear(); sent.current.clear(); };
  }, [socket]);

  useEffect(() => { if (laidEvent && laidEvent.cardId < game.currentCardId) setLaidEvent(undefined); }, [game.currentCardId, laidEvent]);
  useEffect(() => { if (resolvedEvent && resolvedEvent.cardId < game.currentCardId) setResolvedEvent(undefined); }, [game.currentCardId, resolvedEvent]);
  useEffect(() => {
    if (!resolvedEvent) return;
    const timeout = window.setTimeout(() => setResolvedEvent(undefined), 1_400);
    return () => window.clearTimeout(timeout);
  }, [resolvedEvent]);

  const lay = useCallback(() => socket.emit('slap:layCard'), [socket]);
  const slap = useCallback(() => {
    if (game.phase !== 'playing' || game.paused || !game.pileSize || !game.currentCardId) return;
    socket.emit('slap:slap', { cardId: game.currentCardId });
  }, [game.currentCardId, game.decisionPending, game.slapPossible, game.paused, game.phase, game.pileSize, socket]);
  const locked = (game.slapLockouts[self] ?? 0) > clock;
  return { rttMs, clock, lay, slap, locked, laidEvent, resolvedEvent };
}
