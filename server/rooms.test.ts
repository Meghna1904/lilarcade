import test from 'node:test';
import assert from 'node:assert/strict';
import type { GameId } from '@arcade/shared';
import { enterRoom, startGame } from './rooms.js';

test('all five games can be started from a connected two-player room', () => {
  const games: GameId[] = ['hangman', 'cups', 'poison', 'cloud', 'slapcount'];
  for (const game of games) {
    const first = enterRoom(`start-${game}`, 'Player A', `device-a-${game}`, `socket-a-${game}`);
    assert.ok(first.room);
    const second = enterRoom(`start-${game}`, 'Player B', `device-b-${game}`, `socket-b-${game}`);
    assert.equal(second.room, first.room);
    assert.equal(first.room.players.every(player => player.online), true);
    assert.equal(startGame(first.room, first.id!, game, 'quick'), null, `${game} should start`);
    assert.ok(first.room.game, `${game} should have game state`);
  }
});
