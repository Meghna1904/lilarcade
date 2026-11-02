import type { SurpriseChoice, SurprisePrompt, SurpriseView } from '@arcade/shared';

const PROMPTS: SurprisePrompt[] = [
  { question: 'Pick our perfect slow morning', choices: ['Coffee and a little walk', 'Pancakes and staying cozy'] },
  { question: 'Choose a tiny adventure', choices: ['A seaside train ride', 'A cabin in the woods'] },
  { question: 'Which treat disappears first?', choices: ['Chocolate', 'Something salty'] },
  { question: 'Our ideal movie night?', choices: ['A comfort rewatch', 'Something neither of us has seen'] },
  { question: 'Pick a shared superpower', choices: ['Pause time for naps', 'Teleport anywhere together'] },
  { question: 'Choose a little date', choices: ['Bookshop and dessert', 'Arcade and late-night snacks'] },
  { question: 'What should we collect?', choices: ['Tiny souvenirs', 'Ridiculous inside jokes'] },
  { question: 'A perfect rainy day is...', choices: ['Blankets and a movie', 'Boots on and puddle jumping'] },
  { question: 'Pick our imaginary pet', choices: ['A very polite dragon', 'A tiny moon rabbit'] },
  { question: 'Which would we be better at?', choices: ['Running a cozy cafe', 'Running away to the beach'] },
];

export type SurpriseGame = {
  surpriseGame: true;
  phase: SurpriseView['phase'];
  players: [string, string];
  prompts: SurprisePrompt[];
  promptIndex: number;
  answers: Partial<Record<string, SurpriseChoice>>;
  predictions: Partial<Record<string, SurpriseChoice>>;
  scores: Record<string, number>;
  correctPredictions?: Record<string, boolean>;
  winner?: string;
  draw?: boolean;
  paused: boolean;
};

function shuffledPrompts(random: () => number) {
  const prompts = [...PROMPTS];
  for (let index = prompts.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [prompts[index], prompts[swapIndex]] = [prompts[swapIndex], prompts[index]];
  }
  return prompts.slice(0, 5);
}

export function createSurpriseGame(playerA: string, playerB: string, random = Math.random): SurpriseGame {
  return {
    surpriseGame: true,
    phase: 'answering',
    players: [playerA, playerB],
    prompts: shuffledPrompts(random),
    promptIndex: 0,
    answers: {},
    predictions: {},
    scores: { [playerA]: 0, [playerB]: 0 },
    paused: false,
  };
}

export function submitSurpriseAnswer(game: SurpriseGame, player: string, answer: SurpriseChoice, prediction: SurpriseChoice) {
  if (game.phase !== 'answering') return 'This prompt is already closed.';
  if (!game.players.includes(player)) return 'You are not in this game.';
  if ((answer !== 0 && answer !== 1) || (prediction !== 0 && prediction !== 1)) return 'Choose one of the two answers.';
  if (game.answers[player] !== undefined) return 'You already answered this prompt.';

  game.answers[player] = answer;
  game.predictions[player] = prediction;
  const [playerA, playerB] = game.players;
  if (game.answers[playerA] === undefined || game.answers[playerB] === undefined) return null;

  const correctPredictions = {
    [playerA]: game.predictions[playerA] === game.answers[playerB],
    [playerB]: game.predictions[playerB] === game.answers[playerA],
  };
  if (correctPredictions[playerA]) game.scores[playerA]++;
  if (correctPredictions[playerB]) game.scores[playerB]++;
  game.correctPredictions = correctPredictions;

  if (game.promptIndex === game.prompts.length - 1) {
    game.phase = 'matchOver';
    if (game.scores[playerA] === game.scores[playerB]) game.draw = true;
    else game.winner = game.scores[playerA] > game.scores[playerB] ? playerA : playerB;
  } else {
    game.phase = 'reveal';
  }
  return null;
}

export function nextSurprisePrompt(game: SurpriseGame, player: string) {
  if (game.phase !== 'reveal') return 'Finish both answers before moving on.';
  if (!game.players.includes(player)) return 'You are not in this game.';
  game.promptIndex++;
  game.answers = {};
  game.predictions = {};
  game.correctPredictions = undefined;
  game.phase = 'answering';
  return null;
}

export function surpriseViewFor(game: SurpriseGame): SurpriseView {
  const reveal = game.phase === 'reveal' || game.phase === 'matchOver';
  const base: SurpriseView = {
    game: 'surprise',
    phase: game.phase,
    prompt: game.prompts[game.promptIndex],
    promptIndex: game.promptIndex,
    totalPrompts: game.prompts.length,
    players: game.players,
    answered: Object.fromEntries(game.players.map(player => [player, game.answers[player] !== undefined])),
    scores: { ...game.scores },
    paused: game.paused,
  };
  if (reveal) {
    base.answers = Object.fromEntries(game.players.map(player => [player, game.answers[player]!])) as Record<string, SurpriseChoice>;
    base.predictions = Object.fromEntries(game.players.map(player => [player, game.predictions[player]!])) as Record<string, SurpriseChoice>;
    base.correctPredictions = { ...game.correctPredictions };
  }
  if (game.phase === 'matchOver') {
    if (game.winner) base.winner = game.winner;
    if (game.draw) base.draw = true;
  }
  return base;
}
