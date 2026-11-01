import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, HangmanView, RoomView, ServerToClientEvents } from '@arcade/shared';

export type ArcadeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useHangmanGame(game: HangmanView, socket: ArcadeSocket, active: boolean) {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [wordGuess, setWordGuess] = useState('');
  const markPending = (value: boolean) => { pendingRef.current = value; setPending(value); };
  const submitLetter = useCallback((letter: string) => {
    if (!active || pendingRef.current || game.phase !== 'playing' || game.paused || game.guessed.includes(letter.toUpperCase())) return;
    markPending(true);
    socket.emit('hangman:guessLetter', { letter });
  }, [active, game.phase, game.paused, game.guessed, socket]);

  useEffect(() => {
    const onState = () => markPending(false);
    const onError = () => markPending(false);
    socket.on('roomState', onState);
    socket.on('actionError', onError);
    return () => { socket.off('roomState', onState); socket.off('actionError', onError); };
  }, [socket]);

  useEffect(() => {
    if (!active || game.phase !== 'playing' || game.paused) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target?.tagName ?? '')) return;
      if (/^[a-z]$/i.test(event.key)) { event.preventDefault(); submitLetter(event.key); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, game.phase, game.paused, submitLetter]);

  return { pending, submitLetter, wordGuess, setWordGuess, resetWordGuess: () => setWordGuess('') };
}
