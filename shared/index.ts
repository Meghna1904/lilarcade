export type GameId = 'hangman' | 'cups' | 'poison';
export type MatchFormat = 'quick' | 'bestOf3';
export type CupId = 'coral' | 'sky' | 'butter' | 'mint' | 'lavender' | 'peach';
export const CUP_IDS: CupId[] = ['coral', 'sky', 'butter', 'mint', 'lavender', 'peach'];
export type CupsPhase = 'setup' | 'guessing' | 'roundOver' | 'matchOver';
export type CupsSettings = { cupCount: number; maxGuesses: number; format: MatchFormat; hintEnabled: boolean };
export type CupsGuess = { order: CupId[]; correct: number; number: number };
export type CupsView = {
  game: 'cups'; phase: CupsPhase; roles: { arranger: string; guesser: string }; cups: CupId[];
  secret?: CupId[]; guesses: CupsGuess[]; maxGuesses: number; guessesUsed: number; guessesLeft: number;
  round: number; format: MatchFormat; hintEnabled: boolean; hintUsed: boolean;
  hint?: { slot: number; cup: CupId }; matchScore: Record<string, number>; roundWinner?: string;
  outcome?: 'win' | 'loss'; paused: boolean; lastReaction?: { player: string; emoji: string; at: number };
};
export type CupsMove =
  | { type: 'cups:lockSecret'; order: CupId[] }
  | { type: 'cups:submitGuess'; order: CupId[] }
  | { type: 'cups:nextRound' }
  | { type: 'cups:backToLobby' }
  | { type: 'cups:reaction'; emoji: string };
export type PlayerSummary = { id: string; name: string; online: boolean };
export type Scoreboard = Record<GameId, Record<string, number>>;
export type HangmanView = {
  game: 'hangman'; phase: 'setting' | 'playing' | 'roundOver' | 'matchOver';
  roles: { setter: string; guesser: string }; pattern: string; guessed: string[]; wrong: string[];
  hint: string; mistakes: number; maxMistakes: 6; round: number; format: MatchFormat;
  matchScore: Record<string, number>; roundWinner?: string; fullWord?: string; outcome?: 'win' | 'loss';
  paused: boolean; lastReaction?: { player: string; emoji: string; at: number };
};
export type PoisonPhase = 'setup' | 'playing' | 'roundOver' | 'matchOver';
export type RoundEndReason = 'tapped' | 'forced' | 'forfeit';
export type PoisonSettings = { gridSize: 3 | 4 | 5; format: MatchFormat; timerEnabled: boolean; confirmMode: boolean; warmCold: boolean };
export type RevealedTile = { index: number; eatenBy: string; warm?: boolean };
export type PoisonView = {
  game: 'poison'; phase: PoisonPhase; gridSize: 3 | 4 | 5;
  roles: { playerA: string; playerB: string };
  round: number; format: MatchFormat; matchScore: Record<string, number>;
  settings: PoisonSettings; paused: boolean; revealed: RevealedTile[];
  myPick?: number; myLocked?: boolean; opponentLocked?: boolean; sameTileRejectedAt?: number;
  myPoison?: number; currentTurn?: string; turnNumber?: number; turnDeadline?: number;
  opponentPoison?: number; loser?: string; roundWinner?: string; endReason?: RoundEndReason;
  lastReaction?: { player: string; emoji: string; at: number };
};
export type PoisonMove =
  | { type: 'poison:pickTile'; tile: number }
  | { type: 'poison:lockPick' }
  | { type: 'poison:tapTile'; tile: number; turnNumber: number }
  | { type: 'poison:react'; emoji: string }
  | { type: 'poison:nextRound' };
export type RoomView = {
  self: string; players: PlayerSummary[]; status: string; game: HangmanView | CupsView | PoisonView | null;
  scoreboard: Scoreboard; error?: string;
};
export type ClientToServerEvents = {
  enter: (payload: { name: string; passcode: string; token: string }) => void;
  startGame: (payload: { game: GameId; format: MatchFormat; cups?: Omit<CupsSettings, 'format'>; poison?: Omit<PoisonSettings, 'format'> }) => void;
  setHangmanWord: (payload: { word: string; hint: string }) => void;
  guessLetter: (payload: { letter: string }) => void;
  hangmanReaction: (payload: { emoji: string }) => void;
  hangmanAgain: () => void;
  cupsLockSecret: (payload: { order: CupId[] }, ack?: (error: string | null) => void) => void;
  cupsSubmitGuess: (payload: { order: CupId[] }, ack?: (error: string | null) => void) => void;
  cupsHint: (payload: { slot: number }, ack?: (error: string | null) => void) => void;
  cupsReaction: (payload: { emoji: string }, ack?: (error: string | null) => void) => void;
  cupsNextRound: (ack?: (error: string | null) => void) => void;
  poisonPickTile: (payload: { tile: number }) => void;
  poisonLockPick: () => void;
  poisonTapTile: (payload: { tile: number; turnNumber: number }) => void;
  poisonReact: (payload: { emoji: string }) => void;
  poisonNextRound: () => void;
  backToLobby: () => void;
};
export type ServerToClientEvents = { roomState: (state: RoomView) => void; joinError: (message: string) => void; actionError: (message: string) => void };
