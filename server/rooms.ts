import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isReactionId, type CloudMove, type CloudSettings, type CupId, type GameId, type MatchFormat, type RoomView, type Scoreboard, type CupsSettings, type PoisonSettings, type SlapMove, type SlapSettings, type HotBombAction, type TwoHalvesMergeStyle, type TwoHalvesSeamStyle, type TwoHalvesSettings, type TwoHalvesSplit, type TwoHalvesTear, type TwoHalvesTearStyle, type TwoHalvesView, type PicturePuzzleMode, type PicturePuzzleView, type PicturePuzzleBoard, type PicturePuzzlePoint, type PicturePuzzleChoice, type PicturePuzzleCropBox, type TicTacToeMark, type TicTacToeView, defaultTwoHalvesSettings } from '@arcade/shared';
import { createHangman, guess, setWord, viewFor, type HangmanGame } from './games/hangman.js';
import { createCups, getViewFor as cupsViewFor, lockSecret, reaction as cupsReaction, submitGuess, useHint, validSettings, type CupsGame } from './games/cups.js';
import { checkForcedLoss, createPoison, getViewFor as poisonViewFor, lockPick, pickTile, react as poisonReaction, resolveForcedLoss, tapTile, timeoutTurn, validPoisonSettings, type PoisonGame } from './games/poison.js';
import { createCloudGame, getViewFor as cloudViewFor, handleMove as handleCloudMove, type CloudGame } from './games/cloud.js';
import { completeResolve, createGame as createSlapCount, getViewFor as slapViewFor, handleMove as handleSlapMove, markCardVisible, resolveWindow, startPlaying, type SlapCountGame } from './games/slapcount.js';
import { createFamilyFeud, familyFeudView, nextFamilyFeud as advanceFamilyFeud, scoreFamilyFeud as editFamilyFeudScore, startFamilyFeud as beginFamilyFeud, submitFamilyFeud as submitFeudAnswer, timeoutFamilyFeud, type FamilyFeudGame } from './games/family-feud.js';
import { chooseRps, createRpsGame, nextRpsRound, rpsView, type RpsGame } from './games/rps.js';
import { advanceHotBomb, createHotBombGame, hotBombAction as applyHotBombAction, hotBombView, nextHotBombEventAt, nextHotBombRound, setHotBombPaused, type HotBombGame } from './games/hot-bomb.js';
type Player = { id: string; name: string; online: boolean; socketId: string; timezone?: string; doodleId?: string };
type TwoHalvesGame = { twoHalves: true; phase: TwoHalvesView['phase']; players: [string, string]; page?: string; halves: Record<string, string>; completed: Record<string, boolean>; paused: boolean; settings: TwoHalvesSettings; tear?: TwoHalvesTear; solo: boolean; activeSide: 0 | 1 };
type PicturePuzzleDrag = { piece: number; groupId: number; origin: Record<number, PicturePuzzlePoint> };
type TicTacToeGame = { ticTacToe: true; phase: TicTacToeView['phase']; players: [string, string]; boardCount: 1 | 3; boards: Array<{ cells: Array<TicTacToeMark | null>; moves: number[]; winner?: string }>; currentPlayer: string; marks: Record<string, TicTacToeMark>; wins: Record<string, number>; lastRemoved?: TicTacToeView['lastRemoved']; winner?: string; paused: boolean };
const picturePuzzleScatterGap = 36;
type PicturePuzzleGame = { picturePuzzle: true; phase: PicturePuzzleView['phase']; players: [string, string]; owner: string; image?: string; imageAspect: number; mode: PicturePuzzleMode; pieces: number; rows: number; cols: number; cropBox: PicturePuzzleCropBox; pieceChoices: PicturePuzzleChoice[]; seed: number; ready: Record<string, boolean>; paused: boolean; startedAt?: number; pausedTotalMs: number; pausedAt?: number; boards: Record<string, PicturePuzzleBoard>; drags: Record<string, PicturePuzzleDrag>; winner?: string; elapsedMs?: number };
type Game = HangmanGame | CupsGame | PoisonGame | CloudGame | SlapCountGame | FamilyFeudGame | RpsGame | TicTacToeGame | HotBombGame | TwoHalvesGame | PicturePuzzleGame;
type Room = { key: string; players: Player[]; game: Game | null; scoreboard: Scoreboard; sameSweetMoments: number };
const rooms = new Map<string, Room>();
function manifestDoodleIds() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(process.cwd(), 'client/public/doodles/manifest.json'), resolve(process.cwd(), '../client/public/doodles/manifest.json'), resolve(process.cwd(), 'dist/doodles/manifest.json'), resolve(process.cwd(), '../dist/doodles/manifest.json'), resolve(here, '../client/public/doodles/manifest.json'), resolve(here, '../../client/public/doodles/manifest.json'), resolve(here, '../../dist/doodles/manifest.json'), resolve(here, '../../../dist/doodles/manifest.json')];
  for (const file of candidates) {
    try { return new Set((JSON.parse(readFileSync(file, 'utf8')) as Array<{ id: string }>).map(item => item.id)); } catch { /* try the next monorepo-relative location */ }
  }
  return new Set<string>();
}
function validTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}
function validDoodleId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && manifestDoodleIds().has(value);
}
const emptyScore = (): Scoreboard => ({ hangman: {}, cups: {}, poison: {}, cloud: {}, slapcount: {}, familyfeud: {}, rps: {}, hotbomb: {}, twohalves: {}, picturepuzzle: {}, tictactoe: {} });
export const hashPasscode = (passcode: string) => {
  const pepper = process.env.ARCADE_PASSCODE_PEPPER;
  return pepper
    ? createHmac('sha256', pepper).update(`room:${passcode}`).digest('hex')
    : createHash('sha256').update(passcode).digest('hex');
};
function setPicturePuzzlePaused(game: PicturePuzzleGame, paused: boolean, now = Date.now()) {
  if (game.paused === paused) return;
  game.paused = paused;
  if (game.phase !== 'playing') return;
  if (paused) {
    game.pausedAt = now;
    game.drags = {};
    for (const board of Object.values(game.boards)) board.locks = {};
  }
  else {
    if (game.pausedAt) game.pausedTotalMs += Math.max(0, now - game.pausedAt);
    game.pausedAt = undefined;
  }
}
export function enterRoom(passcode: string, name: string, token: string, socketId: string, metadata: { timezone?: unknown; doodleId?: unknown; shareSky?: unknown } = {}): { room?: Room; error?: string; id?: string } {
  const key = hashPasscode(passcode); let room = rooms.get(key);
  if (!room) { room = { key, players: [], game: null, scoreboard: emptyScore(), sameSweetMoments: 0 }; rooms.set(key, room); }
  let player = room.players.find(p => p.id === token);
  if (player && player.name !== name) return { error: 'That device is already paired with a different name.' };
  if (!player) {
    if (room.players.length >= 2) return { error: 'This room is full.' };
    player = { id: token, name, online: true, socketId }; room.players.push(player);
  } else { player.online = true; player.socketId = socketId; }
  if (metadata.shareSky === false) delete player.timezone;
  else if (validTimezone(metadata.timezone)) player.timezone = metadata.timezone;
  if (validDoodleId(metadata.doodleId)) player.doodleId = metadata.doodleId;
  if (room.game) {
    const paused = room.players.some(p => !p.online);
    if ('hotBomb' in room.game) setHotBombPaused(room.game, paused);
    else if ('picturePuzzle' in room.game) setPicturePuzzlePaused(room.game, paused);
    else room.game.paused = paused;
  }
  return { room, id: player.id };
}
export function disconnect(socketId: string) {
  for (const room of rooms.values()) {
    const p = room.players.find(player => player.socketId === socketId);
    if (p) { p.online = false; if (room.game) { if ('hotBomb' in room.game) setHotBombPaused(room.game, true); else if ('picturePuzzle' in room.game) setPicturePuzzlePaused(room.game, true); else room.game.paused = true; } return room; }
  }
}
export function leaveRoom(room: Room, player: string) {
  const index = room.players.findIndex(candidate => candidate.id === player);
  if (index === -1) return null;
  room.players.splice(index, 1);
  room.game = null;
  if (!room.players.length) { rooms.delete(room.key); return null; }
  return room;
}
export function roomForSocket(socketId: string) { return [...rooms.values()].find(r => r.players.some(p => p.socketId === socketId)); }
export function playerFor(room: Room, socketId: string) { return room.players.find(p => p.socketId === socketId); }
export function updatePlayerDoodle(room: Room, playerId: string, doodleId: unknown): boolean {
  const player = room.players.find(candidate => candidate.id === playerId);
  if (!player || !validDoodleId(doodleId)) return false;
  player.doodleId = doodleId;
  return true;
}
function picturePuzzleViewFor(game: PicturePuzzleGame, self: string): PicturePuzzleView {
  const boardId = game.mode === 'race' ? self : 'shared';
  const board = game.boards[boardId] ?? { positions: {}, groups: [], locks: {}, zOrder: [] };
  return {
    game: 'picturepuzzle', phase: game.phase, players: game.players, owner: game.owner,
    image: game.image, imageAspect: game.imageAspect, mode: game.mode, pieces: game.pieces,
    rows: game.rows, cols: game.cols, cropBox: game.cropBox, pieceChoices: game.pieceChoices,
    seed: game.seed, ready: game.ready, paused: game.paused, startedAt: game.startedAt,
    pausedTotalMs: game.pausedTotalMs, pausedAt: game.pausedAt, board,
    winner: game.winner, elapsedMs: game.elapsedMs,
  };
}
export function lobbyView(room: Room, self: string, error?: string): RoomView {
  const players = room.players.map(({ id, name, online, timezone, doodleId }) => ({ id, name, online, ...(timezone ? { timezone } : {}), ...(doodleId ? { doodleId } : {}) }));
  const other = room.players.find(p => p.id !== self);
  const gameView = room.game ? 'picturePuzzle' in room.game ? picturePuzzleViewFor(room.game, self) : 'twoHalves' in room.game ? { game: 'twohalves' as const, phase: room.game.phase, players: room.game.players, page: room.game.page, halves: room.game.phase === 'complete' || room.game.solo ? room.game.halves : room.game.halves[self] ? { [self]: room.game.halves[self] } : {}, completed: room.game.completed, paused: room.game.paused, settings: room.game.settings ?? defaultTwoHalvesSettings, ...(room.game.solo ? { solo: true, activeSide: room.game.activeSide } : {}), ...(room.game.tear ? { tear: room.game.tear } : {}) } : 'familyFeud' in room.game ? familyFeudView(room.game, self) : 'slapCount' in room.game ? slapViewFor(room.game, self) : 'cloudGame' in room.game ? cloudViewFor(room.game, self) : 'poisonA' in room.game ? poisonViewFor(room.game, self) : 'cups' in room.game ? cupsViewFor(room.game, self) : 'rps' in room.game ? rpsView(room.game, self) : 'ticTacToe' in room.game ? { game: 'tictactoe' as const, phase: room.game.phase, players: room.game.players, boardCount: room.game.boardCount, boards: room.game.boards.map(({ cells, winner }) => ({ cells, winner })), currentPlayer: room.game.currentPlayer, marks: room.game.marks, wins: room.game.wins, lastRemoved: room.game.lastRemoved, winner: room.game.winner, paused: room.game.paused } : 'hotBomb' in room.game ? hotBombView(room.game, self) : viewFor(room.game, self) : null;
  return { self, players, status: !other ? 'Waiting for your person…' : other.online ? `${other.name} is here 💗` : `${other.name} disconnected, waiting for them to come back`, game: gameView, scoreboard: room.scoreboard, sameSweetMoments: room.sameSweetMoments, ...(error ? { error } : {}) };
}
export function startGame(room: Room, player: string, game: GameId, format: MatchFormat, cups?: Omit<CupsSettings, 'format'>, poison?: Omit<PoisonSettings, 'format'>, cloud?: CloudSettings, slapCount?: SlapSettings, familyFeud?: { rounds: number }, twoHalvesSolo?: boolean, tictactoe?: { boardCount: 1 | 3 }) {
  // Dev-only alone mode: one online player can open Two Halves and paint both halves.
  const solo = game === 'twohalves' && twoHalvesSolo === true && room.players.length === 1 && room.players[0].online && process.env.NODE_ENV !== 'production';
  if (!solo && (room.players.length !== 2 || room.players.some(p => !p.online))) return 'Wait until both of you are here.';
  if (room.game && room.game.phase !== 'matchOver') return 'A game is already in progress.';
  const other = room.players.find(p => p.id !== player)?.id ?? `${player}:solo`;
  if (game === 'hangman') room.game = createHangman(player, other, format);
  else if (game === 'cups') {
    const settings = { cupCount: cups?.cupCount ?? 5, maxGuesses: cups?.maxGuesses ?? 8, hintEnabled: cups?.hintEnabled ?? false, format };
    if (!validSettings(settings)) return 'Choose 4–6 cups and 6–12 guesses.';
    room.game = createCups(player, other, format, settings);
  }
  else if (game === 'poison') {
    const settings = { gridSize: poison?.gridSize ?? 4, timerEnabled: poison?.timerEnabled ?? false, confirmMode: poison?.confirmMode ?? true, warmCold: poison?.warmCold ?? false, tieMode: poison?.tieMode ?? 'replay' };
    if (!validPoisonSettings(settings)) return 'Choose a valid Poison Challenge setup.';
    room.game = createPoison(player, other, format, settings);
  }
  else if (game === 'cloud') {
    if (format !== 'quick' && format !== 'bestOf3') return 'Cloud Race supports Quick and Best of 3.';
    const settings: CloudSettings = {
      targetBoxes: cloud?.targetBoxes ?? 100,
      catchBonus: cloud?.catchBonus ?? 1,
      layoutMode: cloud?.layoutMode ?? 'hunt',
      huntTimeoutSeconds: cloud?.huntTimeoutSeconds ?? 45,
    };
    if (!validCloudSettings(settings)) return 'Choose valid Cloud Race settings.';
    room.game = createCloudGame(player, other, player, format, settings);
  }
  else if (game === 'slapcount') {
    if (format !== 'quick' && format !== 'bestOf3') return 'Slap Count supports Quick and Best of 3.';
    const settings: SlapSettings = { startingCards: slapCount?.startingCards ?? 20, pace: slapCount?.pace ?? 'manual', callMode: slapCount?.callMode ?? false };
    if (!validSlapSettings(settings)) return 'Choose valid Slap Count settings.';
    room.game = createSlapCount(player, other, player, format, settings);
  }
  else if (game === 'familyfeud') {
    const rounds = familyFeud?.rounds ?? 10;
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > 30) return 'Choose between 1 and 30 rounds.';
    room.game = createFamilyFeud(player, other, rounds);
  }
  else if (game === 'rps') {
    if (format !== 'bestOf5') return 'Rock Paper Scissors is a best of 5 tournament.';
    room.game = createRpsGame(player, other);
  }
  else if (game === 'tictactoe') {
    const boardCount = tictactoe?.boardCount ?? 1;
    if (boardCount !== 1 && boardCount !== 3) return 'Choose one board or three boards.';
    room.game = { ticTacToe: true, phase: 'playing', players: [player, other], boardCount, boards: Array.from({ length: boardCount }, () => ({ cells: Array<TicTacToeMark | null>(9).fill(null), moves: [] })), currentPlayer: player, marks: { [player]: 'X', [other]: 'O' }, wins: { [player]: 0, [other]: 0 }, paused: false };
  }
  else if (game === 'hotbomb') room.game = createHotBombGame(player, other, format);
  else if (game === 'twohalves') room.game = { twoHalves: true, phase: 'page', players: [player, solo ? `${player}:solo` : other], halves: {}, completed: {}, paused: false, settings: { ...defaultTwoHalvesSettings }, solo, activeSide: 0 };
  else if (game === 'picturepuzzle') room.game = { picturePuzzle: true, phase: 'setup', players: [player, other], owner: player, mode: 'together', pieces: 100, rows: 10, cols: 10, cropBox: { x: 0, y: 0, width: 1, height: 1 }, pieceChoices: [], imageAspect: 1, seed: Math.floor(Math.random() * 0x1_0000_0000), ready: { [player]: false, [other]: false }, paused: false, pausedTotalMs: 0, boards: {}, drags: {} };
  else return 'That game is coming soon.';
  return null;
}

