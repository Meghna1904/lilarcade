import test from 'node:test';
import assert from 'node:assert/strict';
import { enterRoom, lobbyView, nextPoisonRound, poisonLock, poisonPick, poisonTap, startGame } from '../rooms.js';
import {
  createPoison, pickTile, lockPick, tapTile, timeoutTurn,
  legalTiles, checkForcedLoss, resolveForcedLoss, getViewFor,
} from './poison.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a game already in playing phase with specified poison tiles. */
function playingGame(
  gridSize: 3 | 4 | 5 = 4,
  pA = 0,
  pB = 1,
  warmCold = false,
  timerEnabled = false,
) {
  const g = createPoison('A', 'B', 'quick', { gridSize, timerEnabled, confirmMode: true, warmCold, tieMode: 'replay' }, 1, {}, 'A');
  pickTile(g, 'A', pA); lockPick(g, 'A');
  pickTile(g, 'B', pB); lockPick(g, 'B');
  assert.equal(g.phase, 'playing', 'precondition: should be playing after different picks');
  return g;
}

/** Eat safe tiles in a round-robin pattern until only the two poison tiles remain. */
function eatAllSafe(g: ReturnType<typeof playingGame>, pA: number, pB: number) {
  const total = g.gridSize * g.gridSize;
  const safeTiles = Array.from({ length: total }, (_, i) => i).filter(i => i !== pA && i !== pB);
  for (const tile of safeTiles) {
    if (g.phase !== 'playing') break;
    tapTile(g, g.currentTurn, tile, g.turnNumber);
  }
}

// ─── 1. legalTiles ────────────────────────────────────────────────────────────

test('legalTiles excludes own poison and revealed tiles, includes opponent poison', () => {
  const g = playingGame(3, 0, 1); // A's poison=0, B's poison=1

  // All 9 minus tile 0 (own poison) = 8 for A
  assert.equal(legalTiles(g, 'A').length, 8);
  assert.ok(!legalTiles(g, 'A').includes(0), 'A cannot tap own poison');
  assert.ok(legalTiles(g, 'A').includes(1), 'A CAN tap opponent poison (legal, just fatal)');

  // All 9 minus tile 1 (own poison) = 8 for B
  assert.equal(legalTiles(g, 'B').length, 8);
  assert.ok(!legalTiles(g, 'B').includes(1), 'B cannot tap own poison');
  assert.ok(legalTiles(g, 'B').includes(0), 'B CAN tap opponent poison');

  // After A eats safe tile 2, B's legal tiles shrink by 1
  g.currentTurn = 'A';
  tapTile(g, 'A', 2, g.turnNumber);
  const legalB = legalTiles(g, 'B');
  assert.equal(legalB.length, 7);
  assert.ok(!legalB.includes(2), 'revealed tile excluded');
  assert.ok(!legalB.includes(1), 'B own poison excluded');

  // Returns [] outside playing phase
  g.phase = 'setup' as never;
  assert.deepEqual(legalTiles(g, 'A'), []);
});

// ─── 2. Safe tap ──────────────────────────────────────────────────────────────

test('safe tap adds tile to revealed, passes turn, does not end the game', () => {
  const g = playingGame(4, 0, 15);
  g.currentTurn = 'A';
  const tn = g.turnNumber;

  const err = tapTile(g, 'A', 2, tn);
  assert.equal(err, null);
  assert.equal(g.revealed.length, 1);
  assert.equal(g.revealed[0].index, 2);
  assert.equal(g.revealed[0].eatenBy, 'A');
  assert.equal(g.currentTurn, 'B');     // turn passed
  assert.equal(g.turnNumber, tn + 1);  // incremented
  assert.equal(g.phase, 'playing');
});

// ─── 3. Losing tap ────────────────────────────────────────────────────────────

test('losing tap immediately ends the round with correct loser and reason', () => {
  const g = playingGame(4, 0, 1);
  g.currentTurn = 'A';

  // A taps tile 1 (B's poison) → A loses
  const err = tapTile(g, 'A', 1, g.turnNumber);
  assert.equal(err, null);
  assert.equal(g.loser, 'A');
  assert.equal(g.roundWinner, 'B');
  assert.equal(g.endReason, 'tapped');
  assert.ok(g.phase === 'roundOver' || g.phase === 'matchOver');
  assert.equal(g.matchScore['B'], 1);
});

