import { createHash, createHmac } from 'node:crypto';
import type { GameId, MatchFormat, RoomView, Scoreboard } from '@arcade/shared';
import { createHangman, guess, setWord, viewFor, type HangmanGame } from './games/hangman.js';
type Player = { id: string; name: string; online: boolean; socketId: string };
type Room = { key: string; players: Player[]; game: HangmanGame | null; scoreboard: Scoreboard };
const rooms = new Map<string, Room>();
const emptyScore = (): Scoreboard => ({ hangman: {}, cups: {}, poison: {} });
export const hashPasscode = (passcode: string) => {
  const pepper = process.env.ARCADE_PASSCODE_PEPPER;
  return pepper
    ? createHmac('sha256', pepper).update(`room:${passcode}`).digest('hex')
    : createHash('sha256').update(passcode).digest('hex');
};
export function enterRoom(passcode: string, name: string, token: string, socketId: string): { room?: Room; error?: string; id?: string } {
  const key = hashPasscode(passcode); let room = rooms.get(key);
  if (!room) { room = { key, players: [], game: null, scoreboard: emptyScore() }; rooms.set(key, room); }
  let player = room.players.find(p => p.id === token);
  if (player && player.name !== name) return { error: 'That device is already paired with a different name.' };
  if (!player) {
    if (room.players.length >= 2) return { error: 'This room is full.' };
    player = { id: token, name, online: true, socketId }; room.players.push(player);
  } else { player.online = true; player.socketId = socketId; }
  if (room.game) room.game.paused = room.players.some(p => !p.online);
  return { room, id: player.id };
}
export function disconnect(socketId: string) {
  for (const room of rooms.values()) {
    const p = room.players.find(player => player.socketId === socketId);
    if (p) { p.online = false; if (room.game) room.game.paused = true; return room; }
  }
}
export function roomForSocket(socketId: string) { return [...rooms.values()].find(r => r.players.some(p => p.socketId === socketId)); }
export function playerFor(room: Room, socketId: string) { return room.players.find(p => p.socketId === socketId); }
export function lobbyView(room: Room, self: string, error?: string): RoomView {
  const players = room.players.map(({ id, name, online }) => ({ id, name, online }));
  const other = room.players.find(p => p.id !== self);
  return { self, players, status: !other ? 'Waiting for your person…' : other.online ? `${other.name} is here 💗` : `${other.name} disconnected, waiting for them to come back`, game: room.game ? viewFor(room.game, self) : null, scoreboard: room.scoreboard, ...(error ? { error } : {}) };
}
export function startGame(room: Room, player: string, game: GameId, format: MatchFormat) {
  if (room.players.length !== 2 || room.players.some(p => !p.online)) return 'Wait until both of you are here.';
  if (room.game && room.game.phase !== 'matchOver') return 'A game is already in progress.';
  if (game !== 'hangman') return 'That game is coming soon.';
  const setter = player;
  room.game = createHangman(setter, room.players.find(p => p.id !== setter)!.id, format);
  void player;
  return null;
}
export function setHangman(room: Room, player: string, word: string, hint: string) { return room.game ? setWord(room.game, player, word, hint) : 'Start a game first.'; }
export function makeGuess(room: Room, player: string, letter: string) {
  const game = room.game; if (!game) return 'Start a game first.';
  const before = game.matchScore[game.setter] + game.matchScore[game.guesser];
  const error = guess(game, player, letter);
  if (!error && before !== game.matchScore[game.setter] + game.matchScore[game.guesser]) room.scoreboard.hangman[game.roundWinner!] = (room.scoreboard.hangman[game.roundWinner!] ?? 0) + 1;
  return error;
}
export function reaction(room: Room, player: string, emoji: string) { if (room.game?.phase === 'playing' && ['😂','😬','😭','🎉'].includes(emoji)) room.game.lastReaction = { player, emoji, at: Date.now() }; }
export function nextHangman(room: Room, player: string) {
  const g = room.game; if (!g || (g.phase !== 'roundOver' && g.phase !== 'matchOver')) return 'This round is still in progress.';
  if (player !== g.guesser && player !== g.setter) return 'You are not in this game.';
  if (room.players.some(p => !p.online)) return 'Wait until your person is back to play again.';
  if (g.phase === 'matchOver') { room.game = createHangman(g.guesser, g.setter, g.format); return null; }
  room.game = createHangman(g.guesser, g.setter, g.format, g.round + 1, g.matchScore); return null;
}
export function backToLobby(room: Room) { room.game = null; }