export function twoHalvesPage(room: Room, player: string, page: unknown) {
  const game = room.game;
  if (!game || !('twoHalves' in game)) return 'Start Two Halves first.';
  if (game.phase !== 'page' || !game.players.includes(player)) return 'The coloring session has already started.';
  if (typeof page !== 'string' || page.length > 330_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(page)) return 'Choose an image smaller than 240 KB after resizing.';
  game.page = page; game.phase = 'coloring'; return null;
}
function twoHalvesSeat(game: TwoHalvesGame, player: string, side?: unknown): 0 | 1 {
  if (game.solo) return side === 1 ? 1 : 0;
  return game.players[0] === player ? 0 : 1;
}
export function twoHalvesPaint(room: Room, player: string, image: unknown, side?: unknown) {
  const game = room.game;
  if (!game || !('twoHalves' in game)) return 'Start Two Halves first.';
  const seat = twoHalvesSeat(game, player, side);
  if (game.solo && seat !== game.activeSide) return 'Open that half first.';
  const seatId = game.players[seat];
  if (game.phase !== 'coloring' || !game.page || !game.players.includes(player) || game.completed[seatId]) return 'Your half is locked.';
  if (typeof image !== 'string' || image.length > 250_000 || !/^data:image\/(png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return 'Your painted half is too large. Try a smaller brush stroke.';
  game.halves[seatId] = image; return null;
}
export function twoHalvesComplete(room: Room, player: string, side?: unknown) {
  const game = room.game;
  if (!game || !('twoHalves' in game)) return 'Start Two Halves first.';
  if (game.phase !== 'coloring' || !game.page || !game.players.includes(player)) return 'Choose a page first.';
  const seat = twoHalvesSeat(game, player, side);
  if (game.solo && seat !== game.activeSide) return 'Open that half first.';
  game.completed[game.players[seat]] = true;
  if (game.players.every(id => game.completed[id])) { game.phase = 'complete'; game.activeSide = 0; }
  return null;
}
export function twoHalvesSide(room: Room, player: string, side: unknown) {
  const game = room.game;
  if (!game || !('twoHalves' in game)) return 'Start Two Halves first.';
  if (!game.solo) return 'Only a solo preview can switch halves.';
  if (game.phase !== 'coloring' || !game.page || !game.players.includes(player)) return 'Choose a page first.';
  if (side !== 0 && side !== 1) return 'Choose a half.';
  if (game.completed[game.players[side]]) return 'That half is already finished.';
  game.activeSide = side;
  return null;
}
export function twoHalvesBack(room: Room) { if (!room.game || !('twoHalves' in room.game)) return 'Start Two Halves first.'; room.game = null; return null; }

export function picturePuzzleSetup(room: Room, player: string, payload: unknown) {
  const game = room.game;
  if (!game || !('picturePuzzle' in game)) return 'Start Picture Puzzle first.';
  if (game.phase !== 'setup' || game.owner !== player) return 'Only the uploader can change the puzzle setup.';
  if (!payload || typeof payload !== 'object') return 'Choose a picture and puzzle settings.';
  const update = payload as { image?: unknown; mode?: unknown; pieces?: unknown; rows?: unknown; cols?: unknown; imageAspect?: unknown; cropBox?: unknown; pieceChoices?: unknown };
  if (typeof update.image !== 'string' || update.image.length > 330_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(update.image)) return 'Choose a picture smaller than 240 KB after resizing.';
  if (update.mode !== 'together' && update.mode !== 'race') return 'Choose Solve Together or Race.';
  if (!Number.isInteger(update.rows) || !Number.isInteger(update.cols) || (update.rows as number) < 2 || (update.cols as number) < 2 || (update.rows as number) > 40 || (update.cols as number) > 40 || (update.rows as number) * (update.cols as number) < 8 || (update.rows as number) * (update.cols as number) > 200 || update.pieces !== (update.rows as number) * (update.cols as number)) return 'Choose one of the available piece counts.';
  if (typeof update.imageAspect !== 'number' || !Number.isFinite(update.imageAspect) || Math.abs(update.imageAspect - (update.cols as number) / (update.rows as number)) > 0.0001) return 'That puzzle grid does not match its cropped picture.';
  if (!update.cropBox || typeof update.cropBox !== 'object') return 'Choose a valid crop for this picture.';
  const cropBox = update.cropBox as Partial<PicturePuzzleCropBox>;
  if (![cropBox.x, cropBox.y, cropBox.width, cropBox.height].every(value => typeof value === 'number' && Number.isFinite(value)) || cropBox.x! < 0 || cropBox.y! < 0 || cropBox.width! <= 0 || cropBox.height! <= 0 || cropBox.x! + cropBox.width! > 1.0001 || cropBox.y! + cropBox.height! > 1.0001) return 'Choose a valid crop for this picture.';
  if (typeof update.pieceChoices !== 'object' || !Array.isArray(update.pieceChoices) || update.pieceChoices.length < 1 || update.pieceChoices.length > 193) return 'The picture does not have a valid set of puzzle sizes.';
  const choices = update.pieceChoices as PicturePuzzleChoice[];
  if (!choices.every((choice, index) => choice && Number.isInteger(choice.rows) && Number.isInteger(choice.cols) && choice.rows >= 2 && choice.cols >= 2 && choice.rows <= 40 && choice.cols <= 40 && choice.count === choice.rows * choice.cols && choice.count >= 8 && choice.count <= 200 && (index === 0 || choice.count > choices[index - 1].count) && Number.isFinite(choice.crop) && choice.crop >= 0 && choice.crop <= 0.16 && (choice.cropAxis === 'width' || choice.cropAxis === 'height') && choice.cropBox && [choice.cropBox.x, choice.cropBox.y, choice.cropBox.width, choice.cropBox.height].every(value => Number.isFinite(value) && value >= 0 && value <= 1) && choice.cropBox.width > 0 && choice.cropBox.height > 0 && choice.cropBox.x + choice.cropBox.width <= 1.0001 && choice.cropBox.y + choice.cropBox.height <= 1.0001)) return 'The picture has invalid puzzle choices.';
  if (!choices.some(choice => choice.count === update.pieces && choice.rows === update.rows && choice.cols === update.cols && Math.abs(choice.cropBox.x - cropBox.x!) < 0.0001 && Math.abs(choice.cropBox.y - cropBox.y!) < 0.0001 && Math.abs(choice.cropBox.width - cropBox.width!) < 0.0001 && Math.abs(choice.cropBox.height - cropBox.height!) < 0.0001)) return 'Select an available puzzle size and crop.';
  game.image = update.image;
  game.mode = update.mode;
  game.pieces = update.pieces as number;
  game.imageAspect = update.imageAspect;
  game.rows = update.rows as number;
  game.cols = update.cols as number;
  game.cropBox = { x: cropBox.x!, y: cropBox.y!, width: cropBox.width!, height: cropBox.height! };
  game.pieceChoices = choices;
  game.ready = Object.fromEntries(game.players.map(id => [id, false]));
  game.boards = {};
  game.drags = {};
  return null;
}

function puzzleMetrics(game: PicturePuzzleGame) {
  const columns = game.cols;
  const rows = game.rows;
  const width = 1000, height = width / game.imageAspect;
  return { columns, rows, width, height, cellWidth: width / columns, cellHeight: height / rows };
}

function puzzleRect(game: PicturePuzzleGame, id: number) {
  const grid = puzzleMetrics(game);
  const row = Math.floor(id / grid.columns), col = id % grid.columns;
  return { row, col, x: col * grid.cellWidth, y: row * grid.cellHeight, width: grid.cellWidth, height: grid.cellHeight };
}

function createPicturePuzzleBoard(game: PicturePuzzleGame): PicturePuzzleBoard {
  const { cellWidth, cellHeight } = puzzleMetrics(game);
  let randomSeed = game.seed >>> 0;
  const random = () => {
    randomSeed += 0x6d2b79f5;
    let t = randomSeed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length: game.pieces }, (_, id) => id);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const positions: Record<number, PicturePuzzlePoint> = {};
  for (let index = 0; index < order.length; index++) {
    const id = order[index], sideIndex = Math.floor(index / 2), column = sideIndex % 4, row = Math.floor(sideIndex / 4);
    const jitterX = (random() - 0.5) * cellWidth * 0.12;
    const jitterY = (random() - 0.5) * cellHeight * 0.1;
    positions[id] = {
      x: index % 2 ? 1000 + picturePuzzleScatterGap + column * (cellWidth + picturePuzzleScatterGap) + jitterX : -(column + 1) * (cellWidth + picturePuzzleScatterGap) + jitterX,
      y: picturePuzzleScatterGap + row * (cellHeight + picturePuzzleScatterGap) + jitterY,
    };
  }
  return { positions, groups: order.map(id => [id]), locks: {}, zOrder: order };
}

export function picturePuzzleReady(room: Room, player: string, now = Date.now()) {
  const game = room.game;
  if (!game || !('picturePuzzle' in game)) return 'Start Picture Puzzle first.';
  if (game.phase !== 'setup' || !game.image) return 'Upload a picture before starting.';
  if (!game.players.includes(player)) return 'Come back into your room first.';
  if (game.ready[player]) return null;
  game.ready[player] = true;
  if (game.players.every(id => game.ready[id])) {
    game.boards = game.mode === 'together'
      ? { shared: createPicturePuzzleBoard(game) }
      : Object.fromEntries(game.players.map(id => [id, createPicturePuzzleBoard(game)]));
    game.drags = {};
    game.phase = 'playing';
    game.startedAt = now;
  }
  return null;
}

function picturePuzzleElapsed(game: PicturePuzzleGame, now: number) {
  return Math.max(0, now - (game.startedAt ?? now) - game.pausedTotalMs);
}

function puzzleBoardFor(game: PicturePuzzleGame, player: string) {
  return game.boards[game.mode === 'race' ? player : 'shared'];
}

function picturePuzzleDraggedBy(board: PicturePuzzleBoard, groupId: number) {
  return board.locks[String(groupId)];
}

function releasePicturePuzzleDrag(game: PicturePuzzleGame, player: string) {
  const drag = game.drags[player];
  const board = puzzleBoardFor(game, player);
  if (drag && board) delete board.locks[String(drag.groupId)];
  delete game.drags[player];
}

export function picturePuzzleGrab(room: Room, player: string, piece: unknown) {
  const game = room.game;
  if (!game || !('picturePuzzle' in game)) return 'Start Picture Puzzle first.';
  if (game.phase !== 'playing' || game.paused || !game.players.includes(player)) return 'The puzzle is not accepting moves right now.';
  if (!Number.isInteger(piece) || (piece as number) < 0 || (piece as number) >= game.pieces) return 'That puzzle piece is invalid.';
  const board = puzzleBoardFor(game, player);
  if (!board) return 'The puzzle board is still being prepared.';
  if (game.drags[player]) return 'Finish moving your current group first.';
  const pieceId = piece as number;
  const group = board.groups.find(members => members.includes(pieceId));
  if (!group) return 'That piece is no longer on the board.';
  const groupId = Math.min(...group);
  if (picturePuzzleDraggedBy(board, groupId)) return 'Your person is moving that group.';
  board.locks[String(groupId)] = player;
  const origin = Object.fromEntries(group.map(id => [id, { ...board.positions[id] }]));
  game.drags[player] = { piece: pieceId, groupId, origin };
  board.zOrder = [...board.zOrder.filter(id => !group.includes(id)), ...group];
  return null;
}

export function picturePuzzleMove(room: Room, player: string, piece: unknown, x: unknown, y: unknown) {
  const game = room.game;
  if (!game || !('picturePuzzle' in game) || game.phase !== 'playing' || game.paused) return 'The puzzle is not accepting moves right now.';
  if (!Number.isInteger(piece) || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x as number) > 100_000 || Math.abs(y as number) > 100_000) return 'That move is invalid.';
  const drag = game.drags[player], board = puzzleBoardFor(game, player);
  if (!drag || drag.piece !== piece || !board || picturePuzzleDraggedBy(board, drag.groupId) !== player) return 'Grab that group before moving it.';
  const start = drag.origin[drag.piece];
  if (!start) return 'That group is no longer on the board.';
  const dx = (x as number) - start.x, dy = (y as number) - start.y;
  for (const [id, origin] of Object.entries(drag.origin)) board.positions[Number(id)] = { x: origin.x + dx, y: origin.y + dy };
  return null;
}