// ─── 4. Forced loss ───────────────────────────────────────────────────────────

test('forced loss resolves correctly when only the opponent poison remains', () => {
  // 3×3, A's poison=0, B's poison=1. Safe tiles: 2..8
  const g = playingGame(3, 0, 1);
  eatAllSafe(g, 0, 1);

  // Both safe tiles eaten → only tile 0 (A's poison) and tile 1 (B's poison) unrevealed.
  // Whoever's turn it is: their only legal tile is the opponent's poison.
  assert.ok(checkForcedLoss(g), 'forced loss condition should be detected');
  const loserBeforeResolve = g.currentTurn;

  const err = resolveForcedLoss(g);
  assert.equal(err, null);
  assert.equal(g.loser, loserBeforeResolve);
  assert.equal(g.endReason, 'forced');
  assert.ok(g.roundWinner !== undefined);
  assert.notEqual(g.roundWinner, g.loser);
  assert.ok(g.phase === 'roundOver' || g.phase === 'matchOver');
});

test('checkForcedLoss returns false when more than one legal tile remains', () => {
  const g = playingGame(4, 0, 15); // 14 safe tiles
  assert.equal(checkForcedLoss(g), false);
});

// ─── 5. Same-sweet picks stay private and lock normally ───────────────────────

test('matching picks lock successfully and expose the same setup/playing view as a different pick', () => {
  const options = { gridSize: 3 as const, timerEnabled: false, confirmMode: true, warmCold: false, tieMode: 'replay' as const };
  const matching = createPoison('A', 'B', 'quick', options, 1, {}, 'B');
  const different = createPoison('A', 'B', 'quick', options, 1, {}, 'B');
  for (const g of [matching, different]) { pickTile(g, 'A', 0); assert.equal(lockPick(g, 'A'), null); }
  pickTile(matching, 'B', 0);
  pickTile(different, 'B', 1);
  assert.deepEqual(getViewFor(matching, 'A'), getViewFor(different, 'A'));
  assert.equal(lockPick(matching, 'B'), null);
  assert.equal(lockPick(different, 'B'), null);
  assert.equal(matching.phase, 'playing');
  assert.equal(different.phase, 'playing');
  assert.deepEqual(getViewFor(matching, 'A'), getViewFor(different, 'A'));
  assert.deepEqual(getViewFor(matching, 'A').myPoison, [0]);
  assert.equal('opponentPoison' in getViewFor(matching, 'A'), false);
});
// ─── 6. Stale turnNumber rejection ───────────────────────────────────────────

test('stale turnNumber is rejected without modifying game state', () => {
  const g = playingGame(4, 0, 1);
  g.currentTurn = 'A';
  const tn = g.turnNumber;

  tapTile(g, 'A', 2, tn); // valid tap, advances turnNumber
  assert.equal(g.turnNumber, tn + 1);

  // Replay with old turn number
  const err = tapTile(g, 'A', 3, tn);
  assert.ok(err !== null, 'stale tap must be rejected');
  assert.equal(g.revealed.length, 1, 'only the first tile should be revealed');

  // Wrong turn number (future)
  const err2 = tapTile(g, 'B', 3, tn + 99);
  assert.ok(err2 !== null, 'future turn number must be rejected');
});

// ─── 7. timeoutTurn — uniform random from legalTiles (may hit opponent poison) ─

test('timeoutTurn chooses uniformly from legalTiles, including the opponent poison', () => {
  const hits = new Map<number, number>([[1, 0], [2, 0]]);
  for (let i = 0; i < 1000; i++) {
    const g = playingGame(4, 0, 1); // A's poison=0, B's poison=1
    g.currentTurn = 'A';
    // Reveal all safe tiles except tile 2, so legal for A = [1 (opponent poison), 2 (safe)]
    for (let t = 3; t < 16; t++) g.revealed.push({ index: t, eatenBy: 'B' });
    assert.deepEqual(legalTiles(g, 'A').sort((a, b) => a - b), [1, 2]);

    const err = timeoutTurn(g);
    assert.equal(err, null);
    const chosen = g.phase === 'playing' ? g.revealed[g.revealed.length - 1].index : 1;
    hits.set(chosen, (hits.get(chosen) ?? 0) + 1);
  }
  assert.ok(hits.get(1)! > 400 && hits.get(1)! < 600, `opponent poison should be selected about half the time (got ${hits.get(1)})`);
  assert.ok(hits.get(2)! > 400 && hits.get(2)! < 600, `safe tile should be selected about half the time (got ${hits.get(2)})`);
});

