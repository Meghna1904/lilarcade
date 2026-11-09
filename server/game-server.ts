import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@arcade/shared';
import type { CloudMove } from '@arcade/shared';
import type { SlapMove } from '@arcade/shared';
import { backToLobby, cloudMove, cupsGuess, cupsHint, cupsLock, cupsReact, disconnect, enterRoom, lobbyView, makeGuess, nextCloudRound, nextHangman, nextSlapRound, playerFor, poisonForcedLoss, poisonLock, poisonPick, poisonReact, poisonTap, poisonTimeout, nextPoisonRound, reaction, roomForSocket, setHangman, slapCompleteResolve, slapMove, slapResolveWindow, slapStartPlaying, startGame, markSlapCardVisible, updatePlayerDoodle, familyFeudStart, familyFeudSubmit, familyFeudScore, familyFeudNext, familyFeudTimeout, rpsChoose, rpsNext, ticTacToeMove, ticTacToeReplay, hotBombAction, hotBombNext, advanceHotBombRoom, hotBombTimerAt, twoHalvesPage, twoHalvesPaint, twoHalvesComplete, twoHalvesBack, twoHalvesSettings, twoHalvesTear, twoHalvesSide, picturePuzzleSetup, picturePuzzleReady, picturePuzzleGrab, picturePuzzleMove, picturePuzzleDrop, picturePuzzleScatter, picturePuzzleReplay, picturePuzzleBack, leaveRoom } from './rooms.js';
import { checkForcedLoss, legalTiles } from './games/poison.js';
import { clearLockout, completeSwap, pauseTimers, resumeTimers, timeoutCall, timeoutHunt, type CloudGame } from './games/cloud.js';
import { completeResolve, pauseTimers as pauseSlapTimers, recordOneWayLatency, resumeTimers as resumeSlapTimers, type SlapCountGame } from './games/slapcount.js';
import { refreshSupabaseSession } from './utils/supabase/middleware.js';
import { isPlayerPersistenceConfigured, savePlayer } from './utils/supabase/admin.js';

dotenv.config({ path: path.resolve(process.cwd(), '../.env.local') });

export const app = express();
export const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  path: '/socket.io',
  cors: { origin: process.env.CLIENT_ORIGIN?.split(',') ?? true },
});
const picturePuzzleImagesSent = new Map<string, { seed: number; image: string }>();

const root = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(root, '../../client/dist');
app.use(refreshSupabaseSession);
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(express.static(clientDist));
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));

function publish(room: NonNullable<ReturnType<typeof roomForSocket>>) {
  for (const p of room.players) if (p.online) {
    const game = room.game;
    if (game && 'slapCount' in game && game.currentCard && game.visibleCardIds[p.id] !== game.currentCardId) {
      io.to(p.socketId).emit('slap:cardLaid', { cardId: game.currentCardId, card: { value: game.currentCard.value, suit: game.currentCard.suit }, count: game.settings.callMode ? null : game.currentCardCount, serverTime: game.currentCardSentAt });
      markSlapCardVisible(room, p.id);
    }
    const state = lobbyView(room, p.id);
    if (state.game?.game === 'picturepuzzle' && state.game.image) {
      const sent = picturePuzzleImagesSent.get(p.socketId);
      if (state.game.phase !== 'setup' && sent?.seed === state.game.seed && sent.image === state.game.image) delete state.game.image;
      else picturePuzzleImagesSent.set(p.socketId, { seed: state.game.seed, image: state.game.image });
    }
    io.to(p.socketId).emit('roomState', state);
  }
}