function puzzleNeighbors(game: PicturePuzzleGame, piece: number) {
  const { columns, rows } = puzzleMetrics(game);
  const { row, col } = puzzleRect(game, piece);
  const neighbors: number[] = [];
  if (col > 0) neighbors.push(piece - 1);
  if (col < columns - 1 && piece + 1 < game.pieces) neighbors.push(piece + 1);
  if (row > 0) neighbors.push(piece - columns);
  if (row < rows - 1 && piece + columns < game.pieces) neighbors.push(piece + columns);
  return neighbors;
}

function mergeNearbyPuzzleGroups(game: PicturePuzzleGame, board: PicturePuzzleBoard, initialGroup: number[]) {
  let moving = [...initialGroup];
  const tolerance = puzzleMetrics(game).cellWidth * 0.18;
  let merged = true;
  while (merged) {
    merged = false;
    const membership = new Map<number, number[]>();
    for (const group of board.groups) for (const id of group) membership.set(id, group);
    for (const id of moving) {
      const source = board.positions[id], sourceRect = puzzleRect(game, id);
      for (const neighborId of puzzleNeighbors(game, id)) {
        const neighborGroup = membership.get(neighborId);
        if (!neighborGroup || neighborGroup.some(member => moving.includes(member))) continue;
        const target = board.positions[neighborId], targetRect = puzzleRect(game, neighborId);
        const errorX = target.x - source.x - (targetRect.x - sourceRect.x);
        const errorY = target.y - source.y - (targetRect.y - sourceRect.y);
        if (Math.hypot(errorX, errorY) > tolerance) continue;
        for (const member of moving) board.positions[member] = { x: board.positions[member].x + errorX, y: board.positions[member].y + errorY };
        const combined = [...new Set([...moving, ...neighborGroup])].sort((a, b) => a - b);
        board.groups = board.groups.filter(group => group !== neighborGroup && !group.some(member => moving.includes(member)));
        board.groups.push(combined);
        board.groups.sort((a, b) => a[0] - b[0]);
        moving = combined;
        merged = true;
        break;
      }
      if (merged) break;
    }
  }
  return moving;
}

