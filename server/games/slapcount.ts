import { randomBytes } from 'node:crypto';
import type { SlapCard, SlapMove, SlapSettings, SlapView } from '@arcade/shared';
import { isReactionId } from '@arcade/shared';

type InternalCard = SlapCard & { uid: number };
type Candidate = { player: string; arrivalAt: number; rttMs: number };
export type SlapCountGame = {
  slapCount: true; phase: SlapView['phase']; playerA: string; playerB: string; decks: Record<string, InternalCard[]>;
  pile: InternalCard[]; turn: string; starter: string; matchStarter: string; round: number; format: 'quick'|'bestOf3'; settings: SlapSettings;
  count: number; currentCardId: number; currentCardSentAt: number; currentCardCount: number; currentCard: InternalCard|undefined;
  currentCardMatched: boolean; laidCards: number; lastLayAt: number; matchWindowDeadline: number; matchWindowOpen: boolean;
  decisionDeadline: number; decisionPending: boolean; candidates: Candidate[]; visibleCardIds: Record<string, number>;
  slapLockouts: Record<string, number>; slapTimes: Record<string, number[]>; readyDeadline: number; readyRemaining: number;
  resolveDeadline: number; resolveRemaining: number; autoLayDeadline: number; autoLayRemaining: number;
  matchWindowRemaining: number; decisionRemaining: number;
  matchScore: Record<string, number>; roundWinner: string|undefined; matchWinner: string|undefined; draw: boolean;
  rttSamples: Record<string, number[]>;
  paused: boolean; lastReaction: { player: string; emoji: string; at: number }|undefined;
  resolution: { cardId: number; result: 'pile'|'wrong'; winner?: string; loser?: string; penalty?: number }|undefined;
};

export type SlapResult = { changed: boolean; error?: string; status?: 'pending'|'ignored'|'wrong'|'rejected'; event?: SlapCountGame['resolution']; cardLaid?: { cardId: number; card: SlapCard; count: number | null; serverTime: number } };

const READY_MS = 3_000;
const MATCH_MS = 3_000;
const DECISION_MS = 150;
const RESOLVE_MS = 1_200;
const MIN_LAY_MS = 600;
const MAX_LAID = 300;

function secureInt(max: number) {
  const ceiling = 0x1_0000_0000 - (0x1_0000_0000 % max);
  let value: number;
  do { value = randomBytes(4).readUInt32BE(0); } while (value >= ceiling);
  return value % max;
}
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) { const j = secureInt(i + 1); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}
function other(g: SlapCountGame, player: string) { return player === g.playerA ? g.playerB : g.playerA; }
function buildDeck(): InternalCard[] {
  const suits: SlapCard['suit'][] = ['heart','star','moon','drop'];
  return suits.flatMap(suit => Array.from({ length: 10 }, (_, index) => ({ uid: suits.indexOf(suit) * 10 + index + 1, value: index + 1, suit })));
}
function makeRound(g: SlapCountGame, starter: string, round: number, score: Record<string, number>, now: number, cardIdBase: number) {
  const cards = shuffle(buildDeck());
  g.decks = { [g.playerA]: cards.slice(0, g.settings.startingCards), [g.playerB]: cards.slice(g.settings.startingCards, g.settings.startingCards * 2) };
  g.pile = []; g.turn = starter; g.starter = starter; g.round = round; g.matchScore = { ...score, [g.playerA]: score[g.playerA] ?? 0, [g.playerB]: score[g.playerB] ?? 0 };
  g.count = 1; g.currentCardId = cardIdBase; g.currentCardSentAt = 0; g.currentCardCount = 1; g.currentCard = undefined; g.currentCardMatched = false;
  g.laidCards = 0; g.lastLayAt = 0; g.matchWindowDeadline = 0; g.matchWindowOpen = false; g.decisionDeadline = 0; g.decisionPending = false; g.candidates = [];
  g.visibleCardIds = {}; g.slapLockouts = {}; g.slapTimes = {}; g.readyDeadline = now + READY_MS; g.readyRemaining = 0;
  g.resolveDeadline = 0; g.resolveRemaining = 0; g.autoLayDeadline = 0; g.autoLayRemaining = 0; g.matchWindowRemaining = 0; g.decisionRemaining = 0;
  g.roundWinner = undefined; g.matchWinner = undefined; g.draw = false; g.phase = 'ready'; g.resolution = undefined;
}

