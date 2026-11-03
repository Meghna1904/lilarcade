import type { RpsChoice, RpsView } from '@arcade/shared';

export type RpsGame = {
  rps: true;
  phase: RpsView['phase'];
  playerA: string;
  playerB: string;
  choices: Partial<Record<string, RpsChoice>>;
  wins: Record<string, number>;
  round: number;
  roundWinner?: string;
  matchWinner?: string;
  draw: boolean;
  paused: boolean;
};

export function createRpsGame(playerA: string, playerB: string): RpsGame {
  return {
    rps: true,
    phase: 'choosing',
    playerA,
    playerB,
    choices: {},
    wins: { [playerA]: 0, [playerB]: 0 },
    round: 1,
    draw: false,
    paused: false,
  };
}

const beats: Record<RpsChoice, RpsChoice> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const validChoice = (value: unknown): value is RpsChoice => value === 'rock' || value === 'paper' || value === 'scissors';

export function chooseRps(game: RpsGame, player: string, choice: unknown): string | null {
  if (game.paused) return 'Wait until your person is back to play.';
  if (game.phase !== 'choosing') return 'This round has already been revealed.';
  if (player !== game.playerA && player !== game.playerB) return 'You are not in this game.';
  if (!validChoice(choice)) return 'Choose rock, paper, or scissors.';
  game.choices[player] = choice;
  game.roundWinner = undefined;
  game.draw = false;
  if (game.choices[game.playerA] && game.choices[game.playerB]) {
    const a = game.choices[game.playerA]!;
    const b = game.choices[game.playerB]!;
    game.phase = 'reveal';
    if (a === b) {
      game.draw = true;
      return null;
    }
    game.roundWinner = beats[a] === b ? game.playerA : game.playerB;
    game.wins[game.roundWinner] = (game.wins[game.roundWinner] ?? 0) + 1;
    if (game.wins[game.roundWinner] >= 3 || game.round >= 5) {
      game.matchWinner = game.roundWinner;
      game.phase = 'matchOver';
    }
  }
  return null;
}

export function nextRpsRound(game: RpsGame, player: string): string | null {
  if (game.phase !== 'reveal' && game.phase !== 'matchOver') return 'Wait for both moves to be revealed.';
  if (player !== game.playerA && player !== game.playerB) return 'You are not in this game.';
  if (game.phase === 'matchOver') return 'The tournament is over.';
  const replayTie = game.draw;
  game.choices = {};
  game.roundWinner = undefined;
  game.draw = false;
  if (!replayTie) game.round += 1;
  game.phase = 'choosing';
  return null;
}

export function rpsView(game: RpsGame, self: string): RpsView {
  const opponent = self === game.playerA ? game.playerB : game.playerA;
  const canSeeReveal = game.phase === 'reveal' || game.phase === 'matchOver';
  return {
    game: 'rps',
    phase: game.phase,
    round: game.round,
    playerA: game.playerA,
    playerB: game.playerB,
    wins: { ...game.wins },
    myChoice: game.phase === 'choosing' ? game.choices[self] : undefined,
    opponentChosen: !!game.choices[opponent],
    ...(canSeeReveal ? { choices: { ...game.choices } as Record<string, RpsChoice> } : {}),
    roundWinner: game.roundWinner,
    matchWinner: game.matchWinner,
    draw: game.draw,
    paused: game.paused,
  };
}
