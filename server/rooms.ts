import { createHash, createHmac } from 'node:crypto';
import type { CupId, GameId, MatchFormat, RoomView, Scoreboard, CupsSettings } from '@arcade/shared';
import { createHangman, guess, setWord, viewFor, type HangmanGame } from './games/hangman.js';
import { createCups, getViewFor as cupsViewFor, lockSecret, reaction as cupsReaction, submitGuess, useHint, validSettings, type CupsGame } from './games/cups.js';
type Player = { id: string; name: string; online: boolean; socketId: string };
type Game = HangmanGame | CupsGame;
type Room = { key: string; players: Player[]; game: Game | null; scoreboard: Scoreboard };
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
  const gameView = room.game ? 'cups' in room.game ? cupsViewFor(room.game, self) : viewFor(room.game, self) : null;
  return { self, players, status: !other ? 'Waiting for your person…' : other.online ? `${other.name} is here 💗` : `${other.name} disconnected, waiting for them to come back`, game: gameView, scoreboard: room.scoreboard, ...(error ? { error } : {}) };
}
export function startGame(room: Room, player: string, game: GameId, format: MatchFormat, cups?: Omit<CupsSettings, 'format'>) {
  if (room.players.length !== 2 || room.players.some(p => !p.online)) return 'Wait until both of you are here.';
  if (room.game && room.game.phase !== 'matchOver') return 'A game is already in progress.';
  const other = room.players.find(p => p.id !== player)!.id;
  if (game === 'hangman') room.game = createHangman(player, other, format);
  else if (game === 'cups') {
    const settings = { cupCount: cups?.cupCount ?? 5, maxGuesses: cups?.maxGuesses ?? 8, hintEnabled: cups?.hintEnabled ?? false, format };
    if (!validSettings(settings)) return 'Choose 4–6 cups and 6–12 guesses.';
    room.game = createCups(player, other, format, settings);
  }
  else return 'That game is coming soon.';
  return null;
}
export function setHangman(room: Room, player: string, word: string, hint: string) {
  return room.game && 'word' in room.game ? setWord(room.game, player, word, hint) : 'Start a Hangman game first.';
}
export function makeGuess(room: Room, player: string, letter: string) {
  const game = room.game; if (!game || !('word' in game)) return 'Start a Hangman game first.';
  const before = game.matchScore[game.setter] + game.matchScore[game.guesser];
  const error = guess(game, player, letter);
  if (!error && before !== game.matchScore[game.setter] + game.matchScore[game.guesser]) room.scoreboard.hangman[game.roundWinner!] = (room.scoreboard.hangman[game.roundWinner!] ?? 0) + 1;
  return error;
}
export function reaction(room: Room, player: string, emoji: string) { if (room.game?.phase === 'playing' && ['😂','😬','😭','🎉'].includes(emoji)) room.game.lastReaction = { player, emoji, at: Date.now() }; }
export function cupsLock(room: Room, player: string, order: CupId[]) {
  return room.game && 'cups' in room.game ? lockSecret(room.game, player, order) : 'Start a Cup Ordering game first.';
}
export function cupsGuess(room: Room, player: string, order: CupId[]) {
  const game = room.game;
  if (!game || !('cups' in game)) return 'Start a Cup Ordering game first.';
  const before = game.phase;
  const error = submitGuess(game, player, order);
  if (!error && before === 'guessing' && game.phase !== 'guessing' && game.roundWinner) {
    room.scoreboard.cups[game.roundWinner] = (room.scoreboard.cups[game.roundWinner] ?? 0) + 1;
  }
  return error;
}
export function cupsHint(room: Room, player: string, slot: number) {
  return room.game && 'cups' in room.game ? useHint(room.game, player, slot) : 'Start a Cup Ordering game first.';
}
export function cupsReact(room: Room, player: string, emoji: string) {
  if (room.game && 'cups' in room.game) cupsReaction(room.game, player, emoji);
}
export function nextHangman(room: Room, player: string) {
  const g = room.game;
  if (!g || (g.phase !== 'roundOver' && g.phase !== 'matchOver')) return 'This round is still in progress.';
  if ('cups' in g) {
    if (player !== g.guesser && player !== g.arranger) return 'You are not in this game.';
  } else if (player !== g.guesser && player !== g.setter) return 'You are not in this game.';
  if (room.players.some(p => !p.online)) return 'Wait until your person is back to play again.';
  if ('cups' in g) {
    if (g.phase === 'matchOver') room.game = createCups(g.guesser, g.arranger, g.format, { cupCount: g.cups.length, maxGuesses: g.maxGuesses, hintEnabled: g.hintEnabled });
    else room.game = createCups(g.guesser, g.arranger, g.format, { cupCount: g.cups.length, maxGuesses: g.maxGuesses, hintEnabled: g.hintEnabled }, g.round + 1, g.matchScore);
    return null;
  }
  if (g.phase === 'matchOver') { room.game = createHangman(g.guesser, g.setter, g.format); return null; }
  room.game = createHangman(g.guesser, g.setter, g.format, g.round + 1, g.matchScore); return null;
}
export function backToLobby(room: Room) { room.game = null; }
