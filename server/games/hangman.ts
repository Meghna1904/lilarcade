import type { HangmanMove, HangmanSettings, HangmanView, MatchFormat } from '@arcade/shared';

export type HangmanGame = {
  phase: HangmanView['phase']; setter: string; guesser: string; word: string; hint: string;
  guessed: Set<string>; wrong: Set<string>; wholeWordGuesses: Set<string>; mistakes: number;
  revealUsed: boolean; settings: HangmanSettings; round: number; format: MatchFormat;
  matchScore: Record<string, number>; roundWinner?: string; paused: boolean;
  lastReaction?: HangmanView['lastReaction'];
};
export type HangmanConfig = Partial<HangmanSettings> & { random?: () => number };

const defaults: HangmanSettings = { maxMistakes: 6, allowWordGuess: false, allowRevealLetter: false };
const terminal = (g: HangmanGame) => g.phase === 'roundOver' || g.phase === 'matchOver';
const maskedPattern = (g: HangmanGame) => [...g.word].map(c => c === ' ' || g.guessed.has(c) || terminal(g) ? c : '_').join('');
const cleanWord = (value: string) => value.normalize('NFKC').toUpperCase();
const validSettings = (input: Partial<HangmanSettings>): HangmanSettings | null => {
  const maxMistakes = input.maxMistakes ?? defaults.maxMistakes;
  const allowWordGuess = input.allowWordGuess ?? defaults.allowWordGuess;
  const allowRevealLetter = input.allowRevealLetter ?? defaults.allowRevealLetter;
  if (!Number.isInteger(maxMistakes) || maxMistakes < 5 || maxMistakes > 8 || typeof allowWordGuess !== 'boolean' || typeof allowRevealLetter !== 'boolean') return null;
  return { maxMistakes, allowWordGuess, allowRevealLetter };
};

export function createHangman(setter: string, guesser: string, format: MatchFormat, firstRound = 1, score: Record<string, number> = {}, config: HangmanConfig = {}): HangmanGame {
  const settings = validSettings(config) ?? defaults;
  return { phase: 'setting', setter, guesser, word: '', hint: '', guessed: new Set(), wrong: new Set(), wholeWordGuesses: new Set(), mistakes: 0, revealUsed: false, settings, round: firstRound, format, matchScore: { ...score, [setter]: score[setter] ?? 0, [guesser]: score[guesser] ?? 0 }, paused: false };
}

function finishRound(g: HangmanGame, winner: string) {
  g.roundWinner = winner;
  g.matchScore[winner] = (g.matchScore[winner] ?? 0) + 1;
  const bestOf3Decided = g.matchScore[winner] >= 2 || g.round >= 3;
  g.phase = g.format === 'quick' || bestOf3Decided ? 'matchOver' : 'roundOver';
}

export function configureSettings(g: HangmanGame, player: string, input: Partial<HangmanSettings>) {
  if (g.phase !== 'setting') return 'Settings can only change before the round starts.';
  if (player !== g.setter) return 'Only the setter can change the round settings.';
  const settings = validSettings({ ...g.settings, ...input });
  if (!settings) return 'Choose 5 to 8 wrong guesses.';
  g.settings = settings;
  return null;
}

export function lockWord(g: HangmanGame, player: string, input: unknown, rawHint?: unknown) {
  if (g.phase !== 'setting' || player !== g.setter) return 'Only the setter can choose the word.';
  if (typeof input !== 'string') return 'Use 3–25 letters and spaces.';
  const word = cleanWord(input);
  if (word.length < 3 || word.length > 25 || !/^[A-Z ]+$/.test(word) || !/[A-Z]/.test(word) || /^ | $| {2}/.test(word)) return 'Use letters A to Z and single spaces (3–25 characters).';
  if (rawHint !== undefined && typeof rawHint !== 'string') return 'Keep your hint to one short line.';
  const hint = typeof rawHint === 'string' ? rawHint.normalize('NFKC').trim() : '';
  if (hint.length > 60 || /[\r\n]/.test(hint)) return 'Keep your hint to one line of 60 characters or fewer.';
  g.word = word; g.hint = hint; g.phase = 'playing';
  return null;
}

function checkTurn(g: HangmanGame, player: string) {
  if (g.phase !== 'playing') return 'This round is not accepting guesses right now.';
  if (g.paused) return 'The game is paused until your person reconnects.';
  if (player !== g.guesser) return 'It is not your turn to guess.';
  if (g.mistakes >= g.settings.maxMistakes) return 'There are no guesses left this round.';
  return null;
}

export function guessLetter(g: HangmanGame, player: string, input: unknown) {
  const turnError = checkTurn(g, player);
  if (turnError) return turnError;
  if (typeof input !== 'string' || !/^[A-Za-z]$/.test(input)) return 'Choose one letter from A to Z.';
  const letter = input.toUpperCase();
  if (g.guessed.has(letter)) return `You already tried ${letter}.`;
  g.guessed.add(letter);
  if (!g.word.includes(letter)) { g.wrong.add(letter); g.mistakes += 1; }
  const solved = [...g.word].every(character => character === ' ' || g.guessed.has(character));
  if (solved) finishRound(g, g.guesser);
  else if (g.mistakes >= g.settings.maxMistakes) finishRound(g, g.setter);
  return null;
}