test('timeoutTurn never picks own poison or an already-revealed tile', () => {
  for (let i = 0; i < 100; i++) {
    const g = playingGame(4, 5, 10); // A's poison=5, B's poison=10
    g.currentTurn = 'A';
    // Reveal some tiles
    [0, 1, 2, 3].forEach(t => g.revealed.push({ index: t, eatenBy: 'B' }));

    const beforeRevealed = g.revealed.map(r => r.index);
    const beforePhase = g.phase;
    timeoutTurn(g);

    if (beforePhase === g.phase) {
      // Safe tap: the new tile must not be A's own poison (5) or revealed
      const newTile = g.revealed[g.revealed.length - 1].index;
      assert.notEqual(newTile, 5, 'must not pick own poison');
      assert.ok(!beforeRevealed.includes(newTile), 'must not pick already-revealed tile');
    }
  }
});

// ─── 8. Warm/cold correctness ─────────────────────────────────────────────────

test('warm/cold is correct for center, edge, corner, and non-adjacent tiles (4×4)', () => {
  // 4×4 layout (index → row,col):
  //  0  1  2  3      (row 0)
  //  4  5  6  7      (row 1)
  //  8  9 10 11      (row 2)
  // 12 13 14 15      (row 3)

  // A's poison = 5 (row1,col1), B's poison = 10 (row2,col2)
  const g = playingGame(4, 5, 10, true);
  g.currentTurn = 'A';

  // A eats tile 6 (row1,col2). Distance to B's poison 10 (row2,col2): dr=1,dc=0 → warm
  tapTile(g, 'A', 6, g.turnNumber);
  assert.equal(g.revealed[0].warm, true, 'tile 6 is adjacent to B poison 10 → warm');

  // B eats tile 3 (row0,col3). Distance to A's poison 5 (row1,col1): dr=1,dc=2 → cold
  tapTile(g, 'B', 3, g.turnNumber);
  assert.equal(g.revealed[1].warm, false, 'tile 3 is not adjacent to A poison 5 → cold');

  // A eats tile 9 (row2,col1). Distance to B's poison 10 (row2,col2): dr=0,dc=1 → warm
  tapTile(g, 'A', 9, g.turnNumber);
  assert.equal(g.revealed[2].warm, true, 'tile 9 is adjacent to B poison 10 → warm');

  // B eats tile 0 (row0,col0). Distance to A's poison 5 (row1,col1): dr=1,dc=1 → warm (diagonal)
  tapTile(g, 'B', 0, g.turnNumber);
  assert.equal(g.revealed[3].warm, true, 'tile 0 is diagonally adjacent to A poison 5 → warm');

  // A eats tile 15 (row3,col3). Distance to B's poison 10 (row2,col2): dr=1,dc=1 → warm
  tapTile(g, 'A', 15, g.turnNumber);
  assert.equal(g.revealed[4].warm, true, 'tile 15 diagonally adjacent to B poison 10 → warm');

  // B eats tile 12 (row3,col0). Distance to A's poison 5 (row1,col1): dr=2,dc=1 → cold
  tapTile(g, 'B', 12, g.turnNumber);
  assert.equal(g.revealed[5].warm, false, 'tile 12 not adjacent to A poison 5 → cold');

  // 3×3 edge case: corner tile
  // 3×3:  0 1 2 / 3 4 5 / 6 7 8
  // A poison=8 (row2,col2), B poison=0 (row0,col0)
  const g3 = playingGame(3, 8, 0, true);
  g3.currentTurn = 'A';
  // A eats tile 4 (row1,col1). Distance to B's poison 0 (row0,col0): dr=1,dc=1 → warm
  tapTile(g3, 'A', 4, g3.turnNumber);
  assert.equal(g3.revealed[0].warm, true, '3×3 center is adjacent to corner → warm');

  // B eats tile 6 (row2,col0). Distance to A's poison 8 (row2,col2): dr=0,dc=2 → cold
  tapTile(g3, 'B', 6, g3.turnNumber);
  assert.equal(g3.revealed[1].warm, false, '3×3 tile 6 not adjacent to A poison 8 → cold');
});