export function createGame(playerA: string, playerB: string, starter: string, format: 'quick'|'bestOf3', settings: SlapSettings, round = 1, score: Record<string, number> = {}, now = Date.now(), matchStarter = starter, cardIdBase = 0): SlapCountGame {
  const g = {
    slapCount: true as const, phase: 'ready' as const, playerA, playerB, decks: {}, pile: [], turn: starter, starter,
    matchStarter, round, format, settings: { ...settings }, count: 1, currentCardId: 0, currentCardSentAt: 0,
    currentCardCount: 1, currentCard: undefined, currentCardMatched: false, laidCards: 0, lastLayAt: 0,
    matchWindowDeadline: 0, matchWindowOpen: false, decisionDeadline: 0, decisionPending: false, candidates: [], visibleCardIds: {},
    slapLockouts: {}, slapTimes: {}, readyDeadline: 0, readyRemaining: 0, resolveDeadline: 0, resolveRemaining: 0,
    autoLayDeadline: 0, autoLayRemaining: 0, matchWindowRemaining: 0, decisionRemaining: 0, matchScore: {}, roundWinner: undefined, matchWinner: undefined, rttSamples: {},
    draw: false, paused: false, lastReaction: undefined, resolution: undefined,
  } satisfies SlapCountGame;
  makeRound(g, starter, round, score, now, cardIdBase);
  return g;
}

export function isOver(g: SlapCountGame) { return g.phase === 'matchOver'; }

function finishRound(g: SlapCountGame, winner: string|undefined, now: number) {
  g.roundWinner = winner; g.draw = !winner; g.readyDeadline = g.resolveDeadline = g.autoLayDeadline = g.matchWindowDeadline = g.decisionDeadline = 0;
  g.readyRemaining = g.resolveRemaining = g.autoLayRemaining = g.matchWindowRemaining = g.decisionRemaining = 0;
  g.matchWindowOpen = false; g.decisionPending = false; g.candidates = []; g.phase = 'roundOver';
  if (winner) g.matchScore[winner] = (g.matchScore[winner] ?? 0) + 1;
  const matchFinished = g.format === 'quick' || (!!winner && g.matchScore[winner] >= 2) || g.round >= 3;
  if (matchFinished) {
    g.phase = 'matchOver';
    if (g.format === 'quick') { g.matchWinner = winner; g.draw = !winner; }
    else if (winner && g.matchScore[winner] >= 2) g.matchWinner = winner;
    else if (g.format === 'bestOf3' && g.matchScore[g.playerA] !== g.matchScore[g.playerB]) g.matchWinner = g.matchScore[g.playerA] > g.matchScore[g.playerB] ? g.playerA : g.playerB;
    else g.draw = true;
  }
  g.paused = false; void now;
}

export function startPlaying(g: SlapCountGame, now = Date.now()) {
  if (g.phase !== 'ready' || g.paused || now < g.readyDeadline) return false;
  g.phase = 'playing'; g.readyDeadline = 0;
  g.autoLayDeadline = g.settings.pace === 'manual' ? 0 : now + g.settings.pace;
  return true;
}

export function layCard(g: SlapCountGame, player: string, now = Date.now()): SlapResult {
  if (g.paused || g.phase !== 'playing') return { changed: false, error: 'Cards can only be laid during play.' };
  if (player !== g.playerA && player !== g.playerB) return { changed: false, error: 'You are not in this game.' };
  if (g.decisionPending) return { changed: false, error: 'Wait for the slap to resolve.' };
  if (player !== g.turn) return { changed: false, error: 'Wait for your turn.' };
  const deck = g.decks[player];
  if (!deck.length) {
    if (g.matchWindowOpen) { g.autoLayDeadline = 0; return { changed: true }; }
    finishRound(g, other(g, player), now); return { changed: true };
  }
  if (g.lastLayAt && now - g.lastLayAt < MIN_LAY_MS) return { changed: false, error: 'Wait a moment before laying the next card.' };
  g.matchWindowOpen = false; g.matchWindowDeadline = 0; g.decisionPending = false; g.candidates = [];
  const usedCount = g.count;
  const card = deck.shift()!;
  g.pile.push(card); g.laidCards++; g.currentCardId++; g.currentCard = card; g.currentCardCount = usedCount;
  g.currentCardSentAt = now; g.currentCardMatched = card.value === usedCount; g.lastLayAt = now;
  g.count = usedCount === 10 ? 1 : usedCount + 1;
  g.turn = other(g, player);
  g.autoLayDeadline = g.settings.pace === 'manual' ? 0 : now + g.settings.pace;
  if (g.currentCardMatched) { g.matchWindowOpen = true; g.matchWindowDeadline = now + MATCH_MS; }
  const cardLaid = { cardId: g.currentCardId, card: { value: card.value, suit: card.suit }, count: g.settings.callMode ? null : usedCount, serverTime: now };
  if (g.laidCards >= MAX_LAID) {
    const a = g.decks[g.playerA].length; const b = g.decks[g.playerB].length;
    finishRound(g, a === b ? undefined : a > b ? g.playerA : g.playerB, now);
  } else if (!g.currentCardMatched && !g.decks[g.turn].length) finishRound(g, other(g, g.turn), now);
  return { changed: true, cardLaid };
}

