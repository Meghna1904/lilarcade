import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import type { ClientToServerEvents, HangmanMove, ServerToClientEvents } from '@arcade/shared';
import { configureSettings, handleMove } from './games/hangman.js';
import { backToLobby, disconnect, enterRoom, lobbyView, makeGuess, nextHangman, playerFor, reaction, roomForSocket, setHangman, startGame } from './rooms.js';

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, { cors: { origin: process.env.CLIENT_ORIGIN?.split(',') ?? true } });
const root = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(root, '../../client/dist');
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(express.static(clientDist));
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));

function publish(room: NonNullable<ReturnType<typeof roomForSocket>>) {
  for (const p of room.players) if (p.online) io.to(p.socketId).emit('roomState', lobbyView(room, p.id));
}
function applyHangmanMove(room: NonNullable<ReturnType<typeof roomForSocket>>, player: string, move: HangmanMove) {
  const current = room.game;
  if (!current) return 'Start a game first.';
  const before = current.matchScore[current.setter]! + current.matchScore[current.guesser]!;
  const error = handleMove(current, player, move);
  const after = current.matchScore[current.setter]! + current.matchScore[current.guesser]!;
  if (!error && after > before && current.roundWinner) room.scoreboard.hangman[current.roundWinner] = (room.scoreboard.hangman[current.roundWinner] ?? 0) + 1;
  return error;
}
io.on('connection', socket => {
  socket.on('enter', ({ name: rawName, passcode, token }) => {
    const name = rawName.trim().slice(0, 24);
    if (!name || !passcode.trim() || !/^[a-f0-9-]{20,80}$/i.test(token)) { socket.emit('joinError', 'Add your name and shared passcode to come in.'); return; }
    const result = enterRoom(passcode.trim(), name, token, socket.id);
    if (result.error || !result.room) { socket.emit('joinError', result.error ?? 'Could not enter the room.'); return; }
    publish(result.room);
  });
  const action = (fn: (room: NonNullable<ReturnType<typeof roomForSocket>>, player: string) => string | null | void) => {
    const room = roomForSocket(socket.id); const player = room && playerFor(room, socket.id);
    if (!room || !player) { socket.emit('actionError', 'Come back into your room first.'); return; }
    const error = fn(room, player.id); publish(room); if (error) socket.emit('actionError', error);
  };
  socket.on('startGame', ({ game, format, settings }) => action((r,p) => {
    if (game === 'hangman' && format !== 'quick' && format !== 'bestOf3') return 'Choose a quick round or best of 3.';
    const error = startGame(r,p,game,format);
    if (error || game !== 'hangman' || !r.game || !settings) return error;
    return configureSettings(r.game, p, settings);
  }));
  socket.on('hangman:lockWord', ({ word, hint }) => action((r,p) => applyHangmanMove(r,p,{ type: 'lockWord', word, hint })));
  socket.on('hangman:guessLetter', ({ letter }) => action((r,p) => applyHangmanMove(r,p,{ type: 'guessLetter', letter })));
  socket.on('hangman:guessWord', ({ word }) => action((r,p) => applyHangmanMove(r,p,{ type: 'guessWord', word })));
  socket.on('hangman:revealLetter', () => action((r,p) => applyHangmanMove(r,p,{ type: 'revealLetter' })));
  socket.on('hangman:setSettings', settings => action((r,p) => r.game ? configureSettings(r.game,p,settings) : 'Start a game first.'));
  socket.on('hangman:react', ({ emoji }) => action((r,p) => applyHangmanMove(r,p,{ type: 'react', emoji })));
  socket.on('hangman:nextRound', () => action((r,p) => nextHangman(r,p)));
  socket.on('hangman:backToLobby', () => action(r => backToLobby(r)));
  socket.on('setHangmanWord', ({ word, hint }) => action((r,p) => setHangman(r,p,word,hint)));
  socket.on('guessLetter', ({ letter }) => action((r,p) => makeGuess(r,p,letter)));
  socket.on('hangmanReaction', ({ emoji }) => action((r,p) => reaction(r,p,emoji)));
  socket.on('hangmanAgain', () => action((r,p) => nextHangman(r,p)));
  socket.on('backToLobby', () => action(r => backToLobby(r)));
  socket.on('disconnect', () => { const room = disconnect(socket.id); if (room) publish(room); });
});
const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => console.log(`Our Little Arcade is listening on ${port}`));
