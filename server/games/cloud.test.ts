import test from 'node:test';
import assert from 'node:assert/strict';
import type { CloudSettings } from '@arcade/shared';
import { CLOUD_HEIGHT, CLOUD_WIDTH, cloudPaddedRadius, layoutCloud } from '@arcade/shared';
import { clearLockout, completeSwap, createCloudGame, getViewFor, handleMove, pauseTimers, resumeTimers, timeoutCall, timeoutHunt } from './cloud.js';

const baseSettings: CloudSettings = { targetBoxes: 100, catchBonus: 1, layoutMode: 'hunt', huntTimeoutSeconds: 45 };
const makeGame = (settings: CloudSettings = baseSettings) => createCloudGame('A', 'B', 'A', 'quick', settings, 1, {}, 1, 0);
const call = (g: ReturnType<typeof makeGame>, n = 64, now = 10) => handleMove(g, 'A', { type: 'cloud:callNumber', n, huntId: g.huntId }, now);

function checkLayout(seed: number | string) {
  const layout = layoutCloud(seed);
  assert.equal(layout.length, 100);
  assert.deepEqual([...layout].map(item => item.n).sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1));
  for (let i = 0; i < layout.length; i++) {
    const item = layout[i];
    const radius = cloudPaddedRadius(item.size);
    assert.ok(item.x >= radius && item.x <= CLOUD_WIDTH - radius, `x bound for ${item.n}`);
    assert.ok(item.y >= radius && item.y <= CLOUD_HEIGHT - radius, `y bound for ${item.n}`);
    assert.ok(item.rotation >= -14 && item.rotation <= 14);
    assert.ok(item.colorIndex >= 0 && item.colorIndex < 7);
    for (let j = i + 1; j < layout.length; j++) {
      const other = layout[j];
      const gap = cloudPaddedRadius(item.size) + cloudPaddedRadius(other.size);
      assert.ok((item.x - other.x) ** 2 + (item.y - other.y) ** 2 >= gap ** 2, `circles overlap: ${item.n}, ${other.n}`);
    }
  }
  return layout;
}

test('layoutCloud is complete, bounded, non-overlapping, and deterministic', () => {
  const first = checkLayout('same-seed');
  assert.deepEqual(layoutCloud('same-seed'), first);
  assert.notDeepEqual(layoutCloud('different-seed'), first);
});

test('layoutCloud places every number for 1000 seeds', () => {
  for (let seed = 0; seed < 1000; seed++) checkLayout(seed);
});

test('call window timeout starts a hunt with a valid random target', () => {
  for (let run = 0; run < 30; run++) {
    const g = makeGame();
    assert.equal(timeoutCall(g, 5_000), true);
    assert.equal(g.phase, 'hunting');
    assert.ok(Number.isInteger(g.targetNumber) && g.targetNumber! >= 1 && g.targetNumber! <= 100);
    assert.equal(g.huntDeadline, 50_000);
  }
});

test('only the caller can call or tick, and tick rate is capped at ten per second', () => {
  const g = makeGame();
  assert.deepEqual(handleMove(g, 'B', { type: 'cloud:callNumber', n: 8, huntId: g.huntId }, 10), { changed: false });
  assert.deepEqual(call(g), { changed: true });
  assert.deepEqual(handleMove(g, 'B', { type: 'cloud:tick', huntId: g.huntId }, 20), { changed: false, accepted: false });
  assert.deepEqual(handleMove(g, 'A', { type: 'cloud:tick', huntId: g.huntId }, 20), { changed: true, accepted: true });
  assert.deepEqual(handleMove(g, 'A', { type: 'cloud:tick', huntId: g.huntId }, 119), { changed: false, accepted: false });
  assert.deepEqual(handleMove(g, 'A', { type: 'cloud:tick', huntId: g.huntId }, 120), { changed: true, accepted: true });
  assert.equal(g.tickCounts.A, 2);
  assert.equal(handleMove(g, 'A', { type: 'cloud:tick', huntId: g.huntId - 1 }, 300).accepted ?? false, false);
});

test('correct find gives the catch bonus, swaps roles, and scatters a fresh hunt', () => {
  const g = makeGame();
  call(g);
  const oldLayout = g.layout;
  assert.deepEqual(handleMove(g, 'B', { type: 'cloud:findNumber', n: 64, huntId: g.huntId }, 20), { changed: true });
  assert.equal(g.phase, 'swapping');
  assert.equal(g.tickCounts.B, 1);
  assert.equal(g.nextCaller, 'B');
  assert.equal(g.nextHunter, 'A');
  assert.equal(completeSwap(g, 1_220), true);
  assert.equal(g.phase, 'calling');
  assert.equal(g.caller, 'B');
  assert.equal(g.hunter, 'A');
  assert.equal(g.huntId, 2);
  assert.notDeepEqual(g.layout, oldLayout);
});