// ─── 9. getViewFor never reveals opponent poison before roundOver ──────────────

test('getViewFor never includes opponentPoison in setup or playing phase', () => {
  // Setup phase: A locked, B has not yet picked
  const gSetup = createPoison('A', 'B', 'quick', { gridSize: 4, timerEnabled: false, confirmMode: true, warmCold: false, tieMode: 'replay' }, 1, {}, 'A');
  pickTile(gSetup, 'A', 3);
  lockPick(gSetup, 'A');

  const bSetupView = getViewFor(gSetup, 'B');
  assert.ok(!('opponentPoison' in bSetupView), 'no opponentPoison in setup view');
  // B sees A has locked (boolean), but never which tile
  assert.equal(bSetupView.opponentLocked, true);
  assert.deepEqual(bSetupView.myPick, []); // B hasn't picked yet

  // Playing phase
  const g = playingGame(4, 0, 15);

  const viewA = getViewFor(g, 'A');
  assert.ok(!('opponentPoison' in viewA), 'no opponentPoison in A playing view');
  assert.deepEqual(viewA.myPoison, [0]);

  const viewB = getViewFor(g, 'B');
  assert.ok(!('opponentPoison' in viewB), 'no opponentPoison in B playing view');
  assert.deepEqual(viewB.myPoison, [15]);

  // After a safe tap — still no leak
  g.currentTurn = 'A';
  tapTile(g, 'A', 1, g.turnNumber);
  const viewA2 = getViewFor(g, 'A');
  assert.ok(!('opponentPoison' in viewA2));

  // After round ends both poisons should appear
  g.currentTurn = 'A';
  tapTile(g, 'A', 15, g.turnNumber); // A eats B's poison → A loses
  const endViewA = getViewFor(g, 'A');
  const endViewB = getViewFor(g, 'B');
  assert.ok('opponentPoison' in endViewA, 'opponentPoison shown at roundOver for A');
  assert.ok('opponentPoison' in endViewB, 'opponentPoison shown at roundOver for B');
  assert.deepEqual(endViewA.opponentPoison, [15]);
  assert.deepEqual(endViewB.opponentPoison, [0]);

  // Error paths must not leak hidden info
  const setupG = createPoison('A', 'B', 'quick', { gridSize: 4, timerEnabled: false, confirmMode: true, warmCold: false, tieMode: 'replay' }, 1, {}, 'A');
  const errMsg = lockPick(setupG, 'A'); // should fail: no pick yet
  assert.ok(errMsg !== null && !errMsg.toLowerCase().includes('poison'));
});

// ─── 10. Shared poison resolution ────────────────────────────────────────────

test('a fully matching round ends in a sweet tie after all other candies are eaten (3×3, 4×4, 5×5)', () => {
  for (const gridSize of [3, 4, 5] as const) {
    const shared = Math.floor((gridSize * gridSize) / 2);
    const g = createPoison('A', 'B', 'quick', { gridSize, timerEnabled: false, confirmMode: true, warmCold: false, tieMode: 'replay' }, 1, {}, 'A');
    pickTile(g, 'A', shared); assert.equal(lockPick(g, 'A'), null);
    pickTile(g, 'B', shared); assert.equal(lockPick(g, 'B'), null);
    assert.equal(g.phase, 'playing');
    assert.deepEqual(getViewFor(g, 'A').myPoison, [shared]);
    assert.equal('opponentPoison' in getViewFor(g, 'A'), false);
    let moves = 0;
    while (g.phase === 'playing') {
      const legal = legalTiles(g, g.currentTurn);
      assert.ok(legal.length > 0, 'legal sweets remain before the last safe taste');
      const tile = legal[0];
      assert.notEqual(tile, shared);
      assert.equal(tapTile(g, g.currentTurn, tile, g.turnNumber), null);
      moves++;
      if (g.phase === 'playing') assert.ok(legalTiles(g, g.currentTurn).length > 0);
    }
    assert.equal(moves, gridSize * gridSize - 1);
    assert.equal(g.endReason, 'sweetTie');
    assert.equal(g.loser, undefined);
    assert.equal(g.roundWinner, undefined);
    assert.deepEqual(g.poisonA, g.poisonB);
    assert.deepEqual(getViewFor(g, 'A').opponentPoison, [shared]);
    assert.equal('loser' in getViewFor(g, 'A'), false);
  }
});

