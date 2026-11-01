export type GameId = 'hangman' | 'cups' | 'poison';
export type MatchFormat = 'quick' | 'bestOf3';
export type PlayerSummary = { id: string; name: string; online: boolean };
export type Scoreboard = Record<GameId, Record<string, number>>;
export type HangmanPhase = 'setting' | 'playing' | 'roundOver' | 'matchOver';
export type HangmanSettings = { maxMistakes: number; allowWordGuess: boolean; allowRevealLetter: boolean };
export type HangmanMove =
  | { type: 'lockWord'; word: string; hint?: string }
  | { type: 'guessLetter'; letter: string }
  | { type: 'guessWord'; word: string }
  | { type: 'revealLetter' }
  | { type: 'react'; emoji: string };
export type HangmanView = {
  game: 'hangman'; phase: HangmanPhase;
  roles: { setter: string; guesser: string }; pattern: string; wordLengths: number[];
  guessed: string[]; correct: string[]; wrong: string[]; wrongWordGuesses: number;
  hint: string; mistakes: number; livesLeft: number; maxMistakes: number; round: number; format: MatchFormat;
  settings: HangmanSettings; revealUsed: boolean;
  matchScore: Record<string, number>; roundWinner?: string; fullWord?: string; ownWord?: string; outcome?: 'win' | 'loss';
  paused: boolean; lastReaction?: { player: string; emoji: string; at: number };
};
export type RoomView = {
  self: string; players: PlayerSummary[]; status: string; game: HangmanView | null;
  scoreboard: Scoreboard; error?: string;
};
export type ClientToServerEvents = {
  enter: (payload: { name: string; passcode: string; token: string }) => void;
  startGame: (payload: { game: GameId; format: MatchFormat; settings?: Partial<HangmanSettings> }) => void;
  'hangman:lockWord': (payload: { word: string; hint?: string }) => void;
  'hangman:guessLetter': (payload: { letter: string }) => void;
  'hangman:guessWord': (payload: { word: string }) => void;
  'hangman:revealLetter': () => void;
  'hangman:react': (payload: { emoji: string }) => void;
  'hangman:nextRound': () => void;
  'hangman:backToLobby': () => void;
  'hangman:setSettings': (payload: Partial<HangmanSettings>) => void;
  setHangmanWord: (payload: { word: string; hint: string }) => void;
  guessLetter: (payload: { letter: string }) => void;
  hangmanReaction: (payload: { emoji: string }) => void;
  hangmanAgain: () => void;
  backToLobby: () => void;
};
export type ServerToClientEvents = { roomState: (state: RoomView) => void; joinError: (message: string) => void; actionError: (message: string) => void };
