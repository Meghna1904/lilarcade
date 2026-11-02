import type { SlapSuit } from '@arcade/shared';

export const slapSuits: Record<SlapSuit, { color: string; label: string; symbol: string }> = {
  heart: { color: '#ff8a80', label: 'Heart', symbol: '♥' },
  star: { color: '#ffd98a', label: 'Star', symbol: '✦' },
  moon: { color: '#bfa9e8', label: 'Moon', symbol: '☾' },
  drop: { color: '#8fd3c1', label: 'Drop', symbol: '◆' },
};

export const slapLines = {
  waiting: ['ready, ready?', 'hands at the ready…', 'let’s see those reflexes.'],
  lay: ['your turn to deal!', 'lay one down.', 'your card, your moment.'],
  hunting: ['eyes on the pile!', 'stay sharp…', 'keep counting with me.'],
  caught: ['gotcha!', 'so fast!', 'what a slap!'],
  wrong: ['oopsie!', 'the pile said nope.', 'two cards, whoosh!'],
  missed: ['missed it!', 'the count rolls on.', 'no harm, keep going.'],
};
