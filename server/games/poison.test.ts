import test from 'node:test';
import assert from 'node:assert/strict';
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
  const g = createPoison('A', 'B', 'quick', { gridSize, timerEnabled, confirmMode: true, warmCold });
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

// ─── 5. Same-tile re-pick ─────────────────────────────────────────────────────

test('same-tile re-pick clears both locks and picks, stays in setup, updates timestamp', () => {
  const g = createPoison('A', 'B', 'quick', { gridSize: 4, timerEnabled: false, confirmMode: true, warmCold: false });
  pickTile(g, 'A', 7);
  lockPick(g, 'A');
  pickTile(g, 'B', 7); // same tile as A!

  const beforeTs = g.sameTileRejectedAt;
  const err = lockPick(g, 'B');

  assert.equal(err, null);            // not returned as an error string
  assert.equal(g.phase, 'setup');     // still in setup
  assert.equal(g.lockedA, false);     // both locks cleared
  assert.equal(g.lockedB, false);
  assert.equal(g.pickedA, -1);        // both picks cleared
  assert.equal(g.pickedB, -1);
  assert.ok(g.sameTileRejectedAt > beforeTs, 'sameTileRejectedAt should be updated');
  assert.equal(g.poisonA, -1);        // poisons never set
  assert.equal(g.poisonB, -1);
});

test('same-tile check cannot be skipped by rapid double-locking', () => {
  const g = createPoison('A', 'B', 'quick', { gridSize: 4, timerEnabled: false, confirmMode: true, warmCold: false });
  pickTile(g, 'A', 5); lockPick(g, 'A');
  pickTile(g, 'B', 5); lockPick(g, 'B');
  assert.equal(g.phase, 'setup');   // rejected, back to setup
  // Pick different tiles now and confirm it works
  pickTile(g, 'A', 5); lockPick(g, 'A');
  pickTile(g, 'B', 6); lockPick(g, 'B');
  assert.equal(g.phase, 'playing');
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
  const gSetup = createPoison('A', 'B', 'quick', { gridSize: 4, timerEnabled: false, confirmMode: true, warmCold: false });
  pickTile(gSetup, 'A', 3);
  lockPick(gSetup, 'A');

  const bSetupView = getViewFor(gSetup, 'B');
  assert.ok(!('opponentPoison' in bSetupView), 'no opponentPoison in setup view');
  // B sees A has locked (boolean), but never which tile
  assert.equal(bSetupView.opponentLocked, true);
  assert.equal(bSetupView.myPick, -1); // B hasn't picked yet

  // Playing phase
  const g = playingGame(4, 0, 15);

  const viewA = getViewFor(g, 'A');
  assert.ok(!('opponentPoison' in viewA), 'no opponentPoison in A playing view');
  assert.equal(viewA.myPoison, 0);

  const viewB = getViewFor(g, 'B');
  assert.ok(!('opponentPoison' in viewB), 'no opponentPoison in B playing view');
  assert.equal(viewB.myPoison, 15);

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
  assert.equal(endViewA.opponentPoison, 15);
  assert.equal(endViewB.opponentPoison, 0);

  // Error paths must not leak hidden info
  const setupG = createPoison('A', 'B', 'quick', { gridSize: 4, timerEnabled: false, confirmMode: true, warmCold: false });
  const errMsg = lockPick(setupG, 'A'); // should fail: no pick yet
  assert.ok(errMsg !== null && !errMsg.toLowerCase().includes('poison'));
});

// ─── 10. Property: every game terminates with exactly one loser ───────────────

