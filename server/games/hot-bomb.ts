import { randomInt } from 'node:crypto';
import type { HotBombAction, HotBombFlightView, HotBombView, MatchFormat } from '@arcade/shared';

type Flight = {
  kind: 'pass' | 'bounce' | 'feint';
  actor: string;
  from: string;
  to: string;
  startedAt: number;
  arrivesAt: number;
  reverseAt?: number;
  clearAt?: number;
  dodgeUntil: number;
  id: number;
  reversed: boolean;
  arrived: boolean;
};
type BombEvent = { id: number; type: 'go' | 'launched' | 'dodge' | 'feintReversed' | 'boom'; at: number; player?: string; loser?: string; mode?: 'held' | 'pass' | 'bounce' | 'feint' };
export const HOT_BOMB_CONFIG = {
  // The weights are percentage points and are renormalized after excluding the previous band.
  fuseBands: [
    { id: 'short', minMs: 3_000, maxMs: 10_000, weight: 12 },
    { id: 'medium', minMs: 20_000, maxMs: 45_000, weight: 38 },
    { id: 'long', minMs: 50_000, maxMs: 120_000, weight: 50 },
  ],
  countdownMs: 3_000, startingGripMs: 900, gripMs: 700, passFlightMs: 450,
  bounceFlightMs: 350, feintHalfFlightMs: 225, dodgeGraceMs: 100,
  passerStunMs: 1_100, feinterGripMs: 250, dodgesPerPlayer: 3, feintsPerPlayer: 4,
} as const;
type FuseBand = typeof HOT_BOMB_CONFIG.fuseBands[number]['id'];

export type HotBombGame = {
  hotBomb: true;
  phase: HotBombView['phase'];
  format: MatchFormat;
  playerA: string;
  playerB: string;
  round: number;
  holder: string | undefined;
  flight: Flight | undefined;
  dodges: Record<string, number>;
  feints: Record<string, number>;
  gripUntil: Record<string, number>;
  matchScore: Record<string, number>;
  countdownEndsAt: number;
  fuseEndsAt: number;
  fuseLengthMs?: number;
  fuseBand?: FuseBand;
  previousFuseBand?: FuseBand;
  usedFuseLengths: number[];
  paused: boolean;
  pausedAt?: number;
  flightId: number;
  eventId: number;
  lastEvent?: BombEvent;
  lastReaction?: { player: string; emoji: string; at: number };
  loser?: string;
  winner?: string;
  boomMode?: 'held' | 'pass' | 'bounce' | 'feint';
};

export function chooseHotBombFuse(previousBand?: FuseBand, usedLengths: readonly number[] = []) {
  const availableBands = HOT_BOMB_CONFIG.fuseBands.filter(band => band.id !== previousBand);
  const totalWeight = availableBands.reduce((sum, band) => sum + band.weight, 0);
  let pick = randomInt(totalWeight);
  const band = availableBands.find(candidate => (pick -= candidate.weight) < 0) ?? availableBands[availableBands.length - 1];
  let lengthMs: number;
  do { lengthMs = randomInt(band.minMs, band.maxMs + 1); } while (usedLengths.includes(lengthMs));
  return { band: band.id, lengthMs };
}

function nextEvent(game: HotBombGame, type: BombEvent['type'], at: number, fields: Omit<BombEvent, 'id' | 'type' | 'at'> = {}) {
  game.lastEvent = { id: ++game.eventId, type, at, ...fields };
}

function resetRound(game: HotBombGame, round: number, score: Record<string, number>, now: number) {
  game.phase = 'countdown';
  game.round = round;
  game.holder = randomInt(2) ? game.playerA : game.playerB;
  game.flight = undefined;
  game.dodges = { [game.playerA]: HOT_BOMB_CONFIG.dodgesPerPlayer, [game.playerB]: HOT_BOMB_CONFIG.dodgesPerPlayer };
  game.feints = { [game.playerA]: HOT_BOMB_CONFIG.feintsPerPlayer, [game.playerB]: HOT_BOMB_CONFIG.feintsPerPlayer };
  game.gripUntil = { [game.playerA]: 0, [game.playerB]: 0 };
  game.matchScore = { ...score, [game.playerA]: score[game.playerA] ?? 0, [game.playerB]: score[game.playerB] ?? 0 };
  game.countdownEndsAt = now + HOT_BOMB_CONFIG.countdownMs;
  game.fuseEndsAt = 0;
  game.fuseLengthMs = undefined;
  game.fuseBand = undefined;
  game.loser = undefined;
  game.winner = undefined;
  game.boomMode = undefined;
  game.lastEvent = undefined;
}

export function createHotBombGame(playerA: string, playerB: string, format: MatchFormat, round = 1, score: Record<string, number> = {}, now = Date.now()): HotBombGame {
  const game: HotBombGame = {
    hotBomb: true, phase: 'countdown', format, playerA, playerB, round, holder: undefined, flight: undefined,
    dodges: {}, feints: {}, gripUntil: {}, matchScore: {}, countdownEndsAt: 0, fuseEndsAt: 0, usedFuseLengths: [],
    paused: false, flightId: 0, eventId: 0,
  };
  resetRound(game, round, score, now);
  return game;
}