export function picturePuzzleDrop(room: Room, player: string, piece: unknown, now = Date.now()) {
  const game = room.game;
  if (!game || !('picturePuzzle' in game)) return 'Start Picture Puzzle first.';
  if (game.phase !== 'playing' || !game.players.includes(player)) return 'The puzzle is not accepting moves right now.';
  const drag = game.drags[player], board = puzzleBoardFor(game, player);
  if (!drag || drag.piece !== piece || !board) return 'Grab a piece group before dropping it.';
  const group = board.groups.find(members => members.includes(drag.piece));
  releasePicturePuzzleDrag(game, player);
  if (!group) return 'That piece group is no longer on the board.';
  mergeNearbyPuzzleGroups(game, board, group);
  if (board.groups.length === 1) {
    game.phase = 'complete';
    game.elapsedMs = picturePuzzleElapsed(game, now);
    if (game.mode === 'race') game.winner = player;
  }
  return null;
}

export function picturePuzzleScatter(room: Room, player: string) {
  const game = room.game;
  if (!game || !('picturePuzzle' in game) || game.phase !== 'playing' || game.paused) return 'The puzzle is not accepting moves right now.';
  if (!game.players.includes(player)) return 'Come back into your room first.';
  const board = puzzleBoardFor(game, player);
  if (!board) return 'The puzzle board is still being prepared.';
  if (Object.keys(board.locks).length) return 'Wait until the group is released before re-scattering.';
  const { cellWidth, cellHeight } = puzzleMetrics(game);
  let seed = (game.seed ^ Date.now()) >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const order = [...board.groups];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  for (let index = 0; index < order.length; index++) {
    const group = order[index], root = group[0], rootRect = puzzleRect(game, root);
    const sideIndex = Math.floor(index / 2), column = sideIndex % 4, row = Math.floor(sideIndex / 4);
    const anchorX = (index % 2 ? 1000 + picturePuzzleScatterGap + column * (cellWidth + picturePuzzleScatterGap) : -(column + 1) * (cellWidth + picturePuzzleScatterGap)) + (random() - 0.5) * 8;
    const anchorY = picturePuzzleScatterGap + row * (cellHeight + picturePuzzleScatterGap) + (random() - 0.5) * 8;
    for (const id of group) {
      const rect = puzzleRect(game, id);
      board.positions[id] = { x: anchorX + rect.x - rootRect.x, y: anchorY + rect.y - rootRect.y };
    }
  }
  return null;
}