const poisonTimers = new Map<string, ReturnType<typeof setTimeout>>();
const cloudTimers = new Map<string, ReturnType<typeof setTimeout>>();
const cloudPublishTimes = new Map<string, number>();
const cloudPublishTimers = new Map<string, ReturnType<typeof setTimeout>>();
const slapTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingSlapPings = new Map<string, Map<number, number>>();
const familyFeudTimers = new Map<string, ReturnType<typeof setTimeout>>();
const hotBombTimers = new Map<string, ReturnType<typeof setTimeout>>();
function clearRoomTimers(key: string) {
  for (const timers of [poisonTimers, cloudTimers, cloudPublishTimers, slapTimers, familyFeudTimers, hotBombTimers]) {
    const timer = timers.get(key);
    if (timer) clearTimeout(timer);
    timers.delete(key);
  }
  cloudPublishTimes.delete(key);
}
function scheduleHotBombTimer(room: NonNullable<ReturnType<typeof roomForSocket>>) {
  const old = hotBombTimers.get(room.key);
  if (old) clearTimeout(old);
  hotBombTimers.delete(room.key);
  const deadline = hotBombTimerAt(room);
  if (deadline === undefined) return;
  const game = room.game;
  hotBombTimers.set(room.key, setTimeout(() => {
    hotBombTimers.delete(room.key);
    if (room.game !== game) return;
    advanceHotBombRoom(room);
    publish(room);
    scheduleHotBombTimer(room);
  }, Math.max(0, deadline - Date.now())));
}
function scheduleFamilyFeudTimer(room: NonNullable<ReturnType<typeof roomForSocket>>) {
  const previous = familyFeudTimers.get(room.key); if (previous) clearTimeout(previous); familyFeudTimers.delete(room.key);
  const game = room.game;
  if (!game || !('familyFeud' in game) || game.phase !== 'answering') return;
  const deadline = game.deadline;
  familyFeudTimers.set(room.key, setTimeout(() => {
    familyFeudTimers.delete(room.key);
    if (room.game !== game || game.phase !== 'answering' || game.deadline !== deadline) return;
    if (familyFeudTimeout(room)) publish(room);
  }, Math.max(0, deadline - Date.now())));
}
function schedulePoisonTimer(room: NonNullable<ReturnType<typeof roomForSocket>>) {
  const old = poisonTimers.get(room.key);
  if (old) clearTimeout(old);
  poisonTimers.delete(room.key);
  const game = room.game;
  if (!game || !('poisonA' in game) || game.phase !== 'playing') return;
  if (game.paused) {
    if (game.turnDeadline > 0) game.timerRemaining = Math.max(1, game.turnDeadline - Date.now());
    game.turnDeadline = 0;
    return;
  }
  if (legalTiles(game, game.currentTurn).length === 0) {
    poisonTimeout(room);
    publish(room);
    return;
  }
  const forced = checkForcedLoss(game);
  if (!forced && !game.settings.timerEnabled) { game.turnDeadline = 0; return; }
  if (game.timerRemaining > 0) {
    game.turnDeadline = Date.now() + game.timerRemaining;
    game.timerRemaining = 0;
  } else if (!game.turnDeadline || game.turnDeadline <= Date.now()) game.turnDeadline = Date.now() + (forced ? 1500 : 20_000);
  const deadline = game.turnDeadline;
  poisonTimers.set(room.key, setTimeout(() => {
    poisonTimers.delete(room.key);
    if (room.game !== game || game.paused || game.phase !== 'playing' || game.turnDeadline !== deadline) return;
    if (checkForcedLoss(game)) poisonForcedLoss(room); else poisonTimeout(room);
    publish(room);
    schedulePoisonTimer(room);
  }, Math.max(0, deadline - Date.now())));
}

function publishCloudNow(room: NonNullable<ReturnType<typeof roomForSocket>>) {
  const pending = cloudPublishTimers.get(room.key);
  if (pending) clearTimeout(pending);
  cloudPublishTimers.delete(room.key);
  cloudPublishTimes.set(room.key, Date.now());
  publish(room);
}

function publishCloudThrottled(room: NonNullable<ReturnType<typeof roomForSocket>>) {
  const sinceLast = Date.now() - (cloudPublishTimes.get(room.key) ?? 0);
  if (sinceLast >= 100) { publishCloudNow(room); return; }
  if (cloudPublishTimers.has(room.key)) return;
  cloudPublishTimers.set(room.key, setTimeout(() => publishCloudNow(room), 100 - sinceLast));
}