test('timer auto-picks never choose the shared sweet and an empty legal set ends as a tie', () => {
  const g = playingGame(3, 4, 4, false, true);
  let safeMoves = 0;
  while (g.phase === 'playing') {
    const legal = legalTiles(g, g.currentTurn);
    assert.ok(!legal.includes(4), 'the shared poison is not legal to either player');
    if (legal.length === 0) {
      assert.equal(timeoutTurn(g), null);
      break;
    }
    const before = g.revealed.length;
    assert.equal(timeoutTurn(g), null);
    if (g.revealed.length > before) {
      assert.equal(g.revealed.length, before + 1);
      assert.notEqual(g.revealed.at(-1)?.index, 4);
      safeMoves++;
    }
  }
  assert.equal(g.endReason, 'sweetTie');
  assert.equal(g.loser, undefined);
  assert.equal(safeMoves, 8);

  const empty = playingGame(3, 4, 4, false, true);
  empty.revealed = Array.from({ length: 8 }, (_, index) => ({ index: index < 4 ? index : index + 1, eatenBy: 'A' }));
  assert.deepEqual(legalTiles(empty, empty.currentTurn), []);
  assert.equal(timeoutTurn(empty), null);
  assert.equal(empty.endReason, 'sweetTie');
  assert.equal(empty.loser, undefined);
});

test('sweet ties replay without advancing best-of rounds by default or count as a draw when selected', () => {
  for (const tieMode of ['replay', 'draw'] as const) {
    const g = createPoison('A', 'B', 'bestOf3', { gridSize: 3, timerEnabled: false, confirmMode: true, warmCold: false, tieMode }, 3, {}, 'A');
    for (const player of ['A', 'B']) {
      for (const tile of [1, 2, 3]) assert.equal(pickTile(g, player, tile), null);
      assert.equal(lockPick(g, player), null);
    }
    while (g.phase === 'playing') {
      const legal = legalTiles(g, g.currentTurn);
      assert.ok(legal.length > 0);
      assert.equal(tapTile(g, g.currentTurn, legal[0], g.turnNumber), null);
    }
    assert.equal(g.endReason, 'sweetTie');
    assert.deepEqual(g.matchScore, { A: 0, B: 0 });
    assert.equal(g.phase, tieMode === 'replay' ? 'roundOver' : 'matchOver');
  }
});

test('room session counts sweet ties without awarding a round win', () => {
  const passcode = `sweet-tie-${Date.now()}`;
  const room = enterRoom(passcode, 'A', 'device-A', 'socket-A').room!;
  enterRoom(passcode, 'B', 'device-B', 'socket-B');
  assert.equal(startGame(room, 'device-A', 'poison', 'quick', undefined, { gridSize: 3, timerEnabled: false, confirmMode: true, warmCold: false, tieMode: 'replay' }), null);
  for (const player of ['device-A', 'device-B']) { assert.equal(poisonPick(room, player, 4), null); assert.equal(poisonLock(room, player), null); }
  while (true) {
    const game = room.game;
    assert.ok(game && 'poisonA' in game);
    if (game.phase !== 'playing') break;
    const player = game.currentTurn;
    const legal = legalTiles(game, player);
    assert.ok(legal.length > 0);
    assert.equal(poisonTap(room, player, legal[0], game.turnNumber), null);
  }
  assert.equal(lobbyView(room, 'device-A').sameSweetMoments, 1);
  assert.deepEqual(lobbyView(room, 'device-A').scoreboard.poison, {});
  const ended = room.game;
  assert.ok(ended && 'poisonA' in ended);
  assert.equal(nextPoisonRound(room, 'device-A'), null);
  const replay = room.game;
  assert.ok(replay && 'poisonA' in replay);
  assert.equal(replay.round, ended.round);
  assert.notEqual(replay.starter, ended.starter);
  assert.equal(lobbyView(room, 'device-A').sameSweetMoments, 1);
});

// ─── 11. Property: random games terminate in a loss or sweet tie ───────────────