export function picturePuzzleReplay(room: Room, player: string) {
  const game = room.game;
  if (!game || !('picturePuzzle' in game)) return 'Start Picture Puzzle first.';
  if (game.phase !== 'complete' || !game.players.includes(player)) return 'Finish the current puzzle first.';
  game.phase = 'setup';
  game.ready = Object.fromEntries(game.players.map(id => [id, false]));
  game.boards = {};
  game.drags = {};
  game.startedAt = undefined;
  game.pausedTotalMs = 0;
  game.pausedAt = undefined;
  game.winner = undefined;
  game.elapsedMs = undefined;
  return null;
}

export function picturePuzzleBack(room: Room) { if (!room.game || !('picturePuzzle' in room.game)) return 'Start Picture Puzzle first.'; room.game = null; return null; }

const twoHalvesSplits: TwoHalvesSplit[] = ['vertical', 'horizontal'];
const twoHalvesTears: TwoHalvesTearStyle[] = ['rip', 'cut', 'none'];
const twoHalvesMerges: TwoHalvesMergeStyle[] = ['slide', 'snap', 'fold', 'skip'];
const twoHalvesSeams: TwoHalvesSeamStyle[] = ['none', 'gold', 'stitches', 'thread', 'zigzag'];
function validJag(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 80 && value.every(entry => typeof entry === 'number' && Number.isFinite(entry) && Math.abs(entry) <= 2);
}
export function twoHalvesSettings(room: Room, player: string, patch: unknown) {
  const game = room.game;
  if (!game || !('twoHalves' in game)) return 'Start Two Halves first.';
  if ((game.phase !== 'coloring' && game.phase !== 'complete') || !game.page || !game.players.includes(player)) return 'Choose a page first.';
  if (!patch || typeof patch !== 'object') return null;
  const update = patch as Partial<TwoHalvesSettings>;
  if (!game.settings) game.settings = { ...defaultTwoHalvesSettings };
  if (update.split !== undefined) {
    if (!twoHalvesSplits.includes(update.split)) return 'Choose a split direction.';
    if (update.split !== game.settings.split) {
      game.settings.split = update.split;
      game.tear = undefined;
      game.halves = {};
      game.completed = {};
    }
  }
  if (update.tear !== undefined && twoHalvesTears.includes(update.tear)) game.settings.tear = update.tear;
  if (update.merge !== undefined && twoHalvesMerges.includes(update.merge)) game.settings.merge = update.merge;
  if (update.seam !== undefined && twoHalvesSeams.includes(update.seam)) game.settings.seam = update.seam;
  if (typeof update.seamColor === 'string' && /^#[0-9a-f]{6}$/i.test(update.seamColor)) game.settings.seamColor = update.seamColor.toLowerCase();
  return null;
}
export function twoHalvesTear(room: Room, player: string, payload: unknown) {
  const game = room.game;
  if (!game || !('twoHalves' in game)) return 'Start Two Halves first.';
  if (game.phase !== 'coloring' || !game.page || !game.players.includes(player)) return 'Choose a page first.';
  if (game.tear) return null;
  if (!game.settings) game.settings = { ...defaultTwoHalvesSettings };
  const data = payload as { style?: unknown; jag?: unknown; jag2?: unknown };
  if (!validJag(data.jag)) return 'That tear could not be shared.';
  const style: TwoHalvesTearStyle = data.style === 'cut' || data.style === 'none' ? data.style : 'rip';
  game.tear = { style, jag: data.jag, by: player, startAt: Date.now() };
  if (validJag(data.jag2)) game.tear.jag2 = data.jag2;
  return null;
}

export function familyFeudStart(room: Room, player: string) { return room.game && 'familyFeud' in room.game ? beginFamilyFeud(room.game, player) : 'Start Family Feud first.'; }
function syncFamilyFeudWinner(room: Room, game: FamilyFeudGame) {
  if (game.phase !== 'matchOver') return;
  const [first, second] = game.players;
  const winner = game.scores[first] === game.scores[second] ? undefined : game.scores[first] > game.scores[second] ? first : second;
  if (game.recordedWinner === winner) return;
  if (game.recordedWinner) room.scoreboard.familyfeud[game.recordedWinner] = Math.max(0, (room.scoreboard.familyfeud[game.recordedWinner] ?? 0) - 1);
  if (winner) room.scoreboard.familyfeud[winner] = (room.scoreboard.familyfeud[winner] ?? 0) + 1;
  game.recordedWinner = winner;
}
export function familyFeudSubmit(room: Room, player: string, answer: string, now = Date.now()) {
  const game = room.game;
  if (!game || !('familyFeud' in game)) return 'Start Family Feud first.';
  const error = submitFeudAnswer(game, player, answer, now);
  syncFamilyFeudWinner(room, game);
  return error;
}
export function familyFeudTimeout(room: Room, now = Date.now()) { if (!room.game || !('familyFeud' in room.game)) return false; const timedOut = timeoutFamilyFeud(room.game, now); syncFamilyFeudWinner(room, room.game); return timedOut; }
export function familyFeudScore(room: Room, player: string, target: string, matchIndex: number | null, points: number) { if (!room.game || !('familyFeud' in room.game)) return 'Start Family Feud first.'; const error = editFamilyFeudScore(room.game, player, target, matchIndex, points); syncFamilyFeudWinner(room, room.game); return error; }
export function familyFeudNext(room: Room, player: string) { return room.game && 'familyFeud' in room.game ? advanceFamilyFeud(room.game, player) : 'Start Family Feud first.'; }

export function rpsChoose(room: Room, player: string, choice: unknown) {
  const game = room.game;
  if (!game || !('rps' in game)) return 'Start a Rock Paper Scissors tournament first.';
  const previousPhase = game.phase;
  const error = chooseRps(game, player, choice);
  if (!error && previousPhase !== 'matchOver' && game.phase === 'matchOver' && game.matchWinner) {
    room.scoreboard.rps[game.matchWinner] = (room.scoreboard.rps[game.matchWinner] ?? 0) + 1;
  }
  return error;
}

export function rpsNext(room: Room, player: string) {
  const game = room.game;
  if (!game || !('rps' in game) || (game.phase !== 'reveal' && game.phase !== 'matchOver')) return 'This round is still in progress.';
  if (player !== game.playerA && player !== game.playerB) return 'You are not in this game.';
  if (room.players.some(candidate => !candidate.online)) return 'Wait until your person is back to play again.';
  if (game.phase === 'matchOver') { room.game = createRpsGame(game.playerA, game.playerB); return null; }
  return nextRpsRound(game, player);
}

const ticTacToeLines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]] as const;
function ticTacToeBoardWinner(game: TicTacToeGame, board: TicTacToeGame['boards'][number]) {
  const line = ticTacToeLines.find(([a, b, c]) => board.cells[a] && board.cells[a] === board.cells[b] && board.cells[a] === board.cells[c]);
  return line ? game.players.find(player => game.marks[player] === board.cells[line[0]]) : undefined;
}
export function ticTacToeMove(room: Room, player: string, boardIndex: unknown, cellIndex: unknown, now = Date.now()) {
  const game = room.game;
  if (!game || !('ticTacToe' in game)) return 'Start Tic-Tac-Toe first.';
  if (game.phase !== 'playing' || game.paused) return 'The match is not accepting moves right now.';
  if (!game.players.includes(player)) return 'You are not in this match.';
  if (player !== game.currentPlayer) return 'Wait for your turn.';
  if (!Number.isInteger(boardIndex) || (boardIndex as number) < 0 || (boardIndex as number) >= game.boards.length) return 'Choose a board in this match.';
  if (!Number.isInteger(cellIndex) || (cellIndex as number) < 0 || (cellIndex as number) > 8) return 'Choose a square on the board.';
  const board = game.boards[boardIndex as number];
  if (board.winner) return 'That board already has a winner.';
  const cell = cellIndex as number;
  if (board.cells[cell]) return 'That square is already taken.';
  game.lastRemoved = undefined;
  board.cells[cell] = game.marks[player];
  board.moves.push(cell);
  board.winner = ticTacToeBoardWinner(game, board);
  if (board.winner) {
    game.wins[board.winner] = (game.wins[board.winner] ?? 0) + 1;
    if (game.boardCount === 1 || game.wins[board.winner] >= 2) {
      game.phase = 'complete';
      game.winner = board.winner;
      room.scoreboard.tictactoe[board.winner] = (room.scoreboard.tictactoe[board.winner] ?? 0) + 1;
    }
  } else if (board.moves.length === 9) {
    const oldestCell = board.moves.shift()!;
    const mark = board.cells[oldestCell]!;
    board.cells[oldestCell] = null;
    game.lastRemoved = { board: boardIndex as number, cell: oldestCell, mark, at: now };
  }
  if (game.phase === 'playing') game.currentPlayer = game.players.find(id => id !== player)!;
  return null;
}
export function ticTacToeReplay(room: Room, player: string) {
  const game = room.game;
  if (!game || !('ticTacToe' in game)) return 'Start Tic-Tac-Toe first.';
  if (game.phase !== 'complete' || !game.players.includes(player)) return 'Finish the match first.';
  if (room.players.some(candidate => !candidate.online)) return 'Wait until your person is back to play again.';
  const starter = game.players.find(id => id !== game.players[0])!;
  room.game = { ticTacToe: true, phase: 'playing', players: game.players, boardCount: game.boardCount, boards: Array.from({ length: game.boardCount }, () => ({ cells: Array<TicTacToeMark | null>(9).fill(null), moves: [] })), currentPlayer: starter, marks: { [starter]: 'X', [game.players.find(id => id !== starter)!]: 'O' }, wins: {}, paused: false };
  return null;
}

