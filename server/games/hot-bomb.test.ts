import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceHotBomb, chooseHotBombFuse, createHotBombGame, HOT_BOMB_CONFIG, hotBombAction, hotBombView, setHotBombPaused } from './hot-bomb.js';

function readyGame(format: 'quick' | 'bestOf3' | 'bestOf5' = 'bestOf3') {
  const game = createHotBombGame('a', 'b', format, 1, {}, 1_000);
  advanceHotBomb(game, game.countdownEndsAt);
  game.holder = 'a';
  game.gripUntil.a = 0;
  game.fuseEndsAt = 25_000;
  return game;
}

test('public view omits fuse timing and masks a feint as a pass for its first half', () => {
  const pass = readyGame();
  const feint = readyGame();
  assert.equal(hotBombAction(pass, 'a', 'pass', 5_000), null);
  assert.equal(hotBombAction(feint, 'a', 'feint', 5_000), null);
  const passView = hotBombView(pass, 'b', 5_100);
  const feintView = hotBombView(feint, 'b', 5_100);
  assert.deepEqual(passView, feintView);
  assert.equal('fuseEndsAt' in passView, false);
  assert.equal(JSON.stringify(passView).includes('fuseEndsAt'), false);
  assert.equal('fuseLengthMs' in passView, false);
  assert.equal('at' in (passView.lastEvent ?? {}), false);
  assert.equal('remainingMs' in passView, false);
});

test('countdown starts a secret fuse with the starter locked for 900ms', () => {
  const game = createHotBombGame('a', 'b', 'bestOf3', 1, {}, 1_000);
  const goAt = game.countdownEndsAt;
  assert.equal(game.phase, 'countdown');
  assert.equal(advanceHotBomb(game, goAt - 1), false);
  assert.equal(game.phase, 'countdown');
  advanceHotBomb(game, goAt);
  assert.equal(game.phase, 'playing');
  const actualLength = game.fuseEndsAt - goAt;
  assert.ok(HOT_BOMB_CONFIG.fuseBands.some(band => actualLength >= band.minMs && actualLength <= band.maxMs));
  assert.equal(game.dodges[game.playerA], 3);
  assert.equal(game.dodges[game.playerB], 3);
  assert.equal(game.feints[game.playerA], 4);
  assert.equal(game.feints[game.playerB], 4);
  assert.equal(game.gripUntil[game.holder!], goAt + 900);
});

test('twenty fuse draws stay in-band, vary bands, avoid exact repeats, and roughly follow the weights', () => {
  const used: number[] = [];
  const bands: Array<'short' | 'medium' | 'long'> = [];
  const counts = { short: 0, medium: 0, long: 0 };
  for (let round = 0; round < 20; round++) {
    const fuse = chooseHotBombFuse(bands.at(-1), used);
    const config = HOT_BOMB_CONFIG.fuseBands.find(band => band.id === fuse.band)!;
    assert.ok(fuse.lengthMs >= config.minMs && fuse.lengthMs <= config.maxMs);
    assert.notEqual(fuse.band, bands.at(-1));
    assert.equal(used.includes(fuse.lengthMs), false);
    used.push(fuse.lengthMs);
    bands.push(fuse.band);
    counts[fuse.band]++;
  }
  assert.ok(counts.short >= 1 && counts.short <= 8, `short fuse count: ${counts.short}`);
  assert.ok(counts.medium >= 2 && counts.medium <= 12, `medium fuse count: ${counts.medium}`);
  assert.ok(counts.long >= 6 && counts.long <= 16, `long fuse count: ${counts.long}`);
});

test('fuse length stays private until the boom result', () => {
  const game = createHotBombGame('a', 'b', 'quick', 1, {}, 1_000);
  advanceHotBomb(game, game.countdownEndsAt);
  const secretLength = game.fuseLengthMs!;
  const live = hotBombView(game, 'a', game.countdownEndsAt + 1);
  assert.equal('fuseLengthMs' in live, false);
  assert.equal(JSON.stringify(live).includes(String(secretLength)), false);
  advanceHotBomb(game, game.fuseEndsAt);
  const result = hotBombView(game, 'a', game.fuseEndsAt);
  assert.equal(result.fuseLengthMs, secretLength);
  assert.equal(result.lastEvent?.type, 'boom');
  assert.equal('at' in (result.lastEvent ?? {}), false);
});