function scheduleCloudTimer(room: NonNullable<ReturnType<typeof roomForSocket>>) {
  const existing = cloudTimers.get(room.key);
  if (existing) clearTimeout(existing);
  cloudTimers.delete(room.key);
  const game = room.game;
  if (!game || !('cloudGame' in game) || game.phase === 'roundOver' || game.phase === 'matchOver') return;
  if (game.paused) { pauseTimers(game); return; }
  resumeTimers(game);
  const deadlines = [
    game.phase === 'calling' ? game.callDeadline : 0,
    game.phase === 'hunting' ? game.huntDeadline : 0,
    game.phase === 'swapping' ? game.swapDeadline : 0,
    game.lockoutUntil,
  ].filter(deadline => deadline > 0);
  if (!deadlines.length) return;
  const deadline = Math.min(...deadlines);
  cloudTimers.set(room.key, setTimeout(() => {
    cloudTimers.delete(room.key);
    if (room.game !== game || game.paused) return;
    const now = Date.now();
    let changed = false;
    if (game.phase === 'calling' && game.callDeadline > 0 && game.callDeadline <= now) changed = timeoutCall(game, now);
    else if (game.phase === 'hunting' && game.huntDeadline > 0 && game.huntDeadline <= now) changed = timeoutHunt(game, now);
    else if (game.phase === 'swapping' && game.swapDeadline > 0 && game.swapDeadline <= now) changed = completeSwap(game, now);
    if (game.lockoutUntil > 0 && game.lockoutUntil <= now) changed = clearLockout(game, now) || changed;
    if (changed) publishCloudNow(room);
    scheduleCloudTimer(room);
  }, Math.max(0, deadline - Date.now())));
}

function handleCloud(room: NonNullable<ReturnType<typeof roomForSocket>>, player: string, move: CloudMove, tickAck?: (accepted: boolean) => void) {
  const result = cloudMove(room, player, move);
  if (result.error) {
    tickAck?.(false);
    const socketId = room.players.find(entry => entry.id === player)?.socketId;
    if (socketId) io.to(socketId).emit('actionError', result.error);
    return;
  }
  tickAck?.(result.accepted ?? false);
  if (!result.changed) return;
  scheduleCloudTimer(room);
  if (move.type === 'cloud:tick') publishCloudThrottled(room);
  else publishCloudNow(room);
}

function emitSlapEvent(room: NonNullable<ReturnType<typeof roomForSocket>>, event?: SlapCountGame['resolution']) {
  if (!event) return;
  for (const p of room.players) if (p.online) io.to(p.socketId).emit('slap:resolved', event);
}

function scheduleSlapTimer(room: NonNullable<ReturnType<typeof roomForSocket>>) {
  const old = slapTimers.get(room.key); if (old) clearTimeout(old); slapTimers.delete(room.key);
  const game = room.game;
  if (!game || !('slapCount' in game) || game.phase === 'roundOver' || game.phase === 'matchOver') return;
  if (game.paused) { pauseSlapTimers(game); return; }
  resumeSlapTimers(game);
  const deadlines = [
    game.phase === 'ready' ? game.readyDeadline : 0,
    game.decisionPending ? game.decisionDeadline : 0,
    game.matchWindowOpen && !game.decisionPending ? game.matchWindowDeadline : 0,
    game.phase === 'resolving' ? game.resolveDeadline : 0,
    game.phase === 'playing' ? game.autoLayDeadline : 0,
  ].filter(value => value > 0);
  if (!deadlines.length) return;
  const due = Math.min(...deadlines);
  slapTimers.set(room.key, setTimeout(() => {
    slapTimers.delete(room.key);
    if (room.game !== game || game.paused) return;
    const now = Date.now(); let changed = false; let result: ReturnType<typeof slapMove> | undefined;
    if (game.phase === 'ready' && game.readyDeadline <= now) changed = slapStartPlaying(room, now);
    else if (game.decisionPending && game.decisionDeadline <= now) {
      const resolved = slapResolveWindow(room, now); changed = resolved.changed; emitSlapEvent(room, resolved.event);
    } else if (game.matchWindowOpen && !game.decisionPending && game.matchWindowDeadline <= now) changed = slapResolveWindow(room, now).changed;
    else if (game.phase === 'resolving' && game.resolveDeadline <= now) changed = slapCompleteResolve(room, now);
    else if (game.phase === 'playing' && game.autoLayDeadline && game.autoLayDeadline <= now) {
      result = slapMove(room, game.turn, { type: 'slap:layCard' }, now); changed = result.changed;
    }
    if (result?.event) emitSlapEvent(room, result.event);
    if (changed) publish(room);
    scheduleSlapTimer(room);
  }, Math.max(0, due - Date.now())));
}

