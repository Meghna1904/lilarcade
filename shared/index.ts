export type GameId = 'hangman' | 'cups' | 'poison' | 'cloud' | 'slapcount' | 'familyfeud' | 'rps' | 'hotbomb' | 'twohalves';
export { REACTIONS, isReactionId } from './reactions.js';
export type { ReactionId } from './reactions.js';
export type MatchFormat = 'quick' | 'bestOf3' | 'bestOf5';
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
export type PlayerSummary = { id: string; name: string; online: boolean; timezone?: string; doodleId?: string };
export type Scoreboard = Record<GameId, Record<string, number>>;
export type HangmanView = {
  game: 'hangman'; phase: 'setting' | 'playing' | 'roundOver' | 'matchOver';
  roles: { setter: string; guesser: string }; pattern: string; guessed: string[]; wrong: string[];
  hint: string; mistakes: number; maxMistakes: 6; round: number; format: MatchFormat;
  matchScore: Record<string, number>; roundWinner?: string; fullWord?: string; outcome?: 'win' | 'loss';
  paused: boolean; lastReaction?: { player: string; emoji: string; at: number };
};
export type PoisonPhase = 'setup' | 'playing' | 'roundOver' | 'matchOver';
export type PoisonGridSize = 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type RoundEndReason = 'tapped' | 'forced' | 'forfeit' | 'sweetTie';
export type PoisonSettings = { gridSize: 3 | 4 | 5; format: MatchFormat; timerEnabled: boolean; confirmMode: boolean; warmCold: boolean; tieMode: 'replay' | 'draw' };
export type RevealedTile = { index: number; eatenBy: string; warm?: boolean };
export type PoisonView = {
  game: 'poison'; phase: PoisonPhase; gridSize: PoisonGridSize;
  roles: { playerA: string; playerB: string };
  round: number; format: MatchFormat; matchScore: Record<string, number>;
  settings: PoisonSettings; paused: boolean; revealed: RevealedTile[];
  myPick?: number[]; myLocked?: boolean; opponentLocked?: boolean;
  myPoison?: number[]; currentTurn?: string; turnNumber?: number; turnDeadline?: number;
  opponentPoison?: number[]; hitTile?: number; loser?: string; roundWinner?: string; endReason?: RoundEndReason;
  lastReaction?: { player: string; emoji: string; at: number };
};
export type CloudPosition = { n: number; x: number; y: number; size: number; rotation: number; colorIndex: number };
export type CloudPhase = 'calling' | 'hunting' | 'swapping' | 'roundOver' | 'matchOver';
export type CloudSettings = {
  targetBoxes: 30 | 50 | 100;
  catchBonus: 0 | 1 | 2 | 3;
  layoutMode: 'hunt' | 'round';
  huntTimeoutSeconds: 15 | 30 | 45 | 60;
};
export type CloudView = {
  game: 'cloud'; phase: CloudPhase; layoutSeed: number;
  roles: { caller: string; hunter: string }; round: number; format: 'quick' | 'bestOf3';
  settings: CloudSettings; tickCounts: Record<string, number>; matchScore: Record<string, number>;
  huntId: number; targetNumber?: number; callDeadline?: number; huntDeadline?: number;
  lockoutUntil?: number; wrongTapId: number; swapReason?: 'caught' | 'timeout';
  nextCaller?: string; nextHunter?: string; swapDeadline?: number;
  remainingMs?: number;
  roundWinner?: string; matchWinner?: string; paused: boolean;
  lastReaction?: { player: string; emoji: string; at: number };
};
export type SlapSuit = 'heart' | 'star' | 'moon' | 'drop';
export type SlapCard = { value: number | 'W'; suit: SlapSuit };
export type SlapSettings = { startingCards: number; pace: 'manual' | 1200 | 1000 | 800; callMode: boolean };
export type SlapPhase = 'ready' | 'playing' | 'resolving' | 'roundOver' | 'matchOver';
export type SlapView = {
  game: 'slapcount'; phase: SlapPhase; starter: string; turn: string; round: number; format: 'quick' | 'bestOf3';
  settings: SlapSettings; deckSizes: Record<string, number>; myDeckSize: number; opponentDeckSize: number;
  pileSize: number; topCards: SlapCard[]; count: number | null; currentCardCount: number | null; currentCardId: number; currentCardSentAt: number;
  matchWindowOpen: boolean; decisionPending: boolean; currentCardMatched: boolean; slapPossible: boolean; slapLockouts: Record<string, number>;
  matchScore: Record<string, number>; laidCards: number; readyDeadline?: number; resolveDeadline?: number;
  roundWinner?: string; matchWinner?: string; draw?: boolean; paused: boolean; remainingMs?: number;
  lastReaction?: { player: string; emoji: string; at: number };
};
export type FamilyFeudPhase = 'setup' | 'answering' | 'reveal' | 'matchOver';
export type FamilyFeudView = {
  game: 'familyfeud'; phase: FamilyFeudPhase; host: string; players: [string, string]; round: number; totalRounds: number;
  totalQuestions: number; question?: string; startedAt?: number; deadline?: number; paused: boolean;
  serverNow: number;
  submissions: Record<string, { submitted: boolean; answer?: string | null }>;
  scores: Record<string, number>; roundScores: Record<string, number>; board?: Array<{ text: string; points: number }>;
  results?: Record<string, { answer: string | null; matchIndex: number | null; suggestedIndex: number | null; points: number; originalPoints: number; adjustments: Array<{ actor: string; from: number | null; to: number | null; points: number; at: number }> }>;
  history: Array<{ question: string; scores: Record<string, number>; answers: Record<string, string | null>; matched: Record<string, boolean> }>;
  lastReaction?: { player: string; emoji: string; at: number };
};
export type RpsChoice = 'rock' | 'paper' | 'scissors';
export type RpsPhase = 'choosing' | 'reveal' | 'matchOver';
export type RpsView = {
  game: 'rps'; phase: RpsPhase; round: number; playerA: string; playerB: string;
  wins: Record<string, number>; myChoice?: RpsChoice; opponentChosen: boolean;
  choices?: Record<string, RpsChoice>; roundWinner?: string; matchWinner?: string;
  draw: boolean; paused: boolean; lastReaction?: { player: string; emoji: string; at: number };
};
export type HotBombAction = 'pass' | 'dodge' | 'feint';
export type HotBombFlightView = { id: number; from: string; to: string; startedAt: number; durationMs: number; reversed: boolean };
export type HotBombView = {
  game: 'hotbomb'; phase: 'countdown' | 'playing' | 'roundOver' | 'matchOver'; format: MatchFormat;
  round: number; playerA: string; playerB: string; holder?: string; flight?: HotBombFlightView;
  myDodges: number; myFeints: number; matchScore: Record<string, number>; countdownEndsAt?: number;
  canPass: boolean; canFeint: boolean; canDodge: boolean; gripLocked: boolean;
  fuseLengthMs?: number;
  loser?: string; winner?: string; boomMode?: 'held' | 'pass' | 'bounce' | 'feint'; paused: boolean;
  lastEvent?: { id: number; type: 'go' | 'launched' | 'dodge' | 'feintReversed' | 'boom'; player?: string; loser?: string; mode?: 'held' | 'pass' | 'bounce' | 'feint' };
  lastReaction?: { player: string; emoji: string; at: number };
};
export type TwoHalvesSplit = 'vertical' | 'horizontal';
export type TwoHalvesTearStyle = 'rip' | 'cut' | 'none';
export type TwoHalvesMergeStyle = 'slide' | 'snap' | 'fold' | 'skip';
export type TwoHalvesSeamStyle = 'none' | 'gold' | 'stitches' | 'thread' | 'zigzag';
export type TwoHalvesSettings = {
  split: TwoHalvesSplit; tear: TwoHalvesTearStyle; merge: TwoHalvesMergeStyle;
  seam: TwoHalvesSeamStyle; seamColor: string;
};
export const defaultTwoHalvesSettings: TwoHalvesSettings = {
  split: 'vertical', tear: 'rip', merge: 'slide', seam: 'gold', seamColor: '#d6336c',
};
export type TwoHalvesStroke = {
  tool: 'pencil' | 'marker' | 'crayon' | 'pastel' | 'watercolor' | 'brush' | 'glitter' | 'eraser';
  color: string; size: number; alpha: number; points: Array<{ x: number; y: number }>;
};
export type TwoHalvesTear = { style: TwoHalvesTearStyle; jag: number[]; jag2?: number[]; by: string; startAt: number };
export type TwoHalvesView = {
  game: 'twohalves'; phase: 'page' | 'coloring' | 'complete'; players: [string, string];
  page?: string; halves: Record<string, string>; completed: Record<string, boolean>; paused: boolean;
  settings: TwoHalvesSettings; tear?: TwoHalvesTear;
  lastReaction?: { player: string; emoji: string; at: number };
};
export type PoisonMove =
  | { type: 'poison:pickTile'; tile: number }
  | { type: 'poison:lockPick' }
  | { type: 'poison:tapTile'; tile: number; turnNumber: number }
  | { type: 'poison:react'; emoji: string }
  | { type: 'poison:nextRound' };
