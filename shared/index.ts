export type GameId = 'hangman' | 'cups' | 'poison';
export type MatchFormat = 'quick' | 'bestOf3';
export type PlayerSummary = { id: string; name: string; online: boolean };
export type Scoreboard = Record<GameId, Record<string, number>>;
export type HangmanView = {
  game: 'hangman'; phase: 'setting' | 'playing' | 'roundOver' | 'matchOver';
  roles: { setter: string; guesser: string }; pattern: string; guessed: string[]; wrong: string[];
  hint: string; mistakes: number; maxMistakes: 6; round: number; format: MatchFormat;
  matchScore: Record<string, number>; roundWinner?: string; fullWord?: string; outcome?: 'win' | 'loss';
  paused: boolean; lastReaction?: { player: string; emoji: string; at: number };
};
export type RoomView = {
  self: string; players: PlayerSummary[]; status: string; game: HangmanView | null;
  scoreboard: Scoreboard; error?: string;
};
export type ClientToServerEvents = {
  enter: (payload: { name: string; passcode: string; token: string }) => void;
  startGame: (payload: { game: GameId; format: MatchFormat }) => void;
  setHangmanWord: (payload: { word: string; hint: string }) => void;
  guessLetter: (payload: { letter: string }) => void;
  hangmanReaction: (payload: { emoji: string }) => void;
  hangmanAgain: () => void;
  backToLobby: () => void;
};
export type ServerToClientEvents = { roomState: (state: RoomView) => void; joinError: (message: string) => void; actionError: (message: string) => void };
