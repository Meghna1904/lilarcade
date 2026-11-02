import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@arcade/shared';
import { backToLobby, cupsGuess, cupsHint, cupsLock, cupsReact, disconnect, enterRoom, lobbyView, makeGuess, nextHangman, playerFor, poisonForcedLoss, poisonLock, poisonPick, poisonReact, poisonTap, poisonTimeout, nextPoisonRound, reaction, roomForSocket, setHangman, startGame } from './rooms.js';
import { checkForcedLoss } from './games/poison.js';
import { refreshSupabaseSession } from './utils/supabase/middleware.js';
import { isPlayerPersistenceConfigured, savePlayer } from './utils/supabase/admin.js';

dotenv.config({ path: path.resolve(process.cwd(), '../.env.local') });

const app = express();
export const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  path: '/api/socket-io/socket.io',
  cors: { origin: process.env.CLIENT_ORIGIN?.split(',') ?? true },
});

const root = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(root, '../../client/dist');
app.use(refreshSupabaseSession);
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(express.static(clientDist));
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));

function publish(room: NonNullable<ReturnType<typeof roomForSocket>>) {
  for (const p of room.players) if (p.online) io.to(p.socketId).emit('roomState', lobbyView(room, p.id));
}

const poisonTimers = new Map<string, ReturnType<typeof setTimeout>>();
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

io.on('connection', socket => {
  socket.on('enter', async ({ name: rawName, passcode, token }) => {
    const name = rawName.trim().slice(0, 24);
    if (!name || !passcode.trim() || !/^[a-f0-9-]{20,80}$/i.test(token)) {
      socket.emit('joinError', 'Add your name and shared passcode to come in.');
      return;
    }
    const cleanPasscode = passcode.trim();
    const result = enterRoom(cleanPasscode, name, token, socket.id);
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
    publish(room);
    if (error) socket.emit('actionError', error);
    ack?.(error ?? null);
  };

  socket.on('startGame', ({ game, format, cups, poison }) => action((r, p) => startGame(r, p, game, format, cups, poison)));
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
  socket.on('backToLobby', () => action(r => backToLobby(r)));
  socket.on('disconnect', () => {
    const room = disconnect(socket.id);
    if (room) { schedulePoisonTimer(room); publish(room); }
  });
});

export default httpServer;
