import { useEffect, useRef, useState } from 'react';
import type { DoodleExpression } from './manifest';

const PLAYING_MOODS: DoodleExpression[] = ['idle', 'happy', 'thinking', 'smug', 'wink', 'worried', 'shocked'];

/** Randomly varies only the displayed face; game state and event traffic are untouched. */
export function useDoodleExpression(playing: boolean, preferred: DoodleExpression = 'idle', seed = ''): DoodleExpression {
  const [randomMood, setRandomMood] = useState<DoodleExpression>('idle');
  const moodRef = useRef<DoodleExpression>('idle');
  useEffect(() => {
    if (!playing) { moodRef.current = 'idle'; setRandomMood('idle'); return; }
    let timer = 0;
    let alive = true;
    const cycle = () => {
      if (!alive) return;
      const choices = PLAYING_MOODS.filter(mood => mood !== moodRef.current);
      moodRef.current = choices[Math.floor(Math.random() * choices.length)] ?? 'thinking';
      setRandomMood(moodRef.current);
      timer = window.setTimeout(cycle, 2800 + Math.random() * 3200);
    };
    timer = window.setTimeout(cycle, 900 + Math.random() * 1800);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [playing, seed]);
  return playing && preferred === 'idle' ? randomMood : preferred;
}
