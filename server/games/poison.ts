import { randomBytes } from 'node:crypto';
import type { MatchFormat, PoisonPhase, PoisonSettings, PoisonView, RevealedTile, RoundEndReason } from '@arcade/shared';

// ─── Internal game state (server only) ───────────────────────────────────────

export type PoisonGame = {
  phase: PoisonPhase;
  gridSize: 3 | 4 | 5;
  playerA: string;
  playerB: string;
  // Setup state
  pickedA: number;        // -1 = nothing picked
  pickedB: number;
  lockedA: boolean;
  lockedB: boolean;
  sameTileRejectedAt: number; // timestamp of last same-tile rejection (0 = never)
  // Play state  ─ poisonA is deadly for B, poisonB is deadly for A
  poisonA: number;        // -1 until both players lock
  poisonB: number;
  revealed: RevealedTile[];
  currentTurn: string;
  turnNumber: number;
  turnDeadline: number;   // server timestamp when turn expires (0 = no active timer)
  timerRemaining: number; // ms remaining when game is paused (0 = none stored)
  // Round end state
  roundWinner: string | undefined;
  loser: string | undefined;
  endReason: RoundEndReason | undefined;
  // Match state
  round: number;
  starter: string;        // who goes first this round (alternates each round)
  matchScore: Record<string, number>;
  // Config
  format: MatchFormat;
  settings: PoisonSettings;
  paused: boolean;
  lastReaction: { player: string; emoji: string; at: number } | undefined;
};

// ─── Private helpers ──────────────────────────────────────────────────────────

/** Unbiased, cryptographically random integer in [0, n). */
function secureRandInt(n: number): number {
  // Rejection-sampling to remove bias from modulo
  const max = 0x1_0000_0000 - (0x1_0000_0000 % n);
  let v: number;
  do { v = randomBytes(4).readUInt32BE(0); } while (v >= max);
  return v % n;
}

function validGridSize(n: unknown): 3 | 4 | 5 {
  return n === 3 ? 3 : n === 5 ? 5 : 4;
}

/** True if opponentPoison is within one Chebyshev step of tile (includes diagonals). */
function isWarm(tile: number, opponentPoison: number, gridSize: number): boolean {
  const r = Math.floor(tile / gridSize),          c = tile % gridSize;
  const pr = Math.floor(opponentPoison / gridSize), pc = opponentPoison % gridSize;
  return Math.abs(r - pr) <= 1 && Math.abs(c - pc) <= 1 && tile !== opponentPoison;
}

function other(g: PoisonGame, player: string): string {
  return player === g.playerA ? g.playerB : g.playerA;
}
function myPoison(g: PoisonGame, player: string): number {
  return player === g.playerA ? g.poisonA : g.poisonB;
}
function opponentPoison(g: PoisonGame, player: string): number {
  return player === g.playerA ? g.poisonB : g.poisonA;
}

