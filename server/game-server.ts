import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@arcade/shared';
import { backToLobby, cupsGuess, cupsHint, cupsLock, cupsReact, disconnect, enterRoom, lobbyView, makeGuess, nextHangman, playerFor, reaction, roomForSocket, setHangman, startGame } from './rooms.js';
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
    publish(result.room);
  });

  const action = (fn: (room: NonNullable<ReturnType<typeof roomForSocket>>, player: string) => string | null | void) => {
    const room = roomForSocket(socket.id);
    const player = room && playerFor(room, socket.id);
    if (!room || !player) {
      socket.emit('actionError', 'Come back into your room first.');
      return;
    }
    const error = fn(room, player.id);
    publish(room);
    if (error) socket.emit('actionError', error);
  };

  socket.on('startGame', ({ game, format, cups }) => action((r, p) => startGame(r, p, game, format, cups)));
  socket.on('setHangmanWord', ({ word, hint }) => action((r, p) => setHangman(r, p, word, hint)));
  socket.on('guessLetter', ({ letter }) => action((r, p) => makeGuess(r, p, letter)));
  socket.on('hangmanReaction', ({ emoji }) => action((r, p) => reaction(r, p, emoji)));
  socket.on('hangmanAgain', () => action((r, p) => nextHangman(r, p)));
  socket.on('cupsLockSecret', ({ order }) => action((r, p) => cupsLock(r, p, order)));
  socket.on('cupsSubmitGuess', ({ order }) => action((r, p) => cupsGuess(r, p, order)));
  socket.on('cupsHint', ({ slot }) => action((r, p) => cupsHint(r, p, slot)));
  socket.on('cupsReaction', ({ emoji }) => action((r, p) => cupsReact(r, p, emoji)));
  socket.on('cupsNextRound', () => action((r, p) => nextHangman(r, p)));
  socket.on('backToLobby', () => action(r => backToLobby(r)));
  socket.on('disconnect', () => {
    const room = disconnect(socket.id);
    if (room) publish(room);
  });
});

export default httpServer;