export function markCardVisible(g: SlapCountGame, player: string) {
  if (g.currentCardId) g.visibleCardIds[player] = g.currentCardId;
}

export function recordRtt(g: SlapCountGame, player: string, rttMs: number) {
  if ((player !== g.playerA && player !== g.playerB) || !Number.isFinite(rttMs)) return;
  g.rttSamples[player] = [...(g.rttSamples[player] ?? []), Math.max(0, Math.min(2_000, rttMs))].slice(-7);
}

function medianRtt(g: SlapCountGame, player: string) {
  const values = [...(g.rttSamples[player] ?? [])].sort((a,b) => a-b);
  return values[Math.floor(values.length / 2)] ?? 0;
}

export function slap(g: SlapCountGame, player: string, cardId: number, rttMs = 0, now = Date.now()): SlapResult {
  if (g.paused || g.phase !== 'playing') return { changed: false, status: 'rejected' };
  if (player !== g.playerA && player !== g.playerB) return { changed: false, status: 'rejected' };
  if (!Number.isInteger(cardId) || cardId < 1 || cardId > g.currentCardId) return { changed: false, status: 'rejected' };
  if (cardId < g.currentCardId || !g.currentCard || g.visibleCardIds[player] !== cardId) return { changed: false, status: 'ignored' };
  if (g.currentCardMatched && (!g.matchWindowOpen || now > g.matchWindowDeadline)) return { changed: false, status: 'ignored' };
  if (g.slapLockouts[player] > now) return { changed: false, status: 'rejected' };
  const times = (g.slapTimes[player] ?? []).filter(at => now - at < 1_000);
  if (times.length >= 6) return { changed: false, status: 'ignored' };
  times.push(now); g.slapTimes[player] = times;
  if (!g.currentCardMatched) {
    const deck = g.decks[player]; const penalty = Math.min(g.settings.penaltyCards, deck.length);
    const moved = deck.splice(0, penalty); g.decks[other(g, player)].push(...moved);
    g.slapLockouts[player] = now + 1_000;
    g.resolution = { cardId, result: 'wrong', loser: player, penalty };
    return { changed: true, status: 'wrong', event: g.resolution };
  }
  if (g.candidates.some(candidate => candidate.player === player)) return { changed: false, status: 'ignored' };
  const boundedRtt = Number.isFinite(rttMs) ? Math.max(0, Math.min(60_000, rttMs)) : 0;
  g.candidates.push({ player, arrivalAt: now, rttMs: boundedRtt });
  if (!g.decisionPending) { g.decisionPending = true; g.decisionDeadline = now + DECISION_MS; }
  return { changed: true, status: 'pending' };
}

export function resolveWindow(g: SlapCountGame, now = Date.now()): SlapResult {
  if (g.paused || g.phase !== 'playing') return { changed: false };
  if (g.decisionPending && now >= g.decisionDeadline) {
    const adjusted = g.candidates.map(candidate => ({ ...candidate, adjusted: candidate.arrivalAt - g.currentCardSentAt - Math.min(candidate.rttMs / 2, 150) }));
    adjusted.sort((a, b) => a.adjusted - b.adjusted);
    const best = adjusted[0];
    const tied = adjusted.filter(candidate => candidate.adjusted - best.adjusted <= 20);
    const winner = tied.length > 1 ? tied[secureInt(tied.length)].player : best.player;
    const cardId = g.currentCardId; const loser = other(g, winner);
    const earned = shuffle(g.pile.splice(0)); g.decks[winner].push(...earned);
    g.turn = loser; g.count = 1; g.matchWindowOpen = false; g.matchWindowDeadline = 0;
    g.decisionPending = false; g.decisionDeadline = 0; g.candidates = []; g.phase = 'resolving';
    g.resolveDeadline = now + RESOLVE_MS; g.autoLayDeadline = 0;
    g.resolution = { cardId, result: 'pile', winner, loser };
    return { changed: true, event: g.resolution };
  }
  if (g.matchWindowOpen && now >= g.matchWindowDeadline) {
    g.matchWindowOpen = false; g.matchWindowDeadline = 0;
    if (!g.decks[g.turn].length) finishRound(g, other(g, g.turn), now);
    return { changed: true };
  }
  return { changed: false };
}

export function completeResolve(g: SlapCountGame, now = Date.now()) {
  if (g.paused || g.phase !== 'resolving' || now < g.resolveDeadline) return false;
  g.phase = 'playing'; g.resolveDeadline = 0; g.resolution = undefined;
  if (g.settings.pace !== 'manual') g.autoLayDeadline = now + g.settings.pace;
  if (!g.decks[g.turn].length) finishRound(g, other(g, g.turn), now);
  return true;
}