test('pass and feint actions enforce holder, grip, flight and token rules', () => {
  const game = readyGame();
  game.gripUntil.a = 5_200;
  assert.match(hotBombAction(game, 'a', 'pass', 5_100) ?? '', /gripping/i);
  assert.equal(game.flight, undefined);
  game.gripUntil.a = 0;
  assert.equal(hotBombAction(game, 'a', 'pass', 5_300), null);
  assert.match(hotBombAction(game, 'a', 'feint', 5_301) ?? '', /holding/i);
  assert.equal(game.feints.a, 4);
});

test('dodging a pass bounces it and stuns the passer; a feint consumes a dodge without changing course', () => {
  const pass = readyGame();
  hotBombAction(pass, 'a', 'pass', 5_000);
  assert.equal(hotBombAction(pass, 'b', 'dodge', 5_100), null);
  assert.equal(pass.dodges.b, 2);
  assert.equal(pass.flight?.kind, 'bounce');
  assert.equal(pass.flight?.from, 'b');
  assert.equal(pass.flight?.to, 'a');
  assert.equal(pass.gripUntil.a, 6_200);
  hotBombAction(pass, 'a', 'dodge', 5_150);
  assert.equal(pass.dodges.a, 3);

  const feint = readyGame();
  hotBombAction(feint, 'a', 'feint', 5_000);
  assert.equal(hotBombAction(feint, 'b', 'dodge', 5_100), null);
  assert.equal(feint.dodges.b, 2);
  assert.equal(feint.flight?.kind, 'feint');
  assert.equal(feint.flight?.from, 'a');
  assert.equal(feint.flight?.to, 'b');

  const idle = readyGame();
  assert.equal(hotBombAction(idle, 'a', 'dodge', 5_000), null);
  assert.equal(idle.dodges.a, 3);
});

test('a pass or feint in flight explodes against the correct player', () => {
  const pass = readyGame('quick');
  hotBombAction(pass, 'a', 'pass', 5_000);
  pass.fuseEndsAt = 5_200;
  advanceHotBomb(pass, 5_200);
  assert.equal(pass.loser, 'b');
  assert.equal(pass.winner, 'a');
  assert.equal(pass.phase, 'matchOver');

  const feint = readyGame('quick');
  hotBombAction(feint, 'a', 'feint', 5_000);
  feint.fuseEndsAt = 5_200;
  advanceHotBomb(feint, 5_200);
  assert.equal(feint.loser, 'a');
  assert.equal(feint.winner, 'b');
  assert.equal(feint.boomMode, 'feint');
});

test('feint reverses at the halfway point, returns to its holder, and awards best-of wins correctly', () => {
  const game = readyGame('bestOf3');
  hotBombAction(game, 'a', 'feint', 5_000);
  advanceHotBomb(game, 5_225);
  assert.equal(game.flight?.reversed, true);
  assert.equal(hotBombView(game, 'b', 5_225).lastEvent?.type, 'feintReversed');
  assert.equal(hotBombView(game, 'b', 5_225).lastEvent?.player, 'b');
  advanceHotBomb(game, 5_450);
  assert.equal(game.holder, 'a');
  assert.equal(game.gripUntil.a, 5_700);

  const bestOfThree = readyGame('bestOf3');
  bestOfThree.matchScore.a = 1;
  bestOfThree.holder = 'b';
  bestOfThree.gripUntil.b = 0;
  bestOfThree.fuseEndsAt = 5_200;
  advanceHotBomb(bestOfThree, 5_200);
  assert.equal(bestOfThree.phase, 'matchOver');
  assert.equal(bestOfThree.winner, 'a');

  const bestOfFive = readyGame('bestOf5');
  bestOfFive.matchScore.a = 2;
  bestOfFive.holder = 'b';
  bestOfFive.gripUntil.b = 0;
  bestOfFive.fuseEndsAt = 5_200;
  advanceHotBomb(bestOfFive, 5_200);
  assert.equal(bestOfFive.phase, 'matchOver');
  assert.equal(bestOfFive.winner, 'a');
});

test('pause and reconnect preserve the hidden fuse and flight timeline', () => {
  const game = readyGame();
  hotBombAction(game, 'a', 'pass', 5_000);
  const fuseEnd = game.fuseEndsAt;
  const flightStart = game.flight!.startedAt;
  setHotBombPaused(game, true, 5_100);
  setHotBombPaused(game, false, 9_100);
  assert.equal(game.fuseEndsAt, fuseEnd + 4_000);
  assert.equal(game.flight!.startedAt, flightStart + 4_000);
  assert.equal(hotBombView(game, 'b', 9_200).paused, false);
});
