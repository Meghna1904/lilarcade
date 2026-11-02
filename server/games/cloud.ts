import { randomBytes } from 'node:crypto';
import type { CloudMove, CloudPhase, CloudPosition, CloudSettings, CloudView } from '@arcade/shared';
import { isReactionId, layoutCloud } from '@arcade/shared';

export type CloudGame = {
  cloudGame: true;
  phase: CloudPhase;
  playerA: string;
  playerB: string;
  caller: string;
  hunter: string;
  starterCaller: string;
  matchStarterCaller: string;
  layout: CloudPosition[];
  layoutSeed: string;
  huntId: number;
  targetNumber: number | undefined;
  callDeadline: number;
  callRemaining: number;
  huntDeadline: number;
  huntRemaining: number;
  swapDeadline: number;
  swapRemaining: number;
  lockoutUntil: number;
  lockoutRemaining: number;
  wrongTapId: number;
  swapReason: 'caught' | 'timeout' | undefined;
  nextCaller: string | undefined;
  nextHunter: string | undefined;
  tickCounts: Record<string, number>;
  lastTickAt: Record<string, number>;
  matchScore: Record<string, number>;
  round: number;
  format: 'quick' | 'bestOf3';
  settings: CloudSettings;
  roundWinner: string | undefined;
  matchWinner: string | undefined;
  paused: boolean;
  lastReaction: { player: string; emoji: string; at: number } | undefined;
};

export type CloudActionResult = { changed: boolean; accepted?: boolean; error?: string };
const CALL_WINDOW_MS = 5_000;
const SWAP_DELAY_MS = 1_200;
const HUNTER_LOCKOUT_MS = 1_000;
const TICK_INTERVAL_MS = 100;

function randomInt(max: number): number {
  const ceiling = 0x1_0000_0000 - (0x1_0000_0000 % max);
  let value: number;
  do { value = randomBytes(4).readUInt32BE(0); } while (value >= ceiling);
  return value % max;
}

function newLayoutSeed(): string { return randomBytes(8).toString('hex'); }
function newLayout(): { seed: string; layout: CloudPosition[] } {
  const seed = newLayoutSeed();
  return { seed, layout: layoutCloud(seed) };
}
function other(g: CloudGame, player: string): string { return player === g.playerA ? g.playerB : g.playerA; }

function finishRound(g: CloudGame, winner: string): void {
  g.roundWinner = winner;
  g.matchScore[winner] = (g.matchScore[winner] ?? 0) + 1;
  const matchOver = g.format === 'quick' || g.matchScore[winner] >= 2 || g.round >= 3;
  g.phase = matchOver ? 'matchOver' : 'roundOver';
  g.matchWinner = matchOver ? winner : undefined;
  g.callDeadline = g.huntDeadline = g.swapDeadline = g.lockoutUntil = 0;
  g.callRemaining = g.huntRemaining = g.swapRemaining = g.lockoutRemaining = 0;
}

export function createCloudGame(
  playerA: string,
  playerB: string,
  starterCaller: string,
  format: 'quick' | 'bestOf3',
  settings: CloudSettings,
  round = 1,
  matchScore: Record<string, number> = {},
  huntId = 1,
  now = Date.now(),
  matchStarterCaller = starterCaller,
): CloudGame {
  const seed = newLayoutSeed();
  return {
    cloudGame: true,
    phase: 'calling',
    playerA,
    playerB,
    caller: starterCaller,
    hunter: starterCaller === playerA ? playerB : playerA,
    starterCaller,
    matchStarterCaller,
    layoutSeed: seed,
    layout: layoutCloud(seed),
    huntId,
    targetNumber: undefined,
    callDeadline: now + CALL_WINDOW_MS,
    callRemaining: 0,
    huntDeadline: 0,
    huntRemaining: 0,
    swapDeadline: 0,
    swapRemaining: 0,
    lockoutUntil: 0,
    lockoutRemaining: 0,
    wrongTapId: 0,
    swapReason: undefined,
    nextCaller: undefined,
    nextHunter: undefined,
    tickCounts: { [playerA]: 0, [playerB]: 0 },
    lastTickAt: {},
    matchScore: { ...matchScore, [playerA]: matchScore[playerA] ?? 0, [playerB]: matchScore[playerB] ?? 0 },
    round,
    format,
    settings: { ...settings },
    roundWinner: undefined,
    matchWinner: undefined,
    paused: false,
    lastReaction: undefined,
  };
}