function syncHotBombWinner(room: Room, game: HotBombGame, previousPhase: HotBombGame['phase']) {
  if (previousPhase !== 'matchOver' && game.phase === 'matchOver' && game.winner) {
    room.scoreboard.hotbomb[game.winner] = (room.scoreboard.hotbomb[game.winner] ?? 0) + 1;
  }
}

export function hotBombAction(room: Room, player: string, action: HotBombAction) {
  const game = room.game;
  if (!game || !('hotBomb' in game)) return 'Start a Hot Bomb match first.';
  const previousPhase = game.phase;
  const error = applyHotBombAction(game, player, action);
  syncHotBombWinner(room, game, previousPhase);
  return error;
}

export function advanceHotBombRoom(room: Room, now = Date.now()) {
  const game = room.game;
  if (!game || !('hotBomb' in game)) return false;
  const previousPhase = game.phase;
  const changed = advanceHotBomb(game, now);
  syncHotBombWinner(room, game, previousPhase);
  return changed;
}

export function hotBombTimerAt(room: Room) {
  const game = room.game;
  return game && 'hotBomb' in game ? nextHotBombEventAt(game) : undefined;
}

export function hotBombNext(room: Room, player: string) {
  const game = room.game;
  if (!game || !('hotBomb' in game) || (game.phase !== 'roundOver' && game.phase !== 'matchOver')) return 'The bomb is still live.';
  if (player !== game.playerA && player !== game.playerB) return 'You are not in this game.';
  if (room.players.some(candidate => !candidate.online)) return 'Wait until your person is back to play again.';
  if (game.phase === 'matchOver') { room.game = createHotBombGame(game.playerA, game.playerB, game.format); return null; }
  return nextHotBombRound(game, player);
}