function handleSlap(room: NonNullable<ReturnType<typeof roomForSocket>>, player: string, move: SlapMove, ack?: (result: 'pending'|'ignored'|'wrong'|'rejected') => void) {
  const result = slapMove(room, player, move);
  if (result.error) { ack?.('rejected'); io.to(room.players.find(entry => entry.id === player)?.socketId ?? '').emit('actionError', result.error); return; }
  ack?.(result.status ?? (result.changed ? 'pending' : 'rejected'));
  if (!result.changed) return;
  emitSlapEvent(room, result.event);
  scheduleSlapTimer(room);
  publish(room);
}

io.on('connection', socket => {
  socket.on('doodle:select', ({ doodleId }) => {
    const room = roomForSocket(socket.id);
    const player = room && playerFor(room, socket.id);
    if (!room || !player || !updatePlayerDoodle(room, player.id, doodleId)) {
      socket.emit('actionError', 'Choose a doodle from the gallery.');
      return;
    }
    publish(room);
  });
  socket.on('enter', async ({ name: rawName, passcode, token, timezone, doodleId, shareSky }) => {
    const name = rawName.trim().slice(0, 24);
    if (!name || !passcode.trim() || !/^[a-f0-9-]{20,80}$/i.test(token)) {
      socket.emit('joinError', 'Add your name and shared passcode to come in.');
      return;
    }
    const cleanPasscode = passcode.trim();
    const result = enterRoom(cleanPasscode, name, token, socket.id, { timezone, doodleId, shareSky });
    if (result.error || !result.room) {
      socket.emit('joinError', result.error ?? 'Could not enter the room.');
      return;
    }
    if (isPlayerPersistenceConfigured()) {
      try {
        await savePlayer(name, cleanPasscode, token);
      } catch (error) {
        console.error('Could not save player identity to Supabase:', error);
      }
    }
    schedulePoisonTimer(result.room);
    scheduleCloudTimer(result.room);
    scheduleSlapTimer(result.room);
    scheduleFamilyFeudTimer(result.room);
    scheduleHotBombTimer(result.room);
    publish(result.room);
  });

  const action = (
    fn: (room: NonNullable<ReturnType<typeof roomForSocket>>, player: string) => string | null | void,
    ack?: (error: string | null) => void,
  ) => {
    const room = roomForSocket(socket.id);
    const player = room && playerFor(room, socket.id);
    if (!room || !player) {
      socket.emit('actionError', 'Come back into your room first.');
      ack?.('Come back into your room first.');
      return;
    }
    const error = fn(room, player.id);
    schedulePoisonTimer(room);
    scheduleCloudTimer(room);
    scheduleSlapTimer(room);
    scheduleFamilyFeudTimer(room);
    scheduleHotBombTimer(room);
    publish(room);
    if (error) socket.emit('actionError', error);
    ack?.(error ?? null);
  };

  const cloudAction = (move: CloudMove, ack?: (accepted: boolean) => void) => {
    const room = roomForSocket(socket.id);
    const player = room && playerFor(room, socket.id);
    if (!room || !player) { ack?.(false); socket.emit('actionError', 'Come back into your room first.'); return; }
    handleCloud(room, player.id, move, ack);
  };

  socket.on('startGame', ({ game, format, cups, poison, cloud, slapCount, familyFeud, solo, tictactoe }) => action((r, p) => startGame(r, p, game, format, cups, poison, cloud, slapCount, familyFeud, solo, tictactoe)));
  socket.on('tictactoe:move', ({ board, cell }) => action((r, p) => ticTacToeMove(r, p, board, cell)));
  socket.on('tictactoe:replay', () => action((r, p) => ticTacToeReplay(r, p)));
  socket.on('familyfeud:start', () => action((r, p) => familyFeudStart(r, p)));
  socket.on('familyfeud:submit', ({ answer }) => action((r, p) => familyFeudSubmit(r, p, answer)));
  socket.on('familyfeud:score', ({ target, matchIndex, points }) => action((r, p) => familyFeudScore(r, p, target, matchIndex, points)));
  socket.on('familyfeud:next', () => action((r, p) => familyFeudNext(r, p)));
  socket.on('rps:choose', ({ choice }) => action((r, p) => rpsChoose(r, p, choice)));
  socket.on('rps:next', () => action((r, p) => rpsNext(r, p)));
  socket.on('hotbomb:action', ({ action: move }) => action((r, p) => hotBombAction(r, p, move)));
  socket.on('hotbomb:next', () => action((r, p) => hotBombNext(r, p)));
  socket.on('twohalves:page', ({ page }) => action((r, p) => twoHalvesPage(r, p, page)));
  socket.on('twohalves:paint', ({ image, side }) => action((r, p) => twoHalvesPaint(r, p, image, side)));
  socket.on('twohalves:side', ({ side }) => action((r, p) => twoHalvesSide(r, p, side)));
  socket.on('twohalves:settings', patch => action((r, p) => twoHalvesSettings(r, p, patch)));
  socket.on('twohalves:tear', payload => action((r, p) => twoHalvesTear(r, p, payload)));
  socket.on('twohalves:complete', payload => action((r, p) => twoHalvesComplete(r, p, payload?.side)));
  socket.on('twohalves:back', () => action(r => twoHalvesBack(r)));
  socket.on('picturepuzzle:setup', (payload, ack) => action((r, p) => picturePuzzleSetup(r, p, payload), ack));
  socket.on('picturepuzzle:ready', ack => action((r, p) => picturePuzzleReady(r, p), ack));
  socket.on('picturepuzzle:grab', ({ piece }, ack) => action((r, p) => picturePuzzleGrab(r, p, piece), ack));
  socket.on('picturepuzzle:move', ({ piece, x, y }) => action((r, p) => picturePuzzleMove(r, p, piece, x, y)));
  socket.on('picturepuzzle:drop', ({ piece }) => action((r, p) => picturePuzzleDrop(r, p, piece)));
  socket.on('picturepuzzle:scatter', () => action((r, p) => picturePuzzleScatter(r, p)));
  socket.on('picturepuzzle:replay', () => action((r, p) => picturePuzzleReplay(r, p)));
  socket.on('picturepuzzle:back', () => action(r => picturePuzzleBack(r)));
  socket.on('setHangmanWord', ({ word, hint }) => action((r, p) => setHangman(r, p, word, hint)));
  socket.on('guessLetter', ({ letter }) => action((r, p) => makeGuess(r, p, letter)));
  socket.on('hangmanReaction', ({ emoji }) => action((r, p) => reaction(r, p, emoji)));
  socket.on('hangmanAgain', () => action((r, p) => nextHangman(r, p)));
  socket.on('cupsLockSecret', ({ order }, ack) => action((r, p) => cupsLock(r, p, order), ack));
  socket.on('cupsSubmitGuess', ({ order }, ack) => action((r, p) => cupsGuess(r, p, order), ack));
  socket.on('cupsHint', ({ slot }, ack) => action((r, p) => cupsHint(r, p, slot), ack));
  socket.on('cupsReaction', ({ emoji }, ack) => action((r, p) => cupsReact(r, p, emoji), ack));
  socket.on('cupsNextRound', ack => action((r, p) => nextHangman(r, p), ack));
  socket.on('poisonPickTile', ({ tile }) => action((r, p) => poisonPick(r, p, tile)));
  socket.on('poisonLockPick', () => action((r, p) => poisonLock(r, p)));
  socket.on('poisonTapTile', ({ tile, turnNumber }) => action((r, p) => poisonTap(r, p, tile, turnNumber)));
  socket.on('poisonReact', ({ emoji }) => action((r, p) => poisonReact(r, p, emoji)));
  socket.on('poisonNextRound', () => action((r, p) => nextPoisonRound(r, p)));
  socket.on('cloud:callNumber', payload => cloudAction({ type: 'cloud:callNumber', ...payload }));
  socket.on('cloud:requestState', () => {
    const room = roomForSocket(socket.id);
    const player = room && playerFor(room, socket.id);
    if (room && player && room.game && 'cloudGame' in room.game) socket.emit('roomState', lobbyView(room, player.id));
  });
  socket.on('cloud:tick', (payload, ack) => cloudAction({ type: 'cloud:tick', ...payload }, ack));
  socket.on('cloud:findNumber', payload => cloudAction({ type: 'cloud:findNumber', ...payload }));
  socket.on('cloud:react', payload => cloudAction({ type: 'cloud:react', ...payload }));
  socket.on('cloud:nextRound', () => action((r, p) => nextCloudRound(r, p)));
  socket.on('cloud:backToLobby', () => action(r => backToLobby(r)));
  socket.on('slap:ping', ({ pingId }) => {
    let pending = pendingSlapPings.get(socket.id);
    if (!pending) { pending = new Map(); pendingSlapPings.set(socket.id, pending); }
    pending.set(pingId, Date.now());
    while (pending.size > 16) pending.delete(pending.keys().next().value!);
    socket.emit('slap:pong', { pingId, serverTime: Date.now() });
  });
  socket.on('slap:pong', ({ pingId }) => {
    const pending = pendingSlapPings.get(socket.id); const sentAt = pending?.get(pingId);
    if (sentAt === undefined) return;
    pending!.delete(pingId);
    const room = roomForSocket(socket.id); const player = room && playerFor(room, socket.id);
    const game = room?.game;
    if (player && game && 'slapCount' in game) recordOneWayLatency(game, player.id, (Date.now() - sentAt) / 2);
  });
  socket.on('slap:layCard', () => {
    const room = roomForSocket(socket.id); const player = room && playerFor(room, socket.id);
    if (!room || !player) { socket.emit('actionError', 'Come back into your room first.'); return; }
    handleSlap(room, player.id, { type: 'slap:layCard' });
  });
  socket.on('slap:slap', (payload, ack) => {
    const room = roomForSocket(socket.id); const player = room && playerFor(room, socket.id);
    if (!room || !player) { ack?.('rejected'); socket.emit('actionError', 'Come back into your room first.'); return; }
    handleSlap(room, player.id, { type: 'slap:slap', ...payload }, ack);
  });
  socket.on('slap:react', payload => {
    const room = roomForSocket(socket.id); const player = room && playerFor(room, socket.id);
    if (!room || !player) return;
    handleSlap(room, player.id, { type: 'slap:react', ...payload });
  });
  socket.on('slap:nextRound', () => action((r,p) => nextSlapRound(r,p)));
  socket.on('slap:backToLobby', () => action(r => backToLobby(r)));
  socket.on('backToLobby', () => action(r => backToLobby(r)));
  socket.on('leaveRoom', () => {
    const room = roomForSocket(socket.id);
    const player = room && playerFor(room, socket.id);
    if (!room || !player) return;
    const name = player.name;
    clearRoomTimers(room.key);
    const remaining = leaveRoom(room, player.id);
    if (!remaining) return;
    publish(remaining);
    for (const p of remaining.players) if (p.online) io.to(p.socketId).emit('actionError', `${name} left the room.`);
  });
  socket.on('disconnect', () => {
    pendingSlapPings.delete(socket.id);
    picturePuzzleImagesSent.delete(socket.id);
    const room = disconnect(socket.id);
    if (room) { schedulePoisonTimer(room); scheduleCloudTimer(room); scheduleSlapTimer(room); scheduleFamilyFeudTimer(room); scheduleHotBombTimer(room); publish(room); }
  });
});

export default httpServer;
