import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isReactionId, type CloudMove, type CloudSettings, type CupId, type GameId, type MatchFormat, type RoomView, type Scoreboard, type CupsSettings, type PoisonSettings, type SlapMove, type SlapSettings, type HotBombAction, type TwoHalvesMergeStyle, type TwoHalvesSeamStyle, type TwoHalvesSettings, type TwoHalvesSplit, type TwoHalvesTear, type TwoHalvesTearStyle, type TwoHalvesView, defaultTwoHalvesSettings } from '@arcade/shared';
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
type Game = HangmanGame | CupsGame | PoisonGame | CloudGame | SlapCountGame | FamilyFeudGame | RpsGame | HotBombGame | TwoHalvesGame;
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
const emptyScore = (): Scoreboard => ({ hangman: {}, cups: {}, poison: {}, cloud: {}, slapcount: {}, familyfeud: {}, rps: {}, hotbomb: {}, twohalves: {} });
export const hashPasscode = (passcode: string) => {
  const pepper = process.env.ARCADE_PASSCODE_PEPPER;
  return pepper
    ? createHmac('sha256', pepper).update(`room:${passcode}`).digest('hex')
    : createHash('sha256').update(passcode).digest('hex');
};
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
    else room.game.paused = paused;
  }
  return { room, id: player.id };
}
export function disconnect(socketId: string) {
  for (const room of rooms.values()) {
    const p = room.players.find(player => player.socketId === socketId);
    if (p) { p.online = false; if (room.game) { if ('hotBomb' in room.game) setHotBombPaused(room.game, true); else room.game.paused = true; } return room; }
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
export function lobbyView(room: Room, self: string, error?: string): RoomView {
  const players = room.players.map(({ id, name, online, timezone, doodleId }) => ({ id, name, online, ...(timezone ? { timezone } : {}), ...(doodleId ? { doodleId } : {}) }));
  const other = room.players.find(p => p.id !== self);
  const gameView = room.game ? 'twoHalves' in room.game ? { game: 'twohalves' as const, phase: room.game.phase, players: room.game.players, page: room.game.page, halves: room.game.phase === 'complete' || room.game.solo ? room.game.halves : room.game.halves[self] ? { [self]: room.game.halves[self] } : {}, completed: room.game.completed, paused: room.game.paused, settings: room.game.settings ?? defaultTwoHalvesSettings, ...(room.game.solo ? { solo: true, activeSide: room.game.activeSide } : {}), ...(room.game.tear ? { tear: room.game.tear } : {}) } : 'familyFeud' in room.game ? familyFeudView(room.game, self) : 'slapCount' in room.game ? slapViewFor(room.game, self) : 'cloudGame' in room.game ? cloudViewFor(room.game, self) : 'poisonA' in room.game ? poisonViewFor(room.game, self) : 'cups' in room.game ? cupsViewFor(room.game, self) : 'rps' in room.game ? rpsView(room.game, self) : 'hotBomb' in room.game ? hotBombView(room.game, self) : viewFor(room.game, self) : null;
  return { self, players, status: !other ? 'Waiting for your person…' : other.online ? `${other.name} is here 💗` : `${other.name} disconnected, waiting for them to come back`, game: gameView, scoreboard: room.scoreboard, sameSweetMoments: room.sameSweetMoments, ...(error ? { error } : {}) };
}
export function startGame(room: Room, player: string, game: GameId, format: MatchFormat, cups?: Omit<CupsSettings, 'format'>, poison?: Omit<PoisonSettings, 'format'>, cloud?: CloudSettings, slapCount?: SlapSettings, familyFeud?: { rounds: number }, twoHalvesSolo?: boolean) {
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
  else if (game === 'hotbomb') room.game = createHotBombGame(player, other, format);
  else if (game === 'twohalves') room.game = { twoHalves: true, phase: 'page', players: [player, solo ? `${player}:solo` : other], halves: {}, completed: {}, paused: false, settings: { ...defaultTwoHalvesSettings }, solo, activeSide: 0 };
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
export function reaction(room: Room, player: string, emoji: string) { if (room.game?.phase === 'playing' && isReactionId(emoji)) room.game.lastReaction = { player, emoji, at: Date.now() }; }

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