export function validSlapSettings(settings: SlapSettings) {
  return Number.isInteger(settings.startingCards) && settings.startingCards >= 10 && settings.startingCards <= 20 &&
    (settings.pace === 'manual' || (typeof settings.pace === 'number' && [800,1000,1200].includes(settings.pace))) && typeof settings.callMode === 'boolean';
}

function recordSlapRoundWin(room: Room, game: SlapCountGame, priorPhase: SlapCountGame['phase']) {
  if ((game.phase === 'roundOver' || game.phase === 'matchOver') && priorPhase !== 'roundOver' && priorPhase !== 'matchOver' && game.roundWinner) {
    room.scoreboard.slapcount[game.roundWinner] = (room.scoreboard.slapcount[game.roundWinner] ?? 0) + 1;
  }
}

export function slapMove(room: Room, player: string, move: SlapMove, now = Date.now()) {
  const game = room.game;
  if (!game || !('slapCount' in game)) return { changed: false, error: 'Start a Slap Count game first.' };
  const priorPhase = game.phase;
  const result = handleSlapMove(game, player, move, now);
  if (!result.error) recordSlapRoundWin(room, game, priorPhase);
  return result;
}

export function slapResolveWindow(room: Room, now = Date.now()) {
  const game = room.game;
  if (!game || !('slapCount' in game)) return { changed: false };
  const prior = game.phase;
  const result = resolveWindow(game, now);
  recordSlapRoundWin(room, game, prior);
  return result;
}

export function slapStartPlaying(room: Room, now = Date.now()) {
  const game = room.game;
  if (!game || !('slapCount' in game)) return false;
  const changed = startPlaying(game, now);
  return changed;
}

export function slapCompleteResolve(room: Room, now = Date.now()) {
  const game = room.game;
  if (!game || !('slapCount' in game)) return false;
  const prior = game.phase;
  const changed = completeResolve(game, now);
  if (changed && game.phase === 'roundOver' && prior !== 'roundOver' && game.roundWinner) room.scoreboard.slapcount[game.roundWinner] = (room.scoreboard.slapcount[game.roundWinner] ?? 0) + 1;
  return changed;
}

export function markSlapCardVisible(room: Room, player: string) {
  if (room.game && 'slapCount' in room.game) markCardVisible(room.game, player);
}