function endRound(g: PoisonGame): void {
  if (!g.roundWinner) return;
  g.matchScore[g.roundWinner] = (g.matchScore[g.roundWinner] ?? 0) + 1;
  g.phase =
    g.format === 'quick' || g.round >= 3 || g.matchScore[g.roundWinner] >= 2
      ? 'matchOver'
      : 'roundOver';
  g.turnDeadline = 0;
  g.timerRemaining = 0;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function createPoison(
  playerA: string,
  playerB: string,
  format: MatchFormat,
  settings: Omit<PoisonSettings, 'format'>,
  round = 1,
  score: Record<string, number> = {},
  starter?: string,
): PoisonGame {
  const gs = validGridSize(settings.gridSize);
  const st = starter ?? (secureRandInt(2) === 0 ? playerA : playerB);
  return {
    phase: 'setup',
    gridSize: gs,
    playerA, playerB,
    pickedA: -1, pickedB: -1,
    lockedA: false, lockedB: false,
    sameTileRejectedAt: 0,
    poisonA: -1, poisonB: -1,
    revealed: [],
    currentTurn: st,
    turnNumber: 1,
    turnDeadline: 0,
    timerRemaining: 0,
    roundWinner: undefined, loser: undefined, endReason: undefined,
    round,
    starter: st,
    matchScore: { ...score, [playerA]: score[playerA] ?? 0, [playerB]: score[playerB] ?? 0 },
    format,
    settings: { ...settings, format },
    paused: false,
    lastReaction: undefined,
  };
}

export const createGame = createPoison;
export function isOver(g: PoisonGame): boolean {
  return g.phase === 'roundOver' || g.phase === 'matchOver';
}

/**
 * All unrevealed tiles a player is allowed to tap.
 * Excludes their own poison but INCLUDES the opponent's poison.
 * (Tapping the opponent's poison is legal — it just ends the round with a loss.)
 */
export function legalTiles(g: PoisonGame, player: string): number[] {
  if (g.phase !== 'playing') return [];
  const own = myPoison(g, player);
  const total = g.gridSize * g.gridSize;
  const revSet = new Set(g.revealed.map(r => r.index));
  return Array.from({ length: total }, (_, i) => i).filter(i => !revSet.has(i) && i !== own);
}

/** True when the current player's only legal tile is the opponent's poison. */
export function checkForcedLoss(g: PoisonGame): boolean {
  if (g.phase !== 'playing') return false;
  const legal = legalTiles(g, g.currentTurn);
  return legal.length === 1 && legal[0] === opponentPoison(g, g.currentTurn);
}

// ─── Moves ────────────────────────────────────────────────────────────────────

/** Setup phase: select (or change) which tile you want to poison. */
export function pickTile(g: PoisonGame, player: string, tile: number): string | null {
  if (g.phase !== 'setup') return 'The picking phase is over.';
  if (g.paused) return 'Wait until your person is back.';
  if (player !== g.playerA && player !== g.playerB) return 'You are not in this game.';
  const isA = player === g.playerA;
  if (isA ? g.lockedA : g.lockedB) return 'You have already locked in your choice.';
  const total = g.gridSize * g.gridSize;
  if (!Number.isInteger(tile) || tile < 0 || tile >= total) return 'That tile is not on the tray.';
  if (isA) g.pickedA = tile; else g.pickedB = tile;
  return null;
}

/** Setup phase: lock in your choice. If both lock and picked the same tile, re-pick. */
export function lockPick(g: PoisonGame, player: string): string | null {
  if (g.phase !== 'setup') return 'The picking phase is over.';
  if (g.paused) return 'Wait until your person is back.';
  if (player !== g.playerA && player !== g.playerB) return 'You are not in this game.';
  const isA = player === g.playerA;
  if ((isA ? g.pickedA : g.pickedB) === -1) return 'Tap a tile to mark your choice first.';
  if (isA ? g.lockedA : g.lockedB) return 'You have already locked in your choice.';
  if (isA) g.lockedA = true; else g.lockedB = true;
  if (g.lockedA && g.lockedB) {
    if (g.pickedA === g.pickedB) {
      // Same-tile rule: reset both locks and picks, never skip this check.
      g.lockedA = false; g.lockedB = false;
      g.pickedA = -1; g.pickedB = -1;
      g.sameTileRejectedAt = Date.now();
      return null; // not an error — both players get the same-tile message via getViewFor
    }
    // Transition to playing phase.
    g.poisonA = g.pickedA;
    g.poisonB = g.pickedB;
    g.phase = 'playing';
    g.turnNumber = 1;
    // turnDeadline will be set by the server once the timer starts
  }
  return null;
}

/** Play phase: confirmed tap on a tile. turnNumber prevents stale / double taps. */
export function tapTile(g: PoisonGame, player: string, tile: number, turnNumber: number): string | null {
  if (g.phase !== 'playing') return 'Wait until the game starts.';
  if (g.paused) return 'Wait until your person is back.';
  if (player !== g.currentTurn) return 'It is not your turn.';
  if (!Number.isInteger(turnNumber) || turnNumber !== g.turnNumber) return 'That tap is out of date.';
  const total = g.gridSize * g.gridSize;
  if (!Number.isInteger(tile) || tile < 0 || tile >= total) return 'That tile is not on the tray.';
  if (g.revealed.some(r => r.index === tile)) return 'That tile has already been eaten.';
  if (tile === myPoison(g, player)) return 'You cannot eat your own tile.';
  // Advance turn counter first — prevents double-processing on any path below.
  g.turnNumber++;
  g.turnDeadline = 0;
  if (tile === opponentPoison(g, player)) {
    // Player ate the opponent's poison → player loses.
    g.loser = player;
    g.roundWinner = other(g, player);
    g.endReason = 'tapped';
    endRound(g);
    return null;
  }
  // Safe tile.
  const opp = opponentPoison(g, player);
  const warm = g.settings.warmCold ? isWarm(tile, opp, g.gridSize) : undefined;
  g.revealed.push({ index: tile, eatenBy: player, ...(g.settings.warmCold ? { warm } : {}) });
  g.currentTurn = other(g, player);
  return null;
}

/**
 * Timer auto-pick: selects uniformly at random from legalTiles.
 * legalTiles includes the opponent's poison, so the auto-pick CAN end the round.
 */
export function timeoutTurn(g: PoisonGame): string | null {
  if (g.phase !== 'playing') return 'No active turn to time out.';
  const legal = legalTiles(g, g.currentTurn);
  if (legal.length === 0) return 'No legal tiles available.';
  const tile = legal[secureRandInt(legal.length)];
  return tapTile(g, g.currentTurn, tile, g.turnNumber);
}

/** Forced-loss resolution after the dramatic pause. Must only be called when checkForcedLoss() is true. */
export function resolveForcedLoss(g: PoisonGame): string | null {
  if (g.phase !== 'playing') return 'The game is not in progress.';
  if (!checkForcedLoss(g)) return 'No forced-loss condition present.';
  g.loser = g.currentTurn;
  g.roundWinner = other(g, g.currentTurn);
  g.endReason = 'forced';
  endRound(g);
  return null;
}

export function react(g: PoisonGame, player: string, emoji: string): void {
  if (['😂', '😬', '😭', '🎉', '🙈'].includes(emoji))
    g.lastReaction = { player, emoji, at: Date.now() };
}

/** Validate incoming settings (server-side guard). */
export function validPoisonSettings(s: unknown): s is Omit<PoisonSettings, 'format'> {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  return [3, 4, 5].includes(Number(o.gridSize)) &&
    typeof o.timerEnabled === 'boolean' &&
    typeof o.confirmMode === 'boolean' &&
    typeof o.warmCold === 'boolean';
}

// ─── Views ────────────────────────────────────────────────────────────────────

/**
 * Returns the per-player view. SECURITY:
 *   - Setup:   opponent's pick is NEVER included; only a boolean "opponentLocked".
 *   - Playing: only myPoison is sent; opponentPoison is absent.
 *   - End:     both poisons are revealed.
 */
export function getViewFor(g: PoisonGame, player: string): PoisonView {
  const isA = player === g.playerA;
  const myPois = isA ? g.poisonA : g.poisonB;
  const oppPois = isA ? g.poisonB : g.poisonA;
  const reveal = g.phase === 'roundOver' || g.phase === 'matchOver';

  const base = {
    game: 'poison' as const,
    phase: g.phase,
    gridSize: g.gridSize,
    roles: { playerA: g.playerA, playerB: g.playerB },
    round: g.round,
    format: g.format,
    matchScore: { ...g.matchScore },
    settings: { ...g.settings },
    paused: g.paused,
    revealed: g.revealed.map(r => ({ ...r })),
    ...(g.lastReaction ? { lastReaction: { ...g.lastReaction } } : {}),
  };

  if (g.phase === 'setup') {
    return {
      ...base,
      myPick: isA ? g.pickedA : g.pickedB,
      myLocked: isA ? g.lockedA : g.lockedB,
      opponentLocked: isA ? g.lockedB : g.lockedA,
      ...(g.sameTileRejectedAt > 0 ? { sameTileRejectedAt: g.sameTileRejectedAt } : {}),
    };
  }

  if (reveal) {
    return {
      ...base,
      myPoison: myPois,
      opponentPoison: oppPois,   // ← only disclosed at round end
      loser: g.loser,
      roundWinner: g.roundWinner,
      endReason: g.endReason,
    };
  }

  // Playing phase — opponentPoison is intentionally absent.
  return {
    ...base,
    myPoison: myPois,
    currentTurn: g.currentTurn,
    turnNumber: g.turnNumber,
    ...(g.settings.timerEnabled && g.turnDeadline > 0 ? { turnDeadline: g.turnDeadline } : {}),
  };
}