test('property: random full games always terminate with exactly one loser or a sweet tie', () => {
  for (let iter = 0; iter < 350; iter++) {
    const baseSize = ([3, 4, 5] as const)[Math.floor(Math.random() * 3)];
    const round = 1 + Math.floor(Math.random() * 5);
    const total = Math.min(9, baseSize + round - 1) ** 2;
    const chooseSet = () => {
      const set = new Set<number>();
      while (set.size < round) set.add(Math.floor(Math.random() * total));
      return [...set];
    };
    const aPoisons = chooseSet();
    const bPoisons = Math.random() < .2 ? [...aPoisons] : chooseSet();
    const g = createPoison('A', 'B', 'quick', { gridSize: baseSize, timerEnabled: false, confirmMode: true, warmCold: false, tieMode: 'replay' }, round, {}, 'A');
    for (const tile of aPoisons) assert.equal(pickTile(g, 'A', tile), null);
    assert.equal(lockPick(g, 'A'), null);
    for (const tile of bPoisons) assert.equal(pickTile(g, 'B', tile), null);
    assert.equal(lockPick(g, 'B'), null);
    let steps = 0;
    while (g.phase === 'playing') {
      assert.ok(++steps <= total * 2, `game hung (grid=${g.gridSize}, round=${round})`);
      if (checkForcedLoss(g)) { assert.equal(resolveForcedLoss(g), null); break; }
      const legal = legalTiles(g, g.currentTurn);
      if (legal.length === 0) { assert.equal(timeoutTurn(g), null); break; }
      const tile = legal[Math.floor(Math.random() * legal.length)];
      assert.equal(tapTile(g, g.currentTurn, tile, g.turnNumber), null);
    }
    assert.ok(g.phase === 'roundOver' || g.phase === 'matchOver');
    const tie = g.endReason === 'sweetTie';
    assert.notEqual(tie, g.loser !== undefined, 'outcome is exactly one loser or a tie');
    if (tie) {
      assert.equal(g.roundWinner, undefined);
      assert.equal(g.loser, undefined);
    } else {
      assert.ok(g.loser === 'A' || g.loser === 'B');
      assert.ok(g.roundWinner === 'A' || g.roundWinner === 'B');
      assert.notEqual(g.loser, g.roundWinner);
    }
  }
});

// ─── 12. Privacy: matching vs. nonmatching picks are identical in-round ────────

test('matching and nonmatching opponent picks produce identical views and errors until the tie ends', () => {
  const options = { gridSize: 3 as const, timerEnabled: false, confirmMode: true, warmCold: false, tieMode: 'replay' as const };
  const matching = createPoison('A', 'B', 'quick', options, 1, {}, 'B');
  const different = createPoison('A', 'B', 'quick', options, 1, {}, 'B');
  for (const g of [matching, different]) { pickTile(g, 'A', 0); lockPick(g, 'A'); }
  pickTile(matching, 'B', 0); pickTile(different, 'B', 8);
  assert.deepEqual(getViewFor(matching, 'A'), getViewFor(different, 'A'));
  assert.equal(lockPick(matching, 'B'), null); assert.equal(lockPick(different, 'B'), null);
  const view = (g: ReturnType<typeof createPoison>) => getViewFor(g, 'A');
  assert.deepEqual(view(matching), view(different));
  const staleA = tapTile(matching, 'A', 1, 100); const staleB = tapTile(different, 'A', 1, 100);
  assert.equal(staleA, staleB);
  assert.deepEqual(view(matching), view(different));
  for (const tile of [1, 2, 3, 4, 5, 6, 7]) {
    const player = matching.currentTurn;
    assert.equal(player, different.currentTurn);
    const errA = tapTile(matching, player, tile, matching.turnNumber);
    const errB = tapTile(different, player, tile, different.turnNumber);
    assert.equal(errA, errB);
    assert.equal(errA, null);
    assert.deepEqual(view(matching), view(different), `in-round view differs after safe tile ${tile}`);
    assert.equal('opponentPoison' in view(matching), false);
    assert.equal('opponentPoison' in view(different), false);
  }
  assert.equal(matching.phase, 'playing');
  assert.equal(different.phase, 'playing');
  assert.equal(matching.currentTurn, 'A');
  assert.equal(different.currentTurn, 'A');
  assert.equal(tapTile(matching, 'A', 8, matching.turnNumber), null);
  assert.equal(tapTile(different, 'A', 8, different.turnNumber), null);
  assert.equal(matching.endReason, 'sweetTie');
  assert.equal(different.endReason, 'tapped');
  assert.notDeepEqual(view(matching), view(different), 'the difference appears only after round end');
  assert.equal('opponentPoison' in view(matching), true);
});