export type CloudMove =
  | { type: 'cloud:callNumber'; n: number; huntId: number }
  | { type: 'cloud:tick'; huntId: number }
  | { type: 'cloud:findNumber'; n: number; huntId: number }
  | { type: 'cloud:react'; emoji: string }
  | { type: 'cloud:nextRound' }
  | { type: 'cloud:backToLobby' };
export type SlapMove =
  | { type: 'slap:layCard' }
  | { type: 'slap:slap'; cardId: number }
  | { type: 'slap:react'; emoji: string }
  | { type: 'slap:nextRound' }
  | { type: 'slap:backToLobby' };
export type RoomView = {
  self: string; players: PlayerSummary[]; status: string; game: HangmanView | CupsView | PoisonView | CloudView | SlapView | FamilyFeudView | RpsView | HotBombView | TwoHalvesView | null;
  scoreboard: Scoreboard; sameSweetMoments: number; error?: string;
};
export type ClientToServerEvents = {
  enter: (payload: { name: string; passcode: string; token: string; timezone?: string; doodleId?: string; shareSky?: boolean }) => void;
  'doodle:select': (payload: { doodleId: string }) => void;
  startGame: (payload: { game: GameId; format: MatchFormat; cups?: Omit<CupsSettings, 'format'>; poison?: Omit<PoisonSettings, 'format'>; cloud?: CloudSettings; slapCount?: SlapSettings; familyFeud?: { rounds: number } }) => void;
  'rps:choose': (payload: { choice: RpsChoice }) => void;
  'rps:next': () => void;
  'hotbomb:action': (payload: { action: HotBombAction }) => void;
  'hotbomb:next': () => void;
  'twohalves:page': (payload: { page: string }) => void;
  'twohalves:paint': (payload: { image: string }) => void;
  'twohalves:settings': (patch: Partial<TwoHalvesSettings>) => void;
  'twohalves:tear': (payload: { style: TwoHalvesTearStyle; jag: number[]; jag2: number[] }) => void;
  'twohalves:stroke': (stroke: TwoHalvesStroke) => void;
  'twohalves:fill': (payload: { id: string; seq: number; x: number; y: number; color: string }) => void;
  'twohalves:complete': () => void;
  'twohalves:back': () => void;
  'familyfeud:start': () => void;
  'familyfeud:submit': (payload: { answer: string }) => void;
  'familyfeud:score': (payload: { target: string; matchIndex: number | null; points: number }) => void;
  'familyfeud:next': () => void;
  'slap:layCard': () => void;
  'slap:slap': (payload: { cardId: number }, ack?: (result: 'pending' | 'ignored' | 'wrong' | 'rejected') => void) => void;
  'slap:ping': (payload: { pingId: number; clientTime: number }) => void;
  'slap:pong': (payload: { pingId: number }) => void;
  'slap:react': (payload: { emoji: string }) => void;
  'slap:nextRound': () => void;
  'slap:backToLobby': () => void;
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
  'cloud:callNumber': (payload: { n: number; huntId: number }) => void;
  'cloud:tick': (payload: { huntId: number }, ack?: (accepted: boolean) => void) => void;
  'cloud:findNumber': (payload: { n: number; huntId: number }) => void;
  'cloud:requestState': () => void;
  'cloud:react': (payload: { emoji: string }) => void;
  'cloud:nextRound': () => void;
  'cloud:backToLobby': () => void;
  backToLobby: () => void;
};
export type ServerToClientEvents = {
  roomState: (state: RoomView) => void; joinError: (message: string) => void; actionError: (message: string) => void;
  'slap:cardLaid': (payload: { cardId: number; card: SlapCard; count: number | null; serverTime: number }) => void;
  'slap:resolved': (payload: { cardId: number; result: 'pile' | 'wrong'; winner?: string; loser?: string; penalty?: number }) => void;
  'slap:pong': (payload: { pingId: number; serverTime: number }) => void;
};
export { CLOUD_NUMBER_COUNT, cloudPaddedRadius, layoutCloud } from './cloudLayout.js';