export function pauseTimers(g: SlapCountGame, now = Date.now()) {
  if (g.phase === 'ready' && g.readyDeadline) g.readyRemaining = Math.max(1, g.readyDeadline - now);
  if (g.phase === 'resolving' && g.resolveDeadline) g.resolveRemaining = Math.max(1, g.resolveDeadline - now);
  if (g.autoLayDeadline) g.autoLayRemaining = Math.max(1, g.autoLayDeadline - now);
  if (g.matchWindowDeadline) g.matchWindowRemaining = Math.max(1, g.matchWindowDeadline - now);
  if (g.decisionDeadline) g.decisionRemaining = Math.max(1, g.decisionDeadline - now);
  g.readyDeadline = g.resolveDeadline = g.autoLayDeadline = 0;
  g.matchWindowDeadline = g.decisionDeadline = 0;
  g.paused = true;
}

export function resumeTimers(g: SlapCountGame, now = Date.now()) {
  if (g.readyRemaining) { g.readyDeadline = now + g.readyRemaining; g.readyRemaining = 0; }
  if (g.resolveRemaining) { g.resolveDeadline = now + g.resolveRemaining; g.resolveRemaining = 0; }
  if (g.autoLayRemaining) { g.autoLayDeadline = now + g.autoLayRemaining; g.autoLayRemaining = 0; }
  if (g.matchWindowRemaining) { g.matchWindowDeadline = now + g.matchWindowRemaining; g.matchWindowRemaining = 0; }
  if (g.decisionRemaining) { g.decisionDeadline = now + g.decisionRemaining; g.decisionRemaining = 0; }
  g.paused = false;
}

export function getViewFor(g: SlapCountGame, player: string, now = Date.now()): SlapView {
  const opponent = other(g, player);
  const remaining = g.phase === 'ready' ? g.readyRemaining || Math.max(0, g.readyDeadline - now)
    : g.phase === 'resolving' ? g.resolveRemaining || Math.max(0, g.resolveDeadline - now)
      : g.decisionPending ? g.decisionRemaining || Math.max(0, g.decisionDeadline - now)
        : g.matchWindowOpen ? g.matchWindowRemaining || Math.max(0, g.matchWindowDeadline - now)
          : g.autoLayDeadline ? g.autoLayRemaining || Math.max(0, g.autoLayDeadline - now) : 0;
  return {
    game: 'slapcount', phase: g.phase, starter: g.starter, turn: g.turn, round: g.round, format: g.format,
    settings: { ...g.settings }, deckSizes: { [g.playerA]: g.decks[g.playerA].length, [g.playerB]: g.decks[g.playerB].length },
    myDeckSize: g.decks[player]?.length ?? 0, opponentDeckSize: g.decks[opponent]?.length ?? 0, pileSize: g.pile.length,
    topCards: g.pile.slice(-3).map(({ value, suit }) => ({ value, suit })), count: g.settings.callMode ? null : g.count,
    currentCardId: g.currentCardId, currentCardSentAt: g.currentCardSentAt,
    currentCardCount: g.settings.callMode ? null : g.currentCardCount,
    matchWindowOpen: g.matchWindowOpen && !g.decisionPending, decisionPending: g.decisionPending,
    slapLockouts: Object.fromEntries(Object.entries(g.slapLockouts).filter(([, deadline]) => deadline > now)),
    matchScore: { ...g.matchScore }, laidCards: g.laidCards,
    ...(g.readyDeadline ? { readyDeadline: g.readyDeadline } : {}), ...(g.resolveDeadline ? { resolveDeadline: g.resolveDeadline } : {}),
    ...(g.roundWinner ? { roundWinner: g.roundWinner } : {}), ...(g.matchWinner ? { matchWinner: g.matchWinner } : {}),
    ...(g.draw ? { draw: true } : {}), paused: g.paused, ...(g.paused && remaining ? { remainingMs: remaining } : {}),
    ...(g.lastReaction ? { lastReaction: { ...g.lastReaction } } : {}),
  };
}

export function handleMove(g: SlapCountGame, player: string, move: SlapMove, now = Date.now()): SlapResult {
  if (move.type === 'slap:react') {
    if (!isReactionId(move.emoji) || g.phase === 'roundOver' || g.phase === 'matchOver') return { changed: false };
    g.lastReaction = { player, emoji: move.emoji, at: now }; return { changed: true };
  }
  if (move.type === 'slap:layCard') return layCard(g, player, now);
  if (move.type === 'slap:slap') return slap(g, player, move.cardId, medianRtt(g, player), now);
  return { changed: false };
}