function explode(game: HotBombGame, at: number) {
  const flight = game.flight;
  const loser = flight ? flight.kind === 'feint' ? flight.actor : flight.to : game.holder;
  if (!loser) return;
  const winner = loser === game.playerA ? game.playerB : game.playerA;
  game.loser = loser;
  game.winner = winner;
  game.boomMode = flight?.kind ?? 'held';
  game.matchScore[winner] = (game.matchScore[winner] ?? 0) + 1;
  const target = game.format === 'quick' ? 1 : game.format === 'bestOf3' ? 2 : 3;
  const maximumRounds = game.format === 'quick' ? 1 : game.format === 'bestOf3' ? 3 : 5;
  game.phase = game.format === 'quick' || game.matchScore[winner] >= target || game.round >= maximumRounds ? 'matchOver' : 'roundOver';
  game.holder = undefined;
  game.flight = undefined;
  game.fuseEndsAt = 0;
  nextEvent(game, 'boom', at, { player: winner, loser, mode: game.boomMode });
}

function startFuse(game: HotBombGame, at: number) {
  game.phase = 'playing';
  game.countdownEndsAt = 0;
  const fuse = chooseHotBombFuse(game.previousFuseBand, game.usedFuseLengths);
  game.fuseBand = fuse.band;
  game.previousFuseBand = fuse.band;
  game.fuseLengthMs = fuse.lengthMs;
  game.usedFuseLengths.push(fuse.lengthMs);
  game.fuseEndsAt = at + fuse.lengthMs;
  if (game.holder) game.gripUntil[game.holder] = at + HOT_BOMB_CONFIG.startingGripMs;
  nextEvent(game, 'go', at);
}

export function advanceHotBomb(game: HotBombGame, now = Date.now()): boolean {
  if (game.paused) return false;
  let changed = false;
  for (let steps = 0; steps < 12; steps++) {
    if (game.phase === 'countdown' && now >= game.countdownEndsAt) {
      startFuse(game, game.countdownEndsAt);
      changed = true;
      continue;
    }
    if (game.phase !== 'playing') break;
    if (now >= game.fuseEndsAt) { explode(game, game.fuseEndsAt); return true; }
    const flight = game.flight;
    const reverseAt = flight?.reverseAt ?? Number.POSITIVE_INFINITY;
    const arriveAt = flight?.arrivesAt ?? Number.POSITIVE_INFINITY;
    const clearAt = flight?.clearAt ?? Number.POSITIVE_INFINITY;
    const next = Math.min(reverseAt, arriveAt, clearAt);
    if (next > now) break;
    if (flight && reverseAt === next && !flight.reversed) {
      const oldFrom = flight.from;
      flight.from = flight.to;
      flight.to = oldFrom;
      flight.reversed = true;
      flight.startedAt = next;
      flight.arrivesAt = next + HOT_BOMB_CONFIG.feintHalfFlightMs;
      flight.reverseAt = undefined;
      flight.dodgeUntil = 0;
      nextEvent(game, 'feintReversed', next, { player: flight.from });
      changed = true;
    } else if (flight && arriveAt === next) {
      if (flight.kind === 'feint' && flight.reversed) {
        game.holder = flight.to;
        game.gripUntil[flight.to] = next + HOT_BOMB_CONFIG.feinterGripMs;
        game.flight = undefined;
      } else if (flight.kind === 'pass' && !flight.arrived) {
        game.holder = flight.to;
        game.gripUntil[flight.to] = next + HOT_BOMB_CONFIG.gripMs;
        flight.arrived = true;
        flight.clearAt = next + HOT_BOMB_CONFIG.dodgeGraceMs;
      } else {
        game.holder = flight.to;
        game.flight = undefined;
      }
      changed = true;
    } else if (flight && clearAt === next) {
      game.flight = undefined;
      changed = true;
    }
  }
  return changed;
}

export function nextHotBombEventAt(game: HotBombGame, now = Date.now()): number | undefined {
  if (game.paused) return undefined;
  if (game.phase === 'countdown') return game.countdownEndsAt;
  if (game.phase !== 'playing') return undefined;
  const internal = [game.fuseEndsAt, game.flight?.reverseAt, game.flight?.arrivesAt, game.flight?.clearAt]
    .filter((time): time is number => typeof time === 'number' && time > 0);
  const grip = game.holder ? game.gripUntil[game.holder] : 0;
  if (grip > now) internal.push(grip);
  const times = internal;
  return times.length ? Math.min(...times) : undefined;
}

export function setHotBombPaused(game: HotBombGame, paused: boolean, now = Date.now()) {
  if (paused === game.paused) return;
  if (paused) {
    game.paused = true;
    game.pausedAt = now;
    return;
  }
  const shift = Math.max(0, now - (game.pausedAt ?? now));
  if (game.countdownEndsAt) game.countdownEndsAt += shift;
  if (game.fuseEndsAt) game.fuseEndsAt += shift;
  for (const player of [game.playerA, game.playerB]) game.gripUntil[player] = (game.gripUntil[player] ?? 0) + shift;
  if (game.flight) {
    game.flight.startedAt += shift;
    game.flight.arrivesAt += shift;
    if (game.flight.reverseAt) game.flight.reverseAt += shift;
    if (game.flight.clearAt) game.flight.clearAt += shift;
    if (game.flight.dodgeUntil) game.flight.dodgeUntil += shift;
  }
  if (game.lastEvent) game.lastEvent.at += shift;
  game.paused = false;
  game.pausedAt = undefined;
}

