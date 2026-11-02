import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { enterRoom, lobbyView } from './rooms.js';

test('valid timezone and manifest doodle are relayed in presence views', () => {
  const first = randomUUID();
  const second = randomUUID();
  const passcode = `scene-${randomUUID()}`;
  const room = enterRoom(passcode, 'Me', first, 'socket-one', { timezone: 'Asia/Kolkata', doodleId: 'sunny' }).room!;
  enterRoom(passcode, 'Them', second, 'socket-two');
  assert.deepEqual(lobbyView(room, second).players[0], { id: first, name: 'Me', online: true, timezone: 'Asia/Kolkata', doodleId: 'sunny' });
});

test('invalid timezone and unlisted doodle values are silently dropped', () => {
  const room = enterRoom(`scene-${randomUUID()}`, 'Me', randomUUID(), 'socket-one', { timezone: 'Definitely/Not-A-Zone', doodleId: 'not-in-the-manifest' }).room!;
  const player = lobbyView(room, room.players[0].id).players[0];
  assert.equal(player.timezone, undefined);
  assert.equal(player.doodleId, undefined);
});

test('turning off sky sharing clears a previously shared timezone', () => {
  const token = randomUUID();
  const passcode = `scene-${randomUUID()}`;
  const first = enterRoom(passcode, 'Me', token, 'socket-one', { timezone: 'Europe/London', shareSky: true }).room!;
  enterRoom(passcode, 'Me', token, 'socket-two', { shareSky: false });
  assert.equal(lobbyView(first, token).players[0].timezone, undefined);
});
