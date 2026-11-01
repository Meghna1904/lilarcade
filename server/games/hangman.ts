import type { HangmanView, MatchFormat } from '@arcade/shared';

export type HangmanGame = {
  phase: HangmanView['phase']; setter: string; guesser: string; word: string; hint: string;
  guessed: Set<string>; wrong: Set<string>; round: number; format: MatchFormat;
  matchScore: Record<string, number>; roundWinner?: string; paused: boolean;
  lastReaction?: HangmanView['lastReaction'];
};
const pattern = (g: HangmanGame) => [...g.word].map(c => c === ' ' ? ' ' : g.guessed.has(c) || g.phase === 'roundOver' || g.phase === 'matchOver' ? c : '_').join('');
export function createHangman(setter: string, guesser: string, format: MatchFormat, firstRound = 1, score: Record<string, number> = {}): HangmanGame {
  return { phase: 'setting', setter, guesser, word: '', hint: '', guessed: new Set(), wrong: new Set(), round: firstRound, format, matchScore: { ...score, [setter]: score[setter] ?? 0, [guesser]: score[guesser] ?? 0 }, paused: false };
}
export function setWord(g: HangmanGame, player: string, word: string, hint: string) {
  const clean = word.trim().replace(/\s+/g, ' ').toUpperCase();
  if (g.paused) return 'Wait until your person is back to start the round.';
  if (g.phase !== 'setting' || player !== g.setter) return 'Only the setter can choose the word.';
  if (clean.length < 3 || clean.length > 25 || !/^[A-Z ]+$/.test(clean)) return 'Use 3–25 letters and spaces.';
  g.word = clean; g.hint = hint.trim().slice(0, 100); g.phase = 'playing'; return null;
}
export function guess(g: HangmanGame, player: string, letter: string) {
  const l = letter.toUpperCase();
  if (g.phase !== 'playing' || g.paused || player !== g.guesser) return 'It is not your turn to guess.';
  if (!/^[A-Z]$/.test(l) || g.guessed.has(l)) return 'That letter is not available.';
  g.guessed.add(l); if (!g.word.includes(l)) g.wrong.add(l);
  const solved = [...g.word].filter(c => c !== ' ').every(c => g.guessed.has(c));
  if (solved || g.wrong.size >= 6) {
    g.phase = g.format === 'quick' || g.round >= 3 || g.matchScore[g.guesser] >= 2 || g.matchScore[g.setter] >= 2 ? 'matchOver' : 'roundOver';
    g.roundWinner = solved ? g.guesser : g.setter;
    g.matchScore[g.roundWinner] = (g.matchScore[g.roundWinner] ?? 0) + 1;
  }
  return null;
}
export function viewFor(g: HangmanGame, player: string): HangmanView {
  const reveal = g.phase === 'roundOver' || g.phase === 'matchOver';
  return { game: 'hangman', phase: g.phase, roles: { setter: g.setter, guesser: g.guesser }, pattern: pattern(g), guessed: [...g.guessed], wrong: [...g.wrong], hint: g.hint, mistakes: g.wrong.size, maxMistakes: 6, round: g.round, format: g.format, matchScore: { ...g.matchScore }, ...(g.roundWinner ? { roundWinner: g.roundWinner, outcome: g.roundWinner === player ? 'win' as const : 'loss' as const } : {}), ...(reveal ? { fullWord: g.word } : {}), paused: g.paused, ...(g.lastReaction ? { lastReaction: g.lastReaction } : {}) };
}