export function guessWord(g: HangmanGame, player: string, input: unknown) {
  const turnError = checkTurn(g, player);
  if (turnError) return turnError;
  if (!g.settings.allowWordGuess) return 'Whole-word guesses are turned off for this round.';
  if (typeof input !== 'string') return 'Enter a word using letters and single spaces.';
  const answer = cleanWord(input);
  if (answer.length < 3 || answer.length > 25 || !/^[A-Z ]+$/.test(answer) || /^ | $| {2}/.test(answer)) return 'Enter 3–25 letters with single spaces between words.';
  if (g.wholeWordGuesses.has(answer)) return 'You already tried that word.';
  g.wholeWordGuesses.add(answer);
  if (answer === g.word) finishRound(g, g.guesser);
  else {
    g.mistakes = Math.min(g.settings.maxMistakes, g.mistakes + 2);
    if (g.mistakes >= g.settings.maxMistakes) finishRound(g, g.setter);
  }
  return null;
}

export function revealLetter(g: HangmanGame, player: string, random: () => number = Math.random) {
  const turnError = checkTurn(g, player);
  if (turnError) return turnError;
  if (!g.settings.allowRevealLetter) return 'Letter hints are turned off for this round.';
  if (g.revealUsed) return 'You already used your letter hint this round.';
  g.revealUsed = true;
  g.mistakes += 1;
  const remaining = [...new Set([...g.word].filter(character => character !== ' ' && !g.guessed.has(character)))];
  if (remaining.length) {
    const index = Math.min(remaining.length - 1, Math.max(0, Math.floor(random() * remaining.length)));
    g.guessed.add(remaining[index]!);
  }
  const solved = [...g.word].every(character => character === ' ' || g.guessed.has(character));
  if (g.mistakes >= g.settings.maxMistakes) finishRound(g, g.setter);
  else if (solved) finishRound(g, g.guesser);
  return null;
}

export function react(g: HangmanGame, player: string, emoji: string, at = Date.now()) {
  if (player !== g.setter) return 'Only the setter can send reactions.';
  if (g.phase !== 'playing' || !['😂', '😬', '😭', '🎉', '🙈'].includes(emoji)) return 'That reaction is not available right now.';
  g.lastReaction = { player, emoji, at };
  return null;
}

export function handleMove(g: HangmanGame, player: string, move: HangmanMove, random: () => number = Math.random) {
  switch (move.type) {
    case 'lockWord': return lockWord(g, player, move.word, move.hint);
    case 'guessLetter': return guessLetter(g, player, move.letter);
    case 'guessWord': return guessWord(g, player, move.word);
    case 'revealLetter': return revealLetter(g, player, random);
    case 'react': return react(g, player, move.emoji);
  }
}

export function getViewFor(g: HangmanGame, player: string): HangmanView {
  const ended = terminal(g);
  const base: HangmanView = {
    game: 'hangman', phase: g.phase, roles: { setter: g.setter, guesser: g.guesser },
    pattern: maskedPattern(g), wordLengths: g.word.split(' ').filter(Boolean).map(part => part.length),
    guessed: [...g.guessed], correct: [...g.guessed].filter(letter => !g.wrong.has(letter)), wrong: [...g.wrong], wrongWordGuesses: g.wholeWordGuesses.size,
    hint: g.hint, mistakes: g.mistakes, livesLeft: Math.max(0, g.settings.maxMistakes - g.mistakes), maxMistakes: g.settings.maxMistakes,
    settings: { ...g.settings }, revealUsed: g.revealUsed, round: g.round, format: g.format, matchScore: { ...g.matchScore }, paused: g.paused,
    ...(g.lastReaction ? { lastReaction: { ...g.lastReaction } } : {}),
    ...(g.roundWinner ? { roundWinner: g.roundWinner, outcome: g.roundWinner === player ? 'win' as const : 'loss' as const } : {}),
  };
  if (ended) base.fullWord = g.word;
  else if (player === g.setter) base.ownWord = g.word;
  return base;
}

export const isOver = (g: HangmanGame) => terminal(g);
export const createGame = createHangman;

// Compatibility adapters used by the existing room implementation.
export const setWord = (g: HangmanGame, player: string, word: string, hint: string) => lockWord(g, player, word, hint);
export const guess = (g: HangmanGame, player: string, letter: string) => guessLetter(g, player, letter);
export const viewFor = getViewFor;
export const start = createHangman;
export type GameModule = { start: typeof createHangman; handleMove: typeof handleMove; getViewFor: typeof getViewFor; isOver: typeof isOver };
export const hangmanModule: GameModule = { start: createHangman, handleMove, getViewFor, isOver };