export function isOver(g: CloudGame): boolean { return g.phase === 'matchOver'; }

function startHunt(g: CloudGame, n: number, now: number): void {
  g.phase = 'hunting';
  g.targetNumber = n;
  g.callDeadline = 0;
  g.callRemaining = 0;
  g.huntDeadline = now + g.settings.huntTimeoutSeconds * 1_000;
  g.huntRemaining = 0;
  g.lockoutUntil = 0;
  g.lockoutRemaining = 0;
  g.lastTickAt = {};
}

function beginSwap(g: CloudGame, reason: 'caught' | 'timeout', now: number): void {
  g.phase = 'swapping';
  g.swapReason = reason;
  g.nextCaller = g.hunter;
  g.nextHunter = g.caller;
  g.huntDeadline = 0;
  g.huntRemaining = 0;
  g.lockoutUntil = 0;
  g.lockoutRemaining = 0;
  g.swapDeadline = now + SWAP_DELAY_MS;
  g.swapRemaining = 0;
}

function randomTarget(): number { return randomInt(100) + 1; }

export function timeoutCall(g: CloudGame, now = Date.now()): boolean {
  if (g.paused || g.phase !== 'calling' || (g.callDeadline > 0 && now < g.callDeadline)) return false;
  startHunt(g, randomTarget(), now);
  return true;
}

export function timeoutHunt(g: CloudGame, now = Date.now()): boolean {
  if (g.paused || g.phase !== 'hunting' || g.targetNumber === undefined || (g.huntDeadline > 0 && now < g.huntDeadline)) return false;
  beginSwap(g, 'timeout', now);
  return true;
}

export function completeSwap(g: CloudGame, now = Date.now()): boolean {
  if (g.paused || g.phase !== 'swapping' || !g.nextCaller || !g.nextHunter || (g.swapDeadline > 0 && now < g.swapDeadline)) return false;
  g.caller = g.nextCaller;
  g.hunter = g.nextHunter;
  g.nextCaller = g.nextHunter = undefined;
  g.swapDeadline = 0;
  g.swapRemaining = 0;
  g.swapReason = undefined;
  g.huntId++;
  if (g.settings.layoutMode === 'hunt') {
    const next = newLayout();
    g.layoutSeed = next.seed;
    g.layout = next.layout;
  }
  g.targetNumber = undefined;
  g.phase = 'calling';
  g.callDeadline = now + CALL_WINDOW_MS;
  g.callRemaining = 0;
  return true;
}

export function pauseTimers(g: CloudGame, now = Date.now()): void {
  if (g.phase === 'calling' && g.callDeadline > 0) g.callRemaining = Math.max(1, g.callDeadline - now);
  if (g.phase === 'hunting' && g.huntDeadline > 0) g.huntRemaining = Math.max(1, g.huntDeadline - now);
  if (g.phase === 'swapping' && g.swapDeadline > 0) g.swapRemaining = Math.max(1, g.swapDeadline - now);
  if (g.lockoutUntil > 0) g.lockoutRemaining = Math.max(1, g.lockoutUntil - now);
  g.callDeadline = g.huntDeadline = g.swapDeadline = g.lockoutUntil = 0;
}

export function resumeTimers(g: CloudGame, now = Date.now()): void {
  if (g.phase === 'calling' && g.callRemaining > 0) { g.callDeadline = now + g.callRemaining; g.callRemaining = 0; }
  if (g.phase === 'hunting' && g.huntRemaining > 0) { g.huntDeadline = now + g.huntRemaining; g.huntRemaining = 0; }
  if (g.phase === 'swapping' && g.swapRemaining > 0) { g.swapDeadline = now + g.swapRemaining; g.swapRemaining = 0; }
  if (g.lockoutRemaining > 0) { g.lockoutUntil = now + g.lockoutRemaining; g.lockoutRemaining = 0; }
}

export function clearLockout(g: CloudGame, now = Date.now()): boolean {
  if (!g.lockoutUntil || g.lockoutUntil > now) return false;
  g.lockoutUntil = 0;
  g.lockoutRemaining = 0;
  return true;
}