test('stale finds are ignored; wrong finds lock the hunter for one second', () => {
  const g = makeGame();
  call(g);
  const huntId = g.huntId;
  assert.deepEqual(handleMove(g, 'B', { type: 'cloud:findNumber', n: 3, huntId: huntId - 1 }, 20), { changed: false });
  assert.deepEqual(handleMove(g, 'A', { type: 'cloud:findNumber', n: 3, huntId }, 20), { changed: false });
  assert.deepEqual(handleMove(g, 'B', { type: 'cloud:findNumber', n: 3, huntId }, 20), { changed: true });
  assert.equal(g.wrongTapId, 1);
  assert.equal(g.lockoutUntil, 1_020);
  assert.deepEqual(handleMove(g, 'B', { type: 'cloud:findNumber', n: 64, huntId }, 500), { changed: false });
  assert.equal(clearLockout(g, 1_020), true);
  assert.deepEqual(handleMove(g, 'B', { type: 'cloud:findNumber', n: 64, huntId }, 1_020), { changed: true });
  assert.equal(g.phase, 'swapping');
});

test('hunt timeout swaps roles without a catch bonus', () => {
  const g = makeGame();
  call(g);
  g.huntDeadline = 1_000;
  assert.equal(timeoutHunt(g, 1_000), true);
  assert.equal(g.phase, 'swapping');
  assert.equal(g.swapReason, 'timeout');
  assert.equal(g.tickCounts.B, 0);
  assert.equal(g.targetNumber, 64);
  completeSwap(g, 2_200);
  assert.equal(g.caller, 'B');
  assert.equal(g.hunter, 'A');
});

test('actions arriving after the hunt deadline cannot beat the timeout', () => {
  const g = makeGame({ ...baseSettings, huntTimeoutSeconds: 15 });
  call(g);
  const target = g.targetNumber!;
  assert.deepEqual(handleMove(g, 'B', { type: 'cloud:findNumber', n: target, huntId: g.huntId }, 15_010), { changed: true });
  assert.equal(g.phase, 'swapping');
  assert.equal(g.swapReason, 'timeout');
  assert.equal(g.tickCounts.B, 0);
});

test('win is checked after a caller tick and after a catch bonus', () => {
  const tickGame = makeGame({ ...baseSettings, targetBoxes: 30 });
  call(tickGame);
  tickGame.tickCounts.A = 29;
  assert.deepEqual(handleMove(tickGame, 'A', { type: 'cloud:tick', huntId: tickGame.huntId }, 1_000), { changed: true, accepted: true });
  assert.equal(tickGame.phase, 'matchOver');
  assert.equal(tickGame.matchWinner, 'A');

  const catchGame = makeGame({ ...baseSettings, targetBoxes: 30, catchBonus: 3 });
  call(catchGame);
  catchGame.tickCounts.B = 27;
  assert.deepEqual(handleMove(catchGame, 'B', { type: 'cloud:findNumber', n: 64, huntId: catchGame.huntId }, 1_000), { changed: true });
  assert.equal(catchGame.tickCounts.B, 30);
  assert.equal(catchGame.phase, 'matchOver');
  assert.equal(catchGame.matchWinner, 'B');
});

test('layout mode keeps the cloud for a round or re-scatters on each hunt', () => {
  for (const layoutMode of ['hunt', 'round'] as const) {
    const g = makeGame({ ...baseSettings, layoutMode });
    call(g);
    const first = g.layout;
    handleMove(g, 'B', { type: 'cloud:findNumber', n: 64, huntId: g.huntId }, 20);
    completeSwap(g, 1_220);
    assert.equal(layoutMode === 'round' ? JSON.stringify(g.layout) === JSON.stringify(first) : JSON.stringify(g.layout) !== JSON.stringify(first), true);
  }
});

test('disconnect pauses active deadlines and reconnect resumes the exact remaining time', () => {
  const g = makeGame();
  pauseTimers(g, 2_000);
  g.paused = true;
  assert.equal(g.callRemaining, 3_000);
  const pausedView = getViewFor(g, 'A');
  assert.equal(pausedView.remainingMs, 3_000);
  g.paused = false;
  resumeTimers(g, 100_000);
  assert.equal(g.callDeadline, 103_000);
});