test('property: every game terminates with exactly one loser (3×3, 4×4, 5×5)', () => {
  const configs: { gs: 3 | 4 | 5; iters: number }[] = [
    { gs: 3, iters: 200 },
    { gs: 4, iters: 150 },
    { gs: 5, iters: 100 },
  ];

  for (const { gs, iters } of configs) {
    for (let iter = 0; iter < iters; iter++) {
      const total = gs * gs;
      const pA = Math.floor(Math.random() * total);
      let pB: number;
      do { pB = Math.floor(Math.random() * total); } while (pB === pA);

      const g = playingGame(gs, pA, pB);
      let steps = 0;
      const maxSteps = total * 3;

      while (g.phase === 'playing') {
        if (++steps > maxSteps) assert.fail(`game did not terminate after ${maxSteps} steps (gs=${gs})`);
        if (checkForcedLoss(g)) { resolveForcedLoss(g); break; }
        const legal = legalTiles(g, g.currentTurn);
        assert.ok(legal.length > 0, 'game is playing but has no legal tiles — deadlock');
        const tile = legal[Math.floor(Math.random() * legal.length)];
        const err = tapTile(g, g.currentTurn, tile, g.turnNumber);
        assert.equal(err, null, `unexpected tap error: ${err}`);
      }

      assert.ok(g.phase === 'roundOver' || g.phase === 'matchOver',
        `game ended in unexpected phase: ${g.phase}`);
      assert.ok(g.loser === 'A' || g.loser === 'B', 'exactly one loser');
      assert.ok(g.roundWinner === 'A' || g.roundWinner === 'B', 'exactly one winner');
      assert.notEqual(g.loser, g.roundWinner, 'loser and winner must differ');
    }
  }
});

// ─── 11. Views identical for games differing only in opponent's poison ─────────

test('getViewFor stays identical while only the opponent poison differs, then reveals both poisons at roundOver', () => {
  // G1: A's poison=0, B's poison=3
  const g1 = createPoison('A', 'B', 'quick', { gridSize: 4, timerEnabled: false, confirmMode: true, warmCold: false });
  pickTile(g1, 'A', 0); lockPick(g1, 'A');
  pickTile(g1, 'B', 3); lockPick(g1, 'B');
  g1.currentTurn = 'A'; g1.turnNumber = 1;

  // G2: A's poison=0, B's poison=7  (different opponent poison)
  const g2 = createPoison('A', 'B', 'quick', { gridSize: 4, timerEnabled: false, confirmMode: true, warmCold: false });
  pickTile(g2, 'A', 0); lockPick(g2, 'A');
  pickTile(g2, 'B', 7); lockPick(g2, 'B');
  g2.currentTurn = 'A'; g2.turnNumber = 1;

  const view = (g: ReturnType<typeof createPoison>) => JSON.stringify(getViewFor(g, 'A'));

  // Initial playing state
  assert.equal(view(g1), view(g2), 'A views must be identical at game start');
  assert.ok(!('opponentPoison' in getViewFor(g1, 'A')));
  assert.ok(!('opponentPoison' in getViewFor(g2, 'A')));

  // Consume every tile that is safe in both games in the same order. The only
  // remaining legal move for A is its opponent's poison in each game.
  const commonSafe = [1, 2, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15];
  for (const tile of commonSafe) {
    const player = g1.currentTurn;
    assert.equal(player, g2.currentTurn);
    assert.equal(view(g1), view(g2), `views must match before tile ${tile}`);
    assert.equal(tapTile(g1, player, tile, g1.turnNumber), null);
    assert.equal(tapTile(g2, player, tile, g2.turnNumber), null);
    assert.equal(view(g1), view(g2), `views must match after safe tile ${tile}`);
    assert.equal('opponentPoison' in getViewFor(g1, 'A'), false);
    assert.equal('opponentPoison' in getViewFor(g2, 'A'), false);
  }
  assert.equal(g1.currentTurn, 'B');
  assert.equal(g2.currentTurn, 'B');
  assert.equal(view(g1), view(g2), 'views are identical until the terminal move');
  assert.equal(tapTile(g1, 'B', 0, g1.turnNumber), null);
  assert.equal(tapTile(g2, 'B', 0, g2.turnNumber), null);
  assert.equal(g1.phase, 'matchOver');
  assert.equal(g2.phase, 'matchOver');
  assert.notEqual(view(g1), view(g2), 'roundOver views reveal the different opponent poison tiles');
  assert.equal(getViewFor(g1, 'A').opponentPoison, 3);
  assert.equal(getViewFor(g2, 'A').opponentPoison, 7);
});
