import type { CupId, CupsGuess, CupsMove, CupsPhase, CupsSettings, CupsView, MatchFormat } from '@arcade/shared';
import { CUP_IDS } from '@arcade/shared';

export type CupsGame = {
  phase: CupsPhase;
  arranger: string;
  guesser: string;
  cups: CupId[];
  secret: CupId[];
  guesses: CupsGuess[];
  usedGuesses: Set<string>;
  maxGuesses: number;
  format: MatchFormat;
  hintEnabled: boolean;
  hintUsed: boolean;
  hint?: { slot: number; cup: CupId };
  round: number;
  matchScore: Record<string, number>;
  roundWinner?: string;
  paused: boolean;
  lastReaction?: CupsView['lastReaction'];
};

const isInteger = (value: number) => Number.isInteger(value);
const keyFor = (order: CupId[]) => order.join('|');

export function validSettings(settings: CupsSettings): boolean {
  return isInteger(settings.cupCount) && settings.cupCount >= 4 && settings.cupCount <= 6 &&
    isInteger(settings.maxGuesses) && settings.maxGuesses >= 6 && settings.maxGuesses <= 12 &&
    (settings.format === 'quick' || settings.format === 'bestOf3') &&
    typeof settings.hintEnabled === 'boolean';
}

export function isPermutation(order: CupId[], cups: CupId[]): boolean {
  return order.length === cups.length && new Set(order).size === cups.length &&
    order.every(cup => cups.includes(cup));
}

export function scoreGuess(guess: CupId[], secret: CupId[]): number {
  return guess.reduce((score, cup, index) => score + (cup === secret[index] ? 1 : 0), 0);
}

export function createCups(
  arranger: string,
  guesser: string,
  format: MatchFormat,
  settings: Omit<CupsSettings, 'format'> = { cupCount: 5, maxGuesses: 8, hintEnabled: false },
  round = 1,
  score: Record<string, number> = {},
): CupsGame {
  const cupCount = Math.min(6, Math.max(4, Number(settings.cupCount) || 5));
  const maxGuesses = Math.min(12, Math.max(6, Number(settings.maxGuesses) || 8));
  const cups = CUP_IDS.slice(0, cupCount);
  return {
    phase: 'setup', arranger, guesser, cups, secret: [], guesses: [], usedGuesses: new Set(),
    maxGuesses, format, hintEnabled: settings.hintEnabled, hintUsed: false,
    round, matchScore: { ...score, [arranger]: score[arranger] ?? 0, [guesser]: score[guesser] ?? 0 },
    paused: false,
  };
}

export const createGame = createCups;
export const start = createCups;

export function lockSecret(g: CupsGame, player: string, order: CupId[]) {
  if (g.paused) return 'Wait until your person is back to start the round.';
  if (g.phase !== 'setup' || player !== g.arranger) return 'Only the Arranger can lock in the cups.';
  if (!isPermutation(order, g.cups)) return 'Place each cup exactly once before locking it in.';
  g.secret = [...order]; g.phase = 'guessing'; return null;
}

export function submitGuess(g: CupsGame, player: string, order: CupId[]) {
  if (g.paused) return 'Wait until your person is back to keep guessing.';
  if (g.phase !== 'guessing' || player !== g.guesser) return 'It is not your turn to guess.';
  if (!isPermutation(order, g.cups)) return 'Place each cup exactly once before guessing.';
  if (g.guesses.length >= g.maxGuesses) return 'You are out of guesses.';
  if (g.usedGuesses.has(keyFor(order))) return 'You already tried that one.';
  const correct = scoreGuess(order, g.secret);
  g.usedGuesses.add(keyFor(order));
  g.guesses.push({ order: [...order], correct, number: g.guesses.length + 1 });
  if (correct === g.cups.length || g.guesses.length >= g.maxGuesses) {
    g.roundWinner = correct === g.cups.length ? g.guesser : g.arranger;
    g.matchScore[g.roundWinner] = (g.matchScore[g.roundWinner] ?? 0) + 1;
    g.phase = g.format === 'quick' || g.round >= 3 || g.matchScore[g.roundWinner] >= 2 ? 'matchOver' : 'roundOver';
  }
  return null;
}

export function useHint(g: CupsGame, player: string, slot: number) {
  if (g.paused) return 'Wait until your person is back to use a hint.';
  if (!g.hintEnabled || g.hintUsed) return 'You have already used your hint.';
  if (g.phase !== 'guessing' || player !== g.guesser) return 'Hints are only available while you are guessing.';
  if (!isInteger(slot) || slot < 0 || slot >= g.cups.length) return 'Choose a valid slot for your hint.';
  g.hintUsed = true; g.hint = { slot, cup: g.secret[slot] }; return null;
}

export function reaction(g: CupsGame, player: string, emoji: string) {
  if (g.phase === 'guessing' && ['😂', '😬', '😭', '🎉', '🙈'].includes(emoji)) {
    g.lastReaction = { player, emoji, at: Date.now() };
  }
}

export function isOver(g: CupsGame) { return g.phase === 'roundOver' || g.phase === 'matchOver'; }

export function handleMove(g: CupsGame, player: string, move: CupsMove) {
  switch (move.type) {
    case 'cups:lockSecret': return lockSecret(g, player, move.order);
    case 'cups:submitGuess': return submitGuess(g, player, move.order);
    case 'cups:reaction': reaction(g, player, move.emoji); return null;
    default: return 'That action is not available right now.';
  }
}

export function getViewFor(g: CupsGame, player: string): CupsView {
  const reveal = isOver(g);
  const isArranger = player === g.arranger;
  return {
    game: 'cups', phase: g.phase, roles: { arranger: g.arranger, guesser: g.guesser }, cups: [...g.cups],
    ...(isArranger || reveal ? { secret: [...g.secret] } : {}),
    guesses: g.guesses.map(guess => ({ ...guess, order: [...guess.order] })),
    maxGuesses: g.maxGuesses, guessesUsed: g.guesses.length, guessesLeft: Math.max(0, g.maxGuesses - g.guesses.length),
    round: g.round, format: g.format, hintEnabled: g.hintEnabled, hintUsed: g.hintUsed,
    ...(g.hint ? { hint: { ...g.hint } } : {}), matchScore: { ...g.matchScore },
    ...(g.roundWinner ? { roundWinner: g.roundWinner, outcome: g.roundWinner === player ? 'win' : 'loss' } : {}),
    paused: g.paused, ...(g.lastReaction ? { lastReaction: { ...g.lastReaction } } : {}),
  };
}