export function nextSlapRound(room: Room, player: string) {
  const game = room.game;
  if (!game || !('slapCount' in game) || (game.phase !== 'roundOver' && game.phase !== 'matchOver')) return 'This Slap Count round is still in progress.';
  if (player !== game.playerA && player !== game.playerB) return 'You are not in this game.';
  if (room.players.some(p => !p.online)) return 'Wait until your person is back to play again.';
  const rematch = game.phase === 'matchOver';
  const prior = rematch ? game.matchStarter : game.starter;
  const starter = prior === game.playerA ? game.playerB : game.playerA;
  room.game = createSlapCount(game.playerA, game.playerB, starter, game.format, game.settings, rematch ? 1 : game.round + 1, rematch ? {} : game.matchScore, Date.now(), rematch ? starter : game.matchStarter, game.currentCardId);
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
export function reaction(room: Room, player: string, emoji: string) { if (room.game && 'lastReaction' in room.game && room.game.phase === 'playing' && isReactionId(emoji)) room.game.lastReaction = { player, emoji, at: Date.now() }; }

export function validCloudSettings(settings: CloudSettings): boolean {
  return [30, 50, 100].includes(settings.targetBoxes) && [0, 1, 2, 3].includes(settings.catchBonus) &&
    (settings.layoutMode === 'hunt' || settings.layoutMode === 'round') && [15, 30, 45, 60].includes(settings.huntTimeoutSeconds);
}

export function cloudMove(room: Room, player: string, move: CloudMove, now = Date.now()) {
  const game = room.game;
  if (!game || !('cloudGame' in game)) return { changed: false, error: 'Start a Cloud Race first.' };
  const previousPhase = game.phase;
  const result = handleCloudMove(game, player, move, now);
  if (!result.error && previousPhase !== 'matchOver' && game.phase === 'matchOver' && game.matchWinner) {
    room.scoreboard.cloud[game.matchWinner] = (room.scoreboard.cloud[game.matchWinner] ?? 0) + 1;
  }
  return result;
}

export function nextCloudRound(room: Room, player: string) {
  const game = room.game;
  if (!game || !('cloudGame' in game) || (game.phase !== 'roundOver' && game.phase !== 'matchOver')) return 'This Cloud Race is still in progress.';
  if (player !== game.playerA && player !== game.playerB) return 'You are not in this game.';
  if (room.players.some(p => !p.online)) return 'Wait until your person is back to play again.';
  const rematch = game.phase === 'matchOver';
  const priorStarter = rematch ? game.matchStarterCaller : game.starterCaller;
  const starter = priorStarter === game.playerA ? game.playerB : game.playerA;
  room.game = createCloudGame(game.playerA, game.playerB, starter, game.format, game.settings, rematch ? 1 : game.round + 1, rematch ? {} : game.matchScore, game.huntId + 1, Date.now(), rematch ? starter : game.matchStarterCaller);
  return null;
}
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
export function poisonPick(room: Room, player: string, tile: number) {
  return room.game && 'poisonA' in room.game ? pickTile(room.game, player, tile) : 'Start a Poison Challenge first.';
}
export function poisonLock(room: Room, player: string) {
  return room.game && 'poisonA' in room.game ? lockPick(room.game, player) : 'Start a Poison Challenge first.';
}
export function poisonTap(room: Room, player: string, tile: number, turnNumber: number) {
  const game = room.game;
  if (!game || !('poisonA' in game)) return 'Start a Poison Challenge first.';
  const before = game.matchScore[game.playerA] + game.matchScore[game.playerB];
  const wasPlaying = game.phase === 'playing';
  const error = tapTile(game, player, tile, turnNumber);
  const after = game.matchScore[game.playerA] + game.matchScore[game.playerB];
  if (!error && after > before && game.roundWinner) room.scoreboard.poison[game.roundWinner] = (room.scoreboard.poison[game.roundWinner] ?? 0) + 1;
  if (!error && wasPlaying && game.phase !== 'playing' && game.endReason === 'sweetTie') room.sameSweetMoments++;
  return error;
}
export function poisonReact(room: Room, player: string, emoji: string) {
  if (room.game && 'poisonA' in room.game) poisonReaction(room.game, player, emoji);
}
export function poisonTimeout(room: Room) {
  const game = room.game;
  if (!game || !('poisonA' in game) || game.phase !== 'playing') return null;
  const before = game.matchScore[game.playerA] + game.matchScore[game.playerB];
  const wasPlaying = game.phase === 'playing';
  const error = timeoutTurn(game);
  const after = game.matchScore[game.playerA] + game.matchScore[game.playerB];
  if (!error && after > before && game.roundWinner) room.scoreboard.poison[game.roundWinner] = (room.scoreboard.poison[game.roundWinner] ?? 0) + 1;
  if (!error && wasPlaying && game.phase !== 'playing' && game.endReason === 'sweetTie') room.sameSweetMoments++;
  return error;
}
export function poisonForcedLoss(room: Room) {
  const game = room.game;
  if (!game || !('poisonA' in game) || !checkForcedLoss(game)) return null;
  const error = resolveForcedLoss(game);
  if (!error && game.roundWinner) room.scoreboard.poison[game.roundWinner] = (room.scoreboard.poison[game.roundWinner] ?? 0) + 1;
  return error;
}
export function nextPoisonRound(room: Room, player: string) {
  const game = room.game;
  if (!game || !('poisonA' in game) || (game.phase !== 'roundOver' && game.phase !== 'matchOver')) return 'This round is still in progress.';
  if (player !== game.playerA && player !== game.playerB) return 'You are not in this game.';
  if (room.players.some(p => !p.online)) return 'Wait until your person is back to play again.';
  const nextStarter = game.playerA === game.starter ? game.playerB : game.playerA;
  const replaySweetTie = game.endReason === 'sweetTie' && game.settings.tieMode === 'replay';
  room.game = createPoison(game.playerA, game.playerB, game.format, game.settings, game.phase === 'matchOver' ? 1 : replaySweetTie ? game.round : game.round + 1, game.phase === 'matchOver' ? {} : game.matchScore, nextStarter);
  return null;
}
export function nextHangman(room: Room, player: string) {
  const g = room.game;
  if (!g || (g.phase !== 'roundOver' && g.phase !== 'matchOver')) return 'This round is still in progress.';
  if ('familyFeud' in g) return 'Family Feud rounds are advanced by the host.';
  if ('slapCount' in g) return nextSlapRound(room, player);
  if ('poisonA' in g) return nextPoisonRound(room, player);
  if ('cloudGame' in g) return nextCloudRound(room, player);
  if ('rps' in g) return 'Use the tournament controls to continue.';
  if ('hotBomb' in g) return 'Use the Hot Bomb controls to continue.';
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