export function handleMove(g: CloudGame, player: string, move: CloudMove, now = Date.now()): CloudActionResult {
  if (g.paused || isOver(g)) return { changed: false };
  if (move.type === 'cloud:react') {
    if (!isReactionId(move.emoji)) return { changed: false };
    g.lastReaction = { player, emoji: move.emoji, at: now };
    return { changed: true };
  }
  if (!('huntId' in move) || move.huntId !== g.huntId) return { changed: false };
  // Resolve an expired hunt before accepting any caller/hunter action. The
  // timeout path must win even if the event loop is late to run its timer.
  if (g.phase === 'hunting' && g.huntDeadline > 0 && now >= g.huntDeadline) {
    return { changed: timeoutHunt(g, now), ...(move.type === 'cloud:tick' ? { accepted: false } : {}) };
  }
  if (move.type === 'cloud:callNumber') {
    if (!Number.isInteger(move.n) || move.n < 1 || move.n > 100) return { changed: false, error: 'Choose a number from 1 to 100.' };
    if (g.phase !== 'calling' || player !== g.caller) return { changed: false };
    if (g.callDeadline > 0 && now >= g.callDeadline) return { changed: timeoutCall(g, now) };
    startHunt(g, move.n, now);
    return { changed: true };
  }
  if (move.type === 'cloud:tick') {
    if (g.phase !== 'hunting' || player !== g.caller) return { changed: false, accepted: false };
    if (g.lastTickAt[player] !== undefined && now - g.lastTickAt[player] < TICK_INTERVAL_MS) return { changed: false, accepted: false };
    g.lastTickAt[player] = now;
    g.tickCounts[player] = (g.tickCounts[player] ?? 0) + 1;
    if (g.tickCounts[player] >= g.settings.targetBoxes) finishRound(g, player);
    return { changed: true, accepted: true };
  }
  if (move.type === 'cloud:findNumber') {
    if (!Number.isInteger(move.n) || move.n < 1 || move.n > 100) return { changed: false, error: 'Tap a number from 1 to 100.' };
    if (g.phase !== 'hunting' || player !== g.hunter) return { changed: false };
    if (g.lockoutUntil > now) return { changed: false };
    if (move.n !== g.targetNumber) {
      g.wrongTapId++;
      g.lockoutUntil = now + HUNTER_LOCKOUT_MS;
      g.lockoutRemaining = 0;
      return { changed: true };
    }
    g.tickCounts[player] = (g.tickCounts[player] ?? 0) + g.settings.catchBonus;
    if (g.tickCounts[player] >= g.settings.targetBoxes) finishRound(g, player);
    else beginSwap(g, 'caught', now);
    return { changed: true };
  }
  return { changed: false };
}

export function getViewFor(g: CloudGame, player: string): CloudView {
  const pausedRemaining = g.phase === 'calling' ? g.callRemaining : g.phase === 'hunting' ? g.huntRemaining : g.phase === 'swapping' ? g.swapRemaining : 0;
  return {
    game: 'cloud',
    phase: g.phase,
    layout: g.layout.map(item => ({ ...item })),
    roles: { caller: g.caller, hunter: g.hunter },
    round: g.round,
    format: g.format,
    settings: { ...g.settings },
    tickCounts: { ...g.tickCounts },
    matchScore: { ...g.matchScore },
    huntId: g.huntId,
    ...(g.targetNumber !== undefined ? { targetNumber: g.targetNumber } : {}),
    ...(g.callDeadline > 0 ? { callDeadline: g.callDeadline } : {}),
    ...(g.huntDeadline > 0 ? { huntDeadline: g.huntDeadline } : {}),
    ...(player === g.hunter && g.lockoutUntil > 0 ? { lockoutUntil: g.lockoutUntil } : {}),
    wrongTapId: player === g.hunter ? g.wrongTapId : 0,
    ...(g.swapReason ? { swapReason: g.swapReason } : {}),
    ...(g.nextCaller ? { nextCaller: g.nextCaller } : {}),
    ...(g.nextHunter ? { nextHunter: g.nextHunter } : {}),
    ...(g.swapDeadline > 0 ? { swapDeadline: g.swapDeadline } : {}),
    ...(g.roundWinner ? { roundWinner: g.roundWinner } : {}),
    ...(g.matchWinner ? { matchWinner: g.matchWinner } : {}),
    ...(g.paused && pausedRemaining > 0 ? { remainingMs: pausedRemaining } : {}),
    paused: g.paused,
    ...(g.lastReaction ? { lastReaction: { ...g.lastReaction } } : {}),
  };
}