export function hotBombAction(game: HotBombGame, player: string, action: HotBombAction, now = Date.now()): string | null {
  advanceHotBomb(game, now);
  if (game.paused) return 'Wait until your person is back to play.';
  if (game.phase !== 'playing') return 'Wait for the countdown or the next round.';
  if (player !== game.playerA && player !== game.playerB) return 'You are not in this game.';
  if (action === 'dodge') {
    const flight = game.flight;
    if (!flight || flight.to !== player || flight.kind === 'bounce' || game.dodges[player] < 1 || now > flight.dodgeUntil) return null;
    game.dodges[player] -= 1;
    nextEvent(game, 'dodge', now, { player });
    if (flight.kind === 'pass') {
      const passer = flight.from;
      game.holder = undefined;
      game.gripUntil[passer] = now + HOT_BOMB_CONFIG.passerStunMs;
      game.flight = {
        kind: 'bounce', actor: player, from: player, to: passer, startedAt: now, arrivesAt: now + HOT_BOMB_CONFIG.bounceFlightMs,
        dodgeUntil: 0, id: ++game.flightId, reversed: false, arrived: false,
      };
    }
    return null;
  }
  if (game.holder !== player || game.flight) return 'You need to be holding the bomb.';
  if (now < (game.gripUntil[player] ?? 0)) return 'You are still gripping the bomb.';
  if (action === 'feint') {
    if (game.feints[player] < 1) return 'You are out of feints this round.';
    game.feints[player] -= 1;
  }
  const duration = HOT_BOMB_CONFIG.passFlightMs;
  const flight: Flight = {
    kind: action === 'feint' ? 'feint' : 'pass', actor: player, from: player,
    to: player === game.playerA ? game.playerB : game.playerA,
    startedAt: now, arrivesAt: now + duration,
    ...(action === 'feint' ? { reverseAt: now + HOT_BOMB_CONFIG.feintHalfFlightMs } : {}),
    dodgeUntil: action === 'feint' ? now + HOT_BOMB_CONFIG.feintHalfFlightMs : now + duration + HOT_BOMB_CONFIG.dodgeGraceMs,
    id: ++game.flightId, reversed: false, arrived: false,
  };
  game.holder = undefined;
  game.flight = flight;
  nextEvent(game, 'launched', now, { player });
  return null;
}

export function nextHotBombRound(game: HotBombGame, player: string, now = Date.now()): string | null {
  if (game.phase !== 'roundOver' && game.phase !== 'matchOver') return 'The bomb is still live.';
  if (player !== game.playerA && player !== game.playerB) return 'You are not in this game.';
  if (game.phase === 'matchOver') {
    game.previousFuseBand = undefined;
    game.usedFuseLengths = [];
    resetRound(game, 1, {}, now);
  }
  else resetRound(game, game.round + 1, game.matchScore, now);
  return null;
}

export function hotBombView(game: HotBombGame, self: string, now = Date.now()): HotBombView {
  const flight = game.flight;
  const incoming = !!flight && flight.to === self && flight.kind !== 'bounce' && now <= flight.dodgeUntil;
  const canHold = game.phase === 'playing' && !game.paused && game.holder === self && !flight && now >= (game.gripUntil[self] ?? 0);
  const flightView: HotBombFlightView | undefined = flight ? {
    id: flight.id, from: flight.from, to: flight.to, startedAt: flight.startedAt,
    durationMs: Math.max(0, flight.arrivesAt - flight.startedAt), reversed: flight.reversed,
  } : undefined;
  return {
    game: 'hotbomb', phase: game.phase, format: game.format, round: game.round,
    playerA: game.playerA, playerB: game.playerB, holder: game.holder, flight: flightView,
    myDodges: game.dodges[self] ?? 0, myFeints: game.feints[self] ?? 0, matchScore: { ...game.matchScore },
    countdownEndsAt: game.phase === 'countdown' ? game.countdownEndsAt : undefined,
    canPass: canHold, canFeint: canHold && game.feints[self] > 0,
    canDodge: game.phase === 'playing' && !game.paused && incoming && game.dodges[self] > 0,
    gripLocked: game.phase === 'playing' && game.holder === self && now < (game.gripUntil[self] ?? 0),
    loser: game.loser, winner: game.winner, boomMode: game.boomMode, paused: game.paused, lastReaction: game.lastReaction,
    ...(game.phase === 'roundOver' || game.phase === 'matchOver' ? { fuseLengthMs: game.fuseLengthMs } : {}),
    lastEvent: game.lastEvent && { id: game.lastEvent.id, type: game.lastEvent.type, player: game.lastEvent.player, loser: game.lastEvent.loser, mode: game.lastEvent.mode },
  };
}
